import "fake-indexeddb/auto";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, initialize, change, replaceData } from "../src/db";
import { emptyData, metadata } from "../src/domain";

after(() => db.close());
test("concurrent local writes serialize; rejected mutation does not partially persist", async () => {
  await initialize();
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      change((d) =>
        d.notes.push({ ...metadata(), title: `note ${i}`, body: "" }),
      ),
    ),
  );
  const before = (await db.vault.get("main"))!;
  assert.equal(before.data.notes.length, 10);
  assert.equal(before.localVersion, 10);
  await assert.rejects(
    change((d) => {
      d.notes.push({ ...metadata(), title: "", body: "" });
    }),
  );
  const after = (await db.vault.get("main"))!;
  assert.equal(after.localVersion, 10);
  assert.equal(after.data.notes.length, 10);
  await replaceData(emptyData(), "test restore");
  assert.equal((await db.vault.get("main"))!.data.notes.length, 0);
  assert.equal((await db.backups.toArray())[0].data.notes.length, 10);
});
test("sync baseline is detached from editable data and subsequent local additions survive sync", async () => {
  const { synchronize, generateKey, decrypt } = await import("../src/sync");
  // @ts-expect-error Plain JavaScript server.
  const { createServer } = await import("../server/index.mjs");
  const token = "test-baseline-token-with-at-least-32-characters";
  const server = createServer({ token, dbPath: ":memory:" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  Object.defineProperty(globalThis, "location", {
    value: { origin: "http://localhost" },
    configurable: true,
  });
  const config = {
    endpoint: `http://127.0.0.1:${server.address().port}/api/sync`,
    token,
    key: generateKey(),
  };
  try {
    await synchronize(config);
    await change((d) =>
      d.notes.push({ ...metadata(), title: "第二次同步前新增", body: "" }),
    );
    const v = (await db.vault.get("main"))!;
    assert.equal(v.serverBase?.notes.length, 0);
    assert.equal(v.data.notes.length, 1);
    assert.equal(await synchronize(config), null);
    assert.equal((await db.vault.get("main"))!.data.notes.length, 1);
    const remote = await (
      await fetch(config.endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    assert.equal(
      (await decrypt(remote.payload, config.key)).notes[0].title,
      "第二次同步前新增",
    );
  } finally {
    await new Promise<void>((r) => server.close(r));
  }
});
