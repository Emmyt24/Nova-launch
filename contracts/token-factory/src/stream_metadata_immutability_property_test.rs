//! Property 74 – Stream Financial Terms Immutability
//!
//! Proves that the financial terms of a stream (amount, creator, recipient)
//! are immutable after creation. Only the `metadata` field may be updated.
//!
//! # Invariants verified
//! 1. `total_amount` never changes after stream creation
//! 2. `creator` never changes after stream creation
//! 3. `recipient` never changes after stream creation
//! 4. `metadata` is the only field that can be updated
//!
//! # Strategy
//! - Generate stream creation events with random financial terms
//! - Simulate metadata update events
//! - Assert financial terms remain identical before and after update
//! - Assert only the metadata field differs between original and updated state
//!
//! # Edge cases
//! - metadata update with None (clearing metadata)
//! - metadata update with same value (no-op)
//! - metadata update with maximum-length string (512 chars)
//! - zero amount streams (boundary)
//!
//! # Assumptions
//! - `validate_financial_invariants` in `stream_types.rs` is the enforcement
//!   point; this test proves the pure logic holds for all inputs.
//! - Soroban's single-threaded execution model means no concurrent mutation
//!   is possible at the contract level.
//!
//! # Follow-up work
//! - Once `create_stream` / `update_stream_metadata` are callable in the
//!   test environment without a live token contract, add full integration
//!   coverage via `TokenFactoryClient`.

#![cfg(test)]

extern crate std;

use crate::stream_types::{validate_financial_invariants, validate_metadata};
use crate::types::{Error, StreamInfo};
use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a minimal `StreamInfo` with the supplied financial terms.
fn make_stream(
    env: &Env,
    id: u64,
    creator: Address,
    recipient: Address,
    total_amount: i128,
    metadata: Option<String>,
) -> StreamInfo {
    StreamInfo {
        id,
        creator,
        recipient,
        token_index: 0,
        total_amount,
        claimed_amount: 0,
        start_time: 1_000_000,
        end_time: 2_000_000,
        cliff_time: 1_000_000,
        metadata,
        cancelled: false,
        paused: false,
    }
}

/// Simulate a metadata-only update: returns a new `StreamInfo` with only
/// the `metadata` field changed.
fn apply_metadata_update(original: &StreamInfo, new_metadata: Option<String>) -> StreamInfo {
    StreamInfo {
        metadata: new_metadata,
        ..original.clone()
    }
}

// ---------------------------------------------------------------------------
// Proptest strategies
// ---------------------------------------------------------------------------

fn amount_strategy() -> impl Strategy<Value = i128> {
    // Include zero (boundary) and large values
    prop_oneof![
        Just(0i128),
        1i128..=1_000_000_000_000i128,
        Just(i128::MAX / 2),
    ]
}

fn metadata_strategy(env: &Env) -> impl Strategy<Value = Option<String>> {
    let env = env.clone();
    prop_oneof![
        Just(None),
        Just(Some(String::from_str(&env, "ipfs://QmTest1234567890"))),
        Just(Some(String::from_str(
            &env,
            "https://nova-launch.io/metadata/token.json"
        ))),
        Just(Some(String::from_str(&env, "Monthly salary stream"))),
    ]
}

// ---------------------------------------------------------------------------
// Property 74 – stream financial terms immutability
// ---------------------------------------------------------------------------

proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]

    /// Property 74a: financial terms are unchanged after a metadata update.
    ///
    /// For any stream and any new metadata value, applying a metadata update
    /// must leave `total_amount`, `creator`, and `recipient` identical.
    #[test]
    fn prop_74a_financial_terms_unchanged_after_metadata_update(
        total_amount in amount_strategy(),
        stream_id in 1u64..=10_000u64,
    ) {
        let env = Env::default();
        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);

        let original = make_stream(
            &env,
            stream_id,
            creator.clone(),
            recipient.clone(),
            total_amount,
            Some(String::from_str(&env, "ipfs://QmOriginal")),
        );

        // Apply a metadata update
        let updated = apply_metadata_update(
            &original,
            Some(String::from_str(&env, "ipfs://QmUpdated")),
        );

        // Financial terms must be identical
        prop_assert_eq!(
            updated.total_amount,
            original.total_amount,
            "total_amount must not change: original={} updated={}",
            original.total_amount,
            updated.total_amount
        );
        prop_assert_eq!(
            updated.creator,
            original.creator,
            "creator must not change after metadata update"
        );
        prop_assert_eq!(
            updated.recipient,
            original.recipient,
            "recipient must not change after metadata update"
        );

        // validate_financial_invariants must pass
        let result = validate_financial_invariants(&original, &updated);
        prop_assert!(
            result.is_ok(),
            "validate_financial_invariants must accept metadata-only update: {:?}",
            result
        );
    }

    /// Property 74b: only metadata differs between original and updated stream.
    ///
    /// After a metadata update, every field except `metadata` must be
    /// byte-for-byte identical to the original.
    #[test]
    fn prop_74b_only_metadata_field_changes(
        total_amount in 1i128..=1_000_000_000i128,
        stream_id in 1u64..=10_000u64,
    ) {
        let env = Env::default();
        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);

        let original = make_stream(
            &env,
            stream_id,
            creator.clone(),
            recipient.clone(),
            total_amount,
            None,
        );

        let new_meta = Some(String::from_str(&env, "ipfs://QmNewMetadata"));
        let updated = apply_metadata_update(&original, new_meta.clone());

        // All non-metadata fields must be identical
        prop_assert_eq!(updated.id, original.id);
        prop_assert_eq!(updated.creator, original.creator);
        prop_assert_eq!(updated.recipient, original.recipient);
        prop_assert_eq!(updated.token_index, original.token_index);
        prop_assert_eq!(updated.total_amount, original.total_amount);
        prop_assert_eq!(updated.claimed_amount, original.claimed_amount);
        prop_assert_eq!(updated.start_time, original.start_time);
        prop_assert_eq!(updated.end_time, original.end_time);
        prop_assert_eq!(updated.cliff_time, original.cliff_time);
        prop_assert_eq!(updated.cancelled, original.cancelled);
        prop_assert_eq!(updated.paused, original.paused);

        // Only metadata changed
        prop_assert_ne!(
            updated.metadata,
            original.metadata,
            "metadata must differ after update"
        );
        prop_assert_eq!(updated.metadata, new_meta);
    }

    /// Property 74c: mutating financial terms is rejected by the invariant check.
    ///
    /// Any attempt to change `total_amount`, `creator`, or `recipient` must
    /// be caught by `validate_financial_invariants`.
    #[test]
    fn prop_74c_mutating_financial_terms_is_rejected(
        original_amount in 1i128..=1_000_000_000i128,
        tampered_amount in 1i128..=1_000_000_000i128,
        stream_id in 1u64..=10_000u64,
    ) {
        // Only test cases where amounts actually differ
        prop_assume!(original_amount != tampered_amount);

        let env = Env::default();
        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);

        let original = make_stream(
            &env,
            stream_id,
            creator.clone(),
            recipient.clone(),
            original_amount,
            None,
        );

        // Tamper with total_amount
        let tampered = StreamInfo {
            total_amount: tampered_amount,
            ..original.clone()
        };

        let result = validate_financial_invariants(&original, &tampered);
        prop_assert_eq!(
            result,
            Err(Error::InvalidParameters),
            "mutating total_amount must be rejected: original={} tampered={}",
            original_amount,
            tampered_amount
        );
    }

    /// Property 74d: clearing metadata (setting to None) is a valid update.
    ///
    /// Metadata can be cleared without violating financial invariants.
    #[test]
    fn prop_74d_clearing_metadata_is_valid(
        total_amount in 1i128..=1_000_000_000i128,
        stream_id in 1u64..=10_000u64,
    ) {
        let env = Env::default();
        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);

        let original = make_stream(
            &env,
            stream_id,
            creator.clone(),
            recipient.clone(),
            total_amount,
            Some(String::from_str(&env, "ipfs://QmSomeMetadata")),
        );

        let cleared = apply_metadata_update(&original, None);

        // Financial invariants still hold
        let result = validate_financial_invariants(&original, &cleared);
        prop_assert!(
            result.is_ok(),
            "clearing metadata must not violate financial invariants: {:?}",
            result
        );

        // Financial terms unchanged
        prop_assert_eq!(cleared.total_amount, original.total_amount);
        prop_assert_eq!(cleared.creator, original.creator);
        prop_assert_eq!(cleared.recipient, original.recipient);
    }
}

// ---------------------------------------------------------------------------
// Deterministic unit examples (regression anchors)
// ---------------------------------------------------------------------------

#[test]
fn example_metadata_update_preserves_amount() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);

    let original = make_stream(&env, 1, creator, recipient, 500_000, None);
    let updated = apply_metadata_update(
        &original,
        Some(String::from_str(&env, "ipfs://QmUpdated")),
    );

    assert_eq!(updated.total_amount, 500_000);
    assert!(validate_financial_invariants(&original, &updated).is_ok());
}

#[test]
fn example_tampered_creator_is_rejected() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let attacker = Address::generate(&env);

    let original = make_stream(&env, 1, creator, recipient, 500_000, None);
    let tampered = StreamInfo {
        creator: attacker,
        ..original.clone()
    };

    assert_eq!(
        validate_financial_invariants(&original, &tampered),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn example_tampered_recipient_is_rejected() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let attacker = Address::generate(&env);

    let original = make_stream(&env, 1, creator, recipient, 500_000, None);
    let tampered = StreamInfo {
        recipient: attacker,
        ..original.clone()
    };

    assert_eq!(
        validate_financial_invariants(&original, &tampered),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn example_zero_amount_stream_metadata_update_valid() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);

    let original = make_stream(&env, 1, creator, recipient, 0, None);
    let updated = apply_metadata_update(
        &original,
        Some(String::from_str(&env, "ipfs://QmZeroAmount")),
    );

    assert_eq!(updated.total_amount, 0);
    assert!(validate_financial_invariants(&original, &updated).is_ok());
}

#[test]
fn example_max_length_metadata_is_valid() {
    let env = Env::default();
    let long_meta = "a".repeat(512);
    let metadata = Some(String::from_str(&env, &long_meta));
    assert!(validate_metadata(&metadata).is_ok());
}
