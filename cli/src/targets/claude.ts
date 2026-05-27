import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeEnvBlock, revertShellProfile, detectShellProfile } from "../lib/shell-profile.js";
import { mergeKeys, removeKeys, readJson } from "../lib/json-merge.js";
import { backupFile } from "../lib/backup.js";
import { log, maskKey } from "../lib/logger.js";
import { saveEnvBackup, loadEnvBackup, generateEnvCommands } from "../lib/env-cleanup.js";
import { CLAUDE_ENV_KEYS } from "../lib/litellm.js";

const KEYS = CLAUDE_ENV_KEYS;

export interface ConfigureOptions {
  home?: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  dryRun?: boolean;
}

export interface RevertOptions {
  home?: string;
  dryRun?: boolean;
  backup?: boolean;
}

function paths(home: string) {
  const configDir = join(home, ".claude");
  return {
    profile: detectShellProfile(home),
    settingsDir: configDir,
    settings: join(configDir, "settings.json"),
  };
}

export function configure(opts: ConfigureOptions): void {
  const home = opts.home ?? homedir();
  const baseUrl = opts.baseUrl ?? "https://api2.ai.tokamak.network";
  const model = opts.model ?? "qwen-3.6";
  const { profile, settingsDir, settings } = paths(home);

  // Backup original env vars BEFORE overwriting
  log.section("Claude Code — env var backup");
  if (opts.dryRun) {
    log.dry(`${profile}: env vars will be backed up`);
  } else {
    saveEnvBackup();
    log.ok("Env vars backed up (~/.tokamak-ai-access/env-backup.json)");
  }

  // Shell profile
  log.section("Claude Code — shell profile");
  const envLines = [
    `export ANTHROPIC_API_KEY="${opts.apiKey}"`,
    `export ANTHROPIC_BASE_URL="${baseUrl}"`,
    `export ANTHROPIC_MODEL="${model}"`,
    `export ANTHROPIC_SMALL_FAST_MODEL="${model}"`,
    `export ANTHROPIC_DEFAULT_HAIKU_MODEL="${model}"`,
    `export ANTHROPIC_DEFAULT_SONNET_MODEL="${model}"`,
    `export ANTHROPIC_DEFAULT_OPUS_MODEL="${model}"`,
  ];

  if (opts.dryRun) {
    log.dry(`${profile}: will be updated:`);
    log.diff("+", "ANTHROPIC_API_KEY", maskKey(opts.apiKey));
    log.diff("+", "ANTHROPIC_BASE_URL", baseUrl);
    log.diff("+", "ANTHROPIC_MODEL (+ 4 aliases)", model);
  } else {
    writeEnvBlock(profile, { target: "claude", model, extraLines: envLines });
    log.ok(`${profile}: env block written`);
  }

  // settings.json
  log.section("Claude Code — settings.json");
  const keys: Record<string, string> = {
    ANTHROPIC_API_KEY: opts.apiKey,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
  };

  if (opts.dryRun) {
    log.dry(`${settings}: will be updated:`);
    const existing = existsSync(settings) ? (readJson(settings) as { env?: Record<string, string> }).env ?? {} : {};
    for (const [k, v] of Object.entries(keys)) {
      log.diff(k in existing ? "~" : "+", k, k.includes("KEY") ? maskKey(v) : v);
    }
  } else {
    if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });
    const { added, updated } = mergeKeys(settings, ["env"], keys);
    log.ok(`settings.json updated (added: ${added.length}, changed: ${updated.length})`);
  }
}

export function revert(opts: RevertOptions): void {
  const home = opts.home ?? homedir();
  const { profile, settings } = paths(home);

  // Shell profile
  log.section("Claude Code — shell profile revert");
  if (opts.dryRun) {
    log.dry(`${profile}: TON AI Access block will be removed`);
  } else {
    const removed = revertShellProfile(profile, {
      dryRun: false,
      backup: opts.backup !== false,
      backupFile,
    });
    if (removed) log.ok(`${profile}: marker block removed`);
    else log.warn(`${profile}: no TON AI Access block found`);
  }

  // settings.json
  log.section("Claude Code — settings.json revert");
  if (opts.dryRun) {
    log.dry(`${settings}: will remove ${KEYS.length} ANTHROPIC_* keys`);
    for (const k of KEYS) log.diff("-", k, "");
  } else {
    if (opts.backup !== false) backupFile(settings);
    const removed = removeKeys(settings, ["env"], [...KEYS]);
    if (removed.length > 0) log.ok(`settings.json: removed ${removed.length} keys`);
    else log.warn(`settings.json: no keys to remove found`);
  }
}

/** Print env var restore commands for the current shell session */
export function printRestoreCommands(): void {
  const { commands, warning } = generateEnvCommands();
  if (!commands && !warning) return;
  console.log("");
  if (warning) {
    log.warn(warning);
  }
  log.info("To clean up env vars in the current session, run:");
  if (commands) console.log(commands);
  console.log("");
  log.info("Or fully restart your shell.");
}
