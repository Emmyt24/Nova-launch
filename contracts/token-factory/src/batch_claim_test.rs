#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use crate::test_helpers::{set_time};
use soroban_sdk::{testutils::Address as _, vec, Address, Env, Vec};

fn setup() -> (Env, TokenFactoryClient, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury, &1_000_000, &500_000);
    
    (env, client, admin, treasury)
}

#[test]
fn test_batch_claim_happy_path() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    let stream_id1 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    let stream_id2 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &2000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    // Set time to end of streams (100% completion)
    set_time(&env, 400);
    
    let stream_ids: Vec<u64> = vec![&env, stream_id1, stream_id2];
    
    let claimed_amounts = client.batch_claim(&recipient, &stream_ids);
    
    assert_eq!(claimed_amounts.len(), 2);
    assert_eq!(claimed_amounts.get(0).unwrap(), 1000_0000000);
    assert_eq!(claimed_amounts.get(1).unwrap(), 2000_0000000);
    
    // Verify stream objects updated
    let stream1 = client.get_stream(&stream_id1).unwrap();
    assert_eq!(stream1.claimed, 1000_0000000);
    
    let stream2 = client.get_stream(&stream_id2).unwrap();
    assert_eq!(stream2.claimed, 2000_0000000);
}

#[test]
fn test_batch_claim_mixed_claimable() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Eligible stream
    let stream_id1 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    // Not eligible yet (cliff hasn't hit)
    let stream_id2 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &2000_0000000,
        &400,
        &450,
        &500,
        &None,
    );
    
    // Set time to end of first stream, but before second stream's cliff
    set_time(&env, 350);
    
    let stream_ids: Vec<u64> = vec![&env, stream_id1, stream_id2];
    
    let claimed_amounts = client.batch_claim(&recipient, &stream_ids);
    
    assert_eq!(claimed_amounts.len(), 2);
    assert_eq!(claimed_amounts.get(0).unwrap(), 1000_0000000);
    assert_eq!(claimed_amounts.get(1).unwrap(), 0);
    
    // Verify stream objects updated correctly
    let stream1 = client.get_stream(&stream_id1).unwrap();
    assert_eq!(stream1.claimed, 1000_0000000);
    
    let stream2 = client.get_stream(&stream_id2).unwrap();
    assert_eq!(stream2.claimed, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_batch_claim_unauthorized() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient1 = Address::generate(&env);
    let recipient2 = Address::generate(&env);
    let token = Address::generate(&env);
    
    let stream_id1 = client.create_stream(
        &creator,
        &recipient1,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    let stream_id2 = client.create_stream(
        &creator,
        &recipient2,  // Different recipient
        &token,
        &2000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    set_time(&env, 400);
    
    let stream_ids: Vec<u64> = vec![&env, stream_id1, stream_id2];
    
    // Attempting to claim a batch where one stream belongs to someone else should fail
    client.batch_claim(&recipient1, &stream_ids);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_batch_claim_token_not_found() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    let stream_id1 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    set_time(&env, 400);
    
    // stream ID 999 does not exist
    let stream_ids: Vec<u64> = vec![&env, stream_id1, 999];
    
    client.batch_claim(&recipient, &stream_ids);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_batch_claim_cancelled_stream() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    let stream_id1 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    let stream_id2 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &2000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    // Cancel stream_id2
    client.cancel_stream(&creator, &stream_id2);
    
    set_time(&env, 400);
    
    let stream_ids: Vec<u64> = vec![&env, stream_id1, stream_id2];
    
    // Calling batch_claim with a cancelled stream should fail
    client.batch_claim(&recipient, &stream_ids);
}
