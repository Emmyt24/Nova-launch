#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

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
fn test_get_streams_by_creator_empty() {
    let (env, client, _admin, _treasury) = setup();
    let creator = Address::generate(&env);
    
    let streams = client.get_streams_by_creator(&creator, &0, &10);
    assert_eq!(streams.len(), 0);
}

#[test]
fn test_get_streams_by_creator_single() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &300,
        &None,
    );
    
    let streams = client.get_streams_by_creator(&creator, &0, &10);
    assert_eq!(streams.len(), 1);
    assert_eq!(streams.get(0).unwrap().id, stream_id);
    assert_eq!(streams.get(0).unwrap().creator, creator);
}

#[test]
fn test_get_streams_by_creator_multiple() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 5 streams
    let mut stream_ids = vec![];
    for i in 0..5 {
        let id = client.create_stream(
            &creator,
            &recipient,
            &token,
            &(1000_0000000 + i as i128),
            &100,
            &200,
            &300,
            &None,
        );
        stream_ids.push(id);
    }
    
    let streams = client.get_streams_by_creator(&creator, &0, &10);
    assert_eq!(streams.len(), 5);
    
    // Verify deterministic ordering by stream ID
    for (i, stream) in streams.iter().enumerate() {
        assert_eq!(stream.id, stream_ids[i]);
        assert_eq!(stream.creator, creator);
    }
}

#[test]
fn test_get_streams_by_creator_pagination() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 10 streams
    let mut stream_ids = vec![];
    for i in 0..10 {
        let id = client.create_stream(
            &creator,
            &recipient,
            &token,
            &(1000_0000000 + i as i128),
            &100,
            &200,
            &300,
            &None,
        );
        stream_ids.push(id);
    }
    
    // First page: 0-3
    let page1 = client.get_streams_by_creator(&creator, &0, &4);
    assert_eq!(page1.len(), 4);
    assert_eq!(page1.get(0).unwrap().id, stream_ids[0]);
    assert_eq!(page1.get(3).unwrap().id, stream_ids[3]);
    
    // Second page: 4-7
    let page2 = client.get_streams_by_creator(&creator, &4, &4);
    assert_eq!(page2.len(), 4);
    assert_eq!(page2.get(0).unwrap().id, stream_ids[4]);
    assert_eq!(page2.get(3).unwrap().id, stream_ids[7]);
    
    // Third page: 8-9
    let page3 = client.get_streams_by_creator(&creator, &8, &4);
    assert_eq!(page3.len(), 2);
    assert_eq!(page3.get(0).unwrap().id, stream_ids[8]);
    assert_eq!(page3.get(1).unwrap().id, stream_ids[9]);
}

#[test]
fn test_get_streams_by_creator_cursor_transitions() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 7 streams
    let mut stream_ids = vec![];
    for i in 0..7 {
        let id = client.create_stream(
            &creator,
            &recipient,
            &token,
            &(1000_0000000 + i as i128),
            &100,
            &200,
            &300,
            &None,
        );
        stream_ids.push(id);
    }
    
    // Test cursor at boundary
    let page1 = client.get_streams_by_creator(&creator, &0, &3);
    assert_eq!(page1.len(), 3);
    assert_eq!(page1.get(2).unwrap().id, stream_ids[2]);
    
    // Next cursor starts exactly after last item
    let page2 = client.get_streams_by_creator(&creator, &3, &3);
    assert_eq!(page2.len(), 3);
    assert_eq!(page2.get(0).unwrap().id, stream_ids[3]);
    
    // Last page with partial results
    let page3 = client.get_streams_by_creator(&creator, &6, &3);
    assert_eq!(page3.len(), 1);
    assert_eq!(page3.get(0).unwrap().id, stream_ids[6]);
    
    // Cursor beyond end returns empty
    let page4 = client.get_streams_by_creator(&creator, &7, &3);
    assert_eq!(page4.len(), 0);
}

#[test]
fn test_get_streams_by_creator_limit_capped() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 5 streams
    for i in 0..5 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(1000_0000000 + i as i128),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    // Request more than available
    let streams = client.get_streams_by_creator(&creator, &0, &200);
    assert_eq!(streams.len(), 5); // Should return only 5, not fail
}

#[test]
fn test_get_streams_by_creator_different_creators() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Creator 1 creates 3 streams
    let id1 = client.create_stream(&creator1, &recipient, &token, &1000_0000000, &100, &200, &300, &None);
    let id2 = client.create_stream(&creator1, &recipient, &token, &2000_0000000, &100, &200, &300, &None);
    let id3 = client.create_stream(&creator1, &recipient, &token, &3000_0000000, &100, &200, &300, &None);
    
    // Creator 2 creates 2 streams
    let id4 = client.create_stream(&creator2, &recipient, &token, &4000_0000000, &100, &200, &300, &None);
    let id5 = client.create_stream(&creator2, &recipient, &token, &5000_0000000, &100, &200, &300, &None);
    
    // Verify creator 1's streams
    let streams1 = client.get_streams_by_creator(&creator1, &0, &10);
    assert_eq!(streams1.len(), 3);
    assert_eq!(streams1.get(0).unwrap().id, id1);
    assert_eq!(streams1.get(1).unwrap().id, id2);
    assert_eq!(streams1.get(2).unwrap().id, id3);
    
    // Verify creator 2's streams
    let streams2 = client.get_streams_by_creator(&creator2, &0, &10);
    assert_eq!(streams2.len(), 2);
    assert_eq!(streams2.get(0).unwrap().id, id4);
    assert_eq!(streams2.get(1).unwrap().id, id5);
}

#[test]
fn test_get_streams_by_creator_ordering_deterministic() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create streams
    let mut stream_ids = vec![];
    for i in 0..5 {
        let id = client.create_stream(
            &creator,
            &recipient,
            &token,
            &(1000_0000000 + i as i128),
            &100,
            &200,
            &300,
            &None,
        );
        stream_ids.push(id);
    }
    
    // Query multiple times - should always return same order
    for _ in 0..3 {
        let streams = client.get_streams_by_creator(&creator, &0, &10);
        assert_eq!(streams.len(), 5);
        
        for (i, stream) in streams.iter().enumerate() {
            assert_eq!(stream.id, stream_ids[i]);
        }
    }
}

#[test]
fn test_get_streams_by_creator_zero_limit() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    client.create_stream(&creator, &recipient, &token, &1000_0000000, &100, &200, &300, &None);
    
    let streams = client.get_streams_by_creator(&creator, &0, &0);
    assert_eq!(streams.len(), 0);
}

#[test]
fn test_get_streams_by_creator_cursor_at_end() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 3 streams
    for i in 0..3 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(1000_0000000 + i as i128),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    // Cursor exactly at end
    let streams = client.get_streams_by_creator(&creator, &3, &10);
    assert_eq!(streams.len(), 0);
    
    // Cursor beyond end
    let streams = client.get_streams_by_creator(&creator, &10, &10);
    assert_eq!(streams.len(), 0);
}
