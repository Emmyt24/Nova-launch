/**
 * Campaign Time Range Validation
 *
 * Validates the startTime and optional endTime fields of a campaign event
 * before the event is persisted or forwarded to the projection service.
 *
 * Context:
 *   Campaign events carry a startTime (required) and an optional endTime.
 *   Both are JavaScript Date objects derived from on-chain Unix timestamps.
 *   Validation happens at the ingestion boundary so that malformed events
 *   are rejected before they can corrupt the projection state.
 *
 * Rules:
 *   1. startTime must be a valid, finite Date (not Invalid Date).
 *   2. startTime must not be in the past relative to `now` (configurable
 *      via the `referenceNow` parameter to keep tests deterministic).
 *   3. When endTime is provided it must also be a valid, finite Date.
 *   4. When both are provided, endTime must be strictly after startTime.
 *   5. Non-Date types are rejected for both fields.
 *
 * Design decisions:
 *   - `referenceNow` defaults to `new Date()` so production callers need
 *     not pass it; tests pass a fixed value for determinism.
 *   - "Past" is defined as startTime.getTime() < referenceNow.getTime().
 *     Equal timestamps (startTime === now to the millisecond) are accepted
 *     to avoid flakiness at exact boundary moments.
 *   - endTime equal to startTime is rejected (duration must be positive).
 *
 * Edge cases:
 *   - Invalid Date objects (e.g. new Date(NaN)) are rejected.
 *   - endTime omitted → only startTime rules apply.
 *   - startTime far in the future → accepted (no upper bound enforced here).
 *
 * Security considerations:
 *   - Rejecting past startTimes prevents back-dated campaigns that could
 *     manipulate historical analytics or leaderboard rankings.
 *   - Enforcing endTime > startTime prevents zero-duration or inverted
 *     campaigns that could cause division-by-zero in duration calculations.
 *
 * Follow-up work:
 *   - Add a maximum campaign duration cap (e.g. 1 year) once business rules
 *     are finalised.
 *   - Integrate with express-validator middleware for the REST ingest route.
 */

export interface CampaignTimeRangeValidationResult {
  valid: boolean;
  reason?: string;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Validate campaign startTime (and optional endTime).
 *
 * @param startTime    - Required campaign start timestamp.
 * @param endTime      - Optional campaign end timestamp.
 * @param referenceNow - Reference point for "now"; defaults to `new Date()`.
 */
export function validateCampaignTimeRange(
  startTime: unknown,
  endTime?: unknown,
  referenceNow: Date = new Date(),
): CampaignTimeRangeValidationResult {
  // --- startTime checks ---
  if (!(startTime instanceof Date)) {
    return { valid: false, reason: 'startTime must be a Date' };
  }

  if (!isValidDate(startTime)) {
    return { valid: false, reason: 'startTime is an invalid Date' };
  }

  if (startTime.getTime() < referenceNow.getTime()) {
    return { valid: false, reason: 'startTime must not be in the past' };
  }

  // --- endTime checks (only when provided) ---
  if (endTime !== undefined && endTime !== null) {
    if (!(endTime instanceof Date)) {
      return { valid: false, reason: 'endTime must be a Date' };
    }

    if (!isValidDate(endTime)) {
      return { valid: false, reason: 'endTime is an invalid Date' };
    }

    if (endTime.getTime() <= startTime.getTime()) {
      return { valid: false, reason: 'endTime must be strictly after startTime' };
    }
  }

  return { valid: true };
}
