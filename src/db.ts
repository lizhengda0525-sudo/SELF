import { exportText } from "./export";
import Dexie, { type EntityTable } from "dexie";
import { emptyData, validateData, type Data } from "./domain";

export interface Vault {
  id: "main";
  data: Data;
  localVersion: number;
  serverRevision: number;
  dirty: boolean;
  savedAt: string;
  syncedAt: string;
  endpoint: string;
  serverBase?: Data | null;
}
export interface Backup {
  id: string;
  createdAt: string;
  reason: string;
  data: Data;
}
export const db = new Dexie("self-steward-v1") as Dexie & {
  vault: EntityTable<Vault, "id">;
  backups: EntityTable<Backup, "id">;
};
db.version(1).stores({ vault: "id", backups: "id, createdAt" });
db.version(2)
  .stores({ vault: "id", backups: "id, createdAt" })
  .upgrade(async (tx) => {
    await tx
      .table("vault")
      .toCollection()
      .modify((v) => {
        v.data = validateData(v.data);
        v.serverBase =
          v.serverRevision === 0
            ? emptyData()
            : v.dirty
              ? null
              : structuredClone(v.data);
      });
  });
export async function initialize() {
  await db.transaction("rw", db.vault, async () => {
    if (!(await db.vault.get("main")))
      await db.vault.add({
        id: "main",
        data: emptyData(),
        localVersion: 0,
        serverRevision: 0,
        dirty: false,
        savedAt: "",
        syncedAt: "",
        endpoint: "",
        serverBase: emptyData(),
      });
  });
  if (navigator.storage?.persist)
    await navigator.storage.persist().catch(() => false);
}
export async function change(fn: (data: Data) => void) {
  await db.transaction("rw", db.vault, async () => {
    const v = await db.vault.get("main");
    if (!v) throw new Error("本地数据库未就绪，请刷新重试");
    fn(v.data);
    v.data = validateData(v.data);
    v.localVersion++;
    v.dirty = true;
    v.savedAt = new Date().toISOString();
    await db.vault.put(v);
  });
}
export async function replaceData(data: Data, reason: string) {
  const validated = validateData(data);
  await db.transaction("rw", db.vault, db.backups, async () => {
    const v = (await db.vault.get("main"))!;
    await db.backups.add({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      data: v.data,
    });
    await db.vault.put({
      ...v,
      data: validated,
      localVersion: v.localVersion + 1,
      dirty: true,
      savedAt: new Date().toISOString(),
    });
  });
}
export function download(data: Data, name = "self-backup") {
  void exportText(
    `${name}-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(
      { app: "SELF", exportedAt: new Date().toISOString(), data },
      null,
      2,
    ),
  ).catch((e) => alert(`导出失败：${e.message}`));
}
