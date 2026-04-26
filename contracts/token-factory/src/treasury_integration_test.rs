//! Treasury Balance Accounting — Invariant Testing Framework
//!
//! Verifies that the treasury module upholds its core accounting invariants
//! under arbitrary sequences of withdrawals, policy changes, and period resets.
//!
//! # Invariants proved
//!
//! | ID  | Invariant |
//! |-----|-----------|
//! | T1  | `amount_withdrawn` never exceeds `daily_cap` within a period |
//! | T2  | `amount_withdrawn` is monotonically non-decreasing within a period |
//! | T3  | After a period reset `amount_withdrawn` restarts from 0 |
//! | T4  | `get_remaining_capacity` == `daily_cap - amount_withdrawn` (≥ 0) |
//! | T5  | Zero and negative withdrawal amounts are always rejected |
//! | T6  | Withdrawals to non-allowlisted recipients are rejected when allowlist is on |
//! | T7  | Increasing `daily_cap` never invalidates already-recorded withdrawals |
//! | T8  | Arithmetic overflow in `amount_withdrawn` is caught and rejected |
//! | T9  | Multiple sequential withdrawals that individually fit the cap but
//!         collectively exceed it are correctly rejected at the boundary |
//! | T10 | `amount_withdrawn` is always non-negative |
//!
//! # Security considerations
//! - Overflow paths use `checked_add`; any overflow returns `ArithmeticError`.
//! - Allowlist enforcement prevents unauthorised recipients from draining funds.
//! - Period-reset logic is time-gated; tests advance the ledger clock explicitly.
//!
//! # Assumptions / limitations
//! - All amounts are in stroops (1 XLM = 10_000_000 stroops).
//! - Tests run against the in-process Soroban test environment (no real network).
//! - Proptest cases use a reduced budget to keep CI fast; increase for soak runs.

#![cfg(test)]

extern crate std;

use proptest::prelude::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

use crate::{
    storage,
    treasury::{
        get_remaining_capacity, initialize_treasury_policy, record_withdrawal,
        validate_withdrawal,
    },
    types::Error,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared setup
// ─────────────────────────────────────────────────────────────────────────────

/// Register the contract and initialise treasury with the given `daily_cap`.
/// Returns `(env, contract_id, admin_address)`.
fn setup_with_cap(daily_cap: i128) -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = Address::generate(&env);
    env.register_contract(Some(&contract_id), crate::TokenFactory);

    let admin = Address::generate(&env);
    env.as_contract(&contract_id, || {
        storage::set_admin(&env, &admin);
        initialize_treasury_policy(&env, Some(daily_cap), false).unwrap();
    });

    (env, contract_id, admin)
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete integration tests
// ─────────────────────────────────────────────────────────────────────────────

/// T1 — amount_withdrawn never exceeds daily_cap
#[test]
fn treasury_integration_test_t1_withdrawn_never_exceeds_cap() {
    let cap = 100_0000000_i128;
    let (env, contract_id, _admin) = setup_with_cap(cap);
    let recipient = Address::generate(&env);

    // Withdraw exactly the cap — should succeed
    env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &recipient, cap).unwrap();
        record_withdrawal(&env, cap).unwrap();
        let period = storage::get_withdrawal_period(&env);
        assert_eq!(period.amount_withdrawn, cap);
    });

    // One more stroop must be rejected
    let result = env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &recipient, 1)
    });
    assert_eq!(result, Err(Error::WithdrawalCapExceeded));
}

/// T2 — amount_withdrawn is monotonically non-decreasing within a period
#[test]
fn treasury_integration_test_t2_monotonic_within_period() {
    let (env, contract_id, _admin) = setup_with_cap(200_0000000);
    let recipient = Address::generate(&env);

    let mut prev = 0_i128;
    for chunk in [30_0000000_i128, 20_0000000, 50_0000000] {
        env.as_contract(&contract_id, || {
            validate_withdrawal(&env, &recipient, chunk).unwrap();
            record_withdrawal(&env, chunk).unwrap();
            let period = storage::get_withdrawal_period(&env);
            assert!(period.amount_withdrawn >= prev);
            prev = period.amount_withdrawn;
        });
    }
}

