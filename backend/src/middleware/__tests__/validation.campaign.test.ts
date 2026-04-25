import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import campaignRoutes from "../../routes/campaigns";

// Prevent real DB calls
vi.mock("../../../src/services/campaignProjectionService", () => ({
  campaignProjectionService: {
    getCampaignById: vi.fn().mockResolvedValue(null),
    getExecutionHistory: vi.fn().mockResolvedValue({ executions: [], total: 0 }),
    getCampaignStats: vi.fn().mockResolvedValue({}),
    getCampaignsByToken: vi.fn().mockResolvedValue([]),
    getCampaignsByCreator: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../src/services/campaignEventParser", () => ({
  campaignEventParser: {
    parseCampaignCreated: vi.fn().mockResolvedValue(undefined),
  },
}));

const app = express();
app.use(express.json());
app.use("/api/campaigns", campaignRoutes);

const VALID_STELLAR = "GTOKEN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEF";

const validBody = {
  tokenId: "token-abc",
  creator: VALID_STELLAR,
  type: "BUYBACK",
  targetAmount: "1000000",
  startTime: "2026-05-01T00:00:00.000Z",
};

describe("POST /api/campaigns — validateCampaignCreate", () => {
  it("accepts a valid campaign creation request", async () => {
    const res = await request(app).post("/api/campaigns").send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("rejects missing tokenId", async () => {
    const { tokenId: _, ...body } = validBody;
    const res = await request(app).post("/api/campaigns").send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tokenId" }),
    ]));
  });

  it("rejects missing creator", async () => {
    const { creator: _, ...body } = validBody;
    const res = await request(app).post("/api/campaigns").send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "creator" }),
    ]));
  });

  it("rejects invalid Stellar address for creator", async () => {
    const res = await request(app).post("/api/campaigns").send({ ...validBody, creator: "not-a-stellar-address" });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/Stellar address/);
  });

  it("rejects missing type", async () => {
    const { type: _, ...body } = validBody;
    const res = await request(app).post("/api/campaigns").send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "type" }),
    ]));
  });

  it("rejects invalid campaign type", async () => {
    const res = await request(app).post("/api/campaigns").send({ ...validBody, type: "INVALID" });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/BUYBACK|AIRDROP|LIQUIDITY/);
  });

  it("accepts all valid campaign types", async () => {
    for (const type of ["BUYBACK", "AIRDROP", "LIQUIDITY"]) {
      const res = await request(app).post("/api/campaigns").send({ ...validBody, type });
      expect(res.status).toBe(201);
    }
  });

  it("rejects missing targetAmount", async () => {
    const { targetAmount: _, ...body } = validBody;
    const res = await request(app).post("/api/campaigns").send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "targetAmount" }),
    ]));
  });

  it("rejects non-integer targetAmount", async () => {
    const res = await request(app).post("/api/campaigns").send({ ...validBody, targetAmount: "100.5" });
    expect(res.status).toBe(400);
  });

  it("rejects zero targetAmount", async () => {
    const res = await request(app).post("/api/campaigns").send({ ...validBody, targetAmount: "0" });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/greater than zero/);
  });

  it("rejects negative targetAmount", async () => {
    const res = await request(app).post("/api/campaigns").send({ ...validBody, targetAmount: "-100" });
    expect(res.status).toBe(400);
  });

  it("rejects missing startTime", async () => {
    const { startTime: _, ...body } = validBody;
    const res = await request(app).post("/api/campaigns").send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "startTime" }),
    ]));
  });

  it("rejects invalid startTime format", async () => {
    const res = await request(app).post("/api/campaigns").send({ ...validBody, startTime: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("accepts optional endTime after startTime", async () => {
    const res = await request(app).post("/api/campaigns").send({
      ...validBody,
      endTime: "2026-06-01T00:00:00.000Z",
    });
    expect(res.status).toBe(201);
  });

  it("rejects endTime before startTime", async () => {
    const res = await request(app).post("/api/campaigns").send({
      ...validBody,
      endTime: "2025-01-01T00:00:00.000Z",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/after startTime/);
  });

  it("rejects endTime equal to startTime", async () => {
    const res = await request(app).post("/api/campaigns").send({
      ...validBody,
      endTime: validBody.startTime,
    });
    expect(res.status).toBe(400);
  });

  it("accepts optional metadata within limit", async () => {
    const res = await request(app).post("/api/campaigns").send({
      ...validBody,
      metadata: "some metadata",
    });
    expect(res.status).toBe(201);
  });

  it("rejects metadata exceeding 1024 characters", async () => {
    const res = await request(app).post("/api/campaigns").send({
      ...validBody,
      metadata: "x".repeat(1025),
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/1024/);
  });

  it("rejects non-string metadata", async () => {
    const res = await request(app).post("/api/campaigns").send({
      ...validBody,
      metadata: 12345,
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/campaigns/:campaignId — validateCampaignId", () => {
  it("accepts a valid integer campaignId", async () => {
    const res = await request(app).get("/api/campaigns/42");
    expect(res.status).toBe(404); // not found in mock, but validation passed
  });

  it("rejects a non-integer campaignId", async () => {
    const res = await request(app).get("/api/campaigns/abc");
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "campaignId" }),
    ]));
  });

  it("rejects zero as campaignId", async () => {
    const res = await request(app).get("/api/campaigns/0");
    expect(res.status).toBe(400);
  });

  it("rejects negative campaignId", async () => {
    const res = await request(app).get("/api/campaigns/-1");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/campaigns/:campaignId/executions — validateCampaignExecutionQuery", () => {
  it("accepts valid campaignId with no query params", async () => {
    const res = await request(app).get("/api/campaigns/1/executions");
    expect(res.status).toBe(200);
  });

  it("accepts valid limit and offset", async () => {
    const res = await request(app).get("/api/campaigns/1/executions?limit=10&offset=0");
    expect(res.status).toBe(200);
  });

  it("rejects limit above 200", async () => {
    const res = await request(app).get("/api/campaigns/1/executions?limit=201");
    expect(res.status).toBe(400);
  });

  it("rejects limit of zero", async () => {
    const res = await request(app).get("/api/campaigns/1/executions?limit=0");
    expect(res.status).toBe(400);
  });

  it("rejects negative offset", async () => {
    const res = await request(app).get("/api/campaigns/1/executions?offset=-1");
    expect(res.status).toBe(400);
  });

  it("rejects non-integer campaignId", async () => {
    const res = await request(app).get("/api/campaigns/abc/executions");
    expect(res.status).toBe(400);
  });
});
