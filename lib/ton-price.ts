const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=tokamak-network&vs_currencies=usd";

export async function fetchTonUsdRate(): Promise<number> {
  const res = await fetch(COINGECKO_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data = await res.json();
  const rate = data["tokamak-network"]?.usd;
  if (typeof rate !== "number" || rate <= 0) throw new Error("Invalid rate from CoinGecko");
  return rate;
}

export function usdToTonWei(usdAmount: number, rate: number): bigint {
  // Use 6-decimal integer arithmetic to avoid float precision loss
  const usdMicro = Math.round(usdAmount * 1_000_000);
  const rateMicro = Math.round(rate * 1_000_000);
  // tonWei = ceil(usdMicro * 1e18 / rateMicro)
  const num = BigInt(usdMicro) * 10n ** 18n;
  const den = BigInt(rateMicro);
  const quotient = num / den;
  const remainder = num % den;
  return remainder === 0n ? quotient : quotient + 1n;
}
