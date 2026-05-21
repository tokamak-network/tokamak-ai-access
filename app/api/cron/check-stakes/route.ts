import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, kvKeys } from "@/lib/kv";
import { getTotalStakedTON } from "@/lib/staking";
import { revokeLiteLLMKey } from "@/lib/litellm";

const MIN_TON_WEI = BigInt(process.env.MIN_TON ?? "10") * 10n ** 18n;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allKeys = await kvKeys("key:*");
  const addressKeys = allKeys.filter((k) => !k.endsWith(":prev"));

  let checked = 0;
  let revoked = 0;

  for (const kvKey of addressKeys) {
    const address = kvKey.replace(/^key:/, "");
    try {
      const record = await kvGet<{
        liteLlmKeyId: string;
        hash: string;
        keySlice: string;
        createdAt: number;
        expiresAt: string;
        revokedAt?: number;
      }>(kvKey);

      if (!record || record.revokedAt) continue;

      checked++;
      const totalWei = await getTotalStakedTON(address);
      if (totalWei < MIN_TON_WEI) {
        await revokeLiteLLMKey(record.liteLlmKeyId);
        await kvSet(kvKey, { ...record, revokedAt: Date.now() });
        revoked++;
      }
    } catch (err) {
      console.error(`check-stakes: failed for ${address}`, err);
    }
  }

  return NextResponse.json({ checked, revoked });
}
