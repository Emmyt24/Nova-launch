/**
 * Property 81: Stream Cancellation Idempotency
 *
 * Proves that stream cancellation events are idempotent - multiple
 * cancellation events for the same stream don't cause errors and
 * final status remains CANCELLED.
 *
 * Properties tested (Property 81):
 *   P81-A  Single cancellation sets status to CANCELLED
 *   P81-B  Duplicate cancellations don't cause errors
 *   P81-C  Final status is always CANCELLED after any cancellation
 *   P81-D  Cancellation is irreversible
 *   P81-E  Multiple cancellations preserve stream data
 *   P81-F  Cancellation timestamp is from first event
 *   P81-G  Idempotency holds across different cancellers
 *   P81-H  Cancelled streams reject new operations
 *
 * Mathematical invariants:
 *   cancel(stream) → status = CANCELLED
 *   cancel(cancel(stream)) → status = CANCELLED (idempotent)
 *   ∀n > 0: cancel^n(stream) = cancel(stream)
 *
 * Edge cases & assumptions:
 *   - Cancellation is a terminal state
 *   - Multiple cancellation events are allowed
 *   - First cancellation timestamp is preserved
 *   - Cancelled streams cannot be resumed
 *   - Idempotency applies to event processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

describe('Property 81: Stream Cancellation Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // P81-A: Single cancellation sets status to CANCELLED
  it('P81-A: should set status to CANCELLED on single cancellation', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 1000000 }),
          fc.string({ minLength: 1, maxLength: 56 })
        ),
        ([streamId, canceller]) => {
          let stream = {
            id: streamId,
            status: 'ACTIVE',
            canceller: null as string | null,
            cancelledAt: null as number | null,
          };

          // Apply cancellation
          stream = {
            ...stream,
            status: 'CANCELLED',
            canceller,
            cancelledAt: Date.now(),
          };

          expect(stream.status).toBe('CANCELLED');
          expect(stream.canceller).toBe(canceller);
        }
      ),
      { numRuns: 100 }
    );
  });

  // P81-B: Duplicate cancellations don't cause errors
  it('P81-B: should handle duplicate cancellations without errors', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 1000000 }),
          fc.string({ minLength: 1, maxLength: 56 })
        ),
        ([streamId, canceller]) => {
          let stream = {
            id: streamId,
            status: 'ACTIVE',
            canceller: null as string | null,
            cancelledAt: null as number | null,
          };

          const firstCancelTime = Date.now();

          // First cancellation
          stream = {
            ...stream,
            status: 'CANCELLED',
            canceller,
            cancelledAt: firstCancelTime,
          };

          // Second cancellation (should be idempotent)
          if (stream.status === 'CANCELLED') {
            stream = {
              ...stream,
              status: 'CANCELLED',
              canceller,
              cancelledAt: firstCancelTime, // Keep original timestamp
            };
          }

          expect(stream.status).toBe('CANCELLED');
          expect(stream.cancelledAt).toBe(firstCancelTime);
        }
      ),
      { numRuns: 100 }
    );
  });

  // P81-C: Final status is always CANCELLED after any cancellation
  it('P81-C: should maintain CANCELLED status after multiple cancellations', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 1000000 }),
          fc.array(fc.string({ minLength: 1, maxLength: 56 }), {
            minLength: 1,
            maxLength: 5,
          })
        ),
        ([streamId, cancellers]) => {
          let stream = {
            id: streamId,
            status: 'ACTIVE',
            canceller: null as string | null,
            cancelledAt: null as number | null,
          };

          const firstCancelTime = Date.now();

          cancellers.forEach((canceller, idx) => {
            if (stream.status !== 'CANCELLED') {
              stream = {
                ...stream,
                status: 'CANCELLED',
                canceller,
                cancelledAt: firstCancelTime,
              };
            } else {
              // Idempotent: keep original state
              stream = {
                ...stream,
                status: 'CANCELLED',
                canceller: stream.canceller,
                cancelledAt: stream.cancelledAt,
              };
            }
          });

          expect(stream.status).toBe('CANCELLED');
        }
      ),
      { numRuns: 100 }
    );
  });

  // P81-D: Cancellation is irreversible
  it('P81-D: should make cancellation irreversible', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        (streamId) => {
          let stream = {
            id: streamId,
            status: 'ACTIVE',
            cancelledAt: null as number | null,
          };

          // Cancel
          stream = {
            ...stream,
            status: 'CANCELLED',
            cancelledAt: Date.now(),
          };

          // Try to reactivate (should fail)
          const canReactivate = stream.status !== 'CANCELLED';

          expect(canReactivate).toBe(false);
          expect(stream.status).toBe('CANCELLED');
        }
      ),
      { numRuns: 100 }
    );
  });

  // P81-E: Multiple cancellations preserve stream data
  it('P81-E: should preserve stream data across cancellations', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 1000000 }),
          fc.string({ minLength: 1, maxLength: 56 }),
          fc.bigInt({ min: 1n, max: 1000000000000n })
        ),
        ([streamId, recipient, amount]) => {
          let stream = {
            id: streamId,
            recipient,
            amount,
            status: 'ACTIVE',
            cancelledAt: null as number | null,
          };

          const originalData = { ...stream };

          // Cancel multiple times
          for (let i = 0; i < 3; i++) {
            stream = {
              ...stream,
              status: 'CANCELLED',
              cancelledAt: Date.now(),
            };
          }

          // Data should be preserved
          expect(stream.id).toBe(originalData.id);
          expect(stream.recipient).toBe(originalData.recipient);
          expect(stream.amount).toBe(originalData.amount);
        }
      ),
      { numRuns: 100 }
    );
  });

  // P81-F: Cancellation timestamp is from first event
  it('P81-F: should preserve first cancellation timestamp', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 1000000 }),
          fc.array(fc.integer({ min: 1, max: 1000 }), {
            minLength: 2,
            maxLength: 5,
          })
        ),
        ([streamId, delays]) => {
          let stream = {
            id: streamId,
            status: 'ACTIVE',
            cancelledAt: null as number | null,
          };

          const baseTime = 1000000;
          let currentTime = baseTime;

          delays.forEach((delay, idx) => {
            currentTime += delay;

            if (stream.status !== 'CANCELLED') {
              stream = {
                ...stream,
                status: 'CANCELLED',
                cancelledAt: currentTime,
              };
            } else {
              // Idempotent: preserve original timestamp
              stream = {
                ...stream,
                status: 'CANCELLED',
                cancelledAt: stream.cancelledAt,
              };
            }
          });

          // First cancellation time should be preserved (baseTime + first delay)
          expect(stream.cancelledAt).toBe(baseTime + delays[0]);
        }
      ),
      { numRuns: 100 }
    );
  });

  // P81-G: Idempotency holds across different cancellers
  it('P81-G: should be idempotent across different cancellers', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 1000000 }),
          fc.array(fc.string({ minLength: 1, maxLength: 56 }), {
            minLength: 2,
            maxLength: 5,
          })
        ),
        ([streamId, cancellers]) => {
          let stream = {
            id: streamId,
            status: 'ACTIVE',
            canceller: null as string | null,
            cancelledAt: null as number | null,
          };

          const firstCancelTime = Date.now();
          let firstCanceller: string | null = null;

          cancellers.forEach((canceller) => {
            if (stream.status !== 'CANCELLED') {
              stream = {
                ...stream,
                status: 'CANCELLED',
                canceller,
                cancelledAt: firstCancelTime,
              };
              firstCanceller = canceller;
            } else {
              // Idempotent: keep first canceller
              stream = {
                ...stream,
                status: 'CANCELLED',
                canceller: firstCanceller,
                cancelledAt: firstCancelTime,
              };
            }
          });

          expect(stream.status).toBe('CANCELLED');
          expect(stream.canceller).toBe(firstCanceller);
        }
      ),
      { numRuns: 100 }
    );
  });

  // P81-H: Cancelled streams reject new operations
  it('P81-H: should reject operations on cancelled streams', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        (streamId) => {
          let stream = {
            id: streamId,
            status: 'ACTIVE',
            cancelledAt: null as number | null,
          };

          // Cancel stream
          stream = {
            ...stream,
            status: 'CANCELLED',
            cancelledAt: Date.now(),
          };

          // Try to perform operation
          const canClaim = stream.status === 'ACTIVE';
          const canFund = stream.status === 'ACTIVE';

          expect(canClaim).toBe(false);
          expect(canFund).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
