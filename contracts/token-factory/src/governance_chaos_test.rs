#![cfg(test)]

//! Governance Chaos Tests - Timing Window Boundary Behavior
//!
//! These tests stress-test boundary behavior around start/end/eta times
//! and verify deterministic behavior at exact boundaries.
//!
//! Test Categories:
//! 1. Exact boundary calls (start-1, start, start+1, end-1, end, end+1, eta-1, eta, eta+1)
//! 2. Clock transition edge cases
//! 3. Concurrent operations at boundaries
//! 4. Time overflow/underflow scenarios

use crate::timelock::{
    create_proposal, vote_proposal, schedule_fee_update, execute_change,
    initialize_timelock, get_proposal,
};
use crate::types::{ActionType, VoteChoice, Error};
use crate::storage;
use soroban_sdk::{testutils::Address as _, vec, Env};
use soroban_sdk::testutils::Ledger;

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers - Deterministic Time Control
// ═══════════════════════════════════════════════════════════════════════════

/// Setup test environment with governance initialized
fn setup_chaos() -> (Env, soroban_sdk::Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = soroban_sdk::Address::generate(&env);
    storage::set_admin(&env, &admin);
    storage::set_treasury(&env, &soroban_sdk::Address::generate(&env));
    storage::set_base_fee(&env, 1_000_000);
    storage::set_metadata_fee(&env, 500_000);
    
    // Initialize timelock with 1 hour delay
    initialize_timelock(&env, Some(3600)).unwrap();
    
    (env, admin)
}

/// Jump to exact timestamp (deterministic time control)
fn jump_to_time(env: &Env, target_time: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp = target_time;
    });
}

/// Get current timestamp
fn current_time(env: &Env) -> u64 {
    env.ledger().timestamp()
}

/// Advance time by exact delta
fn advance_time(env: &Env, delta: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + delta;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Category 1: Proposal Creation Timing Boundaries
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_chaos_create_proposal_start_time_exact_boundary() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    
    let payload = vec![&env, 1u8];
    
    // Test: start_time = current (boundary: now)
    jump_to_time(&env, start_time);
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, end_time, eta,
    );
    assert!(result.is_ok(), "Should allow start_time = current");
    
    // Test: start_time = current - 1 (boundary: past)
    jump_to_time(&env, start_time + 1);
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, end_time, eta,
    );
    assert_eq!(result, Err(Error::InvalidTimeWindow), "Should reject start_time in past");
}

#[test]
fn test_chaos_create_proposal_end_time_boundaries() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let eta = current + 100000;
    let payload = vec![&env, 1u8];
    
    // Test: end_time = start_time (boundary: equal)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, start_time, eta,
    );
    assert_eq!(result, Err(Error::InvalidTimeWindow), "Should reject end_time = start_time");
    
    // Test: end_time = start_time + 1 (boundary: minimum valid)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, start_time + 1, eta,
    );
    assert!(result.is_ok(), "Should allow end_time = start_time + 1");
    
    // Test: end_time = start_time - 1 (boundary: before start)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, start_time - 1, eta,
    );
    assert_eq!(result, Err(Error::InvalidTimeWindow), "Should reject end_time < start_time");
}

#[test]
fn test_chaos_create_proposal_eta_boundaries() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 86400;
    let payload = vec![&env, 1u8];
    
    // Test: eta = end_time (boundary: equal)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, end_time, end_time,
    );
    assert_eq!(result, Err(Error::InvalidTimeWindow), "Should reject eta = end_time");
    
    // Test: eta = end_time + 1 (boundary: minimum valid)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, end_time, end_time + 1,
    );
    assert!(result.is_ok(), "Should allow eta = end_time + 1");
    
    // Test: eta = end_time - 1 (boundary: before end)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, end_time, end_time - 1,
    );
    assert_eq!(result, Err(Error::InvalidTimeWindow), "Should reject eta < end_time");
}

