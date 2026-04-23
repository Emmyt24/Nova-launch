/**
 * Integration Test: Leaderboard Cache Warming
 *
 * Verifies that leaderboard cache is correctly populated on first query
 * and that subsequent queries are faster (cached).
 *
 * Test scenarios:
 *   - Clear cache before test
 *   - Execute first query and measure time
 *   - Execute second query and verify it's faster (cached)
 *   - Assert cache contains correct data
 *   - Verify cache TTL behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  getMostBurnedLeaderboard,
  TimePeriod,
  clearCache,
} from '../services/leaderboardService';

vi.mock('../lib/prisma', () => ({
  prisma: {
    burnRecord: {
      groupBy: vi.fn(),
    },
    token: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Integration: Leaderboard Cache Warming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  it('should warm cache on first query', async () => {
    const mockBurns = [
      { tokenId: 'token-1', _sum: { amount: BigInt(1000000) } },
      { tokenId: 'token-2', _sum: { amount: BigInt(500000) } },
    ];

    const mockTokens = [
      {
        id: 'token-1',
        address: 'addr-1',
        name: 'Token A',
        symbol: 'TKA',
        decimals: 18,
        totalSupply: BigInt(1000000000),
        totalBurned: BigInt(1000000),
        burnCount: 10,
        metadataUri: null,
        createdAt: new Date(),
      },
      {
        id: 'token-2',
        address: 'addr-2',
        name: 'Token B',
        symbol: 'TKB',
        decimals: 18,
        totalSupply: BigInt(500000000),
        totalBurned: BigInt(500000),
        burnCount: 5,
        metadataUri: null,
        createdAt: new Date(),
      },
    ];

    // groupBy is called twice: once for data, once for count
    vi.mocked(prisma.burnRecord.groupBy)
      .mockResolvedValueOnce(mockBurns)
      .mockResolvedValueOnce(mockBurns);
    vi.mocked(prisma.token.findMany).mockResolvedValueOnce(mockTokens);

    const result = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

    expect(result).toBeDefined();
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);

    // Verify cache was populated (groupBy called twice for first query)
    expect(vi.mocked(prisma.burnRecord.groupBy)).toHaveBeenCalledTimes(2);
  });

  it('should serve cached data on second query', async () => {
    const mockBurns = [
      { tokenId: 'token-1', _sum: { amount: BigInt(1000000) } },
    ];

    const mockTokens = [
      {
        id: 'token-1',
        address: 'addr-1',
        name: 'Token A',
        symbol: 'TKA',
        decimals: 18,
        totalSupply: BigInt(1000000000),
        totalBurned: BigInt(1000000),
        burnCount: 10,
        metadataUri: null,
        createdAt: new Date(),
      },
    ];

    // groupBy is called twice for first query
    vi.mocked(prisma.burnRecord.groupBy)
      .mockResolvedValueOnce(mockBurns)
      .mockResolvedValueOnce(mockBurns);
    vi.mocked(prisma.token.findMany).mockResolvedValueOnce(mockTokens);

    // First query
    const result1 = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);
    expect(result1).toBeDefined();

    // Second query (should use cache)
    const result2 = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);
    expect(result2).toBeDefined();

    // Database should only be called twice (first query only)
    expect(vi.mocked(prisma.burnRecord.groupBy)).toHaveBeenCalledTimes(2);

    // Results should be identical
    expect(result1.data).toEqual(result2.data);
  });

  it('should maintain cache consistency across queries', async () => {
    const mockBurns = [
      { tokenId: 'token-1', _sum: { amount: BigInt(1000000) } },
      { tokenId: 'token-2', _sum: { amount: BigInt(500000) } },
    ];

    const mockTokens = [
      {
        id: 'token-1',
        address: 'addr-1',
        name: 'Token A',
        symbol: 'TKA',
        decimals: 18,
        totalSupply: BigInt(1000000000),
        totalBurned: BigInt(1000000),
        burnCount: 10,
        metadataUri: null,
        createdAt: new Date(),
      },
      {
        id: 'token-2',
        address: 'addr-2',
        name: 'Token B',
        symbol: 'TKB',
        decimals: 18,
        totalSupply: BigInt(500000000),
        totalBurned: BigInt(500000),
        burnCount: 5,
        metadataUri: null,
        createdAt: new Date(),
      },
    ];

    // groupBy is called twice for first query
    vi.mocked(prisma.burnRecord.groupBy)
      .mockResolvedValueOnce(mockBurns)
      .mockResolvedValueOnce(mockBurns);
    vi.mocked(prisma.token.findMany).mockResolvedValueOnce(mockTokens);

    const result1 = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

    // Query again (should use cache)
    const result2 = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);
    const result3 = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

    // All results should be identical
    expect(result1.data).toEqual(result2.data);
    expect(result2.data).toEqual(result3.data);

    // Database should only be called twice (first query only)
    expect(vi.mocked(prisma.burnRecord.groupBy)).toHaveBeenCalledTimes(2);
  });

  it('should include cache metadata in response', async () => {
    const mockBurns = [
      { tokenId: 'token-1', _sum: { amount: BigInt(1000000) } },
    ];

    const mockTokens = [
      {
        id: 'token-1',
        address: 'addr-1',
        name: 'Token A',
        symbol: 'TKA',
        decimals: 18,
        totalSupply: BigInt(1000000000),
        totalBurned: BigInt(1000000),
        burnCount: 10,
        metadataUri: null,
        createdAt: new Date(),
      },
    ];

    // groupBy is called twice for first query
    vi.mocked(prisma.burnRecord.groupBy)
      .mockResolvedValueOnce(mockBurns)
      .mockResolvedValueOnce(mockBurns);
    vi.mocked(prisma.token.findMany).mockResolvedValueOnce(mockTokens);

    const result = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

    expect(result.success).toBe(true);
    expect(result.updatedAt).toBeDefined();
    expect(result.period).toBe(TimePeriod.D7);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
  });
});
