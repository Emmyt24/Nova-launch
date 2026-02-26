import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

describe("Token Search Integration Tests", () => {
  const testTokens = [
    {
      address: "GTEST1",
      creator: "GCREATOR1",
      name: "Alpha Token",
      symbol: "ALPHA",
      decimals: 18,
      totalSupply: BigInt(1000000),
      initialSupply: BigInt(1000000),
      totalBurned: BigInt(100000),
      burnCount: 5,
    },
    {
      address: "GTEST2",
      creator: "GCREATOR1",
      name: "Beta Token",
      symbol: "BETA",
      decimals: 18,
      totalSupply: BigInt(500000),
      initialSupply: BigInt(500000),
      totalBurned: BigInt(0),
      burnCount: 0,
    },
    {
      address: "GTEST3",
      creator: "GCREATOR2",
      name: "Gamma Token",
      symbol: "GAMMA",
      decimals: 18,
      totalSupply: BigInt(2000000),
      initialSupply: BigInt(2000000),
      totalBurned: BigInt(50000),
      burnCount: 2,
    },
  ];

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.token.deleteMany({
      where: {
        address: {
          in: testTokens.map((t) => t.address),
        },
      },
    });

    // Create test tokens
    await prisma.token.createMany({
      data: testTokens,
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.token.deleteMany({
      where: {
        address: {
          in: testTokens.map((t) => t.address),
        },
      },
    });
  });

  it("should find tokens by name search", async () => {
    const tokens = await prisma.token.findMany({
      where: {
        OR: [
          { name: { contains: "alpha", mode: "insensitive" } },
          { symbol: { contains: "alpha", mode: "insensitive" } },
        ],
      },
    });

    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].name).toBe("Alpha Token");
  });

  it("should filter by creator", async () => {
    const tokens = await prisma.token.findMany({
      where: {
        creator: { equals: "GCREATOR1", mode: "insensitive" },
      },
    });

    expect(tokens.length).toBe(2);
    expect(tokens.every((t) => t.creator === "GCREATOR1")).toBe(true);
  });

  it("should filter by burn status", async () => {
    const tokensWithBurns = await prisma.token.findMany({
      where: {
        burnCount: { gt: 0 },
      },
    });

    const tokensWithoutBurns = await prisma.token.findMany({
      where: {
        burnCount: { equals: 0 },
      },
    });

    expect(tokensWithBurns.length).toBeGreaterThanOrEqual(2);
    expect(tokensWithoutBurns.length).toBeGreaterThanOrEqual(1);
  });

  it("should filter by supply range", async () => {
    const tokens = await prisma.token.findMany({
      where: {
        totalSupply: {
          gte: BigInt(500000),
          lte: BigInt(1000000),
        },
      },
    });

    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(
      tokens.every(
        (t) =>
          t.totalSupply >= BigInt(500000) && t.totalSupply <= BigInt(1000000)
      )
    ).toBe(true);
  });

  it("should sort by total burned", async () => {
    const tokens = await prisma.token.findMany({
      where: {
        address: {
          in: testTokens.map((t) => t.address),
        },
      },
      orderBy: {
        totalBurned: "desc",
      },
    });

    expect(tokens[0].totalBurned).toBeGreaterThanOrEqual(tokens[1].totalBurned);
    expect(tokens[1].totalBurned).toBeGreaterThanOrEqual(tokens[2].totalBurned);
  });

  it("should sort by supply", async () => {
    const tokens = await prisma.token.findMany({
      where: {
        address: {
          in: testTokens.map((t) => t.address),
        },
      },
      orderBy: {
        totalSupply: "desc",
      },
    });

    expect(tokens[0].totalSupply).toBeGreaterThanOrEqual(tokens[1].totalSupply);
    expect(tokens[1].totalSupply).toBeGreaterThanOrEqual(tokens[2].totalSupply);
  });

  it("should handle pagination", async () => {
    const page1 = await prisma.token.findMany({
      where: {
        address: {
          in: testTokens.map((t) => t.address),
        },
      },
      skip: 0,
      take: 2,
      orderBy: {
        createdAt: "desc",
      },
    });

    const page2 = await prisma.token.findMany({
      where: {
        address: {
          in: testTokens.map((t) => t.address),
        },
      },
      skip: 2,
      take: 2,
      orderBy: {
        createdAt: "desc",
      },
    });

    expect(page1.length).toBe(2);
    expect(page2.length).toBeGreaterThanOrEqual(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it("should combine multiple filters", async () => {
    const tokens = await prisma.token.findMany({
      where: {
        creator: { equals: "GCREATOR1", mode: "insensitive" },
        burnCount: { gt: 0 },
        totalSupply: { gte: BigInt(500000) },
      },
    });

    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens.every((t) => t.creator === "GCREATOR1")).toBe(true);
    expect(tokens.every((t) => t.burnCount > 0)).toBe(true);
    expect(tokens.every((t) => t.totalSupply >= BigInt(500000))).toBe(true);
  });
});
