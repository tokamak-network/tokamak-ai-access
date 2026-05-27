import * as claude from "../targets/claude.js";
import * as codex from "../targets/codex.js";
import * as openclaw from "../targets/openclaw.js";
import * as hermes from "../targets/hermes.js";
import { fetchModels } from "../lib/litellm.js";
import { log } from "../lib/logger.js";
import type { Target } from "../lib/prompts.js";
import pc from "picocolors";

export interface ConfigureCommandOptions {
  target?: Target;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  listModels?: boolean;
  nonInteractive?: boolean;
  dryRun?: boolean;
}

export async function runConfigure(opts: ConfigureCommandOptions): Promise<void> {
  const baseUrl = opts.baseUrl ?? "https://api2.ai.tokamak.network";

  if (opts.listModels) {
    const apiKey = opts.apiKey ?? process.env["TON_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
    if (!apiKey) {
      log.err("모델 목록 조회에는 API 키가 필요합니다. --api-key 또는 TON_API_KEY 환경변수를 설정하세요.");
      process.exit(1);
    }
    try {
      const models = await fetchModels(baseUrl, apiKey);
      console.log(pc.bold("\n사용 가능한 모델:"));
      for (const m of models) console.log(`  ${m.id}`);
    } catch (e) {
      log.err(`모델 목록 조회 실패: ${String(e)}`);
      process.exit(1);
    }
    return;
  }

  let target = opts.target;
  if (!target) {
    if (opts.nonInteractive) {
      log.err("--non-interactive 모드에서는 --target 을 지정해야 합니다.");
      process.exit(1);
    }
    const { promptTarget } = await import("../lib/prompts.js");
    target = await promptTarget();
  }

  let apiKey = opts.apiKey ?? process.env["TON_API_KEY"] ?? "";
  if (!apiKey) {
    if (opts.nonInteractive) {
      log.err("--non-interactive 모드에서는 --api-key 또는 TON_API_KEY 환경변수를 설정해야 합니다.");
      process.exit(1);
    }
    const { promptApiKey } = await import("../lib/prompts.js");
    apiKey = await promptApiKey();
  }

  console.log("");
  console.log(pc.bold(pc.blue("── TON AI Access — CLI Configurator ──────────────────────────────────")));

  const configOpts = { apiKey, baseUrl, model: opts.model, dryRun: opts.dryRun };

  switch (target) {
    case "claude":    claude.configure(configOpts); break;
    case "codex":     codex.configure(configOpts); break;
    case "openclaw":  openclaw.configure(configOpts); break;
    case "hermes":    hermes.configure(configOpts); break;
  }

  if (opts.dryRun) {
    console.log("");
    log.info("Dry-run 완료 — 실제 파일은 변경되지 않았습니다.");
  } else {
    console.log("");
    if (target === "claude") {
      log.ok("설정 완료! 쉘을 재시작하고 Claude Code를 재시작하세요:");
      log.info("  1) source ~/.zshrc (또는 ~/.bashrc)");
      log.info("  2) Claude Code를 완전히 종료 후 다시 실행");
    } else if (target === "openclaw") {
      log.ok("설정 완료! openclaw.json이 자동으로 반영됩니다.");
    } else if (target !== "hermes") {
      log.ok("설정 완료! 쉘을 재시작하거나 `source ~/.zshrc` 를 실행하세요.");
    }
  }
}
