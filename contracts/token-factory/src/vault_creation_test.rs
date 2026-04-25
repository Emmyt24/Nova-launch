#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, BytesN, Env, String,
};

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &treasury, &1_000_000, &500_000);

    let creator = Address::generate(&env);
    let token = client.create_token(
        &creator,
        &String::from_str(&env, "Vault Token"),
        &String::from_str(&env, "VLT"),
        &7,
        &1_000_000_000,
        &None,
        &1_000_000,
    );

    (env, contract_id, token)
}

#[test]
fn test_create_vault_time_unlock_valid() {
    let (env, contract_id, token) = setup();
    let client = TokenFactoryClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    let owner = Address::generate(&env);
    let no_milestone = BytesN::from_array(&env, &[0u8; 32]);

    let vault_id = client.create_vault(
        &creator,
        &token,
        &owner,
        &500_000,
        &1_750_000_000,
        &no_milestone,
    );

    let vault = client.get_vault(&vault_id);
    assert_eq!(vault.id, vault_id);
    assert_eq!(vault.token, token);
    assert_eq!(vault.owner, owner);
    assert_eq!(vault.creator, creator);
    assert_eq!(vault.total_amount, 500_000);
    assert_eq!(vault.claimed_amount, 0);
    assert_eq!(vault.unlock_time, 1_750_000_000);
}

#[test]
fn test_create_vault_milestone_unlock_valid_and_evented() {
    let (env, contract_id, token) = setup();
    let client = TokenFactoryClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    let owner = Address::generate(&env);
    let milestone_hash = BytesN::from_array(&env, &[9u8; 32]);

    let before_events = env.events().all().len();
    let vault_id = client.create_vault(&creator, &token, &owner, &750_000, &0, &milestone_hash);
    let events = env.events().all();
    assert_eq!(events.len(), before_events + 1);
    let last = events.get(events.len() - 1).unwrap();
    let topics = last.1;

    let first_topic: soroban_sdk::Symbol = soroban_sdk::FromVal::from_val(&env, &topics.get(0).unwrap());
    assert_eq!(first_topic, soroban_sdk::symbol_short!("vlt_crt"));

    let vault = client.get_vault(&vault_id);
    assert_eq!(vault.id, vault_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_create_vault_rejects_missing_unlock_conditions() {
    let (env, contract_id, token) = setup();
    let client = TokenFactoryClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    let owner = Address::generate(&env);
    let no_milestone = BytesN::from_array(&env, &[0u8; 32]);

    let _ = client.create_vault(&creator, &token, &owner, &500_000, &0, &no_milestone);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_create_vault_rejects_non_positive_amount() {
    let (env, contract_id, token) = setup();
    let client = TokenFactoryClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    let owner = Address::generate(&env);
    let milestone_hash = BytesN::from_array(&env, &[1u8; 32]);

    let _ = client.create_vault(&creator, &token, &owner, &0, &1_750_000_000, &milestone_hash);
}
