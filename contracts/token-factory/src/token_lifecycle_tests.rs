#![cfg(test)]
//! Token Snapshot Mechanism — Integration Tests
//!
//! Tests the full lifecycle of snapshot recording and historical queries
//! through the public contract API.

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

use crate::{TokenFactory, TokenFactoryClient};

const BASE_FEE: i128 = 70_000_000;
const METADATA_FEE: i128 = 30_000_000;

// ── Setup Helpers ─────────────────────────────────────────────────────────────

fn setup(env: &Env) -> (TokenFactoryClient, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    client.initialize(&admin, &treasury, &BASE_FEE, &METADATA_FEE);
    (client, admin, treasury)
}

fn setup_with_token(env: &Env) -> (TokenFactoryClient, Address, Address, u32) {
    let (client, admin, treasury) = setup(env);
    let token_index = 0_u32;

    // Seed admin balance directly via storage for testing
    let contract_id = env.register_contract(None, TokenFactory);
    crate::storage::set_token_info(
        env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(env, "SNP"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );
    crate::storage::set_balance(env, token_index, &admin, 1_000_000);

    (client, admin, treasury, token_index)
}

// ── Balance Snapshot Tests ────────────────────────────────────────────────────

#[test]
fn test_snapshot_recorded_on_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);

    // Set up token
    let token_index = 0_u32;
    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    env.ledger().set_sequence_number(100);
    client.mint(&admin, &token_index, &holder, &500_000_i128);

    // Snapshot should be recorded
    assert_eq!(client.get_balance_snapshot_count(&token_index, &holder), 1);
    assert_eq!(client.get_supply_snapshot_count(&token_index), 1);

    let snap = client.get_balance_snapshot(&token_index, &holder, &0).unwrap();
    assert_eq!(snap.balance, 500_000);
    assert_eq!(snap.ledger, 100);
}

#[test]
fn test_snapshot_recorded_on_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );
    crate::storage::set_balance(&env, token_index, &admin, 1_000_000);

    env.ledger().set_sequence_number(200);
    client.burn(&admin, &token_index, &300_000_i128);

    assert_eq!(client.get_balance_snapshot_count(&token_index, &admin), 1);
    assert_eq!(client.get_supply_snapshot_count(&token_index), 1);

    let snap = client.get_balance_snapshot(&token_index, &admin, &0).unwrap();
    assert_eq!(snap.balance, 700_000);
    assert_eq!(snap.ledger, 200);
}

#[test]
fn test_get_balance_at_historical_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    // Mint at ledger 100
    env.ledger().set_sequence_number(100);
    client.mint(&admin, &token_index, &holder, &1_000_i128);

    // Mint again at ledger 200
    env.ledger().set_sequence_number(200);
    client.mint(&admin, &token_index, &holder, &500_i128);

    // Mint again at ledger 300
    env.ledger().set_sequence_number(300);
    client.mint(&admin, &token_index, &holder, &250_i128);

    // Query at exact ledgers
    assert_eq!(client.get_balance_at(&token_index, &holder, &100).unwrap(), 1_000);
    assert_eq!(client.get_balance_at(&token_index, &holder, &200).unwrap(), 1_500);
    assert_eq!(client.get_balance_at(&token_index, &holder, &300).unwrap(), 1_750);

    // Query between ledgers (should return previous snapshot value)
    assert_eq!(client.get_balance_at(&token_index, &holder, &150).unwrap(), 1_000);
    assert_eq!(client.get_balance_at(&token_index, &holder, &250).unwrap(), 1_500);

    // Query before any snapshot
    assert_eq!(client.get_balance_at(&token_index, &holder, &50).unwrap(), 0);
}

#[test]
fn test_get_supply_at_historical_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    env.ledger().set_sequence_number(100);
    client.mint(&admin, &token_index, &holder, &1_000_000_i128);

    env.ledger().set_sequence_number(200);
    client.mint(&admin, &token_index, &holder, &500_000_i128);

    // Query supply at historical ledgers
    assert_eq!(client.get_supply_at(&token_index, &100).unwrap(), 1_000_000);
    assert_eq!(client.get_supply_at(&token_index, &200).unwrap(), 1_500_000);
    assert_eq!(client.get_supply_at(&token_index, &150).unwrap(), 1_000_000);
    assert_eq!(client.get_supply_at(&token_index, &50).unwrap(), 0);
}

#[test]
fn test_future_ledger_query_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    env.ledger().set_sequence_number(100);
    client.mint(&admin, &token_index, &holder, &1_000_i128);

    // Query future ledger must fail
    let result = client.try_get_balance_at(&token_index, &holder, &999);
    assert!(result.is_err(), "Future ledger query must be rejected");

    let result = client.try_get_supply_at(&token_index, &999);
    assert!(result.is_err(), "Future ledger query must be rejected");
}

