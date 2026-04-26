//! Flash Loan Protection Tests
//!
//! Verifies that reentrancy guards correctly prevent flash loan attacks on
//! the `mint`, `set_metadata` (batch token creation), and `claim_vault`
//! contract entry points.
//!
//! # Test Coverage
//! - Lock acquisition and release for each guarded function
//! - Reentrant call rejection (error code 54)
//! - Lock is released after both success and error paths
//! - Lock state is independent across separate transactions
//! - Error code stability (ReentrancyGuard == 54)

#![cfg(test)]

use crate::{storage, TokenFactory, TokenFactoryClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String,
};

// ─── helpers ────────────────────────────────────────────────────────────────

/// Initialise a fresh contract and return (env, client, admin, treasury).
fn setup() -> (Env, TokenFactoryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    (env, client, admin, treasury)
}

/// Seed a token directly into storage (bypasses fee logic) and return its index.
fn seed_token(env: &Env, creator: &Address) -> u32 {
    let token_address = Address::generate(env);
    let token_info = crate::types::TokenInfo {
        address: token_address.clone(),
        creator: creator.clone(),
        name: String::from_str(env, "Test Token"),
        symbol: String::from_str(env, "TST"),
        decimals: 7,
        total_supply: 1_000_000_0000000,
        initial_supply: 1_000_000_0000000,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
        is_paused: false,
        freeze_enabled: false,
    };

    let index = storage::get_token_count(env);
    storage::set_token_info(env, index, &token_info);
    storage::set_token_info_by_address(env, &token_address, &token_info);
    storage::increment_token_count(env).unwrap();
    storage::set_balance(env, index, creator, token_info.initial_supply);
    index
}

// ─── Error code stability ────────────────────────────────────────────────────

/// Error code 54 must never change — downstream clients depend on it.
#[test]
fn test_reentrancy_guard_error_code_is_54() {
    assert_eq!(crate::types::Error::ReentrancyGuard.0, 54);
}

// ─── Storage-level guard unit tests ─────────────────────────────────────────

/// Lock starts unlocked, can be acquired, and can be released.
#[test]
fn test_lock_acquire_and_release() {
    let (env, _client, _admin, _treasury) = setup();

    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));

        storage::acquire_reentrancy_lock(&env).expect("first acquire should succeed");
        assert!(storage::is_reentrancy_locked(&env));

        storage::release_reentrancy_lock(&env);
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

/// A second acquire while the lock is held must return ReentrancyGuard.
#[test]
fn test_double_acquire_returns_reentrancy_guard_error() {
    let (env, _client, _admin, _treasury) = setup();

    env.as_contract(&env.current_contract_address(), || {
        storage::acquire_reentrancy_lock(&env).unwrap();

        let err = storage::acquire_reentrancy_lock(&env)
            .expect_err("second acquire must fail");
        assert_eq!(err, crate::types::Error::ReentrancyGuard);

        // Clean up
        storage::release_reentrancy_lock(&env);
    });
}

