use soroban_sdk::{testutils::Address as _, Address, Env, String};
use token_factory::{TokenFactory, TokenFactoryClient};

#[test]
fn test_set_metadata_basic() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    // Initialize factory
    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    // Create a token manually for testing
    let token_address = Address::generate(&env);
    let token_info = token_factory::types::TokenInfo {
        address: token_address.clone(),
        creator: creator.clone(),
        name: String::from_str(&env, "Test Token"),
        symbol: String::from_str(&env, "TEST"),
        decimals: 7,
        total_supply: 1_000_000_0000000,
        initial_supply: 1_000_000_0000000,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
    };

    // Store token info
    let token_index = 0u32;
    token_factory::storage::set_token_info(&env, token_index, &token_info);
    token_factory::storage::set_token_info_by_address(&env, &token_address, &token_info);
    token_factory::storage::increment_token_count(&env);

    // Set metadata
    let metadata_uri = String::from_str(&env, "ipfs://QmTest1234567890");
    client.set_metadata(&token_index, &creator, &metadata_uri);

    // Verify metadata was set
    let updated_info = client.get_token_info(&token_index);
    assert_eq!(updated_info.metadata_uri, Some(metadata_uri.clone()));

    // Verify immutability - attempting to change should fail
    let new_uri = String::from_str(&env, "ipfs://QmNewUri");
    let result = client.try_set_metadata(&token_index, &creator, &new_uri);
    assert!(result.is_err());

    // Verify original metadata unchanged
    let final_info = client.get_token_info(&token_index);
    assert_eq!(final_info.metadata_uri, Some(metadata_uri));
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_metadata_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    // Create token
    let token_address = Address::generate(&env);
    let token_info = token_factory::types::TokenInfo {
        address: token_address.clone(),
        creator: creator.clone(),
        name: String::from_str(&env, "Test Token"),
        symbol: String::from_str(&env, "TEST"),
        decimals: 7,
        total_supply: 1_000_000_0000000,
        initial_supply: 1_000_000_0000000,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
    };

    let token_index = 0u32;
    token_factory::storage::set_token_info(&env, token_index, &token_info);
    token_factory::storage::increment_token_count(&env);

    // Attempt to set metadata by unauthorized user - should panic
    let metadata_uri = String::from_str(&env, "ipfs://QmTest");
    client.set_metadata(&token_index, &unauthorized, &metadata_uri);
}

#[test]
#[should_panic(expected = "ContractPaused")]
fn test_set_metadata_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    // Create token
    let token_address = Address::generate(&env);
    let token_info = token_factory::types::TokenInfo {
        address: token_address.clone(),
        creator: creator.clone(),
        name: String::from_str(&env, "Test Token"),
        symbol: String::from_str(&env, "TEST"),
        decimals: 7,
        total_supply: 1_000_000_0000000,
        initial_supply: 1_000_000_0000000,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
    };

    let token_index = 0u32;
    token_factory::storage::set_token_info(&env, token_index, &token_info);
    token_factory::storage::increment_token_count(&env);

    // Pause contract
    client.pause(&admin);

    // Attempt to set metadata while paused - should panic
    let metadata_uri = String::from_str(&env, "ipfs://QmTest");
    client.set_metadata(&token_index, &creator, &metadata_uri);
}
