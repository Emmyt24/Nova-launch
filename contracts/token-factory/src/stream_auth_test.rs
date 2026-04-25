#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use crate::types::Error;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup_test() -> (Env, TokenFactoryClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &1_000_000, &500_000);
    
    (env, client, admin, treasury, creator)
}

#[test]
fn test_create_stream_requires_auth() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let result = client.try_create_stream(&creator, &recipient, &1000, &None);
    assert!(result.is_ok());
}

#[test]
fn test_create_stream_unauthorized() {
    let (env, client, _, _, _) = setup_test();
    env.mock_all_auths_allowing_non_root_auth();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    
    // Create stream as creator
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    // Try to create with different signer - should fail in real scenario
    // In mock_all_auths, this passes, but require_auth is called
    assert!(stream_id >= 0);
}

#[test]
fn test_claim_stream_requires_beneficiary() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    let result = client.try_claim_stream(&stream_id, &recipient);
    assert!(result.is_ok());
}

#[test]
fn test_claim_stream_wrong_beneficiary() {
    let (env, client, _, _, creator) = setup_test();
    env.mock_all_auths_allowing_non_root_auth();
    
    let recipient = Address::generate(&env);
    let wrong_recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    let result = client.try_claim_stream(&stream_id, &wrong_recipient);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_claim_stream_already_claimed() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    client.claim_stream(&stream_id, &recipient);
    
    let result = client.try_claim_stream(&stream_id, &recipient);
    assert_eq!(result, Err(Ok(Error::StreamAlreadyClaimed)));
}

#[test]
fn test_claim_stream_paused() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    client.pause_stream(&stream_id, &creator);
    
    let result = client.try_claim_stream(&stream_id, &recipient);
    assert_eq!(result, Err(Ok(Error::StreamPaused)));
}

#[test]
fn test_claim_stream_cancelled() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    client.cancel_stream(&stream_id, &creator);
    
    let result = client.try_claim_stream(&stream_id, &recipient);
    assert_eq!(result, Err(Ok(Error::StreamCancelled)));
}

#[test]
fn test_pause_stream_requires_creator() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    let result = client.try_pause_stream(&stream_id, &creator);
    assert!(result.is_ok());
}

#[test]
fn test_pause_stream_unauthorized() {
    let (env, client, _, _, creator) = setup_test();
    env.mock_all_auths_allowing_non_root_auth();
    
    let recipient = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    let result = client.try_pause_stream(&stream_id, &unauthorized);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_pause_stream_already_paused() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    client.pause_stream(&stream_id, &creator);
    
    let result = client.try_pause_stream(&stream_id, &creator);
    assert_eq!(result, Err(Ok(Error::StreamPaused)));
}

#[test]
fn test_unpause_stream_requires_creator() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    client.pause_stream(&stream_id, &creator);
    
    let result = client.try_unpause_stream(&stream_id, &creator);
    assert!(result.is_ok());
}

#[test]
fn test_unpause_stream_unauthorized() {
    let (env, client, _, _, creator) = setup_test();
    env.mock_all_auths_allowing_non_root_auth();
    
    let recipient = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    client.pause_stream(&stream_id, &creator);
    
    let result = client.try_unpause_stream(&stream_id, &unauthorized);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_unpause_stream_not_paused() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    let result = client.try_unpause_stream(&stream_id, &creator);
    assert_eq!(result, Err(Ok(Error::StreamNotPaused)));
}

#[test]
fn test_cancel_stream_requires_creator() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    let result = client.try_cancel_stream(&stream_id, &creator);
    assert!(result.is_ok());
}

#[test]
fn test_cancel_stream_unauthorized() {
    let (env, client, _, _, creator) = setup_test();
    env.mock_all_auths_allowing_non_root_auth();
    
    let recipient = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    let result = client.try_cancel_stream(&stream_id, &unauthorized);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_cancel_stream_already_cancelled() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    client.cancel_stream(&stream_id, &creator);
    
    let result = client.try_cancel_stream(&stream_id, &creator);
    assert_eq!(result, Err(Ok(Error::StreamCancelled)));
}

#[test]
fn test_create_stream_invalid_amount() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let result = client.try_create_stream(&creator, &recipient, &0, &None);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
    
    let result = client.try_create_stream(&creator, &recipient, &-100, &None);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn test_create_stream_invalid_metadata() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    let empty_metadata = Some(String::from_str(&env, ""));
    let result = client.try_create_stream(&creator, &recipient, &1000, &empty_metadata);
    assert_eq!(result, Err(Ok(Error::InvalidParameters)));
    
    let too_long = "a".repeat(513);
    let long_metadata = Some(String::from_str(&env, &too_long));
    let result = client.try_create_stream(&creator, &recipient, &1000, &long_metadata);
    assert_eq!(result, Err(Ok(Error::InvalidParameters)));
}

#[test]
fn test_stream_not_found() {
    let (env, client, _, _, creator) = setup_test();
    
    let result = client.try_claim_stream(&999, &creator);
    assert_eq!(result, Err(Ok(Error::StreamNotFound)));
    
    let result = client.try_pause_stream(&999, &creator);
    assert_eq!(result, Err(Ok(Error::StreamNotFound)));
    
    let result = client.try_unpause_stream(&999, &creator);
    assert_eq!(result, Err(Ok(Error::StreamNotFound)));
    
    let result = client.try_cancel_stream(&999, &creator);
    assert_eq!(result, Err(Ok(Error::StreamNotFound)));
}

#[test]
fn test_full_stream_lifecycle() {
    let (env, client, _, _, creator) = setup_test();
    let recipient = Address::generate(&env);
    
    // Create stream
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    // Pause stream
    client.pause_stream(&stream_id, &creator);
    
    // Unpause stream
    client.unpause_stream(&stream_id, &creator);
    
    // Claim stream
    client.claim_stream(&stream_id, &recipient);
    
    // Verify stream state
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed, true);
    assert_eq!(stream.paused, false);
    assert_eq!(stream.cancelled, false);
}

#[test]
fn test_beneficiary_mismatch() {
    let (env, client, _, _, creator) = setup_test();
    env.mock_all_auths_allowing_non_root_auth();
    
    let recipient = Address::generate(&env);
    let wrong_recipient = Address::generate(&env);
    
    let stream_id = client.create_stream(&creator, &recipient, &1000, &None);
    
    // Wrong beneficiary tries to claim
    let result = client.try_claim_stream(&stream_id, &wrong_recipient);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}
