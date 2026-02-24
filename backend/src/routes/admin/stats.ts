import { Router } from "express";
import { Database } from "../../config/database";
import { AdminStats } from "../../types";
import { authenticateAdmin } from "../../middleware/auth";
import { auditLog } from "../../middleware/auditLog";

const router = Router();

router.get(
  "/",
  authenticateAdmin,
  auditLog("view_stats", "stats"),
  async (req, res) => {
    try {
      const tokens = await Database.getAllTokens();
      const users = await Database.getAllUsers();

      // Calculate statistics
      const totalTokens = tokens.length;
      const totalBurns = tokens.reduce((sum, t) => sum + (t.burned ? 1 : 0), 0);
      const totalVolumeBurned = tokens
        .reduce((sum, t) => {
          return sum + BigInt(t.burned || "0");
        }, BigInt(0))
        .toString();

      const activeUsers = users.filter((u) => !u.banned).length;

      // Calculate revenue (0.5% fee on burns)
      const revenueGenerated = (
        (BigInt(totalVolumeBurned) * BigInt(5)) /
        BigInt(1000)
      ).toString();

      // Platform health metrics
      const platformHealth = {
        uptime: process.uptime(),
        errorRate: 0.01, // Mock data
        avgResponseTime: 150, // Mock data in ms
      };

      // Growth metrics (mock data - replace with actual calculations)
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const dailyTokens = tokens.filter((t) => t.createdAt >= oneDayAgo).length;
      const weeklyTokens = tokens.filter(
        (t) => t.createdAt >= oneWeekAgo
      ).length;
      const monthlyTokens = tokens.filter(
        (t) => t.createdAt >= oneMonthAgo
      ).length;

      const dailyUsers = users.filter((u) => u.createdAt >= oneDayAgo).length;
      const weeklyUsers = users.filter((u) => u.createdAt >= oneWeekAgo).length;
      const monthlyUsers = users.filter(
        (u) => u.createdAt >= oneMonthAgo
      ).length;

      const stats: AdminStats = {
        totalTokens,
        totalBurns,
        totalVolumeBurned,
        activeUsers,
        revenueGenerated,
        platformHealth,
        growth: {
          daily: {
            newTokens: dailyTokens,
            newUsers: dailyUsers,
            burnVolume: "0", // Calculate from actual data
            revenue: "0",
          },
          weekly: {
            newTokens: weeklyTokens,
            newUsers: weeklyUsers,
            burnVolume: "0",
            revenue: "0",
          },
          monthly: {
            newTokens: monthlyTokens,
            newUsers: monthlyUsers,
            burnVolume: "0",
            revenue: "0",
          },
        },
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  }
);

export default router;
