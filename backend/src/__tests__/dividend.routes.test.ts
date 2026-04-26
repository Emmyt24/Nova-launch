/**
 * Dividend Distribution API Routes – Integration Tests
 *
 * Tests HTTP layer: request validation, correct status codes, response shapes.
 * Service layer is mocked so these tests focus purely on the route handlers.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import dividendRoutes from "../routes/dividends";

// ─── Mock the service ────────────────────────────────────────────────────────

vi.mock("../services/dividendService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/dividendService")>();
  return {
    ...actual, // keep Zod schemas (real)
    createDividendPool: vi.fn(),
    claimDividend: vi.fn(),
    getHolderClaimable: vi.fn(),
    listDividendPools: vi.fn(),
    getDividendPool: vi.fn(),
    cancelDividendPool: vi.fn(),
  };
});

import {
  createDividendPool,
  claimDividend,
  getHolderClaimable,
  listDividendPools,
  getDividendPool,
  cancelDividendPool,
} from "../services/dividendService";

// ─── App setup ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use("/api/dividends", dividendRoutes);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const POOL_ID = "22222222-2222-2222-2222-222222222222";
const TOKEN_ID = "11111111-1111-1111-1111-111111111111";

const poolSummary = {
  id: POOL_ID,
  tokenId: TOKEN_ID,
  fundedBy: "GADMIN",
  totalAmount: "1000000",
  claimedAmount: "0",
  remainingAmount: "1000000",
  supplySnapshot: "10000000",
  perHolderCap: "0",
  expiresAt: null,
  status: "ACTIVE",
  txHash: "abc123",
  holderCount: 2,
  claimCount: 0,
  createdAt: "2024-01-01T00:00:00.000Z",
};

const validCreateBody = {
  tokenId: TOKEN_ID,
  fundedBy: "GADMIN",
  totalAmount: "1000000",
  supplySnapshot: "10000000",
  txHash: "abc123",
  holders: [{ holder: "GABC", balance: "5000000" }],
};

// ─── POST /api/dividends/pools ────────────────────────────────────────────────

describe("POST /api/dividends/pools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with pool on success", async () => {
    vi.mocked(createDividendPool).mockResolvedValue(poolSummary);

    const res = await request(app)
      .post("/api/dividends/pools")
      .send(validCreateBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(POOL_ID);
  });

  it("returns 400 on validation failure (missing tokenId)", async () => {
    const { tokenId: _, ...body } = validCreateBody;
    const res = await request(app).post("/api/dividends/pools").send(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 400 on validation failure (non-numeric totalAmount)", async () => {
    const res = await request(app)
      .post("/api/dividends/pools")
      .send({ ...validCreateBody, totalAmount: "not-a-number" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when service throws token not found", async () => {
    vi.mocked(createDividendPool).mockRejectedValue(new Error("Token not found: xyz"));

    const res = await request(app)
      .post("/api/dividends/pools")
      .send(validCreateBody);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when service throws a business rule error", async () => {
    vi.mocked(createDividendPool).mockRejectedValue(
      new Error("totalAmount must be greater than zero")
    );

    const res = await request(app)
      .post("/api/dividends/pools")
      .send(validCreateBody);

    expect(res.status).toBe(400);
  });
});

// ─── GET /api/dividends/pools ─────────────────────────────────────────────────

describe("GET /api/dividends/pools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with paginated list", async () => {
    vi.mocked(listDividendPools).mockResolvedValue({
      data: [poolSummary],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const res = await request(app).get("/api/dividends/pools");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("passes tokenId filter to service", async () => {
    vi.mocked(listDividendPools).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    await request(app).get(`/api/dividends/pools?tokenId=${TOKEN_ID}`);

    expect(listDividendPools).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: TOKEN_ID })
    );
  });

  it("returns 400 on invalid status filter", async () => {
    const res = await request(app).get("/api/dividends/pools?status=INVALID");
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/dividends/pools/:poolId ─────────────────────────────────────────

describe("GET /api/dividends/pools/:poolId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with pool data", async () => {
    vi.mocked(getDividendPool).mockResolvedValue(poolSummary);

    const res = await request(app).get(`/api/dividends/pools/${POOL_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(POOL_ID);
  });

  it("returns 404 when pool not found", async () => {
    vi.mocked(getDividendPool).mockRejectedValue(new Error("not found"));

    const res = await request(app).get(`/api/dividends/pools/${POOL_ID}`);
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/dividends/pools/:poolId ──────────────────────────────────────

describe("DELETE /api/dividends/pools/:poolId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 on successful cancellation", async () => {
    vi.mocked(cancelDividendPool).mockResolvedValue({
      ...poolSummary,
      status: "CANCELLED",
    });

    const res = await request(app)
      .delete(`/api/dividends/pools/${POOL_ID}`)
      .send({ requestedBy: "GADMIN" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CANCELLED");
  });

  it("returns 400 when requestedBy is missing", async () => {
    const res = await request(app)
      .delete(`/api/dividends/pools/${POOL_ID}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 403 when requestedBy is not the funder", async () => {
    vi.mocked(cancelDividendPool).mockRejectedValue(
      new Error("Only the pool funder can cancel this pool")
    );

    const res = await request(app)
      .delete(`/api/dividends/pools/${POOL_ID}`)
      .send({ requestedBy: "GOTHER" });

    expect(res.status).toBe(403);
  });

  it("returns 404 when pool not found", async () => {
    vi.mocked(cancelDividendPool).mockRejectedValue(new Error("not found"));

    const res = await request(app)
      .delete(`/api/dividends/pools/${POOL_ID}`)
      .send({ requestedBy: "GADMIN" });

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/dividends/claim ────────────────────────────────────────────────

describe("POST /api/dividends/claim", () => {
  const validClaimBody = {
    poolId: POOL_ID,
    claimant: "GABC1234",
    txHash: "claimtx1",
  };

  const claimResult = {
    claimId: "claim-uuid",
    poolId: POOL_ID,
    claimant: "GABC1234",
    amount: "500000",
    txHash: "claimtx1",
    claimedAt: "2024-01-02T00:00:00.000Z",
  };

  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with claim result on success", async () => {
    vi.mocked(claimDividend).mockResolvedValue(claimResult);

    const res = await request(app)
      .post("/api/dividends/claim")
      .send(validClaimBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe("500000");
  });

  it("returns 400 on validation failure (non-UUID poolId)", async () => {
    const res = await request(app)
      .post("/api/dividends/claim")
      .send({ ...validClaimBody, poolId: "not-a-uuid" });

    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate claim", async () => {
    vi.mocked(claimDividend).mockRejectedValue(
      new Error("already claimed from pool")
    );

    const res = await request(app)
      .post("/api/dividends/claim")
      .send(validClaimBody);

    expect(res.status).toBe(409);
  });

  it("returns 404 when pool not found", async () => {
    vi.mocked(claimDividend).mockRejectedValue(new Error("not found"));

    const res = await request(app)
      .post("/api/dividends/claim")
      .send(validClaimBody);

    expect(res.status).toBe(404);
  });

  it("returns 400 for other business errors", async () => {
    vi.mocked(claimDividend).mockRejectedValue(
      new Error("Insufficient pool funds")
    );

    const res = await request(app)
      .post("/api/dividends/claim")
      .send(validClaimBody);

    expect(res.status).toBe(400);
  });
});

// ─── GET /api/dividends/claimable ─────────────────────────────────────────────

describe("GET /api/dividends/claimable", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with claimable info", async () => {
    vi.mocked(getHolderClaimable).mockResolvedValue({
      poolId: POOL_ID,
      claimant: "GABC",
      claimable: "500000",
      alreadyClaimed: false,
      claimedAmount: "0",
    });

    const res = await request(app).get(
      `/api/dividends/claimable?poolId=${POOL_ID}&claimant=GABC`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.claimable).toBe("500000");
    expect(res.body.data.alreadyClaimed).toBe(false);
  });

  it("returns 400 when poolId is missing", async () => {
    const res = await request(app).get("/api/dividends/claimable?claimant=GABC");
    expect(res.status).toBe(400);
  });

  it("returns 400 when claimant is missing", async () => {
    const res = await request(app).get(
      `/api/dividends/claimable?poolId=${POOL_ID}`
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no snapshot found", async () => {
    vi.mocked(getHolderClaimable).mockRejectedValue(new Error("No snapshot"));

    const res = await request(app).get(
      `/api/dividends/claimable?poolId=${POOL_ID}&claimant=GABC`
    );

    expect(res.status).toBe(404);
  });
});
