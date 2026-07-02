import * as p from "@clack/prompts";
import pc from "picocolors";
import { MODELS } from "./models.js";

export type Target = "claude" | "codex" | "openclaw" | "hermes" | "opencode";

export async function promptTarget(): Promise<Target> {
  const value = await p.select<Target>({
    message: "Select the CLI to configure",
    options: [
      { value: "claude", label: "Claude Code" },
      { value: "codex", label: "Codex CLI" },
      { value: "openclaw", label: "OpenClaw" },
      { value: "hermes", label: "Hermes" },
      { value: "opencode", label: "opencode" },
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
    options: MODELS.map((m) => ({ value: m.value, label: m.label })),
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
