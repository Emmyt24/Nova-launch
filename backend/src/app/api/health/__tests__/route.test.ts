import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../route";
import { healthService } from "@/lib/health";

vi.mock("@/lib/health", () => ({
  healthService: {
    checkHealth: vi.fn(),
    getUptime: vi.fn(() => 100),
    getVersion: vi.fn(() => "0.1.0"),
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 200 for healthy status", async () => {
    vi.mocked(healthService.checkHealth).mockResolvedValue({
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
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.timestamp).toBeDefined();
    expect(data.uptime).toBe(100);
    expect(data.version).toBe("0.1.0");
    expect(data.services).toBeDefined();
  });

  it("should return 200 for degraded status", async () => {
    vi.mocked(healthService.checkHealth).mockResolvedValue({
      status: "degraded",
      timestamp: "2024-01-01T00:00:00.000Z",
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: {
          status: "degraded",
          responseTime: 20,
          message: "HTTP 429",
        },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("degraded");
    expect(data.services.stellarHorizon.status).toBe("degraded");
  });

  it("should return 503 for unhealthy status", async () => {
    vi.mocked(healthService.checkHealth).mockResolvedValue({
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
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.services.database.status).toBe("down");
    expect(data.services.database.error).toBeDefined();
  });

  it("should handle errors gracefully", async () => {
    vi.mocked(healthService.checkHealth).mockRejectedValue(
      new Error("Health check failed")
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.error).toBe("Health check failed");
    expect(data.timestamp).toBeDefined();
    expect(data.uptime).toBe(100);
    expect(data.version).toBe("0.1.0");
  });

  it("should include all required service checks", async () => {
    vi.mocked(healthService.checkHealth).mockResolvedValue({
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
    });

    const response = await GET();
    const data = await response.json();

    expect(data.services).toHaveProperty("database");
    expect(data.services).toHaveProperty("stellarHorizon");
    expect(data.services).toHaveProperty("stellarSoroban");
    expect(data.services).toHaveProperty("ipfs");
    expect(data.services).toHaveProperty("cache");
  });

  it("should include response times for all services", async () => {
    vi.mocked(healthService.checkHealth).mockResolvedValue({
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
    });

    const response = await GET();
    const data = await response.json();

    Object.values(data.services).forEach((service: any) => {
      expect(service.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  it("should return valid ISO timestamp", async () => {
    const now = new Date().toISOString();
    vi.mocked(healthService.checkHealth).mockResolvedValue({
      status: "healthy",
      timestamp: now,
      uptime: 100,
      version: "0.1.0",
      services: {
        database: { status: "up", responseTime: 10 },
        stellarHorizon: { status: "up", responseTime: 20 },
        stellarSoroban: { status: "up", responseTime: 30 },
        ipfs: { status: "up", responseTime: 40 },
        cache: { status: "up", responseTime: 5 },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(() => new Date(data.timestamp)).not.toThrow();
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
