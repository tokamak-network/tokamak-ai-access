import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeEnvBlock, revertShellProfile, detectShellProfile } from "../lib/shell-profile.js";
import { backupFile } from "../lib/backup.js";
import { log, maskKey } from "../lib/logger.js";
import { hasFileMarker, BLOCK_START } from "../lib/markers.js";

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
  return {
    profile: detectShellProfile(home),
    configDir: join(home, ".codex"),
    config: join(home, ".codex", "config.toml"),
  };
}

export function configure(opts: ConfigureOptions): void {
  const home = opts.home ?? homedir();
  const baseUrl = opts.baseUrl ?? "https://api2.ai.tokamak.network";
  const model = opts.model ?? "qwen-3.6";
  const { profile, configDir, config } = paths(home);
  const date = new Date().toISOString().slice(0, 10);

  // Shell profile
  log.section("Codex CLI — 쉘 프로파일 설정");
  const envLines = [
    `export OPENAI_API_KEY="${opts.apiKey}"`,
    `export OPENAI_BASE_URL="${baseUrl}/v1"`,
  ];

  if (opts.dryRun) {
    log.dry(`${profile} 수정 예정:`);
    log.diff("+", "OPENAI_API_KEY", maskKey(opts.apiKey));
    log.diff("+", "OPENAI_BASE_URL", `${baseUrl}/v1`);
  } else {
    writeEnvBlock(profile, { target: "codex", model, extraLines: envLines });
    log.ok(`${profile} 환경변수 블록 추가 완료`);
  }

  // config.toml
  log.section("Codex CLI — config.toml 설정");
  const tomlContent = [
    `${BLOCK_START} — ${date}`,
    `model = "${model}"`,
    `model_provider = "tokamak"`,
    ``,
    `[model_providers.tokamak]`,
    `name = "TON AI Access (LiteLLM)"`,
    `base_url = "${baseUrl}/v1"`,
    `env_key = "OPENAI_API_KEY"`,
  ].join("\n") + "\n";

  if (opts.dryRun) {
    log.dry(`${config} 전체 덮어쓰기 예정:`);
    log.diff("+", "model", model);
    log.diff("+", "model_provider", "tokamak");
    log.diff("+", "base_url", `${baseUrl}/v1`);
  } else {
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    writeFileSync(config, tomlContent);
    log.ok(`${config} 작성 완료`);
  }
}

export function revert(opts: RevertOptions): void {
  const home = opts.home ?? homedir();
  const { profile, config } = paths(home);

  // Shell profile
  log.section("Codex CLI — 쉘 프로파일 원복");
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

  // config.toml
  log.section("Codex CLI — config.toml 원복");
  if (!existsSync(config)) {
    log.warn(`${config} 파일이 없습니다 — 건너뜀`);
    return;
  }

  const content = readFileSync(config, "utf8");
  if (!hasFileMarker(content)) {
    log.warn(`${config} 는 TON AI Access가 작성한 파일이 아닙니다 — 보존합니다`);
    return;
  }

  if (opts.dryRun) {
    log.dry(`${config} 삭제 예정 (TON AI Access 마커 확인됨)`);
  } else {
    if (opts.backup !== false) backupFile(config);
    rmSync(config);
    log.ok(`${config} 삭제 완료`);
  }
}
