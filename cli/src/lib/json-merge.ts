import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function readJson(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`${filePath}: JSON이 손상되었습니다. 수동으로 수정하거나 .bak 파일을 복원하세요.`);
  }
}

export function writeJson(filePath: string, data: Record<string, unknown>): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

export function mergeKeys(
  filePath: string,
  path: string[],
  keys: Record<string, string>,
  dryRun = false,
): { added: string[]; updated: string[] } {
  const data = readJson(filePath);
  const added: string[] = [];
  const updated: string[] = [];

  let obj: Record<string, unknown> = data;
  for (const segment of path) {
    if (typeof obj[segment] !== "object" || obj[segment] === null) {
      obj[segment] = {};
    }
    obj = obj[segment] as Record<string, unknown>;
  }

  for (const [k, v] of Object.entries(keys)) {
    if (k in obj) updated.push(k);
    else added.push(k);
    obj[k] = v;
  }

  if (!dryRun) writeJson(filePath, data);
  return { added, updated };
}

export function removeKeys(
  filePath: string,
  path: string[],
  keyNames: string[],
  dryRun = false,
): string[] {
  if (!existsSync(filePath)) return [];

  const data = readJson(filePath);
  let obj: Record<string, unknown> = data;
  const parentChain: [Record<string, unknown>, string][] = [];

  for (const segment of path) {
    if (typeof obj[segment] !== "object" || obj[segment] === null) return [];
    parentChain.push([obj, segment]);
    obj = obj[segment] as Record<string, unknown>;
  }

  const removed: string[] = [];
  for (const k of keyNames) {
    if (k in obj) {
      delete obj[k];
      removed.push(k);
    }
  }

  // prune empty parent objects up the chain
  let child: Record<string, unknown> = obj;
  for (const [parent, key] of [...parentChain].reverse()) {
    if (Object.keys(child).length === 0) {
      delete parent[key];
      child = parent;
    } else break;
  }

  if (!dryRun && removed.length > 0) writeJson(filePath, data);
  return removed;
}