// ═══════════════════════════════════════════════════════════════════════════
// Category 2: Voting Window Timing Boundaries
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_chaos_vote_at_start_time_boundaries() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    
    let payload = vec![&env, 1u8];
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, end_time, eta,
    ).unwrap();
    
    let voter = soroban_sdk::Address::generate(&env);
    
    // Test: vote at start_time - 1 (boundary: before start)
    jump_to_time(&env, start_time - 1);
    let result = vote_proposal(&env, &voter, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingNotStarted), "Should reject vote before start_time");
    
    // Test: vote at start_time (boundary: exact start)
    jump_to_time(&env, start_time);
    let result = vote_proposal(&env, &voter, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingNotStarted), "Should reject vote at exact start_time (< not <=)");
    
    // Test: vote at start_time + 1 (boundary: after start)
    jump_to_time(&env, start_time + 1);
    let result = vote_proposal(&env, &voter, proposal_id, VoteChoice::For);
    assert!(result.is_ok(), "Should allow vote at start_time + 1");
}

#[test]
fn test_chaos_vote_at_end_time_boundaries() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    
    let payload = vec![&env, 1u8];
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, end_time, eta,
    ).unwrap();
    
    // Test: vote at end_time - 1 (boundary: before end)
    jump_to_time(&env, end_time - 1);
    let voter1 = soroban_sdk::Address::generate(&env);
    let result = vote_proposal(&env, &voter1, proposal_id, VoteChoice::For);
    assert!(result.is_ok(), "Should allow vote at end_time - 1");
    
    // Test: vote at end_time (boundary: exact end)
    jump_to_time(&env, end_time);
    let voter2 = soroban_sdk::Address::generate(&env);
    let result = vote_proposal(&env, &voter2, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingEnded), "Should reject vote at exact end_time (>= not >)");
    
    // Test: vote at end_time + 1 (boundary: after end)
    jump_to_time(&env, end_time + 1);
    let voter3 = soroban_sdk::Address::generate(&env);
    let result = vote_proposal(&env, &voter3, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingEnded), "Should reject vote after end_time");
}

#[test]
fn test_chaos_vote_window_exact_duration() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 10; // Very short window: 10 seconds
    let eta = end_time + 3600;
    
    let payload = vec![&env, 1u8];
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, end_time, eta,
    ).unwrap();
    
    // Test all timestamps in the window
    for offset in 0..=11 {
        let test_time = start_time + offset;
        jump_to_time(&env, test_time);
        
        let voter = soroban_sdk::Address::generate(&env);
        let result = vote_proposal(&env, &voter, proposal_id, VoteChoice::For);
        
        if offset == 0 {
            // At start_time: should fail (< not <=)
            assert_eq!(result, Err(Error::VotingNotStarted), "Failed at start_time (offset=0)");
        } else if offset >= 1 && offset < 10 {
            // Between start and end: should succeed
            assert!(result.is_ok(), "Failed in valid window (offset={})", offset);
        } else {
            // At or after end_time: should fail
            assert_eq!(result, Err(Error::VotingEnded), "Failed at/after end_time (offset={})", offset);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Category 3: Timelock Execution Timing Boundaries
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_chaos_execute_at_timelock_boundaries() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    
    // Schedule a change
    let change_id = schedule_fee_update(&env, &admin, Some(2_000_000), None).unwrap();
    
    // Get the execute_at time (current + 3600 seconds)
    let execute_at = current + 3600;
    
    // Test: execute at execute_at - 1 (boundary: before timelock)
    jump_to_time(&env, execute_at - 1);
    let result = execute_change(&env, change_id);
    assert_eq!(result, Err(Error::TimelockNotExpired), "Should reject execute before timelock");
    
    // Test: execute at execute_at (boundary: exact timelock)
    jump_to_time(&env, execute_at);
    let result = execute_change(&env, change_id);
    assert!(result.is_ok(), "Should allow execute at exact timelock expiry");
    
    // Verify fee changed
    assert_eq!(storage::get_base_fee(&env), 2_000_000);
}

#[test]
fn test_chaos_execute_at_timelock_boundaries_second_attempt() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    
    // Schedule a change
    let change_id = schedule_fee_update(&env, &admin, Some(3_000_000), None).unwrap();
    
    let execute_at = current + 3600;
    
    // Test: execute at execute_at + 1 (boundary: after timelock)
    jump_to_time(&env, execute_at + 1);
    let result = execute_change(&env, change_id);
    assert!(result.is_ok(), "Should allow execute after timelock");
    
    // Test: execute again (boundary: already executed)
    let result = execute_change(&env, change_id);
    assert_eq!(result, Err(Error::ChangeAlreadyExecuted), "Should reject double execution");
}

