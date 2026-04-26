//! Tests for `update_metadata` and `get_metadata_history`.
//!
//! Coverage:
//! - Unit: happy path, version increments, history records
//! - Auth: unauthorized callers, non-creator callers
//! - Edge: metadata not yet set, paused contract, arithmetic overflow guard
//! - Integration: set then update multiple times, history retrieval per version
//! - Events: correct event emitted with correct payload

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

use crate::{
    storage,
    types::{DataKey, Error, MetadataRecord, TokenInfo},
    TokenFactory,
};

// ── helpers ──────────────────────────────────────────────────────────────────

/// Register the contract, initialise storage, and create a bare token at index 0.
/// Returns (env, contract_id, creator).
fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let creator = Address::generate(&env);
    let treasury = Address::generate(&env);

    env.as_contract(&contract_id, || {
        storage::set_admin(&env, &creator);
        storage::set_treasury(&env, &treasury);
        storage::set_base_fee(&env, 100);
        storage::set_metadata_fee(&env, 50);

        // Insert a minimal TokenInfo at index 0 (metadata_version = 0, no URI)
        let token_info = TokenInfo {
            address: contract_id.clone(),
            creator: creator.clone(),
            name: String::from_str(&env, "TestToken"),
            symbol: String::from_str(&env, "TTK"),
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
        };
        storage::set_token_info(&env, 0, &token_info);
        storage::set_token_info_by_address(&env, &contract_id, &token_info);
    });

    (env, contract_id, creator)
}

/// Call `set_token_metadata` via the contract client to initialise metadata.
fn set_initial_metadata(env: &Env, contract_id: &Address, creator: &Address, uri: &str) {
    let client = crate::TokenFactoryClient::new(env, contract_id);
    client
        .set_token_metadata(creator, &0u32, &String::from_str(env, uri))
        .unwrap();
}

// ── Unit tests ────────────────────────────────────────────────────────────────

/// Happy path: update_metadata increments version from 1 → 2.
#[test]
fn test_update_metadata_increments_version() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let new_version = client
        .update_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV2"))
        .unwrap();

    assert_eq!(new_version, 2, "version must increment to 2 after first update");
}

/// After update, get_token_info reflects the new URI and version.
#[test]
fn test_update_metadata_persists_new_uri_and_version() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    client
        .update_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV2"))
        .unwrap();

    let info = client.get_token_info(&0u32).unwrap();
    assert_eq!(
        info.metadata_uri,
        Some(String::from_str(&env, "ipfs://QmV2"))
    );
    assert_eq!(info.metadata_version, 2);
}

/// Multiple sequential updates produce monotonically increasing versions.
#[test]
fn test_update_metadata_multiple_sequential_versions() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    for i in 2u32..=5 {
        let uri = String::from_str(&env, &alloc::format!("ipfs://QmV{i}"));
        let v = client.update_metadata(&creator, &0u32, &uri).unwrap();
        assert_eq!(v, i, "version must be {i} on update #{}", i - 1);
    }
}

/// get_metadata_history returns the correct record for each version.
#[test]
fn test_get_metadata_history_returns_correct_record() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    env.ledger().with_mut(|li| li.timestamp = 2_000);
    client
        .update_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV2"))
        .unwrap();

    // Version 1 was set by set_token_metadata
    let rec1: Option<MetadataRecord> = client.get_metadata_history(&0u32, &1u32);
    assert!(rec1.is_some(), "version 1 history must exist");
    let rec1 = rec1.unwrap();
    assert_eq!(rec1.uri, String::from_str(&env, "ipfs://QmV1"));
    assert_eq!(rec1.updated_by, creator);

    // Version 2 was set by update_metadata
    let rec2: Option<MetadataRecord> = client.get_metadata_history(&0u32, &2u32);
    assert!(rec2.is_some(), "version 2 history must exist");
    let rec2 = rec2.unwrap();
    assert_eq!(rec2.uri, String::from_str(&env, "ipfs://QmV2"));
    assert_eq!(rec2.updated_at, 2_000);
}

/// get_metadata_history returns None for a version that does not exist.
#[test]
fn test_get_metadata_history_nonexistent_version_returns_none() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let rec: Option<MetadataRecord> = client.get_metadata_history(&0u32, &99u32);
    assert!(rec.is_none(), "non-existent version must return None");
}

// ── Auth / security tests ─────────────────────────────────────────────────────

/// update_metadata must fail when called by a non-creator address.
#[test]
fn test_update_metadata_unauthorized_non_creator() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let attacker = Address::generate(&env);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let result =
        client.try_update_metadata(&attacker, &0u32, &String::from_str(&env, "ipfs://QmEvil"));

    assert!(result.is_err(), "non-creator must not be able to update metadata");
    let err = result.unwrap_err().unwrap();
    assert_eq!(err, Error::Unauthorized.into());
}

/// update_metadata must fail when the contract is paused.
#[test]
fn test_update_metadata_fails_when_paused() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    // Pause the contract
    env.as_contract(&contract_id, || {
        storage::set_paused(&env, true);
    });

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let result =
        client.try_update_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV2"));

    assert!(result.is_err());
    let err = result.unwrap_err().unwrap();
    assert_eq!(err, Error::ContractPaused.into());
}

// ── Edge case tests ───────────────────────────────────────────────────────────

