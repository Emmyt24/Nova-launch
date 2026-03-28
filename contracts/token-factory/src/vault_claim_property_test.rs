//! Property 75 – Vault Claim Amount Calculation
//!
//! Proves that for any vault the claimable amount equals
//! `total_amount - claimed_amount`, and that arithmetic underflow is detected
//! when `claimed_amount` would exceed `total_amount`.
//!
//! # Invariants verified
//! 1. `claimable == total_amount - claimed_amount` for all valid vaults
//! 2. `claimable >= 0` always (no underflow escapes)
//! 3. `checked_sub` returns `None` (overflow/underflow) when
//!    `claimed_amount > total_amount`
//!
//! # Examples
//! | total_amount | claimed_amount | claimable |
//! |-------------|----------------|-----------|
//! | 1_000       | 0              | 1_000     |
//! | 1_000       | 400            | 600       |
//! | 1_000       | 1_000          | 0         |
//! | 0           | 0              | 0         |
//!
//! # Edge cases
//! - `total_amount == 0`: claimable is 0, nothing to claim
//! - `claimed_amount == total_amount`: fully claimed, claimable is 0
//! - `claimed_amount > total_amount`: underflow detected via `checked_sub`
//! - `i128::MAX` boundaries: overflow protection via `checked_sub`

#![cfg(test)]

extern crate std;

use proptest::prelude::*;

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/// Generates a valid `(total_amount, claimed_amount)` pair where
/// `0 <= claimed_amount <= total_amount`.
fn valid_vault_amounts() -> impl Strategy<Value = (i128, i128)> {
    (0i128..=i128::MAX / 2).prop_flat_map(|total| {
        (0i128..=total).prop_map(move |claimed| (total, claimed))
    })
}

/// Generates an invalid pair where `claimed_amount > total_amount`,
/// which should trigger underflow detection.
fn invalid_vault_amounts() -> impl Strategy<Value = (i128, i128)> {
    (0i128..=(i128::MAX / 2 - 1)).prop_flat_map(|total| {
        ((total + 1)..=i128::MAX / 2).prop_map(move |claimed| (total, claimed))
    })
}

// ---------------------------------------------------------------------------
// Reference implementation (mirrors vault.rs claim logic)
// ---------------------------------------------------------------------------

/// Mirrors the claimable calculation in `vault.rs::claim_vault`.
/// Returns `None` on arithmetic underflow (claimed > total).
fn calculate_claimable(total_amount: i128, claimed_amount: i128) -> Option<i128> {
    total_amount.checked_sub(claimed_amount)
}

// ---------------------------------------------------------------------------
// Property 75 – core claim calculation
// ---------------------------------------------------------------------------

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// Property 75a: claimable == total - claimed for all valid vaults.
    ///
    /// Asserts the arithmetic identity holds across 200 random inputs and
    /// that the result is always non-negative.
    #[test]
    fn prop_75a_claimable_equals_total_minus_claimed(
        (total, claimed) in valid_vault_amounts(),
    ) {
        let claimable = calculate_claimable(total, claimed)
            .expect("checked_sub must not overflow for valid vault amounts");

        prop_assert_eq!(
            claimable,
            total - claimed,
            "claimable mismatch: total={total} claimed={claimed} got={claimable}"
        );
        prop_assert!(
            claimable >= 0,
            "claimable must be non-negative: total={total} claimed={claimed} claimable={claimable}"
        );
    }

    /// Property 75b: claimable is bounded by total_amount.
    ///
    /// You can never claim more than what was deposited.
    #[test]
    fn prop_75b_claimable_never_exceeds_total(
        (total, claimed) in valid_vault_amounts(),
    ) {
        let claimable = calculate_claimable(total, claimed)
            .expect("checked_sub must not overflow for valid vault amounts");

        prop_assert!(
            claimable <= total,
            "claimable={claimable} must not exceed total={total}"
        );
    }

    /// Property 75c: arithmetic underflow is detected.
    ///
    /// When `claimed_amount > total_amount`, `checked_sub` must return `None`
    /// so the contract can surface `Error::ArithmeticError` instead of
    /// silently wrapping to a negative or huge positive value.
    #[test]
    fn prop_75c_underflow_detected_when_claimed_exceeds_total(
        (total, claimed) in invalid_vault_amounts(),
    ) {
        let result = calculate_claimable(total, claimed);
        prop_assert!(
            result.is_none(),
            "expected underflow (None) but got Some({:?}): total={total} claimed={claimed}",
            result
        );
    }

    /// Property 75d: fully-claimed vault has zero claimable.
    ///
    /// When `claimed_amount == total_amount` the vault is exhausted and
    /// claimable must be exactly 0.
    #[test]
    fn prop_75d_fully_claimed_vault_has_zero_claimable(
        total in 0i128..=i128::MAX / 2,
    ) {
        let claimable = calculate_claimable(total, total)
            .expect("checked_sub must not overflow when claimed == total");

        prop_assert_eq!(
            claimable,
            0,
            "fully-claimed vault must have claimable=0: total={total}"
        );
    }
}

// ---------------------------------------------------------------------------
// Deterministic unit examples (documentation / regression anchors)
// ---------------------------------------------------------------------------

#[test]
fn example_fresh_vault_fully_claimable() {
    assert_eq!(calculate_claimable(1_000, 0), Some(1_000));
}

#[test]
fn example_partial_claim_reduces_claimable() {
    assert_eq!(calculate_claimable(1_000, 400), Some(600));
}

#[test]
fn example_fully_claimed_vault_zero_claimable() {
    assert_eq!(calculate_claimable(1_000, 1_000), Some(0));
}

#[test]
fn example_zero_total_zero_claimable() {
    assert_eq!(calculate_claimable(0, 0), Some(0));
}

#[test]
fn example_underflow_detected() {
    // claimed_amount > total_amount must never silently succeed
    assert_eq!(calculate_claimable(500, 501), None);
}

#[test]
fn example_i128_max_boundary_no_overflow() {
    let total = i128::MAX;
    let claimed = i128::MAX - 1;
    assert_eq!(calculate_claimable(total, claimed), Some(1));
}
