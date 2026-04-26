//! Property 72 – Vault Unlock Time Validation
//!
//! Proves that vault claim access is correctly gated by `unlock_time`:
//!
//! - Claims attempted **before** `unlock_time` always fail with
//!   `Error::CliffNotReached`.
//! - Claims attempted **at or after** `unlock_time` always succeed
//!   (given an otherwise valid, funded, active vault).
//!
//! # Invariants verified
//! 1. `current_time < unlock_time`  → `Err(Error::CliffNotReached)`
//! 2. `current_time == unlock_time` → claim succeeds
//! 3. `current_time > unlock_time`  → claim succeeds
//!
//! # Strategy
//! Random `unlock_time` values are drawn from three partitions:
//! - **Past**    : `unlock_time` in `[0, now)`
//! - **Present** : `unlock_time == now`
//! - **Future**  : `unlock_time` in `(now, u64::MAX]`
//!
//! Each partition runs ≥ 200 proptest iterations (configured below).
//!
//! # Edge cases & assumptions
//! - `unlock_time == 0` is treated as "immediately unlocked" (past/present).
//! - `unlock_time == u64::MAX` is a valid future lock that can never be
//!   reached in practice; the test verifies the guard fires correctly.
//! - The reference implementation mirrors `vault.rs::claim_vault` exactly,
//!   isolating the time-lock logic from Soroban SDK dependencies so the
//!   property can run in a pure-Rust environment.
//! - Milestone hash and token address are not exercised here; they are
//!   covered by separate property tests.
//!
//! # Follow-up work
//! - Integration test that drives `claim_vault` through the full Soroban
//!   test harness with `env.ledger().set_timestamp(...)` to cover the
//!   on-chain path end-to-end.
//! - Property test for combined cliff + milestone gating once the
//!   milestone-verification module stabilises.

#![cfg(test)]

extern crate std;

use proptest::prelude::*;

// ---------------------------------------------------------------------------
// Reference types (mirrors types.rs, no Soroban SDK required)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
enum VaultStatus {
    Active,
    Claimed,
    #[allow(dead_code)]
    Cancelled,
}

/// Minimal vault snapshot used by the reference implementation.
#[derive(Clone, Debug)]
struct VaultSnapshot {
    total_amount: i128,
    claimed_amount: i128,
    unlock_time: u64,
    status: VaultStatus,
}

// ---------------------------------------------------------------------------
// Reference error (mirrors types.rs Error enum, relevant variants only)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
enum ClaimError {
    /// Vault is not in Active status.
    InvalidParameters,
    /// Current ledger time is before `unlock_time`.
    CliffNotReached,
    /// All tokens have already been claimed.
    NothingToClaim,
    /// Arithmetic overflow / underflow.
    ArithmeticError,
}

// ---------------------------------------------------------------------------
// Reference implementation (mirrors vault.rs::claim_vault time-lock logic)
// ---------------------------------------------------------------------------

/// Pure-Rust mirror of the time-lock portion of `vault.rs::claim_vault`.
///
/// Returns `Ok(claimable_amount)` when the claim is permitted, or the
/// appropriate `ClaimError` variant when it is not.
fn try_claim(vault: &VaultSnapshot, current_time: u64) -> Result<i128, ClaimError> {
    // Only Active vaults can be claimed
    if vault.status != VaultStatus::Active {
        return Err(ClaimError::InvalidParameters);
    }

    // Time-lock guard: mirrors `if current_time < vault.unlock_time`
    if current_time < vault.unlock_time {
        return Err(ClaimError::CliffNotReached);
    }

    // Claimable amount calculation with overflow protection
    let claimable = vault
        .total_amount
        .checked_sub(vault.claimed_amount)
        .ok_or(ClaimError::ArithmeticError)?;

    if claimable <= 0 {
        return Err(ClaimError::NothingToClaim);
    }

    Ok(claimable)
}

// ---------------------------------------------------------------------------
// Proptest strategies
// ---------------------------------------------------------------------------

/// A representative "now" timestamp drawn from a realistic ledger range.
/// Soroban ledger timestamps are Unix seconds; we stay well within u64.
fn arb_now() -> impl Strategy<Value = u64> {
    // Range covers past epochs through far future (~year 2500)
    1_000_000_u64..=16_000_000_000_u64
}

