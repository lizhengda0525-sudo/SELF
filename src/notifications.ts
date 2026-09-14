import { Capacitor } from "@capacitor/core";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { active, addDays, currentPeriod, type Data } from "./domain";
export interface Reminder {
  id: string;
  title: string;
  body: string;
  at: number;
}
export const notificationPlatform = () =>
  Capacitor.isNativePlatform() ? "Android" : isTauri() ? "Windows" : "浏览器";
export function remindersFor(data: Data): Reminder[] {
  const result: Reminder[] = [];
  for (const t of active(data.tasks).filter((t) => !t.done && t.date))
    for (const minutes of t.reminderMinutes || []) {
      const at =
        new Date(`${t.date}T${t.start || "09:00"}:00`).getTime() -
        minutes * 60000;
      result.push({
        id: `task:${t.id}:${at}`,
        title: t.title,
        body: `任务 · ${t.date} ${t.start || "全天"}`,
        at,
      });
    }
  for (const c of active(data.countdowns).filter((c) => !c.closed)) {
    const at = Date.parse(c.target) - c.reminderMinutes * 60000;
    result.push({
      id: `countdown:${c.id}:${at}`,
      title: c.title,
      body: "倒计时提醒",
      at,
    });
  }
  for (const m of active(data.members).filter((m) => m.status === "active"))
    for (const days of [7, 3, 1, 0]) {
      const date = addDays(currentPeriod(m).end, -days);
      if (m.snoozeUntil && date < m.snoozeUntil) continue;
      const at = new Date(`${date}T09:00:00`).getTime();
      result.push({
        id: `member:${m.id}:${at}`,
        title: `${m.name} 即将到期`,
        body: days
          ? `还有 ${days} 天到期，请核对是否续费`
          : "今天到期，请核对是否续费",
        at,
      });
    }
  if (data.timer?.startedAt) {
    const at =
      data.timer.startedAt +
      (data.timer.target - data.timer.accumulated) * 1000;
    result.push({
      id: `focus:${data.timer.startedAt}`,
      title: "专注计时结束",
      body: data.timer.title,
      at,
    });
  }
  return result
    .filter((r) => Number.isFinite(r.at))
    .sort((a, b) => a.at - b.at);
}
export async function enableNotifications() {
  if (Capacitor.isNativePlatform()) {
    const p = await LocalNotifications.requestPermissions();
    if (p.display !== "granted")
      throw new Error("系统通知权限未开启，请在系统设置中允许通知");
  } else if (isTauri()) {
    if (
      !(await isPermissionGranted()) &&
      (await requestPermission()) !== "granted"
    )
      throw new Error("系统通知权限未开启");
  } else {
    if (!("Notification" in window))
      throw new Error("此浏览器不支持系统通知，请使用原生安装版");
    if ((await Notification.requestPermission()) !== "granted")
      throw new Error("请在浏览器站点设置中允许通知");
  }
  localStorage.setItem("self-notifications", "on");
}
let queue = Promise.resolve();
export function scheduleNotifications(data: Data, enabled: boolean) {
  const reminders = enabled
    ? remindersFor(data)
        .filter((r) => r.at > Date.now() + 1000)
        .slice(0, 500)
    : [];
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (Capacitor.isNativePlatform()) {
        if (
          (await LocalNotifications.checkPermissions()).display !== "granted"
        ) {
          if (enabled) throw new Error("通知权限已被关闭，请重新开启");
          return;
        }
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length)
          await LocalNotifications.cancel(pending);
        if (reminders.length)
          await LocalNotifications.schedule({
            notifications: reminders.map((r, i) => ({
              id: i + 1,
              title: r.title,
              body: r.body,
              schedule: { at: new Date(r.at) },
              isExactNotification: false,
            })),
          });
      } else if (isTauri()) await invoke("schedule_reminders", { reminders });
    });
  return queue;
}
export function deliverBrowserReminders(data: Data) {
  if (
    notificationPlatform() !== "浏览器" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return;
  const key = "self-delivered-reminders";
  let delivered: string[] = [];
  try {
    delivered = JSON.parse(localStorage.getItem(key) || "[]");
  } catch {}
  for (const r of remindersFor(data).filter(
    (r) => r.at <= Date.now() && r.at > Date.now() - 60000,
  ))
    if (!delivered.includes(r.id)) {
      new Notification(r.title, {
        body: r.body,
        tag: r.id,
        icon: "/icon-192.png",
      });
      delivered.push(r.id);
    }
  localStorage.setItem(key, JSON.stringify(delivered.slice(-2000)));
}
