/**
 * Integration tests — LiteLLM key lifecycle
 *
 * Calls the real LiteLLM server at LITELLM_BASE_URL.
 * Run with: npm run test:integration
 *
 * Skipped automatically when LITELLM_BASE_URL or LITELLM_MASTER_KEY is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateLiteLLMKey, revokeLiteLLMKey } from "@/lib/litellm";

const BASE_URL   = process.env.LITELLM_BASE_URL;
const MASTER_KEY = process.env.LITELLM_MASTER_KEY;
const hasEnv     = !!BASE_URL && !!MASTER_KEY;

// Integration tests are skipped in unit-test runs (env vars not loaded)
const itLive = hasEnv ? it : it.skip;

// Unique suffix per run — prevents key_alias conflicts across test runs
const RUN_ID = Date.now().toString(36);

function testAddr(tag: string) {
  return `0xtest-${RUN_ID}-${tag}` as const;
}

// Keys created during the run — cleaned up in afterAll
const createdKeys: string[] = [];

// Shared key used by read-only tests (shape, /key/info, chat completion)
let sharedKey  = "";
let sharedKeyId = "";

beforeAll(async () => {
  if (!hasEnv) return;
  const result = await generateLiteLLMKey(testAddr("shared"));
  sharedKey   = result.key;
  sharedKeyId = result.keyId;
  createdKeys.push(result.keyId);
});

afterAll(async () => {
  for (const key of createdKeys) {
    await revokeLiteLLMKey(key).catch(() => {/* already deleted or server unreachable */});
  }
});

// ── /key/generate ────────────────────────────────────────────────────────────
describe("generateLiteLLMKey (live)", () => {
  itLive("returns a valid sk- key with correct shape", () => {
    expect(sharedKey).toMatch(/^sk-/);
    expect(sharedKeyId).toBe(sharedKey);         // keyId = actual token (used for deletion)
  });

  itLive("LiteLLM records user_id and key_alias as wallet address", async () => {
    const addr = testAddr("shared");
    const res  = await fetch(`${BASE_URL}/key/info?key=${sharedKey}`, {
      headers: { Authorization: `Bearer ${MASTER_KEY}` },
    });
    expect(res.status).toBe(200);

    const info = await res.json();
    expect(info.info?.user_id).toBe(addr);
    expect(info.info?.key_alias).toBe(addr);
    expect(info.info?.models).toContain("qwen-3.6");
  });

  itLive("generated key is usable for a real chat completion", async () => {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${sharedKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:    "qwen-3.6",
        messages: [{ role: "user", content: "Reply with the single word: pong" }],
        max_tokens: 512,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const msg = body.choices?.[0]?.message;
    // qwen-3.6 is a thinking model: content may arrive after reasoning_content
    expect(msg?.content ?? msg?.reasoning_content).toBeTruthy();
  }, 30_000); // 30 s timeout for model inference
});

// ── /key/delete ──────────────────────────────────────────────────────────────
describe("revokeLiteLLMKey (live)", () => {
  itLive("revokes a key so it can no longer be used", async () => {
    const { key, keyId } = await generateLiteLLMKey(testAddr("revoke"));
    // Do NOT push to createdKeys — this test deletes it itself

    await revokeLiteLLMKey(keyId); // must not throw

    // Confirm the key is rejected for completions
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:    "qwen-3.6",
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    expect(res.status).toBe(401);
  });

  itLive("does not throw when deleting an already-deleted key", async () => {
    const { keyId } = await generateLiteLLMKey(testAddr("double-del"));
    await revokeLiteLLMKey(keyId);
    // Second deletion — should not throw (best-effort semantics)
    await expect(revokeLiteLLMKey(keyId)).resolves.toBeUndefined();
  });
});
