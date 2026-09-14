import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  type FormEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Coffee,
  Download,
  Flower2,
  LayoutGrid,
  ListTodo,
  NotebookPen,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Timer,
  Trash2,
  Wallet,
  X,
  RefreshCw,
} from "lucide-react";
import {
  active,
  addDays,
  collections,
  currentPeriod,
  daysBetween,
  emptyData,
  focusElapsed,
  habitStreak,
  memberCosts,
  metadata,
  money,
  renewMember,
  summarize,
  today,
  trash,
  validateData,
  type Collection,
  type Data,
  type Entry,
  type Habit,
  type Member,
  type Note,
  type Task,
  type Countdown,
} from "./domain";
import { change, db, download, initialize, replaceData } from "./db";
import {
  Empty,
  EntryForm,
  Field,
  HabitForm,
  MemberForm,
  Modal,
  NoteForm,
  RenewForm,
  TaskForm,
  CountdownForm,
} from "./components";
import {
  generateKey,
  synchronize,
  type SyncConfig,
  type SyncConflict,
} from "./sync";

import { DeviceSettings } from "./DeviceSettings";
import { AppUpdate } from "./AppUpdate";
import { exportText } from "./export";
import { Calendar } from "./Calendar";
import { ConflictPanel } from "./ConflictPanel";
import { completeTask, editTask, closeCountdown } from "./planning";

import { ReminderService, ReminderSettings } from "./ReminderSettings";

type Page = "today" | "plan" | "habits" | "ledger" | "members" | "settings";
type Editor =
  | { kind: "task"; item?: Task; date?: string; start?: string }
  | { kind: "countdown"; item?: Countdown }
  | { kind: "entry"; item?: Entry }
  | { kind: "member"; item?: Member }
  | { kind: "habit"; item?: Habit }
  | { kind: "note"; item?: Note }
  | { kind: "renew"; item: Member }
  | { kind: "memberDetail"; item: Member };
const nav = [
  { id: "today", label: "今天", icon: Sun },
  { id: "plan", label: "计划", icon: ListTodo },
  { id: "habits", label: "习惯", icon: Sprout },
  { id: "ledger", label: "账本", icon: Wallet },
  { id: "members", label: "会员", icon: BookOpen },
  { id: "settings", label: "设置", icon: Settings },
] as const;
const types = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  refund: "退款",
};
const quadrants = {
  none: "未归类",
  iu: "重要且紧急",
  in: "重要不紧急",
  nu: "不重要但紧急",
  nn: "不重要不紧急",
};
const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
const stamp = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "尚无记录";