#[test]
fn test_no_snapshots_returns_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);
    let token_index = 0_u32;

    env.ledger().set_sequence_number(100);

    // No mints/burns — should return 0
    assert_eq!(client.get_balance_at(&token_index, &holder, &100).unwrap(), 0);
    assert_eq!(client.get_supply_at(&token_index, &100).unwrap(), 0);
    assert_eq!(client.get_balance_snapshot_count(&token_index, &holder), 0);
    assert_eq!(client.get_supply_snapshot_count(&token_index), 0);
}

#[test]
fn test_multiple_holders_independent_snapshots() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder_a = Address::generate(&env);
    let holder_b = Address::generate(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    env.ledger().set_sequence_number(100);
    client.mint(&admin, &token_index, &holder_a, &1_000_i128);

    env.ledger().set_sequence_number(200);
    client.mint(&admin, &token_index, &holder_b, &2_000_i128);

    // Each holder has independent snapshot history
    assert_eq!(client.get_balance_snapshot_count(&token_index, &holder_a), 1);
    assert_eq!(client.get_balance_snapshot_count(&token_index, &holder_b), 1);

    assert_eq!(client.get_balance_at(&token_index, &holder_a, &100).unwrap(), 1_000);
    assert_eq!(client.get_balance_at(&token_index, &holder_b, &100).unwrap(), 0); // not yet minted
    assert_eq!(client.get_balance_at(&token_index, &holder_b, &200).unwrap(), 2_000);
}

#[test]
fn test_snapshot_count_increments_per_operation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    for i in 0..5_u32 {
        env.ledger().set_sequence_number(100 + i);
        client.mint(&admin, &token_index, &holder, &100_i128);
    }

    assert_eq!(client.get_balance_snapshot_count(&token_index, &holder), 5);
    assert_eq!(client.get_supply_snapshot_count(&token_index), 5);
}

#[test]
fn test_supply_snapshot_after_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );
    crate::storage::set_balance(&env, token_index, &admin, 1_000_000);

    env.ledger().set_sequence_number(100);
    client.burn(&admin, &token_index, &200_000_i128);

    env.ledger().set_sequence_number(200);
    client.burn(&admin, &token_index, &300_000_i128);

    // Supply snapshots reflect burns
    assert_eq!(client.get_supply_at(&token_index, &100).unwrap(), 800_000);
    assert_eq!(client.get_supply_at(&token_index, &200).unwrap(), 500_000);
    assert_eq!(client.get_supply_at(&token_index, &150).unwrap(), 800_000);
}

#[test]
fn test_get_balance_snapshot_by_index() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    env.ledger().set_sequence_number(100);
    client.mint(&admin, &token_index, &holder, &1_000_i128);
    env.ledger().set_sequence_number(200);
    client.mint(&admin, &token_index, &holder, &500_i128);

    let snap0 = client.get_balance_snapshot(&token_index, &holder, &0).unwrap();
    let snap1 = client.get_balance_snapshot(&token_index, &holder, &1).unwrap();

    assert_eq!(snap0.ledger, 100);
    assert_eq!(snap0.balance, 1_000);
    assert_eq!(snap1.ledger, 200);
    assert_eq!(snap1.balance, 1_500);

    // Out of bounds returns None
    assert!(client.get_balance_snapshot(&token_index, &holder, &99).is_none());
}

#[test]
fn test_get_supply_snapshot_by_index() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury) = setup(&env);
    let holder = Address::generate(&env);
    let token_index = 0_u32;

    crate::storage::set_token_info(
        &env,
        token_index,
        &crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: admin.clone(),
            name: soroban_sdk::String::from_str(&env, "SnapToken"),
            symbol: soroban_sdk::String::from_str(&env, "SNP"),
            decimals: 7,
            total_supply: 0,
            initial_supply: 0,
            max_supply: Some(10_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        },
    );

    env.ledger().set_sequence_number(100);
    client.mint(&admin, &token_index, &holder, &1_000_000_i128);
    env.ledger().set_sequence_number(200);
    client.mint(&admin, &token_index, &holder, &500_000_i128);

    let snap0 = client.get_supply_snapshot(&token_index, &0).unwrap();
    let snap1 = client.get_supply_snapshot(&token_index, &1).unwrap();

    assert_eq!(snap0.ledger, 100);
    assert_eq!(snap0.total_supply, 1_000_000);
    assert_eq!(snap1.ledger, 200);
    assert_eq!(snap1.total_supply, 1_500_000);

    // Out of bounds returns None
    assert!(client.get_supply_snapshot(&token_index, &99).is_none());
}
