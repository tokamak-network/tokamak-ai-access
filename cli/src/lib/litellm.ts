export interface LiteLLMModel {
  id: string;
  object: string;
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<LiteLLMModel[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: LiteLLMModel[] };
  return json.data ?? [];
}

export const CLAUDE_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
] as const;

export type ClaudeEnvKey = (typeof CLAUDE_ENV_KEYS)[number];
