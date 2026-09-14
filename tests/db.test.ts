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
