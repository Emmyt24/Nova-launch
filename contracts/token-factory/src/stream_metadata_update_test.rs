#![cfg(test)]

use crate::events;
use crate::stream_types::{validate_metadata, validate_financial_invariants, StreamInfo};
use crate::types::Error;
use soroban_sdk::{testutils::{Address as _, Events}, Address, Env, String};

// ============================================================
// ALLOWED METADATA UPDATES - Tests for valid operations
// ============================================================

#[test]
fn test_update_metadata_from_none_to_value() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    // Original stream with no metadata
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Updated stream with metadata
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, "ipfs://QmTest123")),
        created_at: env.ledger().timestamp(),
    };
    
    // Financial invariants should pass
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    // Metadata should be valid
    assert!(validate_metadata(&updated.metadata).is_ok());
}

#[test]
fn test_update_metadata_from_value_to_different_value() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    // Original stream with metadata
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, "Old metadata")),
        created_at: env.ledger().timestamp(),
    };
    
    // Updated stream with different metadata
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, "New metadata")),
        created_at: env.ledger().timestamp(),
    };
    
    // Financial invariants should pass
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    // Both metadata values should be valid
    assert!(validate_metadata(&original.metadata).is_ok());
    assert!(validate_metadata(&updated.metadata).is_ok());
}

#[test]
fn test_update_metadata_from_value_to_none() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    // Original stream with metadata
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, "ipfs://QmTest123")),
        created_at: env.ledger().timestamp(),
    };
    
    // Updated stream with no metadata (cleared)
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Financial invariants should pass
    assert!(validate_financial_invariants(&original, &updated).is_ok());
}

#[test]
fn test_update_metadata_max_length_valid() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let max_metadata = "a".repeat(512);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, &max_metadata)),
        created_at: env.ledger().timestamp(),
    };
    
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    assert!(validate_metadata(&updated.metadata).is_ok());
}

#[test]
fn test_update_metadata_boundary_1_char() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, "x")),
        created_at: env.ledger().timestamp(),
    };
    
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    assert!(validate_metadata(&updated.metadata).is_ok());
}

#[test]
fn test_update_metadata_ipfs_uri() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let ipfs_uri = "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, ipfs_uri)),
        created_at: env.ledger().timestamp(),
    };
    
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    assert!(validate_metadata(&updated.metadata).is_ok());
}

#[test]
fn test_update_metadata_human_readable_label() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let label = "Monthly salary payment - March 2026";
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, label)),
        created_at: env.ledger().timestamp(),
    };
    
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    assert!(validate_metadata(&updated.metadata).is_ok());
}

// ============================================================
// DISALLOWED FINANCIAL MUTATIONS - Tests for invalid operations
// ============================================================

#[test]
fn test_cannot_mutate_amount() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Attempt to change amount
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 2000,  // CHANGED - should fail
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    assert_eq!(
        validate_financial_invariants(&original, &updated),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn test_cannot_mutate_creator() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let other = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Attempt to change creator
    let updated = StreamInfo {
        id: 1,
        creator: other,  // CHANGED - should fail
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    assert_eq!(
        validate_financial_invariants(&original, &updated),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn test_cannot_mutate_recipient() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let other = Address::generate(&env);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Attempt to change recipient
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: other,  // CHANGED - should fail
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    assert_eq!(
        validate_financial_invariants(&original, &updated),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn test_cannot_mutate_created_at() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let timestamp = env.ledger().timestamp();
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: timestamp,
    };
    
    // Attempt to change created_at
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: timestamp + 3600,  // CHANGED - should fail
    };
    
    assert_eq!(
        validate_financial_invariants(&original, &updated),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn test_cannot_mutate_stream_id() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Attempt to change stream ID
    let updated = StreamInfo {
        id: 2,  // CHANGED - should fail
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    assert_eq!(
        validate_financial_invariants(&original, &updated),
        Err(Error::InvalidParameters)
    );
}

// ============================================================
// INVALID METADATA MUTATIONS - Tests for metadata validation
// ============================================================

#[test]
fn test_cannot_set_empty_string_metadata() {
    let env = Env::default();
    let metadata = Some(String::from_str(&env, ""));
    
    assert_eq!(
        validate_metadata(&metadata),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn test_cannot_set_metadata_exceeding_max_length() {
    let env = Env::default();
    let too_long = "a".repeat(513);
    let metadata = Some(String::from_str(&env, &too_long));
    
    assert_eq!(
        validate_metadata(&metadata),
        Err(Error::InvalidParameters)
    );
}

#[test]
fn test_cannot_update_with_invalid_metadata() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Attempt to update with empty string metadata
    let updated = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: Some(String::from_str(&env, "")),
        created_at: env.ledger().timestamp(),
    };
    
    // Financial invariants pass, but metadata validation fails
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    assert_eq!(validate_metadata(&updated.metadata), Err(Error::InvalidParameters));
}

// ============================================================
// COMBINED INVARIANT TESTS - Multiple constraints together
// ============================================================

#[test]
fn test_metadata_update_with_all_financial_terms_locked() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let timestamp = env.ledger().timestamp();
    
    let original = StreamInfo {
        id: 42,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 5_000_000_000,
        metadata: Some(String::from_str(&env, "Old label")),
        created_at: timestamp,
    };
    
    // Only metadata changes
    let updated = StreamInfo {
        id: 42,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 5_000_000_000,
        metadata: Some(String::from_str(&env, "New label")),
        created_at: timestamp,
    };
    
    // All invariants should pass
    assert!(validate_financial_invariants(&original, &updated).is_ok());
    assert!(validate_metadata(&original.metadata).is_ok());
    assert!(validate_metadata(&updated.metadata).is_ok());
}

#[test]
fn test_cannot_change_multiple_financial_terms() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let other = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let original = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Attempt to change both amount and creator
    let updated = StreamInfo {
        id: 1,
        creator: other,  // CHANGED
        recipient: recipient.clone(),
        amount: 2000,  // CHANGED
        metadata: None,
        created_at: env.ledger().timestamp(),
    };
    
    // Should fail on first invariant violation (amount)
    assert_eq!(
        validate_financial_invariants(&original, &updated),
        Err(Error::InvalidParameters)
    );
}

// ============================================================
// EVENT EMISSION TESTS - Verify metadata update events
// ============================================================

#[test]
fn test_stream_metadata_updated_event_with_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let updater = Address::generate(&env);
    
    // Event emission should not panic
    events::emit_stream_metadata_updated(&env, 1, &updater, true);
}

#[test]
fn test_stream_metadata_updated_event_without_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let updater = Address::generate(&env);
    
    // Event emission should not panic
    events::emit_stream_metadata_updated(&env, 1, &updater, false);
}

#[test]
fn test_stream_created_event_with_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    // Event emission should not panic
    events::emit_stream_created(&env, 1, &creator, &recipient, 1000, true);
}

#[test]
fn test_stream_created_event_without_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    // Event emission should not panic
    events::emit_stream_created(&env, 1, &creator, &recipient, 1000, false);
}
