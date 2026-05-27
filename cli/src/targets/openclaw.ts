import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { writeEnvBlock, detectShellProfile } from "../lib/shell-profile.js";
import { readJson, writeJson } from "../lib/json-merge.js";
import { log } from "../lib/logger.js";

export interface ConfigureOptions {
  home?: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  dryRun?: boolean;
}

interface OpenClawConfig {
  models?: {
    providers?: Record<string, unknown>;
  };
  agents?: {
    defaults?: {
      model?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function clearSessionModels(home: string, dryRun: boolean): void {
  const agentsDir = join(home, ".openclaw", "agents");
  if (!existsSync(agentsDir)) return;

  const agentDirs = readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => join(agentsDir, d.name));

  for (const agentDir of agentDirs) {
    const sessionsFile = join(agentDir, "sessions", "sessions.json");
    if (!existsSync(sessionsFile)) continue;

    if (dryRun) {
      log.dry(`${sessionsFile} 모델 설정 초기화 예정`);
      continue;
    }

    try {
      const sessions = readJson(sessionsFile) as Record<string, Record<string, unknown>>;
      let changed = false;
      for (const entry of Object.values(sessions)) {
        if (entry.model !== undefined || entry.modelProvider !== undefined ||
            entry.modelOverride !== undefined || entry.providerOverride !== undefined) {
          delete entry.model;
          delete entry.modelProvider;
          delete entry.modelOverride;
          delete entry.providerOverride;
          changed = true;
        }
      }
      if (changed) {
        writeJson(sessionsFile, sessions as Record<string, unknown>);
        log.ok(`${sessionsFile} 모델 설정 초기화 완료`);
      }
    } catch {
      log.info(`${sessionsFile} 처리 중 오류 — 건너뜀`);
    }
  }
}

function paths(home: string) {
  return {
    profile: detectShellProfile(home),
    configDir: join(home, ".openclaw"),
    config: join(home, ".openclaw", "openclaw.json"),
  };
}

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
    log.diff("+", "models.providers.litellm.models", `[{ id: "${model}", name: "${model}" }]`);
    log.diff("+", "agents.defaults.model", `litellm/${model}`);
    log.section("OpenClaw — 세션 모델 초기화");
    clearSessionModels(home, true);
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
    models: [{ id: model, name: model }],
  };
  data.agents ??= {};
  data.agents.defaults ??= {};
  data.agents.defaults.model = `litellm/${model}`;

  const hadExisting = existsSync(config);
  if (hadExisting) copyFileSync(config, config + ".bak");
  writeJson(config, data as Record<string, unknown>);
  log.ok(`${config} 업데이트 완료`);
  if (hadExisting) log.info(`복원 필요 시: cp ${config}.bak ${config}`);

  log.section("OpenClaw — 세션 모델 초기화");
  clearSessionModels(home, false);

  log.section("OpenClaw — 게이트웨이 재시작");
  try {
    execSync("openclaw gateway restart", { stdio: "inherit" });
    log.ok("OpenClaw 게이트웨이 재시작 완료");
  } catch {
    log.info("OpenClaw 게이트웨이 재시작 실패 — 수동으로 재시작해주세요: openclaw gateway restart");
  }
}
