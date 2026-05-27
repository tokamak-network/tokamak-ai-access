import { log } from "../lib/logger.js";
import { generateEnvCommands } from "../lib/env-cleanup.js";
import pc from "picocolors";

export interface EnvCleanupCommandOptions {
  restore?: boolean;
}

export async function runEnvCleanup(opts: EnvCleanupCommandOptions): Promise<void> {
  console.log("");
  console.log(pc.bold(pc.blue("── TON AI Access — Environment Cleanup ────────────────────────────")));

  if (opts.restore) {
    const { loadEnvBackup, isBackupCorrupted } = await import("../lib/env-cleanup.js");
    const backup = loadEnvBackup();

    if (!backup) {
      log.err("No backup found. Run configure first.");
      process.exit(1);
    }

    if (isBackupCorrupted()) {
      log.warn("Backup contains TON AI Access values (not originals).");
      log.info("The backup holds TON proxy settings. Manually restore your original Anthropic keys.");
      console.log("");
      log.info("To clean up TON AI Access env vars in the current session, run:");
      const { commands } = generateEnvCommands();
      if (commands) console.log(commands);
      console.log("");
      log.info("Or fully restart your shell.");
      return;
    }

    log.section("Restore env vars");
    log.info("Values to restore:");
    for (const [key, value] of Object.entries(backup.original)) {
      if (value) {
        const masked = key.includes("KEY") ? maskValue(value) : value;
        console.log(`    ${key}="${masked}"`);
      } else {
        console.log(`    ${key}=(unset)`);
      }
    }
    console.log("");
    log.info("To restore in the current session, run:");
    const { commands } = generateEnvCommands();
    if (commands) console.log(commands);
    console.log("");
    log.info("Or fully restart your shell.");
  } else {
    const { isBackupCorrupted } = await import("../lib/env-cleanup.js");
    const corrupted = isBackupCorrupted();

    log.section("Clean up env vars");

    if (corrupted) {
      log.warn("Backup contains TON AI Access values (not originals).");
      log.info("No restorable original values — cleanup only.");
    } else {
      log.info("Generating cleanup/restore commands:");
    }

    console.log("");
    const { commands, warning } = generateEnvCommands();
    if (warning) console.log(warning);
    if (commands) console.log(commands);
    console.log("");
    log.info("To apply in the current session, run:");
    log.info("  source <(tokamak-ai-access cleanup-env)");
    console.log("");
  }
}

function maskValue(value: string): string {
  if (value.length <= 12) return value;
  return value.slice(0, 12) + "...";
}
