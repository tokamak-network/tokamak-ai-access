import { Command } from "commander";
import pc from "picocolors";
import { runConfigure } from "./commands/configure.js";
import { runRevert } from "./commands/revert.js";
import { runEnvCleanup } from "./commands/env-cleanup.js";

const program = new Command();

program
  .name("tokamak-ai-access")
  .description("TON AI Access — Claude Code, Codex, OpenClaw, Hermes CLI 설정·원복 도구")
  .version("1.0.0");

// configure subcommand
program
  .command("configure")
  .description("CLI에 TON AI Access API 키와 모델을 설정합니다")
  .option("--target <t>", "대상 CLI: claude | codex | openclaw | hermes")
  .option("--api-key <key>", "TON AI Access API 키 (기본: TON_API_KEY 환경변수)")
  .option("--base-url <url>", "API base URL (기본: https://api2.ai.tokamak.network)")
  .option("--model <model>", "사용할 모델 (기본: qwen-3.6)")
  .option("--list-models", "사용 가능한 모델 목록 조회 후 종료")
  .option("--non-interactive", "인터랙티브 prompt 없이 실행 (--target, --api-key 필수)")
  .option("--dry-run", "변경 내용을 미리보기만 합니다 (파일 수정 없음)")
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
  .description("TON AI Access 설정을 원복합니다")
  .option("--target <t>", "대상 CLI: claude | codex | openclaw | hermes | all")
  .option("--non-interactive", "인터랙티브 prompt 없이 실행 (--target 필수)")
  .option("--dry-run", "변경 내용을 미리보기만 합니다 (파일 수정 없음)")
  .option("--no-backup", "원복 전 .bak 파일 생성 생략")
  .action(async (opts: {
    target?: string;
    nonInteractive?: boolean;
    dryRun?: boolean;
    backup?: boolean;
  }) => {
    await runRevert({
      target: opts.target as "claude" | "codex" | "openclaw" | "hermes" | "all" | undefined,
      nonInteractive: opts.nonInteractive,
      dryRun: opts.dryRun,
      backup: opts.backup,
    });
  });

// cleanup-env subcommand
program
  .command("cleanup-env")
  .description("현재 세션의 TON AI Access 환경변수를 정리합니다")
  .action(async () => {
    await runEnvCleanup({ restore: false });
  });

// restore-env subcommand
program
  .command("restore-env")
  .description("백업에서 환경변수를 복원합니다")
  .action(async () => {
    await runEnvCleanup({ restore: true });
  });

// no subcommand → interactive top-level menu
if (process.argv.length <= 2) {
  (async () => {
    console.log("");
    console.log(pc.bold(pc.blue("── TON AI Access — CLI 관리자 ────────────────────────────────────────")));
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
