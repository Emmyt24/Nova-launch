/**
 * Tests for rollback-manager.ts
 *
 * COVERAGE:
 *   - evaluateRollbackNeed: all trigger conditions
 *   - createRollbackRecord: record structure and uniqueness
 *   - validateRollbackTarget: all validation rules
 *   - formatRollbackSummary: output format
 */

import { describe, it, expect } from "vitest";
import {
  evaluateRollbackNeed,
  createRollbackRecord,
  validateRollbackTarget,
  formatRollbackSummary,
  type RollbackRecord,
} from "../rollback-manager";

// ---------------------------------------------------------------------------
// evaluateRollbackNeed
// ---------------------------------------------------------------------------

describe("evaluateRollbackNeed", () => {
  const baseParams = {
    healthCheckPassed: true,
    smokeTestPassed: true,
    errorRateDelta: 0.01,
    errorRateThreshold: 0.05,
    p99LatencyMs: 200,
    p99LatencyThresholdMs: 2000,
    activeSlot: "blue" as const,
  };

  it("returns shouldRollback=false when all checks pass", () => {
    const result = evaluateRollbackNeed(baseParams);
    expect(result.shouldRollback).toBe(false);
    expect(result.reason).toBe("All checks passed");
  });

  it("targets the inactive slot (green) when no rollback needed", () => {
    const result = evaluateRollbackNeed(baseParams);
    expect(result.targetSlot).toBe("green");
  });

  it("targets the inactive slot (blue) when active is green and no rollback needed", () => {
    const result = evaluateRollbackNeed({ ...baseParams, activeSlot: "green" });
    expect(result.targetSlot).toBe("blue");
  });

  describe("health check failure", () => {
    it("triggers rollback when health check fails", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        healthCheckPassed: false,
      });
      expect(result.shouldRollback).toBe(true);
      expect(result.reason).toContain("Health check failed");
      expect(result.targetSlot).toBe("blue"); // stay on active
    });

    it("health check failure takes priority over other checks", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        healthCheckPassed: false,
        smokeTestPassed: false,
        errorRateDelta: 0.99,
      });
      expect(result.reason).toContain("Health check failed");
    });
  });

  describe("smoke test failure", () => {
    it("triggers rollback when smoke test fails", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        smokeTestPassed: false,
      });
      expect(result.shouldRollback).toBe(true);
      expect(result.reason).toContain("Smoke test failed");
    });
  });

  describe("error rate threshold", () => {
    it("triggers rollback when error rate delta exceeds threshold", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        errorRateDelta: 0.1,
        errorRateThreshold: 0.05,
      });
      expect(result.shouldRollback).toBe(true);
      expect(result.reason).toContain("Error rate increased");
      expect(result.reason).toContain("10.0%");
    });

    it("does not trigger rollback when error rate is exactly at threshold", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        errorRateDelta: 0.05,
        errorRateThreshold: 0.05,
      });
      expect(result.shouldRollback).toBe(false);
    });

    it("includes threshold in rollback reason", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        errorRateDelta: 0.08,
        errorRateThreshold: 0.05,
      });
      expect(result.reason).toContain("5.0%");
    });
  });

  describe("latency threshold", () => {
    it("triggers rollback when P99 latency exceeds threshold", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        p99LatencyMs: 3000,
        p99LatencyThresholdMs: 2000,
      });
      expect(result.shouldRollback).toBe(true);
      expect(result.reason).toContain("P99 latency");
      expect(result.reason).toContain("3000ms");
      expect(result.reason).toContain("2000ms");
    });

    it("does not trigger rollback when latency is exactly at threshold", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        p99LatencyMs: 2000,
        p99LatencyThresholdMs: 2000,
      });
      expect(result.shouldRollback).toBe(false);
    });

    it("does not trigger rollback when latency is below threshold", () => {
      const result = evaluateRollbackNeed({
        ...baseParams,
        p99LatencyMs: 100,
        p99LatencyThresholdMs: 2000,
      });
      expect(result.shouldRollback).toBe(false);
    });
  });

  describe("rollback target slot", () => {
    it("always targets the active slot when rolling back", () => {
      const blueResult = evaluateRollbackNeed({
        ...baseParams,
        activeSlot: "blue",
        healthCheckPassed: false,
      });
      expect(blueResult.targetSlot).toBe("blue");

      const greenResult = evaluateRollbackNeed({
        ...baseParams,
        activeSlot: "green",
        healthCheckPassed: false,
      });
      expect(greenResult.targetSlot).toBe("green");
    });
  });
});

// ---------------------------------------------------------------------------
// createRollbackRecord
// ---------------------------------------------------------------------------

