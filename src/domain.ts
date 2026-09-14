import { z } from "zod";

export const today = () => localDay(new Date());
export function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}
export function daysBetween(a: string, b: string) {
  return (Date.parse(b) - Date.parse(a)) / 86400000;
}
export function addMonths(
  day: string,
  months: number,
  anchor = Number(day.slice(8)),
) {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(anchor, last));
  return d.toISOString().slice(0, 10);
}
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const n = Date.parse(v);
    return (
      Number.isFinite(n) &&
      new Date(n).toISOString().slice(0, 10) === v &&
      v >= "1900-01-01" &&
      v <= "2199-12-31"
    );
  }, "日期无效");
const title = z.string().trim().min(1, "请填写名称").max(100);
const text = z.string().max(10000);
const moneySchema = z.number().int().positive().max(10000000000);
const base = {
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
};
export const repeatSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "weekdays"]),
  interval: z.number().int().min(1).max(365),
  until: daySchema.or(z.literal("")),
  anchor: z.number().int().min(1).max(31),
});
const taskSchema = z
  .object({
    ...base,
    title,
    description: text,
    list: title,
    date: daySchema.or(z.literal("")),
    start: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .or(z.literal("")),
    duration: z.number().int().min(5).max(1440),
    done: z.boolean(),
    important: z.boolean(),
    quadrant: z.enum(["none", "iu", "in", "nu", "nn"]),
    repeat: repeatSchema.nullable().optional(),
    seriesId: z.string().uuid().optional(),
    occurrenceDate: daySchema.optional(),
    completedAt: z.string().datetime().nullable().optional(),
    completionHistory: z.array(z.string().datetime()).max(10000).optional(),
    reminderMinutes: z
      .array(z.number().int().min(0).max(43200))
      .max(5)
      .optional(),
    seriesStopped: z.boolean().optional(),
    seriesTemplate: z
      .object({
        title,
        description: text,
        list: title,
        start: z.string(),
        duration: z.number().int().min(5).max(1440),
        important: z.boolean(),
        quadrant: z.enum(["none", "iu", "in", "nu", "nn"]),
        date: daySchema,
        reminderMinutes: z
          .array(z.number().int().min(0).max(43200))
          .max(5)
          .default([]),
      })
      .optional(),
  })
  .refine((t) => !t.start || !!t.date, "有时间的任务必须选择日期")
  .refine((t) => !t.repeat || !!t.date, "重复任务必须安排日期")
  .refine(
    (t) => !t.repeat?.until || t.repeat.until >= (t.occurrenceDate || t.date),
    "重复截止日不能早于本次日期",
  )
  .refine(
    (t) => !t.reminderMinutes?.length || !!t.date,
    "请先安排日期再设置提醒",
  )
  .refine(
    (t) =>
      !t.start ||
      Number(t.start.slice(0, 2)) * 60 +
        Number(t.start.slice(3)) +
        t.duration <=
        1440,
    "本版时间段不能跨越午夜",
  );
const entrySchema = z.object({
  ...base,
  kind: z.enum(["expense", "income", "transfer", "refund"]),
  amount: moneySchema,
  currency: z.literal("CNY"),
  date: daySchema,
  category: title,
  account: title,
  toAccount: z.string().max(100),
  merchant: z.string().max(100),
  note: text,
  refundOf: z.string(),
  status: z.enum(["posted", "pending", "ignored"]),
});
const periodSchema = z
  .object({
    id: z.string().uuid(),
    start: daySchema,
    end: daySchema,
    amount: moneySchema,
    entryId: z.string(),
  })
  .refine((p) => p.end > p.start, "结束日必须晚于开始日");
