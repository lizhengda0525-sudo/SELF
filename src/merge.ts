import {
  collections,
  emptyData,
  validateData,
  type Data,
  type Collection,
} from "./domain";
export type Row = Data[Collection][number];
export type Choice = "local" | "remote";
export interface RecordConflict {
  key: string;
  collection: Collection;
  id: string;
  local?: Row;
  remote?: Row;
  base?: Row;
  reason: "concurrent" | "relationship";
}
export function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([k, v]) => k !== "updatedAt" && v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function mergeData(
  base: Data | null,
  local: Data,
  remote: Data,
  choices: Record<string, Choice> = {},
) {
  const merged = emptyData();
  merged.timer = local.timer;
  const conflicts: RecordConflict[] = [],
    changed: RecordConflict[] = [];
  for (const collection of collections) {
    const l = new Map(local[collection].map((r) => [r.id, r] as const)),
      r = new Map(remote[collection].map((r) => [r.id, r] as const)),
      b = new Map((base?.[collection] || []).map((r) => [r.id, r] as const));
    for (const id of new Set([...l.keys(), ...r.keys(), ...b.keys()])) {
      const lv = l.get(id),
        rv = r.get(id),
        bv = b.get(id),
        key = `${collection}:${id}`;
      const c: RecordConflict = {
        key,
        collection,
        id,
        local: lv,
        remote: rv,
        base: bv,
        reason: "concurrent",
      };
      let selected: Row | undefined;
      if (canonical(lv) === canonical(rv)) selected = lv || rv;
      else if (choices[key]) selected = choices[key] === "local" ? lv : rv;
      else if (base && canonical(lv) === canonical(bv)) selected = rv;
      else if (base && canonical(rv) === canonical(bv)) selected = lv;
      else if (!base && (!lv || !rv)) selected = lv || rv;
      else {
        conflicts.push(c);
        selected = lv;
      }
      if (canonical(lv) !== canonical(rv)) changed.push(c);
      if (selected)
        (merged[collection] as Row[]).push(structuredClone(selected));
    }
  }
  let validationError = "";
  try {
    validateData(merged);
  } catch (e) {
    validationError = e instanceof Error ? e.message : "记录关系需要核对";
  }
  if (validationError) {
    // Independent refunds and deletion/new-related-record edits can conflict
    // across different IDs. Ask about all changed financial records.
    for (const c of changed.filter((c) =>
      ["entries", "members"].includes(c.collection),
    ))
      if (!conflicts.some((x) => x.key === c.key))
        conflicts.push({ ...c, reason: "relationship" });
  }
  return {
    data: merged,
    conflicts,
    validationError,
    unresolved: conflicts.filter((c) => !choices[c.key]),
  };
}
