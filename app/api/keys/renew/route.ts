import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { renewLiteLLMKey } from "@/lib/litellm";
import { kvGet, kvSet } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { assertEligibility, assertMainnetOnly } from "@/lib/key-guards";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface KeyRecord {
  liteLlmKeyId: string;
  hash: string;
  keySlice?: string;
  createdAt: number;
  expiresAt?: string;
  revokedAt?: number;
}

/**
 * POST /api/keys/renew
 * Extends the current key's expiry by 30d without changing the key value.
 * Only allowed after 30 days from issuance to prevent fraud.
 * Response: { expiresAt: string }
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
    await assertEligibility(address);
  } catch (err) {
    return err as NextResponse;
  }

  const existing = await kvGet<KeyRecord>(`key:${address}`);
  if (!existing || existing.revokedAt) {
    return NextResponse.json({ error: "No active key" }, { status: 404 });
  }

  // Staking keys have no expiry — GitHub Actions handles revocation on unstake
  if (!existing.expiresAt) {
    return NextResponse.json({ expiresAt: null, noOp: true });
  }

  const renewableAfter = existing.createdAt + THIRTY_DAYS_MS;
  if (Date.now() < renewableAfter) {
    const daysLeft = Math.ceil((renewableAfter - Date.now()) / (1000 * 60 * 60 * 24));
    return NextResponse.json({ error: "Not yet renewable", daysLeft }, { status: 403 });
  }

  const { expiresAt } = await renewLiteLLMKey(existing.liteLlmKeyId);
  await kvSet(`key:${address}`, { ...existing, expiresAt });

  return NextResponse.json({ expiresAt });
}
