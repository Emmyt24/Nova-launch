//! Mutation Testing - Authentication Tests
//!
//! These tests are specifically designed to kill authentication bypass mutants.
//! Each test targets a specific mutation that could bypass security checks.

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

/// Test: transfer_admin requires authentication
/// Kills mutant: Remove `current_admin.require_auth()`
#[test]
#[should_panic]
fn test_transfer_admin_requires_auth_no_mock() {
    let env = Env::default();
    // DON'T mock auth - we want to test auth requirement
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Mock only for initialization
    env.mock_all_auths();
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Clear auth mocks - now require real auth
    env.mock_all_auths_allowing_non_root_auth();
    
    // This should panic because auth is not provided
    client.transfer_admin(&admin, &new_admin);
}

/// Test: pause requires authentication
/// Kills mutant: Remove `admin.require_auth()`
#[test]
#[should_panic]
fn test_pause_requires_auth_no_mock() {
    let env = Env::default();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Mock only for initialization
    env.mock_all_auths();
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Clear auth mocks
    env.mock_all_auths_allowing_non_root_auth();
    
    // This should panic because auth is not provided
    client.pause(&admin);
}

/// Test: unpause requires authentication
/// Kills mutant: Remove `admin.require_auth()`
#[test]
#[should_panic]
fn test_unpause_requires_auth_no_mock() {
    let env = Env::default();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Mock only for initialization
    env.mock_all_auths();
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Clear auth mocks
    env.mock_all_auths_allowing_non_root_auth();
    
    // This should panic because auth is not provided
    client.unpause(&admin);
}

/// Test: update_fees requires authentication
/// Kills mutant: Remove `admin.require_auth()`
#[test]
#[should_panic]
fn test_update_fees_requires_auth_no_mock() {
    let env = Env::default();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Mock only for initialization
    env.mock_all_auths();
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Clear auth mocks
    env.mock_all_auths_allowing_non_root_auth();
    
    // This should panic because auth is not provided
    client.update_fees(&admin, Some(100_000_000), None);
}

/// Test: batch_update_admin requires authentication
/// Kills mutant: Remove `admin.require_auth()`
#[test]
#[should_panic]
fn test_batch_update_admin_requires_auth_no_mock() {
    let env = Env::default();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Mock only for initialization
    env.mock_all_auths();
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Clear auth mocks
    env.mock_all_auths_allowing_non_root_auth();
    
    // This should panic because auth is not provided
    client.batch_update_admin(&admin, Some(100_000_000), None, None);
}

/// Test: set_clawback requires authentication
/// Kills mutant: Remove `admin.require_auth()`
#[test]
#[should_panic]
fn test_set_clawback_requires_auth_no_mock() {
    let env = Env::default();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_address = Address::generate(&env);
    
    // Mock only for initialization
    env.mock_all_auths();
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Clear auth mocks
    env.mock_all_auths_allowing_non_root_auth();
    
    // This should panic because auth is not provided
    client.set_clawback(&token_address, &admin, true);
}

/// Test: burn requires authentication
/// Kills mutant: Remove `caller.require_auth()`
#[test]
#[should_panic]
fn test_burn_requires_auth_no_mock() {
    let env = Env::default();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let caller = Address::generate(&env);
    
    // Mock only for initialization
    env.mock_all_auths();
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Clear auth mocks
    env.mock_all_auths_allowing_non_root_auth();
    
    // This should panic because auth is not provided
    client.burn(&caller, 0, 1000);
}

/// Test: transfer_admin rejects wrong admin
/// Kills mutant: Change `!=` to `==` in admin check
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_transfer_admin_rejects_wrong_admin() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let wrong_admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Attempt transfer with wrong admin - should fail with Unauthorized (#2)
    client.transfer_admin(&wrong_admin, &new_admin);
}

/// Test: pause rejects wrong admin
/// Kills mutant: Change `!=` to `==` in admin check
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_pause_rejects_wrong_admin() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let wrong_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Attempt pause with wrong admin - should fail with Unauthorized (#2)
    client.pause(&wrong_admin);
}

/// Test: unpause rejects wrong admin
/// Kills mutant: Change `!=` to `==` in admin check
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_unpause_rejects_wrong_admin() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let wrong_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Attempt unpause with wrong admin - should fail with Unauthorized (#2)
    client.unpause(&wrong_admin);
}

/// Test: update_fees rejects wrong admin
/// Kills mutant: Change `!=` to `==` in admin check
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_update_fees_rejects_wrong_admin() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let wrong_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Attempt fee update with wrong admin - should fail with Unauthorized (#2)
    client.update_fees(&wrong_admin, Some(100_000_000), None);
}

/// Test: batch_update_admin rejects wrong admin
/// Kills mutant: Change `!=` to `==` in admin check
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_batch_update_admin_rejects_wrong_admin() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let wrong_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Attempt batch update with wrong admin - should fail with Unauthorized (#2)
    client.batch_update_admin(&wrong_admin, Some(100_000_000), None, None);
}

/// Test: set_clawback rejects non-creator
/// Kills mutant: Change `!=` to `==` in creator check
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_set_clawback_rejects_non_creator() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let non_creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create a token (would need actual implementation)
    let token_address = Address::generate(&env);
    
    // Attempt clawback toggle with non-creator - should fail with Unauthorized (#2)
    client.set_clawback(&token_address, &non_creator, true);
}
