//! Stream Feature Compatibility Tests
//!
//! These tests verify that existing token APIs continue to work unchanged
//! after the introduction of stream storage keys and functions.
//!
//! **Purpose**: Ensure backward compatibility and no regressions.

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

/// Test: Token creation works with stream keys present
/// Verifies that adding stream storage keys doesn't affect token creation
#[test]
fn test_token_creation_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    // Initialize factory
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create token (existing API)
    let token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // Verify token was created successfully
    let token_info = client.get_token_info(&0);
    assert_eq!(token_info.name, String::from_str(&env, "Test Token"));
    assert_eq!(token_info.symbol, String::from_str(&env, "TST"));
    assert_eq!(token_info.decimals, 7);
    assert_eq!(token_info.total_supply, 1_000_000);
    assert_eq!(token_info.creator, creator);
    
    // Verify token count
    assert_eq!(client.get_token_count(), 1);
}

/// Test: Token queries return same results
/// Verifies that token info queries work identically
#[test]
fn test_token_queries_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create multiple tokens
    let token1 = client.create_token(
        &creator,
        &String::from_str(&env, "Token 1"),
        &String::from_str(&env, "TK1"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    let token2 = client.create_token(
        &creator,
        &String::from_str(&env, "Token 2"),
        &String::from_str(&env, "TK2"),
        &7,
        &2_000_000,
        &70_000_000,
    );
    
    // Query by index
    let info1 = client.get_token_info(&0);
    assert_eq!(info1.symbol, String::from_str(&env, "TK1"));
    assert_eq!(info1.total_supply, 1_000_000);
    
    let info2 = client.get_token_info(&1);
    assert_eq!(info2.symbol, String::from_str(&env, "TK2"));
    assert_eq!(info2.total_supply, 2_000_000);
    
    // Query by address
    let info1_by_addr = client.get_token_info_by_address(&token1);
    assert_eq!(info1_by_addr.symbol, String::from_str(&env, "TK1"));
    
    let info2_by_addr = client.get_token_info_by_address(&token2);
    assert_eq!(info2_by_addr.symbol, String::from_str(&env, "TK2"));
    
    // Verify token count
    assert_eq!(client.get_token_count(), 2);
}

/// Test: Burn operations work unchanged
/// Verifies that burn functionality is not affected
#[test]
fn test_burn_operations_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    let _token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // Burn tokens (existing API)
    client.burn(&creator, 0, 100_000);
    
    // Verify burn worked
    let info = client.get_token_info(&0);
    assert_eq!(info.total_supply, 900_000);
    assert_eq!(info.total_burned, 100_000);
    assert_eq!(info.burn_count, 1);
}

/// Test: Admin operations work unchanged
/// Verifies that admin functions are not affected
#[test]
fn test_admin_operations_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Transfer admin (existing API)
    client.transfer_admin(&admin, &new_admin);
    
    // Verify admin changed
    let state = client.get_state();
    assert_eq!(state.admin, new_admin);
}

/// Test: Fee operations work unchanged
/// Verifies that fee update functions are not affected
#[test]
fn test_fee_operations_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Update fees (existing API)
    client.update_fees(&admin, Some(100_000_000), Some(50_000_000));
    
    // Verify fees changed
    let state = client.get_state();
    assert_eq!(state.base_fee, 100_000_000);
    assert_eq!(state.metadata_fee, 50_000_000);
}

/// Test: Pause operations work unchanged
/// Verifies that pause/unpause functions are not affected
#[test]
fn test_pause_operations_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Pause (existing API)
    client.pause(&admin);
    assert!(client.is_paused());
    
    // Unpause (existing API)
    client.unpause(&admin);
    assert!(!client.is_paused());
}

/// Test: Clawback operations work unchanged
/// Verifies that clawback toggle is not affected
#[test]
fn test_clawback_operations_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    let token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // Toggle clawback (existing API)
    client.set_clawback(&token_address, &creator, true);
    
    // Verify clawback enabled
    let info = client.get_token_info(&0);
    assert_eq!(info.clawback_enabled, true);
}

/// Test: Batch operations work unchanged
/// Verifies that batch burn is not affected
#[test]
fn test_batch_operations_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    let _token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // Batch burn (existing API)
    let burns = soroban_sdk::Vec::from_array(
        &env,
        [
            (Address::generate(&env), 10_000i128),
            (Address::generate(&env), 20_000i128),
        ],
    );
    
    client.batch_burn(&admin, 0, burns);
    
    // Verify batch burn worked
    let info = client.get_token_info(&0);
    assert_eq!(info.total_burned, 30_000);
    assert_eq!(info.burn_count, 2);
}

/// Test: State queries work unchanged
/// Verifies that factory state queries are not affected
#[test]
fn test_state_queries_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Get state (existing API)
    let state = client.get_state();
    
    // Verify state is correct
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
    assert_eq!(state.base_fee, 70_000_000);
    assert_eq!(state.metadata_fee, 30_000_000);
    assert_eq!(state.paused, false);
}

/// Test: Multiple token operations in sequence
/// Verifies complex workflows are not affected
#[test]
fn test_complex_token_workflow_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    
    // Initialize
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create multiple tokens
    let _token1 = client.create_token(
        &creator1,
        &String::from_str(&env, "Token 1"),
        &String::from_str(&env, "TK1"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    let _token2 = client.create_token(
        &creator2,
        &String::from_str(&env, "Token 2"),
        &String::from_str(&env, "TK2"),
        &7,
        &2_000_000,
        &70_000_000,
    );
    
    // Burn from first token
    client.burn(&creator1, 0, 100_000);
    
    // Update fees
    client.update_fees(&admin, Some(80_000_000), None);
    
    // Pause and unpause
    client.pause(&admin);
    client.unpause(&admin);
    
    // Verify all operations worked
    assert_eq!(client.get_token_count(), 2);
    
    let info1 = client.get_token_info(&0);
    assert_eq!(info1.total_supply, 900_000);
    assert_eq!(info1.total_burned, 100_000);
    
    let info2 = client.get_token_info(&1);
    assert_eq!(info2.total_supply, 2_000_000);
    
    let state = client.get_state();
    assert_eq!(state.base_fee, 80_000_000);
    assert_eq!(state.paused, false);
}

/// Test: Error handling unchanged
/// Verifies that error codes and handling are not affected
#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_error_handling_unchanged() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Attempt to create token with invalid parameters (should fail with #3)
    client.create_token(
        &creator,
        &String::from_str(&env, ""),  // Empty name - invalid
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
}
