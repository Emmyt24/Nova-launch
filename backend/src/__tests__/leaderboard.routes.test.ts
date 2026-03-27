import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import leaderboardRoutes from "../routes/leaderboard";
import * as leaderboardService from "../services/leaderboardService";

// Mock the entire service module
vi.mock("../services/leaderboardService", () => ({
  getMostBurnedLeaderboard: vi.fn(),
  getMostActiveLeaderboard: vi.fn(),
  getNewestTokensLeaderboard: vi.fn(),
  getLargestSupplyLeaderboard: vi.fn(),
  getMostBurnersLeaderboard: vi.fn(),
  TimePeriod: {
    H24: "24h",
    D7: "7d",
    D30: "30d",
    ALL: "all",
  },
}));

const app = express();
app.use(express.json());
app.use("/api/leaderboard", leaderboardRoutes);

describe("Leaderboard API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/leaderboard/most-burned", () => {
    it("should return most burned tokens", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            rank: 1,
            token: {
              address: "0x123",
              name: "Token A",
              symbol: "TKA",
              decimals: 18,
              totalSupply: "1000000000",
              totalBurned: "1000000",
              burnCount: 10,
              metadataUri: null,
              createdAt: "2024-01-01T00:00:00.000Z",
            },
            metric: "1000000",
          },
        ],
        period: "D7" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 1, limit: 10, total: 1 },
      };

      vi.mocked(leaderboardService.getMostBurnedLeaderboard).mockResolvedValue(
        mockResponse
      );

      const response = await request(app)
        .get("/api/leaderboard/most-burned")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(1);
      expect(leaderboardService.getMostBurnedLeaderboard).toHaveBeenCalledWith(
        "7d",
        1,
        10
      );
    });

    it("should accept period query parameter", async () => {
      const mockResponse = {
        success: true,
        data: [],
        period: "24h" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 1, limit: 10, total: 0 },
      };

      vi.mocked(leaderboardService.getMostBurnedLeaderboard).mockResolvedValue(
        mockResponse
      );

      await request(app)
        .get("/api/leaderboard/most-burned?period=24h")
        .expect(200);

      expect(leaderboardService.getMostBurnedLeaderboard).toHaveBeenCalledWith(
        "24h",
        1,
        10
      );
    });

    it("should accept pagination parameters", async () => {
      const mockResponse = {
        success: true,
        data: [],
        period: "7d" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 2, limit: 20, total: 0 },
      };

      vi.mocked(leaderboardService.getMostBurnedLeaderboard).mockResolvedValue(
        mockResponse
      );

      await request(app)
        .get("/api/leaderboard/most-burned?page=2&limit=20")
        .expect(200);

      expect(leaderboardService.getMostBurnedLeaderboard).toHaveBeenCalledWith(
        "7d",
        2,
        20
      );
    });

    it("should handle invalid pagination gracefully", async () => {
      const mockResponse = {
        success: true,
        data: [],
        period: "7d" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 1, limit: 10, total: 0 },
      };

      vi.mocked(leaderboardService.getMostBurnedLeaderboard).mockResolvedValue(
        mockResponse
      );

      await request(app)
        .get("/api/leaderboard/most-burned?page=-1&limit=abc")
        .expect(200);

      expect(leaderboardService.getMostBurnedLeaderboard).toHaveBeenCalledWith(
        "7d",
        1,
        10
      );
    });

    it("should handle service errors", async () => {
      vi.mocked(leaderboardService.getMostBurnedLeaderboard).mockRejectedValue(
        new Error("Database error")
      );

      const response = await request(app)
        .get("/api/leaderboard/most-burned")
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("Failed to fetch leaderboard");
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  describe("GET /api/leaderboard/most-active", () => {
    it("should return most active tokens", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            rank: 1,
            token: {
              address: "0x123",
              name: "Token A",
              symbol: "TKA",
              decimals: 18,
              totalSupply: "1000000000",
              totalBurned: "1000000",
              burnCount: 50,
              metadataUri: null,
              createdAt: "2024-01-01T00:00:00.000Z",
            },
            metric: "50",
          },
        ],
        period: "7d" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 1, limit: 10, total: 1 },
      };

      vi.mocked(leaderboardService.getMostActiveLeaderboard).mockResolvedValue(
        mockResponse
      );

      const response = await request(app)
        .get("/api/leaderboard/most-active")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data[0].metric).toBe("50");
    });
  });

  describe("GET /api/leaderboard/newest", () => {
    it("should return newest tokens", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            rank: 1,
            token: {
              address: "0x456",
              name: "Token B",
              symbol: "TKB",
              decimals: 18,
              totalSupply: "2000000000",
              totalBurned: "0",
              burnCount: 0,
              metadataUri: null,
              createdAt: "2024-01-02T00:00:00.000Z",
            },
            metric: "2024-01-02T00:00:00.000Z",
          },
        ],
        period: "all" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 1, limit: 10, total: 1 },
      };

      vi.mocked(
        leaderboardService.getNewestTokensLeaderboard
      ).mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/leaderboard/newest")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(1);
    });
  });

  describe("GET /api/leaderboard/largest-supply", () => {
    it("should return tokens with largest supply", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            rank: 1,
            token: {
              address: "0x789",
              name: "Token C",
              symbol: "TKC",
              decimals: 18,
              totalSupply: "5000000000",
              totalBurned: "0",
              burnCount: 0,
              metadataUri: null,
              createdAt: "2024-01-03T00:00:00.000Z",
            },
            metric: "5000000000",
          },
        ],
        period: "all" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 1, limit: 10, total: 1 },
      };

      vi.mocked(
        leaderboardService.getLargestSupplyLeaderboard
      ).mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/leaderboard/largest-supply")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data[0].metric).toBe("5000000000");
    });
  });

  describe("GET /api/leaderboard/most-burners", () => {
    it("should return tokens with most unique burners", async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            rank: 1,
            token: {
              address: "0x123",
              name: "Token A",
              symbol: "TKA",
              decimals: 18,
              totalSupply: "1000000000",
              totalBurned: "1000000",
              burnCount: 50,
              metadataUri: null,
              createdAt: "2024-01-01T00:00:00.000Z",
            },
            metric: "25",
          },
        ],
        period: "7d" as any,
        updatedAt: new Date().toISOString(),
        pagination: { page: 1, limit: 10, total: 1 },
      };

      vi.mocked(leaderboardService.getMostBurnersLeaderboard).mockResolvedValue(
        mockResponse
      );

      const response = await request(app)
        .get("/api/leaderboard/most-burners")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data[0].metric).toBe("25");
    });
  });
});
