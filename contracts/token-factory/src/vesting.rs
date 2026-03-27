use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VestingError {  
    InvalidSchedule = 100,
    InvalidGrant = 101,
    Overflow = 102,
}

/// Compute the linearly vested amount for a grant at a given timestamp.
///
/// # Parameters
/// - `total_grant`      – total token units to vest (i128, must be ≥ 0)
/// - `start_timestamp`  – unix seconds: vesting begins (inclusive boundary → 0)
/// - `end_timestamp`    – unix seconds: fully vested (inclusive boundary → total_grant)
/// - `query_timestamp`  – unix seconds: the point in time to evaluate
///
/// # Returns
/// `Ok(vested)` where `vested ∈ [0, total_grant]`, or a `VestingError`.
pub fn vested_amount(
    total_grant: i128,
    start_timestamp: u64,
    end_timestamp: u64,
    query_timestamp: u64,
) -> Result<i128, VestingError> {
     if total_grant < 0 {
        return Err(VestingError::InvalidGrant);
    }

    if end_timestamp <= start_timestamp {
        return Err(VestingError::InvalidSchedule);
    }

    if query_timestamp <= start_timestamp {
        return Ok(0);
    }

    if query_timestamp >= end_timestamp {
        return Ok(total_grant);
    }

    // Linear interpolation with checked arithmetic:
    //   vested = total_grant * elapsed / duration
    //
    // Both elapsed and duration fit in u64; cast to u128 for the
    // multiplication to avoid overflow, then cast the result back to i128.
    let elapsed: u64 = query_timestamp - start_timestamp; 
    let duration: u64 = end_timestamp - start_timestamp;  

    // total_grant as u128 (safe: we checked it's ≥ 0 above)
    let grant_u128 = total_grant as u128;

    // checked_mul: grant × elapsed
    let numerator = grant_u128
        .checked_mul(elapsed as u128)
        .ok_or(VestingError::Overflow)?;

    // checked_div: never panics because duration > 0
    let result_u128 = numerator
        .checked_div(duration as u128)
        .ok_or(VestingError::Overflow)?;

    // result_u128 ≤ total_grant ≤ i128::MAX (safe cast)
    Ok(result_u128 as i128)
}


