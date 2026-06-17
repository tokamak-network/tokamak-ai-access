import { NextRequest, NextResponse } from "next/server";
import { kvDel } from "@/lib/kv";

const SESSION_COOKIE = "session_id";

/**
 * POST /api/auth/logout
 * Deletes the KV session record and clears the session cookie.
 */
export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await kvDel(`session:${sessionId}`).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