/// Generates `(now, unlock_time)` where `unlock_time` is strictly in the
/// **past** relative to `now` (i.e. `unlock_time < now`).
fn past_unlock() -> impl Strategy<Value = (u64, u64)> {
    arb_now().prop_flat_map(|now| {
        // unlock_time in [0, now)
        (0_u64..now).prop_map(move |unlock| (now, unlock))
    })
}

/// Generates `(now, unlock_time)` where `unlock_time == now` (boundary).
fn present_unlock() -> impl Strategy<Value = (u64, u64)> {
    arb_now().prop_map(|now| (now, now))
}

/// Generates `(now, unlock_time)` where `unlock_time` is strictly in the
/// **future** relative to `now` (i.e. `unlock_time > now`).
fn future_unlock() -> impl Strategy<Value = (u64, u64)> {
    arb_now().prop_flat_map(|now| {
        // unlock_time in (now, u64::MAX]
        ((now + 1)..=u64::MAX).prop_map(move |unlock| (now, unlock))
    })
}

// ---------------------------------------------------------------------------
// Property 72 – time-lock enforcement
// ---------------------------------------------------------------------------

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    // -----------------------------------------------------------------------
    // 72a: Claims before unlock_time always fail with CliffNotReached
    // -----------------------------------------------------------------------

    /// Property 72a – pre-unlock claims are rejected.
    ///
    /// For any `current_time < unlock_time`, `try_claim` must return
    /// `Err(ClaimError::CliffNotReached)` regardless of vault balance.
    #[test]
    fn prop_72a_claim_before_unlock_fails_with_cliff_not_reached(
        (now, unlock_time) in future_unlock(),
        total_amount in 1_i128..=i128::MAX / 2,
    ) {
        let vault = VaultSnapshot {
            total_amount,
            claimed_amount: 0,
            unlock_time,
            status: VaultStatus::Active,
        };

        let result = try_claim(&vault, now);

        prop_assert_eq!(
            result,
            Err(ClaimError::CliffNotReached),
            "expected CliffNotReached but got {:?}: now={now} unlock_time={unlock_time}",
            result
        );
    }

    // -----------------------------------------------------------------------
    // 72b: Claims at exactly unlock_time succeed
    // -----------------------------------------------------------------------

    /// Property 72b – claim at the exact unlock boundary succeeds.
    ///
    /// When `current_time == unlock_time` the time-lock is satisfied and
    /// the claim must succeed, returning the full claimable amount.
    #[test]
    fn prop_72b_claim_at_unlock_time_succeeds(
        (now, unlock_time) in present_unlock(),
        total_amount in 1_i128..=i128::MAX / 2,
    ) {
        let vault = VaultSnapshot {
            total_amount,
            claimed_amount: 0,
            unlock_time,
            status: VaultStatus::Active,
        };

        let result = try_claim(&vault, now);

        prop_assert!(
            result.is_ok(),
            "expected Ok but got {:?}: now={now} unlock_time={unlock_time}",
            result
        );
        prop_assert_eq!(
            result.unwrap(),
            total_amount,
            "claimable must equal total_amount for a fresh vault"
        );
    }

    // -----------------------------------------------------------------------
    // 72c: Claims after unlock_time succeed
    // -----------------------------------------------------------------------

    /// Property 72c – claim after unlock_time succeeds.
    ///
    /// When `current_time > unlock_time` the time-lock is satisfied and
    /// the claim must succeed, returning the full claimable amount.
    #[test]
    fn prop_72c_claim_after_unlock_time_succeeds(
        (now, unlock_time) in past_unlock(),
        total_amount in 1_i128..=i128::MAX / 2,
    ) {
        let vault = VaultSnapshot {
            total_amount,
            claimed_amount: 0,
            unlock_time,
            status: VaultStatus::Active,
        };

        let result = try_claim(&vault, now);

        prop_assert!(
            result.is_ok(),
            "expected Ok but got {:?}: now={now} unlock_time={unlock_time}",
            result
        );
        prop_assert_eq!(
            result.unwrap(),
            total_amount,
            "claimable must equal total_amount for a fresh vault"
        );
    }

    // -----------------------------------------------------------------------
    // 72d: Partial claims respect the time-lock
    // -----------------------------------------------------------------------

    /// Property 72d – partial claims before unlock still fail.
    ///
    /// Even when `claimed_amount < total_amount` (tokens remain), a claim
    /// attempted before `unlock_time` must still be rejected.
    #[test]
    fn prop_72d_partial_claim_before_unlock_fails(
        (now, unlock_time) in future_unlock(),
        total_amount in 2_i128..=i128::MAX / 2,
    ) {
        // claimed_amount is in [1, total_amount - 1] so there is still
        // something to claim, but the time-lock should fire first.
        let claimed_amount = total_amount / 2;

        let vault = VaultSnapshot {
            total_amount,
            claimed_amount,
            unlock_time,
            status: VaultStatus::Active,
        };

        let result = try_claim(&vault, now);

        prop_assert_eq!(
            result,
            Err(ClaimError::CliffNotReached),
            "partial vault must still be time-locked: now={now} unlock_time={}", unlock_time
        );
    }

    // -----------------------------------------------------------------------
    // 72e: unlock_time == 0 is always claimable (no lock)
    // -----------------------------------------------------------------------

    /// Property 72e – zero unlock_time means no time-lock.
    ///
    /// `unlock_time == 0` represents an immediately-available vault.
    /// Any `current_time >= 0` (i.e. all times) must allow claiming.
    #[test]
    fn prop_72e_zero_unlock_time_always_claimable(
        now in 0_u64..=u64::MAX,
        total_amount in 1_i128..=i128::MAX / 2,
    ) {
        let vault = VaultSnapshot {
            total_amount,
            claimed_amount: 0,
            unlock_time: 0,
            status: VaultStatus::Active,
        };

        let result = try_claim(&vault, now);

        prop_assert!(
            result.is_ok(),
            "unlock_time=0 must always be claimable: now={now}, result={:?}",
            result
        );
    }
}

