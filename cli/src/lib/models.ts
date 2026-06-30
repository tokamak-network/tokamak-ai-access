export interface ModelInfo {
  value: string;
  label: string;
  /** Max context window in tokens, used for codex's model_context_window. */
  contextWindow: number;
}

// Single source of truth for selectable models. Add a model here and both the
// interactive picker (prompts.ts) and codex's config.toml pick it up.
export const MODELS: ModelInfo[] = [
  { value: "qwen-3.6", label: "Qwen 3.6 (Recommended)", contextWindow: 262144 },
  { value: "gemma-4", label: "Gemma 4", contextWindow: 262144 },
];

export function getContextWindow(model: string): number | undefined {
  return MODELS.find((m) => m.value === model)?.contextWindow;
}