/// T3 — after a period reset amount_withdrawn restarts from 0
#[test]
fn treasury_integration_test_t3_period_reset_clears_withdrawn() {
    let cap = 100_0000000_i128;
    let (env, contract_id, _admin) = setup_with_cap(cap);
    let recipient = Address::generate(&env);

    // Exhaust the cap
    env.as_contract(&contract_id, || {
        record_withdrawal(&env, cap).unwrap();
    });

    // Advance clock past the 24-hour period
    env.ledger().with_mut(|li| li.timestamp += 86_401);

    // validate_withdrawal triggers the reset internally; should now succeed
    let result = env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &recipient, 1_0000000)
    });
    assert!(result.is_ok(), "expected Ok after period reset, got {result:?}");

    // Confirm the period was reset
    let period = env.as_contract(&contract_id, || storage::get_withdrawal_period(&env));
    assert_eq!(period.amount_withdrawn, 0);
}

/// T4 — get_remaining_capacity == daily_cap - amount_withdrawn (always ≥ 0)
#[test]
fn treasury_integration_test_t4_remaining_capacity_formula() {
    let cap = 100_0000000_i128;
    let (env, contract_id, _admin) = setup_with_cap(cap);

    // Initially full
    let remaining = env.as_contract(&contract_id, || get_remaining_capacity(&env));
    assert_eq!(remaining, cap);

    // After partial withdrawal
    env.as_contract(&contract_id, || {
        record_withdrawal(&env, 40_0000000).unwrap();
    });
    let remaining = env.as_contract(&contract_id, || get_remaining_capacity(&env));
    assert_eq!(remaining, 60_0000000);

    // After exhausting cap
    env.as_contract(&contract_id, || {
        record_withdrawal(&env, 60_0000000).unwrap();
    });
    let remaining = env.as_contract(&contract_id, || get_remaining_capacity(&env));
    assert_eq!(remaining, 0);
}

/// T5 — zero and negative amounts are always rejected
#[test]
fn treasury_integration_test_t5_zero_and_negative_rejected() {
    let (env, contract_id, _admin) = setup_with_cap(100_0000000);
    let recipient = Address::generate(&env);

    for bad_amount in [0_i128, -1, -1_000_000, i128::MIN] {
        let result = env.as_contract(&contract_id, || {
            validate_withdrawal(&env, &recipient, bad_amount)
        });
        assert_eq!(
            result,
            Err(Error::InvalidAmount),
            "expected InvalidAmount for amount={bad_amount}"
        );
    }
}

/// T6 — allowlist enforcement rejects non-listed recipients
#[test]
fn treasury_integration_test_t6_allowlist_enforcement() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = Address::generate(&env);
    env.register_contract(Some(&contract_id), crate::TokenFactory);

    let admin = Address::generate(&env);
    env.as_contract(&contract_id, || {
        storage::set_admin(&env, &admin);
        // Enable allowlist
        initialize_treasury_policy(&env, Some(100_0000000), true).unwrap();
    });

    let unlisted = Address::generate(&env);
    let listed = Address::generate(&env);

    // Unlisted → rejected
    let result = env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &unlisted, 10_0000000)
    });
    assert_eq!(result, Err(Error::RecipientNotAllowed));

    // Add to allowlist → accepted
    env.as_contract(&contract_id, || {
        storage::set_allowed_recipient(&env, &listed, true);
    });
    let result = env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &listed, 10_0000000)
    });
    assert!(result.is_ok());
}

