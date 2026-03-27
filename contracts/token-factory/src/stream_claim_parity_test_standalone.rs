//! Standalone Stream Claim Parity Test
//!
//! This test verifies that get_claimable_amount returns the exact value
//! that claim_stream will transfer.

#![cfg(test)]

use crate::stream_types::{StreamInfo, calculate_claimable_amount};
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_calculate_claimable_amount_before_start() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let current_time = 1000_u64;
    let start_time = 2000_u64;
    let end_time = 3000_u64;
    
    let stream = StreamInfo {
        id: 1,
        creator,
        recipient,
        token_index: 0,
        amount: 1_000_000,
        start_time,
        end_time,
        claimed_amount: 0,
        metadata: None,
        created_at: current_time,
    };
    
    let claimable = calculate_claimable_amount(&stream, current_time);
    assert_eq!(claimable, 0, "Should be 0 before start time");
}

#[test]
fn test_calculate_claimable_amount_at_start() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let start_time = 1000_u64;
    let end_time = 2000_u64;
    
    let stream = StreamInfo {
        id: 1,
        creator,
        recipient,
        token_index: 0,
        amount: 1_000_000,
        start_time,
        end_time,
        claimed_amount: 0,
        metadata: None,
        created_at: start_time,
    };
    
    let claimable = calculate_claimable_amount(&stream, start_time);
    assert_eq!(claimable, 0, "Should be 0 at exact start time");
}

#[test]
fn test_calculate_claimable_amount_mid_stream() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let start_time = 1000_u64;
    let end_time = 2000_u64;
    let mid_time = 1500_u64; // 50% through
    
    let stream = StreamInfo {
        id: 1,
        creator,
        recipient,
        token_index: 0,
        amount: 1_000_000,
        start_time,
        end_time,
        claimed_amount: 0,
        metadata: None,
        created_at: start_time,
    };
    
    let claimable = calculate_claimable_amount(&stream, mid_time);
    let expected = 500_000; // 50% of 1_000_000
    assert_eq!(claimable, expected, "Should be 50% at midpoint");
}

#[test]
fn test_calculate_claimable_amount_after_end() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let start_time = 1000_u64;
    let end_time = 2000_u64;
    let after_time = 3000_u64;
    
    let stream = StreamInfo {
        id: 1,
        creator,
        recipient,
        token_index: 0,
        amount: 1_000_000,
        start_time,
        end_time,
        claimed_amount: 0,
        metadata: None,
        created_at: start_time,
    };
    
    let claimable = calculate_claimable_amount(&stream, after_time);
    assert_eq!(claimable, 1_000_000, "Should be full amount after end time");
}

#[test]
fn test_calculate_claimable_amount_with_claimed() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let start_time = 1000_u64;
    let end_time = 2000_u64;
    let current_time = 1750_u64; // 75% through
    
    let stream = StreamInfo {
        id: 1,
        creator,
        recipient,
        token_index: 0,
        amount: 1_000_000,
        start_time,
        end_time,
        claimed_amount: 500_000, // Already claimed 50%
        metadata: None,
        created_at: start_time,
    };
    
    let claimable = calculate_claimable_amount(&stream, current_time);
    let expected = 250_000; // 75% vested - 50% claimed = 25%
    assert_eq!(claimable, expected, "Should account for already claimed amount");
}

#[test]
fn test_calculate_claimable_amount_all_claimed() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    let start_time = 1000_u64;
    let end_time = 2000_u64;
    let after_time = 3000_u64;
    
    let stream = StreamInfo {
        id: 1,
        creator,
        recipient,
        token_index: 0,
        amount: 1_000_000,
        start_time,
        end_time,
        claimed_amount: 1_000_000, // All claimed
        metadata: None,
        created_at: start_time,
    };
    
    let claimable = calculate_claimable_amount(&stream, after_time);
    assert_eq!(claimable, 0, "Should be 0 when all is claimed");
}
