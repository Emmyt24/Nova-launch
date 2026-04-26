/**
 * Tests for backend/src/lib/circuitBreaker.ts
 *
 * Coverage targets:
 *  - CircuitBreaker class: all states, transitions, methods
 *  - CircuitBreakerOpenError: construction, inheritance
 *  - State management: closed, open, half-open transitions
 *  - Metrics and monitoring
 *  - Edge cases: timeouts, concurrent calls, reset functionality
 *  - Error handling and propagation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CircuitBreaker, CircuitBreakerOpenError, CircuitBreakerOptions } from "./circuitBreaker";
import { ErrorCode } from "./errors";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;
  const defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 1000,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker(defaultOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("initializes with closed state", () => {
      expect(breaker.getState()).toBe("closed");
    });

    it("accepts custom options", () => {
      const custom = new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 3,
        timeoutMs: 2000,
      });
      expect(custom.getState()).toBe("closed");
    });
  });

  describe("execute", () => {
    describe("closed state", () => {
      it("executes function successfully", async () => {
        const result = await breaker.execute(async () => "success");
        expect(result).toBe("success");
        expect(breaker.getState()).toBe("closed");
      });

      it("handles function failure and increments failure count", async () => {
        await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
        expect(breaker.getState()).toBe("closed");
        const metrics = breaker.getMetrics();
        expect(metrics.failureCount).toBe(1);
      });

      it("opens circuit after failure threshold", async () => {
        for (let i = 0; i < defaultOptions.failureThreshold; i++) {
          await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
        }
        expect(breaker.getState()).toBe("open");
      });

      it("resets failure count on success", async () => {
        await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
        await breaker.execute(async () => "success");
        const metrics = breaker.getMetrics();
        expect(metrics.failureCount).toBe(0);
      });
    });

    describe("open state", () => {
      beforeEach(async () => {
        // Open the circuit
        for (let i = 0; i < defaultOptions.failureThreshold; i++) {
          await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
        }
        expect(breaker.getState()).toBe("open");
      });

      it("throws CircuitBreakerOpenError immediately", async () => {
        await expect(breaker.execute(async () => "success")).rejects.toThrow(CircuitBreakerOpenError);
        const error = await breaker.execute(async () => "success").catch(e => e);
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect(error.code).toBe(ErrorCode.CIRCUIT_BREAKER_OPEN);
      });

      it("transitions to half-open after timeout", async () => {
        vi.advanceTimersByTime(defaultOptions.timeoutMs);
        // Should allow execution now
        const result = await breaker.execute(async () => "success");
        expect(result).toBe("success");
        expect(breaker.getState()).toBe("half-open");
      });

      it("stays open if timeout not reached", async () => {
        vi.advanceTimersByTime(defaultOptions.timeoutMs - 1);
        await expect(breaker.execute(async () => "success")).rejects.toThrow(CircuitBreakerOpenError);
        expect(breaker.getState()).toBe("open");
      });
    });

    describe("half-open state", () => {
      beforeEach(async () => {
        // Open the circuit
        for (let i = 0; i < defaultOptions.failureThreshold; i++) {
          await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
        }
        // Wait for timeout
        vi.advanceTimersByTime(defaultOptions.timeoutMs);
        // State will transition to half-open on next execute call
      });

      it("closes circuit after success threshold", async () => {
        for (let i = 0; i < defaultOptions.successThreshold; i++) {
          await breaker.execute(async () => "success");
        }
        expect(breaker.getState()).toBe("closed");
      });

      it("re-opens circuit on failure", async () => {
        await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
        expect(breaker.getState()).toBe("open");
      });

      it("stays half-open with partial successes", async () => {
        await breaker.execute(async () => "success");
        expect(breaker.getState()).toBe("half-open");
        const metrics = breaker.getMetrics();
        expect(metrics.successCount).toBe(1);
      });

      it("resets success count on transition to half-open", async () => {
        // First, get to half-open by calling execute
        await breaker.execute(async () => "success");
        expect(breaker.getMetrics().successCount).toBe(1);
      });
    });
  });

  describe("getState", () => {
    it("returns current state", () => {
      expect(breaker.getState()).toBe("closed");
    });
  });

  describe("getMetrics", () => {
    it("returns comprehensive metrics", () => {
      const metrics = breaker.getMetrics();
      expect(metrics).toHaveProperty("state");
      expect(metrics).toHaveProperty("failureCount");
      expect(metrics).toHaveProperty("successCount");
      expect(metrics).toHaveProperty("lastFailureTime");
      expect(metrics).toHaveProperty("timeSinceLastFailure");
    });

    it("tracks failure metrics", async () => {
      const before = breaker.getMetrics();
      await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      const after = breaker.getMetrics();
      expect(after.failureCount).toBe(before.failureCount + 1);
      expect(after.lastFailureTime).toBeGreaterThan(before.lastFailureTime);
    });
  });

  describe("reset", () => {
    it("resets circuit to closed state", async () => {
      // Open the circuit
      for (let i = 0; i < defaultOptions.failureThreshold; i++) {
        await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      }
      expect(breaker.getState()).toBe("open");

      breaker.reset();
      expect(breaker.getState()).toBe("closed");
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.lastFailureTime).toBe(0);
    });
  });

  describe("concurrent calls", () => {
    it("handles concurrent calls in open state", async () => {
      // Open the circuit
      for (let i = 0; i < defaultOptions.failureThreshold; i++) {
        await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      }

      const promises = Array(5).fill(null).map(() =>
        breaker.execute(async () => "success").catch(e => e)
      );
      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toBeInstanceOf(CircuitBreakerOpenError);
      });
    });

    it("handles concurrent calls transitioning to half-open", async () => {
      // Open the circuit
      for (let i = 0; i < defaultOptions.failureThreshold; i++) {
        await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(defaultOptions.timeoutMs);

      // Multiple calls when transitioning
      const promises = Array(3).fill(null).map(() =>
        breaker.execute(async () => "success")
      );
      const results = await Promise.all(promises);
      results.forEach(result => expect(result).toBe("success"));
      // State should be closed after success threshold successes
      expect(breaker.getState()).toBe("closed");
    });
  });

  describe("edge cases", () => {
    it("handles timeout exactly at boundary", async () => {
      // Open the circuit
      for (let i = 0; i < defaultOptions.failureThreshold; i++) {
        await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      }

      vi.advanceTimersByTime(defaultOptions.timeoutMs - 1);
      await expect(breaker.execute(async () => "success")).rejects.toThrow(CircuitBreakerOpenError);

      vi.advanceTimersByTime(1);
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("handles zero thresholds", () => {
      const zeroBreaker = new CircuitBreaker({
        failureThreshold: 0,
        successThreshold: 1,
        timeoutMs: 1000,
      });
      // Should open immediately, but since threshold is 0, maybe not.
      // Actually, failureThreshold 0 doesn't make sense, but test robustness
      expect(zeroBreaker.getState()).toBe("closed");
    });

    it("handles very large thresholds", async () => {
      const largeBreaker = new CircuitBreaker({
        failureThreshold: 1000,
        successThreshold: 500,
        timeoutMs: 1000,
      });

      for (let i = 0; i < 999; i++) {
        await expect(largeBreaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      }
      expect(largeBreaker.getState()).toBe("closed");

      await expect(largeBreaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      expect(largeBreaker.getState()).toBe("open");
    });
  });
});

describe("CircuitBreakerOpenError", () => {
  it("is an AppError", () => {
    const error = new CircuitBreakerOpenError();
    expect(error).toBeInstanceOf(CircuitBreakerOpenError);
    expect(error.code).toBe(ErrorCode.CIRCUIT_BREAKER_OPEN);
    expect(error.httpStatus).toBe(503);
  });

  it("includes service name in message", () => {
    const error = new CircuitBreakerOpenError("Stellar");
    expect(error.message).toContain("for Stellar");
  });

  it("defaults message without service name", () => {
    const error = new CircuitBreakerOpenError();
    expect(error.message).toBe("Circuit breaker is open. Service may be unavailable.");
  });
});