// Beneficiary Stream Index Tests
// Closes the beneficiary-stream-index issue.
//
// Coverage:
//   - Zero streams: a fresh address returns an empty page with no next_cursor
//   - One stream: correct index returned, no next_cursor
//   - Many streams: all entries retrievable, cursor-based pagination works
//   - Pagination boundary: cursor at exact end returns empty page
//   - Limit cap: requesting more than 50 is silently capped to 50
//   - Multiple beneficiaries: indices are isolated per beneficiary

use crate::TokenFactory;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

// ── helpers ──────────────────────────────────────────────────────────────────

/// Deploy and initialise the factory. Returns (env, contract_id, admin, treasury).
fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client
        .initialize(&admin, &treasury, &100_i128, &50_i128)
        .unwrap();

    (env, contract_id, admin, treasury)
}

/// Create one token on behalf of `creator` and return its registry index.
fn create_token(
    env: &Env,
    contract_id: &Address,
    creator: &Address,
    suffix: &str,
) -> u32 {
    let client = crate::TokenFactoryClient::new(env, contract_id);
    let before = client.get_token_count();
    client
        .create_token(
            creator,
            &String::from_str(env, &("Token".to_string() + suffix)),
            &String::from_str(env, &("TK".to_string() + suffix)),
            &6_u32,
            &1_000_i128,
            &None,
            &100_i128,
        )
        .unwrap();
    before // index assigned == count before creation
}

// ── tests ─────────────────────────────────────────────────────────────────────

/// A beneficiary with no tokens should receive an empty page and no next_cursor.
#[test]
fn test_zero_streams() {
    let (env, contract_id, _admin, _treasury) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);
    let page = client.get_streams_by_beneficiary(&beneficiary, &0, &10);

    assert_eq!(
        page.token_indices.len(),
        0,
        "expect empty token_indices for a beneficiary with no streams"
    );
    assert!(
        page.next_cursor.is_none(),
        "expect no next_cursor when there are no streams"
    );
}

/// A beneficiary who created exactly one token should get that single index back.
#[test]
fn test_one_stream() {
    let (env, contract_id, _admin, _treasury) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);
    let token_index = create_token(&env, &contract_id, &beneficiary, "A");

    let page = client.get_streams_by_beneficiary(&beneficiary, &0, &10);

    assert_eq!(page.token_indices.len(), 1, "expect exactly one entry");
    assert_eq!(
        page.token_indices.get(0).unwrap(),
        token_index,
        "returned index must match the created token's registry index"
    );
    assert!(
        page.next_cursor.is_none(),
        "no next_cursor when all entries fit on one page"
    );
}

/// Creating three tokens for one beneficiary should return all three indices.
#[test]
fn test_many_streams_all_on_one_page() {
    let (env, contract_id, _admin, _treasury) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);
    let idx0 = create_token(&env, &contract_id, &beneficiary, "A");
    let idx1 = create_token(&env, &contract_id, &beneficiary, "B");
    let idx2 = create_token(&env, &contract_id, &beneficiary, "C");

    let page = client.get_streams_by_beneficiary(&beneficiary, &0, &10);

    assert_eq!(page.token_indices.len(), 3, "expect three entries");
    assert_eq!(page.token_indices.get(0).unwrap(), idx0);
    assert_eq!(page.token_indices.get(1).unwrap(), idx1);
    assert_eq!(page.token_indices.get(2).unwrap(), idx2);
    assert!(page.next_cursor.is_none(), "all three fit within limit=10");
}

