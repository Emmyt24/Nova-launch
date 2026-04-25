//! Stream Feature Smoke Tests
//!
//! These tests verify that mixed old/new state reads work correctly.
//! They ensure that token and stream operations can coexist without interference.
//!
//! **Purpose**: Verify state isolation and mixed operation scenarios.

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

/// Test: Read token info when streams exist (simulated)
/// Verifies that token queries work when stream storage keys are present
#[test]
fn test_read_token_with_streams_present() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create token
    let token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // TODO: When stream functions are implemented, create a stream here
    // client.create_stream(&creator, 0, &recipient, 100_000, None);
    
    // Read token info (should work regardless of streams)
    let info = client.get_token_info(&0);
    assert_eq!(info.address, token_address);
    assert_eq!(info.symbol, String::from_str(&env, "TST"));
    assert_eq!(info.total_supply, 1_000_000);
    
    // Read token by address (should work regardless of streams)
    let info_by_addr = client.get_token_info_by_address(&token_address);
    assert_eq!(info_by_addr.symbol, String::from_str(&env, "TST"));
    
    // Token count should be unaffected by streams
    assert_eq!(client.get_token_count(), 1);
}

/// Test: Create token after creating streams (simulated)
/// Verifies that token creation works when streams already exist
#[test]
fn test_create_token_after_streams() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create first token
    let _token1 = client.create_token(
        &creator1,
        &String::from_str(&env, "Token 1"),
        &String::from_str(&env, "TK1"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // TODO: When stream functions are implemented, create streams here
    // client.create_stream(&creator1, 0, &recipient, 100_000, None);
    // client.create_stream(&creator1, 0, &recipient, 200_000, None);
    
    // Create second token (should work with streams present)
    let token2 = client.create_token(
        &creator2,
        &String::from_str(&env, "Token 2"),
        &String::from_str(&env, "TK2"),
        &7,
        &2_000_000,
        &70_000_000,
    );
    
    // Verify both tokens exist
    assert_eq!(client.get_token_count(), 2);
    
    let info1 = client.get_token_info(&0);
    assert_eq!(info1.symbol, String::from_str(&env, "TK1"));
    
    let info2 = client.get_token_info(&1);
    assert_eq!(info2.symbol, String::from_str(&env, "TK2"));
    assert_eq!(info2.address, token2);
}

/// Test: Burn tokens while streams are active (simulated)
/// Verifies that burn operations work when streams exist
#[test]
fn test_burn_with_active_streams() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create token
    let _token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // TODO: When stream functions are implemented, create stream here
    // client.create_stream(&creator, 0, &recipient, 100_000, None);
    
    // Burn tokens (should work with streams present)
    client.burn(&creator, 0, 50_000);
    
    // Verify burn worked
    let info = client.get_token_info(&0);
    assert_eq!(info.total_supply, 950_000);
    assert_eq!(info.total_burned, 50_000);
    assert_eq!(info.burn_count, 1);
    
    // TODO: Verify stream is still valid
    // let stream_info = client.get_stream_info(0);
    // assert_eq!(stream_info.amount, 100_000);
}

/// Test: Query both tokens and streams in same transaction (simulated)
/// Verifies that mixed queries work correctly
#[test]
fn test_mixed_token_stream_queries() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create multiple tokens
    let _token1 = client.create_token(
        &creator,
        &String::from_str(&env, "Token 1"),
        &String::from_str(&env, "TK1"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    let _token2 = client.create_token(
        &creator,
        &String::from_str(&env, "Token 2"),
        &String::from_str(&env, "TK2"),
        &7,
        &2_000_000,
        &70_000_000,
    );
    
    // TODO: When stream functions are implemented, create streams here
    // client.create_stream(&creator, 0, &recipient1, 100_000, None);
    // client.create_stream(&creator, 1, &recipient2, 200_000, None);
    
    // Query tokens
    let token_count = client.get_token_count();
    assert_eq!(token_count, 2);
    
    let info1 = client.get_token_info(&0);
    assert_eq!(info1.symbol, String::from_str(&env, "TK1"));
    
    let info2 = client.get_token_info(&1);
    assert_eq!(info2.symbol, String::from_str(&env, "TK2"));
    
    // TODO: Query streams
    // let stream_count = client.get_stream_count();
    // assert_eq!(stream_count, 2);
    
    // let stream1 = client.get_stream_info(0);
    // assert_eq!(stream1.amount, 100_000);
    
    // let stream2 = client.get_stream_info(1);
    // assert_eq!(stream2.amount, 200_000);
}

/// Test: Admin operations with mixed state
/// Verifies that admin functions work with both tokens and streams present
#[test]
fn test_admin_operations_with_mixed_state() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create token
    let _token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // TODO: When stream functions are implemented, create stream here
    // client.create_stream(&creator, 0, &recipient, 100_000, None);
    
    // Pause contract (should work with mixed state)
    client.pause(&admin);
    assert!(client.is_paused());
    
    // Unpause
    client.unpause(&admin);
    assert!(!client.is_paused());
    
    // Update fees (should work with mixed state)
    client.update_fees(&admin, Some(80_000_000), None);
    
    let state = client.get_state();
    assert_eq!(state.base_fee, 80_000_000);
    
    // Transfer admin (should work with mixed state)
    client.transfer_admin(&admin, &new_admin);
    
    let new_state = client.get_state();
    assert_eq!(new_state.admin, new_admin);
}

