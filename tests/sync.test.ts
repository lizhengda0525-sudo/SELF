import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt, generateKey } from "../src/sync";
import { emptyData, metadata } from "../src/domain";
// @ts-expect-error Node server is intentionally plain JavaScript.
import { createServer } from "../server/index.mjs";

test("encrypted vault roundtrip, wrong key and tampering", async () => {
  const d = emptyData();
  d.notes = [
    { ...metadata(), title: "私密笔记", body: "do not send plaintext" },
  ];
  const key = generateKey(),
    payload = await encrypt(d, key);
  assert.equal(JSON.stringify(payload).includes("私密"), false);
  assert.deepEqual(await decrypt(payload, key), d);
  await assert.rejects(decrypt(payload, generateKey()));
  await assert.rejects(
    decrypt(
      {
        ...payload,
        ciphertext:
          (payload.ciphertext.startsWith("00") ? "01" : "00") +
          payload.ciphertext.slice(2),
      },
      key,
    ),
  );
});
test("sync server authenticates and CAS allows only one concurrent writer; stale writes retain winning data", async () => {
  const token = "test-access-token-with-at-least-32-characters";
  const server = createServer({ token, dbPath: ":memory:" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/api/sync`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const key = generateKey();
    const payload = await encrypt(emptyData(), key);
    const writes = await Promise.all(
      [1, 2].map(() =>
        fetch(url, {
          method: "PUT",
          headers,
          body: JSON.stringify({ baseRevision: 0, payload }),
        }),
      ),
    );
    assert.deepEqual(writes.map((x) => x.status).sort(), [200, 409]);
    const current = await (await fetch(url, { headers })).json();
    assert.equal(current.revision, 1);
    assert.deepEqual(current.payload, payload);
    assert.equal(
      (await fetch(url, { method: "PUT", headers, body: "{}" })).status,
      400,
    );
  } finally {
    await new Promise<void>((r) => server.close(r));
  }
});
test("owner provisions separately revocable devices without exposing stored tokens", async () => {
  const token = "owner-test-only-token-at-least-32-characters";
  const server = createServer({ token, dbPath: ":memory:" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  try {
    const created = await fetch(`${base}/api/devices`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "手机" }),
    });
    assert.equal(created.status, 201);
    const device = await created.json();
    assert.equal(device.token.length, 64);
    const dh = { Authorization: `Bearer ${device.token}` };
    assert.equal(
      (await fetch(`${base}/api/sync`, { headers: dh })).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${base}/api/devices`, {
          method: "POST",
          headers: { ...dh, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "越权" }),
        })
      ).status,
      403,
    );
    const account = await (
      await fetch(`${base}/api/account`, { headers })
    ).json();
    assert.equal(account.devices[0].name, "手机");
    assert.ok(account.devices[0].lastSeen);
    assert.equal(JSON.stringify(account).includes(device.token), false);
    assert.equal(JSON.stringify(account).includes("tokenHash"), false);
    assert.equal(
      (
        await fetch(`${base}/api/devices/${device.id}`, {
          method: "DELETE",
          headers,
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/api/sync`, { headers: dh })).status,
      401,
    );
    assert.equal((await fetch(`${base}/api/sync`, { headers })).status, 200);
    const cors = await fetch(`${base}/api/sync`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://localhost",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(cors.status, 204);
    assert.equal(
      cors.headers.get("Access-Control-Allow-Origin"),
      "https://localhost",
    );
    const evil = await fetch(`${base}/api/sync`, {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example" },
    });
    assert.equal(evil.headers.get("Access-Control-Allow-Origin"), null);
  } finally {
    await new Promise<void>((r) => server.close(r));
  }
});