// ═══════════════════════════════════════════════════════════════════════════
// Category 4: Clock Transition Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_chaos_time_overflow_protection() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 86400;
    
    // Test: eta near u64::MAX (boundary: overflow risk)
    let payload = vec![&env, 1u8];
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, end_time, u64::MAX,
    );
    assert!(result.is_ok(), "Should handle eta near u64::MAX");
    
    // Test: start_time near u64::MAX
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        u64::MAX - 100000, u64::MAX - 10000, u64::MAX,
    );
    assert!(result.is_ok(), "Should handle start_time near u64::MAX");
}

#[test]
fn test_chaos_zero_duration_windows() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let payload = vec![&env, 1u8];
    
    // Test: end_time = start_time + 1 (minimum duration)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload.clone(),
        start_time, start_time + 1, start_time + 2,
    );
    assert!(result.is_ok(), "Should allow minimum 1-second voting window");
    
    // Test: eta = end_time + 1 (minimum delay)
    let result = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, start_time + 100, start_time + 101,
    );
    assert!(result.is_ok(), "Should allow minimum 1-second eta delay");
}

// ═══════════════════════════════════════════════════════════════════════════
// Category 5: Concurrent Operations at Boundaries
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_chaos_multiple_votes_at_exact_boundary() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    
    let payload = vec![&env, 1u8];
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, end_time, eta,
    ).unwrap();
    
    // Jump to end_time - 1 (last valid moment)
    jump_to_time(&env, end_time - 1);
    
    // Multiple voters at same timestamp
    let voter1 = soroban_sdk::Address::generate(&env);
    let voter2 = soroban_sdk::Address::generate(&env);
    let voter3 = soroban_sdk::Address::generate(&env);
    
    let result1 = vote_proposal(&env, &voter1, proposal_id, VoteChoice::For);
    let result2 = vote_proposal(&env, &voter2, proposal_id, VoteChoice::For);
    let result3 = vote_proposal(&env, &voter3, proposal_id, VoteChoice::Against);
    
    assert!(result1.is_ok(), "First vote should succeed");
    assert!(result2.is_ok(), "Second vote should succeed");
    assert!(result3.is_ok(), "Third vote should succeed");
    
    // Now jump to end_time (boundary crossed)
    jump_to_time(&env, end_time);
    
    let voter4 = soroban_sdk::Address::generate(&env);
    let result4 = vote_proposal(&env, &voter4, proposal_id, VoteChoice::For);
    assert_eq!(result4, Err(Error::VotingEnded), "Vote at end_time should fail");
}

#[test]
fn test_chaos_proposal_lifecycle_all_boundaries() {
    let (env, admin) = setup_chaos();
    
    let base_time = current_time(&env);
    let start_time = base_time + 100;
    let end_time = start_time + 1000;
    let eta = end_time + 500;
    
    let payload = vec![&env, 1u8];
    
    // Create proposal
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, end_time, eta,
    ).unwrap();
    
    // Test voting at all critical boundaries
    let boundaries = vec![
        (start_time - 1, false, "before start"),
        (start_time, false, "at start"),
        (start_time + 1, true, "after start"),
        (end_time - 1, true, "before end"),
        (end_time, false, "at end"),
        (end_time + 1, false, "after end"),
    ];
    
    for (time, should_succeed, label) in boundaries {
        jump_to_time(&env, time);
        let voter = soroban_sdk::Address::generate(&env);
        let result = vote_proposal(&env, &voter, proposal_id, VoteChoice::For);
        
        if should_succeed {
            assert!(result.is_ok(), "Vote should succeed {}", label);
        } else {
            assert!(result.is_err(), "Vote should fail {}", label);
        }
    }
    
    // Schedule change after voting
    jump_to_time(&env, end_time + 100);
    let change_id = schedule_fee_update(&env, &admin, Some(5_000_000), None).unwrap();
    let change_execute_at = end_time + 100 + 3600;
    
    // Test execution at boundaries
    jump_to_time(&env, change_execute_at - 1);
    let result = execute_change(&env, change_id);
    assert_eq!(result, Err(Error::TimelockNotExpired), "Execute should fail before timelock");
    
    jump_to_time(&env, change_execute_at);
    let result = execute_change(&env, change_id);
    assert!(result.is_ok(), "Execute should succeed at timelock expiry");
}