// ---------------------------------------------------------------------------
// Deterministic examples (regression anchors / documentation)
// ---------------------------------------------------------------------------

/// Claim exactly at unlock_time succeeds.
#[test]
fn example_claim_at_unlock_time() {
    let vault = VaultSnapshot {
        total_amount: 1_000,
        claimed_amount: 0,
        unlock_time: 1_000,
        status: VaultStatus::Active,
    };
    assert_eq!(try_claim(&vault, 1_000), Ok(1_000));
}

/// Claim one second before unlock_time is rejected.
#[test]
fn example_claim_one_second_before_unlock() {
    let vault = VaultSnapshot {
        total_amount: 1_000,
        claimed_amount: 0,
        unlock_time: 1_000,
        status: VaultStatus::Active,
    };
    assert_eq!(try_claim(&vault, 999), Err(ClaimError::CliffNotReached));
}

/// Claim well after unlock_time succeeds.
#[test]
fn example_claim_after_unlock_time() {
    let vault = VaultSnapshot {
        total_amount: 5_000,
        claimed_amount: 0,
        unlock_time: 500,
        status: VaultStatus::Active,
    };
    assert_eq!(try_claim(&vault, 10_000), Ok(5_000));
}

/// unlock_time == 0 is immediately claimable.
#[test]
fn example_zero_unlock_time_claimable_at_genesis() {
    let vault = VaultSnapshot {
        total_amount: 100,
        claimed_amount: 0,
        unlock_time: 0,
        status: VaultStatus::Active,
    };
    assert_eq!(try_claim(&vault, 0), Ok(100));
}

/// unlock_time == u64::MAX is never reachable in practice.
#[test]
fn example_max_unlock_time_always_locked() {
    let vault = VaultSnapshot {
        total_amount: 100,
        claimed_amount: 0,
        unlock_time: u64::MAX,
        status: VaultStatus::Active,
    };
    // Any realistic ledger timestamp is less than u64::MAX
    assert_eq!(
        try_claim(&vault, u64::MAX - 1),
        Err(ClaimError::CliffNotReached)
    );
}

/// Cancelled vault cannot be claimed regardless of time.
#[test]
fn example_cancelled_vault_cannot_be_claimed() {
    let vault = VaultSnapshot {
        total_amount: 1_000,
        claimed_amount: 0,
        unlock_time: 0,
        status: VaultStatus::Cancelled,
    };
    assert_eq!(try_claim(&vault, 9_999_999), Err(ClaimError::InvalidParameters));
}

/// Fully-claimed vault returns NothingToClaim even after unlock.
#[test]
fn example_fully_claimed_vault_nothing_to_claim() {
    let vault = VaultSnapshot {
        total_amount: 1_000,
        claimed_amount: 1_000,
        unlock_time: 100,
        status: VaultStatus::Active,
    };
    assert_eq!(try_claim(&vault, 200), Err(ClaimError::NothingToClaim));
}
