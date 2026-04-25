#![cfg(test)]

use crate::events;
use crate::stream_types::{validate_metadata, StreamInfo};
use crate::types::Error;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_stream_metadata_present() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let metadata = Some(String::from_str(&env, "ipfs://QmTest123"));
    let stream = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: metadata.clone(),
        created_at: env.ledger().timestamp(),
        claimed: false,
        paused: false,
        cancelled: false,
    };
    
    assert_eq!(stream.metadata, metadata);
    assert!(validate_metadata(&stream.metadata).is_ok());
}

#[test]
fn test_stream_metadata_absent() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let stream = StreamInfo {
        id: 1,
        creator: creator.clone(),
        recipient: recipient.clone(),
        amount: 1000,
        metadata: None,
        created_at: env.ledger().timestamp(),
        claimed: false,
        paused: false,
        cancelled: false,
    };
    
    assert_eq!(stream.metadata, None);
    assert!(validate_metadata(&stream.metadata).is_ok());
}

#[test]
fn test_metadata_empty_string_invalid() {
    let env = Env::default();
    let metadata = Some(String::from_str(&env, ""));
    
    let result = validate_metadata(&metadata);
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_metadata_max_length_valid() {
    let env = Env::default();
    let long_str = "a".repeat(512);
    let metadata = Some(String::from_str(&env, &long_str));
    
    let result = validate_metadata(&metadata);
    assert!(result.is_ok());
}

#[test]
fn test_metadata_exceeds_max_length() {
    let env = Env::default();
    let too_long = "a".repeat(513);
    let metadata = Some(String::from_str(&env, &too_long));
    
    let result = validate_metadata(&metadata);
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_metadata_boundary_511_chars() {
    let env = Env::default();
    let boundary_str = "a".repeat(511);
    let metadata = Some(String::from_str(&env, &boundary_str));
    
    let result = validate_metadata(&metadata);
    assert!(result.is_ok());
}

#[test]
fn test_metadata_boundary_1_char() {
    let env = Env::default();
    let metadata = Some(String::from_str(&env, "a"));
    
    let result = validate_metadata(&metadata);
    assert!(result.is_ok());
}

#[test]
fn test_metadata_ipfs_uri() {
    let env = Env::default();
    let metadata = Some(String::from_str(&env, "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"));
    
    let result = validate_metadata(&metadata);
    assert!(result.is_ok());
}

#[test]
fn test_metadata_label() {
    let env = Env::default();
    let metadata = Some(String::from_str(&env, "Monthly salary payment"));
    
    let result = validate_metadata(&metadata);
    assert!(result.is_ok());
}

#[test]
fn test_stream_created_event_with_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let metadata = Some(String::from_str(&env, "ipfs://QmTest"));
    
    // Event emission should not panic
    events::emit_stream_created(&env, 1, &creator, &recipient, 1000, &metadata);
}

#[test]
fn test_stream_created_event_without_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    // Event emission should not panic
    events::emit_stream_created(&env, 1, &creator, &recipient, 1000, &None);
}
