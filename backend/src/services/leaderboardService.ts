import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";

export enum TimePeriod {
  H24 = "24h",
  D7 = "7d",
  D30 = "30d",
  ALL = "all",
}

export interface LeaderboardToken {
  rank: number;
  token: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    totalBurned: string;
    burnCount: number;
    metadataUri: string | null;
    createdAt: string;
  };
  metric: string;
  change?: number;
}

export interface LeaderboardResponse {
  success: boolean;
  data: LeaderboardToken[];
  period: TimePeriod;
  updatedAt: string;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

interface CacheEntry {
  data: LeaderboardResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(
  type: string,
  period: TimePeriod,
  page: number,
  limit: number
): string {
  return `${type}:${period}:${page}:${limit}`;
}

function getFromCache(key: string): LeaderboardResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache(key: string, data: LeaderboardResponse): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function getDateFilter(period: TimePeriod): Date | null {
  if (period === TimePeriod.ALL) return null;

  const now = new Date();
  switch (period) {
    case TimePeriod.H24:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case TimePeriod.D7:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case TimePeriod.D30:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export async function getMostBurnedLeaderboard(
  period: TimePeriod = TimePeriod.D7,
  page: number = 1,
  limit: number = 10
): Promise<LeaderboardResponse> {
  const cacheKey = getCacheKey("most-burned", period, page, limit);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const dateFilter = getDateFilter(period);
  const skip = (page - 1) * limit;

  const whereClause = dateFilter ? { timestamp: { gte: dateFilter } } : {};

  const burnsByToken = await prisma.burnRecord.groupBy({
    by: ["tokenId"],
    where: whereClause,
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    skip,
    take: limit,
  });

  const total = await prisma.burnRecord
    .groupBy({
      by: ["tokenId"],
      where: whereClause,
    })
    .then((r) => r.length);

  const tokenIds = burnsByToken.map((b) => b.tokenId);
  const tokens = await prisma.token.findMany({
    where: { id: { in: tokenIds } },
  });

  const tokenMap = new Map(tokens.map((t) => [t.id, t]));

  const data: LeaderboardToken[] = burnsByToken.map((burn, index) => {
    const token = tokenMap.get(burn.tokenId)!;
    return {
      rank: skip + index + 1,
      token: {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        totalSupply: token.totalSupply.toString(),
        totalBurned: token.totalBurned.toString(),
        burnCount: token.burnCount,
        metadataUri: token.metadataUri,
        createdAt: token.createdAt.toISOString(),
      },
      metric: (burn._sum.amount || BigInt(0)).toString(),
    };
  });

  const response: LeaderboardResponse = {
    success: true,
    data,
    period,
    updatedAt: new Date().toISOString(),
    pagination: { page, limit, total },
  };

  setCache(cacheKey, response);
  return response;
}

export async function getMostActiveLeaderboard(
  period: TimePeriod = TimePeriod.D7,
  page: number = 1,
  limit: number = 10
): Promise<LeaderboardResponse> {
  const cacheKey = getCacheKey("most-active", period, page, limit);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const dateFilter = getDateFilter(period);
  const skip = (page - 1) * limit;

  const whereClause = dateFilter ? { timestamp: { gte: dateFilter } } : {};

  const burnsByToken = await prisma.burnRecord.groupBy({
    by: ["tokenId"],
    where: whereClause,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    skip,
    take: limit,
  });

  const total = await prisma.burnRecord
    .groupBy({
      by: ["tokenId"],
      where: whereClause,
    })
    .then((r) => r.length);

  const tokenIds = burnsByToken.map((b) => b.tokenId);
  const tokens = await prisma.token.findMany({
    where: { id: { in: tokenIds } },
  });

  const tokenMap = new Map(tokens.map((t) => [t.id, t]));

  const data: LeaderboardToken[] = burnsByToken.map((burn, index) => {
    const token = tokenMap.get(burn.tokenId)!;
    return {
      rank: skip + index + 1,
      token: {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        totalSupply: token.totalSupply.toString(),
        totalBurned: token.totalBurned.toString(),
        burnCount: token.burnCount,
        metadataUri: token.metadataUri,
        createdAt: token.createdAt.toISOString(),
      },
      metric: burn._count.id.toString(),
    };
  });

  const response: LeaderboardResponse = {
    success: true,
    data,
    period,
    updatedAt: new Date().toISOString(),
    pagination: { page, limit, total },
  };

  setCache(cacheKey, response);
  return response;
}

export async function getNewestTokensLeaderboard(
  page: number = 1,
  limit: number = 10
): Promise<LeaderboardResponse> {
  const cacheKey = getCacheKey("newest", TimePeriod.ALL, page, limit);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const skip = (page - 1) * limit;

  const [tokens, total] = await Promise.all([
    prisma.token.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.token.count(),
  ]);

  const data: LeaderboardToken[] = tokens.map((token, index) => ({
    rank: skip + index + 1,
    token: {
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      totalSupply: token.totalSupply.toString(),
      totalBurned: token.totalBurned.toString(),
      burnCount: token.burnCount,
      metadataUri: token.metadataUri,
      createdAt: token.createdAt.toISOString(),
    },
    metric: token.createdAt.toISOString(),
  }));

  const response: LeaderboardResponse = {
    success: true,
    data,
    period: TimePeriod.ALL,
    updatedAt: new Date().toISOString(),
    pagination: { page, limit, total },
  };

  setCache(cacheKey, response);
  return response;
}

export async function getLargestSupplyLeaderboard(
  page: number = 1,
  limit: number = 10
): Promise<LeaderboardResponse> {
  const cacheKey = getCacheKey("largest-supply", TimePeriod.ALL, page, limit);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const skip = (page - 1) * limit;

  const [tokens, total] = await Promise.all([
    prisma.token.findMany({
      orderBy: { totalSupply: "desc" },
      skip,
      take: limit,
    }),
    prisma.token.count(),
  ]);

  const data: LeaderboardToken[] = tokens.map((token, index) => ({
    rank: skip + index + 1,
    token: {
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      totalSupply: token.totalSupply.toString(),
      totalBurned: token.totalBurned.toString(),
      burnCount: token.burnCount,
      metadataUri: token.metadataUri,
      createdAt: token.createdAt.toISOString(),
    },
    metric: token.totalSupply.toString(),
  }));

  const response: LeaderboardResponse = {
    success: true,
    data,
    period: TimePeriod.ALL,
    updatedAt: new Date().toISOString(),
    pagination: { page, limit, total },
  };

  setCache(cacheKey, response);
  return response;
}

export async function getMostBurnersLeaderboard(
  period: TimePeriod = TimePeriod.D7,
  page: number = 1,
  limit: number = 10
): Promise<LeaderboardResponse> {
  const cacheKey = getCacheKey("most-burners", period, page, limit);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const dateFilter = getDateFilter(period);
  const skip = (page - 1) * limit;

  const whereClause = dateFilter ? { timestamp: { gte: dateFilter } } : {};

  // Get unique burners per token
  const result = await prisma.$queryRaw<
    Array<{ tokenId: string; uniqueBurners: bigint }>
  >`
    SELECT "tokenId", COUNT(DISTINCT "from") as "uniqueBurners"
    FROM "BurnRecord"
    ${dateFilter ? Prisma.sql`WHERE "timestamp" >= ${dateFilter}` : Prisma.empty}
    GROUP BY "tokenId"
    ORDER BY "uniqueBurners" DESC
    LIMIT ${limit}
    OFFSET ${skip}
  `;

  const totalResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT "tokenId") as count
    FROM "BurnRecord"
    ${dateFilter ? Prisma.sql`WHERE "timestamp" >= ${dateFilter}` : Prisma.empty}
  `;

  const total = Number(totalResult[0]?.count || 0);

  const tokenIds = result.map((r) => r.tokenId);
  const tokens = await prisma.token.findMany({
    where: { id: { in: tokenIds } },
  });

  const tokenMap = new Map(tokens.map((t) => [t.id, t]));

  const data: LeaderboardToken[] = result.map((item, index) => {
    const token = tokenMap.get(item.tokenId)!;
    return {
      rank: skip + index + 1,
      token: {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        totalSupply: token.totalSupply.toString(),
        totalBurned: token.totalBurned.toString(),
        burnCount: token.burnCount,
        metadataUri: token.metadataUri,
        createdAt: token.createdAt.toISOString(),
      },
      metric: item.uniqueBurners.toString(),
    };
  });

  const response: LeaderboardResponse = {
    success: true,
    data,
    period,
    updatedAt: new Date().toISOString(),
    pagination: { page, limit, total },
  };

  setCache(cacheKey, response);
  return response;
}

export function clearCache(): void {
  cache.clear();
}
