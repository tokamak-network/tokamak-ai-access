/**
 * SIWE session helpers
 *
 * Session cookie: httpOnly, "session_id" → KV key "session:{id}"
 * Pattern: §1 D4, §5 data model
 */
import { NextRequest } from "next/server";
import { kvGet } from "./kv";

const SESSION_COOKIE = "session_id";

interface SessionData {
  address: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Reads the session cookie from the request and returns the verified
 * lowercase Ethereum address, or null if session is missing / expired.
 */
export async function getSessionAddress(req: NextRequest): Promise<string | null> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await kvGet<SessionData>(`session:${sessionId}`);
  if (!session) return null;
  if (Date.now() > session.expiresAt) return null;

  return session.address.toLowerCase();
}
