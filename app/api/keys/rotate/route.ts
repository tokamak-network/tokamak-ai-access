import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { generateLiteLLMKey, revokeLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, hashKey } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { assertRotateCooldown, assertEligibility } from "@/lib/key-guards";

/**
 * POST /api/keys/rotate
 * Auth: session cookie
 * Revokes existing LiteLLM key, generates a new one.
 * Response (one-time): { key, expiresAt }
 */
export async function POST(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, address);
  if (rl) return rl;

  try {
    await assertRotateCooldown(address);
    await assertEligibility(address);
  } catch (err) {
    return err as NextResponse;
  }

  // Revoke old key if present — archive to key:{address}:prev before overwriting
  const existing = await kvGet<{ liteLlmKeyId: string; hash: string; createdAt: number }>(`key:${address}`);
  if (existing?.liteLlmKeyId) {
    await revokeLiteLLMKey(existing.liteLlmKeyId).catch(console.error);
    // Preserve revocation record (audit trail)
    await kvSet(`key:${address}:prev`, { ...existing, revokedAt: Date.now() });
  }

  // Issue new key
  const { key, keyId, expiresAt } = await generateLiteLLMKey(address);
  await kvSet(`key:${address}`, {
    liteLlmKeyId: keyId,
    hash: hashKey(key),
    keySlice: key.slice(-4),
    createdAt: Date.now(),
    expiresAt,
    lastRotatedAt: Date.now(),
  });

  return NextResponse.json({ key, expiresAt });
}