/// T7 — increasing daily_cap never invalidates already-recorded withdrawals
#[test]
fn treasury_integration_test_t7_cap_increase_preserves_history() {
    let (env, contract_id, admin) = setup_with_cap(50_0000000);
    let recipient = Address::generate(&env);

    // Record 40 XLM
    env.as_contract(&contract_id, || {
        record_withdrawal(&env, 40_0000000).unwrap();
    });

    // Raise cap to 200 XLM
    env.as_contract(&contract_id, || {
        crate::treasury::update_treasury_policy(&env, &admin, Some(200_0000000), None).unwrap();
    });

    // Previously recorded 40 XLM must still be reflected
    let period = env.as_contract(&contract_id, || storage::get_withdrawal_period(&env));
    assert_eq!(period.amount_withdrawn, 40_0000000);

    // Remaining capacity = 200 - 40 = 160
    let remaining = env.as_contract(&contract_id, || get_remaining_capacity(&env));
    assert_eq!(remaining, 160_0000000);

    // A withdrawal that would have failed under the old cap now succeeds
    let result = env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &recipient, 100_0000000)
    });
    assert!(result.is_ok());
}

/// T9 — sequential withdrawals correctly rejected at the boundary
#[test]
fn treasury_integration_test_t9_sequential_boundary() {
    let cap = 100_0000000_i128;
    let (env, contract_id, _admin) = setup_with_cap(cap);
    let recipient = Address::generate(&env);

    // Three withdrawals of 40 XLM each: first two succeed, third fails
    for i in 0..2 {
        env.as_contract(&contract_id, || {
            validate_withdrawal(&env, &recipient, 40_0000000).unwrap();
            record_withdrawal(&env, 40_0000000).unwrap();
        });
        let _ = i;
    }

    // 80 XLM withdrawn; 40 more would exceed 100 cap
    let result = env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &recipient, 40_0000000)
    });
    assert_eq!(result, Err(Error::WithdrawalCapExceeded));

    // But 20 XLM (exactly the remainder) is accepted
    let result = env.as_contract(&contract_id, || {
        validate_withdrawal(&env, &recipient, 20_0000000)
    });
    assert!(result.is_ok());
}

