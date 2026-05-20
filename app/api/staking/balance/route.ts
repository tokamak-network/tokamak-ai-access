import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { getTotalStakedTON } from "@/lib/staking";
import { checkRateLimit } from "@/lib/with-rate-limit";

const MIN_TON = BigInt(process.env.MIN_TON ?? "10");
// Convert to 18-decimal bigint for comparison with getTotalStakedTON output
const MIN_TON_WEI = MIN_TON * 10n ** 18n;

/**
 * GET /api/staking/balance
 * Auth: session cookie
 * Response: { address, totalStakedTON: string, eligible: boolean }
 */
export async function GET(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, address);
  if (rl) return rl;

  const totalWei = await getTotalStakedTON(address);
  const eligible = totalWei >= MIN_TON_WEI;

  // Format to human-readable (18 decimals → string with 4 dp)
  const totalTON = Number(totalWei) / 1e18;

  return NextResponse.json({
    address,
    totalStakedTON: totalTON.toFixed(4),
    eligible,
    minTon: Number(MIN_TON),
  });
}
