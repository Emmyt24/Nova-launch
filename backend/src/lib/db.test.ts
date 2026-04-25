/**
 * Vitest test suite for backend/src/lib/db.ts
 *
 * All Prisma calls are mocked — no real database required.
 * Coverage targets: >90% statements, branches, functions, lines.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock prisma — use vi.hoisted so the object is available when vi.mock runs
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $disconnect: vi.fn(),
  token: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  burnRecord: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
  analytics: {
    upsert: vi.fn(),
  },
}));

vi.mock("./prisma", () => ({ prisma: mockPrisma }));

import {
  getPoolConfig,
  getPoolStats,
  checkDatabaseHealth,
  disconnectDb,
  createToken,
  getTokenByAddress,
  updateTokenBurnStats,
  createBurnRecord,
  getBurnHistory,
  upsertUser,
  upsertDailyAnalytics,
  testConnection,
} from "./db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearEnv(...keys: string[]) {
  for (const k of keys) delete process.env[k];
}

// ---------------------------------------------------------------------------
// getPoolConfig()
// ---------------------------------------------------------------------------

describe("getPoolConfig()", () => {
  afterEach(() =>
    clearEnv(
      "DB_POOL_MAX",
      "DB_POOL_MIN",
      "DB_CONNECT_TIMEOUT_MS",
      "DB_IDLE_TIMEOUT_MS"
    )
  );

  it("returns safe defaults when no env vars are set", () => {
    const cfg = getPoolConfig();
    expect(cfg.max).toBe(10);
    expect(cfg.min).toBe(2);
    expect(cfg.connectTimeoutMs).toBe(5000);
    expect(cfg.idleTimeoutMs).toBe(30000);
  });

  it("reads values from environment variables", () => {
    process.env.DB_POOL_MAX = "20";
    process.env.DB_POOL_MIN = "5";
    process.env.DB_CONNECT_TIMEOUT_MS = "3000";
    process.env.DB_IDLE_TIMEOUT_MS = "60000";

    const cfg = getPoolConfig();
    expect(cfg.max).toBe(20);
    expect(cfg.min).toBe(5);
    expect(cfg.connectTimeoutMs).toBe(3000);
    expect(cfg.idleTimeoutMs).toBe(60000);
  });
});

// ---------------------------------------------------------------------------
// getPoolStats()
// ---------------------------------------------------------------------------

describe("getPoolStats()", () => {
  it("returns a stats object with config, lastHealthCheck, and healthy fields", () => {
    const stats = getPoolStats();
    expect(stats).toHaveProperty("config");
    expect(stats).toHaveProperty("lastHealthCheck");
    expect(stats).toHaveProperty("healthy");
    expect(typeof stats.healthy).toBe("boolean");
  });

  it("reflects healthy=true after a successful health check", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "1": 1 }]);
    await checkDatabaseHealth();
    expect(getPoolStats().healthy).toBe(true);
    expect(getPoolStats().lastHealthCheck).not.toBeNull();
  });

  it("reflects healthy=false after a failed health check", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    await checkDatabaseHealth();
    expect(getPoolStats().healthy).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDatabaseHealth()
// ---------------------------------------------------------------------------

describe("checkDatabaseHealth()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns healthy:true and a latency when the probe succeeds", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "1": 1 }]);
    const result = await checkDatabaseHealth();

    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("returns healthy:false with an error message when the probe throws", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("DB is down"));
    const result = await checkDatabaseHealth();

    expect(result.healthy).toBe(false);
    expect(result.error).toBe("DB is down");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns healthy:false when a non-Error is thrown", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce("string error");
    const result = await checkDatabaseHealth();

    expect(result.healthy).toBe(false);
    expect(result.error).toBe("string error");
  });

  it("times out and returns healthy:false when probe hangs", async () => {
    // Probe never resolves
    mockPrisma.$queryRaw.mockImplementationOnce(
      () => new Promise(() => {})
    );

    const result = await checkDatabaseHealth(50); // 50 ms timeout
    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  }, 2000);

  it("updates lastHealthCheck timestamp on success", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    const before = Date.now();
    await checkDatabaseHealth();
    const stats = getPoolStats();
    expect(stats.lastHealthCheck).not.toBeNull();
    expect(new Date(stats.lastHealthCheck!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("updates lastHealthCheck timestamp on failure", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("fail"));
    const before = Date.now();
    await checkDatabaseHealth();
    const stats = getPoolStats();
    expect(new Date(stats.lastHealthCheck!).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ---------------------------------------------------------------------------
// disconnectDb()
// ---------------------------------------------------------------------------

describe("disconnectDb()", () => {
  it("calls prisma.$disconnect()", async () => {
    mockPrisma.$disconnect.mockResolvedValueOnce(undefined);
    await disconnectDb();
    expect(mockPrisma.$disconnect).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// testConnection() — deprecated wrapper
// ---------------------------------------------------------------------------

describe("testConnection()", () => {
  it("returns true when health check passes", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await testConnection()).toBe(true);
  });

  it("returns false when health check fails", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("down"));
    expect(await testConnection()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createToken()
// ---------------------------------------------------------------------------

describe("createToken()", () => {
  it("calls prisma.token.create with the provided data", async () => {
    const tokenData = {
      address: "GTOKEN",
      creator: "GCREATOR",
      name: "My Token",
      symbol: "MTK",
      totalSupply: BigInt("1000"),
      initialSupply: BigInt("1000"),
    };
    const fakeToken = { id: "t1", ...tokenData };
    mockPrisma.token.create.mockResolvedValueOnce(fakeToken);

    const result = await createToken(tokenData);
    expect(mockPrisma.token.create).toHaveBeenCalledWith({ data: tokenData });
    expect(result).toEqual(fakeToken);
  });

  it("propagates errors from prisma", async () => {
    mockPrisma.token.create.mockRejectedValueOnce(new Error("unique constraint"));
    await expect(
      createToken({
        address: "G",
        creator: "G",
        name: "T",
        symbol: "T",
        totalSupply: 0n,
        initialSupply: 0n,
      })
    ).rejects.toThrow("unique constraint");
  });
});

// ---------------------------------------------------------------------------
// getTokenByAddress()
// ---------------------------------------------------------------------------

describe("getTokenByAddress()", () => {
  it("calls prisma.token.findUnique with the address", async () => {
    mockPrisma.token.findUnique.mockResolvedValueOnce({ id: "t1" });
    const result = await getTokenByAddress("GADDR");
    expect(mockPrisma.token.findUnique).toHaveBeenCalledWith({
      where: { address: "GADDR" },
    });
    expect(result).toEqual({ id: "t1" });
  });

  it("returns null when token is not found", async () => {
    mockPrisma.token.findUnique.mockResolvedValueOnce(null);
    expect(await getTokenByAddress("GMISSING")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateTokenBurnStats()
// ---------------------------------------------------------------------------

describe("updateTokenBurnStats()", () => {
  it("increments totalBurned and burnCount", async () => {
    mockPrisma.token.update.mockResolvedValueOnce({ id: "t1" });
    await updateTokenBurnStats("t1", BigInt(500));
    expect(mockPrisma.token.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        totalBurned: { increment: BigInt(500) },
        burnCount: { increment: 1 },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// createBurnRecord()
// ---------------------------------------------------------------------------

describe("createBurnRecord()", () => {
  it("calls prisma.burnRecord.create with the provided data", async () => {
    const data = {
      tokenId: "t1",
      from: "GUSER",
      amount: BigInt(100),
      burnedBy: "GUSER",
      txHash: "0xABC",
    };
    mockPrisma.burnRecord.create.mockResolvedValueOnce({ id: "b1", ...data });
    const result = await createBurnRecord(data);
    expect(mockPrisma.burnRecord.create).toHaveBeenCalledWith({ data });
    expect(result).toMatchObject({ id: "b1" });
  });
});

// ---------------------------------------------------------------------------
// getBurnHistory()
// ---------------------------------------------------------------------------

describe("getBurnHistory()", () => {
  it("uses default skip=0 and take=20", async () => {
    mockPrisma.burnRecord.findMany.mockResolvedValueOnce([]);
    await getBurnHistory("t1");
    expect(mockPrisma.burnRecord.findMany).toHaveBeenCalledWith({
      where: { tokenId: "t1" },
      orderBy: { timestamp: "desc" },
      skip: 0,
      take: 20,
    });
  });

  it("respects custom skip and take options", async () => {
    mockPrisma.burnRecord.findMany.mockResolvedValueOnce([]);
    await getBurnHistory("t1", { skip: 10, take: 5 });
    expect(mockPrisma.burnRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });
});

// ---------------------------------------------------------------------------
// upsertUser()
// ---------------------------------------------------------------------------

describe("upsertUser()", () => {
  it("upserts by address", async () => {
    mockPrisma.user.upsert.mockResolvedValueOnce({ id: "u1", address: "GADDR" });
    const result = await upsertUser("GADDR");
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { address: "GADDR" } })
    );
    expect(result).toMatchObject({ address: "GADDR" });
  });
});

// ---------------------------------------------------------------------------
// upsertDailyAnalytics()
// ---------------------------------------------------------------------------

describe("upsertDailyAnalytics()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalises the date to midnight and calls upsert", async () => {
    mockPrisma.analytics.upsert.mockResolvedValueOnce({});
    const date = new Date("2026-04-24T15:30:00Z");
    await upsertDailyAnalytics("t1", date, BigInt(200), 3);

    const call = mockPrisma.analytics.upsert.mock.calls[0][0];
    const usedDate: Date = call.where.tokenId_date.date;
    expect(usedDate.getHours()).toBe(0);
    expect(usedDate.getMinutes()).toBe(0);
    expect(usedDate.getSeconds()).toBe(0);
    expect(usedDate.getMilliseconds()).toBe(0);
  });

  it("passes burnAmount and uniqueBurners to create", async () => {
    mockPrisma.analytics.upsert.mockResolvedValueOnce({});
    await upsertDailyAnalytics("t1", new Date(), BigInt(50), 7);
    const call = mockPrisma.analytics.upsert.mock.calls[0][0];
    expect(call.create.burnVolume).toBe(BigInt(50));
    expect(call.create.uniqueBurners).toBe(7);
  });
});