// ═══════════════════════════════════════════════════════════════════════════
// Category 6: Stress Tests - Rapid Time Changes
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_chaos_rapid_time_jumps_during_voting() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 1000;
    let eta = end_time + 3600;
    
    let payload = vec![&env, 1u8];
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, end_time, eta,
    ).unwrap();
    
    // Rapid time jumps with votes
    for i in 0..10 {
        let jump_time = start_time + 1 + (i * 50);
        jump_to_time(&env, jump_time);
        
        let voter = soroban_sdk::Address::generate(&env);
        let result = vote_proposal(&env, &voter, proposal_id, VoteChoice::For);
        
        if jump_time < end_time {
            assert!(result.is_ok(), "Vote should succeed at time {}", jump_time);
        } else {
            assert_eq!(result, Err(Error::VotingEnded), "Vote should fail at time {}", jump_time);
        }
    }
}

#[test]
fn test_chaos_backwards_time_jump_protection() {
    let (env, admin) = setup_chaos();
    
    let current = current_time(&env);
    let start_time = current + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    
    let payload = vec![&env, 1u8];
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start_time, end_time, eta,
    ).unwrap();
    
    // Jump forward to voting period
    jump_to_time(&env, start_time + 1000);
    
    let voter1 = soroban_sdk::Address::generate(&env);
    let result = vote_proposal(&env, &voter1, proposal_id, VoteChoice::For);
    assert!(result.is_ok(), "Vote should succeed in valid window");
    
    // Jump backwards (simulating clock adjustment)
    jump_to_time(&env, start_time - 100);
    
    let voter2 = soroban_sdk::Address::generate(&env);
    let result = vote_proposal(&env, &voter2, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingNotStarted), "Vote should fail after backwards time jump");
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary Test - All Boundaries in One Flow
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_chaos_comprehensive_boundary_verification() {
    let (env, admin) = setup_chaos();
    
    let base = current_time(&env);
    
    // Define all critical timestamps
    let start = base + 1000;
    let end = start + 5000;
    let eta = end + 2000;
    let timelock_delay = 3600;
    
    let payload = vec![&env, 1u8];
    
    // Create proposal
    let proposal_id = create_proposal(
        &env, &admin, ActionType::FeeChange, payload,
        start, end, eta,
    ).unwrap();
    
    // Test matrix: [time_offset, operation, expected_result]
    let test_cases = vec![
        // Before voting starts
        (start - 1, "vote", false),
        (start, "vote", false),
        (start + 1, "vote", true),
        
        // During voting
        (start + 2500, "vote", true),
        
        // End of voting
        (end - 1, "vote", true),
        (end, "vote", false),
        (end + 1, "vote", false),
    ];
    
    let mut voter_count = 0;
    for (time, operation, should_succeed) in test_cases {
        jump_to_time(&env, time);
        
        if operation == "vote" {
            let voter = soroban_sdk::Address::generate(&env);
            let result = vote_proposal(&env, &voter, proposal_id, VoteChoice::For);
            
            if should_succeed {
                assert!(result.is_ok(), "Operation '{}' should succeed at time {}", operation, time);
                voter_count += 1;
            } else {
                assert!(result.is_err(), "Operation '{}' should fail at time {}", operation, time);
            }
        }
    }
    
    // Verify vote count
    let proposal = get_proposal(&env, proposal_id).unwrap();
    assert_eq!(proposal.votes_for, voter_count, "Vote count should match successful votes");
    
    // Test timelock execution boundaries
    jump_to_time(&env, end + 100);
    let change_id = schedule_fee_update(&env, &admin, Some(10_000_000), None).unwrap();
    let execute_at = end + 100 + timelock_delay;
    
    jump_to_time(&env, execute_at - 1);
    assert_eq!(execute_change(&env, change_id), Err(Error::TimelockNotExpired));
    
    jump_to_time(&env, execute_at);
    assert!(execute_change(&env, change_id).is_ok());
    
    assert_eq!(storage::get_base_fee(&env), 10_000_000);
}
