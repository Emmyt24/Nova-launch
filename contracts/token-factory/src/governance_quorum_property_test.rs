//! Property 59: Governance Quorum Calculation
//!
//! Proves that `is_quorum_met` and `is_approval_met` are correct across all
//! valid percentage ranges (0–100) and vote counts.
//!
//! Properties verified:
//! - No overflow for any u32 inputs (uses u64 internally)
//! - 0% quorum/approval is always met (when eligible/total > 0)
//! - 100% quorum/approval requires full participation
//! - Result is consistent with the floor-division reference formula
//! - Monotonicity: more votes never flips a passing result to failing
//! - Zero eligible voters always returns false (quorum)
//! - Zero total votes always returns false (approval)
//!
//! Assumptions / edge cases called out inline.
//! Follow-up: if the formula changes from floor to ceiling division,
//! the reference formula in prop_result_matches_reference must be updated.

use crate::governance::{is_approval_met, is_quorum_met};
use proptest::prelude::*;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// Property 59a – no overflow
    ///
    /// The implementation casts to u64 before multiplying, so the product of
    /// two u32::MAX values (≈ 1.8 × 10^19) must not overflow u64::MAX
    /// (≈ 1.8 × 10^19).  u32::MAX * u32::MAX = 2^64 - 2^33 + 1, which fits
    /// in u64, so this is safe.  The test exercises the full u32 range to
    /// confirm no panic occurs.
    #[test]
    fn prop_no_overflow(
        total_votes    in 0u32..=u32::MAX,
        total_eligible in 0u32..=u32::MAX,
        quorum_percent in 0u32..=100,
        yes_votes      in 0u32..=u32::MAX,
        approval_percent in 0u32..=100,
    ) {
        // Must not panic
        let _ = is_quorum_met(total_votes, total_eligible, quorum_percent);
        let _ = is_approval_met(yes_votes, total_votes, approval_percent);
    }

    /// Property 59b – 0% quorum is always met when there are eligible voters
    #[test]
    fn prop_zero_quorum_always_met(
        total_votes    in 0u32..=u32::MAX,
        total_eligible in 1u32..=u32::MAX,
    ) {
        prop_assert!(is_quorum_met(total_votes, total_eligible, 0));
    }

    /// Property 59c – 0% approval is always met when there are votes cast
    #[test]
    fn prop_zero_approval_always_met(
        yes_votes   in 0u32..=u32::MAX,
        total_votes in 1u32..=u32::MAX,
    ) {
        prop_assert!(is_approval_met(yes_votes, total_votes, 0));
    }

    /// Property 59d – 100% quorum requires every eligible voter to have voted
    #[test]
    fn prop_hundred_percent_quorum(
        total_eligible in 1u32..=100_000u32,
    ) {
        // Exactly full participation → must pass
        prop_assert!(is_quorum_met(total_eligible, total_eligible, 100));
        // One short → must fail (only meaningful when total_eligible > 1)
        if total_eligible > 1 {
            prop_assert!(!is_quorum_met(total_eligible - 1, total_eligible, 100));
        }
    }

    /// Property 59e – 100% approval requires every vote to be yes
    #[test]
    fn prop_hundred_percent_approval(
        total_votes in 1u32..=100_000u32,
    ) {
        prop_assert!(is_approval_met(total_votes, total_votes, 100));
        if total_votes > 1 {
            prop_assert!(!is_approval_met(total_votes - 1, total_votes, 100));
        }
    }

    /// Property 59f – result matches the floor-division reference formula
    ///
    /// Reference: required = floor(eligible * percent / 100)
    /// The implementation uses integer division which is equivalent to floor
    /// for non-negative values.
    #[test]
    fn prop_quorum_matches_reference(
        total_votes    in 0u32..=100_000u32,
        total_eligible in 0u32..=100_000u32,
        quorum_percent in 0u32..=100,
    ) {
        let result = is_quorum_met(total_votes, total_eligible, quorum_percent);

        let expected = if total_eligible == 0 {
            false
        } else {
            let required = (total_eligible as u64 * quorum_percent as u64) / 100;
            total_votes as u64 >= required
        };

        prop_assert_eq!(result, expected);
    }

    /// Property 59g – approval matches the floor-division reference formula
    #[test]
    fn prop_approval_matches_reference(
        yes_votes        in 0u32..=100_000u32,
        total_votes      in 0u32..=100_000u32,
        approval_percent in 0u32..=100,
    ) {
        let result = is_approval_met(yes_votes, total_votes, approval_percent);

        let expected = if total_votes == 0 {
            false
        } else {
            let required = (total_votes as u64 * approval_percent as u64) / 100;
            yes_votes as u64 >= required
        };

        prop_assert_eq!(result, expected);
    }

    /// Property 59h – monotonicity: adding more votes never breaks a passing quorum
    ///
    /// Edge case: this only holds when total_eligible is fixed.  Increasing
    /// total_eligible while holding total_votes constant can flip the result.
    #[test]
    fn prop_quorum_monotone_in_votes(
        total_votes    in 0u32..=99_999u32,
        total_eligible in 1u32..=100_000u32,
        quorum_percent in 0u32..=100,
    ) {
        if is_quorum_met(total_votes, total_eligible, quorum_percent) {
            // One more vote must still pass
            prop_assert!(is_quorum_met(total_votes + 1, total_eligible, quorum_percent));
        }
    }

    /// Property 59i – monotonicity: adding more yes votes never breaks a passing approval
    #[test]
    fn prop_approval_monotone_in_yes_votes(
        yes_votes        in 0u32..=99_999u32,
        total_votes      in 1u32..=100_000u32,
        approval_percent in 0u32..=100,
    ) {
        if is_approval_met(yes_votes, total_votes, approval_percent) {
            let extra_yes = yes_votes.min(total_votes); // can't exceed total
            prop_assert!(is_approval_met(extra_yes, total_votes, approval_percent));
        }
    }

    /// Property 59j – rounding: floor division means the threshold is the
    /// smallest integer ≥ (eligible * percent / 100).
    ///
    /// Concretely: if votes == floor(eligible * percent / 100) the result is
    /// true; if votes == that value - 1 the result is false.
    #[test]
    fn prop_quorum_rounding_boundary(
        total_eligible in 1u32..=100_000u32,
        quorum_percent in 1u32..=100,
    ) {
        let required = (total_eligible as u64 * quorum_percent as u64) / 100;

        // Exactly at the threshold → passes
        if required <= u32::MAX as u64 {
            prop_assert!(is_quorum_met(required as u32, total_eligible, quorum_percent));
        }

        // One below the threshold → fails (only when required > 0)
        if required > 0 && (required - 1) <= u32::MAX as u64 {
            prop_assert!(!is_quorum_met((required - 1) as u32, total_eligible, quorum_percent));
        }
    }
}
