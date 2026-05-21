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
      log.err("복원할 백업이 없습니다. 먼저 configure를 실행하세요.");
      process.exit(1);
    }

    if (isBackupCorrupted()) {
      log.warn("⚠️  백업 파일이 TON AI Access 값을 포함하고 있습니다 (원본이 아님).");
      log.info("복원할 값은 TON 프록시 설정입니다. 원래 Anthropic 키를 수동으로 복원하세요.");
      console.log("");
      log.info("현재 세션에서 TON AI Access 환경변수를 정리하려면 다음을 실행하세요:");
      const { commands } = generateEnvCommands();
      if (commands) console.log(commands);
      console.log("");
      log.info("또는 쉘을 완전히 재시작하세요.");
      return;
    }

    log.section("환경변수 복원");
    log.info("복원할 값:");
    for (const [key, value] of Object.entries(backup.original)) {
      if (value) {
        const masked = key.includes("KEY") ? maskValue(value) : value;
        console.log(`    ${key}="${masked}"`);
      } else {
        console.log(`    ${key}=(unset)`);
      }
    }
    console.log("");
    log.info("현재 세션에서 복원하려면 다음을 실행하세요:");
    const { commands } = generateEnvCommands();
    if (commands) console.log(commands);
    console.log("");
    log.info("또는 쉘을 완전히 재시작하세요.");
  } else {
    const { isBackupCorrupted } = await import("../lib/env-cleanup.js");
    const corrupted = isBackupCorrupted();

    log.section("환경변수 정리");

    if (corrupted) {
      log.warn("⚠️  백업 파일이 TON AI Access 값을 포함하고 있습니다 (원본이 아님).");
      log.info("복구 가능한 원래 값이 없습니다 — 정리만 가능합니다.");
    } else {
      log.info("정리/복원 명령어 생성:");
    }

    console.log("");
    const { commands, warning } = generateEnvCommands();
    if (warning) console.log(warning);
    if (commands) console.log(commands);
    console.log("");
    log.info("현재 세션에서 적용하려면 다음을 실행하세요:");
    log.info("  source <(tokamak-ai-access cleanup-env)");
    console.log("");
  }
}

function maskValue(value: string): string {
  if (value.length <= 12) return value;
  return value.slice(0, 12) + "...";
}
