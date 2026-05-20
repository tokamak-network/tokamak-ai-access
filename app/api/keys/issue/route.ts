import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { getTotalStakedTON } from "@/lib/staking";
import { generateLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, hashKey } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";

const MIN_TON_WEI = BigInt(process.env.MIN_TON ?? "10") * 10n ** 18n;

interface KeyRecord {
  liteLlmKeyId: string;
  hash: string;
  keySlice: string;
  createdAt: number;
  revokedAt?: number;
}

/**
 * POST /api/keys/issue
 * Auth: session cookie
 * Response (one-time): { key: string, expiresAt: string, model: string }
 *
 * §6 flow:
 *  1. Verify session
 *  2. Re-validate staking balance (realtime)
 *  3. Check for existing active key → 409 if present
 *  4. Call LiteLLM /key/generate
 *  5. Store hash + meta in KV
 *  6. Return plain key (only time it's sent to client)
 */
export async function POST(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, address);
  if (rl) return rl;

  // Re-validate balance
  const totalWei = await getTotalStakedTON(address);
  if (totalWei < MIN_TON_WEI) {
    return NextResponse.json({ error: "Insufficient stake" }, { status: 403 });
  }

  // Check existing key
  const existing = await kvGet<KeyRecord>(`key:${address}`);
  if (existing && !existing.revokedAt) {
    return NextResponse.json({ error: "Key already issued" }, { status: 409 });
  }

  // Generate via LiteLLM
  const { key, keyId, expiresAt } = await generateLiteLLMKey(address);

  // Store hash only
  await kvSet(`key:${address}`, {
    liteLlmKeyId: keyId,
    hash: hashKey(key),
    keySlice: key.slice(-4),
    createdAt: Date.now(),
  } satisfies KeyRecord);

  return NextResponse.json({
    key,
    expiresAt,
    model: "qwen-3.6",
  });
}