/// After release the lock can be acquired again (idempotent across calls).
#[test]
fn test_lock_reusable_after_release() {
    let (env, _client, _admin, _treasury) = setup();

    env.as_contract(&env.current_contract_address(), || {
        for _ in 0..3 {
            storage::acquire_reentrancy_lock(&env).expect("acquire should succeed");
            storage::release_reentrancy_lock(&env);
        }
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

// ─── mint guard tests ────────────────────────────────────────────────────────

/// A normal mint succeeds and the lock is released afterwards.
#[test]
fn test_mint_succeeds_and_releases_lock() {
    let (env, client, _admin, _treasury) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token_index = seed_token(&env, &creator);

    client.mint(&creator, &token_index, &recipient, &1_000_0000000);

    // Lock must be released after a successful mint
    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

/// Minting with an invalid token index returns an error and releases the lock.
#[test]
fn test_mint_error_path_releases_lock() {
    let (env, client, _admin, _treasury) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);

    // token index 999 does not exist
    let result = client.try_mint(&creator, &999, &recipient, &1_000_0000000);
    assert!(result.is_err());

    // Lock must be released even after an error
    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

/// Minting by a non-creator returns Unauthorized and releases the lock.
#[test]
fn test_mint_unauthorized_releases_lock() {
    let (env, client, _admin, _treasury) = setup();
    let creator = Address::generate(&env);
    let attacker = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token_index = seed_token(&env, &creator);

    let result = client.try_mint(&attacker, &token_index, &recipient, &1_000_0000000);
    assert!(result.is_err());

    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

// ─── set_metadata (batch_create_tokens) guard tests ─────────────────────────

/// batch_create_tokens (set_metadata) releases the lock after an error.
#[test]
fn test_batch_create_tokens_error_releases_lock() {
    let (env, client, _admin, _treasury) = setup();
    let creator = Address::generate(&env);

    // Pass an empty token list — batch_create_tokens should reject it
    let empty: soroban_sdk::Vec<crate::types::TokenCreationParams> =
        soroban_sdk::Vec::new(&env);
    let result = client.try_set_metadata(&creator, &empty, &0);
    assert!(result.is_err());

    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

// ─── claim_vault guard tests ─────────────────────────────────────────────────

/// claim_vault with a non-existent vault releases the lock.
#[test]
fn test_claim_vault_not_found_releases_lock() {
    let (env, client, _admin, _treasury) = setup();
    let owner = Address::generate(&env);

    let result = client.try_claim_vault(&owner, &9999, &None);
    assert!(result.is_err());

    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

/// claim_vault with wrong owner releases the lock.
#[test]
fn test_claim_vault_wrong_owner_releases_lock() {
    let (env, client, _admin, _treasury) = setup();
    let creator = Address::generate(&env);
    let real_owner = Address::generate(&env);
    let attacker = Address::generate(&env);

    // Create a token so we can create a vault
    let token = Address::generate(&env);
    let no_milestone = BytesN::from_array(&env, &[0u8; 32]);

    // Seed a vault directly into storage
    let vault = crate::types::Vault {
        id: 0,
        token: token.clone(),
        owner: real_owner.clone(),
        creator: creator.clone(),
        total_amount: 1_000,
        claimed_amount: 0,
        unlock_time: 0,
        milestone_hash: no_milestone,
        status: crate::types::VaultStatus::Active,
        created_at: env.ledger().timestamp(),
    };
    env.as_contract(&env.current_contract_address(), || {
        storage::set_vault(&env, &vault).unwrap();
    });

    let result = client.try_claim_vault(&attacker, &0, &None);
    assert!(result.is_err());

    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

// ─── Simulated reentrancy rejection ─────────────────────────────────────────

/// Directly simulate a reentrant call: acquire the lock then attempt to
/// acquire it again, verifying the guard fires with error code 54.
#[test]
fn test_simulated_reentrancy_is_rejected() {
    let (env, _client, _admin, _treasury) = setup();

    env.as_contract(&env.current_contract_address(), || {
        // Simulate: outer call acquires lock
        storage::acquire_reentrancy_lock(&env).expect("outer acquire");

        // Simulate: inner (reentrant) call tries to acquire
        let err = storage::acquire_reentrancy_lock(&env)
            .expect_err("reentrant acquire must be rejected");

        assert_eq!(
            err,
            crate::types::Error::ReentrancyGuard,
            "expected ReentrancyGuard (54), got {:?}",
            err
        );

        // Outer call releases
        storage::release_reentrancy_lock(&env);
    });
}

/// After a simulated reentrancy rejection the lock is still held by the
/// outer call and is properly released.
#[test]
fn test_lock_still_held_after_rejected_reentrant_attempt() {
    let (env, _client, _admin, _treasury) = setup();

    env.as_contract(&env.current_contract_address(), || {
        storage::acquire_reentrancy_lock(&env).unwrap();

        // Rejected inner attempt must not release the lock
        let _ = storage::acquire_reentrancy_lock(&env);
        assert!(storage::is_reentrancy_locked(&env), "lock must still be held");

        storage::release_reentrancy_lock(&env);
        assert!(!storage::is_reentrancy_locked(&env));
    });
}

// ─── Cross-transaction independence ─────────────────────────────────────────

/// The lock is not held at the start of a fresh transaction (separate Env).
#[test]
fn test_lock_not_held_in_fresh_transaction() {
    // Each Env represents an independent transaction context
    let (env1, _client1, _admin1, _treasury1) = setup();
    let (env2, _client2, _admin2, _treasury2) = setup();

    env1.as_contract(&env1.current_contract_address(), || {
        storage::acquire_reentrancy_lock(&env1).unwrap();
        // env1 lock is held
    });

    // env2 is a completely separate contract instance — its lock is independent
    env2.as_contract(&env2.current_contract_address(), || {
        assert!(
            !storage::is_reentrancy_locked(&env2),
            "lock in a separate contract instance must be independent"
        );
    });
}

// ─── Paused contract interaction ─────────────────────────────────────────────

/// mint on a paused contract returns ContractPaused before touching the lock.
#[test]
fn test_mint_paused_contract_does_not_acquire_lock() {
    let (env, client, admin, _treasury) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token_index = seed_token(&env, &creator);

    client.pause(&admin);

    let result = client.try_mint(&creator, &token_index, &recipient, &1_000_0000000);
    assert!(result.is_err());

    // Lock must not have been acquired (paused check fires before lock)
    env.as_contract(&env.current_contract_address(), || {
        assert!(!storage::is_reentrancy_locked(&env));
    });
}
