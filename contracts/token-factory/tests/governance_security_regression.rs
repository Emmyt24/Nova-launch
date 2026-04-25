#![cfg(test)]

//! Governance Security Regression Suite (Issue #433)
//!
//! Comprehensive negative tests for governance privilege paths:
//! - Unauthorized queue/execute/cancel attempts
//! - Timelock bypass attempts  
//! - Duplicate voting edge cases

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};
use token_factory::{TokenFactory, TokenFactoryClient};

fn setup() -> (Env, Address, Address, Address, TokenFactoryClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client
        .initialize(&admin, &treasury, &1_000_000, &500_000)
        .unwrap();

    (env, contract_id, admin, treasury, client)
}

// ═══════════════════════════════════════════════════════════════════════════
// UNAUTHORIZED QUEUE ATTEMPTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unauthorized_schedule_fee_update() {
    let (env, _contract_id, _admin, _treasury, client) = setup();
    let attacker = Address::generate(&env);

    client
        .schedule_fee_update(&attacker, &Some(999_999_999), &None)
        .unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unauthorized_schedule_pause_update() {
    let (env, _contract_id, _admin, _treasury, client) = setup();
    let attacker = Address::generate(&env);

    client.schedule_pause_update(&attacker, &true).unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unauthorized_schedule_treasury_update() {
    let (env, _contract_id, _admin, _treasury, client) = setup();
    let attacker = Address::generate(&env);
    let new_treasury = Address::generate(&env);

    client
        .schedule_treasury_update(&attacker, &new_treasury)
        .unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// UNAUTHORIZED CANCEL ATTEMPTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unauthorized_cancel_change() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    let attacker = Address::generate(&env);
    client.cancel_change(&attacker, &change_id).unwrap();
}

#[test]
#[should_panic(expected = "TokenNotFound")]
fn test_cancel_nonexistent_change() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    client.cancel_change(&admin, &999).unwrap();
}

#[test]
#[should_panic(expected = "ChangeAlreadyExecuted")]
fn test_cancel_already_executed_change() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.execute_change(&change_id).unwrap();

    client.cancel_change(&admin, &change_id).unwrap();
}

#[test]
#[should_panic(expected = "TokenNotFound")]
fn test_double_cancel_rejected() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    client.cancel_change(&admin, &change_id).unwrap();
    client.cancel_change(&admin, &change_id).unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMELOCK BYPASS ATTEMPTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected = "TimelockNotExpired")]
fn test_execute_before_timelock_expires() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    client.execute_change(&change_id).unwrap();
}

#[test]
#[should_panic(expected = "TimelockNotExpired")]
fn test_execute_one_second_before_timelock() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3599);

    client.execute_change(&change_id).unwrap();
}

#[test]
fn test_execute_at_exact_timelock_expiry() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3600);

    client.execute_change(&change_id).unwrap();

    let state = client.get_state();
    assert_eq!(state.base_fee, 2_000_000);
}

#[test]
#[should_panic(expected = "ChangeAlreadyExecuted")]
fn test_double_execute_rejected() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id).unwrap();
    client.execute_change(&change_id).unwrap();
}

#[test]
#[should_panic(expected = "TimelockNotExpired")]
fn test_cannot_bypass_timelock_by_canceling_and_requeuing() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id_1 = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 1800);

    client.cancel_change(&admin, &change_id_1).unwrap();
    let change_id_2 = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    client.execute_change(&change_id_2).unwrap();
}

#[test]
#[should_panic(expected = "TokenNotFound")]
fn test_cannot_execute_cancelled_change_after_timelock() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    client.cancel_change(&admin, &change_id).unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id).unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMELOCK ENFORCEMENT FOR ALL CHANGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected = "TimelockNotExpired")]
fn test_timelock_enforced_for_fee_update() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();
    client.execute_change(&change_id).unwrap();
}

#[test]
#[should_panic(expected = "TimelockNotExpired")]
fn test_timelock_enforced_for_pause_update() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client.schedule_pause_update(&admin, &true).unwrap();
    client.execute_change(&change_id).unwrap();
}

#[test]
#[should_panic(expected = "TimelockNotExpired")]
fn test_timelock_enforced_for_treasury_update() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let new_treasury = Address::generate(&env);
    let change_id = client
        .schedule_treasury_update(&admin, &new_treasury)
        .unwrap();
    client.execute_change(&change_id).unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected = "InvalidParameters")]
fn test_schedule_fee_update_with_negative_base_fee() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    client
        .schedule_fee_update(&admin, &Some(-1), &None)
        .unwrap();
}

#[test]
#[should_panic(expected = "InvalidParameters")]
fn test_schedule_fee_update_with_negative_metadata_fee() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    client
        .schedule_fee_update(&admin, &None, &Some(-1))
        .unwrap();
}

#[test]
#[should_panic(expected = "InvalidParameters")]
fn test_schedule_fee_update_with_both_none() {
    let (_env, _contract_id, admin, _treasury, client) = setup();

    client.schedule_fee_update(&admin, &None, &None).unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// RACE CONDITION TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected = "ChangeAlreadyExecuted")]
fn test_concurrent_execution_attempts_only_one_succeeds() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id).unwrap();
    client.execute_change(&change_id).unwrap();
}

#[test]
#[should_panic(expected = "ChangeAlreadyExecuted")]
fn test_cancel_after_execution_fails() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id).unwrap();
    client.cancel_change(&admin, &change_id).unwrap();
}

