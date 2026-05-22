import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { BLOCK_START, BLOCK_END, makeBlockStart, hasMarkerBlock } from "./markers.js";

export function detectShellProfile(home = homedir()): string {
  const shell = process.env.SHELL ?? "";
  if (shell.endsWith("zsh")) return join(home, ".zshrc");
  if (platform() === "darwin") return join(home, ".bash_profile");
  if (existsSync(join(home, ".bashrc"))) return join(home, ".bashrc");
  return join(home, ".profile");
}

export interface WriteBlockOptions {
  target: string;
  model: string;
  extraLines?: string[];
  date?: string;
  dryRun?: boolean;
}

export function writeEnvBlock(profilePath: string, opts: WriteBlockOptions): string[] {
  const { target, model, extraLines = [], date = new Date().toISOString().slice(0, 10), dryRun = false } = opts;

  const existing = existsSync(profilePath) ? readFileSync(profilePath, "utf8") : "";
  const cleaned = removeMarkerBlock(existing);

  const lines = [
    "",
    makeBlockStart(target, model, date),
    ...extraLines,
    BLOCK_END,
  ];

  if (!dryRun) {
    writeFileSync(profilePath, cleaned.trimEnd() + "\n" + lines.join("\n") + "\n");
  }

  return lines;
}

export function removeMarkerBlock(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inside = false;

  for (const line of lines) {
    if (line.startsWith(BLOCK_START)) {
      inside = true;
      continue;
    }
    if (inside && line.trim() === BLOCK_END) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }

  return out.join("\n");
}


export function revertShellProfile(profilePath: string, opts: { dryRun?: boolean; backup?: boolean; backupFile?: (p: string) => string | null } = {}): boolean {
  if (!existsSync(profilePath)) return false;

  const content = readFileSync(profilePath, "utf8");
  if (!hasMarkerBlock(content)) return false;

  if (!opts.dryRun) {
    if (opts.backup !== false && opts.backupFile) {
      opts.backupFile(profilePath);
    }
    const cleaned = removeMarkerBlock(content);
    writeFileSync(profilePath, cleaned);
  }

  return true;
}
