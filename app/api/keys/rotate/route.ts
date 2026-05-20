import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { getTotalStakedTON } from "@/lib/staking";
import { generateLiteLLMKey, revokeLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, hashKey } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";

const MIN_TON_WEI = BigInt(process.env.MIN_TON ?? "10") * 10n ** 18n;

/**
 * POST /api/keys/rotate
 * Auth: session cookie
 * Revokes existing LiteLLM key, generates a new one.
 * Response (one-time): { key, expiresAt, model }
 */
export async function POST(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, address);
  if (rl) return rl;

  const totalWei = await getTotalStakedTON(address);
  if (totalWei < MIN_TON_WEI) {
    return NextResponse.json({ error: "Insufficient stake" }, { status: 403 });
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
    createdAt: Date.now(),
  });

  return NextResponse.json({ key, expiresAt, model: "qwen-3.6" });
}
