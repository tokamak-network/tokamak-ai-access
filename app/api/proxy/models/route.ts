/**
 * GET /api/proxy/models
 *
 * 서버사이드에서 LiteLLM /v1/models 를 프록시합니다.
 * - CORS 없이 대시보드(클라이언트)에서 모델 목록 탐색 가능
 * - Authorization 헤더를 그대로 전달 (클라이언트가 Bearer <key> 전달)
 * - 응답: { models: string[] }
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
      // Vercel Edge 환경에서는 cache: "no-store" 권장
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
