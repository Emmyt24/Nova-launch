/**
 * Property 66: Campaign Time Range Validation
 *
 * Proves that campaign start/end time parameters are validated correctly:
 * startTime must not be in the past, and endTime (when provided) must be
 * strictly after startTime.
 *
 * Properties tested:
 *   P66-A  Future startTime with no endTime is accepted
 *   P66-B  Past startTime is rejected regardless of endTime
 *   P66-C  endTime > startTime is accepted
 *   P66-D  endTime <= startTime is rejected (equal or inverted)
 *   P66-E  Invalid Date objects are rejected for startTime
 *   P66-F  Invalid Date objects are rejected for endTime
 *   P66-G  Non-Date types are rejected for startTime
 *   P66-H  Non-Date types are rejected for endTime
 *   P66-I  startTime exactly equal to referenceNow is accepted (boundary)
 *   P66-J  Reason string is always present on rejection
 *
 * Mathematical invariants:
 *   valid(start, end?) ⟺
 *     isDate(start) ∧ start.ms ≥ now.ms
 *     ∧ (end = ∅ ∨ (isDate(end) ∧ end.ms > start.ms))
 *
 * Security considerations:
 *   - Rejecting past startTimes prevents back-dated campaigns that could
 *     manipulate historical analytics or leaderboard rankings.
 *   - Enforcing endTime > startTime prevents zero-duration campaigns that
 *     could cause division-by-zero in duration calculations downstream.
 *   - Non-Date inputs are rejected explicitly to prevent prototype-pollution
 *     or type-coercion attacks at the ingestion boundary.
 *
 * Edge cases / assumptions:
 *   - All tests use a fixed `referenceNow` (2026-03-28T00:00:00Z) for
 *     determinism; production callers use the real clock.
 *   - startTime === referenceNow (to the millisecond) is accepted.
 *   - endTime === startTime is rejected (duration must be positive).
 *   - endTime omitted / null → only startTime rules apply.
 *   - Invalid Date (new Date(NaN)) is distinct from a non-Date type.
 *
 * Follow-up work:
 *   - Add property for maximum campaign duration cap once business rules
 *     are finalised.
 *   - Wire validateCampaignTimeRange into the REST ingest middleware.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateCampaignTimeRange } from '../lib/validation/campaignTimeRange';

// ---------------------------------------------------------------------------
// Fixed reference point — keeps all time arithmetic deterministic
// ---------------------------------------------------------------------------
const REFERENCE_NOW = new Date('2026-03-28T00:00:00.000Z');
const NOW_MS = REFERENCE_NOW.getTime();

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A Date strictly in the future relative to REFERENCE_NOW */
const futureDateArb = fc
  .integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }) // 1ms – 1 year ahead
  .map((offset) => new Date(NOW_MS + offset));

/** A Date strictly in the past relative to REFERENCE_NOW */
const pastDateArb = fc
  .integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }) // 1ms – 1 year ago
  .map((offset) => new Date(NOW_MS - offset));

/** A positive offset in ms to add on top of a startTime to get a valid endTime */
const positiveOffsetArb = fc.integer({ min: 1, max: 30 * 24 * 60 * 60 * 1000 }); // 1ms – 30 days

/** A non-positive offset (0 or negative) — produces endTime <= startTime */
const nonPositiveOffsetArb = fc.integer({ min: -30 * 24 * 60 * 60 * 1000, max: 0 });

/** Non-Date types */
const nonDateArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
);

