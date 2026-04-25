/**
 * Stream Timestamp Validation
 *
 * Validates timestamps carried by stream lifecycle events (created, claimed,
 * cancelled, metadata_updated) before they are persisted or forwarded to the
 * projection service.
 *
 * Rules:
 *   1. timestamp must be a Date instance (not a string, number, etc.).
 *   2. timestamp must be a valid, finite Date (not Invalid Date / NaN).
 *   3. timestamp must be ≥ 0 ms (Unix epoch) — pre-epoch dates are rejected.
 *   4. timestamp must be ≤ MAX_STREAM_TIMESTAMP (year 9999) — far-future cap.
 *   5. For sequences: laterTimestamp must be ≥ earlierTimestamp (monotonic).
 *
 * Design decisions:
 *   - Zero (Unix epoch) is accepted as the minimum valid timestamp.
 *   - Negative timestamps (pre-1970) are rejected; blockchain events cannot
 *     pre-date the Unix epoch.
 *   - Future timestamps are accepted to support scheduled / pre-funded streams.
 *   - The year-9999 cap is a practical upper bound; JS Date supports further
 *     but business logic does not need dates beyond that.
 *
 * Security considerations:
 *   - Rejecting negative timestamps prevents integer underflow attacks.
 *   - Enforcing monotonic ordering (claimedAt ≥ createdAt) prevents
 *     back-dated claim events that could corrupt projection state.
 */

export interface StreamTimestampValidationResult {
  valid: boolean;
  reason?: string;
}

/** Practical maximum: 9999-12-31T23:59:59.999Z */
export const MAX_STREAM_TIMESTAMP = new Date('9999-12-31T23:59:59.999Z');

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Validate a single stream event timestamp.
 */
export function validateStreamTimestamp(
  timestamp: unknown,
): StreamTimestampValidationResult {
  if (!(timestamp instanceof Date)) {
    return { valid: false, reason: 'timestamp must be a Date' };
  }

  if (!isValidDate(timestamp)) {
    return { valid: false, reason: 'timestamp is an invalid Date' };
  }

  if (timestamp.getTime() < 0) {
    return { valid: false, reason: 'timestamp must not be before Unix epoch (negative ms)' };
  }

  if (timestamp.getTime() > MAX_STREAM_TIMESTAMP.getTime()) {
    return { valid: false, reason: 'timestamp exceeds maximum allowed value (year 9999)' };
  }

  return { valid: true };
}

/**
 * Validate that a later event timestamp is monotonically ≥ an earlier one.
 * Both timestamps must individually pass `validateStreamTimestamp` first.
 */
export function validateStreamTimestampOrder(
  earlierTimestamp: Date,
  laterTimestamp: Date,
): StreamTimestampValidationResult {
  if (laterTimestamp.getTime() < earlierTimestamp.getTime()) {
    return {
      valid: false,
      reason: 'laterTimestamp must be ≥ earlierTimestamp (monotonic ordering required)',
    };
  }

  return { valid: true };
}
