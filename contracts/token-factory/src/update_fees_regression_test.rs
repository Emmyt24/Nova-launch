//! Regression tests for update_fees function
//!
//! These tests are based on findings from fuzz testing and ensure
//! that critical behaviors remain correct across code changes.

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Address;

#[test]
fn regression_negative_fees_rejected() {
    // Regression: Ensure negative fees are always rejected
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Test various negative values
    assert!(client.try_update_fees(&admin, &Some(-1), &None).is_err());
    assert!(client.try_update_fees(&admin, &None, &Some(-1)).is_err());
    assert!(client
        .try_update_fees(&admin, &Some(-1000), &Some(-1000))
        .is_err());
    assert!(client
        .try_update_fees(&admin, &Some(i128::MIN), &None)
        .is_err());
}

#[test]
fn regression_unauthorized_always_fails() {
    // Regression: Ensure unauthorized addresses cannot update fees
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Even with valid fees, unauthorized should fail
    assert!(client
        .try_update_fees(&unauthorized, &Some(200_000_000), &Some(100_000_000))
        .is_err());
}

#[test]
fn regression_none_values_no_update() {
    // Regression: Ensure None values don't update fees
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Update with None should not change values
    client.update_fees(&admin, &None, &None);
    let state = client.get_state();
    assert_eq!(state.base_fee, 100_000_000);
    assert_eq!(state.metadata_fee, 50_000_000);

    // Partial None should only update non-None value
    client.update_fees(&admin, &Some(200_000_000), &None);
    let state = client.get_state();
    assert_eq!(state.base_fee, 200_000_000);
    assert_eq!(state.metadata_fee, 50_000_000);
}

#[test]
fn regression_state_unchanged_on_failure() {
    // Regression: Ensure state remains unchanged after failed updates
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Attempt invalid update
    let _ = client.try_update_fees(&admin, &Some(-100), &Some(200_000_000));

    // State should be unchanged
    let state = client.get_state();
    assert_eq!(state.base_fee, 100_000_000);
    assert_eq!(state.metadata_fee, 50_000_000);
}

#[test]
fn regression_zero_is_valid() {
    // Regression: Ensure zero is accepted as valid fee
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Zero should be valid
    client.update_fees(&admin, &Some(0), &Some(0));
    let state = client.get_state();
    assert_eq!(state.base_fee, 0);
    assert_eq!(state.metadata_fee, 0);
}

#[test]
fn regression_large_fees_accepted() {
    // Regression: Ensure large fees (up to i128::MAX) are accepted
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Large fees should be accepted
    client.update_fees(&admin, &Some(i128::MAX), &None);
    let state = client.get_state();
    assert_eq!(state.base_fee, i128::MAX);
}

#[test]
fn regression_partial_updates_work() {
    // Regression: Ensure partial updates work correctly
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Update only base fee
    client.update_fees(&admin, &Some(200_000_000), &None);
    let state = client.get_state();
    assert_eq!(state.base_fee, 200_000_000);
    assert_eq!(state.metadata_fee, 50_000_000);

    // Update only metadata fee
    client.update_fees(&admin, &None, &Some(75_000_000));
    let state = client.get_state();
    assert_eq!(state.base_fee, 200_000_000);
    assert_eq!(state.metadata_fee, 75_000_000);
}

#[test]
fn regression_sequential_updates_consistent() {
    // Regression: Ensure sequential updates work correctly
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Multiple sequential updates
    for i in 1..=10 {
        let fee = i * 10_000_000;
        client.update_fees(&admin, &Some(fee), &Some(fee));
        let state = client.get_state();
        assert_eq!(state.base_fee, fee);
        assert_eq!(state.metadata_fee, fee);
    }
}

#[test]
fn regression_idempotent_updates() {
    // Regression: Ensure repeated updates with same value work
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // Update to same value multiple times
    for _ in 0..10 {
        client.update_fees(&admin, &Some(150_000_000), &Some(150_000_000));
        let state = client.get_state();
        assert_eq!(state.base_fee, 150_000_000);
        assert_eq!(state.metadata_fee, 150_000_000);
    }
}

#[test]
fn regression_one_invalid_fails_all() {
    // Regression: Ensure one invalid fee fails entire operation
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    // One valid, one invalid - should fail
    assert!(client
        .try_update_fees(&admin, &Some(200_000_000), &Some(-100))
        .is_err());

    // Neither fee should have changed
    let state = client.get_state();
    assert_eq!(state.base_fee, 100_000_000);
    assert_eq!(state.metadata_fee, 50_000_000);
}
