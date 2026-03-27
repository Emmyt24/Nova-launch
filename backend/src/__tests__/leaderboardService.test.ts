import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getMostBurnedLeaderboard,
  getMostActiveLeaderboard,
  getNewestTokensLeaderboard,
  getLargestSupplyLeaderboard,
  getMostBurnersLeaderboard,
  TimePeriod,
  clearCache,
} from "../services/leaderboardService";
import { prisma } from "../lib/prisma";

// Mock Prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    burnRecord: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    token: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe("Leaderboard Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  describe("getMostBurnedLeaderboard", () => {
    it("should return tokens sorted by burn volume", async () => {
      const mockBurns = [
        { tokenId: "token1", _sum: { amount: BigInt(1000000) } },
        { tokenId: "token2", _sum: { amount: BigInt(500000) } },
      ];

      const mockTokens = [
        {
          id: "token1",
          address: "0x123",
          name: "Token A",
          symbol: "TKA",
          decimals: 18,
          totalSupply: BigInt(1000000000),
          totalBurned: BigInt(1000000),
          burnCount: 10,
          metadataUri: null,
          createdAt: new Date("2024-01-01"),
        },
        {
          id: "token2",
          address: "0x456",
          name: "Token B",
          symbol: "TKB",
          decimals: 18,
          totalSupply: BigInt(2000000000),
          totalBurned: BigInt(500000),
          burnCount: 5,
          metadataUri: null,
          createdAt: new Date("2024-01-02"),
        },
      ];

      vi.mocked(prisma.burnRecord.groupBy).mockResolvedValueOnce(
        mockBurns as any
      );
      vi.mocked(prisma.burnRecord.groupBy).mockResolvedValueOnce(
        mockBurns as any
      );
      vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[0].token.address).toBe("0x123");
      expect(result.data[0].metric).toBe("1000000");
      expect(result.period).toBe(TimePeriod.D7);
    });

    it("should use cache on subsequent calls", async () => {
      const mockBurns = [
        { tokenId: "token1", _sum: { amount: BigInt(1000000) } },
      ];

      const mockTokens = [
        {
          id: "token1",
          address: "0x123",
          name: "Token A",
          symbol: "TKA",
          decimals: 18,
          totalSupply: BigInt(1000000000),
          totalBurned: BigInt(1000000),
          burnCount: 10,
          metadataUri: null,
          createdAt: new Date("2024-01-01"),
        },
      ];

      vi.mocked(prisma.burnRecord.groupBy).mockResolvedValue(mockBurns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens as any);

      await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);
      await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

      // Should only call once due to cache
      expect(prisma.burnRecord.groupBy).toHaveBeenCalledTimes(2);
    });

    it("should handle pagination correctly", async () => {
      const mockBurns = [
        { tokenId: "token3", _sum: { amount: BigInt(300000) } },
      ];

      const mockTokens = [
        {
          id: "token3",
          address: "0x789",
          name: "Token C",
          symbol: "TKC",
          decimals: 18,
          totalSupply: BigInt(3000000000),
          totalBurned: BigInt(300000),
          burnCount: 3,
          metadataUri: null,
          createdAt: new Date("2024-01-03"),
        },
      ];

      vi.mocked(prisma.burnRecord.groupBy).mockResolvedValue(mockBurns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.D7, 2, 5);

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(5);
      expect(result.data[0].rank).toBe(6); // Second page, rank starts at 6
    });
  });

  describe("getMostActiveLeaderboard", () => {
    it("should return tokens sorted by transaction count", async () => {
      const mockBurns = [
        { tokenId: "token1", _count: { id: 50 } },
        { tokenId: "token2", _count: { id: 30 } },
      ];

      const mockTokens = [
        {
          id: "token1",
          address: "0x123",
          name: "Token A",
          symbol: "TKA",
          decimals: 18,
          totalSupply: BigInt(1000000000),
          totalBurned: BigInt(1000000),
          burnCount: 50,
          metadataUri: null,
          createdAt: new Date("2024-01-01"),
        },
        {
          id: "token2",
          address: "0x456",
          name: "Token B",
          symbol: "TKB",
          decimals: 18,
          totalSupply: BigInt(2000000000),
          totalBurned: BigInt(500000),
          burnCount: 30,
          metadataUri: null,
          createdAt: new Date("2024-01-02"),
        },
      ];

      vi.mocked(prisma.burnRecord.groupBy).mockResolvedValue(mockBurns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens as any);

      const result = await getMostActiveLeaderboard(TimePeriod.D7, 1, 10);

      expect(result.success).toBe(true);
      expect(result.data[0].metric).toBe("50");
      expect(result.data[1].metric).toBe("30");
    });
  });

  describe("getNewestTokensLeaderboard", () => {
    it("should return tokens sorted by creation date", async () => {
      const mockTokens = [
        {
          id: "token2",
          address: "0x456",
          name: "Token B",
          symbol: "TKB",
          decimals: 18,
          totalSupply: BigInt(2000000000),
          totalBurned: BigInt(0),
          burnCount: 0,
          metadataUri: null,
          createdAt: new Date("2024-01-02"),
        },
        {
          id: "token1",
          address: "0x123",
          name: "Token A",
          symbol: "TKA",
          decimals: 18,
          totalSupply: BigInt(1000000000),
          totalBurned: BigInt(0),
          burnCount: 0,
          metadataUri: null,
          createdAt: new Date("2024-01-01"),
        },
      ];

      vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens as any);
      vi.mocked(prisma.token.count).mockResolvedValue(2);

      const result = await getNewestTokensLeaderboard(1, 10);

      expect(result.success).toBe(true);
      expect(result.data[0].token.address).toBe("0x456");
      expect(result.data[1].token.address).toBe("0x123");
    });
  });

  describe("getLargestSupplyLeaderboard", () => {
    it("should return tokens sorted by total supply", async () => {
      const mockTokens = [
        {
          id: "token2",
          address: "0x456",
          name: "Token B",
          symbol: "TKB",
          decimals: 18,
          totalSupply: BigInt(2000000000),
          totalBurned: BigInt(0),
          burnCount: 0,
          metadataUri: null,
          createdAt: new Date("2024-01-02"),
        },
        {
          id: "token1",
          address: "0x123",
          name: "Token A",
          symbol: "TKA",
          decimals: 18,
          totalSupply: BigInt(1000000000),
          totalBurned: BigInt(0),
          burnCount: 0,
          metadataUri: null,
          createdAt: new Date("2024-01-01"),
        },
      ];

      vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens as any);
      vi.mocked(prisma.token.count).mockResolvedValue(2);

      const result = await getLargestSupplyLeaderboard(1, 10);

      expect(result.success).toBe(true);
      expect(result.data[0].metric).toBe("2000000000");
      expect(result.data[1].metric).toBe("1000000000");
    });
  });

  describe("getMostBurnersLeaderboard", () => {
    it("should return tokens sorted by unique burners", async () => {
      const mockQueryResult = [
        { tokenId: "token1", uniqueBurners: BigInt(25) },
        { tokenId: "token2", uniqueBurners: BigInt(15) },
      ];

      const mockCountResult = [{ count: BigInt(2) }];

      const mockTokens = [
        {
          id: "token1",
          address: "0x123",
          name: "Token A",
          symbol: "TKA",
          decimals: 18,
          totalSupply: BigInt(1000000000),
          totalBurned: BigInt(1000000),
          burnCount: 50,
          metadataUri: null,
          createdAt: new Date("2024-01-01"),
        },
        {
          id: "token2",
          address: "0x456",
          name: "Token B",
          symbol: "TKB",
          decimals: 18,
          totalSupply: BigInt(2000000000),
          totalBurned: BigInt(500000),
          burnCount: 30,
          metadataUri: null,
          createdAt: new Date("2024-01-02"),
        },
      ];

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce(mockQueryResult)
        .mockResolvedValueOnce(mockCountResult);
      vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens as any);

      const result = await getMostBurnersLeaderboard(TimePeriod.D7, 1, 10);

      expect(result.success).toBe(true);
      expect(result.data[0].metric).toBe("25");
      expect(result.data[1].metric).toBe("15");
    });
  });
});
