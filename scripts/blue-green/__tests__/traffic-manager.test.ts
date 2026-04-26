/**
 * Tests for traffic-manager.ts
 *
 * COVERAGE:
 *   - buildShiftSteps: instant and canary modes, validation
 *   - calculateWeights: blue-active and green-active scenarios
 *   - validateWeights: sum-to-100 invariant
 *   - shouldAbortCanary: threshold comparisons
 *   - formatWeightSummary: human-readable output
 *   - parseWeight: valid and invalid inputs
 */

import { describe, it, expect } from "vitest";
import {
  buildShiftSteps,
  calculateWeights,
  validateWeights,
  shouldAbortCanary,
  formatWeightSummary,
  parseWeight,
  type TrafficShiftConfig,
} from "../traffic-manager";

// ---------------------------------------------------------------------------
// buildShiftSteps
// ---------------------------------------------------------------------------

describe("buildShiftSteps", () => {
  describe("instant mode", () => {
    it("returns a single 100/0 step", () => {
      const config: TrafficShiftConfig = { mode: "instant" };
      const steps = buildShiftSteps(config);
      expect(steps).toHaveLength(1);
      expect(steps[0].newSlotWeight).toBe(100);
      expect(steps[0].oldSlotWeight).toBe(0);
    });

    it("step description mentions instant shift", () => {
      const steps = buildShiftSteps({ mode: "instant" });
      expect(steps[0].description).toContain("Instant");
    });
  });

  describe("canary mode", () => {
    it("uses default steps [10, 25, 50, 100] when none provided", () => {
      const steps = buildShiftSteps({ mode: "canary" });
      expect(steps).toHaveLength(4);
      expect(steps.map((s) => s.newSlotWeight)).toEqual([10, 25, 50, 100]);
    });

    it("computes complementary old-slot weights", () => {
      const steps = buildShiftSteps({ mode: "canary" });
      for (const step of steps) {
        expect(step.newSlotWeight + step.oldSlotWeight).toBe(100);
      }
    });

    it("uses custom steps when provided", () => {
      const steps = buildShiftSteps({
        mode: "canary",
        canarySteps: [20, 60, 100],
      });
      expect(steps).toHaveLength(3);
      expect(steps.map((s) => s.newSlotWeight)).toEqual([20, 60, 100]);
    });

    it("each step description mentions Canary", () => {
      const steps = buildShiftSteps({ mode: "canary" });
      for (const step of steps) {
        expect(step.description).toContain("Canary");
      }
    });

    it("throws when a step weight is negative", () => {
      expect(() =>
        buildShiftSteps({ mode: "canary", canarySteps: [-10, 50, 100] }),
      ).toThrow("between 0 and 100");
    });

    it("throws when a step weight exceeds 100", () => {
      expect(() =>
        buildShiftSteps({ mode: "canary", canarySteps: [50, 110] }),
      ).toThrow("between 0 and 100");
    });

    it("throws when last step is not 100", () => {
      expect(() =>
        buildShiftSteps({ mode: "canary", canarySteps: [10, 50, 80] }),
      ).toThrow("Last canary step must be 100");
    });

    it("allows a single-step canary [100]", () => {
      const steps = buildShiftSteps({ mode: "canary", canarySteps: [100] });
      expect(steps).toHaveLength(1);
      expect(steps[0].newSlotWeight).toBe(100);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateWeights
// ---------------------------------------------------------------------------

describe("calculateWeights", () => {
  describe("when blue is active (old)", () => {
    it("assigns new-slot weight to green", () => {
      const w = calculateWeights("blue", 30);
      expect(w.greenWeight).toBe(30);
      expect(w.blueWeight).toBe(70);
    });

    it("full shift: green=100, blue=0", () => {
      const w = calculateWeights("blue", 100);
      expect(w.greenWeight).toBe(100);
      expect(w.blueWeight).toBe(0);
    });

    it("no shift: green=0, blue=100", () => {
      const w = calculateWeights("blue", 0);
      expect(w.greenWeight).toBe(0);
      expect(w.blueWeight).toBe(100);
    });
  });

  describe("when green is active (old)", () => {
    it("assigns new-slot weight to blue", () => {
      const w = calculateWeights("green", 25);
      expect(w.blueWeight).toBe(25);
      expect(w.greenWeight).toBe(75);
    });

    it("full shift: blue=100, green=0", () => {
      const w = calculateWeights("green", 100);
      expect(w.blueWeight).toBe(100);
      expect(w.greenWeight).toBe(0);
    });
  });

  it("weights always sum to 100", () => {
    for (const weight of [0, 10, 25, 50, 75, 100]) {
      const wb = calculateWeights("blue", weight);
      const wg = calculateWeights("green", weight);
      expect(wb.blueWeight + wb.greenWeight).toBe(100);
      expect(wg.blueWeight + wg.greenWeight).toBe(100);
    }
  });
});

// ---------------------------------------------------------------------------
// validateWeights
// ---------------------------------------------------------------------------

describe("validateWeights", () => {
  it("returns true when weights sum to 100", () => {
    expect(validateWeights({ blueWeight: 60, greenWeight: 40 })).toBe(true);
    expect(validateWeights({ blueWeight: 0, greenWeight: 100 })).toBe(true);
    expect(validateWeights({ blueWeight: 100, greenWeight: 0 })).toBe(true);
  });

  it("returns false when weights do not sum to 100", () => {
    expect(validateWeights({ blueWeight: 50, greenWeight: 60 })).toBe(false);
    expect(validateWeights({ blueWeight: 0, greenWeight: 0 })).toBe(false);
    expect(validateWeights({ blueWeight: 100, greenWeight: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAbortCanary
// ---------------------------------------------------------------------------

describe("shouldAbortCanary", () => {
  it("returns true when error rate exceeds threshold", () => {
    expect(shouldAbortCanary(0.1, 0.05)).toBe(true);
    expect(shouldAbortCanary(0.06, 0.05)).toBe(true);
  });

  it("returns false when error rate is at or below threshold", () => {
    expect(shouldAbortCanary(0.05, 0.05)).toBe(false);
    expect(shouldAbortCanary(0.01, 0.05)).toBe(false);
    expect(shouldAbortCanary(0, 0.05)).toBe(false);
  });

  it("handles zero threshold (any error triggers abort)", () => {
    expect(shouldAbortCanary(0.001, 0)).toBe(true);
    expect(shouldAbortCanary(0, 0)).toBe(false);
  });

  it("handles 100% threshold (never aborts)", () => {
    expect(shouldAbortCanary(0.99, 1.0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatWeightSummary
// ---------------------------------------------------------------------------

describe("formatWeightSummary", () => {
  it("shows new slot and old slot labels when blue is active", () => {
    const summary = formatWeightSummary(
      { blueWeight: 70, greenWeight: 30 },
      "blue",
    );
    expect(summary).toContain("green(new)=30%");
    expect(summary).toContain("blue(old)=70%");
  });

  it("shows new slot and old slot labels when green is active", () => {
    const summary = formatWeightSummary(
      { blueWeight: 40, greenWeight: 60 },
      "green",
    );
    expect(summary).toContain("blue(new)=40%");
    expect(summary).toContain("green(old)=60%");
  });

  it("shows 100% for full shift", () => {
    const summary = formatWeightSummary(
      { blueWeight: 0, greenWeight: 100 },
      "blue",
    );
    expect(summary).toContain("green(new)=100%");
    expect(summary).toContain("blue(old)=0%");
  });
});

// ---------------------------------------------------------------------------
// parseWeight
// ---------------------------------------------------------------------------

describe("parseWeight", () => {
  it("parses plain integer strings", () => {
    expect(parseWeight("0")).toBe(0);
    expect(parseWeight("50")).toBe(50);
    expect(parseWeight("100")).toBe(100);
  });

  it("parses strings with % suffix", () => {
    expect(parseWeight("25%")).toBe(25);
    expect(parseWeight("100%")).toBe(100);
  });

  it("trims whitespace", () => {
    expect(parseWeight("  75  ")).toBe(75);
    expect(parseWeight(" 10% ")).toBe(10);
  });

  it("throws on non-numeric input", () => {
    expect(() => parseWeight("abc")).toThrow("Invalid weight");
    expect(() => parseWeight("")).toThrow("Invalid weight");
  });

  it("throws on values below 0", () => {
    expect(() => parseWeight("-1")).toThrow("Invalid weight");
  });

  it("throws on values above 100", () => {
    expect(() => parseWeight("101")).toThrow("Invalid weight");
    expect(() => parseWeight("200%")).toThrow("Invalid weight");
  });
});
