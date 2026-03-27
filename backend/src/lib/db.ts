import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

// ─── Token Utilities ───────────────────────────────────────────────

export async function createToken(data: {
  address: string;
  creator: string;
  name: string;
  symbol: string;
  decimals?: number;
  totalSupply: bigint;
  initialSupply: bigint;
  metadataUri?: string;
}) {
  return prisma.token.create({ data });
}

export async function getTokenByAddress(address: string) {
  return prisma.token.findUnique({ where: { address } });
}

export async function updateTokenBurnStats(tokenId: string, amount: bigint) {
  return prisma.token.update({
    where: { id: tokenId },
    data: {
      totalBurned: { increment: amount },
      burnCount: { increment: 1 },
    },
  });
}

// ─── BurnRecord Utilities ──────────────────────────────────────────

export async function createBurnRecord(data: {
  tokenId: string;
  from: string;
  amount: bigint;
  burnedBy: string;
  isAdminBurn?: boolean;
  txHash: string;
}) {
  return prisma.burnRecord.create({ data });
}

export async function getBurnHistory(
  tokenId: string,
  options: { skip?: number; take?: number } = {}
) {
  return prisma.burnRecord.findMany({
    where: { tokenId },
    orderBy: { timestamp: "desc" },
    skip: options.skip ?? 0,
    take: options.take ?? 20,
  });
}

// ─── User Utilities ────────────────────────────────────────────────

export async function upsertUser(address: string) {
  return prisma.user.upsert({
    where: { address },
    update: { lastActive: new Date() },
    create: { address },
  });
}

// ─── Analytics Utilities ───────────────────────────────────────────

export async function upsertDailyAnalytics(
  tokenId: string,
  date: Date,
  burnAmount: bigint,
  uniqueBurners: number
) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  return prisma.analytics.upsert({
    where: { tokenId_date: { tokenId, date: dayStart } },
    update: {
      burnVolume: { increment: burnAmount },
      burnCount: { increment: 1 },
      uniqueBurners,
    },
    create: {
      tokenId,
      date: dayStart,
      burnVolume: burnAmount,
      burnCount: 1,
      uniqueBurners,
    },
  });
}

// ─── Connection Test ───────────────────────────────────────────────

export async function testConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");
    return true;
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}
