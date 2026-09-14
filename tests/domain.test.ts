import { test } from "node:test";
import assert from "node:assert/strict";
import {
  active,
  addDays,
  addMonths,
  currentPeriod,
  daysBetween,
  emptyData,
  focusElapsed,
  habitStreak,
  memberCosts,
  metadata,
  parseMoney,
  renewMember,
  summarize,
  today,
  trash,
  validateData,
  type Entry,
  type Habit,
  type Member,
} from "../src/domain";

function entry(values: Partial<Entry> = {}): Entry {
  return {
    ...metadata(),
    kind: "expense",
    amount: 10000,
    currency: "CNY",
    date: "2026-09-01",
    category: "购物",
    account: "银行卡",
    toAccount: "",
    merchant: "商店",
    note: "",
    refundOf: "",
    status: "posted",
    ...values,
  };
}
function member(): Member {
  return {
    ...metadata(),
    name: "云盘",
    months: 1,
    anchor: 31,
    status: "active",
    autoRenew: false,
    snoozeUntil: "",
    note: "",
    periods: [
      {
        id: crypto.randomUUID(),
        start: "2024-01-31",
        end: "2024-02-29",
        amount: 2900,
        entryId: "",
      },
    ],
  };
}
test("money parses decimal strings without floating-point loss and rejects ambiguous amounts", () => {
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("1.01"), 101);
  assert.equal(parseMoney(" 12.3 "), 1230);
  for (const value of [
    "0",
    "-1",
    "1.001",
    "1e3",
    "NaN",
    "Infinity",
    "100000001",
    "1,000",
    "",
  ])
    assert.throws(() => parseMoney(value));
});
test("month ends, leap years, and day anchors remain stable", () => {
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2024-02-29", 1, 31), "2024-03-31");
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(daysBetween("2024-02-29", "2024-03-31"), 31);
});
test("transfers and pending/ignored/deleted entries never inflate spending", () => {
  const d = emptyData();
  d.entries = [
    entry(),
    entry({ kind: "income", amount: 50000 }),
    entry({ kind: "transfer", amount: 5000, toAccount: "微信" }),
    entry({ amount: 99900, status: "pending" }),
    entry({ status: "ignored" }),
    entry({ deletedAt: new Date().toISOString() }),
  ];
  assert.deepEqual(
    { ...summarize(d, "2026-09"), categories: undefined },
    {
      expense: 10000,
      income: 50000,
      net: 40000,
      count: 2,
      categories: undefined,
    },
  );
});
test("refunds subtract from original category in refund month and keep original gross amount", () => {
  const d = emptyData(),
    e = entry();
  d.entries = [
    e,
    entry({
      kind: "refund",
      amount: 4000,
      date: "2026-10-01",
      refundOf: e.id,
      category: "其他",
    }),
  ];
  validateData(d);
  assert.equal(summarize(d, "2026-09").expense, 10000);
  assert.equal(summarize(d, "2026-10").expense, -4000);
  assert.equal(summarize(d, "2026-10").categories["购物"], -4000);
  assert.equal(e.amount, 10000);
});
test("refunds require a posted existing expense and cumulative refunds cannot exceed it", () => {
  const d = emptyData(),
    e = entry();
  d.entries = [
    e,
    entry({ kind: "refund", amount: 6000, refundOf: e.id }),
    entry({ kind: "refund", amount: 5000, refundOf: e.id }),
  ];
  assert.throws(() => validateData(d), /累计退款/);
  d.entries.pop();
  d.entries[0].status = "pending";
  assert.throws(() => validateData(d), /退款必须关联/);
  d.entries[0].status = "posted";
  d.entries[1].date = "2026-08-31";
  assert.throws(() => validateData(d), /不能早于/);
});
test("expense deletion cannot leave an active refund orphaned", () => {
  const d = emptyData(),
    e = entry(),
    r = entry({ kind: "refund", amount: 3000, refundOf: e.id });
  d.entries = [e, r];
  assert.throws(() => trash(d, "entries", e.id), /先删除关联退款/);
  trash(d, "entries", r.id);
  trash(d, "entries", e.id);
  assert.equal(active(d.entries).length, 0);
  validateData(d);
});
test("transfers must have two distinct accounts", () => {
  const d = emptyData();
  d.entries = [entry({ kind: "transfer", toAccount: "银行卡" })];
  assert.throws(() => validateData(d), /不同/);
  d.entries[0].toAccount = "现金";
  assert.doesNotThrow(() => validateData(d));
});
test("membership renewal keeps history and creates only an explicitly requested expense", () => {
  const d = emptyData(),
    m = member();
  d.members = [m];
  renewMember(d, m.id, 3100, "2024-02-29", true);
  assert.equal(m.periods.length, 2);
  assert.equal(currentPeriod(m).end, "2024-03-31");
  assert.equal(d.entries.length, 1);
  assert.equal(currentPeriod(m).entryId, d.entries[0].id);
  assert.equal(m.periods[0].amount, 2900);
  renewMember(d, m.id, 3000, "2024-03-31", false);
  assert.equal(currentPeriod(m).end, "2024-04-30");
  assert.equal(d.entries.length, 1);
  assert.throws(() => renewMember(d, m.id, 100, "2024-04-01", false), /重叠/);
});
test("daily subscription cost uses actual period length and is unavailable before start", () => {
  const m = member();
  assert.equal(memberCosts(m, "2024-02-10").daily, 100);
  assert.equal(memberCosts(m, "2024-01-30").daily, null);
  assert.equal(memberCosts(m, "2024-02-29").remaining, 0);
});
test("habit streak distinguishes unrecorded, skipped, missed, and completed", () => {
  const day = today();
  const h: Habit = {
    ...metadata(),
    name: "阅读",
    description: "",
    start: addDays(day, -7),
    logs: {
      [addDays(day, -1)]: "done",
      [addDays(day, -2)]: "skipped",
      [addDays(day, -3)]: "done",
    },
  };
  assert.equal(habitStreak(h, day), 2);
  h.logs[day] = "missed";
  assert.equal(habitStreak(h, day), 0);
  h.logs[day] = "done";
  assert.equal(habitStreak(h, day), 3);
  delete h.logs[addDays(day, -2)];
  assert.equal(habitStreak(h, day), 2);
});
test("backup validation rejects invalid dates, duplicate ids and future habit logs", () => {
  const d = emptyData();
  d.entries = [entry({ date: "2026-02-30" })];
  assert.throws(() => validateData(d));
  d.entries = [entry()];
  d.entries.push({ ...d.entries[0] });
  assert.throws(() => validateData(d), /重复/);
  d.entries = [];
  d.habits = [
    {
      ...metadata(),
      name: "阅读",
      description: "",
      start: today(),
      logs: { [addDays(today(), 1)]: "done" },
    },
  ];
  assert.throws(() => validateData(d), /打卡日期/);
});
test("focus elapsed excludes pauses and recovers elapsed time after suspension", () => {
  const t = {
    taskId: "",
    title: "专注",
    target: 1500,
    accumulated: 120,
    startedAt: 1000,
  };
  assert.equal(focusElapsed(t, 61000), 180);
  assert.equal(focusElapsed({ ...t, startedAt: null }, 61000), 120);
  assert.equal(focusElapsed(t, 0), 120);
});
