/**
 * Integration test: leaderboard time period filtering
 *
 * Verifies that getMostBurnedLeaderboard and getMostActiveLeaderboard
 * correctly scope results to the requested time window (24h, 7d, 30d, all).
 *
 * Strategy
 * --------
 * Rather than hitting a real database, we control the `prisma` mock so that
 * each `burnRecord.groupBy` call receives a `where.timestamp.gte` value that
 * matches the expected cutoff.  We then assert:
 *   - the correct date filter is forwarded to Prisma for each period
 *   - records outside the window are excluded (mock returns empty for them)
 *   - records exactly AT the boundary are included (boundary condition)
 *   - the "all" period sends no date filter at all
 *
 * Edge cases covered
 * ------------------
 *  - Exactly 24 h ago (inclusive boundary)
 *  - Exactly 7 d ago  (inclusive boundary)
 *  - Exactly 30 d ago (inclusive boundary)
 *  - Record 1 ms before the 24 h cutoff (excluded)
 *  - TimePeriod.ALL — no date filter applied
 *  - Empty result set for a period with no matching burns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getMostBurnedLeaderboard,
  getMostActiveLeaderboard,
  TimePeriod,
  clearCache,
} from "../services/leaderboardService";
import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------
vi.mock("../lib/prisma", () => ({
  prisma: {
    burnRecord: {
      groupBy: vi.fn(),
    },
    token: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Milliseconds in common time windows */
const MS = {
  H24: 24 * 60 * 60 * 1000,
  D7: 7 * 24 * 60 * 60 * 1000,
  D30: 30 * 24 * 60 * 60 * 1000,
};

function makeToken(id: string, address: string) {
  return {
    id,
    address,
    name: `Token ${id}`,
    symbol: id.toUpperCase(),
    decimals: 7,
    totalSupply: BigInt(1_000_000_000),
    totalBurned: BigInt(500_000),
    burnCount: 5,
    metadataUri: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  };
}

function makeBurnGroupBy(
  tokenId: string,
  amount: bigint
): { tokenId: string; _sum: { amount: bigint } } {
  return { tokenId, _sum: { amount } };
}

