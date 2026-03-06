#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use crate::test_helpers::{set_time, advance_time, set_time_at_progress};
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
#[should_panic(expected = "Error(Contract, #28)")]
fn test_claim_before_cliff() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create stream: start=100, cliff=200, end=300
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
    
    // Set time before cliff
    set_time(&env, 150);
    
    // Should fail - cliff not reached
    client.claim_stream(&stream_id, &recipient);
}

#[test]
fn test_claim_at_cliff() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create stream: start=100, cliff=200, end=300
    // Total amount: 1000 tokens
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
    
    // Set time at cliff (50% through vesting period)
    set_time(&env, 200);
    
    // Should claim 50% of tokens
    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 500_0000000);
    
    // Verify stream updated
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed, 500_0000000);
}

#[test]
fn test_claim_at_end_using_progress() {
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
    
    // Set time to 100% completion using helper
    set_time_at_progress(&env, 100, 300, 1.0);
    
    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 1000_0000000);
}

#[test]
fn test_claim_multiple_times_with_advance() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &0,
        &0,
        &1000,
        &None,
    );
    
    // Claim at 25%
    set_time(&env, 250);
    let claimed1 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed1, 250_0000000);
    
    // Advance to 50%
    advance_time(&env, 250);
    let claimed2 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed2, 250_0000000);
    
    // Advance to 100%
    advance_time(&env, 500);
    let claimed3 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed3, 500_0000000);
    
    // Total claimed
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed, 1000_0000000);
}

#[test]
fn test_claim_partial_vesting() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create stream: start=100, cliff=200, end=400
    // Total amount: 1000 tokens, duration: 300 seconds
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &100,
        &200,
        &400,
        &None,
    );
    
    // Set time at 250 (50% through vesting: (250-100)/(400-100) = 150/300 = 50%)
    env.ledger().with_mut(|li| li.timestamp = 250);
    
    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 500_0000000);
    
    // Advance time to 325 (75% through: (325-100)/(400-100) = 225/300 = 75%)
    env.ledger().with_mut(|li| li.timestamp = 325);
    
    // Should claim additional 25% (750 - 500 = 250)
    let claimed2 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed2, 250_0000000);
    
    // Verify total claimed
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed, 750_0000000);
}

#[test]
fn test_claim_full_vesting() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create stream
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
    
    // Set time after end
    env.ledger().with_mut(|li| li.timestamp = 400);
    
    // Should claim full amount
    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 1000_0000000);
    
    // Verify stream fully claimed
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed, 1000_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #29)")]
fn test_claim_nothing_to_claim() {
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
    
    // Claim at cliff
    env.ledger().with_mut(|li| li.timestamp = 200);
    client.claim_stream(&stream_id, &recipient);
    
    // Try to claim again at same time - should fail
    client.claim_stream(&stream_id, &recipient);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_claim_unauthorized() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let attacker = Address::generate(&env);
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
    
    env.ledger().with_mut(|li| li.timestamp = 250);
    
    // Attacker tries to claim - should fail
    client.claim_stream(&stream_id, &attacker);
}

#[test]
#[should_panic(expected = "Error(Contract, #26)")]
fn test_claim_nonexistent_stream() {
    let (env, client, _admin, _treasury) = setup();
    
    let recipient = Address::generate(&env);
    
    env.ledger().with_mut(|li| li.timestamp = 250);
    
    // Try to claim from non-existent stream
    client.claim_stream(&999, &recipient);
}

#[test]
fn test_claim_multiple_times() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create stream: 1000 tokens over 200 seconds (100-300)
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
    
    // Claim at 25% (150)
    env.ledger().with_mut(|li| li.timestamp = 150);
    let claim1 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claim1, 250_0000000);
    
    // Claim at 50% (200)
    env.ledger().with_mut(|li| li.timestamp = 200);
    let claim2 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claim2, 250_0000000);
    
    // Claim at 75% (250)
    env.ledger().with_mut(|li| li.timestamp = 250);
    let claim3 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claim3, 250_0000000);
    
    // Claim at 100% (300+)
    env.ledger().with_mut(|li| li.timestamp = 350);
    let claim4 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claim4, 250_0000000);
    
    // Verify total
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed, 1000_0000000);
}

#[test]
fn test_claim_linear_vesting() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // Create stream: 1000 tokens, start=0, cliff=0, end=1000
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &0,
        &0,
        &1000,
        &None,
    );
    
    // At time 100: 10% vested
    env.ledger().with_mut(|li| li.timestamp = 100);
    let claim1 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claim1, 100_0000000);
    
    // At time 500: 50% vested (additional 40%)
    env.ledger().with_mut(|li| li.timestamp = 500);
    let claim2 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claim2, 400_0000000);
    
    // At time 1000: 100% vested (additional 50%)
    env.ledger().with_mut(|li| li.timestamp = 1000);
    let claim3 = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claim3, 500_0000000);
}

#[test]
fn test_claim_prevents_overclaiming() {
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
    
    // Claim everything at end
    env.ledger().with_mut(|li| li.timestamp = 500);
    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 1000_0000000);
    
    // Verify cannot claim more
    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed, stream.amount);
}

#[test]
fn test_vested_amount_calculation() {
    let (env, client, _admin, _treasury) = setup();
    
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let token = Address::generate(&env);
    
    // 1000 tokens, 100 second duration (start=0, end=100)
    let stream_id = client.create_stream(
        &creator,
        &recipient,
        &token,
        &1000_0000000,
        &0,
        &0,
        &100,
        &None,
    );
    
    // Test various time points
    let test_cases = vec![
        (0, 0_0000000),      // 0%
        (10, 100_0000000),   // 10%
        (25, 250_0000000),   // 25%
        (50, 500_0000000),   // 50%
        (75, 750_0000000),   // 75%
        (100, 1000_0000000), // 100%
        (150, 1000_0000000), // 100% (capped)
    ];
    
    for (time, expected) in test_cases {
        env.ledger().with_mut(|li| li.timestamp = time);
        let claimed = client.claim_stream(&stream_id, &recipient);
        assert_eq!(claimed, expected);
    }
}
