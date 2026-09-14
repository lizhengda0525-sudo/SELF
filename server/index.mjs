import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  timingSafeEqual,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdirSync, existsSync, createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createServer({
  token,
  dbPath = "data/sync.sqlite",
  dist = "dist",
  allowedOrigins = [],
} = {}) {
  if (!token || token.length < 32)
    throw new Error(
      "Set SELF_SYNC_TOKEN to a random token of at least 32 characters.",
    );
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS vault (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT); INSERT OR IGNORE INTO vault VALUES(1,0,NULL)",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, tokenHash TEXT UNIQUE NOT NULL, createdAt TEXT NOT NULL, lastSeen TEXT, revokedAt TEXT)",
  );
  if (!db.prepare("SELECT id FROM account LIMIT 1").get())
    db.prepare("INSERT INTO account VALUES(?,?)").run(
      randomUUID(),
      "我的个人账库",
    );
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const authenticate = (req) => {
    const supplied = Buffer.from(req.headers.authorization || ""),
      expected = Buffer.from(`Bearer ${token}`);
    if (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    )
      return { admin: true, id: "owner" };
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!match) return null;
    const device = db
      .prepare("SELECT id FROM devices WHERE tokenHash=? AND revokedAt IS NULL")
      .get(hash(match[1]));
    if (!device) return null;
    db.prepare("UPDATE devices SET lastSeen=? WHERE id=?").run(
      new Date().toISOString(),
      device.id,
    );
    return { admin: false, id: device.id };
  };
  async function body(req, max = 20 * 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > max) throw new Error("Request too large");
      chunks.push(c);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  const get = () => {
    const r = db.prepare("SELECT revision,payload FROM vault WHERE id=1").get();
    return {
      revision: r.revision,
      payload: r.payload ? JSON.parse(r.payload) : null,
    };
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const send = (code, value) => {
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    const pathname = new URL(req.url, "http://localhost").pathname;
    const origin = req.headers.origin;
    const nativeOrigins = [
      "https://localhost",
      "http://localhost",
      "tauri://localhost",
      "https://tauri.localhost",
      "http://tauri.localhost",
      "capacitor://localhost",
      ...allowedOrigins,
    ];
    if (origin && nativeOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, PUT, POST, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
    }
    if (pathname.startsWith("/api/")) {
      const auth = authenticate(req);
      if (!auth) return send(401, { error: "Unauthorized or device revoked" });
      if (pathname === "/api/account" && req.method === "GET")
        return send(200, {
          ...db.prepare("SELECT * FROM account LIMIT 1").get(),
          admin: auth.admin,
          deviceId: auth.id,
          devices: db
            .prepare(
              "SELECT id,name,createdAt,lastSeen,revokedAt FROM devices ORDER BY createdAt DESC",
            )
            .all(),
        });
      if (pathname === "/api/devices" && req.method === "POST") {
        if (!auth.admin) return send(403, { error: "Owner token required" });
        try {
          const { name } = await body(req, 4096);
          if (typeof name !== "string" || !name.trim() || name.length > 100)
            return send(400, { error: "Invalid device name" });
          if (
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM devices WHERE revokedAt IS NULL",
              )
              .get().n >= 50
          )
            return send(409, { error: "Maximum 50 active devices" });
          const id = randomUUID(),
            deviceToken = randomBytes(32).toString("hex"),
            createdAt = new Date().toISOString();
          db.prepare(
            "INSERT INTO devices(id,name,tokenHash,createdAt) VALUES(?,?,?,?)",
          ).run(id, name.trim(), hash(deviceToken), createdAt);
          return send(201, {
            id,
            name: name.trim(),
            token: deviceToken,
            createdAt,
          });
        } catch {
          return send(400, { error: "Invalid request" });
        }
      }
      if (pathname.startsWith("/api/devices/") && req.method === "DELETE") {
        if (!auth.admin) return send(403, { error: "Owner token required" });
        const id = pathname.slice("/api/devices/".length);
        const result = db
          .prepare(
            "UPDATE devices SET revokedAt=? WHERE id=? AND revokedAt IS NULL",
          )
          .run(new Date().toISOString(), id);
        return send(result.changes ? 200 : 404, { revoked: !!result.changes });
      }
    }
    if (pathname === "/api/sync") {
      if (req.method === "GET") return send(200, get());
      if (req.method !== "PUT")
        return send(405, { error: "Method not allowed" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(415, { error: "JSON required" });
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) {
            send(413, { error: "Snapshot exceeds 20 MB" });
            return;
          }
          chunks.push(chunk);
        }
        const { baseRevision, payload } = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        );
        if (
          !Number.isSafeInteger(baseRevision) ||
          baseRevision < 0 ||
          !payload ||
          !/^[0-9a-f]{24}$/i.test(payload.iv) ||
          typeof payload.ciphertext !== "string" ||
          !/^(?:[0-9a-f]{2}){16,}$/i.test(payload.ciphertext)
        )
          return send(400, { error: "Invalid envelope" });
        const result = db
          .prepare(
            "UPDATE vault SET revision=revision+1,payload=? WHERE id=1 AND revision=?",
          )
          .run(
            JSON.stringify({ iv: payload.iv, ciphertext: payload.ciphertext }),
            baseRevision,
          );
        return send(result.changes === 1 ? 200 : 409, get());
      } catch {
        return send(400, { error: "Invalid request" });
      }
    }
    if (pathname.startsWith("/api/")) return send(404, { error: "Not found" });
    if (!["GET", "HEAD"].includes(req.method))
      return send(405, { error: "Method not allowed" });
    const root = path.resolve(dist);
    let file;
    try {
      file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    } catch {
      return send(400, { error: "Invalid URL" });
    }
    if (!file.startsWith(root + path.sep) && file !== root)
      return send(403, { error: "Forbidden" });
    if (!existsSync(file) || !statSync(file).isFile())
      file = path.join(root, "index.html");
    if (!existsSync(file))
      return send(404, { error: "Build the client first: pnpm build" });
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webmanifest": "application/manifest+json",
    };
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Security-Policy":
        "default-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.on("close", () => db.close());
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 4174);
  const server = createServer({
    token: process.env.SELF_SYNC_TOKEN,
    dbPath: process.env.SELF_DB_PATH || "data/sync.sqlite",
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`SELF listening at http://127.0.0.1:${port}`),
  );
}
