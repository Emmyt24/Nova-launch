/// Integration tests for token vesting schedules with cliff periods (#865).
///
/// Tests cover:
/// - VestingSchedule struct creation and storage round-trip
/// - calculate_vested_amount: no-cliff, cliff, boundary, edge cases
/// - storage::set/get_vesting_schedule
/// - Error cases: invalid schedule, negative grant, cliff > duration
#[cfg(test)]
mod vesting_schedule_test {
    use crate::storage;
    use crate::types::VestingSchedule;
    use crate::vesting::{self, VestingError};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    // ── Helpers ───────────────────────────────────────────────────────────

    fn make_schedule(env: &Env) -> VestingSchedule {
        VestingSchedule {
            beneficiary: Address::generate(env),
            total_amount: 1_000_000,
            start_time: 1_000,
            cliff_duration: 200,
            vesting_duration: 1_000,
            claimed_amount: 0,
        }
    }

    // ── VestingSchedule storage round-trip ────────────────────────────────

    #[test]
    fn test_set_and_get_vesting_schedule() {
        let env = Env::default();
        let schedule = make_schedule(&env);
        storage::set_vesting_schedule(&env, 0, 0, &schedule);
        let retrieved = storage::get_vesting_schedule(&env, 0, 0).expect("schedule should exist");
        assert_eq!(retrieved.total_amount, schedule.total_amount);
        assert_eq!(retrieved.cliff_duration, schedule.cliff_duration);
        assert_eq!(retrieved.vesting_duration, schedule.vesting_duration);
        assert_eq!(retrieved.claimed_amount, 0);
    }

    #[test]
    fn test_get_missing_schedule_returns_none() {
        let env = Env::default();
        assert!(storage::get_vesting_schedule(&env, 99, 99).is_none());
    }

    #[test]
    fn test_multiple_schedules_independent() {
        let env = Env::default();
        let mut s0 = make_schedule(&env);
        s0.total_amount = 500_000;
        let mut s1 = make_schedule(&env);
        s1.total_amount = 750_000;

        storage::set_vesting_schedule(&env, 0, 0, &s0);
        storage::set_vesting_schedule(&env, 0, 1, &s1);

        assert_eq!(storage::get_vesting_schedule(&env, 0, 0).unwrap().total_amount, 500_000);
        assert_eq!(storage::get_vesting_schedule(&env, 0, 1).unwrap().total_amount, 750_000);
    }

    #[test]
    fn test_schedule_count_increments() {
        let env = Env::default();
        assert_eq!(storage::get_vesting_schedule_count(&env, 0), 0);
        storage::increment_vesting_schedule_count(&env, 0);
        assert_eq!(storage::get_vesting_schedule_count(&env, 0), 1);
        storage::increment_vesting_schedule_count(&env, 0);
        assert_eq!(storage::get_vesting_schedule_count(&env, 0), 2);
    }

    // ── calculate_vested_amount: no cliff ─────────────────────────────────