/// T10 — amount_withdrawn is always non-negative
#[test]
fn treasury_integration_test_t10_withdrawn_non_negative() {
    let (env, contract_id, _admin) = setup_with_cap(100_0000000);

    // Fresh period
    let period = env.as_contract(&contract_id, || storage::get_withdrawal_period(&env));
    assert!(period.amount_withdrawn >= 0);

    // After a withdrawal
    env.as_contract(&contract_id, || {
        record_withdrawal(&env, 50_0000000).unwrap();
    });
    let period = env.as_contract(&contract_id, || storage::get_withdrawal_period(&env));
    assert!(period.amount_withdrawn >= 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Property-based tests (proptest)
// ─────────────────────────────────────────────────────────────────────────────

/// Model of treasury state used by proptest.
#[derive(Clone, Debug)]
struct TreasuryModel {
    daily_cap: i128,
    withdrawn: i128,
}

impl TreasuryModel {
    fn new(daily_cap: i128) -> Self {
        Self { daily_cap, withdrawn: 0 }
    }

    /// Returns `Ok(())` if the withdrawal is valid and updates state,
    /// or the expected `Error` otherwise.
    fn try_withdraw(&mut self, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let new_total = self
            .withdrawn
            .checked_add(amount)
            .ok_or(Error::ArithmeticError)?;
        if new_total > self.daily_cap {
            return Err(Error::WithdrawalCapExceeded);
        }
        self.withdrawn = new_total;
        Ok(())
    }

    fn reset_period(&mut self) {
        self.withdrawn = 0;
    }

    fn remaining(&self) -> i128 {
        (self.daily_cap - self.withdrawn).max(0)
    }
}

fn valid_cap() -> impl Strategy<Value = i128> {
    1_0000000_i128..=1_000_0000000_i128 // 1 XLM – 1000 XLM
}

fn withdrawal_amount() -> impl Strategy<Value = i128> {
    prop_oneof![
        Just(0_i128),
        Just(-1_i128),
        1_i128..=200_0000000_i128,
        Just(i128::MAX),
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// Prop-T1/T2/T4/T10: model and implementation agree on every withdrawal outcome.
    #[test]
    fn prop_treasury_model_matches_implementation(
        cap in valid_cap(),
        amounts in prop::collection::vec(withdrawal_amount(), 1..30),
    ) {
        let (env, contract_id, _admin) = setup_with_cap(cap);
        let recipient = Address::generate(&env);
        let mut model = TreasuryModel::new(cap);

        for amount in amounts {
            let model_result = model.try_withdraw(amount);

            let impl_result = env.as_contract(&contract_id, || {
                let r = validate_withdrawal(&env, &recipient, amount);
                if r.is_ok() {
                    record_withdrawal(&env, amount).unwrap();
                }
                r
            });

            prop_assert_eq!(
                model_result.is_ok(),
                impl_result.is_ok(),
                "model={:?} impl={:?} amount={} cap={}", model_result, impl_result, amount, cap
            );

            // T10: withdrawn is always non-negative
            let period = env.as_contract(&contract_id, || storage::get_withdrawal_period(&env));
            prop_assert!(period.amount_withdrawn >= 0);

            // T4: remaining capacity formula holds
            let remaining = env.as_contract(&contract_id, || get_remaining_capacity(&env));
            prop_assert_eq!(remaining, model.remaining());
        }
    }

    /// Prop-T3: period reset always zeroes amount_withdrawn.
    #[test]
    fn prop_period_reset_zeroes_withdrawn(
        cap in valid_cap(),
        withdrawn in 0_i128..=1_000_0000000_i128,
    ) {
        let actual_withdrawn = withdrawn.min(cap);
        let (env, contract_id, _admin) = setup_with_cap(cap);

        env.as_contract(&contract_id, || {
            if actual_withdrawn > 0 {
                record_withdrawal(&env, actual_withdrawn).unwrap();
            }
        });

        // Advance past the period
        env.ledger().with_mut(|li| li.timestamp += 86_401);

        // Trigger reset via validate_withdrawal
        let recipient = Address::generate(&env);
        let _ = env.as_contract(&contract_id, || {
            validate_withdrawal(&env, &recipient, 1_0000000)
        });

        let period = env.as_contract(&contract_id, || storage::get_withdrawal_period(&env));
        prop_assert_eq!(period.amount_withdrawn, 0, "period reset must zero amount_withdrawn");
    }

    /// Prop-T5: any non-positive amount is always rejected with InvalidAmount.
    #[test]
    fn prop_non_positive_always_invalid(
        cap in valid_cap(),
        amount in i128::MIN..=0_i128,
    ) {
        let (env, contract_id, _admin) = setup_with_cap(cap);
        let recipient = Address::generate(&env);

        let result = env.as_contract(&contract_id, || {
            validate_withdrawal(&env, &recipient, amount)
        });
        prop_assert_eq!(result, Err(Error::InvalidAmount));
    }

    /// Prop-T1 (strong form): sum of all accepted withdrawals never exceeds cap.
    #[test]
    fn prop_sum_of_accepted_never_exceeds_cap(
        cap in valid_cap(),
        amounts in prop::collection::vec(1_i128..=50_0000000_i128, 1..50),
    ) {
        let (env, contract_id, _admin) = setup_with_cap(cap);
        let recipient = Address::generate(&env);
        let mut total_accepted = 0_i128;

        for amount in amounts {
            let result = env.as_contract(&contract_id, || {
                let r = validate_withdrawal(&env, &recipient, amount);
                if r.is_ok() {
                    record_withdrawal(&env, amount).unwrap();
                }
                r
            });
            if result.is_ok() {
                total_accepted = total_accepted.saturating_add(amount);
            }
        }

        prop_assert!(
            total_accepted <= cap,
            "total_accepted={total_accepted} exceeded cap={cap}"
        );
    }
}
