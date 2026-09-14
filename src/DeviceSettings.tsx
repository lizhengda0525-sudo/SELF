import { useState } from "react";
import { normalizeEndpoint, type SyncConfig } from "./sync";
import { Field } from "./components";
import { exportText } from "./export";
interface Device {
  id: string;
  name: string;
  createdAt: string;
  lastSeen: string | null;
  revokedAt: string | null;
}
interface Account {
  id: string;
  name: string;
  admin: boolean;
  deviceId: string;
  devices: Device[];
}
export function DeviceSettings({ config }: { config: SyncConfig }) {
  const [account, setAccount] = useState<Account | null>(null),
    [name, setName] = useState("我的手机"),
    [issued, setIssued] = useState<{ token: string; name: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(path: string, method = "GET", body?: unknown) {
    const endpoint = normalizeEndpoint(config.endpoint);
    const url = new URL(endpoint, window.location.href);
    url.pathname = path;
    url.search = "";
    url.hash = "";
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok)
      throw new Error(
        res.status === 401
          ? "令牌无效或设备已撤销"
          : res.status === 403
            ? "此操作需要服务所有者令牌"
            : `设备服务请求失败（${res.status}）`,
      );
    return res.json();
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>账户与设备</h2>
      <p className="hint">
        一个自托管服务对应一个私人账户。使用上方的服务地址和访问令牌查看。所有者可为每台设备创建独立令牌并随时撤销；同步密钥另行安全传递。撤销后阻止新同步，已下载到该设备的数据不会被远程删除。
      </p>
      <button
        className="secondary"
        disabled={busy || !config.token}
        onClick={() =>
          run(async () => {
            setIssued(null);
            setAccount(await request("/api/account"));
          })
        }
      >
        查看账户与设备
      </button>
      {account && (
        <>
          <p>
            {account.name} · {account.admin ? "所有者" : "设备成员"}
          </p>
          <p className="hint">账户标识 {account.id}</p>
          {account.admin && (
            <div className="device-create">
              <Field label="新设备名称">
                <input
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <button
                className="secondary"
                disabled={busy || !name.trim()}
                onClick={() =>
                  run(async () => {
                    setIssued(await request("/api/devices", "POST", { name }));
                    setAccount(await request("/api/account"));
                  })
                }
              >
                创建设备令牌
              </button>
            </div>
          )}
          {issued && (
            <div className="issued-token">
              <p>
                为「{issued.name}
                」生成的令牌仅显示本次。保存后，在该设备的“访问令牌”中填写。
              </p>
              <Field label="新设备令牌">
                <input readOnly value={issued.token} />
              </Field>
              <button
                className="secondary"
                onClick={() =>
                  run(() =>
                    exportText(
                      "SELF-device-token.txt",
                      issued.token,
                      "text/plain",
                    ),
                  )
                }
              >
                保存设备令牌
              </button>
              <button className="text-button" onClick={() => setIssued(null)}>
                已保存，隐藏
              </button>
            </div>
          )}
          {account.devices.map((d) => (
            <div className="device-row" key={d.id}>
              <div>
                <strong>
                  {d.name}
                  {account.deviceId === d.id ? " · 当前设备" : ""}
                </strong>
                <p className="hint">
                  {d.revokedAt
                    ? "已撤销"
                    : `最近连接：${d.lastSeen ? new Date(d.lastSeen).toLocaleString("zh-CN") : "尚未连接"}`}
                </p>
              </div>
              {account.admin && !d.revokedAt && (
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `撤销「${d.name}」的同步权限？其已有本地数据仍保留。`,
                      )
                    )
                      void run(async () => {
                        await request(`/api/devices/${d.id}`, "DELETE");
                        setAccount(await request("/api/account"));
                        setIssued(null);
                      });
                  }}
                >
                  撤销
                </button>
              )}
            </div>
          ))}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
