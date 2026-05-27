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
      log.dry(`${sessionsFile}: model settings will be reset`);
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
        log.ok(`${sessionsFile}: model settings reset`);
      }
    } catch {
      log.info(`${sessionsFile}: error during processing — skipping`);
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
  log.section("OpenClaw — shell profile");
  if (opts.dryRun) {
    log.dry(`${profile}: TON AI Access marker block will be added (no env vars)`);
  } else {
    writeEnvBlock(profile, { target: "openclaw", model, extraLines: [] });
    log.ok(`${profile}: marker block added`);
  }

  // openclaw.json
  log.section("OpenClaw — openclaw.json");

  if (opts.dryRun) {
    log.dry(`${config}: will be updated:`);
    log.diff("+", "models.providers.litellm.baseUrl", `${baseUrl}/v1`);
    log.diff("+", "models.providers.litellm.models", `[{ id: "${model}", name: "${model}" }]`);
    log.diff("+", "agents.defaults.model", `litellm/${model}`);
    log.section("OpenClaw — session model reset");
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
  log.ok(`${config}: updated`);
  if (hadExisting) log.info(`To restore: cp ${config}.bak ${config}`);

  log.section("OpenClaw — session model reset");
  clearSessionModels(home, false);

  log.section("OpenClaw — gateway restart");
  try {
    execSync("openclaw gateway restart", { stdio: "inherit" });
    log.ok("OpenClaw gateway restarted");
  } catch {
    log.info("OpenClaw gateway restart failed — run manually: openclaw gateway restart");
  }
}