export function App() {
  const [page, setPage] = useState<Page>("today"),
    [editor, setEditor] = useState<Editor | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(0),
    [ready, setReady] = useState(false);
  const [day, setDay] = useState(today()),
    [month, setMonth] = useState(today().slice(0, 7)),
    [search, setSearch] = useState(""),
    [planTab, setPlanTab] = useState("全部任务"),
    [ledgerCategory, setLedgerCategory] = useState("全部"),
    [ledgerType, setLedgerType] = useState("全部");
  const [tick, setTick] = useState(Date.now()),
    [syncBusy, setSyncBusy] = useState(false),
    [config, setConfig] = useState<SyncConfig>({
      endpoint: "/api/sync",
      token: "",
      key: "",
    }),
    [conflict, setConflict] = useState<SyncConflict | null>(null),
    [importData, setImportData] = useState<Data | null>(null),
    [habitLog, setHabitLog] = useState<{ habit: Habit; date: string } | null>(
      null,
    );
  const vault = useLiveQuery(() => db.vault.get("main"));
  const calendarTasks = useMemo(
    () =>
      active(vault?.data.tasks || []).filter((t) =>
        [t.title, t.description, t.list].some((v) =>
          v.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
        ),
      ),
    [vault?.data.tasks, search],
  );
  const openCalendarTask = useCallback(
    (t: Task) => setEditor({ kind: "task", item: t }),
    [],
  );
  const createCalendarTask = useCallback(
    (date: string, start?: string) => setEditor({ kind: "task", date, start }),
    [],
  );
  const moveCalendarTask = useCallback(
    async (t: Task, date: string, start: string, duration: number) => {
      if (t.repeat) {
        setEditor({ kind: "task", item: { ...t, date, start, duration } });
        return;
      }
      await change((d) =>
        editTask(d, { ...t, date, start, duration }, "single", t.updatedAt),
      );
    },
    [],
  );
  const backups =
    useLiveQuery(() => db.backups.orderBy("createdAt").reverse().toArray()) ||
    [];
  useEffect(() => {
    initialize()
      .then(() => setReady(true))
      .catch(() =>
        setError(
          "无法打开本地数据库。请检查浏览器是否允许站点存储后刷新；尚未写入任何新数据。",
        ),
      );
  }, []);
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    document.title = `自明 SELF · ${nav.find((n) => n.id === page)?.label}`;
  }, [page]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (pending > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [pending]);
  async function run(fn: () => Promise<unknown>, success = "已保存到本机") {
    setPending((n) => n + 1);
    try {
      await fn();
      setMessage(success);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "操作失败。原有数据仍在，请重试。",
      );
    } finally {
      setPending((n) => n - 1);
    }
  }
  if (!ready || !vault)
    return (
      <div className="loading">
        <img src="/icon.svg" width="56" />
        <h1>自明</h1>
        <p role="status">{error || "正在打开你的生活空间…"}</p>
      </div>
    );
  const data = vault.data;
  const tasks = active(data.tasks),
    habits = active(data.habits),
    members = active(data.members),
    notes = active(data.notes);
  const query = search.trim().toLocaleLowerCase();
  const matches = (...v: string[]) =>
    !query || v.some((s) => s.toLocaleLowerCase().includes(query));
  const dayTasks = tasks.filter((t) => t.date === day),
    done = dayTasks.filter((t) => t.done).length;
  const inbox = tasks.filter((t) => !t.date && !t.done),
    overdue = tasks.filter((t) => t.date && t.date < today() && !t.done);
  const summary = summarize(data, month),
    currentSummary = summarize(data, today().slice(0, 7));
  const reminders = members
    .filter(
      (m) =>
        m.status === "active" &&
        currentPeriod(m).end <= addDays(today(), 7) &&
        (!m.snoozeUntil || m.snoozeUntil <= today()),
    )
    .sort((a, b) => currentPeriod(a).end.localeCompare(currentPeriod(b).end));
  const focus = data.timer,
    elapsed = focus ? focusElapsed(focus, tick) : 0,
    remaining = focus ? Math.max(0, focus.target - elapsed) : 1500;
  const focusMinutes = Math.floor(
    active(data.focuses)
      .filter((f) => f.date === today())
      .reduce((s, f) => s + f.seconds, 0) / 60,
  );
  const deleted = collections.flatMap((collection) =>
    data[collection]
      .filter((x) => x.deletedAt)
      .map((item) => ({ collection, item })),
  );
  const jump = (p: Page) => {
    setPage(p);
    setSearch("");
  };
  async function save<
    T extends Task | Entry | Member | Habit | Note | Countdown,
  >(collection: Collection, item: T) {
    await change((d) => {
      const rows = d[collection] as T[];
      const i = rows.findIndex((r) => r.id === item.id);
      if (i >= 0 && editor?.item && rows[i].updatedAt !== editor.item.updatedAt)
        throw new Error(
          "这条记录已在其他页面更新。请关闭编辑窗口后重新打开，避免覆盖新修改。",
        );
      if (i < 0) rows.push(item);
      else rows[i] = item;
    });
    setEditor(null);
    setMessage("已保存到本机");
  }
  const remove = (collection: Collection, id: string) =>
    run(
      () => change((d) => trash(d, collection, id)),
      "已移入回收站，可在设置中恢复",
    );
  const toggleTask = (t: Task) =>
    run(
      () =>
        change((d) => {
          completeTask(d, t.id);
        }),
      t.done ? "任务已恢复" : "完成一件事，给自己一点肯定",
    );
  const startFocus = (t?: Task) =>
    run(
      () =>
        change((d) => {
          if (d.timer) throw new Error("已有专注计时，请先结束或放弃当前计时");
          d.timer = {
            taskId: t?.id || "",
            title: t?.title || "自由专注",
            target: 1500,
            accumulated: 0,
            startedAt: Date.now(),
          };
        }),
      "专注已开始",
    );
  const endFocus = (discard = false) =>
    run(
      () =>
        change((d) => {
          if (!d.timer) return;
          const seconds = focusElapsed(d.timer);
          if (!discard && seconds < 1)
            throw new Error("专注不足 1 秒，可以选择放弃");
          if (!discard)
            d.focuses.push({
              ...metadata(),
              taskId: d.timer.taskId,
              title: d.timer.title,
              date: today(),
              seconds,
            });
          d.timer = null;
        }),
      discard ? "本次专注已放弃" : "实际专注时长已记录",
    );
  async function sync() {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const c = await synchronize(config);
      setConflict(c);
      setMessage(c ? "发现同步冲突，请比较两个版本" : "同步检查完成");
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "网络连接失败，本机数据已保留，可稍后重试。",
      );
    } finally {
      setSyncBusy(false);
    }
  }
  const taskRows = (list: Task[], compact = false) => (
    <div className="task-list">
      {[...list]
        .sort(
          (a, b) =>
            Number(a.done) - Number(b.done) ||
            Number(b.important) - Number(a.important) ||
            a.start.localeCompare(b.start),
        )
        .map((t) => (
          <div className={`task-row ${t.done ? "is-done" : ""}`} key={t.id}>
            <button
              className={`task-check ${t.done ? "checked" : ""}`}
              aria-label={`${t.done ? "恢复" : "完成"}任务 ${t.title}`}
              onClick={() => toggleTask(t)}
            >
              {t.done && <Check size={14} />}
            </button>
            <button
              className="task-content"
              onClick={() => setEditor({ kind: "task", item: t })}
            >
              <strong>{t.title}</strong>
              <span>
                {t.start && <b>{t.start}</b>}
                {t.date && t.date !== day && (
                  <span
                    className={t.date < today() && !t.done ? "overdue" : ""}
                  >
                    {t.date}
                  </span>
                )}
                <i
                  className={`list-dot ${t.list === "工作" ? "blue" : t.list === "学习" ? "purple" : ""}`}
                />
                {t.list}
                {t.repeat && <span>↻ 重复</span>}
                {!compact && t.description && (
                  <span className="task-desc">{t.description}</span>
                )}
              </span>
            </button>
            {!compact && (
              <button
                className="icon-btn optional"
                title="开始专注"
                aria-label={`专注 ${t.title}`}
                disabled={!!focus}
                onClick={() => startFocus(t)}
              >
                <Play size={15} />
              </button>
            )}
            <button
              className={`icon-btn ${t.important ? "starred" : ""}`}
              aria-label={`${t.important ? "取消重要" : "标为重要"} ${t.title}`}
              onClick={() =>
                run(() =>
                  change((d) => {
                    const r = d.tasks.find((x) => x.id === t.id)!;
                    r.important = !r.important;
                    r.updatedAt = new Date().toISOString();
                  }),
                )
              }
            >
              <Star size={17} fill={t.important ? "currentColor" : "none"} />
            </button>
            {!compact && (
              <button
                className="icon-btn row-delete"
                aria-label={`删除任务 ${t.title}`}
                onClick={() => remove("tasks", t.id)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
    </div>
  );
  const quickAdd = (
    <form
      className="quick-add"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (pending > 0) return;
        const form = e.currentTarget;
        const title = String(new FormData(form).get("title") || "").trim();
        if (!title) return;
        void run(async () => {
          await change((d) =>
            d.tasks.push({
              ...metadata(),
              title,
              description: "",
              list: "收集箱",
              date: page === "today" ? day : "",
              start: "",
              duration: 25,
              done: false,
              important: false,
              quadrant: "none",
            }),
          );
          form.reset();
        });
      }}
    >
      <Plus size={19} />
      <input
        name="title"
        aria-label="快速添加任务"
        placeholder={
          page === "today"
            ? "添加今天想做的事，按 Enter 保存"
            : "添加任务到收集箱，按 Enter 保存"
        }
        maxLength={100}
        required
      />
      <button type="submit" disabled={pending > 0}>
        {pending > 0 ? "保存中…" : "添加"}
      </button>
    </form>
  );
  const habitCards = (compact = false) => (
    <div className={compact ? "habit-compact" : "habit-grid"}>
      {habits
        .filter((h) => matches(h.name, h.description))
        .map((h) => {
          const week = Array.from({ length: 7 }, (_, i) =>
            addDays(today(), i - 6),
          );
          return (
            <article className="habit-card" key={h.id}>
              <div className="habit-title">
                <span className="soft-icon">
                  <Sprout size={19} />
                </span>
                <button
                  className="text-left"
                  onClick={() => setEditor({ kind: "habit", item: h })}
                >
                  <strong>{h.name}</strong>
                  <small>连续完成 {habitStreak(h)} 天</small>
                </button>
                <button
                  className={`habit-today ${h.logs[today()] === "done" ? "checked" : ""}`}
                  aria-label={`记录习惯 ${h.name}`}
                  onClick={() => setHabitLog({ habit: h, date: today() })}
                >
                  {h.logs[today()] === "done" ? (
                    <Check size={18} />
                  ) : (
                    <Plus size={17} />
                  )}
                </button>
              </div>
              {!compact && (
                <>
                  <p>{h.description || "每天一点点，慢慢积累。"}</p>
                  <div className="habit-week">
                    {week.map((date) => (
                      <div key={date}>
                        <small>
                          {new Date(`${date}T12:00:00`)
                            .toLocaleDateString("zh-CN", { weekday: "short" })
                            .slice(-1)}
                        </small>
                        <button
                          disabled={date < h.start}
                          className={`habit-day ${h.logs[date] || "unknown"}`}
                          aria-label={`${h.name} ${date} ${h.logs[date] || "未记录"}`}
                          onClick={() => setHabitLog({ habit: h, date })}
                        >
                          {h.logs[date] === "done" ? (
                            <Check size={17} />
                          ) : h.logs[date] === "skipped" ? (
                            "–"
                          ) : h.logs[date] === "missed" ? (
                            <X size={15} />
                          ) : (
                            date.slice(8)
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="card-footer">
                    <span>每日习惯 · {h.start} 开始</span>
                    <button
                      className="icon-btn"
                      aria-label={`删除习惯 ${h.name}`}
                      onClick={() => remove("habits", h.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
    </div>
  );
  const memberCard = (m: Member) => {
    const p = currentPeriod(m),
      cost = memberCosts(m);
    return (
      <article className="member-card" key={m.id}>
        <div className="member-top">
          <span className="member-logo">{m.name.slice(0, 1)}</span>
          <div>
            <button
              className="text-left"
              onClick={() => setEditor({ kind: "memberDetail", item: m })}
            >
              <strong>{m.name}</strong>
            </button>
            <small>
              {m.months === 12 ? "年付" : m.months === 3 ? "季付" : "月付"} ·{" "}
              {m.autoRenew ? "自动续费已记录" : "手动续费"}
            </small>
          </div>
          <span
            className={`badge ${m.status === "active" && cost.remaining <= 7 ? "amber" : ""}`}
          >
            {m.status === "paused"
              ? "已暂停"
              : m.status === "cancelled"
                ? "已取消"
                : cost.remaining <= 0
                  ? "已到期"
                  : "使用中"}
          </span>
        </div>
        <div className="member-price">
          {money(p.amount)}
          <span>
            {" "}
            / {m.months === 12 ? "年" : m.months === 3 ? "季" : "月"}
          </span>
        </div>
        <div className="member-meta">
          <span>本周期结束日</span>
          <b>{p.end}</b>
        </div>
        <div className="member-meta">
          <span>平均日花费</span>
          <b>{cost.daily === null ? "暂无计算条件" : money(cost.daily)}</b>
        </div>
        <div className="card-footer">
          <span>
            {m.status === "active"
              ? cost.remaining > 0
                ? `距到期 ${cost.remaining} 天`
                : `已到期 ${-cost.remaining} 天`
              : "后续提醒已停止"}
          </span>
          <button
            className="text-button"
            onClick={() => setEditor({ kind: "memberDetail", item: m })}
          >
            管理会员 <ChevronRight size={14} />
          </button>
        </div>
      </article>
    );
  };
  const metrics = (s: ReturnType<typeof summarize>) => (
    <div className="metrics">
      <div>
        <span>净支出 · CNY</span>
        <strong>{s.count ? money(s.expense) : "暂无账单"}</strong>
        <small>已入账支出 − 已关联退款</small>
      </div>
      <div>
        <span>收入 · CNY</span>
        <strong>{s.count ? money(s.income) : "暂无账单"}</strong>
        <small>仅统计已入账收入</small>
      </div>
      <div>
        <span>净现金流 · CNY</span>
        <strong>{s.count ? money(s.net) : "暂无账单"}</strong>
        <small>收入 − 净支出，不含转账</small>
      </div>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            jump("today");
          }}
        >
          <img src="/icon.svg" width="36" height="36" alt="" />
          <span>
            自明 <small>SELF</small>
          </span>
        </a>
        <p className="sidebar-caption">留一点时间，给自己。</p>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              className={page === n.id ? "active" : ""}
              onClick={() => jump(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "today" && (
                <b>
                  {tasks.filter((t) => t.date === today() && !t.done).length}
                </b>
              )}
              {n.id === "habits" && <i className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Flower2 size={26} />
          <p>
            把生活，
            <br />
            慢慢理清。
          </p>
          <span>做好眼前的一件小事。</span>
        </div>
        <button className="profile" onClick={() => jump("settings")}>
          <span className="avatar">我</span>
          <span>
            <strong>我的生活空间</strong>
            <small>
              <span className="status-dot" /> 本地优先 · 个人使用
            </small>
          </span>
          <Settings size={16} />
        </button>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            我的空间 <ChevronRight size={13} />{" "}
            <b>{nav.find((n) => n.id === page)?.label}</b>
          </span>
          <div className="top-actions">
            <label className="search">
              <Search size={16} />
              <input
                placeholder="搜索当前页面"
                aria-label="搜索当前页面"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="清空搜索" onClick={() => setSearch("")}>
                  <X size={14} />
                </button>
              )}
            </label>
            <button className="sync-status" onClick={() => jump("settings")}>
              {vault.endpoint ? (
                <ShieldCheck size={15} />
              ) : (
                <CloudOff size={15} />
              )}
              <span>
                {conflict
                  ? "同步需处理"
                  : !vault.endpoint
                    ? "仅本机"
                    : vault.dirty
                      ? "等待同步"
                      : "上次同步完成"}
              </span>
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "today"
                  ? "A LITTLE CLARITY, EVERY DAY"
                  : page === "habits"
                    ? "SMALL STEPS, LASTING CHANGE"
                    : "YOUR PERSONAL SPACE"}
              </p>
              <h1>
                {page === "today"
                  ? "今天，从容一点。"
                  : page === "plan"
                    ? "把想法，变成行动。"
                    : page === "habits"
                      ? "让好习惯，慢慢生长。"
                      : page === "ledger"
                        ? "每一笔，都心中有数。"
                        : page === "members"
                          ? "持续的服务，清楚的花费。"
                          : "让数据，由你掌握。"}
              </h1>
              <p className="page-subtitle">
                {page === "today"
                  ? `${dateLabel(day)} · 不必做完所有事，先做好重要的事。`
                  : page === "plan"
                    ? "收集想做的事，再给重要的事情留出时间。"
                    : page === "habits"
                      ? "允许休息，也记得每一次小小的坚持。"
                      : page === "ledger"
                        ? "手动记录真实收支，了解自己的消费。"
                        : page === "members"
                          ? "管理周期费用，让每一次续费都有准备。"
                          : "本地保存、同步状态和备份，都在这里。"}
              </p>
            </div>
            {page !== "settings" && (
              <button
                className="primary add-main"
                onClick={() =>
                  setEditor({
                    kind:
                      page === "ledger"
                        ? "entry"
                        : page === "members"
                          ? "member"
                          : page === "habits"
                            ? "habit"
                            : "task",
                  })
                }
              >
                <Plus size={17} />
                {page === "ledger"
                  ? "记一笔"
                  : page === "members"
                    ? "新增会员"
                    : page === "habits"
                      ? "新增习惯"
                      : "新增任务"}
              </button>
            )}
          </div>
          {page === "today" && (
            <>
              {active(data.countdowns).filter(
                (c) => !c.closed && Date.parse(c.target) <= tick + 7 * 86400000,
              ).length > 0 && (
                <section className="panel today-countdowns">
                  <h2>临近的倒计时</h2>
                  {active(data.countdowns)
                    .filter(
                      (c) =>
                        !c.closed &&
                        Date.parse(c.target) <= tick + 7 * 86400000,
                    )
                    .sort((a, b) => a.target.localeCompare(b.target))
                    .slice(0, 4)
                    .map((c) => (
                      <button
                        className="secondary"
                        key={c.id}
                        onClick={() =>
                          setEditor({ kind: "countdown", item: c })
                        }
                      >
                        {c.title} ·{" "}
                        {Date.parse(c.target) <= tick
                          ? "已到期"
                          : stamp(c.target)}
                      </button>
                    ))}
                </section>
              )}
              <div className="today-grid">
                <section className="today-main">
                  <div className="day-strip">
                    <button
                      className="icon-btn"
                      aria-label="前一天"
                      onClick={() => setDay(addDays(day, -1))}
                    >
                      <ChevronLeft size={17} />
                    </button>
                    {Array.from({ length: 7 }, (_, i) =>
                      addDays(day, i - 3),
                    ).map((d) => (
                      <button
                        className={d === day ? "selected" : ""}
                        key={d}
                        onClick={() => setDay(d)}
                      >
                        <span>
                          {d === today()
                            ? "今天"
                            : new Date(`${d}T12:00:00`).toLocaleDateString(
                                "zh-CN",
                                { weekday: "short" },
                              )}
                        </span>
                        <strong>{Number(d.slice(8))}</strong>
                        <i
                          className={
                            tasks.some((t) => t.date === d && !t.done)
                              ? "has-tasks"
                              : ""
                          }
                        />
                      </button>
                    ))}
                    <button
                      className="icon-btn"
                      aria-label="后一天"
                      onClick={() => setDay(addDays(day, 1))}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                  <div className="section-title">
                    <h2>
                      今日安排 <span>{dayTasks.length}</span>
                    </h2>
                    <div className="inline-actions">
                      {day !== today() && (
                        <button
                          className="text-button"
                          onClick={() => setDay(today())}
                        >
                          返回今天
                        </button>
                      )}
                      <label className="date-picker">
                        <input
                          aria-label="查看日期"
                          type="date"
                          value={day}
                          onChange={(e) =>
                            e.target.value && setDay(e.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                  {quickAdd}
                  {dayTasks.filter((t) =>
                    matches(t.title, t.description, t.list),
                  ).length ? (
                    taskRows(
                      dayTasks.filter((t) =>
                        matches(t.title, t.description, t.list),
                      ),
                    )
                  ) : (
                    <Empty
                      title={query ? "没有匹配的任务" : "今天，留给你来安排"}
                    >
                      从一件重要的小事开始，写下今天想做的事。
                    </Empty>
                  )}
                  {overdue.length > 0 && day === today() && (
                    <section className="inbox-section">
                      <div className="section-title">
                        <h2>
                          之前未完成 <span>{overdue.length}</span>
                        </h2>
                      </div>
                      {taskRows(
                        overdue.filter((t) => matches(t.title, t.description)),
                        true,
                      )}
                    </section>
                  )}
                  <section className="inbox-section">
                    <div className="section-title">
                      <h2>
                        还没安排 <span>{inbox.length}</span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => jump("plan")}
                      >
                        查看清单 <ChevronRight size={14} />
                      </button>
                    </div>
                    {inbox.length ? (
                      taskRows(
                        inbox.filter((t) => matches(t.title, t.description)),
                        true,
                      )
                    ) : (
                      <p className="inline-empty">
                        收集箱很清爽。临时想法可以先记在计划里。
                      </p>
                    )}
                  </section>
                  <section className="daily-habits">
                    <div className="section-title">
                      <h2>
                        <Sprout size={19} /> 每日习惯
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => jump("habits")}
                      >
                        全部习惯 <ChevronRight size={14} />
                      </button>
                    </div>
                    {habits.length ? (
                      habitCards(true)
                    ) : (
                      <button
                        className="habit-starter"
                        onClick={() => setEditor({ kind: "habit" })}
                      >
                        <span className="soft-icon">
                          <Sprout size={22} />
                        </span>
                        <span>
                          <strong>给自己一个小小的约定</strong>
                          <small>阅读、散步、早睡，从一个习惯开始。</small>
                        </span>
                        <Plus size={18} />
                      </button>
                    )}
                  </section>
                </section>
                <aside className="today-aside">
                  <section className="progress-card">
                    <div className="section-title">
                      <h2>今天的小进展</h2>
                      <Sparkles size={17} />
                    </div>
                    <div className="progress-body">
                      <div
                        className="progress-ring"
                        style={
                          {
                            "--progress": `${dayTasks.length ? (done / dayTasks.length) * 100 : 0}%`,
                          } as React.CSSProperties
                        }
                      >
                        <span>
                          <b>{done}</b>
                          <small>/ {dayTasks.length}</small>
                        </span>
                      </div>
                      <div>
                        <strong>
                          {done ? "每一步都算数" : "新的一天，新的开始"}
                        </strong>
                        <p>
                          {done
                            ? "给已经完成的自己一点肯定。"
                            : "完成第一件事，让今天动起来。"}
                        </p>
                      </div>
                    </div>
                    <div className="progress-footer">
                      <span>
                        已记录专注 <b>{focusMinutes} 分钟</b>
                      </span>
                      <span>
                        {
                          habits.filter((h) => h.logs[today()] === "done")
                            .length
                        }{" "}
                        个习惯已完成
                      </span>
                    </div>
                  </section>
                  <section className="focus-card">
                    <div className="section-title">
                      <h2>
                        <Timer size={17} /> 留一段专注时间
                      </h2>
                      <span>25 分钟</span>
                    </div>
                    <div className="timer-number">
                      {String(Math.floor(remaining / 60)).padStart(2, "0")}
                      <span>:</span>
                      {String(remaining % 60).padStart(2, "0")}
                    </div>
                    <p>
                      {focus ? focus.title : "放下其他事，只做眼前这一件。"}
                    </p>
                    {focus ? (
                      <>
                        <div className="focus-actions">
                          <button
                            className="secondary"
                            onClick={() =>
                              run(
                                () =>
                                  change((d) => {
                                    if (!d.timer) return;
                                    d.timer = {
                                      ...d.timer,
                                      accumulated: focusElapsed(d.timer),
                                      startedAt:
                                        d.timer.startedAt === null
                                          ? Date.now()
                                          : null,
                                    };
                                  }),
                                focus.startedAt === null
                                  ? "继续专注"
                                  : "已暂停，暂停时间不计入统计",
                              )
                            }
                          >
                            {focus.startedAt === null ? (
                              <Play size={15} />
                            ) : (
                              <Pause size={15} />
                            )}{" "}
                            {focus.startedAt === null ? "继续" : "暂停"}
                          </button>
                          <button
                            className="primary"
                            onClick={() => endFocus()}
                          >
                            结束并记录
                          </button>
                        </div>
                        <button
                          className="text-button muted"
                          onClick={() => {
                            if (confirm("放弃本次专注？本次时长不计入统计。"))
                              void endFocus(true);
                          }}
                        >
                          放弃本次
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary focus-start"
                        onClick={() => startFocus()}
                      >
                        <Play size={16} /> 开始专注
                      </button>
                    )}
                    <small>计时在本机保留，结束后记录实际时长</small>
                  </section>
                  <section className="panel">
                    <div className="section-title">
                      <h2>即将到期</h2>
                      <button
                        className="text-button"
                        onClick={() => jump("members")}
                      >
                        全部 <ChevronRight size={13} />
                      </button>
                    </div>
                    {reminders.length ? (
                      reminders.slice(0, 4).map((m) => (
                        <button
                          className="reminder"
                          key={m.id}
                          onClick={() =>
                            setEditor({ kind: "memberDetail", item: m })
                          }
                        >
                          <span className="member-mini">
                            {m.name.slice(0, 1)}
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>{currentPeriod(m).end} 到期</small>
                          </span>
                          <b>{money(currentPeriod(m).amount)}</b>
                        </button>
                      ))
                    ) : (
                      <div className="gentle-empty">
                        <Coffee size={23} />
                        <p>暂时没有待处理的续费。</p>
                      </div>
                    )}
                  </section>
                  <button
                    className="month-peek"
                    onClick={() => {
                      setMonth(today().slice(0, 7));
                      jump("ledger");
                    }}
                  >
                    <span>
                      <Wallet size={16} /> 本月净支出
                    </span>
                    <strong>
                      {currentSummary.count
                        ? money(currentSummary.expense)
                        : "还没有记录"}
                    </strong>
                    <small>
                      记下第一笔，让花费更清楚 <ArrowUpRight size={14} />
                    </small>
                  </button>
                </aside>
              </div>
            </>
          )}
          {page === "plan" && (
            <>
              <div className="toolbar">
                <div className="tabs">
                  {[
                    "全部任务",
                    "日历",
                    "倒计时",
                    "重要",
                    "收集箱",
                    "四象限",
                    "便签",
                    "专注记录",
                  ].map((t) => (
                    <button
                      key={t}
                      className={planTab === t ? "selected" : ""}
                      onClick={() => setPlanTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {planTab === "日历" ? (
                <Calendar
                  tasks={calendarTasks}
                  onEdit={openCalendarTask}
                  onCreate={createCalendarTask}
                  onMove={moveCalendarTask}
                />
              ) : planTab === "倒计时" ? (
                <>
                  <button
                    className="secondary"
                    onClick={() => setEditor({ kind: "countdown" })}
                  >
                    <Plus size={16} /> 新建倒计时
                  </button>
                  <div className="note-grid">
                    {active(data.countdowns)
                      .filter((c) => matches(c.title))
                      .sort(
                        (a, b) =>
                          Number(a.closed) - Number(b.closed) ||
                          a.target.localeCompare(b.target),
                      )
                      .map((c) => (
                        <article className="note-card" key={c.id}>
                          <button
                            className="text-left"
                            onClick={() =>
                              setEditor({ kind: "countdown", item: c })
                            }
                          >
                            <Timer size={20} />
                            <h3>{c.title}</h3>
                            <strong className="countdown-value">
                              {c.closed
                                ? "已关闭"
                                : new Date(c.target).getTime() <= tick
                                  ? "已到期"
                                  : `${Math.floor((new Date(c.target).getTime() - tick) / 86400000)} 天 ${Math.floor(((new Date(c.target).getTime() - tick) % 86400000) / 3600000)} 小时 ${Math.floor(((Date.parse(c.target) - tick) % 3600000) / 60000)} 分`}
                            </strong>
                            <p>
                              {stamp(c.target)}
                              {c.repeatDays > 0
                                ? ` · 每 ${c.repeatDays} 天重复`
                                : ""}
                            </p>
                          </button>
                          <div className="card-footer">
                            {!c.closed && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  run(
                                    () =>
                                      change((d) =>
                                        closeCountdown(
                                          d.countdowns.find(
                                            (x) => x.id === c.id,
                                          )!,
                                        ),
                                      ),
                                    c.repeatDays
                                      ? "已记录并进入下个周期"
                                      : "倒计时已关闭",
                                  )
                                }
                              >
                                {c.repeatDays ? "完成本次" : "关闭倒计时"}
                              </button>
                            )}
                            <button
                              className="icon-btn"
                              aria-label={`删除倒计时 ${c.title}`}
                              onClick={() => remove("countdowns", c.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          {c.history.length > 0 && (
                            <details>
                              <summary>完成历史（{c.history.length}）</summary>
                              {c.history
                                .slice()
                                .reverse()
                                .map((h, i) => (
                                  <p key={i}>
                                    {stamp(h.target)} → {stamp(h.closedAt)} 完成
                                  </p>
                                ))}
                            </details>
                          )}
                        </article>
                      ))}
                  </div>
                  {!active(data.countdowns).length && (
                    <Empty title="给重要日子留个提醒">
                      创建截止时间，可按天循环并保留完成历史。
                    </Empty>
                  )}
                </>
              ) : planTab === "便签" ? (
                <>
                  <button
                    className="secondary"
                    onClick={() => setEditor({ kind: "note" })}
                  >
                    <Plus size={16} /> 新建便签
                  </button>
                  <div className="note-grid">
                    {notes
                      .filter((n) => matches(n.title, n.body))
                      .map((n) => (
                        <article className="note-card" key={n.id}>
                          <button
                            className="text-left"
                            onClick={() => setEditor({ kind: "note", item: n })}
                          >
                            <NotebookPen size={19} />
                            <h3>{n.title}</h3>
                            <p>{n.body || "点击添加内容"}</p>
                          </button>
                          <div className="card-footer">
                            <span>{stamp(n.updatedAt)}</span>
                            <button
                              className="icon-btn"
                              aria-label={`删除便签 ${n.title}`}
                              onClick={() => remove("notes", n.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!notes.length && (
                    <Empty title="给想法留个位置">
                      便签可以保存文字和资料，随时回来整理。
                    </Empty>
                  )}
                </>
              ) : planTab === "专注记录" ? (
                <section className="panel">
                  {active(data.focuses).length ? (
                    active(data.focuses)
                      .slice()
                      .reverse()
                      .map((f) => (
                        <div className="history-row" key={f.id}>
                          <Timer size={18} />
                          <strong>{f.title}</strong>
                          <span>{f.date}</span>
                          <b>
                            {Math.floor(f.seconds / 60)} 分 {f.seconds % 60} 秒
                          </b>
                        </div>
                      ))
                  ) : (
                    <Empty title="你的专注会在这里留下痕迹">
                      从今天页或任务旁开始一次专注。
                    </Empty>
                  )}
                </section>
              ) : planTab === "四象限" ? (
                <div className="quadrant-grid">
                  {Object.entries(quadrants).map(([q, label]) => (
                    <section className={`panel quadrant q-${q}`} key={q}>
                      <h2>{label}</h2>
                      {taskRows(
                        tasks.filter(
                          (t) =>
                            !t.done &&
                            t.quadrant === q &&
                            matches(t.title, t.description),
                        ),
                        true,
                      )}
                      {!tasks.some((t) => !t.done && t.quadrant === q) && (
                        <p className="inline-empty">
                          暂无任务 · 编辑任务可调整归类
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <section className="panel plan-panel">
                  {quickAdd}
                  {taskRows(
                    tasks.filter(
                      (t) =>
                        matches(t.title, t.description, t.list) &&
                        (planTab === "重要"
                          ? t.important
                          : planTab === "收集箱"
                            ? !t.date
                            : true),
                    ),
                  )}
                  {!tasks.length && (
                    <Empty title="先记下来，再慢慢安排">
                      输入名称就能创建任务，日期和细节可以之后补充。
                    </Empty>
                  )}
                </section>
              )}
            </>
          )}
          {page === "habits" && (
            <>
              <div className="habit-intro">
                <Sprout size={22} />
                <p>
                  <strong>坚持不必完美。</strong>{" "}
                  完成、跳过、未完成与未记录，都是不同的状态。
                </p>
                <span>{habits.length} 个每日习惯</span>
              </div>
              {habitCards()}
              {!habits.length && (
                <Empty
                  title="从一个容易做到的小习惯开始"
                  action={
                    <button
                      className="primary"
                      onClick={() => setEditor({ kind: "habit" })}
                    >
                      <Plus size={16} /> 创建第一个习惯
                    </button>
                  }
                >
                  例如：读 10 页书、散步 15 分钟，或睡前整理桌面。
                </Empty>
              )}
              <div className="habit-legend">
                <span>
                  <i className="done" />
                  已完成
                </span>
                <span>
                  <i className="skipped" />
                  已跳过
                </span>
                <span>
                  <i className="missed" />
                  未完成
                </span>
                <span>
                  <i />
                  未记录
                </span>
                <small>跳过不增加连续天数；历史未记录会中断连续段。</small>
              </div>
            </>
          )}
          {page === "ledger" && (
            <>
              <div className="toolbar">
                <label className="month-filter">
                  统计月份{" "}
                  <input
                    type="month"
                    aria-label="统计月份"
                    value={month}
                    onChange={(e) => e.target.value && setMonth(e.target.value)}
                  />
                </label>
                <span className="hint">人民币 CNY · 按交易日期统计</span>
              </div>
              {metrics(summary)}
              <div className="ledger-grid">
                <section className="panel ledger-list">
                  <div className="section-title">
                    <h2>账单明细</h2>
                    <span>{month}</span>
                  </div>
                  <div className="filters">
                    <select
                      aria-label="筛选账单类型"
                      value={ledgerType}
                      onChange={(e) => setLedgerType(e.target.value)}
                    >
                      <option>全部</option>
                      {Object.entries(types).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="筛选分类"
                      value={ledgerCategory}
                      onChange={(e) => setLedgerCategory(e.target.value)}
                    >
                      <option>全部</option>
                      {[
                        ...new Set(active(data.entries).map((e) => e.category)),
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const rows = active(data.entries)
                      .filter(
                        (e) =>
                          e.status === "posted" &&
                          e.date.startsWith(month) &&
                          (ledgerCategory === "全部" ||
                            e.category === ledgerCategory) &&
                          (ledgerType === "全部" || e.kind === ledgerType) &&
                          matches(e.merchant, e.note, e.category, e.account),
                      )
                      .sort(
                        (a, b) =>
                          b.date.localeCompare(a.date) ||
                          b.updatedAt.localeCompare(a.updatedAt),
                      );
                    return rows.length ? (
                      rows.map((e) => (
                        <div className="entry-row" key={e.id}>
                          <span className={`entry-icon ${e.kind}`}>
                            {e.kind === "income" || e.kind === "refund" ? (
                              <ArrowDownLeft size={19} />
                            ) : (
                              <ArrowUpRight size={19} />
                            )}
                          </span>
                          <button
                            className="text-left entry-description"
                            onClick={() =>
                              setEditor({ kind: "entry", item: e })
                            }
                          >
                            <strong>{e.merchant || e.category}</strong>
                            <small>
                              {e.date} · {types[e.kind]} · {e.category} ·{" "}
                              {e.account}
                              {e.toAccount && ` → ${e.toAccount}`}
                            </small>
                            {e.note && <small>{e.note}</small>}
                          </button>
                          <b
                            className={
                              e.kind === "income" || e.kind === "refund"
                                ? "positive"
                                : ""
                            }
                          >
                            {e.kind === "expense"
                              ? "−"
                              : e.kind === "transfer"
                                ? ""
                                : "+"}
                            {money(e.amount)}
                          </b>
                          <button
                            className="icon-btn"
                            aria-label={`删除账单 ${e.merchant || e.category}`}
                            onClick={() => remove("entries", e.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <Empty title="本周期暂无匹配账单">
                        点击“记一笔”，记录第一笔收支。
                      </Empty>
                    );
                  })()}
                </section>
                <aside className="panel category-panel">
                  <div className="section-title">
                    <h2>支出分类</h2>
                    <LayoutGrid size={16} />
                  </div>
                  {Object.entries(summary.categories).length ? (
                    Object.entries(summary.categories)
                      .sort((a, b) => b[1] - a[1])
                      .map(([c, v], i) => (
                        <button
                          className="category-row"
                          key={c}
                          onClick={() => {
                            setLedgerCategory(c);
                            setLedgerType("全部");
                          }}
                        >
                          <span>
                            <i
                              style={{
                                background: [
                                  "#527c65",
                                  "#9ba980",
                                  "#d6b779",
                                  "#a4b8bd",
                                  "#b7a2bb",
                                ][i % 5],
                              }}
                            />
                            {c}
                            <b>{money(v)}</b>
                          </span>
                          <div className="bar-track">
                            <i
                              style={{
                                width: `${(Math.abs(v) / Math.max(1, ...Object.values(summary.categories).map(Math.abs))) * 100}%`,
                              }}
                            />
                          </div>
                        </button>
                      ))
                  ) : (
                    <div className="gentle-empty">
                      <Wallet size={24} />
                      <p>有了记录，分类就会清晰起来。</p>
                    </div>
                  )}
                  <p className="hint">
                    支出减关联退款；跨月退款抵扣退款发生月。点击分类可筛选明细。待确认、已忽略与转账不参与。
                  </p>
                </aside>
              </div>
            </>
          )}
          {page === "members" && (
            <>
              <div className="member-summary">
                <div>
                  <span>使用中的会员</span>
                  <strong>
                    {
                      members.filter(
                        (m) =>
                          m.status === "active" &&
                          currentPeriod(m).end > today(),
                      ).length
                    }
                    <small> 个</small>
                  </strong>
                </div>
                <div>
                  <span>预计月成本 · CNY</span>
                  <strong>
                    {money(
                      members
                        .filter(
                          (m) =>
                            m.status === "active" &&
                            currentPeriod(m).end > today(),
                        )
                        .reduce((s, m) => s + memberCosts(m).monthly, 0),
                    )}
                  </strong>
                </div>
                <div>
                  <span>待处理到期提醒</span>
                  <strong>
                    {reminders.length}
                    <small> 项</small>
                  </strong>
                </div>
              </div>
              <p className="hint">
                预计月成本为使用中且未到期会员的周期费用 ÷
                月数，不代表实际扣款。
              </p>
              <div className="member-grid">
                {members
                  .filter((m) => matches(m.name, m.note))
                  .sort((a, b) =>
                    currentPeriod(a).end.localeCompare(currentPeriod(b).end),
                  )
                  .map(memberCard)}
              </div>
              {!members.length && (
                <Empty
                  title="让续费，不再突然出现"
                  action={
                    <button
                      className="primary"
                      onClick={() => setEditor({ kind: "member" })}
                    >
                      添加第一项会员
                    </button>
                  }
                >
                  音乐、视频、软件、健身……记下周期与费用，到期前回来处理。
                </Empty>
              )}
            </>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <ReminderSettings />
              <DeviceSettings config={config} />
              <section className="panel">
                <div className="section-title">
                  <h2>
                    <ShieldCheck size={19} /> 保存与同步
                  </h2>
                  <span className="badge">开发预览版 0.2</span>
                </div>
                <div className="setting-line">
                  <span>本地保存</span>
                  <b>{stamp(vault.savedAt)}</b>
                </div>
                <div className="setting-line">
                  <span>同步状态</span>
                  <b>
                    {!vault.endpoint
                      ? "未连接，仅本机"
                      : conflict
                        ? "需要处理冲突"
                        : vault.dirty
                          ? "存在待同步修改"
                          : "上次同步完成"}
                  </b>
                </div>
                <div className="setting-line">
                  <span>最近同步</span>
                  <b>{stamp(vault.syncedAt)}</b>
                </div>
                <p className="hint">
                  离线可记录。同步需自行部署服务，在两端输入同一访问令牌和密钥。凭据仅保留至页面关闭；不会在后台自动同步。
                </p>
                <Field label="同步服务地址">
                  <input
                    value={config.endpoint}
                    onChange={(e) =>
                      setConfig({ ...config, endpoint: e.target.value })
                    }
                    placeholder="https://你的域名/api/sync"
                  />
                </Field>
                <Field label="访问令牌">
                  <input
                    type="password"
                    autoComplete="off"
                    value={config.token}
                    onChange={(e) =>
                      setConfig({ ...config, token: e.target.value })
                    }
                  />
                </Field>
                <Field label="同步密钥（64 位十六进制）">
                  <input
                    type="password"
                    autoComplete="off"
                    value={config.key}
                    onChange={(e) =>
                      setConfig({ ...config, key: e.target.value })
                    }
                  />
                </Field>
                <div className="inline-actions wrap">
                  <button
                    className="secondary"
                    onClick={() => {
                      if (
                        config.key &&
                        !confirm(
                          "生成新密钥不能解密旧账库。仅在首次配置时生成，继续？",
                        )
                      )
                        return;
                      const key = generateKey();
                      setConfig({ ...config, key });
                      void exportText(
                        "SELF-sync-key.txt",
                        key,
                        "text/plain",
                      ).catch((e) => setError(e.message));
                      setMessage(
                        "密钥已下载，请妥善保存；另一设备需要相同密钥",
                      );
                    }}
                  >
                    首次生成密钥
                  </button>
                  <button
                    className="primary"
                    disabled={syncBusy || !config.key || !config.token}
                    onClick={() => void sync()}
                  >
                    <RefreshCw
                      size={16}
                      className={syncBusy ? "spinning" : ""}
                    />
                    {syncBusy ? "同步中…" : "立即同步"}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setConfig({ ...config, token: "", key: "" });
                      setConflict(null);
                      setMessage(
                        "连接凭据已清除，不再发起同步；本机与远端数据保留",
                      );
                    }}
                  >
                    断开连接
                  </button>
                </div>
                <p className="hint">
                  传输前在本机加密。当前本地数据库与 JSON
                  备份为明文。没有服务器时可以一直使用本地模式。
                </p>
              </section>
              <section className="panel">
                <div className="section-title">
                  <h2>
                    <Download size={19} /> 备份与恢复
                  </h2>
                </div>
                <p>
                  导出包含任务、习惯、账单、会员、便签、专注记录及回收站。备份为明文
                  JSON，请自行保管。
                </p>
                <button className="secondary" onClick={() => download(data)}>
                  <Download size={16} /> 导出全部数据
                </button>
                <label className="file-button">
                  选择 SELF 备份文件
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file)
                        void run(async () => {
                          if (file.size > 10 * 1024 * 1024)
                            throw new Error("备份超过 10 MB，暂不支持");
                          const parsed = JSON.parse(await file.text());
                          if (parsed.app !== "SELF")
                            throw new Error("请选择 SELF 导出的备份");
                          setImportData(validateData(parsed.data));
                        }, "备份已验证，请查看恢复预览");
                    }}
                  />
                </label>
                <p className="hint">
                  恢复前会验证字段和金额关系，并自动备份当前版本。
                </p>
                <div className="section-title">
                  <h3>历史版本备份</h3>
                  <span>{backups.length}</span>
                </div>
                {backups.length ? (
                  backups.map((b) => (
                    <div className="backup-row" key={b.id}>
                      <span>
                        <strong>{b.reason}</strong>
                        <small>{stamp(b.createdAt)}</small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() => download(b.data, "self-history")}
                      >
                        导出
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="inline-empty">
                    发生恢复或同步覆盖时，原版本会保存在这里。
                  </p>
                )}
              </section>
              <section className="panel">
                <div className="section-title">
                  <h2>
                    <Trash2 size={19} /> 回收站
                  </h2>
                  <span>{deleted.length} 项</span>
                </div>
                {deleted.length ? (
                  deleted.map(({ collection, item }) => (
                    <div className="backup-row" key={item.id}>
                      <span>
                        <strong>
                          {"title" in item
                            ? item.title
                            : "name" in item
                              ? item.name
                              : "merchant" in item
                                ? item.merchant || item.category
                                : "记录"}
                        </strong>
                        <small>{stamp(item.deletedAt!)}</small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          run(
                            () =>
                              change((d) => {
                                const r = d[collection].find(
                                  (x) => x.id === item.id,
                                )!;
                                r.deletedAt = null;
                                r.updatedAt = new Date().toISOString();
                              }),
                            "已恢复",
                          )
                        }
                      >
                        恢复
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="inline-empty">
                    回收站为空，删除的记录可以在这里恢复。
                  </p>
                )}
                <p className="hint">
                  存在关联退款时需先恢复原支出，保持账目关系完整。
                </p>
              </section>
              <section className="panel">
                <div className="section-title">
                  <h2>
                    <CircleHelp size={19} /> 提醒与版本范围
                  </h2>
                </div>
                <p>
                  本版支持任务、倒计时、会员和专注的系统提醒，请在上方主动开启。支付识别和运动数据尚未接入。
                </p>
                <p className="hint">
                  暂停或取消会员会停止后续提醒。浏览器关闭页面、Windows
                  退出托盘、手机强行停止或限制后台均会影响通知。当前支持人民币，不汇总其他币种。
                </p>
                <div className="danger-zone">
                  <h3>清空当前账库</h3>
                  <p>
                    永久清空本机记录、回收站及历史备份。若已绑定同步服务，清空操作需再次同步才会更新远端；其他设备仍可能留有副本。
                  </p>
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (
                        !confirm(
                          "将永久清空本机全部业务记录、回收站与历史备份。建议先导出。继续？",
                        )
                      )
                        return;
                      if (
                        prompt(
                          "输入“清空自明”确认。此操作无法从产品内恢复。",
                        ) !== "清空自明"
                      )
                        return;
                      void run(
                        () =>
                          db.transaction(
                            "rw",
                            db.vault,
                            db.backups,
                            async () => {
                              const v = (await db.vault.get("main"))!;
                              await db.vault.put({
                                ...v,
                                data: emptyData(),
                                dirty: true,
                                localVersion: v.localVersion + 1,
                                savedAt: new Date().toISOString(),
                              });
                              await db.backups.clear();
                              setConflict(null);
                            },
                          ),
                        "本机账库已清空；若需更新远端，请手动同步",
                      );
                    }}
                  >
                    清空全部本机数据
                  </button>
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>自明 SELF</span>
            <span>把注意力，留给重要的事。</span>
            <small>
              {vault.dirty
                ? "本机修改已保存"
                : vault.savedAt
                  ? "本地数据可用"
                  : "从第一条记录开始"}{" "}
              · {stamp(vault.savedAt)}
            </small>
          </footer>
        </main>
      </div>
      {focus && page !== "today" && (
        <button className="floating-focus" onClick={() => jump("today")}>
          <Timer size={18} />
          {focus.title} · {Math.floor(remaining / 60)}:
          {String(remaining % 60).padStart(2, "0")} <ChevronRight size={16} />
        </button>
      )}
      {(message || error || pending > 0) && (
        <div
          className={`toast ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error ? <CircleHelp size={18} /> : <CheckCheck size={18} />}
          <span>
            {error || (pending > 0 ? "正在处理，请等待保存完成…" : message)}
          </span>
          <button
            className="icon-btn"
            aria-label="关闭提示"
            onClick={() => {
              setError("");
              setMessage("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editor && (
        <Modal
          title={
            editor.kind === "task"
              ? editor.item
                ? "编辑任务"
                : "新增任务"
              : editor.kind === "entry"
                ? editor.item
                  ? "编辑账单"
                  : "记一笔"
                : editor.kind === "habit"
                  ? editor.item
                    ? "编辑习惯"
                    : "建立一个小习惯"
                  : editor.kind === "countdown"
                    ? editor.item
                      ? "编辑倒计时"
                      : "新建倒计时"
                    : editor.kind === "note"
                      ? editor.item
                        ? "编辑便签"
                        : "新建便签"
                      : editor.kind === "renew"
                        ? `续费 · ${editor.item.name}`
                        : editor.kind === "memberDetail"
                          ? editor.item.name
                          : editor.item
                            ? "编辑会员"
                            : "新增会员"
          }
          onClose={() => setEditor(null)}
        >
          {editor.kind === "task" && (
            <TaskForm
              task={editor.item}
              date={editor.date ?? (page === "today" ? day : undefined)}
              start={editor.start}
              onSave={async (t, scope) => {
                await change((d) =>
                  editTask(d, t, scope, editor.item?.updatedAt),
                );
                setEditor(null);
                setMessage("任务已保存，重复历史已保留");
              }}
            />
          )}
          {editor.kind === "countdown" && (
            <CountdownForm
              item={editor.item}
              onSave={(c) => save("countdowns", c)}
            />
          )}
          {editor.kind === "entry" && (
            <EntryForm
              entry={editor.item}
              data={data}
              onSave={(e) => save("entries", e)}
            />
          )}
          {editor.kind === "habit" && (
            <HabitForm habit={editor.item} onSave={(h) => save("habits", h)} />
          )}
          {editor.kind === "note" && (
            <NoteForm note={editor.item} onSave={(n) => save("notes", n)} />
          )}
          {editor.kind === "member" && (
            <MemberForm
              member={editor.item}
              onSave={(m) => save("members", m)}
            />
          )}
          {editor.kind === "renew" && (
            <RenewForm
              member={editor.item}
              onSave={async (amount, start, create) => {
                await change((d) =>
                  renewMember(d, editor.item.id, amount, start, create),
                );
                setEditor(null);
                setMessage("续费已记录，上一周期已保留");
              }}
            />
          )}
          {editor.kind === "memberDetail" &&
            (() => {
              const m =
                members.find((x) => x.id === editor.item.id) || editor.item;
              return (
                <div className="member-detail">
                  {memberCard(m)}
                  <div className="inline-actions wrap">
                    <button
                      className="primary"
                      onClick={() => setEditor({ kind: "renew", item: m })}
                    >
                      记录续费
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setEditor({ kind: "member", item: m })}
                    >
                      编辑信息
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        run(
                          () =>
                            change((d) => {
                              const r = d.members.find((x) => x.id === m.id)!;
                              r.status =
                                r.status === "paused" ? "active" : "paused";
                              r.updatedAt = new Date().toISOString();
                            }),
                          m.status === "paused"
                            ? "已恢复提醒"
                            : "已暂停后续提醒",
                        )
                      }
                    >
                      {m.status === "paused" ? "恢复使用" : "暂停会员"}
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        run(
                          () =>
                            change((d) => {
                              const r = d.members.find((x) => x.id === m.id)!;
                              r.snoozeUntil = addDays(today(), 3);
                              r.updatedAt = new Date().toISOString();
                            }),
                          "到期提醒已推迟 3 天",
                        )
                      }
                    >
                      推迟提醒 3 天
                    </button>
                  </div>
                  <p className="hint">
                    周期按开始日计入、结束日不计入；日均费用 = 本周期支付 ÷
                    实际服务天数。
                  </p>
                  <h3>续费历史</h3>
                  {m.periods
                    .slice()
                    .reverse()
                    .map((p) => (
                      <div className="period-row" key={p.id}>
                        <span>
                          {p.start} → {p.end}
                          <small>
                            {daysBetween(p.start, p.end)} 天 ·{" "}
                            {p.entryId
                              ? "续费时已创建关联账单"
                              : "未创建关联账单"}
                          </small>
                        </span>
                        <b>{money(p.amount)}</b>
                      </div>
                    ))}
                  <div className="inline-actions wrap">
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (
                          confirm(
                            "标记会员已取消并停止提醒？实际自动扣款需在服务商处关闭。",
                          )
                        )
                          void run(
                            () =>
                              change((d) => {
                                const r = d.members.find((x) => x.id === m.id)!;
                                r.status = "cancelled";
                                r.autoRenew = false;
                                r.updatedAt = new Date().toISOString();
                              }),
                            "已标记取消，历史记录保留",
                          );
                      }}
                    >
                      标记已取消
                    </button>
                    <button
                      className="text-button muted"
                      onClick={() => {
                        void remove("members", m.id);
                        setEditor(null);
                      }}
                    >
                      移入回收站
                    </button>
                  </div>
                </div>
              );
            })()}
        </Modal>
      )}
      {habitLog && (
        <Modal
          title={`${habitLog.habit.name} · ${habitLog.date}`}
          onClose={() => setHabitLog(null)}
        >
          <div className="habit-log-options">
            {[
              ["done", "完成了", "今天的小进步"],
              ["skipped", "跳过这一天", "休息也是计划的一部分"],
              ["missed", "没有完成", "如实记录，明天再来"],
              ["unknown", "恢复未记录", "清除这天的打卡状态"],
            ].map(([state, label, desc]) => (
              <button
                key={state}
                onClick={() =>
                  void run(async () => {
                    await change((d) => {
                      const h = d.habits.find(
                        (x) => x.id === habitLog.habit.id,
                      )!;
                      if (state === "unknown") delete h.logs[habitLog.date];
                      else
                        h.logs[habitLog.date] = state as
                          "done" | "skipped" | "missed";
                      h.updatedAt = new Date().toISOString();
                    });
                    setHabitLog(null);
                  }, "打卡记录已保存")
                }
              >
                <strong>{label}</strong>
                <small>{desc}</small>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {importData && (
        <Modal title="恢复备份预览" onClose={() => setImportData(null)}>
          <div className="restore-preview">
            <p>
              有效记录：
              {collections.reduce((s, k) => s + importData[k].length, 0)}{" "}
              条。任务 {importData.tasks.length}、习惯{" "}
              {importData.habits.length}、账单 {importData.entries.length}、会员{" "}
              {importData.members.length}。
            </p>
            <p>
              将替换当前账库，不是追加导入；当前版本会先备份。此操作产生待同步修改。
            </p>
            <button
              className="primary"
              onClick={() => {
                if (confirm("确认用此备份替换当前账库？"))
                  void run(async () => {
                    await replaceData(
                      { ...importData, timer: null },
                      "恢复备份前的本机版本",
                    );
                    setImportData(null);
                  }, "备份已恢复");
              }}
            >
              确认恢复
            </button>
          </div>
        </Modal>
      )}
      <ReminderService data={data} />
      <AppUpdate
        busy={
          !!editor ||
          pending > 0 ||
          syncBusy ||
          !!conflict ||
          !!importData ||
          !!habitLog
        }
      />
      {conflict && (
        <ConflictPanel
          conflict={conflict}
          config={config}
          onClose={() => setConflict(null)}
          onDone={() => {
            setConflict(null);
            setMessage("逐条冲突已处理，两端原版本已备份");
          }}
        />
      )}
    </div>
  );
}
