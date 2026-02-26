// Simple in-memory cache implementation
// For production, consider using Redis or similar

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;

export async function getCachedSearchResults(key: string): Promise<any | null> {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  // Check if cache entry is expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export async function cacheSearchResults(
  key: string,
  data: any
): Promise<void> {
  // Implement simple LRU by removing oldest entries when cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }

  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function clearSearchCache(): void {
  cache.clear();
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, CACHE_TTL);
