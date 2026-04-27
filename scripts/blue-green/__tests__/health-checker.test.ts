/**
 * Tests for health-checker.ts
 *
 * COVERAGE:
 *   - checkHealth: success, non-200, timeout, network error
 *   - waitForHealthy: becomes healthy, timeout, consecutive success requirement
 *   - validateHealthResponse: valid/invalid response shapes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkHealth,
  waitForHealthy,
  validateHealthResponse,
} from "../health-checker";

// ---------------------------------------------------------------------------
// checkHealth
// ---------------------------------------------------------------------------

describe("checkHealth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok=true and status 200 for a healthy response", async () => {
    const mockBody = { data: { status: "healthy", uptime: 120 } };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockBody,
    } as Response);

    const result = await checkHealth("http://10.0.1.5:3001/health");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(mockBody);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=false for a 503 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ data: { status: "unhealthy" } }),
    } as Response);

    const result = await checkHealth("http://10.0.1.5:3001/health");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });

  it("returns ok=false for a 207 degraded response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 207,
      json: async () => ({ data: { status: "degraded" } }),
    } as Response);

    const result = await checkHealth("http://10.0.1.5:3001/health");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(207);
  });

  it("handles non-JSON response body gracefully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not JSON");
      },
    } as unknown as Response);

    const result = await checkHealth("http://10.0.1.5:3001/health");
    expect(result.ok).toBe(true);
    expect(result.body).toBeNull();
  });

  it("throws on network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(checkHealth("http://10.0.1.5:3001/health")).rejects.toThrow(
      "Health check failed",
    );
  });

  it("throws with timeout message on AbortError", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    vi.mocked(fetch).mockRejectedValueOnce(abortError);

    await expect(
      checkHealth("http://10.0.1.5:3001/health", 5000),
    ).rejects.toThrow("timed out");
  });
});

// ---------------------------------------------------------------------------
// waitForHealthy
// ---------------------------------------------------------------------------

describe("waitForHealthy", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns healthy=true after required consecutive successes", async () => {
    // Two consecutive 200 responses
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { status: "healthy", uptime: 10 } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { status: "healthy", uptime: 15 } }),
      } as Response);

    const promise = waitForHealthy({
      url: "http://10.0.1.5:3001/health",
      requiredSuccesses: 2,
      intervalMs: 100,
      totalTimeoutMs: 5000,
    });

    // Advance timers to trigger the interval
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.healthy).toBe(true);
    expect(result.consecutiveSuccesses).toBe(2);
  });

  it("resets consecutive successes on a failure between successes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

    const promise = waitForHealthy({
      url: "http://10.0.1.5:3001/health",
      requiredSuccesses: 2,
      intervalMs: 100,
      totalTimeoutMs: 10_000,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.healthy).toBe(true);
    expect(result.totalChecks).toBeGreaterThanOrEqual(4);
  });

  it("returns healthy=false after maxFailures consecutive errors", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    const promise = waitForHealthy({
      url: "http://10.0.1.5:3001/health",
      maxFailures: 3,
      intervalMs: 100,
      totalTimeoutMs: 10_000,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.healthy).toBe(false);
    expect(result.consecutiveFailures).toBeGreaterThanOrEqual(3);
  });

  it("returns healthy=false on total timeout", async () => {
    // Always returns 503
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);

    const promise = waitForHealthy({
      url: "http://10.0.1.5:3001/health",
      requiredSuccesses: 2,
      maxFailures: 999,
      intervalMs: 100,
      totalTimeoutMs: 500,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.healthy).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("uses custom expectedStatus", async () => {
    // Returns 207 (degraded) — should be treated as success when expectedStatus=207
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 207,
      json: async () => ({}),
    } as Response);

    const promise = waitForHealthy({
      url: "http://10.0.1.5:3001/health",
      expectedStatus: 207,
      requiredSuccesses: 1,
      intervalMs: 100,
      totalTimeoutMs: 5000,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.healthy).toBe(true);
    expect(result.statusCode).toBe(207);
  });
});

// ---------------------------------------------------------------------------
// validateHealthResponse
// ---------------------------------------------------------------------------

describe("validateHealthResponse", () => {
  it("returns valid=true for a well-formed healthy response", () => {
    const result = validateHealthResponse({
      data: { status: "healthy", uptime: 120, version: "1.0.0" },
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("healthy");
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid=true for degraded status", () => {
    const result = validateHealthResponse({
      data: { status: "degraded", uptime: 60 },
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("degraded");
  });

  it("returns valid=true for unhealthy status", () => {
    const result = validateHealthResponse({
      data: { status: "unhealthy", uptime: 0 },
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("unhealthy");
  });

  it("returns valid=false for null body", () => {
    const result = validateHealthResponse(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns valid=false for non-object body", () => {
    const result = validateHealthResponse("ok");
    expect(result.valid).toBe(false);
  });

  it("returns valid=false when data field is missing", () => {
    const result = validateHealthResponse({ status: "healthy" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("data"))).toBe(true);
  });

  it("returns valid=false when status field is missing", () => {
    const result = validateHealthResponse({ data: { uptime: 10 } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("status"))).toBe(true);
  });

  it("returns valid=false for unknown status value", () => {
    const result = validateHealthResponse({
      data: { status: "running", uptime: 10 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid status"))).toBe(true);
  });

  it("returns valid=false when uptime is missing", () => {
    const result = validateHealthResponse({
      data: { status: "healthy" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("uptime"))).toBe(true);
  });

  it("returns valid=false when uptime is a string", () => {
    const result = validateHealthResponse({
      data: { status: "healthy", uptime: "120" },
    });
    expect(result.valid).toBe(false);
  });

  it("accumulates multiple errors", () => {
    const result = validateHealthResponse({ data: {} });
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
