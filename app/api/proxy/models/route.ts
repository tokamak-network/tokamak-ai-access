/**
 * GET /api/proxy/models
 *
 * Server-side proxy for LiteLLM /v1/models.
 * - Allows dashboard (client) to fetch model list without CORS issues
 * - Forwards Authorization header as-is (client sends Bearer <key>)
 * - Response: { models: string[] }
 */

import { NextRequest, NextResponse } from "next/server";

const LITELLM_BASE_URL =
  process.env.LITELLM_BASE_URL ?? "https://api2.ai.tokamak.network";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Authorization header required" }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${LITELLM_BASE_URL}/v1/models`, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      // Recommended: cache: "no-store" in Vercel Edge environments
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    const models: string[] = (data?.data ?? []).map(
      (m: { id: string }) => m.id
    );

    return NextResponse.json({ models });
  } catch (err) {
    console.error("[proxy/models] fetch error:", err);
    return NextResponse.json({ error: "Failed to reach LiteLLM server" }, { status: 502 });
  }
}
