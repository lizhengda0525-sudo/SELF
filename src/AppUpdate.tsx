import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { isTauri } from "@tauri-apps/api/core";
// Native applications load packaged assets. A service worker there could
// retain an old UI after an APK/EXE upgrade.
export function AppUpdate({ busy }: { busy: boolean }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (
      Capacitor.isNativePlatform() ||
      isTauri() ||
      !("serviceWorker" in navigator) ||
      import.meta.env.DEV
    )
      return;
    let live = true;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => {
      if (live && registration?.waiting) setWaiting(registration.waiting);
    };
    const found = () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") check();
      });
    };
    void navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        registration = r;
        check();
        r.addEventListener("updatefound", found);
      })
      .catch(() => {});
    return () => {
      live = false;
      registration?.removeEventListener("updatefound", found);
    };
  }, []);
  return waiting ? (
    <div className="app-update" role="status">
      <span>新版本已就绪{busy ? "，请先保存当前操作" : ""}</span>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => location.reload(),
            { once: true },
          );
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        更新并重新打开
      </button>
    </div>
  ) : null;
}
