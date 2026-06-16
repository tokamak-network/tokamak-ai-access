import { NextResponse } from "next/server";
import { fetchTonUsdRate } from "@/lib/ton-price";
import { getPriceCache, setPriceCache } from "@/lib/price-cache";

export async function GET() {
  const now = Date.now();
  const cache = getPriceCache();
  if (cache && now - cache.updatedAt < 60_000) {
    return NextResponse.json(cache);
  }

  try {
    const usdPerTon = await fetchTonUsdRate();
    const usdPrice = Number(process.env.PURCHASE_USD_PRICE ?? "5");
    const tonRequired = Math.ceil((usdPrice / usdPerTon) * 10_000) / 10_000;
    const entry = { usdPerTon, tonRequired, usdPrice, updatedAt: now };
    setPriceCache(entry);
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Price oracle unavailable" }, { status: 503 });
  }
}
