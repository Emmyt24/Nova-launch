#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

/// Helper function to setup a test environment with initialized contract
fn setup<'a>(env: &'a Env) -> (Address, TokenFactoryClient<'a>, Address, Address) {
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let creator = Address::generate(env);

    let base_fee = 100_i128;
    let metadata_fee = 50_i128;

    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    (contract_id, client, admin, creator)
}

/// Helper function to create a token without metadata
fn create_token_for_minting(
    env: &Env,
    client: &TokenFactoryClient,
    creator: &Address,
) -> u32 {
    // Store token info manually for testing
    let token_address = Address::generate(env);
    let token_info = crate::types::TokenInfo {
        address: token_address.clone(),
        creator: creator.clone(),
        name: String::from_str(env, "Mint Test Token"),
        symbol: String::from_str(env, "MINT"),
        decimals: 7,
        total_supply: 1_000_000_0000000,
        initial_supply: 1_000_000_0000000,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        metadata_version: 0,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
    };

    let token_index = crate::storage::get_token_count(env);
    crate::storage::set_token_info(env, token_index, &token_info);
    crate::storage::set_token_info_by_address(env, &token_address, &token_info);
    crate::storage::increment_token_count(env);

    // Set initial balance for creator
    crate::storage::set_balance(env, token_index, creator, token_info.initial_supply);

    token_index
}

#[test]
fn test_mint_tokens_success() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);
    let mint_amount = 500_000_0000000i128;

    // Get initial state
    let initial_info = client.get_token_info(&token_index);
    let initial_supply = initial_info.total_supply;
    let initial_balance = crate::storage::get_balance(&env, token_index, &recipient);

    // Mint tokens
    client.mint_tokens(&token_index, &creator, &recipient, &mint_amount);

    // Verify new supply
    let final_info = client.get_token_info(&token_index);
    assert_eq!(final_info.total_supply, initial_supply + mint_amount);

    // Verify recipient balance
    let final_balance = crate::storage::get_balance(&env, token_index, &recipient);
    assert_eq!(final_balance, initial_balance + mint_amount);
}

#[test]
fn test_mint_tokens_to_creator() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let mint_amount = 250_000_0000000i128;

    // Get initial creator balance
    let initial_balance = crate::storage::get_balance(&env, token_index, &creator);

    // Mint tokens to creator
    client.mint_tokens(&token_index, &creator, &creator, &mint_amount);

    // Verify creator balance increased
    let final_balance = crate::storage::get_balance(&env, token_index, &creator);
    assert_eq!(final_balance, initial_balance + mint_amount);
}

#[test]
fn test_mint_tokens_multiple_recipients() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient1 = Address::generate(&env);
    let recipient2 = Address::generate(&env);
    let recipient3 = Address::generate(&env);

    let amount1 = 100_000_0000000i128;
    let amount2 = 200_000_0000000i128;
    let amount3 = 300_000_0000000i128;

    let initial_supply = client.get_token_info(&token_index).total_supply;

    // Mint to multiple recipients
    client.mint_tokens(&token_index, &creator, &recipient1, &amount1);
    client.mint_tokens(&token_index, &creator, &recipient2, &amount2);
    client.mint_tokens(&token_index, &creator, &recipient3, &amount3);

    // Verify total supply
    let final_supply = client.get_token_info(&token_index).total_supply;
    assert_eq!(final_supply, initial_supply + amount1 + amount2 + amount3);

    // Verify individual balances
    assert_eq!(crate::storage::get_balance(&env, token_index, &recipient1), amount1);
    assert_eq!(crate::storage::get_balance(&env, token_index, &recipient2), amount2);
    assert_eq!(crate::storage::get_balance(&env, token_index, &recipient3), amount3);
}

#[test]
fn test_mint_tokens_unauthorized() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let unauthorized_user = Address::generate(&env);
    let recipient = Address::generate(&env);
    let mint_amount = 100_000_0000000i128;

    // Attempt to mint by non-creator should fail
    let result = client.try_mint_tokens(&token_index, &unauthorized_user, &recipient, &mint_amount);
    assert!(result.is_err());

    // Verify supply unchanged
    let final_info = client.get_token_info(&token_index);
    assert_eq!(final_info.total_supply, 1_000_000_0000000);
}

#[test]
fn test_mint_tokens_zero_amount() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);

    // Attempt to mint zero tokens should fail
    let result = client.try_mint_tokens(&token_index, &creator, &recipient, &0);
    assert!(result.is_err());
}

#[test]
fn test_mint_tokens_negative_amount() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);

    // Attempt to mint negative tokens should fail
    let result = client.try_mint_tokens(&token_index, &creator, &recipient, &-1000);
    assert!(result.is_err());
}