    #[test]
    fn test_no_cliff_before_start_returns_zero() {
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 100, 0, 1_000, 99).unwrap(),
            0
        );
    }

    #[test]
    fn test_no_cliff_at_start_returns_zero() {
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 100, 0, 1_000, 100).unwrap(),
            0
        );
    }

    #[test]
    fn test_no_cliff_midpoint_is_half() {
        // elapsed = 500, duration = 1000 → 50%
        let v = vesting::calculate_vested_amount(1_000, 0, 0, 1_000, 500).unwrap();
        assert_eq!(v, 500);
    }

    #[test]
    fn test_no_cliff_at_end_returns_total() {
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 0, 1_000, 1_000).unwrap(),
            1_000
        );
    }

    #[test]
    fn test_no_cliff_after_end_returns_total() {
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 0, 1_000, 9_999).unwrap(),
            1_000
        );
    }

    // ── calculate_vested_amount: with cliff ───────────────────────────────

    #[test]
    fn test_cliff_before_cliff_returns_zero() {
        // cliff = 200, query at elapsed = 100 → 0
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 200, 1_000, 100).unwrap(),
            0
        );
    }

    #[test]
    fn test_cliff_just_before_cliff_returns_zero() {
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 200, 1_000, 199).unwrap(),
            0
        );
    }

    #[test]
    fn test_cliff_at_cliff_returns_partial() {
        // elapsed = 200, duration = 1000 → 20%
        let v = vesting::calculate_vested_amount(1_000, 0, 200, 1_000, 200).unwrap();
        assert_eq!(v, 200);
    }

    #[test]
    fn test_cliff_after_cliff_linear() {
        // elapsed = 500, duration = 1000 → 50%
        let v = vesting::calculate_vested_amount(1_000, 0, 200, 1_000, 500).unwrap();
        assert_eq!(v, 500);
    }

    #[test]
    fn test_cliff_equals_duration_all_or_nothing() {
        // cliff == duration: nothing until fully vested
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 1_000, 1_000, 999).unwrap(),
            0
        );
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 1_000, 1_000, 1_000).unwrap(),
            1_000
        );
    }

    #[test]
    fn test_nonzero_start_time() {
        let start = 1_000_000u64;
        let cliff = 100u64;
        let duration = 1_000u64;
        // Before start
        assert_eq!(
            vesting::calculate_vested_amount(1_000, start, cliff, duration, start - 1).unwrap(),
            0
        );
        // During cliff
        assert_eq!(
            vesting::calculate_vested_amount(1_000, start, cliff, duration, start + cliff - 1).unwrap(),
            0
        );
        // At cliff
        let v = vesting::calculate_vested_amount(1_000, start, cliff, duration, start + cliff).unwrap();
        assert_eq!(v, 100); // 100/1000 * 1000 = 100
        // Fully vested
        assert_eq!(
            vesting::calculate_vested_amount(1_000, start, cliff, duration, start + duration).unwrap(),
            1_000
        );
    }

    // ── Error cases ───────────────────────────────────────────────────────

    #[test]
    fn test_zero_duration_is_error() {
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 0, 0, 500),
            Err(VestingError::InvalidSchedule)
        );
    }

    #[test]
    fn test_cliff_exceeds_duration_is_error() {
        assert_eq!(
            vesting::calculate_vested_amount(1_000, 0, 1_001, 1_000, 500),
            Err(VestingError::InvalidSchedule)
        );
    }

    #[test]
    fn test_negative_grant_is_error() {
        assert_eq!(
            vesting::calculate_vested_amount(-1, 0, 0, 1_000, 500),
            Err(VestingError::InvalidGrant)
        );
    }

    // ── Zero grant edge case ──────────────────────────────────────────────

    #[test]
    fn test_zero_grant_always_zero() {
        assert_eq!(vesting::calculate_vested_amount(0, 0, 0, 1_000, 500).unwrap(), 0);
        assert_eq!(vesting::calculate_vested_amount(0, 0, 200, 1_000, 1_000).unwrap(), 0);
    }

    // ── Legacy vested_amount backward-compat ─────────────────────────────

    #[test]
    fn test_legacy_vested_amount_midpoint() {
        let v = vesting::vested_amount(1_000, 0, 1_000, 500).unwrap();
        assert_eq!(v, 500);
    }

    #[test]
    fn test_legacy_vested_amount_invalid_schedule() {
        assert_eq!(
            vesting::vested_amount(1_000, 1_000, 500, 750),
            Err(VestingError::InvalidSchedule)
        );
    }

    // ── Claimed amount tracking ───────────────────────────────────────────

    #[test]
    fn test_update_claimed_amount_persists() {
        let env = Env::default();
        let mut schedule = make_schedule(&env);
        storage::set_vesting_schedule(&env, 0, 0, &schedule);

        // Simulate a claim
        schedule.claimed_amount = 300_000;
        storage::set_vesting_schedule(&env, 0, 0, &schedule);

        let retrieved = storage::get_vesting_schedule(&env, 0, 0).unwrap();
        assert_eq!(retrieved.claimed_amount, 300_000);
    }

    // ── Linearity property (deterministic) ───────────────────────────────

    #[test]
    fn test_linear_progression_no_cliff() {
        let total = 1_000_000i128;
        let duration = 1_000u64;
        for pct in [10u64, 25, 50, 75, 90] {
            let elapsed = duration * pct / 100;
            let v = vesting::calculate_vested_amount(total, 0, 0, duration, elapsed).unwrap();
            let expected = total * elapsed as i128 / duration as i128;
            assert!((v - expected).abs() <= 1, "pct={pct}: v={v}, expected={expected}");
        }
    }

    #[test]
    fn test_linear_progression_with_cliff() {
        let total = 1_000_000i128;
        let cliff = 200u64;
        let duration = 1_000u64;
        // Before cliff: always 0
        for t in [0u64, 100, 199] {
            assert_eq!(
                vesting::calculate_vested_amount(total, 0, cliff, duration, t).unwrap(),
                0,
                "t={t} should be 0 (before cliff)"
            );
        }
        // After cliff: linear from start
        for elapsed in [200u64, 500, 750, 1_000] {
            let v = vesting::calculate_vested_amount(total, 0, cliff, duration, elapsed).unwrap();
            let expected = if elapsed >= duration {
                total
            } else {
                total * elapsed as i128 / duration as i128
            };
            assert!((v - expected).abs() <= 1, "elapsed={elapsed}: v={v}, expected={expected}");
        }
    }
}
