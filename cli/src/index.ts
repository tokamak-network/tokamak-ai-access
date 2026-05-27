import { Command } from "commander";
import pc from "picocolors";
import { runConfigure } from "./commands/configure.js";
import { runRevert, type RevertTarget } from "./commands/revert.js";
import { runEnvCleanup } from "./commands/env-cleanup.js";

declare const __PKG_VERSION__: string;

const program = new Command();

program
  .name("tokamak-ai-access")
  .description("TON AI Access — configure Claude Code, Codex, OpenClaw, Hermes")
  .version(__PKG_VERSION__);

// configure subcommand
program
  .command("configure")
  .description("Configure a CLI with your TON AI Access API key and model")
  .option("--target <t>", "target CLI: claude | codex | openclaw | hermes")
  .option("--api-key <key>", "API key (default: TON_API_KEY env var)")
  .option("--base-url <url>", "API base URL (default: https://api2.ai.tokamak.network)")
  .option("--model <model>", "model to use (default: qwen-3.6)")
  .option("--list-models", "list available models and exit")
  .option("--non-interactive", "run without interactive prompts (--target, --api-key required)")
  .option("--dry-run", "preview changes without modifying files")
  .action(async (opts: {
    target?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    listModels?: boolean;
    nonInteractive?: boolean;
    dryRun?: boolean;
  }) => {
    await runConfigure({
      target: opts.target as "claude" | "codex" | "openclaw" | "hermes" | undefined,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      listModels: opts.listModels,
      nonInteractive: opts.nonInteractive,
      dryRun: opts.dryRun,
    });
  });

// revert subcommand
program
  .command("revert")
  .description("Revert TON AI Access settings")
  .option("--target <t>", "target CLI: claude | codex")
  .option("--non-interactive", "run without interactive prompts (--target required)")
  .option("--dry-run", "preview changes without modifying files")
  .option("--no-backup", "skip .bak backup before reverting")
  .action(async (opts: {
    target?: string;
    nonInteractive?: boolean;
    dryRun?: boolean;
    backup?: boolean;
  }) => {
    await runRevert({
      target: opts.target as RevertTarget | undefined,
      nonInteractive: opts.nonInteractive,
      dryRun: opts.dryRun,
      backup: opts.backup,
    });
  });

// cleanup-env subcommand
program
  .command("cleanup-env")
  .description("Clean up TON AI Access env vars from the current session")
  .action(async () => {
    await runEnvCleanup({ restore: false });
  });

// restore-env subcommand
program
  .command("restore-env")
  .description("Restore env vars from backup")
  .action(async () => {
    await runEnvCleanup({ restore: true });
  });

// no subcommand → interactive top-level menu
if (process.argv.length <= 2) {
  (async () => {
    console.log("");
    console.log(pc.bold(pc.blue("── TON AI Access — CLI Manager ──────────────────────────────────────")));
    const { promptTopLevel } = await import("./lib/prompts.js");
    const action = await promptTopLevel();
    if (action === "configure") {
      await runConfigure({});
    } else {
      await runRevert({});
    }
  })();
} else {
  program.parseAsync(process.argv).catch((e: unknown) => {
    console.error(pc.red(String(e)));
    process.exit(1);
  });
}
