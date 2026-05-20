import { NextRequest, NextResponse } from "next/server";
import { generateNonce } from "siwe";
import { kvSet } from "@/lib/kv";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { z } from "zod";

const BodySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

/**
 * POST /api/auth/nonce
 * Body: { address }
 * Response: { nonce: string, statement: string }
 *
 * Stores nonce in Vercel KV with 5 min TTL (§5 data model).
 */
export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const { address } = parsed.data;
  const nonce = generateNonce();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

  await kvSet(`nonce:${address.toLowerCase()}`, { nonce, expiresAt }, 300);

  return NextResponse.json({
    nonce,
    statement: "Sign in to Tokamak LLM Access with your Ethereum account.",
  });
}
