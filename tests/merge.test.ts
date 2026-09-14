import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData, metadata, validateData, type Entry } from "../src/domain";
import { mergeData } from "../src/merge";
test("three-way merge keeps independent additions and one-sided edits", () => {
  const base = emptyData();
  base.notes.push({ ...metadata(), title: "原始", body: "" });
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.notes[0].body = "本机改正文";
  remote.notes.push({ ...metadata(), title: "远端新增", body: "" });
  const merged = mergeData(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.data.notes.length, 2);
  assert.equal(merged.data.notes[0].body, "本机改正文");
});
test("concurrent edit versus deletion requires record choice and leaves unrelated record untouched", () => {
  const base = emptyData();
  base.notes.push({ ...metadata(), title: "共同记录", body: "" });
  const l = structuredClone(base),
    r = structuredClone(base);
  l.notes[0].body = "本机文字";
  r.notes[0].deletedAt = new Date().toISOString();
  r.notes.push({ ...metadata(), title: "保留新增", body: "" });
  const c = mergeData(base, l, r);
  assert.equal(c.conflicts.length, 1);
  const result = mergeData(base, l, r, { [c.conflicts[0].key]: "remote" });
  assert.equal(result.unresolved.length, 0);
  assert.ok(result.data.notes[0].deletedAt);
  assert.equal(result.data.notes[1].title, "保留新增");
});
test("independent refunds exceeding original amount require relationship resolution", () => {
  const base = emptyData();
  const expense: Entry = {
    ...metadata(),
    kind: "expense",
    amount: 10000,
    currency: "CNY",
    date: "2026-09-01",
    category: "购物",
    account: "现金",
    toAccount: "",
    merchant: "",
    note: "",
    refundOf: "",
    status: "posted",
  };
  base.entries.push(expense);
  const l = structuredClone(base),
    r = structuredClone(base);
  l.entries.push({
    ...expense,
    ...metadata(),
    kind: "refund",
    amount: 6000,
    refundOf: expense.id,
  });
  r.entries.push({
    ...expense,
    ...metadata(),
    kind: "refund",
    amount: 7000,
    refundOf: expense.id,
  });
  validateData(l);
  validateData(r);
  const c = mergeData(base, l, r);
  assert.ok(c.validationError);
  assert.equal(c.conflicts.length, 2);
  const choices = Object.fromEntries(
    c.conflicts.map((x) => [x.key, "local" as const]),
  );
  const result = mergeData(base, l, r, choices);
  assert.equal(result.validationError, "");
  assert.equal(result.data.entries.length, 2);
});
