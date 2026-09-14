import {
  active,
  addDays,
  addMonths,
  metadata,
  type Task,
  type Data,
  type Countdown,
} from "./domain";

export type RepeatScope = "single" | "following";
export function nextOccurrence(task: Task) {
  const r = task.repeat;
  if (!r || !task.date || task.seriesStopped) return null;
  let next = task.occurrenceDate || task.date;
  if (r.frequency === "monthly") next = addMonths(next, r.interval, r.anchor);
  else if (r.frequency === "weekly") next = addDays(next, 7 * r.interval);
  else if (r.frequency === "daily") next = addDays(next, r.interval);
  else
    for (let i = 0; i < r.interval; i++) {
      do {
        next = addDays(next, 1);
      } while ([0, 6].includes(new Date(`${next}T12:00:00`).getDay()));
    }
  return r.until && next > r.until ? null : next;
}
export function completeTask(data: Data, id: string) {
  const t = data.tasks.find((t) => t.id === id && !t.deletedAt);
  if (!t) throw new Error("任务不存在");
  const at = new Date().toISOString();
  if (t.done) {
    t.done = false;
    t.completedAt = null;
    t.updatedAt = at;
    return;
  }
  t.done = true;
  t.completedAt = at;
  t.completionHistory = [...(t.completionHistory || []), at];
  t.updatedAt = at;
  const date = nextOccurrence(t);
  if (!date) return;
  const series = t.seriesId || t.id;
  t.seriesId = series;
  t.occurrenceDate ||= t.date;
  if (
    data.tasks.some((x) => x.seriesId === series && x.occurrenceDate === date)
  )
    return;
  data.tasks.push({
    ...t,
    ...t.seriesTemplate,
    ...metadata(),
    seriesTemplate: undefined,
    id: occurrenceId(series, date),
    date,
    occurrenceDate: date,
    seriesId: series,
    done: false,
    completedAt: null,
    completionHistory: [],
  });
}
// Same series/date on offline devices must produce the same next-instance ID.
export function occurrenceId(series: string, date: string) {
  const source = `${series}:${date}`;
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (const c of source)
    for (let i = 0; i < 4; i++)
      words[i] = Math.imul(words[i] ^ c.charCodeAt(0), 16777619 + i * 2) >>> 0;
  const hex = words.map((w) => w.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
export function editTask(
  data: Data,
  edited: Task,
  scope: RepeatScope = "single",
  expected?: string,
) {
  const previous = data.tasks.find((t) => t.id === edited.id);
  if (!previous) {
    data.tasks.push({
      ...edited,
      seriesId: edited.repeat ? edited.seriesId || edited.id : edited.seriesId,
      occurrenceDate: edited.repeat ? edited.date : edited.occurrenceDate,
    });
    return;
  }
  if (expected && previous.updatedAt !== expected)
    throw new Error("任务已在其他页面修改，请重新打开后编辑");
  const originalDate = previous.occurrenceDate || previous.date;
  const series = previous.seriesId || previous.id;
  if (scope === "following" && previous.repeat) {
    // Keep historical completed occurrences unchanged. Stop the previous rule
    // on historical instances so restoring one cannot recreate the old series.
    for (const t of data.tasks) {
      if ((t.seriesId || t.id) !== series) continue;
      if (
        t.id !== previous.id &&
        !t.done &&
        (t.occurrenceDate || t.date) >= originalDate
      ) {
        t.deletedAt = new Date().toISOString();
        t.updatedAt = t.deletedAt;
      } else if (t.id !== previous.id && t.repeat) {
        t.seriesStopped = true;
        t.updatedAt = new Date().toISOString();
      }
    }
    Object.assign(previous, edited, {
      seriesId: edited.repeat ? crypto.randomUUID() : series,
      seriesStopped: false,
      seriesTemplate: undefined,
      occurrenceDate: edited.date,
      updatedAt: new Date().toISOString(),
    });
  } else {
    // A one-off title/time/date edit must not propagate to the next instance.
    const template = previous.repeat ? { ...previous } : null;
    Object.assign(previous, edited, { updatedAt: new Date().toISOString() });
    if (template && scope === "single") {
      previous.repeat = template.repeat;
      previous.seriesId = series;
      previous.occurrenceDate = originalDate;
      // Store the series template separately from occurrence overrides.
      previous.seriesTemplate = template.seriesTemplate || {
        title: template.title,
        description: template.description,
        list: template.list,
        start: template.start,
        duration: template.duration,
        important: template.important,
        quadrant: template.quadrant,
        date: originalDate,
      };
    }
  }
}
export function closeCountdown(c: Countdown) {
  const at = new Date().toISOString();
  c.history.push({ target: c.target, closedAt: at });
  c.updatedAt = at;
  if (c.repeatDays > 0) {
    const d = new Date(c.target);
    d.setDate(d.getDate() + c.repeatDays);
    c.target = d.toISOString();
    c.closed = false;
  } else c.closed = true;
}
export function taskOverlap(task: Task, tasks: Task[]) {
  if (!task.date || !task.start || task.done) return [];
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return active(tasks).filter(
    (t) =>
      t.id !== task.id &&
      !t.done &&
      t.date === task.date &&
      t.start &&
      minutes(t.start) < minutes(task.start) + task.duration &&
      minutes(task.start) < minutes(t.start) + t.duration,
  );
}
