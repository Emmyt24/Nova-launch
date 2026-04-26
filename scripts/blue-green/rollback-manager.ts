/**
 * Rollback Manager — Blue-Green Deployment
 *
 * Handles automatic and manual rollback scenarios:
 *   - Automatic rollback on deployment failure
 *   - Manual rollback to a specific previous slot
 *   - Rollback history tracking
 *   - Rollback validation (ensures previous slot is still healthy)
 */

import type { Slot } from "./blue-green-deploy";

export interface RollbackRecord {
  id: string;
  timestamp: Date;
  fromSlot: Slot;
  toSlot: Slot;
  reason: string;
  taskDefinitionArn: string;
  triggeredBy: "automatic" | "manual";
  success: boolean;
  durationSeconds: number;
}

export interface RollbackDecision {
  shouldRollback: boolean;
  reason: string;
  targetSlot: Slot;
}

/**
 * Determines whether an automatic rollback should be triggered based on
 * deployment metrics and health check results.
 */
export function evaluateRollbackNeed(params: {
  healthCheckPassed: boolean;
  smokeTestPassed: boolean;
  errorRateDelta: number;
  errorRateThreshold: number;
  p99LatencyMs: number;
  p99LatencyThresholdMs: number;
  activeSlot: Slot;
}): RollbackDecision {
  const {
    healthCheckPassed,
    smokeTestPassed,
    errorRateDelta,
    errorRateThreshold,
    p99LatencyMs,
    p99LatencyThresholdMs,
    activeSlot,
  } = params;

  const targetSlot: Slot = activeSlot === "blue" ? "green" : "blue";

  if (!healthCheckPassed) {
    return {
      shouldRollback: true,
      reason: "Health check failed on new slot",
      targetSlot: activeSlot,
    };
  }

  if (!smokeTestPassed) {
    return {
      shouldRollback: true,
      reason: "Smoke test failed on new slot",
      targetSlot: activeSlot,
    };
  }

  if (errorRateDelta > errorRateThreshold) {
    return {
      shouldRollback: true,
      reason: `Error rate increased by ${(errorRateDelta * 100).toFixed(1)}% (threshold: ${(errorRateThreshold * 100).toFixed(1)}%)`,
      targetSlot: activeSlot,
    };
  }

  if (p99LatencyMs > p99LatencyThresholdMs) {
    return {
      shouldRollback: true,
      reason: `P99 latency ${p99LatencyMs}ms exceeds threshold ${p99LatencyThresholdMs}ms`,
      targetSlot: activeSlot,
    };
  }

  return {
    shouldRollback: false,
    reason: "All checks passed",
    targetSlot,
  };
}

/**
 * Creates a rollback record for audit logging.
 */
export function createRollbackRecord(params: {
  fromSlot: Slot;
  toSlot: Slot;
  reason: string;
  taskDefinitionArn: string;
  triggeredBy: "automatic" | "manual";
  success: boolean;
  durationSeconds: number;
}): RollbackRecord {
  return {
    id: `rollback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    ...params,
  };
}

/**
 * Validates that a rollback target is safe to roll back to.
 * Returns an array of validation errors (empty = safe to proceed).
 */
export function validateRollbackTarget(params: {
  targetSlot: Slot;
  targetTaskDefinitionArn: string;
  targetHealthyTaskCount: number;
  minRequiredTasks: number;
}): string[] {
  const errors: string[] = [];

  if (!params.targetTaskDefinitionArn) {
    errors.push("No task definition ARN available for rollback target");
  }

  if (params.targetHealthyTaskCount < params.minRequiredTasks) {
    errors.push(
      `Rollback target (${params.targetSlot}) has only ${params.targetHealthyTaskCount} healthy tasks, ` +
        `minimum required: ${params.minRequiredTasks}`,
    );
  }

  if (
    params.targetTaskDefinitionArn &&
    !params.targetTaskDefinitionArn.startsWith("arn:aws:ecs:")
  ) {
    errors.push(
      `Invalid task definition ARN format: ${params.targetTaskDefinitionArn}`,
    );
  }

  return errors;
}

/**
 * Formats a rollback record for human-readable logging.
 */
export function formatRollbackSummary(record: RollbackRecord): string {
  const status = record.success ? "✅ SUCCESS" : "❌ FAILED";
  return [
    `Rollback ${status}`,
    `  ID:       ${record.id}`,
    `  Time:     ${record.timestamp.toISOString()}`,
    `  From:     ${record.fromSlot} → ${record.toSlot}`,
    `  Reason:   ${record.reason}`,
    `  Trigger:  ${record.triggeredBy}`,
    `  Duration: ${record.durationSeconds}s`,
  ].join("\n");
}
