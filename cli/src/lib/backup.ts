import { copyFileSync, existsSync } from "node:fs";

export function makeTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function backupFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const dest = `${filePath}.bak-${makeTimestamp()}`;
  copyFileSync(filePath, dest);
  return dest;
}
