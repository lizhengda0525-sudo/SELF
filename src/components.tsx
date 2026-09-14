import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { X, Inbox } from "lucide-react";
import {
  active,
  addMonths,
  currentPeriod,
  metadata,
  parseMoney,
  today,
  type Data,
  type Task,
  type Entry,
  type Member,
  type Habit,
  type Note,
  type Countdown,
} from "./domain";
import { type RepeatScope } from "./planning";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    d.querySelector<HTMLElement>(
      'input:not([type="checkbox"]), textarea',
    )?.focus();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header className="modal-header">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Form({
  children,
  onSave,
  saveLabel = "保存",
}: {
  children: ReactNode;
  onSave: (f: FormData) => Promise<void>;
  saveLabel?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [busy]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(new FormData(e.currentTarget));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "保存失败，本次修改尚未写入，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="editor-form">
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="form-footer">
        <span>保存到本机 · 可离线使用</span>
        <button className="primary" disabled={busy}>
          {busy ? "正在保存…" : saveLabel}
        </button>
      </footer>
    </form>
  );
}
const str = (f: FormData, k: string) => String(f.get(k) || "").trim();
export function TaskForm({
  task,
  date,
  start,
  onSave,
}: {
  task?: Task;
  date?: string;
  start?: string;
  onSave: (t: Task, scope: RepeatScope) => Promise<void>;
}) {
  const [scope, setScope] = useState<RepeatScope>("single");
  const [frequency, setFrequency] = useState(task?.repeat?.frequency || "none");
  return (
    <Form
      onSave={async (f) =>
        onSave(
          {
            ...task,
            ...(task ? { updatedAt: new Date().toISOString() } : metadata()),
            title: str(f, "title"),
            description: str(f, "description"),
            list: str(f, "list"),
            date: str(f, "date"),
            start: str(f, "start"),
            duration: Number(f.get("duration")),
            done: task?.done || false,
            important: f.has("important"),
            quadrant: str(f, "quadrant") as Task["quadrant"],
            repeat:
              task?.repeat && scope === "single"
                ? task.repeat
                : frequency === "none"
                  ? null
                  : {
                      frequency,
                      interval: Number(f.get("interval") || 1),
                      until: str(f, "until"),
                      anchor: Number(str(f, "date").slice(8)),
                    },
            reminderMinutes:
              str(f, "reminder") === "" ? [] : [Number(str(f, "reminder"))],
          } as Task,
          scope,
        )
      }
    >
      <Field label="任务名称">
        <input
          name="title"
          defaultValue={task?.title}
          placeholder="想做什么？"
          maxLength={100}
          required
          autoFocus
        />
      </Field>
      <div className="form-grid">
        <Field label="日期">
          <input name="date" type="date" defaultValue={task?.date ?? date} />
        </Field>
        <Field label="开始时间（可选）">
          <input name="start" type="time" defaultValue={task?.start ?? start} />
        </Field>
        <Field label="预计分钟">
          <input
            name="duration"
            type="number"
            min="5"
            max="1440"
            defaultValue={task?.duration || 25}
            required
          />
        </Field>
        <Field label="清单">
          <input
            name="list"
            list="task-lists"
            defaultValue={task?.list || "收集箱"}
            maxLength={100}
            required
          />
          <datalist id="task-lists">
            <option>工作</option>
            <option>个人</option>
            <option>学习</option>
            <option>收集箱</option>
          </datalist>
        </Field>
      </div>
      {task?.repeat && (
        <Field label="本次修改范围">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as RepeatScope)}
          >
            <option value="single">仅这一次（后续仍按原规则）</option>
            <option value="following">本次及以后（保留已完成历史）</option>
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="重复规则">
          <select
            name="frequency"
            value={frequency}
            disabled={!!task?.repeat && scope === "single"}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
          >
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekdays">工作日</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </Field>
        <Field label="提醒">
          <select
            name="reminder"
            defaultValue={task?.reminderMinutes?.[0] ?? ""}
          >
            <option value="">不提醒</option>
            <option value="0">开始时（全天任务上午 9 点）</option>
            <option value="5">提前 5 分钟</option>
            <option value="15">提前 15 分钟</option>
            <option value="60">提前 1 小时</option>
            <option value="1440">提前 1 天</option>
          </select>
        </Field>
      </div>
      {frequency !== "none" && (
        <div className="form-grid">
          <Field label="重复间隔">
            <input
              name="interval"
              type="number"
              min="1"
              max="365"
              defaultValue={task?.repeat?.interval || 1}
              disabled={!!task?.repeat && scope === "single"}
              required
            />
          </Field>
          <Field label="重复截至（可选）">
            <input
              name="until"
              type="date"
              defaultValue={task?.repeat?.until}
              disabled={!!task?.repeat && scope === "single"}
            />
          </Field>
        </div>
      )}
      <Field label="四象限">
        <select name="quadrant" defaultValue={task?.quadrant || "none"}>
          <option value="none">未归类</option>
          <option value="iu">重要且紧急</option>
          <option value="in">重要不紧急</option>
          <option value="nu">不重要但紧急</option>
          <option value="nn">不重要不紧急</option>
        </select>
      </Field>
      <label className="check-field">
        <input
          name="important"
          type="checkbox"
          defaultChecked={task?.important}
        />
        标记为重要
      </label>
      <Field label="备注">
        <textarea
          name="description"
          defaultValue={task?.description}
          rows={3}
          maxLength={10000}
          placeholder="补充细节，让行动更容易"
        />
      </Field>
      {!!task?.completionHistory?.length && (
        <details>
          <summary>实际完成历史（{task.completionHistory.length}）</summary>
          {task.completionHistory.map((at, i) => (
            <p key={i}>{new Date(at).toLocaleString("zh-CN")}</p>
          ))}
        </details>
      )}
      {frequency !== "none" && (
        <p className="hint">
          完成本次后生成下一次；恢复未完成会保留历史时间。重复间隔按所选规则计数，工作日跳过周六、周日。
        </p>
      )}
    </Form>
  );
}

