import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeEnvBlock, revertShellProfile, detectShellProfile } from "../lib/shell-profile.js";
import { readJson, writeJson } from "../lib/json-merge.js";
import { backupFile } from "../lib/backup.js";
import { log } from "../lib/logger.js";

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

interface OpenClawConfig {
  models?: {
    providers?: Record<string, unknown>;
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
    };
  };
  [key: string]: unknown;
}

function paths(home: string) {
  return {
    profile: detectShellProfile(home),
    configDir: join(home, ".openclaw"),
    config: join(home, ".openclaw", "openclaw.json"),
  };
}

const MODEL_METADATA: Record<string, unknown> = {
  "qwen-3.6": {
    id: "qwen-3.6",
    name: "Qwen 3.6 (Tokamak)",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 32768,
    compat: { supportsTools: true },
  },
};

export function configure(opts: ConfigureOptions): void {
  const home = opts.home ?? homedir();
  const baseUrl = opts.baseUrl ?? "https://api2.ai.tokamak.network";
  const model = opts.model ?? "qwen-3.6";
  const { profile, configDir, config } = paths(home);

  // Shell profile — empty marker block (no env vars for openclaw)
  log.section("OpenClaw — 쉘 프로파일 설정");
  if (opts.dryRun) {
    log.dry(`${profile} 에 TON AI Access 마커 블록 추가 예정 (환경변수 없음)`);
  } else {
    writeEnvBlock(profile, { target: "openclaw", model, extraLines: [] });
    log.ok(`${profile} 마커 블록 추가 완료`);
  }

  // openclaw.json
  log.section("OpenClaw — openclaw.json 설정");

  if (opts.dryRun) {
    log.dry(`${config} 수정 예정:`);
    log.diff("+", "models.providers.litellm.baseUrl", `${baseUrl}/v1`);
    log.diff("+", "agents.defaults.model.primary", `litellm/${model}`);
    return;
  }

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const data = readJson(config) as OpenClawConfig;
  data.models ??= {};
  data.models.providers ??= {};
  data.models.providers["litellm"] = {
    baseUrl: `${baseUrl}/v1`,
    apiKey: opts.apiKey,
    api: "openai-completions",
    models: [MODEL_METADATA[model] ?? { id: model, name: model }],
  };

  data.agents ??= {};
  data.agents.defaults ??= {};
  data.agents.defaults.model ??= {};
  data.agents.defaults.model.primary = `litellm/${model}`;

  writeJson(config, data as Record<string, unknown>);
  log.ok(`${config} 업데이트 완료`);
}

export function revert(opts: RevertOptions): void {
  const home = opts.home ?? homedir();
  const { profile, config } = paths(home);

  // Shell profile
  log.section("OpenClaw — 쉘 프로파일 원복");
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

  // openclaw.json
  log.section("OpenClaw — openclaw.json 원복");
  if (!existsSync(config)) {
    log.warn(`${config} 파일이 없습니다 — 건너뜀`);
    return;
  }

  if (opts.dryRun) {
    log.dry(`${config} 에서 models.providers.litellm 및 agents.defaults.model.primary 제거 예정`);
    log.diff("-", "models.providers.litellm", "");
    log.diff("-", "agents.defaults.model.primary", "(litellm/ 로 시작하는 경우만)");
    return;
  }

  if (opts.backup !== false) backupFile(config);

  const data = readJson(config) as OpenClawConfig;
  if (data.models?.providers) {
    delete data.models.providers["litellm"];
    if (Object.keys(data.models.providers).length === 0) delete data.models.providers;
  }
  if (data.models && Object.keys(data.models).length === 0) {
    delete data.models;
  }

  if (data.agents?.defaults?.model?.primary?.startsWith("litellm/")) {
    delete data.agents.defaults.model.primary;
    if (Object.keys(data.agents.defaults.model).length === 0) delete data.agents.defaults.model;
    if (data.agents.defaults && Object.keys(data.agents.defaults).length === 0) delete data.agents.defaults;
    if (data.agents && Object.keys(data.agents).length === 0) delete data.agents;
  }

  writeJson(config, data as Record<string, unknown>);
  log.ok(`${config} 원복 완료`);
}