describe("createRollbackRecord", () => {
  const baseParams = {
    fromSlot: "green" as const,
    toSlot: "blue" as const,
    reason: "Health check failed",
    taskDefinitionArn:
      "arn:aws:ecs:us-east-1:123456789012:task-definition/nova-launch-production-backend:42",
    triggeredBy: "automatic" as const,
    success: true,
    durationSeconds: 45,
  };

  it("creates a record with all required fields", () => {
    const record = createRollbackRecord(baseParams);
    expect(record.id).toBeTruthy();
    expect(record.timestamp).toBeInstanceOf(Date);
    expect(record.fromSlot).toBe("green");
    expect(record.toSlot).toBe("blue");
    expect(record.reason).toBe("Health check failed");
    expect(record.triggeredBy).toBe("automatic");
    expect(record.success).toBe(true);
    expect(record.durationSeconds).toBe(45);
  });

  it("generates unique IDs for each record", () => {
    const r1 = createRollbackRecord(baseParams);
    const r2 = createRollbackRecord(baseParams);
    expect(r1.id).not.toBe(r2.id);
  });

  it("ID starts with 'rollback-'", () => {
    const record = createRollbackRecord(baseParams);
    expect(record.id).toMatch(/^rollback-\d+-[a-z0-9]+$/);
  });

  it("timestamp is close to now", () => {
    const before = Date.now();
    const record = createRollbackRecord(baseParams);
    const after = Date.now();
    expect(record.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(record.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it("handles manual trigger type", () => {
    const record = createRollbackRecord({
      ...baseParams,
      triggeredBy: "manual",
    });
    expect(record.triggeredBy).toBe("manual");
  });

  it("handles failed rollback", () => {
    const record = createRollbackRecord({ ...baseParams, success: false });
    expect(record.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateRollbackTarget
// ---------------------------------------------------------------------------

describe("validateRollbackTarget", () => {
  const validParams = {
    targetSlot: "blue" as const,
    targetTaskDefinitionArn:
      "arn:aws:ecs:us-east-1:123456789012:task-definition/nova-launch-production-backend:41",
    targetHealthyTaskCount: 2,
    minRequiredTasks: 1,
  };

  it("returns empty errors for a valid target", () => {
    const errors = validateRollbackTarget(validParams);
    expect(errors).toHaveLength(0);
  });

  it("returns error when task definition ARN is empty", () => {
    const errors = validateRollbackTarget({
      ...validParams,
      targetTaskDefinitionArn: "",
    });
    expect(errors.some((e) => e.includes("task definition ARN"))).toBe(true);
  });

  it("returns error when healthy task count is below minimum", () => {
    const errors = validateRollbackTarget({
      ...validParams,
      targetHealthyTaskCount: 0,
      minRequiredTasks: 1,
    });
    expect(errors.some((e) => e.includes("healthy tasks"))).toBe(true);
  });

  it("returns error when task definition ARN has invalid format", () => {
    const errors = validateRollbackTarget({
      ...validParams,
      targetTaskDefinitionArn: "not-a-valid-arn",
    });
    expect(errors.some((e) => e.includes("Invalid task definition ARN"))).toBe(
      true,
    );
  });

  it("accepts exactly the minimum required task count", () => {
    const errors = validateRollbackTarget({
      ...validParams,
      targetHealthyTaskCount: 1,
      minRequiredTasks: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it("accumulates multiple errors", () => {
    const errors = validateRollbackTarget({
      targetSlot: "green",
      targetTaskDefinitionArn: "",
      targetHealthyTaskCount: 0,
      minRequiredTasks: 2,
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// formatRollbackSummary
// ---------------------------------------------------------------------------

describe("formatRollbackSummary", () => {
  const record: RollbackRecord = {
    id: "rollback-1234567890-abc123",
    timestamp: new Date("2026-04-26T10:00:00Z"),
    fromSlot: "green",
    toSlot: "blue",
    reason: "Health check failed on new slot",
    taskDefinitionArn:
      "arn:aws:ecs:us-east-1:123456789012:task-definition/nova-launch-production-backend:42",
    triggeredBy: "automatic",
    success: true,
    durationSeconds: 38,
  };

  it("includes SUCCESS indicator for successful rollback", () => {
    const summary = formatRollbackSummary(record);
    expect(summary).toContain("SUCCESS");
  });

  it("includes FAILED indicator for failed rollback", () => {
    const summary = formatRollbackSummary({ ...record, success: false });
    expect(summary).toContain("FAILED");
  });

  it("includes the rollback ID", () => {
    const summary = formatRollbackSummary(record);
    expect(summary).toContain("rollback-1234567890-abc123");
  });

  it("includes from and to slots", () => {
    const summary = formatRollbackSummary(record);
    expect(summary).toContain("green");
    expect(summary).toContain("blue");
  });

  it("includes the reason", () => {
    const summary = formatRollbackSummary(record);
    expect(summary).toContain("Health check failed on new slot");
  });

  it("includes the trigger type", () => {
    const summary = formatRollbackSummary(record);
    expect(summary).toContain("automatic");
  });

  it("includes the duration", () => {
    const summary = formatRollbackSummary(record);
    expect(summary).toContain("38s");
  });

  it("includes the timestamp", () => {
    const summary = formatRollbackSummary(record);
    expect(summary).toContain("2026-04-26");
  });
});
