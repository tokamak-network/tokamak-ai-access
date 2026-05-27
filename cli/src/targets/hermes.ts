import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { log } from "../lib/logger.js";

export interface ConfigureOptions {
  home?: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  dryRun?: boolean;
}

function paths(home: string) {
  return {
    configDir: join(home, ".hermes"),
    config: join(home, ".hermes", "config.yaml"),
  };
}

function tryRestartGateway(home: string): void {
  const candidates = ["hermes", join(home, ".local", "bin", "hermes")];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ["gateway", "restart"], { stdio: "pipe", timeout: 30_000 });
      log.ok("Gateway restarted — new API key is active");
      return;
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & { killed?: boolean; stderr?: Buffer };
      if (e.code === "ENOENT") continue;
      const detail = e.killed
        ? "timeout (30s)"
        : (e.stderr?.toString().trim() ?? e.message ?? String(e));
      log.warn(`Gateway restart failed (${detail}) — run manually: hermes gateway restart`);
      return;
    }
  }
  log.info("hermes binary not found — settings saved, will apply on next launch");
}

export function configure(opts: ConfigureOptions): void {
  const home = opts.home ?? homedir();
  const baseUrl = opts.baseUrl ?? "https://api2.ai.tokamak.network";
  const model = opts.model ?? "qwen-3.6";
  const { configDir, config } = paths(home);

  log.section("Hermes — config.yaml");

  if (opts.dryRun) {
    log.dry(`${config}: will be updated:`);
    log.diff("+", "model.default", model);
    log.diff("+", "model.base_url", `${baseUrl}/v1`);
    log.diff("+", "custom_providers[tokamak].base_url", `${baseUrl}/v1`);
    log.dry("hermes gateway restart will be run");
    return;
  }

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const hadExisting = existsSync(config);
  const existing = hadExisting ? readFileSync(config, "utf8") : "";
  if (hadExisting) copyFileSync(config, config + ".bak");

  let data: Record<string, unknown>;
  try {
    data = (parse(existing) as Record<string, unknown>) ?? {};
  } catch {
    throw new Error(`${config}: YAML is corrupted. Fix it manually or restore from .bak.`);
  }

  const modelValue = {
    default: model,
    provider: "custom",
    base_url: `${baseUrl}/v1`,
    api_key: opts.apiKey,
    api_mode: "chat_completions",
  };

  const tokamakProvider = {
    name: "tokamak",
    base_url: `${baseUrl}/v1`,
    api_key: opts.apiKey,
    api_mode: "chat_completions",
  };

  const existingProviders = Array.isArray(data.custom_providers)
    ? (data.custom_providers as Array<Record<string, unknown>>)
    : [];
  const custom_providers = [
    ...existingProviders.filter((p) => p.name !== "tokamak"),
    tokamakProvider,
  ];

  // Preserve key position if model: already exists; otherwise prepend so Hermes reads it first
  const base = "model" in data
    ? { ...data, model: modelValue }
    : { model: modelValue, ...data };

  const out = { ...base, custom_providers };

  writeFileSync(config, stringify(out));
  log.ok(`${config}: updated`);
  if (hadExisting) log.info(`To restore: cp ${config}.bak ${config}`);

  tryRestartGateway(home);
}