/// Pagination: with 5 tokens and limit=2, three sequential pages should cover all entries.
#[test]
fn test_many_streams_paginated() {
    let (env, contract_id, _admin, _treasury) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);
    let mut expected: soroban_sdk::Vec<u32> = soroban_sdk::Vec::new(&env);
    for suffix in ["A", "B", "C", "D", "E"] {
        let idx = create_token(&env, &contract_id, &beneficiary, suffix);
        expected.push_back(idx);
    }

    // Page 1: entries 0-1
    let page1 = client.get_streams_by_beneficiary(&beneficiary, &0, &2);
    assert_eq!(page1.token_indices.len(), 2, "page 1 must have 2 entries");
    assert_eq!(page1.token_indices.get(0).unwrap(), expected.get(0).unwrap());
    assert_eq!(page1.token_indices.get(1).unwrap(), expected.get(1).unwrap());
    let cursor2 = page1.next_cursor.expect("must have a next_cursor after page 1");
    assert_eq!(cursor2, 2);

    // Page 2: entries 2-3
    let page2 = client.get_streams_by_beneficiary(&beneficiary, &cursor2, &2);
    assert_eq!(page2.token_indices.len(), 2, "page 2 must have 2 entries");
    assert_eq!(page2.token_indices.get(0).unwrap(), expected.get(2).unwrap());
    assert_eq!(page2.token_indices.get(1).unwrap(), expected.get(3).unwrap());
    let cursor3 = page2.next_cursor.expect("must have a next_cursor after page 2");
    assert_eq!(cursor3, 4);

    // Page 3: entry 4 (last)
    let page3 = client.get_streams_by_beneficiary(&beneficiary, &cursor3, &2);
    assert_eq!(page3.token_indices.len(), 1, "page 3 must have the last entry");
    assert_eq!(page3.token_indices.get(0).unwrap(), expected.get(4).unwrap());
    assert!(page3.next_cursor.is_none(), "no next_cursor after final page");
}

/// A cursor pointing exactly at the end (== total count) returns an empty page.
#[test]
fn test_cursor_at_end_returns_empty_page() {
    let (env, contract_id, _admin, _treasury) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);
    create_token(&env, &contract_id, &beneficiary, "A");
    create_token(&env, &contract_id, &beneficiary, "B");

    // cursor=2 is one past the last valid index (0 and 1)
    let page = client.get_streams_by_beneficiary(&beneficiary, &2, &10);
    assert_eq!(page.token_indices.len(), 0, "cursor past end must yield empty page");
    assert!(page.next_cursor.is_none());
}

/// Requesting limit > 50 must be silently capped; only up to 50 entries returned.
#[test]
fn test_limit_cap_at_50() {
    let (env, contract_id, _admin, _treasury) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);

    // Create 55 tokens for this beneficiary
    for i in 0..55_u32 {
        // Build a short unique suffix from the loop counter
        let suffix = match i {
            0..=9   => ["0","1","2","3","4","5","6","7","8","9"][i as usize],
            10..=19 => ["10","11","12","13","14","15","16","17","18","19"][(i-10) as usize],
            20..=29 => ["20","21","22","23","24","25","26","27","28","29"][(i-20) as usize],
            30..=39 => ["30","31","32","33","34","35","36","37","38","39"][(i-30) as usize],
            40..=49 => ["40","41","42","43","44","45","46","47","48","49"][(i-40) as usize],
            _       => ["50","51","52","53","54"][(i-50) as usize],
        };
        create_token(&env, &contract_id, &beneficiary, suffix);
    }

    // Request 100 but the impl caps at 50
    let page = client.get_streams_by_beneficiary(&beneficiary, &0, &100);
    assert_eq!(
        page.token_indices.len(),
        50,
        "result must be capped at 50 regardless of requested limit"
    );
    assert!(
        page.next_cursor.is_some(),
        "there are still 5 more entries beyond the cap"
    );
}

/// Two distinct beneficiaries must have completely independent stream indices.
#[test]
fn test_streams_isolated_per_beneficiary() {
    let (env, contract_id, _admin, _treasury) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let alice_idx = create_token(&env, &contract_id, &alice, "AliceTok");
    let bob_idx   = create_token(&env, &contract_id, &bob,   "BobTok");

    let alice_page = client.get_streams_by_beneficiary(&alice, &0, &10);
    let bob_page   = client.get_streams_by_beneficiary(&bob,   &0, &10);

    assert_eq!(alice_page.token_indices.len(), 1);
    assert_eq!(alice_page.token_indices.get(0).unwrap(), alice_idx);

    assert_eq!(bob_page.token_indices.len(), 1);
    assert_eq!(bob_page.token_indices.get(0).unwrap(), bob_idx);

    // Alice's index must not appear in Bob's page and vice-versa
    assert_ne!(
        alice_page.token_indices.get(0).unwrap(),
        bob_page.token_indices.get(0).unwrap(),
        "beneficiary indices must not bleed across accounts"
    );
}