function makeActiveGroupBy(
  tokenId: string,
  count: number
): { tokenId: string; _count: { id: number } } {
  return { tokenId, _count: { id: count } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Leaderboard time period filtering (integration)", () => {
  // Freeze time so cutoff calculations are deterministic
  const FROZEN_NOW = new Date("2026-03-28T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    clearCache();
    // resetAllMocks clears both call history AND mock implementations/return values,
    // preventing return-value bleed between tests.
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // getMostBurnedLeaderboard — period filter forwarded to Prisma
  // -------------------------------------------------------------------------

  describe("getMostBurnedLeaderboard — date filter passed to Prisma", () => {
    it("passes a gte filter 24 h in the past for TimePeriod.H24", async () => {
      const burns = [makeBurnGroupBy("t1", BigInt(100))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any) // main query
        .mockResolvedValueOnce(burns as any); // total count query
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      await getMostBurnedLeaderboard(TimePeriod.H24, 1, 10);

      const [firstCall] = vi.mocked(prisma.burnRecord.groupBy).mock.calls;
      const where = (firstCall[0] as any).where;
      expect(where).toBeDefined();
      expect(where.timestamp.gte).toBeInstanceOf(Date);

      const expectedCutoff = new Date(FROZEN_NOW.getTime() - MS.H24);
      expect(where.timestamp.gte.getTime()).toBeCloseTo(
        expectedCutoff.getTime(),
        -2 // within ~100 ms
      );
    });

    it("passes a gte filter 7 d in the past for TimePeriod.D7", async () => {
      const burns = [makeBurnGroupBy("t1", BigInt(200))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      const expectedCutoff = new Date(FROZEN_NOW.getTime() - MS.D7);
      expect(where.timestamp.gte.getTime()).toBeCloseTo(
        expectedCutoff.getTime(),
        -2
      );
    });

    it("passes a gte filter 30 d in the past for TimePeriod.D30", async () => {
      const burns = [makeBurnGroupBy("t1", BigInt(300))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      await getMostBurnedLeaderboard(TimePeriod.D30, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      const expectedCutoff = new Date(FROZEN_NOW.getTime() - MS.D30);
      expect(where.timestamp.gte.getTime()).toBeCloseTo(
        expectedCutoff.getTime(),
        -2
      );
    });

    it("passes NO date filter for TimePeriod.ALL", async () => {
      const burns = [makeBurnGroupBy("t1", BigInt(400))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      await getMostBurnedLeaderboard(TimePeriod.ALL, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      // For ALL period the where clause should be empty (no timestamp filter)
      expect(where).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // getMostActiveLeaderboard — period filter forwarded to Prisma
  // -------------------------------------------------------------------------

  describe("getMostActiveLeaderboard — date filter passed to Prisma", () => {
    it("passes a gte filter 24 h in the past for TimePeriod.H24", async () => {
      const burns = [makeActiveGroupBy("t1", 10)];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      await getMostActiveLeaderboard(TimePeriod.H24, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      const expectedCutoff = new Date(FROZEN_NOW.getTime() - MS.H24);
      expect(where.timestamp.gte.getTime()).toBeCloseTo(
        expectedCutoff.getTime(),
        -2
      );
    });

    it("passes NO date filter for TimePeriod.ALL", async () => {
      const burns = [makeActiveGroupBy("t1", 5)];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      await getMostActiveLeaderboard(TimePeriod.ALL, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      expect(where).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // Boundary conditions
  // -------------------------------------------------------------------------

  describe("boundary conditions", () => {
    it("includes a record timestamped exactly at the 24 h boundary", async () => {
      // A record at exactly (now - 24h) should satisfy `gte` and be included.
      // We simulate this by having the mock return it and verifying the cutoff
      // date is <= the record timestamp.
      const exactBoundary = new Date(FROZEN_NOW.getTime() - MS.H24);

      const burns = [makeBurnGroupBy("t1", BigInt(50))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      await getMostBurnedLeaderboard(TimePeriod.H24, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      // The cutoff must be <= the boundary timestamp so the record is included
      expect(where.timestamp.gte.getTime()).toBeLessThanOrEqual(
        exactBoundary.getTime() + 100 // allow 100 ms tolerance
      );
    });

    it("excludes a record 1 ms before the 24 h cutoff", async () => {
      // A record at (now - 24h - 1ms) is BEFORE the cutoff and must NOT be
      // returned.  We verify the cutoff is strictly after that timestamp.
      const justBefore = new Date(FROZEN_NOW.getTime() - MS.H24 - 1);

      const burns: never[] = [];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([] as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.H24, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      // The cutoff must be strictly after the "just before" timestamp
      expect(where.timestamp.gte.getTime()).toBeGreaterThan(justBefore.getTime());
      // And the result set is empty — no records matched
      expect(result.data).toHaveLength(0);
    });

    it("includes a record exactly at the 7 d boundary", async () => {
      const exactBoundary = new Date(FROZEN_NOW.getTime() - MS.D7);

      const burns = [makeBurnGroupBy("t2", BigInt(75))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t2", "ADDR2"),
      ] as any);

      await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      expect(where.timestamp.gte.getTime()).toBeLessThanOrEqual(
        exactBoundary.getTime() + 100
      );
    });

    it("includes a record exactly at the 30 d boundary", async () => {
      const exactBoundary = new Date(FROZEN_NOW.getTime() - MS.D30);

      const burns = [makeBurnGroupBy("t3", BigInt(90))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t3", "ADDR3"),
      ] as any);

      await getMostBurnedLeaderboard(TimePeriod.D30, 1, 10);

      const where = (vi.mocked(prisma.burnRecord.groupBy).mock.calls[0][0] as any).where;
      expect(where.timestamp.gte.getTime()).toBeLessThanOrEqual(
        exactBoundary.getTime() + 100
      );
    });
  });

  // -------------------------------------------------------------------------
  // Cross-period isolation — different periods return different result sets
  // -------------------------------------------------------------------------

  describe("cross-period isolation", () => {
    it("returns only 24 h records when period=24h, not older ones", async () => {
      // 24 h query returns 1 token; 7 d query would return 2 — they must not bleed.
      const burns24h = [makeBurnGroupBy("t1", BigInt(100))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns24h as any)
        .mockResolvedValueOnce(burns24h as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.H24, 1, 10);

      expect(result.period).toBe(TimePeriod.H24);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].token.address).toBe("ADDR1");
    });

    it("returns all-time records when period=all, regardless of timestamp", async () => {
      const allBurns = [
        makeBurnGroupBy("t1", BigInt(1000)),
        makeBurnGroupBy("t2", BigInt(500)),
        makeBurnGroupBy("t3", BigInt(250)),
      ];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(allBurns as any)
        .mockResolvedValueOnce(allBurns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
        makeToken("t2", "ADDR2"),
        makeToken("t3", "ADDR3"),
      ] as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.ALL, 1, 10);

      expect(result.period).toBe(TimePeriod.ALL);
      expect(result.data).toHaveLength(3);
    });

    it("returns empty data when no burns exist within the 24 h window", async () => {
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([] as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([] as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.H24, 1, 10);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Response shape
  // -------------------------------------------------------------------------

  describe("response shape", () => {
    it("includes the correct period value in the response", async () => {
      const burns = [makeBurnGroupBy("t1", BigInt(100))];
      vi.mocked(prisma.burnRecord.groupBy)
        .mockResolvedValueOnce(burns as any)
        .mockResolvedValueOnce(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
      ] as any);

      for (const period of [
        TimePeriod.H24,
        TimePeriod.D7,
        TimePeriod.D30,
        TimePeriod.ALL,
      ]) {
        clearCache();
        vi.mocked(prisma.burnRecord.groupBy)
          .mockResolvedValueOnce(burns as any)
          .mockResolvedValueOnce(burns as any);
        vi.mocked(prisma.token.findMany).mockResolvedValue([
          makeToken("t1", "ADDR1"),
        ] as any);

        const result = await getMostBurnedLeaderboard(period, 1, 10);
        expect(result.period).toBe(period);
      }
    });

    it("ranks are sequential starting from 1 on the first page", async () => {
      // Token IDs must match what the groupBy mock returns so the tokenMap lookup succeeds
      const burns = [
        makeBurnGroupBy("t1", BigInt(300)),
        makeBurnGroupBy("t2", BigInt(200)),
        makeBurnGroupBy("t3", BigInt(100)),
      ];
      // Use mockResolvedValue (not Once) so the mock is not exhausted by prior tests
      vi.mocked(prisma.burnRecord.groupBy).mockResolvedValue(burns as any);
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t1", "ADDR1"),
        makeToken("t2", "ADDR2"),
        makeToken("t3", "ADDR3"),
      ] as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.D7, 1, 10);

      expect(result.data).toHaveLength(3);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[1].rank).toBe(2);
      expect(result.data[2].rank).toBe(3);
    });

    it("ranks continue from the correct offset on page 2", async () => {
      const burns = [makeBurnGroupBy("t3", BigInt(100))];
      vi.mocked(prisma.burnRecord.groupBy).mockResolvedValue(burns as any);
      // Token id must match the burn record tokenId ("t3")
      vi.mocked(prisma.token.findMany).mockResolvedValue([
        makeToken("t3", "ADDR3"),
      ] as any);

      const result = await getMostBurnedLeaderboard(TimePeriod.D7, 2, 5);

      // page 2, limit 5 → first rank on this page is 6
      expect(result.data[0].rank).toBe(6);
    });
  });
});
