/**
 * Property 78: Stream Timestamp Validation
 *
 * Proves that stream event timestamps are validated correctly across all
 * stream lifecycle events (created, claimed, cancelled, metadata_updated).
 *
 * Properties tested:
 *   P78-A  Past timestamps (≥ epoch) are accepted
 *   P78-B  Present timestamps (near now) are accepted
 *   P78-C  Future timestamps (≤ year 9999) are accepted
 *   P78-D  Minimum valid timestamp (Unix epoch 0) is accepted
 *   P78-E  Maximum valid timestamp (year 9999) is accepted
 *   P78-F  Boundary timestamps (year 2000, 2038, 3000) are accepted
 *   P78-G  Zero timestamp (Unix epoch) is accepted
 *   P78-H  Negative timestamps are rejected (pre-epoch)
 *   P78-I  Millisecond precision is preserved (no rounding in validation)
 *   P78-J  Timestamps are monotonic across event sequences (claimedAt/cancelledAt ≥ createdAt)
 *   P78-K  Invalid Date objects (NaN, ±Infinity) are rejected
 *   P78-L  Non-Date types are rejected
 *   P78-M  Rejection always includes a non-empty reason string
 *
 * Mathematical invariants:
 *   valid(ts) ⟺ ts instanceof Date ∧ isFinite(ts.ms) ∧ 0 ≤ ts.ms ≤ MAX_MS
 *   monotonic(earlier, later) ⟺ later.ms ≥ earlier.ms
 *
 * Security considerations:
 *   - Rejecting negative timestamps prevents integer underflow attacks.
 *   - Rejecting non-Date types prevents prototype-pollution / type-coercion.
 *   - Enforcing monotonic ordering prevents back-dated claim/cancel events
 *     that could corrupt projection state.
 *
 * Edge cases / assumptions:
 *   - Unix epoch (0 ms) is the minimum valid timestamp.
 *   - Year 9999 is the practical maximum (business cap, not JS Date limit).
 *   - Future timestamps are accepted to support scheduled streams.
 *   - Millisecond precision is validated at the logic layer; DB precision
 *     is tested separately in integration tests.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateStreamTimestamp,
  validateStreamTimestampOrder,
  MAX_STREAM_TIMESTAMP,
} from '../lib/validation/streamTimestamp';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNIX_EPOCH = new Date(0);
const REFERENCE_NOW = new Date('2026-03-29T00:00:00.000Z');
const NOW_MS = REFERENCE_NOW.getTime();

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const pastTimestampArb = fc
  .integer({ min: 0, max: NOW_MS })
  .map((ms) => new Date(ms));

const presentTimestampArb = fc
  .integer({ min: -1000, max: 1000 })
  .map((offset) => new Date(NOW_MS + offset));

const futureTimestampArb = fc
  .integer({ min: NOW_MS + 1, max: MAX_STREAM_TIMESTAMP.getTime() })
  .map((ms) => new Date(ms));

const validTimestampArb = fc.oneof(pastTimestampArb, presentTimestampArb, futureTimestampArb);

const boundaryTimestampArb = fc.constantFrom(
  UNIX_EPOCH,
  new Date('2000-01-01T00:00:00.000Z'),
  new Date('2038-01-19T03:14:07.000Z'),
  new Date('3000-01-01T00:00:00.000Z'),
  MAX_STREAM_TIMESTAMP,
);

const negativeTimestampArb = fc
  .integer({ min: -1_000_000_000_000, max: -1 })
  .map((ms) => new Date(ms));

const nonDateArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.float(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
);

// ---------------------------------------------------------------------------
// P78-A: Past timestamps (≥ epoch) are accepted
// ---------------------------------------------------------------------------
describe('P78-A: past timestamps (≥ epoch) are accepted', () => {
  it('accepts any Date with ms in [0, now]', () => {
    fc.assert(
      fc.property(pastTimestampArb, (ts) => {
        return validateStreamTimestamp(ts).valid === true;
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// P78-B: Present timestamps are accepted
// ---------------------------------------------------------------------------
describe('P78-B: present timestamps are accepted', () => {
  it('accepts timestamps within ±1 second of reference now', () => {
    fc.assert(
      fc.property(presentTimestampArb, (ts) => {
        // Only the non-negative subset is valid
        if (ts.getTime() < 0) return true; // skip — covered by P78-H
        return validateStreamTimestamp(ts).valid === true;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// P78-C: Future timestamps (≤ year 9999) are accepted
// ---------------------------------------------------------------------------
describe('P78-C: future timestamps (≤ year 9999) are accepted', () => {
  it('accepts any Date with ms in (now, MAX_STREAM_TIMESTAMP]', () => {
    fc.assert(
      fc.property(futureTimestampArb, (ts) => {
        return validateStreamTimestamp(ts).valid === true;
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// P78-D: Minimum valid timestamp (Unix epoch 0) is accepted
// ---------------------------------------------------------------------------
describe('P78-D: Unix epoch (timestamp 0) is accepted', () => {
  it('accepts new Date(0)', () => {
    expect(validateStreamTimestamp(UNIX_EPOCH).valid).toBe(true);
  });

  it('accepts new Date(0) explicitly', () => {
    expect(validateStreamTimestamp(new Date(0)).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P78-E: Maximum valid timestamp (year 9999) is accepted
// ---------------------------------------------------------------------------
describe('P78-E: year-9999 maximum timestamp is accepted', () => {
  it('accepts MAX_STREAM_TIMESTAMP', () => {
    expect(validateStreamTimestamp(MAX_STREAM_TIMESTAMP).valid).toBe(true);
  });

  it('rejects 1ms beyond MAX_STREAM_TIMESTAMP', () => {
    const beyond = new Date(MAX_STREAM_TIMESTAMP.getTime() + 1);
    expect(validateStreamTimestamp(beyond).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P78-F: Boundary timestamps are accepted
// ---------------------------------------------------------------------------
describe('P78-F: boundary timestamps are accepted', () => {
  it('accepts year 2000, 2038, 3000, and epoch boundaries', () => {
    fc.assert(
      fc.property(boundaryTimestampArb, (ts) => {
        return validateStreamTimestamp(ts).valid === true;
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// P78-G: Zero timestamp is accepted
// ---------------------------------------------------------------------------
describe('P78-G: zero timestamp (Unix epoch) is accepted', () => {
  it('accepts timestamp with getTime() === 0', () => {
    const result = validateStreamTimestamp(new Date(0));
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P78-H: Negative timestamps are rejected
// ---------------------------------------------------------------------------
describe('P78-H: negative timestamps are rejected', () => {
  it('rejects any Date with ms < 0', () => {
    fc.assert(
      fc.property(negativeTimestampArb, (ts) => {
        return validateStreamTimestamp(ts).valid === false;
      }),
      { numRuns: 200 },
    );
  });

  it('rejects new Date(-1)', () => {
    expect(validateStreamTimestamp(new Date(-1)).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P78-I: Millisecond precision is preserved (validation does not round)
// ---------------------------------------------------------------------------
describe('P78-I: millisecond precision is preserved in validation', () => {
  it('valid result is identical for ts and ts+1ms (both valid)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_STREAM_TIMESTAMP.getTime() - 1 }),
        (ms) => {
          const ts = new Date(ms);
          const tsPlus1 = new Date(ms + 1);
          // Both should be valid — no rounding collapses them
          return (
            validateStreamTimestamp(ts).valid === true &&
            validateStreamTimestamp(tsPlus1).valid === true
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('1ms before epoch is invalid, epoch itself is valid', () => {
    expect(validateStreamTimestamp(new Date(-1)).valid).toBe(false);
    expect(validateStreamTimestamp(new Date(0)).valid).toBe(true);
  });

  it('MAX_STREAM_TIMESTAMP is valid, MAX+1ms is invalid', () => {
    expect(validateStreamTimestamp(MAX_STREAM_TIMESTAMP).valid).toBe(true);
    expect(validateStreamTimestamp(new Date(MAX_STREAM_TIMESTAMP.getTime() + 1)).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P78-J: Timestamps are monotonic across event sequences
// ---------------------------------------------------------------------------
describe('P78-J: timestamps are monotonic across event sequences', () => {
  it('claimedAt ≥ createdAt is accepted', () => {
    fc.assert(
      fc.property(
        validTimestampArb,
        fc.integer({ min: 0, max: 86_400_000 }), // 0–24 h offset
        (createdAt, offset) => {
          const claimedAt = new Date(createdAt.getTime() + offset);
          return validateStreamTimestampOrder(createdAt, claimedAt).valid === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('cancelledAt ≥ createdAt is accepted', () => {
    fc.assert(
      fc.property(
        validTimestampArb,
        fc.integer({ min: 0, max: 86_400_000 }),
        (createdAt, offset) => {
          const cancelledAt = new Date(createdAt.getTime() + offset);
          return validateStreamTimestampOrder(createdAt, cancelledAt).valid === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('claimedAt < createdAt is rejected', () => {
    fc.assert(
      fc.property(
        validTimestampArb,
        fc.integer({ min: 1, max: 86_400_000 }),
        (createdAt, offset) => {
          const claimedAt = new Date(createdAt.getTime() - offset);
          return validateStreamTimestampOrder(createdAt, claimedAt).valid === false;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('equal timestamps (claimedAt === createdAt) are accepted', () => {
    fc.assert(
      fc.property(validTimestampArb, (ts) => {
        return validateStreamTimestampOrder(ts, new Date(ts.getTime())).valid === true;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// P78-K: Invalid Date objects are rejected
// ---------------------------------------------------------------------------
describe('P78-K: invalid Date objects are rejected', () => {
  it('rejects new Date(NaN)', () => {
    expect(validateStreamTimestamp(new Date(NaN)).valid).toBe(false);
  });

  it('rejects new Date(Infinity)', () => {
    expect(validateStreamTimestamp(new Date(Infinity)).valid).toBe(false);
  });

  it('rejects new Date(-Infinity)', () => {
    expect(validateStreamTimestamp(new Date(-Infinity)).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P78-L: Non-Date types are rejected
// ---------------------------------------------------------------------------
describe('P78-L: non-Date types are rejected', () => {
  it('rejects strings, numbers, booleans, null, undefined, plain objects', () => {
    fc.assert(
      fc.property(nonDateArb, (value) => {
        return validateStreamTimestamp(value).valid === false;
      }),
      { numRuns: 200 },
    );
  });

  it('rejects ISO string even if it looks like a valid date', () => {
    expect(validateStreamTimestamp('2026-01-01T00:00:00.000Z').valid).toBe(false);
  });

  it('rejects numeric Unix timestamp (ms)', () => {
    expect(validateStreamTimestamp(NOW_MS).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P78-M: Rejection always includes a non-empty reason string
// ---------------------------------------------------------------------------
describe('P78-M: rejection always includes a non-empty reason string', () => {
  it('every invalid input produces a non-empty reason', () => {
    const invalidInputs: unknown[] = [
      new Date(-1),
      new Date(NaN),
      new Date(Infinity),
      new Date(MAX_STREAM_TIMESTAMP.getTime() + 1),
      '2026-01-01',
      NOW_MS,
      null,
      undefined,
      {},
      true,
    ];

    for (const input of invalidInputs) {
      const result = validateStreamTimestamp(input);
      expect(result.valid).toBe(false);
      expect(typeof result.reason).toBe('string');
      expect(result.reason!.length).toBeGreaterThan(0);
    }
  });

  it('negative timestamps always carry a reason', () => {
    fc.assert(
      fc.property(negativeTimestampArb, (ts) => {
        const result = validateStreamTimestamp(ts);
        return (
          result.valid === false &&
          typeof result.reason === 'string' &&
          result.reason.length > 0
        );
      }),
      { numRuns: 100 },
    );
  });

  it('non-Date types always carry a reason', () => {
    fc.assert(
      fc.property(nonDateArb, (value) => {
        const result = validateStreamTimestamp(value);
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