#[test]
#[should_panic(expected = "TokenNotFound")]
fn test_execute_after_cancel_fails() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    client.cancel_change(&admin, &change_id).unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id).unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANIPULATION ATTEMPTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_cannot_execute_multiple_times_for_cumulative_effect() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id).unwrap();

    let state = client.get_state();
    assert_eq!(state.base_fee, 2_000_000);

    // Second execution should panic
    let result = client.try_execute_change(&change_id);
    assert!(result.is_err());
}

#[test]
fn test_multiple_queued_changes_last_wins() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id_1 = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();
    let change_id_2 = client
        .schedule_fee_update(&admin, &Some(3_000_000), &None)
        .unwrap();
    let change_id_3 = client
        .schedule_fee_update(&admin, &Some(4_000_000), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id_1).unwrap();
    client.execute_change(&change_id_2).unwrap();
    client.execute_change(&change_id_3).unwrap();

    let state = client.get_state();
    assert_eq!(state.base_fee, 4_000_000);

    // Cannot re-execute
    assert!(client.try_execute_change(&change_id_1).is_err());
    assert!(client.try_execute_change(&change_id_2).is_err());
    assert!(client.try_execute_change(&change_id_3).is_err());
}

#[test]
fn test_cancel_does_not_affect_other_pending_changes() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id_1 = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();
    let change_id_2 = client
        .schedule_fee_update(&admin, &Some(3_000_000), &None)
        .unwrap();

    client.cancel_change(&admin, &change_id_1).unwrap();

    let pending = client.get_pending_change(&change_id_2);
    assert!(pending.is_some());
    assert!(!pending.unwrap().executed);

    env.ledger().with_mut(|li| li.timestamp += 3601);
    client.execute_change(&change_id_2).unwrap();

    let state = client.get_state();
    assert_eq!(state.base_fee, 3_000_000);
}

// ═══════════════════════════════════════════════════════════════════════════
// BOUNDARY CONDITION TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_timelock_exact_expiry_boundary() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    let pending = client.get_pending_change(&change_id).unwrap();
    let execute_at = pending.execute_at;

    // One second before expiry - should fail
    env.ledger().with_mut(|li| li.timestamp = execute_at - 1);
    assert!(client.try_execute_change(&change_id).is_err());

    // Exactly at expiry - should succeed
    env.ledger().with_mut(|li| li.timestamp = execute_at);
    client.execute_change(&change_id).unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVILEGE ESCALATION ATTEMPTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_treasury_cannot_queue_changes() {
    let (_env, _contract_id, _admin, treasury, client) = setup();

    client
        .schedule_fee_update(&treasury, &Some(2_000_000), &None)
        .unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_treasury_cannot_cancel_changes() {
    let (_env, _contract_id, admin, treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    client.cancel_change(&treasury, &change_id).unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE NEGATIVE PATH COVERAGE
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_all_governance_functions_require_proper_auth() {
    let (env, _contract_id, admin, _treasury, client) = setup();
    let attacker = Address::generate(&env);

    // All unauthorized attempts should fail
    assert!(client
        .try_schedule_fee_update(&attacker, &Some(2_000_000), &None)
        .is_err());
    assert!(client.try_schedule_pause_update(&attacker, &true).is_err());

    let new_treasury = Address::generate(&env);
    assert!(client
        .try_schedule_treasury_update(&attacker, &new_treasury)
        .is_err());

    // Admin creates valid change
    let change_id = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();

    // Attacker cannot cancel
    assert!(client.try_cancel_change(&attacker, &change_id).is_err());
}

#[test]
fn test_state_consistency_after_failed_operations() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let initial_state = client.get_state();

    let attacker = Address::generate(&env);

    // Multiple failed attempts
    let _ = client.try_schedule_fee_update(&attacker, &Some(999_999_999), &None);
    let _ = client.try_schedule_pause_update(&attacker, &true);
    let _ = client.try_schedule_treasury_update(&attacker, &attacker);

    // Verify state completely unchanged
    let final_state = client.get_state();
    assert_eq!(final_state.base_fee, initial_state.base_fee);
    assert_eq!(final_state.metadata_fee, initial_state.metadata_fee);
    assert_eq!(final_state.treasury, initial_state.treasury);
    assert_eq!(final_state.paused, initial_state.paused);
}

#[test]
fn test_execute_nonexistent_change() {
    let (_env, _contract_id, _admin, _treasury, client) = setup();

    let result = client.try_execute_change(&999);
    assert!(result.is_err());
}

#[test]
fn test_timelock_enforced_across_all_operations() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    // Queue multiple types of changes
    let fee_change = client
        .schedule_fee_update(&admin, &Some(2_000_000), &None)
        .unwrap();
    let pause_change = client.schedule_pause_update(&admin, &true).unwrap();
    let new_treasury = Address::generate(&env);
    let treasury_change = client
        .schedule_treasury_update(&admin, &new_treasury)
        .unwrap();

    // All should fail before timelock
    assert!(client.try_execute_change(&fee_change).is_err());
    assert!(client.try_execute_change(&pause_change).is_err());
    assert!(client.try_execute_change(&treasury_change).is_err());

    // All should succeed after timelock
    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&fee_change).unwrap();
    client.execute_change(&pause_change).unwrap();
    client.execute_change(&treasury_change).unwrap();
}

#[test]
fn test_extreme_fee_values_accepted() {
    let (env, _contract_id, admin, _treasury, client) = setup();

    let change_id = client
        .schedule_fee_update(&admin, &Some(i128::MAX), &None)
        .unwrap();

    env.ledger().with_mut(|li| li.timestamp += 3601);

    client.execute_change(&change_id).unwrap();

    let state = client.get_state();
    assert_eq!(state.base_fee, i128::MAX);
}
