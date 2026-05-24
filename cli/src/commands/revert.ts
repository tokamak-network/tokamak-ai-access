import * as claude from "../targets/claude.js";
import * as codex from "../targets/codex.js";
import { log } from "../lib/logger.js";
export type RevertTarget = "claude" | "codex";
import pc from "picocolors";

export interface RevertCommandOptions {
  target?: RevertTarget;
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

  const revertOpts = { dryRun: opts.dryRun, backup: opts.backup !== false };

  switch (target) {
    case "claude":    claude.revert(revertOpts); break;
    case "codex":     codex.revert(revertOpts); break;
  }

  if (opts.dryRun) {
    console.log("");
    log.info("Dry-run 완료 — 실제 파일은 변경되지 않았습니다.");
  } else {
    console.log("");
    log.ok("원복 완료! 쉘을 재시작하세요.");
  }
}
