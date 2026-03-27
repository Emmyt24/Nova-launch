import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    token: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock cache
vi.mock("./cache", () => ({
  getCachedSearchResults: vi.fn().mockResolvedValue(null),
  cacheSearchResults: vi.fn().mockResolvedValue(undefined),
}));

describe("Token Search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (params: Record<string, string> = {}) => {
    const url = new URL("http://localhost:3000/api/tokens/search");
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    return new NextRequest(url);
  };

  it("should return tokens with default pagination", async () => {
    const mockTokens = [
      {
        id: "1",
        address: "GABC123",
        creator: "GCREATOR1",
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        totalSupply: BigInt(1000000),
        initialSupply: BigInt(1000000),
        totalBurned: BigInt(0),
        burnCount: 0,
        metadataUri: "ipfs://test",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens);
    vi.mocked(prisma.token.count).mockResolvedValue(1);

    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(20);
  });

  it("should search by name and symbol", async () => {
    vi.mocked(prisma.token.findMany).mockResolvedValue([]);
    vi.mocked(prisma.token.count).mockResolvedValue(0);

    const request = createMockRequest({ q: "test" });
    await GET(request);

    expect(prisma.token.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: "test", mode: "insensitive" } },
            { symbol: { contains: "test", mode: "insensitive" } },
          ]),
        }),
      })
    );
  });

  it("should filter by creator address", async () => {
    vi.mocked(prisma.token.findMany).mockResolvedValue([]);
    vi.mocked(prisma.token.count).mockResolvedValue(0);

    const request = createMockRequest({ creator: "GCREATOR1" });
    await GET(request);

    expect(prisma.token.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          creator: { equals: "GCREATOR1", mode: "insensitive" },
        }),
      })
    );
  });

  it("should filter by date range", async () => {
    vi.mocked(prisma.token.findMany).mockResolvedValue([]);
    vi.mocked(prisma.token.count).mockResolvedValue(0);

    const startDate = "2024-01-01T00:00:00.000Z";
    const endDate = "2024-12-31T23:59:59.999Z";
    const request = createMockRequest({ startDate, endDate });
    await GET(request);

    expect(prisma.token.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }),
      })
    );
  });

  it("should filter by supply range", async () => {
    vi.mocked(prisma.token.findMany).mockResolvedValue([]);
    vi.mocked(prisma.token.count).mockResolvedValue(0);

    const request = createMockRequest({
      minSupply: "1000",
      maxSupply: "10000",
    });
    await GET(request);

    expect(prisma.token.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          totalSupply: {
            gte: BigInt(1000),
            lte: BigInt(10000),
          },
        }),
      })
    );
  });

  it("should filter by burn status", async () => {
    vi.mocked(prisma.token.findMany).mockResolvedValue([]);
    vi.mocked(prisma.token.count).mockResolvedValue(0);

    const request = createMockRequest({ hasBurns: "true" });
    await GET(request);

    expect(prisma.token.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          burnCount: { gt: 0 },
        }),
      })
    );
  });

  it("should sort by different fields", async () => {
    vi.mocked(prisma.token.findMany).mockResolvedValue([]);
    vi.mocked(prisma.token.count).mockResolvedValue(0);

    const sortTests = [
      { sortBy: "created", expected: { createdAt: "desc" } },
      { sortBy: "burned", expected: { totalBurned: "desc" } },
      { sortBy: "supply", expected: { totalSupply: "desc" } },
      { sortBy: "name", expected: { name: "desc" } },
    ];

    for (const test of sortTests) {
      vi.clearAllMocks();
      const request = createMockRequest({ sortBy: test.sortBy });
      await GET(request);

      expect(prisma.token.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: test.expected,
        })
      );
    }
  });

  it("should handle pagination correctly", async () => {
    vi.mocked(prisma.token.findMany).mockResolvedValue([]);
    vi.mocked(prisma.token.count).mockResolvedValue(100);

    const request = createMockRequest({ page: "3", limit: "10" });
    const response = await GET(request);
    const data = await response.json();

    expect(prisma.token.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      })
    );

    expect(data.pagination).toEqual({
      page: 3,
      limit: 10,
      total: 100,
      totalPages: 10,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("should reject limit exceeding 50", async () => {
    const request = createMockRequest({ limit: "100" });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe("Invalid query parameters");
  });

  it("should reject invalid date format", async () => {
    const request = createMockRequest({ startDate: "invalid-date" });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("should handle database errors gracefully", async () => {
    vi.mocked(prisma.token.findMany).mockRejectedValue(
      new Error("Database error")
    );

    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe("Internal server error");
  });

  it("should convert BigInt to string in response", async () => {
    const mockTokens = [
      {
        id: "1",
        address: "GABC123",
        creator: "GCREATOR1",
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        totalSupply: BigInt("999999999999999999"),
        initialSupply: BigInt("999999999999999999"),
        totalBurned: BigInt("123456789"),
        burnCount: 5,
        metadataUri: "ipfs://test",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(prisma.token.findMany).mockResolvedValue(mockTokens);
    vi.mocked(prisma.token.count).mockResolvedValue(1);

    const request = createMockRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(typeof data.data[0].totalSupply).toBe("string");
    expect(typeof data.data[0].initialSupply).toBe("string");
    expect(typeof data.data[0].totalBurned).toBe("string");
  });
});
