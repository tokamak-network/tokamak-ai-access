import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { kvGet } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";

/**
 * GET /api/keys/me
 * Auth: session cookie
 * Response: { hasActiveKey: boolean, createdAt?: string, lastFour?: string }
 *
 * NOTE: The actual key value is never stored server-side (§1 D6). lastFour is a slice of the hash.
 */
export async function GET(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, address);
  if (rl) return rl;

  const record = await kvGet<{
    liteLlmKeyId: string;
    hash: string;
    createdAt: number;
    revokedAt?: number;
  }>(`key:${address}`);

  if (!record || record.revokedAt) {
    return NextResponse.json({ hasActiveKey: false });
  }

  return NextResponse.json({
    hasActiveKey: true,
    createdAt: new Date(record.createdAt).toISOString(),
    lastFour: record.hash.slice(-4),
  });
}
