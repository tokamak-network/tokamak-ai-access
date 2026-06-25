/**
 * Hourly cron job: revoke API keys for unstaked addresses (F-01)
 *
 * Flow:
 * 1. Verify CRON_SECRET header
 * 2. Scan all key:{address} records in KV
 * 3. For each non-revoked key, check staking balance
 * 4. Revoke keys where balance < MIN_TON_WEI
 * 5. Update stats:active-keys with current count (drift correction)
 * 6. Return { revoked, total }
 */

import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, kvKeys } from "@/lib/kv";
import { getTotalStakedTON, MIN_TON } from "@/lib/staking";
import { revokeLiteLLMKey } from "@/lib/litellm";
import type { KeyRecord, PurchaseRecord } from "@/lib/key-guards";

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  // ---- Authorization check ----
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ---- Compute MIN_TON_WEI ----
    const MIN_TON_WEI = MIN_TON * 10n ** 18n;

    // ---- Scan all key:{address} records (chain-scoped; kvKeys strips the {chain}: prefix) ----
    const keyPatterns = await kvKeys("key:*");
    if (!keyPatterns) {
      console.log("[cron] check-stakes: no keys found");
      return NextResponse.json({ revoked: 0, total: 0, status: "success" }, { status: 200 });
    }

    // Keep only bare key:{address} records. Suffixed keys (key:{addr}:lock,
    // key:{addr}:prev) share the key:* glob but must not be scanned — :prev is an
    // archived previous key whose liteLlmKeyId would otherwise get wrongly revoked.
    const cleanKeys: string[] = [];
    for (const pattern of keyPatterns) {
      if (!pattern.slice(4).includes(":")) {
        cleanKeys.push(pattern);
      }
    }

    console.log(`[cron] check-stakes started: ${cleanKeys.length} keys to check`);

    let revokeCount = 0;
    let activeCount = 0;

    // ---- Process each key ----
    for (const keyPattern of cleanKeys) {
      const record = await kvGet<KeyRecord>(keyPattern);
      if (!record) continue;

      // Skip if already revoked
      if (record.revokedAt) {
        continue;
      }

      // Extract address from key pattern (format: key:{address})
      const address = keyPattern.substring(4); // strip "key:" prefix

      // Check staking balance
      const balance = await getTotalStakedTON(address);

      if (balance < MIN_TON_WEI) {
        // Purchase exemption: skip revoke if active purchase exists
        const purchase = await kvGet<PurchaseRecord>(`purchase:${address}`);
        if (purchase && purchase.expiresAt > Date.now()) {
          activeCount++;
          continue;
        }

        // Revoke the key
        try {
          await revokeLiteLLMKey(record.liteLlmKeyId);
        } catch (error) {
          console.error(
            `[cron] failed to revoke LiteLLM key ${record.liteLlmKeyId} for ${address}:`,
            error,
          );
          // Continue processing other keys even if one fails
        }

        // Mark as revoked in KV
        const updatedRecord: KeyRecord = {
          ...record,
          revokedAt: Date.now(),
        };
        await kvSet(keyPattern, updatedRecord);

        revokeCount++;
      } else {
        // Key is still active
        activeCount++;
      }
    }

    // ---- Drift correction: SET stats:active-keys to actual count ----
    await kvSet("stats:active-keys", activeCount);

    console.log(`[cron] check-stakes done: revoked=${revokeCount} active=${activeCount} total=${cleanKeys.length}`);

    return NextResponse.json(
      {
        revoked: revokeCount,
        total: cleanKeys.length,
        activeCount,
        status: "success",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[cron] check-stakes error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
