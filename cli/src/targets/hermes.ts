import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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

function modelSection(model: string, baseUrl: string, apiKey: string): string {
  return [
    "model:",
    `  default: ${model}`,
    `  provider: custom`,
    `  base_url: ${baseUrl}/v1`,
    `  api_key: ${apiKey}`,
    `  api_mode: chat_completions`,
  ].join("\n");
}

function removeModelSection(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inside = false;

  for (const line of lines) {
    if (!inside && line === "model:") {
      inside = true;
      continue;
    }
    if (inside) {
      if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
        inside = false;
        out.push(line);
      }
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
}

export function configure(opts: ConfigureOptions): void {
  const home = opts.home ?? homedir();
  const baseUrl = opts.baseUrl ?? "https://api2.ai.tokamak.network";
  const model = opts.model ?? "qwen-3.6";
  const { configDir, config } = paths(home);

  log.section("Hermes — config.yaml 설정");

  if (opts.dryRun) {
    log.dry(`${config} 수정 예정:`);
    log.diff("+", "model.default", model);
    log.diff("+", "model.base_url", `${baseUrl}/v1`);
    return;
  }

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const existing = existsSync(config) ? readFileSync(config, "utf8") : "";
  const withoutModel = removeModelSection(existing);
  const section = modelSection(model, baseUrl, opts.apiKey);
  writeFileSync(config, withoutModel.trimEnd() + "\n" + section + "\n");
  log.ok(`${config} 업데이트 완료`);
}
