/**
 * Admin Dashboard Analytics API
 *
 * Provides aggregated platform metrics for the admin dashboard.
 * All endpoints require admin authentication.
 *
 * Issue: #844
 */

import { Router, Request, Response } from "express";
import { Database } from "../config/database";
import { authenticateAdmin } from "../middleware/auth";
import { successResponse, errorResponse } from "../utils/response";

const router = Router();

/** Cache TTL: 2 minutes */
const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Clear all cached entries — used in tests for isolation. */
export function clearCache(): void {
  cache.clear();
}

/**
 * GET /api/analytics/overview
 * Aggregated platform metrics: tokens, users, burns, revenue, growth.
 */
router.get(
  "/overview",
  authenticateAdmin,
  async (_req: Request, res: Response) => {
    try {
      const cached = getCache<unknown>("overview");
      if (cached) return res.json(successResponse(cached));

      const [tokens, users] = await Promise.all([
        Database.getAllTokens(false),
        Database.getAllUsers(),
      ]);

      const now = Date.now();
      const DAY = 86_400_000;

      const totalTokens = tokens.length;
      const totalUsers = users.length;
      const activeUsers = users.filter((u) => !u.banned).length;

      const totalBurnedRaw = tokens.reduce(
        (sum, t) => sum + BigInt(t.burned || "0"),
        BigInt(0)
      );
      const totalBurned = totalBurnedRaw.toString();

      // 0.5% platform fee on burned volume
      const revenueGenerated = (
        (totalBurnedRaw * BigInt(5)) /
        BigInt(1000)
      ).toString();

      const growth = {
        daily: buildGrowthWindow(tokens, users, now - DAY),
        weekly: buildGrowthWindow(tokens, users, now - 7 * DAY),
        monthly: buildGrowthWindow(tokens, users, now - 30 * DAY),
      };

      const overview = {
        totalTokens,
        totalUsers,
        activeUsers,
        totalBurned,
        revenueGenerated,
        growth,
        generatedAt: new Date().toISOString(),
      };

      setCache("overview", overview);
      return res.json(successResponse(overview));
    } catch (err) {
      console.error("[analytics] overview error:", err);
      return res.status(500).json(
        errorResponse({ code: "ANALYTICS_ERROR", message: "Failed to fetch overview" })
      );
    }
  }
);

/**
 * GET /api/analytics/tokens
 * Token-level aggregated metrics: top creators, burn leaders, recent activity.
 */
router.get(
  "/tokens",
  authenticateAdmin,
  async (_req: Request, res: Response) => {
    try {
      const cached = getCache<unknown>("tokens");
      if (cached) return res.json(successResponse(cached));

      const tokens = await Database.getAllTokens(false);

      // Top 10 by burn volume
      const topByBurn = [...tokens]
        .sort((a, b) => {
          const diff = BigInt(b.burned || "0") - BigInt(a.burned || "0");
          return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        })
        .slice(0, 10)
        .map((t) => ({
          id: t.id,
          name: t.name,
          symbol: t.symbol,
          burned: t.burned || "0",
          creator: t.creator,
        }));

      // Creator leaderboard
      const creatorMap = new Map<string, number>();
      for (const t of tokens) {
        creatorMap.set(t.creator, (creatorMap.get(t.creator) ?? 0) + 1);
      }
      const topCreators = [...creatorMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([creator, count]) => ({ creator, tokenCount: count }));

      const data = {
        total: tokens.length,
        topByBurn,
        topCreators,
        generatedAt: new Date().toISOString(),
      };

      setCache("tokens", data);
      return res.json(successResponse(data));
    } catch (err) {
      console.error("[analytics] tokens error:", err);
      return res.status(500).json(
        errorResponse({ code: "ANALYTICS_ERROR", message: "Failed to fetch token analytics" })
      );
    }
  }
);

/**
 * GET /api/analytics/users
 * User-level aggregated metrics: active vs banned, growth over time.
 */
router.get(
  "/users",
  authenticateAdmin,
  async (_req: Request, res: Response) => {
    try {
      const cached = getCache<unknown>("users");
      if (cached) return res.json(successResponse(cached));

      const users = await Database.getAllUsers();

      const now = Date.now();
      const DAY = 86_400_000;

      const total = users.length;
      const active = users.filter((u) => !u.banned).length;
      const banned = users.filter((u) => u.banned).length;

      const newToday = users.filter(
        (u) => new Date(u.createdAt).getTime() >= now - DAY
      ).length;
      const newThisWeek = users.filter(
        (u) => new Date(u.createdAt).getTime() >= now - 7 * DAY
      ).length;
      const newThisMonth = users.filter(
        (u) => new Date(u.createdAt).getTime() >= now - 30 * DAY
      ).length;

      const data = {
        total,
        active,
        banned,
        growth: { newToday, newThisWeek, newThisMonth },
        generatedAt: new Date().toISOString(),
      };

      setCache("users", data);
      return res.json(successResponse(data));
    } catch (err) {
      console.error("[analytics] users error:", err);
      return res.status(500).json(
        errorResponse({ code: "ANALYTICS_ERROR", message: "Failed to fetch user analytics" })
      );
    }
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGrowthWindow(
  tokens: Awaited<ReturnType<typeof Database.getAllTokens>>,
  users: Awaited<ReturnType<typeof Database.getAllUsers>>,
  since: number
) {
  const newTokens = tokens.filter(
    (t) => new Date(t.createdAt).getTime() >= since
  ).length;
  const newUsers = users.filter(
    (u) => new Date(u.createdAt).getTime() >= since
  ).length;
  const burnVolume = tokens
    .filter((t) => new Date(t.createdAt).getTime() >= since)
    .reduce((sum, t) => sum + BigInt(t.burned || "0"), BigInt(0))
    .toString();

  return { newTokens, newUsers, burnVolume };
}

export default router;
