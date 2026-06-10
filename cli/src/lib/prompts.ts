import * as p from "@clack/prompts";
import pc from "picocolors";

export type Target = "claude" | "codex" | "openclaw" | "hermes";

export async function promptTarget(): Promise<Target> {
  const value = await p.select<Target>({
    message: "Select the CLI to configure",
    options: [
      { value: "claude", label: "Claude Code" },
      { value: "codex", label: "Codex CLI" },
      { value: "openclaw", label: "OpenClaw" },
      { value: "hermes", label: "Hermes" },
    ],
  });
  if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
  return value as Target;
}

export async function promptRevertTarget(): Promise<"claude" | "codex"> {
  const value = await p.select<"claude" | "codex">({
    message: "Select the CLI to revert",
    options: [
      { value: "claude", label: "Claude Code" },
      { value: "codex", label: "Codex CLI" },
    ],
  });
  if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
  return value as "claude" | "codex";
}

export async function promptModel(): Promise<string> {
  const value = await p.select<string>({
    message: "Select a model",
    options: [
      { value: "qwen-3.6", label: "Qwen 3.6 (Recommended)" },
      { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { value: "gemma-4", label: "Gemma 4" },
    ],
  });
  if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
  return value as string;
}

export async function promptApiKey(envKey?: string): Promise<string> {
  if (envKey) return envKey;
  const value = await p.password({
    message: "Enter your TON AI Access API key",
  });
  if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
  return value as string;
}

export async function promptTopLevel(): Promise<"configure" | "revert" | "exit"> {
  console.log("");
  console.log(pc.bold("── TON AI Access — CLI Manager ──────────────────────────────────────"));
  const value = await p.select<"configure" | "revert" | "exit">({
    message: "Select an action",
    options: [
      { value: "configure", label: "Configure  — Set API key and model for a CLI" },
      { value: "revert", label: "Revert     — Restore original settings" },
      { value: "exit", label: "Exit" },
    ],
  });
  if (p.isCancel(value) || value === "exit") { p.cancel("Exiting."); process.exit(0); }
  return value as "configure" | "revert";
}
