import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { CLAUDE_ENV_KEYS } from "./litellm.js";

const BACKUP_DIR = join(homedir(), ".tokamak-ai-access");
const BACKUP_FILE = join(BACKUP_DIR, "env-backup.json");

// Patterns that indicate TON AI Access proxy configuration
const TON_PATTERNS = [
  (key: string, val: string) => key === "ANTHROPIC_BASE_URL" && val.includes("tokamak"),
  (key: string, val: string) => key === "ANTHROPIC_MODEL" && val === "qwen-3.6",
  (key: string, val: string) => key === "ANTHROPIC_API_KEY" && val.startsWith("sk-0kgH"),
];

function isTonValue(key: string, val: string): boolean {
  return TON_PATTERNS.some(fn => fn(key, val));
}

function isTonBackup(backup: EnvBackup): boolean {
  // If ANY value in the backup matches TON patterns, it's corrupted (TON values, not originals)
  return backup.original && Object.entries(backup.original).some(([k, v]) => isTonValue(k, v));
}

export interface EnvBackup {
  original: Record<string, string>;
  timestamp: string;
}

/** Save current env var values (call during configure, before overwriting) */
export function saveEnvBackup(): void {
  const backup: EnvBackup = {
    original: {},
    timestamp: new Date().toISOString(),
  };

  for (const key of CLAUDE_ENV_KEYS) {
    backup.original[key] = process.env[key] ?? "";
  }

  if (!existsSync(BACKUP_DIR)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2), "utf-8");
}

/** Load the saved env backup, or null if not found */
export function loadEnvBackup(): EnvBackup | null {
  if (!existsSync(BACKUP_FILE)) return null;
  try {
    return JSON.parse(readFileSync(BACKUP_FILE, "utf-8")) as EnvBackup;
  } catch {
    return null;
  }
}

/** Check if the backup contains TON AI Access values (meaning original was already overwritten) */
export function isBackupCorrupted(): boolean {
  const backup = loadEnvBackup();
  return backup !== null && isTonBackup(backup);
}

/** Generate shell commands to unset or restore env vars */
export function generateEnvCommands(): { commands: string; warning?: string } {
  const backup = loadEnvBackup();
  const keys = [...CLAUDE_ENV_KEYS];
  const lines: string[] = [];

  if (backup && Object.keys(backup.original).length > 0) {
    if (isTonBackup(backup)) {
      return {
        commands: generateCleanupOnlyCommands(keys),
        warning: "# ⚠️  Backup contains TON AI Access values (not originals).",
      };
    }

    lines.push("# TON AI Access — restore env vars (or clean up)");
    lines.push("# Sourcing this script restores the current session:");
    lines.push("#   source <(tokamak-ai-access restore-env)");
    lines.push("");

    for (const key of keys) {
      const original = backup.original[key];
      if (original) {
        lines.push(`export ${key}="${original}"`);
      } else {
        lines.push(`unset ${key}`);
      }
    }
    return { commands: lines.join("\n") };
  }

  // No backup — just generate unset commands
  return { commands: generateCleanupOnlyCommands(keys) };
}

function generateCleanupOnlyCommands(keys: string[]): string {
  const lines = ["# TON AI Access — clean up env vars"];
  lines.push("# Unsets all TON AI Access env vars from the current session:");
  lines.push("#   source <(tokamak-ai-access cleanup-env)");
  lines.push("");

  for (const key of keys) {
    lines.push(`unset ${key}`);
  }
  return lines.join("\n");
}
