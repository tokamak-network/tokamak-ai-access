import * as p from "@clack/prompts";
import pc from "picocolors";

export type Target = "claude" | "codex" | "openclaw" | "hermes";

export async function promptTarget(): Promise<Target> {
  const value = await p.select<Target>({
    message: "설정할 CLI를 선택하세요",
    options: [
      { value: "claude", label: "Claude Code" },
      { value: "codex", label: "Codex CLI" },
      { value: "openclaw", label: "OpenClaw" },
      { value: "hermes", label: "Hermes" },
    ],
  });
  if (p.isCancel(value)) { p.cancel("취소되었습니다."); process.exit(0); }
  return value as Target;
}

export async function promptRevertTarget(): Promise<"claude" | "codex" | "all"> {
  const value = await p.select<"claude" | "codex" | "all">({
    message: "원복할 CLI를 선택하세요",
    options: [
      { value: "claude", label: "Claude Code" },
      { value: "codex", label: "Codex CLI" },
      { value: "all", label: "전체 원복" },
    ],
  });
  if (p.isCancel(value)) { p.cancel("취소되었습니다."); process.exit(0); }
  return value as "claude" | "codex" | "all";
}

export async function promptApiKey(envKey?: string): Promise<string> {
  if (envKey) return envKey;
  const value = await p.password({
    message: "TON AI Access API 키를 입력하세요 (https://ai.tokamak.network 에서 발급)",
  });
  if (p.isCancel(value)) { p.cancel("취소되었습니다."); process.exit(0); }
  return value as string;
}

export async function promptTopLevel(): Promise<"configure" | "revert" | "exit"> {
  console.log("");
  console.log(pc.bold("── TON AI Access — CLI 관리자 ────────────────────────────────────────"));
  const value = await p.select<"configure" | "revert" | "exit">({
    message: "작업을 선택하세요",
    options: [
      { value: "configure", label: "Configure  — CLI에 API 키와 모델 설정" },
      { value: "revert", label: "Revert     — 설정 원복" },
      { value: "exit", label: "Exit" },
    ],
  });
  if (p.isCancel(value) || value === "exit") { p.cancel("종료합니다."); process.exit(0); }
  return value as "configure" | "revert";
}
