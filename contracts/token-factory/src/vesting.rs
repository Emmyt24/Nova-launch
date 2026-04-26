use soroban_sdk::contracterror;

// Re-export VestingSchedule so callers can use `vesting::VestingSchedule`.
pub use crate::types::VestingSchedule;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VestingError {
    InvalidSchedule = 100,
    InvalidGrant = 101,
    Overflow = 102,
}

/// Compute the linearly vested amount for a grant at a given timestamp,
/// respecting an optional cliff period.
///
/// # Parameters
/// - `total_amount`      – total token units to vest (must be ≥ 0)
/// - `start_time`        – unix seconds: vesting begins
/// - `cliff_duration`    – seconds after `start_time` before any tokens unlock
///                         (0 = no cliff; must be ≤ `vesting_duration`)
/// - `vesting_duration`  – total seconds over which tokens vest linearly (must be > 0)
/// - `current_time`      – unix seconds: the point in time to evaluate
///
/// # Returns
/// `Ok(vested)` where `vested ∈ [0, total_amount]`, or a `VestingError`.
///
/// # Vesting semantics
/// - Before `start_time`:                          → 0
/// - Between `start_time` and cliff expiry:        → 0
/// - After cliff, before full vest:                → linear from `start_time`
/// - At or after `start_time + vesting_duration`:  → `total_amount`
pub fn calculate_vested_amount(
    total_amount: i128,
    start_time: u64,
    cliff_duration: u64,
    vesting_duration: u64,
    current_time: u64,
) -> Result<i128, VestingError> {
    if total_amount < 0 {
        return Err(VestingError::InvalidGrant);
    }
    if vesting_duration == 0 {
        return Err(VestingError::InvalidSchedule);
    }
    if cliff_duration > vesting_duration {
        return Err(VestingError::InvalidSchedule);
    }

    // Before vesting starts
    if current_time < start_time {
        return Ok(0);
    }

    let elapsed = current_time - start_time;

    // Cliff not yet reached
    if elapsed < cliff_duration {
        return Ok(0);
    }

    // Fully vested
    if elapsed >= vesting_duration {
        return Ok(total_amount);
    }

    // Linear interpolation: vested = total_amount * elapsed / vesting_duration
    let grant_u128 = total_amount as u128;
    let numerator = grant_u128
        .checked_mul(elapsed as u128)
        .ok_or(VestingError::Overflow)?;
    let result = numerator
        .checked_div(vesting_duration as u128)
        .ok_or(VestingError::Overflow)?;

    Ok(result as i128)
}

