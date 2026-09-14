import { useEffect, useState } from "react";
import {
  enableNotifications,
  scheduleNotifications,
  deliverBrowserReminders,
  notificationPlatform,
} from "./notifications";
import type { Data } from "./domain";
export function ReminderService({ data }: { data: Data }) {
  const [enabled, setEnabled] = useState(
      localStorage.getItem("self-notifications") === "on",
    ),
    [error, setError] = useState("");
  useEffect(() => {
    const changed = () =>
      setEnabled(localStorage.getItem("self-notifications") === "on");
    window.addEventListener("self-notifications-changed", changed);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("self-notifications-changed", changed);
      window.removeEventListener("storage", changed);
    };
  }, []);
  useEffect(() => {
    void scheduleNotifications(data, enabled)
      .then(() => setError(""))
      .catch((e) => setError(e.message));
    if (!enabled) return;
    const timer = setInterval(() => deliverBrowserReminders(data), 10000);
    return () => clearInterval(timer);
  }, [data, enabled]);
  return error ? (
    <p role="alert" className="notification-warning">
      系统提醒未生效：{error}
    </p>
  ) : null;
}
export function ReminderSettings() {
  const [enabled, setEnabled] = useState(
      localStorage.getItem("self-notifications") === "on",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>系统提醒</h2>
      <p className="hint">
        任务按编辑页的提醒时间通知，倒计时按截止时间通知，会员在到期前 7 / 3 / 1
        天及当天上午 9 点通知。专注结束也会提醒。
      </p>
      <p className="hint">
        {notificationPlatform() === "Android"
          ? "Android 会交由系统安排提醒；省电、强行停止和厂商后台限制可能延迟通知。当前使用非精确闹钟，请在手机上验证。"
          : notificationPlatform() === "Windows"
            ? "Windows 关闭窗口后驻留托盘继续提醒；选择托盘“退出”或关闭电脑后不提醒。"
            : "浏览器需要保持页面打开，关闭页面后不能保证提醒。可安装原生版本获得后台提醒。"}
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (!enabled) await enableNotifications();
            else localStorage.setItem("self-notifications", "off");
            setEnabled(!enabled);
            window.dispatchEvent(new Event("self-notifications-changed"));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {enabled ? "关闭系统提醒" : "开启系统提醒"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
