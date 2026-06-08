/**
 * LiteLLM virtual key client
 *
 * §0: LiteLLM server at https://api2.ai.tokamak.network
 * §1 D5: master key lives in LITELLM_MASTER_KEY env var only
 * §1 D6: key returned once; only hash stored server-side
 */

interface GenerateKeyResponse {
  key: string;           // virtual key, e.g. sk-litellm-xxxxx
  key_name?: string;
  expires?: string;      // ISO datetime
}

function getConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!baseUrl) throw new Error("LITELLM_BASE_URL env var not set");
  if (!masterKey) throw new Error("LITELLM_MASTER_KEY env var not set");
  return { baseUrl, masterKey };
}

/**
 * Calls POST /key/generate on the LiteLLM server.
 * Returns { key, keyId, expiresAt }.
 *
 * TODO (Day 2 T2.3): confirm exact request/response shape against
 * the live server before wiring into /api/keys/issue.
 */
export async function generateLiteLLMKey(
  ownerAddress: string,
): Promise<{ key: string; keyId: string; expiresAt: string }> {
  const { baseUrl, masterKey } = getConfig();

  const body = {
    user_id:   ownerAddress,                  // LiteLLM user entity — enables per-user budget/rate tracking
    key_alias: ownerAddress,                  // display label in admin UI
    metadata: { owner: ownerAddress },
    duration: "30d",
  };

  const res = await fetch(`${baseUrl}/key/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${masterKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM /key/generate failed (${res.status}): ${text}`);
  }

  const data: GenerateKeyResponse = await res.json();
  return {
    key: data.key,
    keyId: data.key,   // actual token — required by /key/delete; key_name is a label only
    expiresAt: data.expires ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  };
}

/**
 * Calls POST /key/delete on the LiteLLM server to revoke a key by ID.
 */
export async function revokeLiteLLMKey(keyId: string): Promise<void> {
  const { baseUrl, masterKey } = getConfig();

  const res = await fetch(`${baseUrl}/key/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${masterKey}`,
    },
    body: JSON.stringify({ keys: [keyId] }),
  });

  if (res.status === 404) return; // already deleted — treat as success
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM /key/delete failed (${res.status}): ${text}`);
  }
}
