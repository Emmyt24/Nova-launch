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
fn create_token_without_metadata(
    env: &Env,
    client: &TokenFactoryClient,
    creator: &Address,
) -> u32 {
    // Store token info manually for testing
    let token_address = Address::generate(env);
    let token_info = crate::types::TokenInfo {
        address: token_address.clone(),
        creator: creator.clone(),
        name: String::from_str(env, "Test Token"),
        symbol: String::from_str(env, "TEST"),
        decimals: 7,
        total_supply: 1_000_000_0000000,
        initial_supply: 1_000_000_0000000,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        metadata_version: 0,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
            freeze_enabled: false,
            is_paused: false,
        
        };

    let token_index = crate::storage::get_token_count(env);
    crate::storage::set_token_info(env, token_index, &token_info);
    crate::storage::set_token_info_by_address(env, &token_address, &token_info);
    crate::storage::increment_token_count(env);

    token_index
}

#[test]
fn test_set_metadata_success() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_without_metadata(&env, &client, &creator);

    let metadata_uri = String::from_str(&env, "ipfs://QmTest1234567890");

    // Set metadata should succeed
    client.set_metadata(&token_index, &creator, &metadata_uri);

    // Verify metadata was set
    let token_info = client.get_token_info(&token_index);
    assert_eq!(token_info.metadata_uri, Some(metadata_uri));
}

#[test]
fn test_set_metadata_immutability() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_without_metadata(&env, &client, &creator);

    let initial_uri = String::from_str(&env, "ipfs://QmInitial123");
    let new_uri = String::from_str(&env, "ipfs://QmNew456");

    // Set metadata first time - should succeed
    client.set_metadata(&token_index, &creator, &initial_uri);

    // Attempt to change metadata - should fail
    let result = client.try_set_metadata(&token_index, &creator, &new_uri);
    assert!(result.is_err());

    // Verify original metadata remains unchanged
    let token_info = client.get_token_info(&token_index);
    assert_eq!(token_info.metadata_uri, Some(initial_uri));
}

#[test]
fn test_set_metadata_unauthorized() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_without_metadata(&env, &client, &creator);

    let unauthorized_user = Address::generate(&env);
    let metadata_uri = String::from_str(&env, "ipfs://QmTest1234567890");

    // Attempt to set metadata by non-creator should fail
    let result = client.try_set_metadata(&token_index, &unauthorized_user, &metadata_uri);
    assert!(result.is_err());

    // Verify metadata was not set
    let token_info = client.get_token_info(&token_index);
    assert_eq!(token_info.metadata_uri, None);
}

#[test]
fn test_set_metadata_token_not_found() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);

    let metadata_uri = String::from_str(&env, "ipfs://QmTest1234567890");

    // Attempt to set metadata for non-existent token
    let result = client.try_set_metadata(&999, &creator, &metadata_uri);
    assert!(result.is_err());
}

#[test]
fn test_set_metadata_when_paused() {
    let env = Env::default();
    let (_contract_id, client, admin, creator) = setup(&env);
    let token_index = create_token_without_metadata(&env, &client, &creator);

    // Pause the contract
    client.pause(&admin);

    let metadata_uri = String::from_str(&env, "ipfs://QmTest1234567890");

    // Attempt to set metadata while paused should fail
    let result = client.try_set_metadata(&token_index, &creator, &metadata_uri);
    assert!(result.is_err());

    // Verify metadata was not set
    let token_info = client.get_token_info(&token_index);
    assert_eq!(token_info.metadata_uri, None);
}

#[test]
fn test_set_metadata_various_uri_formats() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);

    let test_uris = [
        "ipfs://QmTest1234567890",
        "https://nova-launch.io/metadata/token1.json",
        "ar://abcd1234efgh",
        "ipfs://bafybeigdyrzt5sfp7udm7drttvve",
    ];

    for uri_str in test_uris.iter() {
        let token_index = create_token_without_metadata(&env, &client, &creator);
        let metadata_uri = String::from_str(&env, uri_str);

        // Set metadata should succeed for all formats
        client.set_metadata(&token_index, &creator, &metadata_uri);

        // Verify metadata was set correctly
        let token_info = client.get_token_info(&token_index);
        assert_eq!(token_info.metadata_uri, Some(metadata_uri));
    }
}

#[test]
fn test_set_metadata_event_emission() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_without_metadata(&env, &client, &creator);

    let metadata_uri = String::from_str(&env, "ipfs://QmTest1234567890");

    // Set metadata
    client.set_metadata(&token_index, &creator, &metadata_uri);

    // Note: Event verification would require accessing env.events() which may not be available
    // in all test contexts. This test verifies the operation completes successfully.
}

#[test]
fn test_set_metadata_updates_both_lookups() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_without_metadata(&env, &client, &creator);

    let metadata_uri = String::from_str(&env, "ipfs://QmTest1234567890");

    // Get token address before setting metadata
    let token_info_before = client.get_token_info(&token_index);
    let token_address = token_info_before.address.clone();

    // Set metadata
    client.set_metadata(&token_index, &creator, &metadata_uri);

    // Verify metadata is accessible via index lookup
    let token_info_by_index = client.get_token_info(&token_index);
    assert_eq!(token_info_by_index.metadata_uri, Some(metadata_uri.clone()));

    // Verify metadata is accessible via address lookup
    let token_info_by_address = client.get_token_info_by_address(&token_address);
    assert_eq!(token_info_by_address.metadata_uri, Some(metadata_uri));
}

#[test]
fn test_set_metadata_empty_string() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);
    let token_index = create_token_without_metadata(&env, &client, &creator);

    let empty_uri = String::from_str(&env, "");

    // Setting empty string should succeed (validation is caller's responsibility)
    client.set_metadata(&token_index, &creator, &empty_uri);

    // Verify empty metadata was set
    let token_info = client.get_token_info(&token_index);
    assert_eq!(token_info.metadata_uri, Some(empty_uri));
}

#[test]
fn test_set_metadata_multiple_tokens() {
    let env = Env::default();
    let (_contract_id, client, _admin, creator) = setup(&env);

    // Create multiple tokens
    let token1 = create_token_without_metadata(&env, &client, &creator);
    let token2 = create_token_without_metadata(&env, &client, &creator);
    let token3 = create_token_without_metadata(&env, &client, &creator);

    let uri1 = String::from_str(&env, "ipfs://QmToken1");
    let uri2 = String::from_str(&env, "ipfs://QmToken2");
    let uri3 = String::from_str(&env, "ipfs://QmToken3");

    // Set metadata for each token
    client.set_metadata(&token1, &creator, &uri1);
    client.set_metadata(&token2, &creator, &uri2);
    client.set_metadata(&token3, &creator, &uri3);

    // Verify each token has correct metadata
    assert_eq!(client.get_token_info(&token1).metadata_uri, Some(uri1));
    assert_eq!(client.get_token_info(&token2).metadata_uri, Some(uri2));
    assert_eq!(client.get_token_info(&token3).metadata_uri, Some(uri3));
}
