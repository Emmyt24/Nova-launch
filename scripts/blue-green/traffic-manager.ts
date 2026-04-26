/**
 * Traffic Manager — Blue-Green Deployment
 *
 * Manages ALB listener rule weights to implement gradual or instant
 * traffic shifting between blue and green target groups.
 *
 * Supports two modes:
 *   - instant:  100% traffic shift in one step (default)
 *   - canary:   gradual shift (10% → 25% → 50% → 100%) with health checks
 *               between each step
 */

import type { Slot } from "./blue-green-deploy";

export type ShiftMode = "instant" | "canary";

export interface TrafficWeight {
  blueWeight: number;
  greenWeight: number;
}

export interface TrafficShiftStep {
  newSlotWeight: number;
  oldSlotWeight: number;
  description: string;
}

export interface TrafficShiftConfig {
  mode: ShiftMode;
  /** For canary mode: weights to step through (default [10, 25, 50, 100]) */
  canarySteps?: number[];
  /** For canary mode: seconds to wait between steps (default 60) */
  stepWaitSeconds?: number;
  /** For canary mode: error rate threshold to abort (default 0.05 = 5%) */
  errorRateThreshold?: number;
}

/**
 * Builds the sequence of traffic shift steps for a given mode.
 */
export function buildShiftSteps(
  config: TrafficShiftConfig,
): TrafficShiftStep[] {
  if (config.mode === "instant") {
    return [
      {
        newSlotWeight: 100,
        oldSlotWeight: 0,
        description: "Instant shift: 100% to new slot",
      },
    ];
  }

  // Canary mode
  const steps = config.canarySteps ?? [10, 25, 50, 100];

  // Validate steps
  if (steps.some((s) => s < 0 || s > 100)) {
    throw new Error("Canary steps must be between 0 and 100");
  }
  if (steps[steps.length - 1] !== 100) {
    throw new Error("Last canary step must be 100");
  }

  return steps.map((weight) => ({
    newSlotWeight: weight,
    oldSlotWeight: 100 - weight,
    description: `Canary: ${weight}% to new slot, ${100 - weight}% to old slot`,
  }));
}

/**
 * Calculates the effective traffic weights for blue and green slots
 * given the current active slot and the desired new-slot weight.
 */
export function calculateWeights(
  activeSlot: Slot,
  newSlotWeight: number,
): TrafficWeight {
  const oldSlotWeight = 100 - newSlotWeight;

  if (activeSlot === "blue") {
    // Blue is active (old), green is new
    return {
      blueWeight: oldSlotWeight,
      greenWeight: newSlotWeight,
    };
  } else {
    // Green is active (old), blue is new
    return {
      blueWeight: newSlotWeight,
      greenWeight: oldSlotWeight,
    };
  }
}

/**
 * Validates that traffic weights sum to 100.
 */
export function validateWeights(weights: TrafficWeight): boolean {
  return weights.blueWeight + weights.greenWeight === 100;
}

/**
 * Determines whether a canary step should be aborted based on error rate.
 */
export function shouldAbortCanary(
  errorRate: number,
  threshold: number,
): boolean {
  return errorRate > threshold;
}

/**
 * Formats a traffic weight summary for logging.
 */
export function formatWeightSummary(
  weights: TrafficWeight,
  activeSlot: Slot,
): string {
  const newSlot: Slot = activeSlot === "blue" ? "green" : "blue";
  const newWeight =
    activeSlot === "blue" ? weights.greenWeight : weights.blueWeight;
  const oldWeight =
    activeSlot === "blue" ? weights.blueWeight : weights.greenWeight;

  return `Traffic: ${newSlot}(new)=${newWeight}% | ${activeSlot}(old)=${oldWeight}%`;
}

/**
 * Parses a weight percentage string like "75" or "75%" into a number.
 */
export function parseWeight(input: string): number {
  const cleaned = input.replace("%", "").trim();
  const value = parseInt(cleaned, 10);
  if (isNaN(value) || value < 0 || value > 100) {
    throw new Error(
      `Invalid weight: "${input}". Must be a number between 0 and 100.`,
    );
  }
  return value;
}
