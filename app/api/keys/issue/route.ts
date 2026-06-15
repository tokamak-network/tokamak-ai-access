import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { generateLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, kvDel, kvSetNx, kvIncr, hashKey } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { assertStake, assertKeyCapacity, type KeyRecord } from "@/lib/key-guards";

export async function POST(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, address);
  if (rl) return rl;

  try {
    await assertStake(address);
    await assertKeyCapacity();
  } catch (err) {
    return err as NextResponse;
  }

  // F-04: TOCTOU lock — prevents duplicate issuance from concurrent requests
  const lockKey = `key:${address}:lock`;
  const locked = await kvSetNx(lockKey, 1, 10);
  if (!locked) {
    return NextResponse.json({ error: "Issue in progress" }, { status: 409 });
  }

  try {
    // Check existing key (second-line defense after lock)
    const existing = await kvGet<KeyRecord>(`key:${address}`);
    const isExpired = !!existing?.expiresAt && existing.expiresAt < new Date().toISOString();
    if (existing && !existing.revokedAt && !isExpired) {
      return NextResponse.json({ error: "Key already issued" }, { status: 409 });
    }

    const { key, keyId, expiresAt } = await generateLiteLLMKey(address);

    await kvSet(`key:${address}`, {
      liteLlmKeyId: keyId,
      hash: hashKey(key),
      keySlice: key.slice(-4),
      createdAt: Date.now(),
      expiresAt,
    } satisfies Omit<KeyRecord, "revokedAt" | "lastRotatedAt">);

    // F-03: increment global counter
    await kvIncr("stats:active-keys");

    return NextResponse.json({ key, expiresAt });
  } finally {
    await kvDel(lockKey);
  }
}
