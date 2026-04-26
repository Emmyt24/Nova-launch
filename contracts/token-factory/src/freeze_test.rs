#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env, IntoVal, Symbol,
};

fn create_test_env() -> (Env, TokenFactoryClient, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_address = Address::generate(&env);

    // Initialize factory
    client.initialize(&admin, &treasury, &1_000_000, &500_000);

    (env, client, admin, treasury, token_address)
}

fn setup_token_with_freeze(
    env: &Env,
    client: &TokenFactoryClient,
    token_address: &Address,
    creator: &Address,
    freeze_enabled: bool,
) {
    use crate::types::{DataKey, TokenInfo};
    use soroban_sdk::String;

    let token_info = TokenInfo {
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
        freeze_enabled,
            freeze_enabled: false,
            is_paused: false,
        
        };

    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&DataKey::TokenByAddress(token_address.clone()), &token_info);
    });
}

#[test]
fn test_freeze_address_success() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user = Address::generate(&env);

    // Freeze the address
    let result = client.freeze_address(&token_address, &admin, &user);
    assert!(result.is_ok());

    // Verify address is frozen
    assert!(client.is_address_frozen(&token_address, &user));

    // Verify event was emitted
    let events = env.events().all();
    let event = events.last().unwrap();
    assert_eq!(
        event.topics,
        (Symbol::new(&env, "freeze"), token_address.clone()).into_val(&env)
    );
}

#[test]
fn test_unfreeze_address_success() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user = Address::generate(&env);

    // Freeze then unfreeze
    client.freeze_address(&token_address, &admin, &user);
    assert!(client.is_address_frozen(&token_address, &user));

    let result = client.unfreeze_address(&token_address, &admin, &user);
    assert!(result.is_ok());

    // Verify address is no longer frozen
    assert!(!client.is_address_frozen(&token_address, &user));

    // Verify event was emitted
    let events = env.events().all();
    let event = events.last().unwrap();
    assert_eq!(
        event.topics,
        (Symbol::new(&env, "unfreeze"), token_address.clone()).into_val(&env)
    );
}

#[test]
fn test_freeze_unauthorized() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let unauthorized = Address::generate(&env);
    let user = Address::generate(&env);

    // Try to freeze with unauthorized address
    let result = client.try_freeze_address(&token_address, &unauthorized, &user);
    assert!(result.is_err());
}

#[test]
fn test_freeze_when_not_enabled() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, false);

    let user = Address::generate(&env);

    // Try to freeze when freeze is not enabled
    let result = client.try_freeze_address(&token_address, &admin, &user);
    assert!(result.is_err());
}

#[test]
fn test_freeze_already_frozen() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user = Address::generate(&env);

    // Freeze once
    client.freeze_address(&token_address, &admin, &user);

    // Try to freeze again
    let result = client.try_freeze_address(&token_address, &admin, &user);
    assert!(result.is_err());
}

#[test]
fn test_unfreeze_not_frozen() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user = Address::generate(&env);

    // Try to unfreeze an address that's not frozen
    let result = client.try_unfreeze_address(&token_address, &admin, &user);
    assert!(result.is_err());
}

#[test]
fn test_freeze_when_paused() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    // Pause the contract
    client.pause(&admin);

    let user = Address::generate(&env);

    // Try to freeze when paused
    let result = client.try_freeze_address(&token_address, &admin, &user);
    assert!(result.is_err());
}

#[test]
fn test_unfreeze_when_paused() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user = Address::generate(&env);

    // Freeze first
    client.freeze_address(&token_address, &admin, &user);

    // Pause the contract
    client.pause(&admin);

    // Try to unfreeze when paused
    let result = client.try_unfreeze_address(&token_address, &admin, &user);
    assert!(result.is_err());
}

#[test]
fn test_set_freeze_enabled() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, false);

    // Enable freeze
    let result = client.set_freeze_enabled(&token_address, &admin, &true);
    assert!(result.is_ok());

    // Verify event was emitted
    let events = env.events().all();
    let event = events.last().unwrap();
    assert_eq!(
        event.topics,
        (Symbol::new(&env, "frz_set"), token_address.clone()).into_val(&env)
    );
}

#[test]
fn test_set_freeze_enabled_unauthorized() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, false);

    let unauthorized = Address::generate(&env);

    // Try to enable freeze with unauthorized address
    let result = client.try_set_freeze_enabled(&token_address, &unauthorized, &true);
    assert!(result.is_err());
}

#[test]
fn test_freeze_token_not_found() {
    let (env, client, admin, _treasury, _token_address) = create_test_env();

    let nonexistent_token = Address::generate(&env);
    let user = Address::generate(&env);

    // Try to freeze on non-existent token
    let result = client.try_freeze_address(&nonexistent_token, &admin, &user);
    assert!(result.is_err());
}

#[test]
fn test_is_address_frozen_default_false() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user = Address::generate(&env);

    // Check that address is not frozen by default
    assert!(!client.is_address_frozen(&token_address, &user));
}

#[test]
fn test_multiple_addresses_freeze() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    // Freeze multiple addresses
    client.freeze_address(&token_address, &admin, &user1);
    client.freeze_address(&token_address, &admin, &user2);

    // Verify correct freeze states
    assert!(client.is_address_frozen(&token_address, &user1));
    assert!(client.is_address_frozen(&token_address, &user2));
    assert!(!client.is_address_frozen(&token_address, &user3));

    // Unfreeze one
    client.unfreeze_address(&token_address, &admin, &user1);

    // Verify states updated correctly
    assert!(!client.is_address_frozen(&token_address, &user1));
    assert!(client.is_address_frozen(&token_address, &user2));
    assert!(!client.is_address_frozen(&token_address, &user3));
}

#[test]
fn test_freeze_disable_then_enable() {
    let (env, client, admin, _treasury, token_address) = create_test_env();
    setup_token_with_freeze(&env, &client, &token_address, &admin, true);

    let user = Address::generate(&env);

    // Freeze an address
    client.freeze_address(&token_address, &admin, &user);
    assert!(client.is_address_frozen(&token_address, &user));

    // Disable freeze capability
    client.set_freeze_enabled(&token_address, &admin, &false);

    // Address should still be frozen (freeze state persists)
    assert!(client.is_address_frozen(&token_address, &user));

    // But we can't freeze new addresses
    let user2 = Address::generate(&env);
    let result = client.try_freeze_address(&token_address, &admin, &user2);
    assert!(result.is_err());

    // Re-enable freeze
    client.set_freeze_enabled(&token_address, &admin, &true);

    // Now we can unfreeze
    client.unfreeze_address(&token_address, &admin, &user);
    assert!(!client.is_address_frozen(&token_address, &user));
}
