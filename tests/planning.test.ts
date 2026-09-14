import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData, metadata, validateData, type Task } from "../src/domain";
import {
  completeTask,
  editTask,
  nextOccurrence,
  closeCountdown,
  taskOverlap,
} from "../src/planning";
import { remindersFor } from "../src/notifications";
const task = (extra: Partial<Task> = {}): Task => ({
  ...metadata(),
  title: "读书",
  description: "",
  list: "个人",
  date: "2024-01-31",
  start: "09:00",
  duration: 30,
  done: false,
  important: false,
  quadrant: "none",
  repeat: { frequency: "monthly", interval: 1, anchor: 31, until: "" },
  ...extra,
});
test("repeat keeps month anchor, completion history and stable next instance across devices", () => {
  const d = emptyData();
  d.tasks.push(task());
  const other = structuredClone(d);
  completeTask(d, d.tasks[0].id);
  completeTask(other, other.tasks[0].id);
  assert.equal(d.tasks[1].date, "2024-02-29");
  assert.equal(d.tasks[1].id, other.tasks[1].id);
  assert.equal(nextOccurrence(d.tasks[1]), "2024-03-31");
  const at = d.tasks[0].completedAt;
  completeTask(d, d.tasks[0].id);
  assert.equal(d.tasks[0].done, false);
  assert.equal(d.tasks[0].completionHistory?.[0], at);
  completeTask(d, d.tasks[0].id);
  assert.equal(d.tasks.length, 2);
  validateData(d);
});
test("single occurrence edit does not change next rule; following edit retains completed history", () => {
  const d = emptyData();
  d.tasks.push(task());
  editTask(
    d,
    { ...d.tasks[0], title: "一次改名", date: "2024-02-02" },
    "single",
  );
  completeTask(d, d.tasks[0].id);
  assert.equal(d.tasks[1].title, "读书");
  assert.equal(d.tasks[1].date, "2024-02-29");
  editTask(
    d,
    {
      ...d.tasks[1],
      title: "新系列",
      date: "2024-03-02",
      repeat: { frequency: "weekly", interval: 2, anchor: 2, until: "" },
    },
    "following",
  );
  completeTask(d, d.tasks[1].id);
  assert.equal(d.tasks[2].date, "2024-03-16");
  assert.equal(d.tasks[2].title, "新系列");
  assert.equal(d.tasks[0].title, "一次改名");
  assert.equal(d.tasks[0].seriesStopped, true);
  validateData(d);
});
test("weekdays skip weekend, until is inclusive, stale edit rejected, overlaps use open interval", () => {
  const t = task({
    date: "2026-09-11",
    repeat: {
      frequency: "weekdays",
      interval: 1,
      anchor: 11,
      until: "2026-09-14",
    },
  });
  assert.equal(nextOccurrence(t), "2026-09-14");
  assert.equal(nextOccurrence({ ...t, date: "2026-09-14" }), null);
  const d = emptyData();
  d.tasks.push(t);
  assert.throws(() => editTask(d, { ...t, title: "stale" }, "single", "old"));
  assert.equal(
    taskOverlap(t, [t, task({ date: t.date, start: "09:30" })]).length,
    0,
  );
  assert.equal(
    taskOverlap(t, [t, task({ date: t.date, start: "09:29" })]).length,
    1,
  );
});
test("countdowns advance once, preserve target history, reminders exclude completed and trashed records", () => {
  const d = emptyData();
  const c = {
    ...metadata(),
    title: "截止",
    target: "2026-09-14T09:00:00.000Z",
    closed: false,
    repeatDays: 7,
    reminderMinutes: 60,
    history: [],
  };
  d.countdowns.push(c);
  assert.equal(remindersFor(d)[0].at, Date.parse(c.target) - 3600000);
  closeCountdown(c);
  assert.equal(c.target, "2026-09-21T09:00:00.000Z");
  assert.equal(c.history.length, 1);
  c.repeatDays = 0;
  closeCountdown(c);
  assert.equal(remindersFor(d).length, 0);
  validateData(d);
});
test("v1 backup migration retains existing records and adds new collection; unknown future version rejected", () => {
  const d = emptyData();
  d.tasks.push(task({ repeat: undefined }));
  const old = { ...d, schemaVersion: 1, countdowns: undefined };
  const parsed = validateData(old);
  assert.equal(parsed.schemaVersion, 2);
  assert.deepEqual(parsed.tasks, d.tasks);
  assert.deepEqual(parsed.countdowns, []);
  assert.throws(() => validateData({ ...d, schemaVersion: 3 }));
});