const memberSchema = z.object({
  ...base,
  name: title,
  months: z.union([z.literal(1), z.literal(3), z.literal(12)]),
  anchor: z.number().int().min(1).max(31),
  status: z.enum(["active", "paused", "cancelled"]),
  autoRenew: z.boolean(),
  snoozeUntil: daySchema.or(z.literal("")),
  periods: z.array(periodSchema).min(1).max(1000),
  note: text,
});
const habitSchema = z.object({
  ...base,
  name: title,
  description: text,
  start: daySchema,
  logs: z.record(daySchema, z.enum(["done", "skipped", "missed"])),
});
const noteSchema = z.object({ ...base, title, body: text });
const focusSchema = z.object({
  ...base,
  taskId: z.string(),
  title,
  date: daySchema,
  seconds: z.number().int().min(1).max(86400),
});
const timerSchema = z.object({
  taskId: z.string(),
  title,
  target: z.number().int().min(60).max(14400),
  accumulated: z.number().min(0).max(86400),
  startedAt: z.number().nullable(),
});
const countdownSchema = z.object({
  ...base,
  title,
  target: z.string().datetime(),
  closed: z.boolean(),
  repeatDays: z.number().int().min(0).max(3650),
  reminderMinutes: z.number().int().min(0).max(43200),
  history: z
    .array(
      z.object({
        target: z.string().datetime(),
        closedAt: z.string().datetime(),
      }),
    )
    .max(10000),
});
export const dataSchema = z.object({
  schemaVersion: z.literal(2),
  tasks: z.array(taskSchema).max(10000),
  entries: z.array(entrySchema).max(10000),
  members: z.array(memberSchema).max(10000),
  habits: z.array(habitSchema).max(10000),
  notes: z.array(noteSchema).max(10000),
  focuses: z.array(focusSchema).max(10000),
  timer: timerSchema.nullable(),
  countdowns: z.array(countdownSchema).max(10000).default([]),
});
export type Data = z.infer<typeof dataSchema>;
export type Task = Data["tasks"][number];
export type Entry = Data["entries"][number];
export type Member = Data["members"][number];
export type Habit = Data["habits"][number];
export type Note = Data["notes"][number];
export type Countdown = Data["countdowns"][number];
export type Collection =
  | "tasks"
  | "entries"
  | "members"
  | "habits"
  | "notes"
  | "focuses"
  | "countdowns";
export const collections: Collection[] = [
  "tasks",
  "entries",
  "members",
  "habits",
  "notes",
  "focuses",
  "countdowns",
];
export const emptyData = (): Data => ({
  schemaVersion: 2,
  tasks: [],
  entries: [],
  members: [],
  habits: [],
  notes: [],
  focuses: [],
  timer: null,
  countdowns: [],
});
export const metadata = () => ({
  id: crypto.randomUUID(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
});
export const active = <T extends { deletedAt: string | null }>(items: T[]) =>
  items.filter((x) => !x.deletedAt);
export const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    cents / 100,
  );
