import * as claude from "../targets/claude.js";
import * as codex from "../targets/codex.js";
import * as openclaw from "../targets/openclaw.js";
import * as hermes from "../targets/hermes.js";
import * as opencode from "../targets/opencode.js";
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
  const isTTY = process.stdin.isTTY === true;
  const nonInteractive = opts.nonInteractive || !isTTY;
  const defaultModel = "qwen-3.6";

  if (opts.listModels) {
    const apiKey = opts.apiKey ?? process.env["TON_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
    if (!apiKey) {
      log.err("API key required for model listing. Set --api-key or TON_API_KEY env var.");
      process.exit(1);
    }
    try {
      const models = await fetchModels(baseUrl, apiKey);
      console.log(pc.bold("\nAvailable models:"));
      for (const m of models) console.log(`  ${m.id}`);
    } catch (e) {
      log.err(`Failed to list models: ${String(e)}`);
      process.exit(1);
    }
    return;
  }

  let target = opts.target;
  if (!target) {
    if (nonInteractive) {
      log.err("--target is required in non-interactive mode (no TTY detected).");
      process.exit(1);
    }
    const { promptTarget } = await import("../lib/prompts.js");
    target = await promptTarget();
  }

  let model = opts.model;
  if (!model) {
    if (nonInteractive) {
      model = defaultModel;
    } else {
      const { promptModel } = await import("../lib/prompts.js");
      model = await promptModel();
    }
  }

  let apiKey = opts.apiKey ?? process.env["TON_API_KEY"] ?? "";
  if (!apiKey) {
    if (nonInteractive) {
      log.err("--api-key or TON_API_KEY env var is required in non-interactive mode (no TTY detected).");
      process.exit(1);
    }
    const { promptApiKey } = await import("../lib/prompts.js");
    apiKey = await promptApiKey();
  }

  console.log("");
  console.log(pc.bold(pc.blue("── TON AI Access — CLI Configurator ──────────────────────────────────")));

  const configOpts = { apiKey, baseUrl, model, dryRun: opts.dryRun };

  switch (target) {
    case "claude":    claude.configure(configOpts); break;
    case "codex":     codex.configure(configOpts); break;
    case "openclaw":  openclaw.configure(configOpts); break;
    case "hermes":    hermes.configure(configOpts); break;
    case "opencode":  opencode.configure(configOpts); break;
  }

  if (opts.dryRun) {
    console.log("");
    log.info("Dry-run complete — no files were modified.");
  } else {
    console.log("");
    if (target === "claude") {
      log.ok("Setup complete! Restart your shell and Claude Code:");
      log.info("  1) source ~/.zshrc (or ~/.bashrc)");
      log.info("  2) Fully quit and relaunch Claude Code");
    } else if (target === "openclaw") {
      log.ok("Setup complete! openclaw.json is applied automatically.");
    } else if (target === "opencode") {
      log.ok("Setup complete! opencode.json is applied automatically.");
    } else if (target !== "hermes") {
      log.ok("Setup complete! Restart your shell or run `source ~/.zshrc`.");
    }
  }
}
