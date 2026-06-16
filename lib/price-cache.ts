interface CacheEntry {
  usdPerTon: number;
  tonRequired: number;
  usdPrice: number;
  updatedAt: number;
}

let _cache: CacheEntry | null = null;

export function getPriceCache(): CacheEntry | null {
  return _cache;
}

export function setPriceCache(entry: CacheEntry): void {
  _cache = entry;
}

export function _resetCacheForTest(): void {
  _cache = null;
}
