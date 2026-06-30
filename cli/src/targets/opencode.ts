import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJson, writeJson } from "../lib/json-merge.js";
import { log } from "../lib/logger.js";

export interface ConfigureOptions {
  home?: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  dryRun?: boolean;
}

interface OpencodeConfig {
  $schema?: string;
  model?: string;
  provider?: Record<string, unknown>;
  [key: string]: unknown;
}

function paths(home: string) {
  const configHome = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");
  return {
    configDir: join(configHome, "opencode"),
    config: join(configHome, "opencode", "opencode.json"),
  };
}

export function configure(opts: ConfigureOptions): void {
  const home = opts.home ?? homedir();
  const baseUrl = opts.baseUrl ?? "https://api2.ai.tokamak.network";
  const model = opts.model ?? "qwen-3.6";
  const { configDir, config } = paths(home);

  log.section("opencode — opencode.json");

  if (opts.dryRun) {
    log.dry(`${config}: will be updated:`);
    log.diff("+", "model", `litellm/${model}`);
    log.diff("+", "provider.litellm.options.baseURL", `${baseUrl}/v1`);
    log.diff("+", "provider.litellm.models", `{ "${model}": { name: "${model}" } }`);
    return;
  }

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const data = readJson(config) as OpencodeConfig;
  data["$schema"] = "https://opencode.ai/config.json";
  data.model = `litellm/${model}`;
  data.provider ??= {};
  data.provider["litellm"] = {
    npm: "@ai-sdk/openai-compatible",
    name: "TON AI Access (LiteLLM)",
    options: { baseURL: `${baseUrl}/v1`, apiKey: opts.apiKey },
    models: { [model]: { name: model } },
  };

  const hadExisting = existsSync(config);
  if (hadExisting) copyFileSync(config, config + ".bak");
  writeJson(config, data as Record<string, unknown>);
  log.ok(`${config}: updated`);
  if (hadExisting) log.info(`To restore: cp ${config}.bak ${config}`);
}
