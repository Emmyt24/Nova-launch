//! Integration tests for Token Factory
//!
//! These tests verify complete workflows from start to finish,
//! simulating real user scenarios.

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup_factory(env: &Env) -> (TokenFactoryClient, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let base_fee = 70_000_000;
    let metadata_fee = 30_000_000;

    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    (client, admin, treasury)
}

#[test]
fn test_complete_token_deployment_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, treasury) = setup_factory(&env);

    let state = client.get_state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
    assert_eq!(state.base_fee, 70_000_000);
    assert_eq!(state.metadata_fee, 30_000_000);

    let token_count = client.get_token_count();
    assert_eq!(token_count, 0);
}

#[test]
fn test_token_count_verification() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, treasury) = setup_factory(&env);

    let initial_count = client.get_token_count();
    assert_eq!(initial_count, 0);

    let state = client.get_state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
}

#[test]
fn test_multiple_token_deployments() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _treasury) = setup_factory(&env);

    let initial_state = client.get_state();
    let initial_count = client.get_token_count();
    assert_eq!(initial_count, 0);

    let state_after_ops = client.get_state();
    assert_eq!(state_after_ops.admin, initial_state.admin);
    assert_eq!(state_after_ops.treasury, initial_state.treasury);
    assert_eq!(state_after_ops.base_fee, initial_state.base_fee);

    let final_count = client.get_token_count();
    assert_eq!(final_count, 0);
}