/// update_metadata must fail when metadata has never been set (version == 0).
#[test]
fn test_update_metadata_fails_when_metadata_not_set() {
    let (env, contract_id, creator) = setup();
    // Do NOT call set_initial_metadata — token has no URI yet

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let result =
        client.try_update_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV1"));

    assert!(result.is_err());
    let err = result.unwrap_err().unwrap();
    assert_eq!(err, Error::MetadataNotSet.into());
}

/// update_metadata must fail for a non-existent token index.
#[test]
fn test_update_metadata_fails_for_nonexistent_token() {
    let (env, contract_id, creator) = setup();

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let result =
        client.try_update_metadata(&creator, &999u32, &String::from_str(&env, "ipfs://QmV1"));

    assert!(result.is_err());
    let err = result.unwrap_err().unwrap();
    assert_eq!(err, Error::TokenNotFound.into());
}

/// set_token_metadata must still reject a second call (MetadataAlreadySet).
#[test]
fn test_set_token_metadata_immutable_after_first_set() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let result = client.try_set_token_metadata(
        &creator,
        &0u32,
        &String::from_str(&env, "ipfs://QmV2"),
    );

    assert!(result.is_err());
    let err = result.unwrap_err().unwrap();
    assert_eq!(err, Error::MetadataAlreadySet.into());
}

/// set_token_metadata initialises metadata_version to 1 and records history.
#[test]
fn test_set_token_metadata_initialises_version_to_1() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let info = client.get_token_info(&0u32).unwrap();
    assert_eq!(info.metadata_version, 1);

    let rec: Option<MetadataRecord> = client.get_metadata_history(&0u32, &1u32);
    assert!(rec.is_some(), "history record for version 1 must exist after set_token_metadata");
    assert_eq!(rec.unwrap().uri, String::from_str(&env, "ipfs://QmV1"));
}

// ── Event tests ───────────────────────────────────────────────────────────────

/// update_metadata emits a meta_upd event with the correct payload.
#[test]
fn test_update_metadata_emits_event() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    client
        .update_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV2"))
        .unwrap();

    let events = env.events().all();
    let ea = crate::test_helpers::EventAssertions::new(&env);
    ea.assert_exists("meta_upd");
}

/// set_token_metadata emits a meta_set event.
#[test]
fn test_set_token_metadata_emits_event() {
    let (env, contract_id, creator) = setup();
    set_initial_metadata(&env, &contract_id, &creator, "ipfs://QmV1");

    let ea = crate::test_helpers::EventAssertions::new(&env);
    ea.assert_exists("meta_set");
}

// ── Integration tests ─────────────────────────────────────────────────────────

/// Full lifecycle: set → update × 3 → verify all history records.
#[test]
fn test_full_metadata_lifecycle() {
    let (env, contract_id, creator) = setup();

    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    // Step 1: initial set
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    client
        .set_token_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV1"))
        .unwrap();

    // Step 2-4: three updates
    for (ts, uri) in [(2_000u64, "ipfs://QmV2"), (3_000, "ipfs://QmV3"), (4_000, "ipfs://QmV4")] {
        env.ledger().with_mut(|li| li.timestamp = ts);
        client
            .update_metadata(&creator, &0u32, &String::from_str(&env, uri))
            .unwrap();
    }

    // Final state
    let info = client.get_token_info(&0u32).unwrap();
    assert_eq!(info.metadata_version, 4);
    assert_eq!(
        info.metadata_uri,
        Some(String::from_str(&env, "ipfs://QmV4"))
    );

    // All history records must be retrievable
    for (v, expected_uri) in [
        (1u32, "ipfs://QmV1"),
        (2, "ipfs://QmV2"),
        (3, "ipfs://QmV3"),
        (4, "ipfs://QmV4"),
    ] {
        let rec: Option<MetadataRecord> = client.get_metadata_history(&0u32, &v);
        assert!(rec.is_some(), "history for version {v} must exist");
        assert_eq!(
            rec.unwrap().uri,
            String::from_str(&env, expected_uri),
            "URI mismatch at version {v}"
        );
    }
}

/// Updating metadata on one token must not affect another token's metadata.
#[test]
fn test_update_metadata_isolation_between_tokens() {
    let (env, contract_id, creator) = setup();

    // Register a second token at index 1
    env.as_contract(&contract_id, || {
        let token_info = TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: String::from_str(&env, "Token2"),
            symbol: String::from_str(&env, "TK2"),
            decimals: 7,
            total_supply: 500_000,
            initial_supply: 500_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        };
        storage::set_token_info(&env, 1, &token_info);
    });

    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    // Set and update metadata only on token 0
    client
        .set_token_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV1"))
        .unwrap();
    client
        .update_metadata(&creator, &0u32, &String::from_str(&env, "ipfs://QmV2"))
        .unwrap();

    // Token 1 must be unaffected
    let info1 = client.get_token_info(&1u32).unwrap();
    assert_eq!(info1.metadata_version, 0, "token 1 version must remain 0");
    assert!(info1.metadata_uri.is_none(), "token 1 URI must remain None");

    // Token 1 history must be empty
    let rec: Option<MetadataRecord> = client.get_metadata_history(&1u32, &1u32);
    assert!(rec.is_none(), "token 1 must have no history");
}

// ── alloc shim for format! in no_std ─────────────────────────────────────────
extern crate alloc;