// ---------------------------------------------------------------------------
// Property 66-A: Future startTime with no endTime is accepted
// ---------------------------------------------------------------------------
describe('Property 66-A: future startTime with no endTime is accepted', () => {
  it('accepts any future Date as startTime when endTime is omitted', () => {
    fc.assert(
      fc.property(futureDateArb, (start) => {
        const result = validateCampaignTimeRange(start, undefined, REFERENCE_NOW);
        return result.valid === true;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 66-B: Past startTime is rejected regardless of endTime
// ---------------------------------------------------------------------------
describe('Property 66-B: past startTime is rejected', () => {
  it('rejects any past Date as startTime (no endTime)', () => {
    fc.assert(
      fc.property(pastDateArb, (start) => {
        const result = validateCampaignTimeRange(start, undefined, REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });

  it('rejects past startTime even when endTime is valid', () => {
    fc.assert(
      fc.property(pastDateArb, positiveOffsetArb, (start, offset) => {
        const end = new Date(start.getTime() + offset);
        const result = validateCampaignTimeRange(start, end, REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 66-C: endTime strictly after startTime is accepted
// ---------------------------------------------------------------------------
describe('Property 66-C: endTime > startTime is accepted', () => {
  it('accepts any endTime strictly after a valid future startTime', () => {
    fc.assert(
      fc.property(futureDateArb, positiveOffsetArb, (start, offset) => {
        const end = new Date(start.getTime() + offset);
        const result = validateCampaignTimeRange(start, end, REFERENCE_NOW);
        return result.valid === true;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 66-D: endTime <= startTime is rejected
// ---------------------------------------------------------------------------
describe('Property 66-D: endTime <= startTime is rejected', () => {
  it('rejects endTime equal to startTime', () => {
    fc.assert(
      fc.property(futureDateArb, (start) => {
        const end = new Date(start.getTime()); // equal
        const result = validateCampaignTimeRange(start, end, REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });

  it('rejects endTime before startTime', () => {
    fc.assert(
      fc.property(futureDateArb, positiveOffsetArb, (start, offset) => {
        const end = new Date(start.getTime() - offset); // before
        const result = validateCampaignTimeRange(start, end, REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });

  it('rejects any non-positive offset between startTime and endTime', () => {
    fc.assert(
      fc.property(futureDateArb, nonPositiveOffsetArb, (start, offset) => {
        const end = new Date(start.getTime() + offset);
        const result = validateCampaignTimeRange(start, end, REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 66-E: Invalid Date objects are rejected for startTime
// ---------------------------------------------------------------------------
describe('Property 66-E: invalid Date for startTime is rejected', () => {
  it('rejects new Date(NaN) as startTime', () => {
    const result = validateCampaignTimeRange(new Date(NaN), undefined, REFERENCE_NOW);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('rejects new Date(Infinity) as startTime', () => {
    const result = validateCampaignTimeRange(new Date(Infinity), undefined, REFERENCE_NOW);
    expect(result.valid).toBe(false);
  });

  it('rejects new Date(-Infinity) as startTime', () => {
    const result = validateCampaignTimeRange(new Date(-Infinity), undefined, REFERENCE_NOW);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 66-F: Invalid Date objects are rejected for endTime
// ---------------------------------------------------------------------------
describe('Property 66-F: invalid Date for endTime is rejected', () => {
  it('rejects new Date(NaN) as endTime', () => {
    fc.assert(
      fc.property(futureDateArb, (start) => {
        const result = validateCampaignTimeRange(start, new Date(NaN), REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 66-G: Non-Date types are rejected for startTime
// ---------------------------------------------------------------------------
describe('Property 66-G: non-Date types are rejected for startTime', () => {
  it('rejects strings, numbers, booleans, null, undefined, plain objects', () => {
    fc.assert(
      fc.property(nonDateArb, (value) => {
        const result = validateCampaignTimeRange(value, undefined, REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 66-H: Non-Date types are rejected for endTime
// ---------------------------------------------------------------------------
describe('Property 66-H: non-Date types are rejected for endTime', () => {
  it('rejects non-Date endTime even when startTime is valid', () => {
    fc.assert(
      fc.property(futureDateArb, nonDateArb, (start, end) => {
        // null/undefined means "no endTime" — skip those
        if (end === null || end === undefined) return true;
        const result = validateCampaignTimeRange(start, end, REFERENCE_NOW);
        return result.valid === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 66-I: startTime exactly equal to referenceNow is accepted
// ---------------------------------------------------------------------------
describe('Property 66-I: startTime === referenceNow is accepted (boundary)', () => {
  it('accepts startTime at exactly the reference moment', () => {
    const result = validateCampaignTimeRange(
      new Date(NOW_MS),
      undefined,
      REFERENCE_NOW,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects startTime 1ms before referenceNow', () => {
    const result = validateCampaignTimeRange(
      new Date(NOW_MS - 1),
      undefined,
      REFERENCE_NOW,
    );
    expect(result.valid).toBe(false);
  });

  it('accepts startTime 1ms after referenceNow', () => {
    const result = validateCampaignTimeRange(
      new Date(NOW_MS + 1),
      undefined,
      REFERENCE_NOW,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 66-J: Reason string is always present on rejection
// ---------------------------------------------------------------------------
describe('Property 66-J: rejection always includes a reason string', () => {
  it('every invalid input produces a non-empty reason', () => {
    fc.assert(
      fc.property(pastDateArb, (start) => {
        const result = validateCampaignTimeRange(start, undefined, REFERENCE_NOW);
        return (
          result.valid === false &&
          typeof result.reason === 'string' &&
          result.reason.length > 0
        );
      }),
      { numRuns: 100 },
    );
  });

  it('inverted time range produces a non-empty reason', () => {
    fc.assert(
      fc.property(futureDateArb, positiveOffsetArb, (start, offset) => {
        const end = new Date(start.getTime() - offset);
        const result = validateCampaignTimeRange(start, end, REFERENCE_NOW);
        return (
          result.valid === false &&
          typeof result.reason === 'string' &&
          result.reason.length > 0
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Concrete edge cases
// ---------------------------------------------------------------------------
describe('Concrete edge cases', () => {
  it('endTime 1ms after startTime is accepted', () => {
    const start = new Date(NOW_MS + 1000);
    const end = new Date(NOW_MS + 1001);
    expect(validateCampaignTimeRange(start, end, REFERENCE_NOW).valid).toBe(true);
  });

  it('endTime 1ms before startTime is rejected', () => {
    const start = new Date(NOW_MS + 1000);
    const end = new Date(NOW_MS + 999);
    expect(validateCampaignTimeRange(start, end, REFERENCE_NOW).valid).toBe(false);
  });

  it('startTime 1 year in the future with no endTime is accepted', () => {
    const start = new Date(NOW_MS + 365 * 24 * 60 * 60 * 1000);
    expect(validateCampaignTimeRange(start, undefined, REFERENCE_NOW).valid).toBe(true);
  });

  it('string timestamp is rejected as startTime', () => {
    expect(
      validateCampaignTimeRange('2027-01-01T00:00:00Z', undefined, REFERENCE_NOW).valid,
    ).toBe(false);
  });

  it('numeric Unix timestamp is rejected as startTime', () => {
    expect(
      validateCampaignTimeRange(NOW_MS + 1000, undefined, REFERENCE_NOW).valid,
    ).toBe(false);
  });
});