/// Legacy two-argument form (no cliff) kept for backward compatibility.
///
/// Equivalent to `calculate_vested_amount(total, start, 0, end - start, query)`.
pub fn vested_amount(
    total_grant: i128,
    start_timestamp: u64,
    end_timestamp: u64,
    query_timestamp: u64,
) -> Result<i128, VestingError> {
    if end_timestamp <= start_timestamp {
        return Err(VestingError::InvalidSchedule);
    }
    let duration = end_timestamp - start_timestamp;
    calculate_vested_amount(total_grant, start_timestamp, 0, duration, query_timestamp)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod vesting_test {
    use super::*;
    use proptest::prelude::*;

    const GRANT: i128 = 1_000_000_000_000;
    const START: u64 = 1_000_000_000;
    const DURATION: u64 = 365 * 24 * 3600; // 1 year
    const CLIFF: u64 = 90 * 24 * 3600;     // 90 days

    // ── calculate_vested_amount: basic cliff tests ────────────────────────

    #[test]
    fn before_start_returns_zero() {
        assert_eq!(
            calculate_vested_amount(GRANT, START, CLIFF, DURATION, START - 1).unwrap(),
            0
        );
    }

    #[test]
    fn at_start_returns_zero() {
        assert_eq!(
            calculate_vested_amount(GRANT, START, CLIFF, DURATION, START).unwrap(),
            0
        );
    }

    #[test]
    fn during_cliff_returns_zero() {
        let mid_cliff = START + CLIFF / 2;
        assert_eq!(
            calculate_vested_amount(GRANT, START, CLIFF, DURATION, mid_cliff).unwrap(),
            0
        );
    }

    #[test]
    fn just_before_cliff_returns_zero() {
        assert_eq!(
            calculate_vested_amount(GRANT, START, CLIFF, DURATION, START + CLIFF - 1).unwrap(),
            0
        );
    }

    #[test]
    fn at_cliff_returns_partial_vested() {
        // At cliff expiry, elapsed == cliff_duration, linear vesting applies
        let v = calculate_vested_amount(GRANT, START, CLIFF, DURATION, START + CLIFF).unwrap();
        let expected = (GRANT as u128 * CLIFF as u128 / DURATION as u128) as i128;
        assert!((v - expected).abs() <= 1, "v={v}, expected={expected}");
    }

    #[test]
    fn at_full_duration_returns_total() {
        assert_eq!(
            calculate_vested_amount(GRANT, START, CLIFF, DURATION, START + DURATION).unwrap(),
            GRANT
        );
    }

    #[test]
    fn after_full_duration_returns_total() {
        assert_eq!(
            calculate_vested_amount(GRANT, START, CLIFF, DURATION, START + DURATION + 99_999).unwrap(),
            GRANT
        );
    }

    #[test]
    fn no_cliff_midpoint_is_half() {
        let mid = START + DURATION / 2;
        let v = calculate_vested_amount(GRANT, START, 0, DURATION, mid).unwrap();
        assert!((v - GRANT / 2).abs() <= 1, "v={v}");
    }

    #[test]
    fn zero_grant_always_zero() {
        assert_eq!(calculate_vested_amount(0, START, CLIFF, DURATION, START + CLIFF + 1).unwrap(), 0);
    }

    #[test]
    fn cliff_equals_duration_unlocks_all_at_once() {
        // cliff == duration: nothing until fully vested
        assert_eq!(
            calculate_vested_amount(GRANT, START, DURATION, DURATION, START + DURATION - 1).unwrap(),
            0
        );
        assert_eq!(
            calculate_vested_amount(GRANT, START, DURATION, DURATION, START + DURATION).unwrap(),
            GRANT
        );
    }

    #[test]
    fn zero_cliff_behaves_like_no_cliff() {
        let t = START + DURATION / 4;
        let v = calculate_vested_amount(GRANT, START, 0, DURATION, t).unwrap();
        let expected = (GRANT as u128 * (DURATION / 4) as u128 / DURATION as u128) as i128;
        assert!((v - expected).abs() <= 1);
    }

    // ── Error cases ───────────────────────────────────────────────────────

    #[test]
    fn zero_duration_is_invalid() {
        assert_eq!(
            calculate_vested_amount(GRANT, START, 0, 0, START + 1),
            Err(VestingError::InvalidSchedule)
        );
    }

    #[test]
    fn cliff_exceeds_duration_is_invalid() {
        assert_eq!(
            calculate_vested_amount(GRANT, START, DURATION + 1, DURATION, START + 1),
            Err(VestingError::InvalidSchedule)
        );
    }

    #[test]
    fn negative_grant_is_invalid() {
        assert_eq!(
            calculate_vested_amount(-1, START, CLIFF, DURATION, START + 1),
            Err(VestingError::InvalidGrant)
        );
    }

    // ── Legacy vested_amount backward-compat ─────────────────────────────

    #[test]
    fn legacy_before_start_returns_zero() {
        assert_eq!(vested_amount(GRANT, START, START + DURATION, START - 1).unwrap(), 0);
    }

    #[test]
    fn legacy_at_end_returns_total() {
        assert_eq!(vested_amount(GRANT, START, START + DURATION, START + DURATION).unwrap(), GRANT);
    }

    #[test]
    fn legacy_invalid_schedule() {
        assert_eq!(
            vested_amount(GRANT, START + DURATION, START, START + 1),
            Err(VestingError::InvalidSchedule)
        );
    }

    // ── Property tests ────────────────────────────────────────────────────

    proptest! {
        /// Vested amount is always in [0, total_amount]
        #[test]
        fn prop_always_bounded(
            grant in 0i128..=i64::MAX as i128,
            start in 0u64..=1_000_000_000u64,
            cliff in 0u64..=365 * 24 * 3600u64,
            duration in 1u64..=365 * 24 * 3600 * 4u64,
            offset in 0u64..=365 * 24 * 3600 * 5u64,
        ) {
            prop_assume!(cliff <= duration);
            let v = calculate_vested_amount(grant, start, cliff, duration, start.saturating_add(offset)).unwrap();
            prop_assert!(v >= 0);
            prop_assert!(v <= grant);
        }

        /// Monotonicity: for t1 ≤ t2, vested(t1) ≤ vested(t2)
        #[test]
        fn prop_monotonic(
            grant in 0i128..=i64::MAX as i128,
            start in 0u64..=1_000_000_000u64,
            cliff in 0u64..=1_000u64,
            duration in 1u64..=365 * 24 * 3600u64,
            a in 0u64..=365 * 24 * 3600 * 2u64,
            b in 0u64..=365 * 24 * 3600 * 2u64,
        ) {
            prop_assume!(cliff <= duration);
            let (t1, t2) = if a <= b { (start.saturating_add(a), start.saturating_add(b)) }
                           else      { (start.saturating_add(b), start.saturating_add(a)) };
            let v1 = calculate_vested_amount(grant, start, cliff, duration, t1).unwrap();
            let v2 = calculate_vested_amount(grant, start, cliff, duration, t2).unwrap();
            prop_assert!(v1 <= v2, "monotonicity violated: v({t1})={v1} > v({t2})={v2}");
        }

        /// Boundary exactness: at start → 0, at start+duration → total
        #[test]
        fn prop_boundary_exactness(
            grant in 0i128..=i64::MAX as i128,
            start in 0u64..=1_000_000_000u64,
            cliff in 0u64..=1_000u64,
            duration in 1u64..=365 * 24 * 3600u64,
        ) {
            prop_assume!(cliff <= duration);
            prop_assert_eq!(calculate_vested_amount(grant, start, cliff, duration, start).unwrap(), 0);
            prop_assert_eq!(calculate_vested_amount(grant, start, cliff, duration, start + duration).unwrap(), grant);
        }

        /// Cliff enforcement: nothing vests before cliff expires
        #[test]
        fn prop_cliff_enforced(
            grant in 1i128..=1_000_000_000i128,
            start in 0u64..=1_000_000_000u64,
            cliff in 1u64..=1_000u64,
            duration in 1u64..=10_000u64,
            offset in 0u64..=999u64,
        ) {
            prop_assume!(cliff <= duration);
            prop_assume!(offset < cliff);
            let v = calculate_vested_amount(grant, start, cliff, duration, start + offset).unwrap();
            prop_assert_eq!(v, 0, "cliff not enforced: vested={v} at offset={offset} < cliff={cliff}");
        }
    }
}
