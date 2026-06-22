import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/siwe";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { assertEligibility, assertKeyCapacity } from "@/lib/key-guards";
import { issueKeyForAddress } from "@/lib/issue-key";

export async function POST(req: NextRequest) {
  const address = await getSessionAddress(req);
  if (!address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req, address);
  if (rl) return rl;

  try {
    await assertEligibility(address);
    await assertKeyCapacity();
  } catch (err) {
    if (err instanceof Response) return err as NextResponse;
    throw err;
  }

  return issueKeyForAddress(address, 'stake');
}
