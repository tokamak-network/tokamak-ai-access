import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeEnvBlock, revertShellProfile, detectShellProfile } from "../lib/shell-profile.js";
import { backupFile } from "../lib/backup.js";
import { log, maskKey } from "../lib/logger.js";
import { hasFileMarker, BLOCK_START } from "../lib/markers.js";
import { getContextWindow } from "../lib/models.js";

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
  log.section("Codex CLI — shell profile");
  const envLines = [
    `export OPENAI_API_KEY="${opts.apiKey}"`,
    `export OPENAI_BASE_URL="${baseUrl}/v1"`,
  ];

  if (opts.dryRun) {
    log.dry(`${profile}: will be updated:`);
    log.diff("+", "OPENAI_API_KEY", maskKey(opts.apiKey));
    log.diff("+", "OPENAI_BASE_URL", `${baseUrl}/v1`);
  } else {
    writeEnvBlock(profile, { target: "codex", model, extraLines: envLines });
    log.ok(`${profile}: env block written`);
  }

  // config.toml
  log.section("Codex CLI — config.toml");
  const contextWindow = getContextWindow(model);
  const tomlContent = [
    `${BLOCK_START} — ${date}`,
    `model = "${model}"`,
    `model_provider = "tokamak"`,
    ...(contextWindow !== undefined ? [`model_context_window = ${contextWindow}`] : []),
    ``,
    `[model_providers.tokamak]`,
    `name = "TON AI Access (LiteLLM)"`,
    `base_url = "${baseUrl}/v1"`,
    `env_key = "OPENAI_API_KEY"`,
  ].join("\n") + "\n";

  if (opts.dryRun) {
    log.dry(`${config}: will be overwritten:`);
    log.diff("+", "model", model);
    log.diff("+", "model_provider", "tokamak");
    log.diff("+", "base_url", `${baseUrl}/v1`);
  } else {
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    writeFileSync(config, tomlContent);
    log.ok(`${config}: written`);
  }
}

export function revert(opts: RevertOptions): void {
  const home = opts.home ?? homedir();
  const { profile, config } = paths(home);

  // Shell profile
  log.section("Codex CLI — shell profile revert");
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

  // config.toml
  log.section("Codex CLI — config.toml revert");
  if (!existsSync(config)) {
    log.warn(`${config}: file not found — skipping`);
    return;
  }

  const content = readFileSync(config, "utf8");
  if (!hasFileMarker(content)) {
    log.warn(`${config}: not written by TON AI Access — preserving`);
    return;
  }

  if (opts.dryRun) {
    log.dry(`${config}: will be deleted (TON AI Access marker confirmed)`);
  } else {
    if (opts.backup !== false) backupFile(config);
    rmSync(config);
    log.ok(`${config}: deleted`);
  }
}
