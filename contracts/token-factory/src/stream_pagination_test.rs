#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
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
fn test_get_stream_count_empty() {
    let (_env, client, _admin, _treasury) = setup();
    
    assert_eq!(client.get_stream_count(), 0);
}

#[test]
fn test_get_stream_count_increments() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    assert_eq!(client.get_stream_count(), 0);
    
    client.create_stream(&creator, &recipient, &token, &1000_0000000, &100, &200, &300, &None);
    assert_eq!(client.get_stream_count(), 1);
    
    client.create_stream(&creator, &recipient, &token, &2000_0000000, &100, &200, &300, &None);
    assert_eq!(client.get_stream_count(), 2);
    
    client.create_stream(&creator, &recipient, &token, &3000_0000000, &100, &200, &300, &None);
    assert_eq!(client.get_stream_count(), 3);
}

#[test]
fn test_get_streams_page_first_page() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 5 streams
    for i in 1..=5 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(i as i128 * 1000_0000000),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    // Get first page (cursor=1, limit=3)
    let streams = client.get_streams_page(&1, &3);
    assert_eq!(streams.len(), 3);
    assert_eq!(streams.get(0).unwrap().id, 1);
    assert_eq!(streams.get(1).unwrap().id, 2);
    assert_eq!(streams.get(2).unwrap().id, 3);
}

#[test]
fn test_get_streams_page_middle_page() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 10 streams
    for i in 1..=10 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(i as i128 * 1000_0000000),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    // Get middle page (cursor=4, limit=3)
    let streams = client.get_streams_page(&4, &3);
    assert_eq!(streams.len(), 3);
    assert_eq!(streams.get(0).unwrap().id, 4);
    assert_eq!(streams.get(1).unwrap().id, 5);
    assert_eq!(streams.get(2).unwrap().id, 6);
}

#[test]
fn test_get_streams_page_last_page() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 7 streams
    for i in 1..=7 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(i as i128 * 1000_0000000),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    // Get last page (cursor=6, limit=5) - should only return 2 streams
    let streams = client.get_streams_page(&6, &5);
    assert_eq!(streams.len(), 2);
    assert_eq!(streams.get(0).unwrap().id, 6);
    assert_eq!(streams.get(1).unwrap().id, 7);
}

#[test]
fn test_get_streams_page_stable_ordering() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create streams
    for i in 1..=5 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(i as i128 * 1000_0000000),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    // Query same page multiple times - should be stable
    let page1_first = client.get_streams_page(&1, &3);
    let page1_second = client.get_streams_page(&1, &3);
    
    assert_eq!(page1_first.len(), page1_second.len());
    for i in 0..page1_first.len() {
        assert_eq!(page1_first.get(i).unwrap().id, page1_second.get(i).unwrap().id);
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_get_streams_page_limit_too_high() {
    let (_env, client, _admin, _treasury) = setup();
    
    // Limit exceeds MAX_LIMIT (100)
    client.get_streams_page(&1, &101);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_get_streams_page_zero_limit() {
    let (_env, client, _admin, _treasury) = setup();
    
    client.get_streams_page(&1, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_get_streams_page_zero_cursor() {
    let (_env, client, _admin, _treasury) = setup();
    
    client.get_streams_page(&0, &10);
}

#[test]
fn test_get_streams_page_empty_result() {
    let (_env, client, _admin, _treasury) = setup();
    
    // No streams created, cursor beyond range
    let streams = client.get_streams_page(&1, &10);
    assert_eq!(streams.len(), 0);
}

#[test]
fn test_get_streams_page_max_limit() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 50 streams
    for i in 1..=50 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(i as i128 * 1000_0000000),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    // Get page with max limit (100)
    let streams = client.get_streams_page(&1, &100);
    assert_eq!(streams.len(), 50);
}

#[test]
fn test_pagination_complete_iteration() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create 25 streams
    for i in 1..=25 {
        client.create_stream(
            &creator,
            &recipient,
            &token,
            &(i as i128 * 1000_0000000),
            &100,
            &200,
            &300,
            &None,
        );
    }
    
    let page_size = 10;
    let mut all_ids = soroban_sdk::Vec::new(&env);
    
    // Iterate through all pages
    let mut cursor = 1;
    loop {
        let page = client.get_streams_page(&cursor, &page_size);
        if page.len() == 0 {
            break;
        }
        
        for stream in page.iter() {
            all_ids.push_back(stream.id);
        }
        
        cursor += page_size;
    }
    
    // Verify we got all 25 streams
    assert_eq!(all_ids.len(), 25);
    
    // Verify ordering
    for i in 0..all_ids.len() {
        assert_eq!(all_ids.get(i).unwrap(), (i + 1) as u32);
    }
}
