import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import campaignRoutes from "../routes/campaigns";

vi.mock("../services/campaignProjectionService", () => ({
  campaignProjectionService: {
    getCampaignById: vi.fn(),
    getCampaignsByToken: vi.fn(),
    getCampaignsByCreator: vi.fn(),
    getExecutionHistory: vi.fn(),
    getCampaignStats: vi.fn(),
  },
}));

import { campaignProjectionService } from "../services/campaignProjectionService";

const app = express();
app.use(express.json());
app.use("/api/campaigns", campaignRoutes);

const mockCampaign = {
  id: "uuid-1",
  campaignId: 1,
  tokenId: "token-1",
  creator: "GCREATOR",
  type: "BUYBACK",
  status: "ACTIVE",
  targetAmount: BigInt(1000),
  currentAmount: BigInt(0),
  executionCount: 0,
  progress: 0,
  startTime: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Campaign routes public contract — mounted at /api/campaigns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /api/campaigns/:id returns campaign", async () => {
    vi.mocked(campaignProjectionService.getCampaignById).mockResolvedValue(mockCampaign as any);
    const res = await request(app).get("/api/campaigns/1");
    expect(res.status).toBe(200);
    expect(res.body.campaignId).toBe(1);
  });

  it("GET /api/campaigns/:id returns 404 when not found", async () => {
    vi.mocked(campaignProjectionService.getCampaignById).mockResolvedValue(null);
    const res = await request(app).get("/api/campaigns/999");
    expect(res.status).toBe(404);
  });

  it("GET /api/campaigns/token/:tokenId returns list", async () => {
    vi.mocked(campaignProjectionService.getCampaignsByToken).mockResolvedValue([mockCampaign] as any);
    const res = await request(app).get("/api/campaigns/token/token-1");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/campaigns/creator/:creator returns list", async () => {
    vi.mocked(campaignProjectionService.getCampaignsByCreator).mockResolvedValue([mockCampaign] as any);
    const res = await request(app).get("/api/campaigns/creator/GCREATOR");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/campaigns/:id/executions returns history", async () => {
    vi.mocked(campaignProjectionService.getExecutionHistory).mockResolvedValue({ executions: [], total: 0 });
    const res = await request(app).get("/api/campaigns/1/executions");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
  });

  it("GET /api/campaigns/stats returns stats", async () => {
    vi.mocked(campaignProjectionService.getCampaignStats).mockResolvedValue({
      totalCampaigns: 1, activeCampaigns: 1, completedCampaigns: 0,
      totalVolume: BigInt(0), totalExecutions: 0,
    });
    const res = await request(app).get("/api/campaigns/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalCampaigns");
  });

  it("old /api/campaigns/campaigns/:id path does NOT exist", async () => {
    const res = await request(app).get("/api/campaigns/campaigns/1");
    // Would 404 since no such route is registered
    expect(res.status).toBe(404);
  });
});
