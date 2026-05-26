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
      execFileSync(bin, ["gateway", "restart"], { stdio: "pipe", timeout: 10_000 });
      log.ok("Gateway 재시작 완료 — 새 API 키가 즉시 적용됩니다");
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      log.warn("Gateway 재시작 실패 — 수동으로 실행하세요: hermes gateway restart");
      return;
    }
  }
  log.info("hermes 바이너리를 찾을 수 없습니다 — 설정 변경은 저장되었으나 다음 실행 시 적용됩니다");
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
    log.diff("+", "custom_providers[tokamak].base_url", `${baseUrl}/v1`);
    log.dry("hermes gateway restart 실행 예정");
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
    throw new Error(`${config}: YAML이 손상되었습니다. 수동으로 수정하거나 .bak 파일을 복원하세요.`);
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
  log.ok(`${config} 업데이트 완료`);
  if (hadExisting) log.info(`복원 필요 시: cp ${config}.bak ${config}`);

  tryRestartGateway(home);
}
