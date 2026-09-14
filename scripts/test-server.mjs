import { createServer } from "../server/index.mjs";
createServer({
  token: "self-e2e-only-token-with-at-least-32-characters",
  dbPath: ":memory:",
}).listen(4182, "127.0.0.1");
