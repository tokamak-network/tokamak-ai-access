import { NextResponse } from "next/server";
import { fetchTonUsdRate } from "@/lib/ton-price";

interface CacheEntry {
  usdPerTon: number;
  tonRequired: number;
  usdPrice: number;
  updatedAt: number;
}

let _cache: CacheEntry | null = null;

export function _resetCacheForTest() {
  _cache = null;
}

export async function GET() {
  const now = Date.now();
  if (_cache && now - _cache.updatedAt < 60_000) {
    return NextResponse.json(_cache);
  }

  try {
    const usdPerTon = await fetchTonUsdRate();
    const usdPrice = Number(process.env.PURCHASE_USD_PRICE ?? "5");
    const tonRequired = Math.ceil((usdPrice / usdPerTon) * 10_000) / 10_000;
    _cache = { usdPerTon, tonRequired, usdPrice, updatedAt: now };
    return NextResponse.json(_cache);
  } catch {
    return NextResponse.json({ error: "Price oracle unavailable" }, { status: 503 });
  }
}