#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const GRANT: i128 = 1_000_000_000_000; // 1 trillion units
    const START: u64 = 1_000_000_000;      // some epoch
    const END: u64 = START + 365 * 24 * 3600; // one year later

    // ── Boundary tests ──────────────────────────────────────────────────────

    #[test]
    fn before_start_returns_zero() {
        assert_eq!(vested_amount(GRANT, START, END, START - 1).unwrap(), 0);
    }

    #[test]
    fn at_start_returns_zero() {
        assert_eq!(vested_amount(GRANT, START, END, START).unwrap(), 0);
    }

    #[test]
    fn at_end_returns_total_grant() {
        assert_eq!(vested_amount(GRANT, START, END, END).unwrap(), GRANT);
    }

    #[test]
    fn after_end_returns_total_grant() {
        assert_eq!(vested_amount(GRANT, START, END, END + 99_999).unwrap(), GRANT);
    }

    // ── Midpoint correctness ────────────────────────────────────────────────

    #[test]
    fn midpoint_is_half() {
        let mid = START + (END - START) / 2;
        let v = vested_amount(GRANT, START, END, mid).unwrap();
        // Allow ±1 for integer truncation
        assert!((v - GRANT / 2).abs() <= 1, "midpoint vested={v}, expected ~{}", GRANT / 2);
    }

    // ── Quarter / three-quarter linearity ───────────────────────────────────

    #[test]
    fn quarter_and_three_quarter_linear() {
        let duration = END - START;
        let t1 = START + duration / 4;
        let t2 = START + 3 * duration / 4;
        let v1 = vested_amount(GRANT, START, END, t1).unwrap();
        let v2 = vested_amount(GRANT, START, END, t2).unwrap();
        // v2 should be ~3× v1 (allow ±2 for truncation)
        assert!((v2 - 3 * v1).abs() <= 2, "v1={v1}, v2={v2}");
    }

    // ── Zero grant ──────────────────────────────────────────────────────────

    #[test]
    fn zero_grant_always_returns_zero() {
        assert_eq!(vested_amount(0, START, END, START + 1000).unwrap(), 0);
        assert_eq!(vested_amount(0, START, END, END).unwrap(), 0);
    }

    // ── Error cases ─────────────────────────────────────────────────────────

    #[test]
    fn invalid_schedule_end_before_start() {
        assert_eq!(
            vested_amount(GRANT, END, START, START + 1),
            Err(VestingError::InvalidSchedule)
        );
    }

    #[test]
    fn invalid_schedule_equal_timestamps() {
        assert_eq!(
            vested_amount(GRANT, START, START, START),
            Err(VestingError::InvalidSchedule)
        );
    }

    #[test]
    fn invalid_grant_negative() {
        assert_eq!(
            vested_amount(-1, START, END, START + 1),
            Err(VestingError::InvalidGrant)
        );
    }

    // ── Property tests ──────────────────────────────────────────────────────

    proptest! {
        /// PROPERTY: vested amount is always in [0, total_grant]
        #[test]
        fn prop_always_bounded(
            grant in 0i128..=i64::MAX as i128,
            start in 0u64..=u64::MAX / 2,
            duration in 1u64..=365 * 24 * 3600 * 10,
            query_offset in 0u64..=365 * 24 * 3600 * 12,
        ) {
            let end = start.saturating_add(duration);
            let query = start.saturating_add(query_offset);
            if end > start {
                let v = vested_amount(grant, start, end, query).unwrap();
                prop_assert!(v >= 0, "vested={v} < 0");
                prop_assert!(v <= grant, "vested={v} > grant={grant}");
            }
        }

        /// PROPERTY: monotonicity — for t1 ≤ t2, vested(t1) ≤ vested(t2)
        #[test]
        fn prop_monotonic(
            grant in 0i128..=i64::MAX as i128,
            start in 0u64..=1_000_000_000u64,
            duration in 1u64..=365 * 24 * 3600 * 4,
            offset_a in 0u64..=365 * 24 * 3600 * 5,
            offset_b in 0u64..=365 * 24 * 3600 * 5,
        ) {
            let end = start + duration;
            let (t1, t2) = if offset_a <= offset_b {
                (start.saturating_add(offset_a), start.saturating_add(offset_b))
            } else {
                (start.saturating_add(offset_b), start.saturating_add(offset_a))
            };
            let v1 = vested_amount(grant, start, end, t1).unwrap();
            let v2 = vested_amount(grant, start, end, t2).unwrap();
            prop_assert!(
                v1 <= v2,
                "monotonicity violated: v({t1})={v1} > v({t2})={v2}"
            );
        }

        /// PROPERTY: both boundaries are hit exactly
        #[test]
        fn prop_boundary_exactness(
            grant in 0i128..=i64::MAX as i128,
            start in 0u64..=1_000_000_000u64,
            duration in 1u64..=365 * 24 * 3600 * 4,
        ) {
            let end = start + duration;
            prop_assert_eq!(vested_amount(grant, start, end, start).unwrap(), 0);
            prop_assert_eq!(vested_amount(grant, start, end, end).unwrap(), grant);
        }

        /// PROPERTY: linearity — vested(start + k*duration/N) ≈ k*grant/N
        #[test]
        fn prop_linear_interpolation(
            grant in 1i128..=1_000_000_000i128,
            start in 0u64..=500_000_000u64,
            duration in 100u64..=365 * 24 * 3600,
            k in 1u64..=99u64,
        ) {
            let end = start + duration;
            // query at fraction k/100 of the schedule
            let query = start + duration * k / 100;
            let v = vested_amount(grant, start, end, query).unwrap();
            let expected = (grant as u128 * (duration * k / 100) as u128 / duration as u128) as i128;
            // Allow ±1 for integer division rounding
            prop_assert!(
                (v - expected).abs() <= 1,
                "linearity failed: v={v}, expected={expected}, k={k}, grant={grant}, duration={duration}"
            );
        }
    }
}