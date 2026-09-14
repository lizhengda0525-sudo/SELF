import { db, type Vault } from "./db";
import { validateData, type Data } from "./domain";

export interface SyncConfig {
  endpoint: string;
  token: string;
  key: string;
}
export interface Envelope {
  iv: string;
  ciphertext: string;
}
export interface Remote {
  revision: number;
  payload: Envelope | null;
}
export interface SyncConflict {
  localVersion: number;
  remote: Remote;
  remoteData: Data;
}
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) =>
  Uint8Array.from(s.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
export const generateKey = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
async function keyFrom(input: string) {
  if (!/^[0-9a-f]{64}$/i.test(input))
    throw new Error("同步密钥须为 64 位十六进制字符");
  return crypto.subtle.importKey("raw", unhex(input), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(data: Data, key: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("SELF-v1"),
    },
    await keyFrom(key),
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { iv: hex(iv), ciphertext: hex(new Uint8Array(encrypted)) };
}
export async function decrypt(payload: Envelope, key: string): Promise<Data> {
  try {
    const result = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unhex(payload.iv),
        additionalData: new TextEncoder().encode("SELF-v1"),
      },
      await keyFrom(key),
      unhex(payload.ciphertext),
    );
    return validateData(JSON.parse(new TextDecoder().decode(result)));
  } catch {
    throw new Error("无法解密或验证远端数据。请核对密钥；本机数据保持不变。");
  }
}
export function normalizeEndpoint(endpoint: string) {
  const u = new URL(endpoint, location.origin);
  if (
    u.protocol !== "https:" &&
    !(
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    )
  )
    throw new Error("同步服务必须使用 HTTPS，开发时仅允许本机 HTTP");
  if (u.username || u.password || u.search || u.hash)
    throw new Error("服务地址不可包含密码或查询参数");
  return u.href.replace(/\/$/, "");
}
async function request(
  config: SyncConfig,
  body?: unknown,
): Promise<{ conflict: boolean; remote: Remote }> {
  const response = await fetch(normalizeEndpoint(config.endpoint), {
    method: body ? "PUT" : "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok && response.status !== 409)
    throw new Error(
      response.status === 401
        ? "同步访问令牌无效；本机数据已保留。"
        : `同步服务不可用（${response.status}）；本机数据已保留，可稍后重试。`,
    );
  const remote = (await response.json()) as Remote;
  if (
    !Number.isSafeInteger(remote.revision) ||
    remote.revision < 0 ||
    (remote.revision === 0
      ? remote.payload !== null
      : !remote.payload ||
        !/^[0-9a-f]{24}$/i.test(remote.payload.iv) ||
        typeof remote.payload.ciphertext !== "string" ||
        !/^(?:[0-9a-f]{2}){16,}$/i.test(remote.payload.ciphertext))
  ) {
    throw new Error("同步响应格式无效；本机数据保持不变。");
  }
  return {
    conflict: response.status === 409,
    remote,
  };
}
async function acceptRemote(
  v: Vault,
  remote: Remote,
  data: Data,
  endpoint: string,
  backup: boolean,
) {
  await db.transaction("rw", db.vault, db.backups, async () => {
    const latest = (await db.vault.get("main"))!;
    if (latest.localVersion !== v.localVersion)
      throw new Error("同步期间本机有新修改，请重新同步；新修改已保留。");
    if (backup)
      await db.backups.add({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        reason: "同步前版本备份",
        data: latest.data,
      });
    // Timers are device-local. Completed focus records are shared.
    await db.vault.put({
      ...latest,
      data: { ...data, timer: latest.data.timer },
      serverRevision: remote.revision,
      dirty: false,
      syncedAt: new Date().toISOString(),
      endpoint,
      localVersion: latest.localVersion + 1,
    });
  });
}
export async function synchronize(
  config: SyncConfig,
): Promise<SyncConflict | null> {
  const endpoint = normalizeEndpoint(config.endpoint);
  const v = (await db.vault.get("main"))!;
  if (v.endpoint && v.endpoint !== endpoint)
    throw new Error(
      "当前账库已绑定另一同步地址。请先导出备份，使用独立浏览器配置连接其他账库。",
    );
  await keyFrom(config.key);
  const { remote } = await request(config);
  // Authenticate the supplied key even if no download is needed. Otherwise an
  // accidentally changed key could re-encrypt and overwrite an existing vault.
  const authenticatedData = remote.payload
    ? await decrypt(remote.payload, config.key)
    : null;
  if (remote.revision < v.serverRevision)
    throw new Error("远端修订号回退，请检查服务器备份；本机数据保持不变。");
  if (remote.revision !== v.serverRevision && remote.payload) {
    const remoteData = authenticatedData!;
    if (v.dirty) return { localVersion: v.localVersion, remote, remoteData };
    await acceptRemote(v, remote, remoteData, endpoint, true);
    return null;
  }
  if (!v.dirty) {
    await db.transaction("rw", db.vault, async () => {
      const latest = (await db.vault.get("main"))!;
      if (latest.serverRevision === v.serverRevision) {
        await db.vault.put({
          ...latest,
          endpoint,
          syncedAt: new Date().toISOString(),
        });
      }
    });
    return null;
  }
  const payload = await encrypt({ ...v.data, timer: null }, config.key);
  const result = await request(config, {
    baseRevision: v.serverRevision,
    payload,
  });
  if (result.conflict && result.remote.payload)
    return {
      localVersion: v.localVersion,
      remote: result.remote,
      remoteData: await decrypt(result.remote.payload, config.key),
    };
  await db.transaction("rw", db.vault, async () => {
    const latest = (await db.vault.get("main"))!;
    await db.vault.put({
      ...latest,
      serverRevision: result.remote.revision,
      endpoint,
      syncedAt: new Date().toISOString(),
      dirty: latest.localVersion !== v.localVersion,
    });
  });
  return null;
}
export async function resolveSync(
  config: SyncConfig,
  conflict: SyncConflict,
  side: "local" | "remote",
) {
  const v = (await db.vault.get("main"))!;
  if (v.localVersion !== conflict.localVersion)
    throw new Error("本机已发生新修改，请重新同步后比较。");
  if (side === "remote") {
    const { remote } = await request(config);
    if (remote.revision !== conflict.remote.revision)
      throw new Error("远端已变化，请重新同步。");
    await acceptRemote(
      v,
      remote,
      conflict.remoteData,
      normalizeEndpoint(config.endpoint),
      true,
    );
  } else {
    await db.backups.add({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason: "同步冲突：远端版本",
      data: conflict.remoteData,
    });
    const result = await request(config, {
      baseRevision: conflict.remote.revision,
      payload: await encrypt({ ...v.data, timer: null }, config.key),
    });
    if (result.conflict)
      throw new Error("远端再次变化，请重新同步；两个版本均已保留。");
    await db.transaction("rw", db.vault, async () => {
      const latest = (await db.vault.get("main"))!;
      await db.vault.put({
        ...latest,
        serverRevision: result.remote.revision,
        endpoint: normalizeEndpoint(config.endpoint),
        dirty: latest.localVersion !== v.localVersion,
        syncedAt: new Date().toISOString(),
      });
    });
  }
}
