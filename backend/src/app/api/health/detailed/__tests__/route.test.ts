import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../route";
import { healthService } from "@/lib/health";

vi.mock("@/lib/health", () => ({
  healthService: {
    checkDetailedHealth: vi.fn(),
    getUptime: vi.fn(() => 100),
    getVersion: vi.fn(() => "0.1.0"),
  },
}));

describe("GET /api/health/detailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 200 for healthy status with metrics", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "healthy",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 50000000,
          total: 100000000,
          percentage: 50,
        },
        cpu: {
          usage: 25,
        },
        database: {
          poolSize: 10,
          activeConnections: 2,
          idleConnections: 8,
        },
        requests: {
          total: 1000,
          errorRate: 2,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.metrics).toBeDefined();
    expect(data.metrics.memory).toBeDefined();
    expect(data.metrics.cpu).toBeDefined();
    expect(data.metrics.database).toBeDefined();
    expect(data.metrics.requests).toBeDefined();
  });

  it("should return 200 for degraded status with metrics", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "degraded",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: {
          status: "degraded",
          responseTime: 20,
          message: "Slow response",
        },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 80000000,
          total: 100000000,
          percentage: 80,
        },
        cpu: {
          usage: 75,
        },
        database: {
          poolSize: 10,
          activeConnections: 8,
          idleConnections: 2,
        },
        requests: {
          total: 5000,
          errorRate: 5,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("degraded");
    expect(data.metrics.memory.percentage).toBe(80);
    expect(data.metrics.cpu.usage).toBe(75);
  });

  it("should return 503 for unhealthy status", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "unhealthy",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: {
          status: "down",
          responseTime: 10,
          error: "Connection failed",
        },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 50000000,
          total: 100000000,
          percentage: 50,
        },
        cpu: {
          usage: 25,
        },
        database: {},
        requests: {
          total: 1000,
          errorRate: 50,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.services.database.status).toBe("down");
  });

  it("should handle errors gracefully", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockRejectedValue(
      new Error("Detailed health check failed")
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.error).toBe("Detailed health check failed");
  });

  it("should include memory metrics", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "healthy",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 50000000,
          total: 100000000,
          percentage: 50,
        },
        cpu: {
          usage: 25,
        },
        database: {},
        requests: {
          total: 1000,
          errorRate: 2,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.metrics.memory.used).toBeGreaterThan(0);
    expect(data.metrics.memory.total).toBeGreaterThan(0);
    expect(data.metrics.memory.percentage).toBeGreaterThanOrEqual(0);
    expect(data.metrics.memory.percentage).toBeLessThanOrEqual(100);
  });

  it("should include CPU metrics", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "healthy",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 50000000,
          total: 100000000,
          percentage: 50,
        },
        cpu: {
          usage: 25,
        },
        database: {},
        requests: {
          total: 1000,
          errorRate: 2,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.metrics.cpu.usage).toBeGreaterThanOrEqual(0);
  });

  it("should include request metrics", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "healthy",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 50000000,
          total: 100000000,
          percentage: 50,
        },
        cpu: {
          usage: 25,
        },
        database: {},
        requests: {
          total: 1000,
          errorRate: 2,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.metrics.requests.total).toBeGreaterThanOrEqual(0);
    expect(data.metrics.requests.errorRate).toBeGreaterThanOrEqual(0);
    expect(data.metrics.requests.errorRate).toBeLessThanOrEqual(100);
  });

  it("should include database pool metrics when available", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "healthy",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 50000000,
          total: 100000000,
          percentage: 50,
        },
        cpu: {
          usage: 25,
        },
        database: {
          poolSize: 10,
          activeConnections: 2,
          idleConnections: 8,
        },
        requests: {
          total: 1000,
          errorRate: 2,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.metrics.database).toBeDefined();
    if (data.metrics.database.poolSize) {
      expect(data.metrics.database.poolSize).toBeGreaterThan(0);
      expect(data.metrics.database.activeConnections).toBeGreaterThanOrEqual(0);
      expect(data.metrics.database.idleConnections).toBeGreaterThanOrEqual(0);
    }
  });

  it("should validate complete response schema", async () => {
    vi.mocked(healthService.checkDetailedHealth).mockResolvedValue({
      status: "healthy",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
      metrics: {
        memory: {
          used: 50000000,
          total: 100000000,
          percentage: 50,
        },
        cpu: {
          usage: 25,
        },
        database: {
          poolSize: 10,
          activeConnections: 2,
          idleConnections: 8,
        },
        requests: {
          total: 1000,
          errorRate: 2,
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    // Basic health fields
    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("version");
    expect(data).toHaveProperty("services");

    // Metrics fields
    expect(data).toHaveProperty("metrics");
    expect(data.metrics).toHaveProperty("memory");
    expect(data.metrics).toHaveProperty("cpu");
    expect(data.metrics).toHaveProperty("database");
    expect(data.metrics).toHaveProperty("requests");

    // Memory metrics
    expect(data.metrics.memory).toHaveProperty("used");
    expect(data.metrics.memory).toHaveProperty("total");
    expect(data.metrics.memory).toHaveProperty("percentage");

    // CPU metrics
    expect(data.metrics.cpu).toHaveProperty("usage");

    // Request metrics
    expect(data.metrics.requests).toHaveProperty("total");
    expect(data.metrics.requests).toHaveProperty("errorRate");
  });
});
