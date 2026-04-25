#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use crate::types::Error;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

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
fn test_create_stream_success() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1_000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    assert_eq!(stream_id, 1);
    
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.id, 1);
    assert_eq!(stream.creator, creator);
    assert_eq!(stream.recipient, recipient);
    assert_eq!(stream.token_address, token);
    assert_eq!(stream.amount, 1_000_0000000);
    assert_eq!(stream.schedule.start_time, 100);
    assert_eq!(stream.schedule.cliff_time, 200);
    assert_eq!(stream.schedule.end_time, 300);
    assert_eq!(stream.claimed, 0);
    assert_eq!(stream.cancelled, false);
    assert_eq!(stream.metadata, None);
}

#[test]
fn test_create_stream_with_metadata() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    let metadata = String::from_str(&env, "Salary vesting");
    
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &5000_0000000,
        &1000,
        &2000,
        &3000,
        &Some(metadata.clone()),
    );
    
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.metadata, Some(metadata));
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_create_stream_zero_amount() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    client.create_stream(
        &creator,
        &recipient,
        &token,
        &0,
        &100,
        &200,
        &300,
        &None,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_create_stream_negative_amount() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    client.create_stream(
        &creator,
        &recipient,
        &token,
        &-1000,
        &100,
        &200,
        &300,
        &None,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #27)")]
fn test_create_stream_cliff_before_start() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &200,
        &100,
        &300,
        &None,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #27)")]
fn test_create_stream_end_before_cliff() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &300,
        &200,
        &None,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #27)")]
fn test_create_stream_start_equals_end() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &100,
        &100,
        &None,
    );
}

#[test]
fn test_create_stream_valid_edge_cases() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Start == cliff < end (valid)
    let stream_id1 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &100,
        &200,
        &None,
    );
    assert_eq!(stream_id1, 1);
    
    // Start < cliff == end (valid)
    let stream_id2 = client.create_stream(
        &creator,
        &recipient,
        &token,
        &2000_0000000,
        &100,
        &200,
        &200,
        &None,
    );
    assert_eq!(stream_id2, 2);
}

#[test]
fn test_create_multiple_streams() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    let id1 = client.create_stream(&creator, &recipient, &token, &1000_0000000, &100, &200, &300, &None);
    let id2 = client.create_stream(&creator, &recipient, &token, &2000_0000000, &100, &200, &300, &None);
    let id3 = client.create_stream(&creator, &recipient, &token, &3000_0000000, &100, &200, &300, &None);
    
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(id3, 3);
    
    let stream1 = client.get_stream(&id1);
    let stream2 = client.get_stream(&id2);
    let stream3 = client.get_stream(&id3);
    
    assert_eq!(stream1.amount, 1000_0000000);
    assert_eq!(stream2.amount, 2000_0000000);
    assert_eq!(stream3.amount, 3000_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #27)")]
fn test_get_stream_not_found() {
    let (_env, client, _admin, _treasury) = setup();
    
    client.get_stream(&999);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_create_stream_metadata_too_long() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create metadata > 512 characters
    let long_metadata = String::from_str(&env, &"a".repeat(513));
    
    client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &Some(long_metadata),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_create_stream_empty_metadata() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    let empty_metadata = String::from_str(&env, "");
    
    client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &Some(empty_metadata),
    );
}

#[test]
fn test_create_stream_max_valid_metadata() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Exactly 512 characters (valid)
    let max_metadata = String::from_str(&env, &"a".repeat(512));
    
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &Some(max_metadata.clone()),
    );
    
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.metadata, Some(max_metadata));
}