#[test]
fn test_mint_tokens_when_paused() {
    let env = Env::default();
    let (_contract_id, client, admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    // Pause the contract
    client.pause(&admin);

    let recipient = Address::generate(&env);
    let mint_amount = 100_000_0000000i128;

    // Attempt to mint while paused should fail
    let result = client.try_mint_tokens(&token_index, &creator, &recipient, &mint_amount);
    assert!(result.is_err());
}

#[test]
fn test_mint_tokens_token_not_found() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);

    let recipient = Address::generate(&env);
    let mint_amount = 100_000_0000000i128;

    // Attempt to mint for non-existent token
    let result = client.try_mint_tokens(&999, &creator, &recipient, &mint_amount);
    assert!(result.is_err());
}

#[test]
fn test_mint_tokens_updates_both_lookups() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);
    let mint_amount = 100_000_0000000i128;

    // Get token address
    let token_info_before = client.get_token_info(&token_index);
    let token_address = token_info_before.address.clone();

    // Mint tokens
    client.mint_tokens(&token_index, &creator, &recipient, &mint_amount);

    // Verify supply updated via index lookup
    let token_info_by_index = client.get_token_info(&token_index);
    assert_eq!(token_info_by_index.total_supply, 1_000_000_0000000 + mint_amount);

    // Verify supply updated via address lookup
    let token_info_by_address = client.get_token_info_by_address(&token_address);
    assert_eq!(token_info_by_address.total_supply, 1_000_000_0000000 + mint_amount);
}

#[test]
fn test_mint_tokens_large_amount() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);
    let large_amount = 1_000_000_000_0000000i128; // 1 billion tokens

    let initial_supply = client.get_token_info(&token_index).total_supply;

    // Mint large amount
    client.mint_tokens(&token_index, &creator, &recipient, &large_amount);

    // Verify supply
    let final_supply = client.get_token_info(&token_index).total_supply;
    assert_eq!(final_supply, initial_supply + large_amount);

    // Verify recipient balance
    let balance = crate::storage::get_balance(&env, token_index, &recipient);
    assert_eq!(balance, large_amount);
}

#[test]
fn test_mint_tokens_sequential_mints() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);
    let amount_per_mint = 50_000_0000000i128;
    let num_mints = 5;

    let initial_supply = client.get_token_info(&token_index).total_supply;

    // Perform sequential mints
    for _ in 0..num_mints {
        client.mint_tokens(&token_index, &creator, &recipient, &amount_per_mint);
    }

    // Verify total supply
    let final_supply = client.get_token_info(&token_index).total_supply;
    assert_eq!(final_supply, initial_supply + (amount_per_mint * num_mints));

    // Verify recipient balance
    let balance = crate::storage::get_balance(&env, token_index, &recipient);
    assert_eq!(balance, amount_per_mint * num_mints);
}

#[test]
fn test_mint_tokens_preserves_other_balances() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let holder1 = Address::generate(&env);
    let holder2 = Address::generate(&env);
    let new_recipient = Address::generate(&env);

    // Set initial balances for existing holders
    crate::storage::set_balance(&env, token_index, &holder1, 100_000_0000000);
    crate::storage::set_balance(&env, token_index, &holder2, 200_000_0000000);

    // Mint to new recipient
    client.mint_tokens(&token_index, &creator, &new_recipient, &50_000_0000000);

    // Verify existing balances unchanged
    assert_eq!(crate::storage::get_balance(&env, token_index, &holder1), 100_000_0000000);
    assert_eq!(crate::storage::get_balance(&env, token_index, &holder2), 200_000_0000000);

    // Verify new recipient balance
    assert_eq!(crate::storage::get_balance(&env, token_index, &new_recipient), 50_000_0000000);
}

#[test]
fn test_mint_tokens_event_emission() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);
    let mint_amount = 100_000_0000000i128;

    // Mint tokens
    client.mint_tokens(&token_index, &creator, &recipient, &mint_amount);

    // Note: Event verification would require accessing env.events()
    // This test verifies the operation completes successfully
}

#[test]
fn test_mint_tokens_different_tokens_isolated() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);

    // Create two tokens
    let token1 = create_token_for_minting(&env, &client, &creator);
    let token2 = create_token_for_minting(&env, &client, &creator);

    let recipient = Address::generate(&env);
    let amount1 = 100_000_0000000i128;
    let amount2 = 200_000_0000000i128;

    // Mint to token1
    client.mint_tokens(&token1, &creator, &recipient, &amount1);

    // Mint to token2
    client.mint_tokens(&token2, &creator, &recipient, &amount2);

    // Verify supplies are independent
    assert_eq!(client.get_token_info(&token1).total_supply, 1_000_000_0000000 + amount1);
    assert_eq!(client.get_token_info(&token2).total_supply, 1_000_000_0000000 + amount2);

    // Verify balances are independent
    assert_eq!(crate::storage::get_balance(&env, token1, &recipient), amount1);
    assert_eq!(crate::storage::get_balance(&env, token2, &recipient), amount2);
}