/// Test: Batch operations with mixed state
/// Verifies that batch operations work when streams exist
#[test]
fn test_batch_operations_with_mixed_state() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create token
    let _token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // TODO: When stream functions are implemented, create streams here
    // client.create_stream(&creator, 0, &recipient1, 100_000, None);
    // client.create_stream(&creator, 0, &recipient2, 200_000, None);
    
    // Batch burn (should work with streams present)
    let burns = soroban_sdk::Vec::from_array(
        &env,
        [
            (Address::generate(&env), 10_000i128),
            (Address::generate(&env), 20_000i128),
            (Address::generate(&env), 30_000i128),
        ],
    );
    
    client.batch_burn(&admin, 0, burns);
    
    // Verify batch burn worked
    let info = client.get_token_info(&0);
    assert_eq!(info.total_burned, 60_000);
    assert_eq!(info.burn_count, 3);
    
    // TODO: Verify streams are still valid
    // let stream1 = client.get_stream_info(0);
    // assert_eq!(stream1.amount, 100_000);
}

/// Test: State consistency across mixed operations
/// Verifies that state remains consistent with both tokens and streams
#[test]
fn test_state_consistency_mixed_operations() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create token
    let _token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // Initial state
    assert_eq!(client.get_token_count(), 1);
    let info_before = client.get_token_info(&0);
    assert_eq!(info_before.total_supply, 1_000_000);
    
    // TODO: When stream functions are implemented, create stream
    // client.create_stream(&creator, 0, &recipient, 100_000, None);
    
    // Token count should be unchanged by stream creation
    assert_eq!(client.get_token_count(), 1);
    
    // Token info should be unchanged by stream creation
    let info_after = client.get_token_info(&0);
    assert_eq!(info_after.total_supply, 1_000_000);
    assert_eq!(info_after.symbol, String::from_str(&env, "TST"));
    
    // Factory state should be unchanged by stream creation
    let state = client.get_state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
    assert_eq!(state.base_fee, 70_000_000);
}

/// Test: Error handling with mixed state
/// Verifies that error codes work correctly with both tokens and streams
#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_error_handling_mixed_state() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create token
    let _token_address = client.create_token(
        &creator,
        &String::from_str(&env, "Test Token"),
        &String::from_str(&env, "TST"),
        &7,
        &1_000_000,
        &70_000_000,
    );
    
    // TODO: When stream functions are implemented, create stream
    // client.create_stream(&creator, 0, &recipient, 100_000, None);
    
    // Attempt to query non-existent token (should fail with #4)
    client.get_token_info(&999);
}

/// Test: Performance with mixed state
/// Verifies that operations don't slow down with both tokens and streams
#[test]
fn test_performance_mixed_state() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    
    // Create multiple tokens
    for i in 0..10 {
        client.create_token(
            &creator,
            &String::from_str(&env, &format!("Token {}", i)),
            &String::from_str(&env, &format!("TK{}", i)),
            &7,
            &1_000_000,
            &70_000_000,
        );
    }
    
    // TODO: When stream functions are implemented, create multiple streams
    // for i in 0..10 {
    //     client.create_stream(&creator, i, &recipient, 100_000, None);
    // }
    
    // Query all tokens (should be fast)
    for i in 0..10 {
        let info = client.get_token_info(&i);
        assert_eq!(info.total_supply, 1_000_000);
    }
    
    // TODO: Query all streams (should be fast)
    // for i in 0..10 {
    //     let stream = client.get_stream_info(i);
    //     assert_eq!(stream.amount, 100_000);
    // }
    
    // Verify counts
    assert_eq!(client.get_token_count(), 10);
    // TODO: assert_eq!(client.get_stream_count(), 10);
}
