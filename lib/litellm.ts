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
  keyType: 'stake' | 'purchase',
): Promise<{ key: string; keyId: string; expiresAt: string | undefined }> {
  const { baseUrl, masterKey } = getConfig();

  const body: Record<string, unknown> = {
    user_id:               ownerAddress,
    key_alias:             ownerAddress,
    metadata:              { owner: ownerAddress },
    rpm_limit:             300,
    tpm_limit:             2_000_000,
    max_budget:            1.0,       // virtual unit: $1 = 1M output tokens (output_cost_per_token: 0.000001)
    budget_duration:       "1d",      // resets daily
    max_parallel_requests: 30,
  };
  if (keyType === 'purchase') {
    body.duration = "30d";
  }

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
    expiresAt: keyType === 'purchase'
      ? (data.expires ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      : undefined, // stake keys have no expiry — cron removes them on unstake
  };
}

/**
 * Calls POST /key/update on the LiteLLM server to extend expiry by 30 days.
 */
export async function renewLiteLLMKey(keyId: string): Promise<{ expiresAt: string }> {
  const { baseUrl, masterKey } = getConfig();

  const res = await fetch(`${baseUrl}/key/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${masterKey}`,
    },
    body: JSON.stringify({ key: keyId, duration: "30d" }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM /key/update failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
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
