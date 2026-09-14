import { useState } from "react";
import { Modal } from "./components";
import { download } from "./db";
import { mergeData, type Choice, type Row } from "./merge";
import { resolveSync, type SyncConfig, type SyncConflict } from "./sync";
const names: Record<string, string> = {
  tasks: "任务",
  entries: "账单",
  members: "会员",
  habits: "习惯",
  habitLogs: "打卡",
  notes: "便签",
  focuses: "专注",
  countdowns: "倒计时",
};
const fields: Record<string, string> = {
  title: "名称",
  name: "名称",
  date: "日期",
  start: "开始",
  duration: "分钟",
  description: "备注",
  body: "正文",
  amount: "金额（分）",
  done: "完成",
  status: "状态",
  target: "截止",
  deletedAt: "删除时间",
  updatedAt: "修改时间",
  repeat: "重复规则",
  refundOf: "关联支出",
};
function Preview({ row }: { row?: Row }) {
  return row ? (
    <dl className="record-preview">
      {Object.entries(row)
        .filter(([k, v]) => fields[k] && v !== "" && v !== null)
        .map(([k, v]) => (
          <div key={k}>
            <dt>{fields[k]}</dt>
            <dd>
              {typeof v === "object"
                ? JSON.stringify(v)
                : typeof v === "boolean"
                  ? v
                    ? "是"
                    : "否"
                  : String(v)}
            </dd>
          </div>
        ))}
    </dl>
  ) : (
    <p>此端无此记录（选择后不保留）</p>
  );
}
export function ConflictPanel({
  conflict,
  config,
  onClose,
  onDone,
}: {
  conflict: SyncConflict;
  config: SyncConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const preview = mergeData(
    conflict.base,
    conflict.localData,
    conflict.remoteData,
    choices,
  );
  return (
    <Modal title="逐条处理同步冲突" onClose={onClose}>
      <div className="conflict-body">
        <p>
          不同记录的修改会自动合并。同一记录的不同修改由你选择；应用前会备份两端版本。金额关联仍须通过校验。
        </p>
        <div className="inline-actions">
          <button
            className="secondary"
            onClick={() => download(conflict.localData, "self-local")}
          >
            导出本机版本
          </button>
          <button
            className="secondary"
            onClick={() => download(conflict.remoteData, "self-remote")}
          >
            导出远端版本
          </button>
        </div>
        {conflict.records.map((c) => (
          <section className="record-conflict" key={c.key}>
            <h3>
              {names[c.collection] || c.collection} ·{" "}
              {(c.local &&
                ("title" in c.local
                  ? c.local.title
                  : "name" in c.local
                    ? c.local.name
                    : "")) ||
                (c.remote && ("title" in c.remote ? c.remote.title : "")) ||
                c.id.slice(0, 8)}
            </h3>
            {c.reason === "relationship" && (
              <p>此记录涉及金额或关联关系，需一起核对。</p>
            )}
            <div className="conflict-compare">
              {(["local", "remote"] as const).map((side) => (
                <label
                  key={side}
                  className={choices[c.key] === side ? "chosen" : ""}
                >
                  <input
                    type="radio"
                    name={c.key}
                    checked={choices[c.key] === side}
                    onChange={() => setChoices({ ...choices, [c.key]: side })}
                  />{" "}
                  保留{side === "local" ? "本机" : "远端"}
                  <Preview row={c[side]} />
                </label>
              ))}
            </div>
          </section>
        ))}
        {(error || preview.validationError) && (
          <p role="alert" className="form-error">
            {error || preview.validationError}
          </p>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            conflict.records.some((c) => !choices[c.key]) ||
            !!preview.validationError
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await resolveSync(config, conflict, choices);
              onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在同步…" : "应用选择并同步"}
        </button>
      </div>
    </Modal>
  );
}