export function CountdownForm({
  item,
  onSave,
}: {
  item?: Countdown;
  onSave: (c: Countdown) => Promise<void>;
}) {
  const target = item ? new Date(item.target) : new Date(Date.now() + 86400000);
  const local = new Date(target.getTime() - target.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return (
    <Form
      onSave={async (f) =>
        onSave({
          ...item,
          ...(item ? { updatedAt: new Date().toISOString() } : metadata()),
          title: str(f, "title"),
          target: new Date(str(f, "target")).toISOString(),
          closed: false,
          repeatDays: Number(f.get("repeatDays")),
          reminderMinutes: Number(f.get("reminderMinutes")),
          history: item?.history || [],
        } as Countdown)
      }
    >
      <Field label="倒计时名称">
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={item?.title}
          autoFocus
          placeholder="例如：证件到期、项目截止"
        />
      </Field>
      <Field label="目标日期与时间">
        <input
          name="target"
          type="datetime-local"
          defaultValue={local}
          required
        />
      </Field>
      <div className="form-grid">
        <Field label="提前提醒（分钟）">
          <input
            name="reminderMinutes"
            type="number"
            min="0"
            max="43200"
            defaultValue={item?.reminderMinutes || 0}
            required
          />
        </Field>
        <Field label="关闭后重复间隔（天，0 为不重复）">
          <input
            name="repeatDays"
            type="number"
            min="0"
            max="3650"
            defaultValue={item?.repeatDays || 0}
            required
          />
        </Field>
      </div>
      <p className="hint">
        到期后保留记录。关闭本次后才生成下一次；已到期时可以延后目标时间。
      </p>
    </Form>
  );
}
export const categories = [
  "餐饮",
  "交通",
  "购物",
  "居住",
  "通信",
  "娱乐",
  "医疗健康",
  "学习",
  "人情往来",
  "会员订阅",
  "工资",
  "其他",
];
export function EntryForm({
  entry,
  data,
  onSave,
}: {
  entry?: Entry;
  data: Data;
  onSave: (e: Entry) => Promise<void>;
}) {
  const [kind, setKind] = useState<Entry["kind"]>(entry?.kind || "expense");
  const accounts = [
    ...new Set([
      "默认账户",
      "现金",
      "银行卡",
      "微信",
      "支付宝",
      ...active(data.entries)
        .flatMap((e) => [e.account, e.toAccount])
        .filter(Boolean),
    ]),
  ];
  return (
    <Form
      onSave={async (f) =>
        onSave({
          ...entry,
          ...(entry ? { updatedAt: new Date().toISOString() } : metadata()),
          kind,
          amount: parseMoney(str(f, "amount")),
          currency: "CNY",
          date: str(f, "date"),
          category: str(f, "category"),
          account: str(f, "account"),
          toAccount: kind === "transfer" ? str(f, "toAccount") : "",
          merchant: str(f, "merchant"),
          note: str(f, "note"),
          refundOf: kind === "refund" ? str(f, "refundOf") : "",
          status: "posted",
        } as Entry)
      }
      saveLabel="保存账单"
    >
      <div className="segmented">
        {(["expense", "income", "transfer", "refund"] as const).map((k, i) => (
          <button
            key={k}
            type="button"
            className={kind === k ? "selected" : ""}
            onClick={() => setKind(k)}
          >
            {["支出", "收入", "转账", "退款"][i]}
          </button>
        ))}
      </div>
      <Field label="金额 · CNY">
        <div className="amount-input">
          <span aria-hidden="true">¥</span>
          <input
            name="amount"
            aria-label="金额 · CNY"
            inputMode="decimal"
            defaultValue={entry ? (entry.amount / 100).toFixed(2) : ""}
            placeholder="0.00"
            required
            autoFocus
          />
        </div>
      </Field>
      <div className="form-grid">
        <Field label="日期">
          <input
            name="date"
            type="date"
            defaultValue={entry?.date || today()}
            required
          />
        </Field>
        <Field label="分类">
          <input
            name="category"
            list="categories"
            defaultValue={entry?.category || "其他"}
            maxLength={100}
            required
          />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </datalist>
        </Field>
        <Field label={kind === "transfer" ? "转出账户" : "账户"}>
          <input
            name="account"
            list="accounts"
            defaultValue={entry?.account || "默认账户"}
            maxLength={100}
            required
          />
          <datalist id="accounts">
            {accounts.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </datalist>
        </Field>
        {kind === "transfer" ? (
          <Field label="转入账户">
            <input
              name="toAccount"
              list="accounts"
              defaultValue={entry?.toAccount}
              maxLength={100}
              required
            />
          </Field>
        ) : (
          <Field label="商户 / 对方">
            <input
              name="merchant"
              defaultValue={entry?.merchant}
              maxLength={100}
              placeholder="可选"
            />
          </Field>
        )}
      </div>
      {kind === "refund" && (
        <Field label="关联原支出">
          <select name="refundOf" defaultValue={entry?.refundOf || ""} required>
            <option value="">选择原支出</option>
            {active(data.entries)
              .filter((e) => e.kind === "expense" && e.status === "posted")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.date} · {e.merchant || e.category} · ¥
                  {(e.amount / 100).toFixed(2)}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="备注">
        <input
          name="note"
          defaultValue={entry?.note}
          maxLength={10000}
          placeholder="可选"
        />
      </Field>
      <p className="hint">转账不计入收支；退款按退款发生月抵扣支出。</p>
    </Form>
  );
}
export function MemberForm({
  member,
  onSave,
}: {
  member?: Member;
  onSave: (m: Member) => Promise<void>;
}) {
  return (
    <Form
      onSave={async (f) => {
        const start = str(f, "start"),
          months = Number(f.get("months")) as Member["months"];
        await onSave(
          member
            ? {
                ...member,
                name: str(f, "name"),
                autoRenew: f.has("autoRenew"),
                note: str(f, "note"),
                updatedAt: new Date().toISOString(),
              }
            : {
                ...metadata(),
                name: str(f, "name"),
                months,
                anchor: Number(start.slice(8)),
                status: "active",
                autoRenew: f.has("autoRenew"),
                snoozeUntil: "",
                note: str(f, "note"),
                periods: [
                  {
                    id: crypto.randomUUID(),
                    start,
                    end: addMonths(start, months),
                    amount: parseMoney(str(f, "amount")),
                    entryId: "",
                  },
                ],
              },
        );
      }}
    >
      <Field label="会员 / 周期服务名称">
        <input
          name="name"
          defaultValue={member?.name}
          placeholder="例如：音乐会员、云盘、健身房"
          required
          maxLength={100}
          autoFocus
        />
      </Field>
      {!member && (
        <>
          <div className="form-grid">
            <Field label="本周期已支付 · CNY">
              <input
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </Field>
            <Field label="计费周期">
              <select name="months" defaultValue="1">
                <option value="1">每月</option>
                <option value="3">每季度</option>
                <option value="12">每年</option>
              </select>
            </Field>
          </div>
          <Field label="本周期开始日">
            <input name="start" type="date" defaultValue={today()} required />
          </Field>
        </>
      )}
      <label className="check-field">
        <input
          type="checkbox"
          name="autoRenew"
          defaultChecked={member?.autoRenew}
        />
        已在服务商处开启自动续费
      </label>
      <Field label="备注">
        <textarea
          name="note"
          rows={3}
          defaultValue={member?.note}
          maxLength={10000}
        />
      </Field>
      <p className="hint">
        自明记录服务状态。取消实际扣款需到服务商处操作。新增会员不会自动生成账单。
      </p>
    </Form>
  );
}
export function RenewForm({
  member,
  onSave,
}: {
  member: Member;
  onSave: (amount: number, start: string, create: boolean) => Promise<void>;
}) {
  const p = currentPeriod(member);
  return (
    <Form
      onSave={async (f) =>
        onSave(
          parseMoney(str(f, "amount")),
          str(f, "start"),
          f.has("createEntry"),
        )
      }
      saveLabel="确认续费"
    >
      <p className="hint">
        上一周期 {p.start} 至 {p.end}，历史记录会保留。
      </p>
      <Field label="实际支付金额 · CNY">
        <input
          name="amount"
          inputMode="decimal"
          defaultValue={(p.amount / 100).toFixed(2)}
          required
          autoFocus
        />
      </Field>
      <Field label="新周期开始日">
        <input
          name="start"
          type="date"
          min={p.end}
          defaultValue={p.end}
          required
        />
      </Field>
      <label className="check-field">
        <input type="checkbox" name="createEntry" />
        同时记一笔今天支付的支出
      </label>
      <p className="hint">已经记过账时请勿勾选，避免重复入账。</p>
    </Form>
  );
}
export function HabitForm({
  habit,
  onSave,
}: {
  habit?: Habit;
  onSave: (h: Habit) => Promise<void>;
}) {
  return (
    <Form
      onSave={async (f) =>
        onSave({
          ...habit,
          ...(habit ? { updatedAt: new Date().toISOString() } : metadata()),
          name: str(f, "name"),
          description: str(f, "description"),
          start: habit?.start || today(),
          logs: habit?.logs || {},
        } as Habit)
      }
    >
      <Field label="每天想坚持的一件事">
        <input
          name="name"
          placeholder="例如：阅读 20 分钟"
          defaultValue={habit?.name}
          maxLength={100}
          required
          autoFocus
        />
      </Field>
      <Field label="给自己的提醒">
        <input
          name="description"
          defaultValue={habit?.description}
          placeholder="从小事开始，允许偶尔休息"
          maxLength={10000}
        />
      </Field>
      <p className="hint">
        首版支持每日习惯。每个日期可记录完成、跳过、未完成，或恢复未记录。
      </p>
    </Form>
  );
}
export function NoteForm({
  note,
  onSave,
}: {
  note?: Note;
  onSave: (n: Note) => Promise<void>;
}) {
  return (
    <Form
      onSave={async (f) =>
        onSave({
          ...note,
          ...(note ? { updatedAt: new Date().toISOString() } : metadata()),
          title: str(f, "title"),
          body: str(f, "body"),
        } as Note)
      }
    >
      <Field label="便签标题">
        <input
          name="title"
          defaultValue={note?.title}
          maxLength={100}
          required
          autoFocus
        />
      </Field>
      <Field label="正文">
        <textarea
          name="body"
          defaultValue={note?.body}
          rows={10}
          maxLength={10000}
          placeholder="记下想法，稍后整理。"
        />
      </Field>
    </Form>
  );
}
