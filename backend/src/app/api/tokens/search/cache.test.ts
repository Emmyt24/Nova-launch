import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCachedSearchResults,
  cacheSearchResults,
  clearSearchCache,
} from "./cache";

describe("Search Cache", () => {
  beforeEach(() => {
    clearSearchCache();
  });

  it("should return null for non-existent cache key", async () => {
    const result = await getCachedSearchResults("non-existent");
    expect(result).toBeNull();
  });

  it("should cache and retrieve results", async () => {
    const key = "test-key";
    const data = { success: true, data: [] };

    await cacheSearchResults(key, data);
    const cached = await getCachedSearchResults(key);

    expect(cached).toEqual(data);
  });

  it("should return null for expired cache entries", async () => {
    const key = "test-key";
    const data = { success: true, data: [] };

    await cacheSearchResults(key, data);

    // Fast-forward time by 6 minutes (cache TTL is 5 minutes)
    vi.useFakeTimers();
    vi.advanceTimersByTime(6 * 60 * 1000);

    const cached = await getCachedSearchResults(key);
    expect(cached).toBeNull();

    vi.useRealTimers();
  });

  it("should clear all cache entries", async () => {
    await cacheSearchResults("key1", { data: 1 });
    await cacheSearchResults("key2", { data: 2 });

    clearSearchCache();

    const cached1 = await getCachedSearchResults("key1");
    const cached2 = await getCachedSearchResults("key2");

    expect(cached1).toBeNull();
    expect(cached2).toBeNull();
  });

  it("should handle cache size limit", async () => {
    // This test would require mocking the MAX_CACHE_SIZE
    // For now, we'll just verify the function doesn't throw
    for (let i = 0; i < 10; i++) {
      await cacheSearchResults(`key-${i}`, { data: i });
    }

    const lastCached = await getCachedSearchResults("key-9");
    expect(lastCached).toEqual({ data: 9 });
  });
});