export function parseMoney(input: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(input.trim()))
    throw new Error("金额须为正数，最多两位小数");
  const [yuan, fen = ""] = input.trim().split(".");
  const value = Number(yuan) * 100 + Number(fen.padEnd(2, "0"));
  if (value <= 0 || value > 10000000000)
    throw new Error("金额须大于零且不超过一亿元");
  return value;
}
export function validateData(input: unknown): Data {
  if (
    input &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion === 1
  )
    input = { ...input, schemaVersion: 2 };
  const result = dataSchema.safeParse(input);
  if (!result.success)
    throw new Error(`数据未保存：${result.error.issues[0].message}`);
  const data = result.data;
  const ids = new Set<string>();
  for (const key of collections)
    for (const row of data[key]) {
      if (ids.has(row.id)) throw new Error("记录 ID 重复");
      ids.add(row.id);
    }
  const entries = active(data.entries);
  for (const e of entries) {
    if (e.kind === "transfer" && (!e.toAccount || e.toAccount === e.account))
      throw new Error("请选择不同的转出和转入账户");
    if (e.kind === "refund") {
      const original = entries.find(
        (x) =>
          x.id === e.refundOf && x.kind === "expense" && x.status === "posted",
      );
      if (!original) throw new Error("退款必须关联一笔未删除的已入账支出");
      if (e.date < original.date) throw new Error("退款日期不能早于原支出");
      const refunded = entries
        .filter(
          (x) =>
            x.kind === "refund" &&
            x.refundOf === original.id &&
            x.status === "posted",
        )
        .reduce((sum, x) => sum + x.amount, 0);
      if (refunded > original.amount)
        throw new Error("累计退款不能超过原支出金额");
    }
  }
  for (const h of active(data.habits)) {
    for (const day of Object.keys(h.logs))
      if (day < h.start || day > today())
        throw new Error("打卡日期必须在习惯开始日与今天之间");
  }
  return data;
}
export function summarize(data: Data, month: string) {
  const entries = active(data.entries).filter((e) => e.status === "posted");
  const inRange = entries.filter((e) => e.date.startsWith(month));
  let expense = 0,
    income = 0;
  const categories: Record<string, number> = {};
  for (const e of inRange) {
    if (e.kind === "income") income += e.amount;
    if (e.kind === "expense") {
      expense += e.amount;
      categories[e.category] = (categories[e.category] || 0) + e.amount;
    }
    if (e.kind === "refund") {
      expense -= e.amount;
      const c =
        entries.find((x) => x.id === e.refundOf)?.category || e.category;
      categories[c] = (categories[c] || 0) - e.amount;
    }
  }
  return {
    expense,
    income,
    net: income - expense,
    categories,
    count: inRange.filter((e) => e.kind !== "transfer").length,
  };
}
export function currentPeriod(m: Member) {
  return m.periods[m.periods.length - 1];
}
export function memberCosts(m: Member, day = today()) {
  const p = currentPeriod(m),
    days = daysBetween(p.start, p.end);
  return {
    days,
    remaining: daysBetween(day, p.end),
    daily: day < p.start ? null : p.amount / days,
    monthly: p.amount / m.months,
    yearly: (p.amount * 12) / m.months,
  };
}
export function renewMember(
  data: Data,
  id: string,
  amount: number,
  start: string,
  createEntry: boolean,
) {
  const m = data.members.find((x) => x.id === id && !x.deletedAt);
  if (!m) throw new Error("会员不存在");
  const last = currentPeriod(m);
  if (start < last.end) throw new Error("新周期不能与上一周期重叠");
  const entryId = createEntry ? crypto.randomUUID() : "";
  const anchor = start === last.end ? m.anchor : Number(start.slice(8));
  m.anchor = anchor;
  m.periods.push({
    id: crypto.randomUUID(),
    start,
    end: addMonths(start, m.months, anchor),
    amount,
    entryId,
  });
  m.status = "active";
  m.snoozeUntil = "";
  m.updatedAt = new Date().toISOString();
  if (createEntry)
    data.entries.push({
      ...metadata(),
      id: entryId,
      kind: "expense",
      amount,
      currency: "CNY",
      date: today(),
      category: "会员订阅",
      account: "默认账户",
      toAccount: "",
      merchant: m.name,
      note: "会员续费",
      refundOf: "",
      status: "posted",
    });
}
export function trash(data: Data, collection: Collection, id: string) {
  if (
    collection === "entries" &&
    active(data.entries).some((x) => x.refundOf === id)
  )
    throw new Error("请先删除关联退款，再删除原支出");
  const row = data[collection].find((x) => x.id === id);
  if (row) row.deletedAt = row.updatedAt = new Date().toISOString();
}
export function habitStreak(h: Habit, day = today()) {
  let cursor = day,
    count = 0;
  if (h.logs[cursor] === undefined) cursor = addDays(cursor, -1);
  while (cursor >= h.start) {
    const value = h.logs[cursor];
    if (value === "done") count++;
    else if (value !== "skipped") break;
    cursor = addDays(cursor, -1);
  }
  return count;
}
export function focusElapsed(
  timer: NonNullable<Data["timer"]>,
  now = Date.now(),
) {
  return Math.min(
    86400,
    Math.floor(
      timer.accumulated +
        (timer.startedAt === null
          ? 0
          : Math.max(0, now - timer.startedAt) / 1000),
    ),
  );
}
