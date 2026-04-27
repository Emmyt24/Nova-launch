/**
 * Tests for Admin Dashboard Analytics API (#844)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import analyticsRouter, { clearCache } from "../routes/analytics";
import { Database } from "../config/database";
import { AuthRequest } from "../middleware/auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../config/database", () => ({
  Database: {
    getAllTokens: vi.fn(),
    getAllUsers: vi.fn(),
  },
}));

vi.mock("../middleware/auth", () => ({
  authenticateAdmin: (
    req: AuthRequest,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.admin = {
      id: "admin_1",
      role: "super_admin",
      banned: false,
      stellarAddress: "GADMIN",
      createdAt: new Date(),
    } as any;
    next();
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = Date.now();
const DAY = 86_400_000;

const mockTokens = [
  {
    id: "t1",
    name: "Alpha",
    symbol: "ALP",
    creator: "GCREATOR1",
    burned: "1000",
    createdAt: new Date(now - DAY / 2), // today
    deleted: false,
  },
  {
    id: "t2",
    name: "Beta",
    symbol: "BET",
    creator: "GCREATOR2",
    burned: "500",
    createdAt: new Date(now - 10 * DAY), // older
    deleted: false,
  },
  {
    id: "t3",
    name: "Gamma",
    symbol: "GAM",
    creator: "GCREATOR1",
    burned: "0",
    createdAt: new Date(now - 2 * DAY),
    deleted: false,
  },
];

const mockUsers = [
  { id: "u1", banned: false, createdAt: new Date(now - DAY / 2) },
  { id: "u2", banned: true, createdAt: new Date(now - 20 * DAY) },
  { id: "u3", banned: false, createdAt: new Date(now - 3 * DAY) },
];

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/analytics", analyticsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Analytics API (#844)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
    vi.mocked(Database.getAllTokens).mockResolvedValue(mockTokens as any);
    vi.mocked(Database.getAllUsers).mockResolvedValue(mockUsers as any);
  });

  // ── /overview ─────────────────────────────────────────────────────────────

  describe("GET /api/analytics/overview", () => {
    it("returns 200 with aggregated metrics", async () => {
      const res = await request(buildApp()).get("/api/analytics/overview");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.totalTokens).toBe(3);
      expect(data.totalUsers).toBe(3);
      expect(data.activeUsers).toBe(2); // 1 banned
      expect(data.totalBurned).toBe("1500");
      expect(data.revenueGenerated).toBe("7"); // 1500 * 5 / 1000 = 7
      expect(data.growth).toHaveProperty("daily");
      expect(data.growth).toHaveProperty("weekly");
      expect(data.growth).toHaveProperty("monthly");
      expect(data.generatedAt).toBeDefined();
    });

    it("growth.daily counts only tokens/users created today", async () => {
      const res = await request(buildApp()).get("/api/analytics/overview");
      const { daily } = res.body.data.growth;

      // t1 was created today, u1 was created today
      expect(daily.newTokens).toBe(1);
      expect(daily.newUsers).toBe(1);
    });

    it("returns 500 when database throws", async () => {
      vi.mocked(Database.getAllTokens).mockRejectedValue(new Error("db down"));
      const res = await request(buildApp()).get("/api/analytics/overview");
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ── /tokens ───────────────────────────────────────────────────────────────

  describe("GET /api/analytics/tokens", () => {
    it("returns 200 with token metrics", async () => {
      const res = await request(buildApp()).get("/api/analytics/tokens");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.total).toBe(3);
      expect(data.topByBurn).toHaveLength(3);
      expect(data.topByBurn[0].burned).toBe("1000"); // highest burn first
      expect(data.topCreators).toHaveLength(2);
    });

    it("topCreators is sorted by token count descending", async () => {
      const res = await request(buildApp()).get("/api/analytics/tokens");
      const [first] = res.body.data.topCreators;
      // GCREATOR1 has 2 tokens
      expect(first.creator).toBe("GCREATOR1");
      expect(first.tokenCount).toBe(2);
    });

    it("returns 500 when database throws", async () => {
      vi.mocked(Database.getAllTokens).mockRejectedValue(new Error("db down"));
      const res = await request(buildApp()).get("/api/analytics/tokens");
      expect(res.status).toBe(500);
    });
  });

  // ── /users ────────────────────────────────────────────────────────────────

  describe("GET /api/analytics/users", () => {
    it("returns 200 with user metrics", async () => {
      const res = await request(buildApp()).get("/api/analytics/users");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.total).toBe(3);
      expect(data.active).toBe(2);
      expect(data.banned).toBe(1);
      expect(data.growth.newToday).toBe(1);
      expect(data.growth.newThisWeek).toBe(2); // u1 (today) + u3 (3 days ago)
      expect(data.growth.newThisMonth).toBe(3);
    });

    it("returns 500 when database throws", async () => {
      vi.mocked(Database.getAllUsers).mockRejectedValue(new Error("db down"));
      const res = await request(buildApp()).get("/api/analytics/users");
      expect(res.status).toBe(500);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("handles empty token list gracefully", async () => {
      vi.mocked(Database.getAllTokens).mockResolvedValue([]);
      const res = await request(buildApp()).get("/api/analytics/overview");
      expect(res.status).toBe(200);
      expect(res.body.data.totalTokens).toBe(0);
      expect(res.body.data.totalBurned).toBe("0");
    });

    it("handles empty user list gracefully", async () => {
      vi.mocked(Database.getAllUsers).mockResolvedValue([]);
      const res = await request(buildApp()).get("/api/analytics/users");
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.active).toBe(0);
    });

    it("handles tokens with no burned field", async () => {
      vi.mocked(Database.getAllTokens).mockResolvedValue([
        { id: "t1", name: "X", symbol: "X", creator: "G1", burned: undefined, createdAt: new Date(), deleted: false },
      ] as any);
      const res = await request(buildApp()).get("/api/analytics/overview");
      expect(res.status).toBe(200);
      expect(res.body.data.totalBurned).toBe("0");
    });
  });
});
