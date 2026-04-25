/**
 * Tests for health check routes.
 *
 * Uses supertest against the Express router directly — no real DB or network.
 * The healthService is mocked so tests are fast and deterministic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock healthService before importing the router
// ---------------------------------------------------------------------------

const mockCheckHealth = vi.fn();
const mockCheckDetailedHealth = vi.fn();

vi.mock("../lib/health/health.service", () => ({
  healthService: {
    checkHealth: mockCheckHealth,
    checkDetailedHealth: mockCheckDetailedHealth,
  },
}));

// Import router AFTER mock is set up
const { default: healthRouter } = await import("../routes/health");

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/health", healthRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const healthyResult = {
  status: "healthy",
  timestamp: "2026-01-01T00:00:00.000Z",
  uptime: 100,
  version: "1.0.0",
  services: {
    database: { status: "up", responseTime: 5 },
    stellarHorizon: { status: "up", responseTime: 50 },
    stellarSoroban: { status: "up", responseTime: 60 },
    ipfs: { status: "up", responseTime: 80 },
    cache: { status: "up", responseTime: 1 },
  },
};

const degradedResult = {
  ...healthyResult,
  status: "degraded",
  services: {
    ...healthyResult.services,
    stellarHorizon: { status: "degraded", responseTime: 200, message: "HTTP 503" },
  },
};

const unhealthyResult = {
  ...healthyResult,
  status: "unhealthy",
  services: {
    ...healthyResult.services,
    database: { status: "down", responseTime: 5001, error: "Connection refused" },
  },
};

const detailedResult = {
  ...healthyResult,
  metrics: {
    memory: { used: 50_000_000, total: 100_000_000, percentage: 50 },
    cpu: { usage: 10 },
    database: { poolSize: 5, activeConnections: 1, idleConnections: 4 },
    requests: { total: 1000, errorRate: 2 },
  },
};

// ---------------------------------------------------------------------------
// GET /health/live
// ---------------------------------------------------------------------------

describe("GET /health/live", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(makeApp()).get("/health/live");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
  });

  it("includes uptime and timestamp", async () => {
    const res = await request(makeApp()).get("/health/live");

    expect(typeof res.body.data.uptime).toBe("number");
    expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("does NOT call healthService (no dep checks)", async () => {
    await request(makeApp()).get("/health/live");
    expect(mockCheckHealth).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /health/ready
// ---------------------------------------------------------------------------

describe("GET /health/ready", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when healthy", async () => {
    mockCheckHealth.mockResolvedValue(healthyResult);

    const res = await request(makeApp()).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("healthy");
  });

  it("returns 207 when degraded", async () => {
    mockCheckHealth.mockResolvedValue(degradedResult);

    const res = await request(makeApp()).get("/health/ready");

    expect(res.status).toBe(207);
    expect(res.body.data.status).toBe("degraded");
  });

  it("returns 503 when unhealthy", async () => {
    mockCheckHealth.mockResolvedValue(unhealthyResult);

    const res = await request(makeApp()).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe("unhealthy");
  });

  it("includes all service statuses in response", async () => {
    mockCheckHealth.mockResolvedValue(healthyResult);

    const res = await request(makeApp()).get("/health/ready");
    const { services } = res.body.data;

    expect(services).toHaveProperty("database");
    expect(services).toHaveProperty("stellarHorizon");
    expect(services).toHaveProperty("stellarSoroban");
    expect(services).toHaveProperty("ipfs");
    expect(services).toHaveProperty("cache");
  });

  it("includes responseTime for each service", async () => {
    mockCheckHealth.mockResolvedValue(healthyResult);

    const res = await request(makeApp()).get("/health/ready");
    const { services } = res.body.data;

    for (const svc of Object.values(services) as any[]) {
      expect(typeof svc.responseTime).toBe("number");
    }
  });

  it("exposes database error message when down", async () => {
    mockCheckHealth.mockResolvedValue(unhealthyResult);

    const res = await request(makeApp()).get("/health/ready");

    expect(res.body.data.services.database.error).toBe("Connection refused");
  });

  it("returns success:true wrapper on all status codes", async () => {
    for (const result of [healthyResult, degradedResult, unhealthyResult]) {
      mockCheckHealth.mockResolvedValue(result);
      const res = await request(makeApp()).get("/health/ready");
      expect(res.body.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /health (alias)
// ---------------------------------------------------------------------------

describe("GET /health (alias)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns same result as /health/ready when healthy", async () => {
    mockCheckHealth.mockResolvedValue(healthyResult);

    const res = await request(makeApp()).get("/health/");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("healthy");
  });

  it("returns 503 when unhealthy", async () => {
    mockCheckHealth.mockResolvedValue(unhealthyResult);

    const res = await request(makeApp()).get("/health/");
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET /health/detail
// ---------------------------------------------------------------------------

describe("GET /health/detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HEALTH_DETAIL_ENABLED;
  });

  it("returns 200 with metrics in non-production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    mockCheckDetailedHealth.mockResolvedValue(detailedResult);

    const res = await request(makeApp()).get("/health/detail");

    expect(res.status).toBe(200);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.metrics.memory).toBeDefined();
    expect(res.body.data.metrics.cpu).toBeDefined();
    expect(res.body.data.metrics.requests).toBeDefined();

    process.env.NODE_ENV = originalEnv;
  });

  it("returns 403 in production without HEALTH_DETAIL_ENABLED", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const res = await request(makeApp()).get("/health/detail");

    expect(res.status).toBe(403);
    expect(mockCheckDetailedHealth).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it("returns 200 in production when HEALTH_DETAIL_ENABLED=true", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.HEALTH_DETAIL_ENABLED = "true";
    mockCheckDetailedHealth.mockResolvedValue(detailedResult);

    const res = await request(makeApp()).get("/health/detail");

    expect(res.status).toBe(200);
    expect(res.body.data.metrics).toBeDefined();

    process.env.NODE_ENV = originalEnv;
    delete process.env.HEALTH_DETAIL_ENABLED;
  });

  it("includes memory percentage in metrics", async () => {
    process.env.NODE_ENV = "test";
    mockCheckDetailedHealth.mockResolvedValue(detailedResult);

    const res = await request(makeApp()).get("/health/detail");

    expect(res.body.data.metrics.memory.percentage).toBe(50);
  });

  it("returns 207 when detailed check is degraded", async () => {
    process.env.NODE_ENV = "test";
    mockCheckDetailedHealth.mockResolvedValue({ ...detailedResult, status: "degraded" });

    const res = await request(makeApp()).get("/health/detail");
    expect(res.status).toBe(207);
  });
});
