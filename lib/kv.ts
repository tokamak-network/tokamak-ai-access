/**
 * Upstash Redis wrapper (via @vercel/kv)
 *
 * Vercel KV는 2024-12 종료. 신규 프로젝트는 Vercel Marketplace → Upstash Redis 연결.
 * @vercel/kv 패키지는 내부적으로 Upstash REST API를 사용하므로 코드 변경 불필요.
 * 환경변수: KV_REST_API_URL, KV_REST_API_TOKEN (vercel env pull 또는 Marketplace 자동 주입)
 *
 * 키 스키마 (§8):
 *   nonce:{address}          TTL 5 min
 *   session:{sessionId}      TTL 24 h
 *   key:{address}            no TTL (키 메타데이터)
 *   key:{address}:prev       no TTL (rotate 시 이전 키 아카이브)
 *   ratelimit:ip:{ip}        TTL 60 s  (Upstash 내부 관리)
 *   ratelimit:addr:{addr}    TTL 60 s  (Upstash 내부 관리)
 */
import { kv } from "@vercel/kv";
import { createHash } from "crypto";

export async function kvGet<T>(key: string): Promise<T | null> {
  return kv.get<T>(key);
}

/** @param ttlSeconds  optional; omit for no expiry */
export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds !== undefined) {
    await kv.set(key, value, { ex: ttlSeconds });
  } else {
    await kv.set(key, value);
  }
}

export async function kvDel(key: string): Promise<void> {
  await kv.del(key);
}

/** SHA-256 hash of a plaintext key (stored server-side instead of plaintext). */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
