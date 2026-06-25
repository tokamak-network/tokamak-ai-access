import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { generateLiteLLMKey, revokeLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, hashKey } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { assertRotateCooldown, assertEligibility, assertMainnetOnly, type PurchaseRecord } from "@/lib/key-guards";

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
    assertMainnetOnly();
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

  // Determine keyType: active purchase record → 'purchase', else → 'stake'
  const purchase = await kvGet<PurchaseRecord>(`purchase:${address}`);
  const keyType: 'stake' | 'purchase' =
    (purchase && purchase.expiresAt > Date.now()) ? 'purchase' : 'stake';

  const { key, keyId, expiresAt } = await generateLiteLLMKey(address, keyType);
  await kvSet(`key:${address}`, {
    liteLlmKeyId: keyId,
    hash: hashKey(key),
    keySlice: key.slice(-4),
    createdAt: Date.now(),
    ...(expiresAt !== undefined && { expiresAt }),
    lastRotatedAt: Date.now(),
  });

  return NextResponse.json({ key, expiresAt });
}
