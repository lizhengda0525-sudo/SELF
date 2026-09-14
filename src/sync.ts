import { db, type Vault } from "./db";
import { emptyData, validateData, type Data } from "./domain";
import { mergeData, type Choice, type RecordConflict } from "./merge";
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
  localData: Data;
  base: Data | null;
  records: RecordConflict[];
  validationError: string;
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
  const result = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("SELF-v1"),
    },
    await keyFrom(key),
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { iv: hex(iv), ciphertext: hex(new Uint8Array(result)) };
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
    throw new Error(
      "无法解密或验证远端数据。请核对密钥与客户端版本；本机数据保持不变。",
    );
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
async function request(config: SyncConfig, body?: unknown) {
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
        ? "同步访问令牌无效或设备已撤销；本机数据已保留。"
        : `同步服务不可用（${response.status}），请稍后重试；本机数据已保留。`,
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
  )
    throw new Error("同步响应格式无效；本机数据保持不变。");
  return { conflict: response.status === 409, remote };
}
function conflictsFor(
  v: Vault,
  remote: Remote,
  remoteData: Data,
): SyncConflict {
  const base = v.serverBase ?? (v.serverRevision === 0 ? emptyData() : null);
  const result = mergeData(base, v.data, remoteData);
  return {
    localVersion: v.localVersion,
    remote,
    remoteData,
    localData: v.data,
    base,
    records: result.conflicts,
    validationError: result.validationError,
  };
}
async function commit(
  v: Vault,
  remote: Remote,
  merged: Data,
  remoteData: Data,
  endpoint: string,
) {
  await db.transaction("rw", db.vault, db.backups, async () => {
    const latest = (await db.vault.get("main"))!;
    if (latest.localVersion !== v.localVersion)
      throw new Error("同步期间本机有新修改，请重新同步；两端数据都已保留。");
    const now = new Date().toISOString();
    await db.backups.bulkAdd([
      {
        id: crypto.randomUUID(),
        createdAt: now,
        reason: "同步前版本备份",
        data: v.data,
      },
      {
        id: crypto.randomUUID(),
        createdAt: now,
        reason: "同步前远端版本备份",
        data: remoteData,
      },
    ]);
    await db.vault.put({
      ...latest,
      data: { ...merged, timer: latest.data.timer },
      // IndexedDB preserves aliases within one object graph. The baseline must
      // not share arrays/records with editable data, or local edits would also
      // mutate the baseline and later look unchanged during a three-way merge.
      serverBase: structuredClone({ ...merged, timer: null }),
      serverRevision: remote.revision,
      endpoint,
      dirty: false,
      syncedAt: now,
      localVersion: latest.localVersion + 1,
    });
  });
}
async function execute(
  config: SyncConfig,
  v: Vault,
  remote: Remote,
  remoteData: Data,
  merged: Data,
): Promise<SyncConflict | null> {
  validateData(merged);
  if ((await db.vault.get("main"))!.localVersion !== v.localVersion)
    throw new Error("本机已发生新修改，请重新同步。");
  const result = await request(config, {
    baseRevision: remote.revision,
    payload: await encrypt({ ...merged, timer: null }, config.key),
  });
  if (result.conflict && result.remote.payload)
    return conflictsFor(
      v,
      result.remote,
      await decrypt(result.remote.payload, config.key),
    );
  await commit(
    v,
    result.remote,
    merged,
    remoteData,
    normalizeEndpoint(config.endpoint),
  );
  return null;
}
export async function synchronize(
  config: SyncConfig,
): Promise<SyncConflict | null> {
  const endpoint = normalizeEndpoint(config.endpoint),
    v = (await db.vault.get("main"))!;
  if (v.endpoint && v.endpoint !== endpoint)
    throw new Error(
      "本机已绑定另一服务。请先导出备份，使用新的浏览器配置连接其他账库。",
    );
  await keyFrom(config.key);
  const { remote } = await request(config);
  if (remote.revision < v.serverRevision)
    throw new Error("远端修订号回退，请检查服务器备份。");
  const remoteData = remote.payload
    ? await decrypt(remote.payload, config.key)
    : emptyData();
  if (remote.revision === v.serverRevision && !v.dirty) {
    await db.transaction("rw", db.vault, async () => {
      const latest = (await db.vault.get("main"))!;
      if (latest.serverRevision === v.serverRevision)
        await db.vault.put({
          ...latest,
          serverBase: remoteData,
          endpoint,
          syncedAt: new Date().toISOString(),
        });
    });
    return null;
  }
  if (!v.dirty) {
    await commit(v, remote, remoteData, remoteData, endpoint);
    return null;
  }
  const c = conflictsFor(v, remote, remoteData),
    result = mergeData(c.base, v.data, remoteData);
  if (result.conflicts.length || result.validationError) return c;
  return execute(config, v, remote, remoteData, result.data);
}
export async function resolveSync(
  config: SyncConfig,
  conflict: SyncConflict,
  choices: Record<string, Choice>,
) {
  const v = (await db.vault.get("main"))!;
  if (v.localVersion !== conflict.localVersion)
    throw new Error("本机已有新修改，请关闭冲突窗口并重新同步。");
  const merged = mergeData(conflict.base, v.data, conflict.remoteData, choices);
  if (merged.unresolved.length) throw new Error("请为每条冲突选择要保留的版本");
  if (merged.validationError) throw new Error(merged.validationError);
  const { remote } = await request(config);
  if (remote.revision !== conflict.remote.revision)
    throw new Error("远端已有新修改，请重新同步。");
  const next = await execute(
    config,
    v,
    remote,
    conflict.remoteData,
    merged.data,
  );
  if (next) throw new Error("远端再次发生变化，请重新同步。");
}
