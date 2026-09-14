import "fake-indexeddb/auto";
import Dexie from "dexie";
import { test } from "node:test";
import assert from "node:assert/strict";
test("existing dirty IndexedDB v1 vault upgrades without inventing a server baseline", async () => {
  const old = new Dexie("self-steward-v1");
  old.version(1).stores({ vault: "id", backups: "id, createdAt" });
  const data = {
    schemaVersion: 1,
    tasks: [],
    entries: [],
    members: [],
    habits: [],
    notes: [
      {
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        title: "原有记录",
        body: "不能丢",
      },
    ],
    focuses: [],
    timer: null,
  };
  await old
    .table("vault")
    .put({
      id: "main",
      data,
      localVersion: 9,
      serverRevision: 2,
      dirty: true,
      savedAt: "",
      syncedAt: "",
      endpoint: "https://example.test/api/sync",
    });
  old.close();
  const { db, initialize } = await import("../src/db");
  try {
    await initialize();
    const v = (await db.vault.get("main"))!;
    assert.equal(v.data.schemaVersion, 2);
    assert.equal(v.data.notes[0].body, "不能丢");
    assert.deepEqual(v.data.countdowns, []);
    assert.equal(v.localVersion, 9);
    assert.equal(v.serverBase, null);
  } finally {
    db.close();
  }
});
