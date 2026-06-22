import { NextResponse } from "next/server";
import { generateLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet, kvDel, kvSetNx, kvIncr, hashKey } from "@/lib/kv";
import type { KeyRecord } from "@/lib/key-guards";

export async function issueKeyForAddress(
  address: string,
  keyType: 'stake' | 'purchase',
): Promise<NextResponse> {
  const lockKey = `key:${address}:lock`;
  const locked = await kvSetNx(lockKey, 1, 10);
  if (!locked) {
    return NextResponse.json({ error: "Issue in progress" }, { status: 409 });
  }

  try {
    // Check existing key (second-line defense after lock)
    const existing = await kvGet<KeyRecord>(`key:${address}`);
    const isExpired =
      !!existing?.expiresAt && existing.expiresAt < new Date().toISOString();
    if (existing && !existing.revokedAt && !isExpired) {
      return NextResponse.json({ error: "Key already issued" }, { status: 409 });
    }

    const { key, keyId, expiresAt } = await generateLiteLLMKey(address, keyType);

    await kvSet(`key:${address}`, {
      liteLlmKeyId: keyId,
      hash: hashKey(key),
      keySlice: key.slice(-4),
      createdAt: Date.now(),
      ...(expiresAt !== undefined && { expiresAt }),
    } satisfies Omit<KeyRecord, "revokedAt" | "lastRotatedAt">);

    // F-03: increment global counter
    try {
      await kvIncr("stats:active-keys");
    } catch {
      // Best-effort: cron resync corrects drift hourly
    }

    return NextResponse.json({ key, expiresAt: expiresAt ?? null });
  } finally {
    await kvDel(lockKey);
  }
}
