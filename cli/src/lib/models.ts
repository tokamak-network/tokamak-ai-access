export interface ModelInfo {
  value: string;
  label: string;
  type: "chat" | "image";
  /** Max context window in tokens, used for codex's model_context_window. Chat only. */
  contextWindow?: number;
}

// Single source of truth for models the gateway serves. Chat models feed the
// interactive picker (via CHAT_MODELS) and codex's model_context_window.
// Image models are surfaced for documentation only — coding tools can't use them.
export const MODELS: ModelInfo[] = [
  { value: "qwen-3.6", label: "Qwen 3.6 (Recommended)", type: "chat", contextWindow: 262144 },
  { value: "gemma-4", label: "Gemma 4", type: "chat", contextWindow: 262144 },
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash", type: "chat", contextWindow: 262144 },
  { value: "glm-5.2", label: "GLM 5.2", type: "chat", contextWindow: 262144 },
  { value: "z-image", label: "Z-Image", type: "image" },
  { value: "flux-2-klein", label: "FLUX.2 Klein", type: "image" },
  { value: "krea-2-turbo", label: "Krea 2 Turbo", type: "image" },
];

// Models selectable when configuring a coding tool (claude/codex/opencode/…).
export const CHAT_MODELS: ModelInfo[] = MODELS.filter((m) => m.type === "chat");

export function getContextWindow(model: string): number | undefined {
  return MODELS.find((m) => m.value === model)?.contextWindow;
}
