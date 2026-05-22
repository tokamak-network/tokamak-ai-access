import * as claude from "../targets/claude.js";
import * as codex from "../targets/codex.js";
import * as openclaw from "../targets/openclaw.js";
import * as hermes from "../targets/hermes.js";
import { log } from "../lib/logger.js";
import { injectCleanupBlock, detectShellProfile } from "../lib/shell-profile.js";
import type { Target } from "../lib/prompts.js";
import pc from "picocolors";
import { printRestoreCommands } from "../targets/claude.js";

export interface RevertCommandOptions {
  target?: Target | "all";
  nonInteractive?: boolean;
  dryRun?: boolean;
  backup?: boolean;
}

export async function runRevert(opts: RevertCommandOptions): Promise<void> {
  let target = opts.target;
  if (!target) {
    if (opts.nonInteractive) {
      log.err("--non-interactive 모드에서는 --target 을 지정해야 합니다.");
      process.exit(1);
    }
    const { promptRevertTarget } = await import("../lib/prompts.js");
    target = await promptRevertTarget();
  }

  console.log("");
  console.log(pc.bold(pc.blue("── TON AI Access — CLI Revert ───────────────────────────────────────")));

  const home = process.env.HOME ?? "";
  const profile = home ? detectShellProfile(home) : "";
  const revertOpts = { dryRun: opts.dryRun, backup: opts.backup !== false };
  const targets: Array<Exclude<typeof target, "all">> =
    target === "all" ? ["claude", "codex", "openclaw", "hermes"] : [target];

  for (const t of targets) {
    switch (t) {
      case "claude":    claude.revert(revertOpts); break;
      case "codex":     codex.revert(revertOpts); break;
      case "openclaw":  openclaw.revert(revertOpts); break;
      case "hermes":    hermes.revert(revertOpts); break;
    }
  }

  if (opts.dryRun) {
    console.log("");
    log.info("Dry-run 완료 — 실제 파일은 변경되지 않았습니다.");
  } else {
    console.log("");
    if (target === "claude" || target === "all") {
      if (profile) {
        injectCleanupBlock(profile, { dryRun: false });
        log.ok(`oneshot cleanup 블록 ${profile}에 주입됨`);
        log.info("  다음 쉘 시작 시 TON AI Access 환경변수가 자동 정리됩니다.");
        log.info("");
      }
      log.ok("원복 완료! 쉘을 재시작하면 Claude Code가 원래 설정으로 돌아갑니다:");
      log.info("");
      printRestoreCommands();
    } else {
      log.ok("원복 완료! 쉘을 재시작하거나 `source ~/.zshrc` 를 실행하세요.");
    }
  }
}
