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
  log.section("Claude Code — 환경변수 백업");
  if (opts.dryRun) {
    log.dry(`${profile} 환경변수 백업 예정`);
  } else {
    saveEnvBackup();
    log.ok("환경변수 백업 완료 (~/.tokamak-ai-access/env-backup.json)");
  }

  // Shell profile
  log.section("Claude Code — 쉘 프로파일 설정");
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
    log.dry(`${profile} 수정 예정:`);
    log.diff("+", "ANTHROPIC_API_KEY", maskKey(opts.apiKey));
    log.diff("+", "ANTHROPIC_BASE_URL", baseUrl);
    log.diff("+", "ANTHROPIC_MODEL (+ 4 aliases)", model);
  } else {
    writeEnvBlock(profile, { target: "claude", model, extraLines: envLines });
    log.ok(`${profile} 환경변수 블록 추가 완료`);
  }

  // settings.json
  log.section("Claude Code — settings.json 설정");
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
    log.dry(`${settings} 수정 예정:`);
    const existing = existsSync(settings) ? (readJson(settings) as { env?: Record<string, string> }).env ?? {} : {};
    for (const [k, v] of Object.entries(keys)) {
      log.diff(k in existing ? "~" : "+", k, k.includes("KEY") ? maskKey(v) : v);
    }
  } else {
    if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });
    const { added, updated } = mergeKeys(settings, ["env"], keys);
    log.ok(`settings.json 업데이트 완료 (추가: ${added.length}, 변경: ${updated.length})`);
  }
}

export function revert(opts: RevertOptions): void {
  const home = opts.home ?? homedir();
  const { profile, settings } = paths(home);

  // Shell profile
  log.section("Claude Code — 쉘 프로파일 원복");
  if (opts.dryRun) {
    log.dry(`${profile} 에서 TON AI Access 블록 제거 예정`);
  } else {
    const removed = revertShellProfile(profile, {
      dryRun: false,
      backup: opts.backup !== false,
      backupFile,
    });
    if (removed) log.ok(`${profile} 마커 블록 제거 완료`);
    else log.warn(`${profile} 에서 TON AI Access 블록을 찾지 못했습니다`);
  }

  // settings.json
  log.section("Claude Code — settings.json 원복");
  if (opts.dryRun) {
    log.dry(`${settings} 에서 ${KEYS.length}개 ANTHROPIC_* 키 제거 예정`);
    for (const k of KEYS) log.diff("-", k, "");
  } else {
    if (opts.backup !== false) backupFile(settings);
    const removed = removeKeys(settings, ["env"], [...KEYS]);
    if (removed.length > 0) log.ok(`settings.json 에서 ${removed.length}개 키 제거 완료`);
    else log.warn(`settings.json 에서 제거할 키를 찾지 못했습니다`);
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
  log.info("현재 세션의 환경변수를 정리하려면 다음을 실행하세요:");
  if (commands) console.log(commands);
  console.log("");
  log.info("또는 쉘을 완전히 재시작하세요.");
}
