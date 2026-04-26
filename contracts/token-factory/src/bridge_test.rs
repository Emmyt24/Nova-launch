//! Bridge integration tests (Issue #868)
//!
//! Covers:
//! - Successful lock and release flow
//! - Replay attack prevention (duplicate nonce rejected)
//! - Unauthorized release attempt fails
//! - Invalid inputs (zero amount, unknown chain) are rejected

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};

fn setup(env: &Env) -> (TokenFactoryClient, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    client.initialize(&admin, &treasury, &1_000_000i128, &500_000i128);
    (client, admin)
}

fn recipient(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[1u8; 32])
}

#[test]
fn test_bridge_lock_and_release_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin) = setup(&env);
    let caller = Address::generate(&env);
    let token = Address::generate(&env);
    let chain = Symbol::new(&env, "ethereum");

    // Lock tokens
    let nonce = client.lock_tokens(&caller, &token, &1000i128, &chain, &recipient(&env));
    assert_eq!(nonce, 0u64);

    // Status should be Pending
    let status = client.get_bridge_status(&nonce);
    assert_eq!(
        status,
        crate::types::BridgeStatus::Pending
    );

    // Release tokens
    let dest = Address::generate(&env);
    client.release_tokens(&admin, &token, &1000i128, &dest, &nonce);

    // Status should now be Completed
    let status = client.get_bridge_status(&nonce);
    assert_eq!(
        status,
        crate::types::BridgeStatus::Completed
    );
}

#[test]
fn test_bridge_nonce_increments() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let caller = Address::generate(&env);
    let token = Address::generate(&env);
    let chain = Symbol::new(&env, "polygon");

    let n0 = client.lock_tokens(&caller, &token, &100i128, &chain, &recipient(&env));
    let n1 = client.lock_tokens(&caller, &token, &200i128, &chain, &recipient(&env));
    assert_eq!(n0, 0u64);
    assert_eq!(n1, 1u64);
}

#[test]
fn test_bridge_replay_attack_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin) = setup(&env);
    let caller = Address::generate(&env);
    let token = Address::generate(&env);
    let chain = Symbol::new(&env, "bsc");
    let dest = Address::generate(&env);

    let nonce = client.lock_tokens(&caller, &token, &500i128, &chain, &recipient(&env));

    // First release succeeds
    client.release_tokens(&admin, &token, &500i128, &dest, &nonce);

    // Second release with same nonce must fail
    let result = client.try_release_tokens(&admin, &token, &500i128, &dest, &nonce);
    assert!(result.is_err());
}

#[test]
fn test_bridge_unauthorized_release_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let caller = Address::generate(&env);
    let token = Address::generate(&env);
    let chain = Symbol::new(&env, "ethereum");
    let dest = Address::generate(&env);

    let nonce = client.lock_tokens(&caller, &token, &100i128, &chain, &recipient(&env));

    // Non-admin tries to release
    let non_admin = Address::generate(&env);
    let result = client.try_release_tokens(&non_admin, &token, &100i128, &dest, &nonce);
    assert!(result.is_err());
}

#[test]
fn test_bridge_zero_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let caller = Address::generate(&env);
    let token = Address::generate(&env);
    let chain = Symbol::new(&env, "ethereum");

    let result = client.try_lock_tokens(&caller, &token, &0i128, &chain, &recipient(&env));
    assert!(result.is_err());
}

#[test]
fn test_bridge_unknown_chain_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let caller = Address::generate(&env);
    let token = Address::generate(&env);
    let unknown = Symbol::new(&env, "solana");

    let result = client.try_lock_tokens(&caller, &token, &100i128, &unknown, &recipient(&env));
    assert!(result.is_err());
}

#[test]
fn test_bridge_status_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);

    let result = client.try_get_bridge_status(&999u64);
    assert!(result.is_err());
}
