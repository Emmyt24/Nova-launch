#![cfg(test)]

//! Queue Proposal Tests
//!
//! Tests for the queue_proposal functionality including:
//! - Quorum validation
//! - State transition checks
//! - Premature queueing prevention
//! - Successful queueing flow

use crate::timelock::{
    create_proposal, vote_proposal, queue_proposal, get_proposal, initialize_timelock,
};
use crate::types::{ActionType, VoteChoice, Error, ProposalState};
use crate::storage;
use soroban_sdk::{testutils::Address as _, vec, Env};
use soroban_sdk::testutils::{Ledger, Events};
use soroban_sdk::Symbol;

fn setup_governance() -> (Env, soroban_sdk::Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = soroban_sdk::Address::generate(&env);
    storage::set_admin(&env, &admin);
    storage::set_treasury(&env, &soroban_sdk::Address::generate(&env));
    storage::set_base_fee(&env, 1_000_000);
    storage::set_metadata_fee(&env, 500_000);
    
    initialize_timelock(&env, Some(3600)).unwrap();
    
    (env, admin)
}

fn create_test_proposal(
    env: &Env, 
    admin: &soroban_sdk::Address,
) -> u64 {
    let current_time = env.ledger().timestamp();
    let start_time = current_time + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 7200;
    
    let payload = vec![env, 1u8, 2u8, 3u8, 4u8, 5u8, 6u8, 7u8, 8u8];
    
    create_proposal(
        env,
        admin,
        ActionType::PauseContract,
        payload,
        start_time,
        end_time,
        eta,
    ).unwrap()
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 1: Queue proposal - quorum not met (more against than for)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_quorum_not_met() {
    let (env, admin) = setup_governance();
    let proposal_id = create_test_proposal(&env, &admin);
    
    // Advance to voting period
    let proposal = get_proposal(&env, proposal_id).unwrap();
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.start_time + 1000;
    });
    
    // Vote with more against than for
    let voter1 = soroban_sdk::Address::generate(&env);
    let voter2 = soroban_sdk::Address::generate(&env);
    let voter3 = soroban_sdk::Address::generate(&env);
    
    vote_proposal(&env, &voter1, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter2, proposal_id, VoteChoice::Against).unwrap();
    vote_proposal(&env, &voter3, proposal_id, VoteChoice::Against).unwrap();
    
    // Advance past voting period
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.end_time + 100;
    });
    
    // Attempt to queue - should fail with QuorumNotMet
    let result = queue_proposal(&env, proposal_id);
    assert_eq!(result, Err(Error::Unauthorized));
    
    // Verify proposal state is Defeated
    let proposal = get_proposal(&env, proposal_id).unwrap();
    assert_eq!(proposal.state, ProposalState::Defeated);
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 2: Queue proposal - premature attempt (voting still ongoing)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_premature_attempt() {
    let (env, admin) = setup_governance();
    let proposal_id = create_test_proposal(&env, &admin);
    
    // Advance to voting period
    let proposal = get_proposal(&env, proposal_id).unwrap();
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.start_time + 1000;
    });
    
    // Vote with majority for
    let voter1 = soroban_sdk::Address::generate(&env);
    let voter2 = soroban_sdk::Address::generate(&env);
    let voter3 = soroban_sdk::Address::generate(&env);
    
    vote_proposal(&env, &voter1, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter2, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter3, proposal_id, VoteChoice::Against).unwrap();
    
    // Attempt to queue while voting is still ongoing
    let result = queue_proposal(&env, proposal_id);
    assert_eq!(result, Err(Error::VotingEnded));
    
    // Verify proposal is still Active
    let proposal = get_proposal(&env, proposal_id).unwrap();
    assert_eq!(proposal.state, ProposalState::Active);
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 3: Queue proposal - successful queueing
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_success() {
    let (env, admin) = setup_governance();
    let proposal_id = create_test_proposal(&env, &admin);
    
    // Advance to voting period
    let proposal = get_proposal(&env, proposal_id).unwrap();
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.start_time + 1000;
    });
    
    // Vote with majority for
    let voter1 = soroban_sdk::Address::generate(&env);
    let voter2 = soroban_sdk::Address::generate(&env);
    let voter3 = soroban_sdk::Address::generate(&env);
    
    vote_proposal(&env, &voter1, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter2, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter3, proposal_id, VoteChoice::Against).unwrap();
    
    // Advance past voting period
    let queue_time = proposal.end_time + 100;
    env.ledger().with_mut(|li| {
        li.timestamp = queue_time;
    });
    
    // Queue the proposal
    let result = queue_proposal(&env, proposal_id);
    assert!(result.is_ok());
    
    // Verify proposal state is Queued
    let proposal = get_proposal(&env, proposal_id).unwrap();
    assert_eq!(proposal.state, ProposalState::Queued);
    
    // Verify event was emitted
    let events = env.events().all();
    let last_event = events.last().unwrap();
    
    assert_eq!(
        last_event.topics,
        (Symbol::new(&env, "prop_que"), proposal_id)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 4: Queue proposal - already queued
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_already_queued() {
    let (env, admin) = setup_governance();
    let proposal_id = create_test_proposal(&env, &admin);
    
    // Advance to voting period
    let proposal = get_proposal(&env, proposal_id).unwrap();
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.start_time + 1000;
    });
    
    // Vote with majority for
    let voter1 = soroban_sdk::Address::generate(&env);
    let voter2 = soroban_sdk::Address::generate(&env);
    
    vote_proposal(&env, &voter1, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter2, proposal_id, VoteChoice::For).unwrap();
    
    // Advance past voting period
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.end_time + 100;
    });
    
    // Queue the proposal first time
    queue_proposal(&env, proposal_id).unwrap();
    
    // Attempt to queue again
    let result = queue_proposal(&env, proposal_id);
    assert_eq!(result, Err(Error::InvalidParameters));
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 5: Queue proposal - nonexistent proposal
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_not_found() {
    let (env, _admin) = setup_governance();
    
    let result = queue_proposal(&env, 999);
    assert_eq!(result, Err(Error::ProposalNotFound));
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 6: Queue proposal - tie vote (equal for and against)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_tie_vote() {
    let (env, admin) = setup_governance();
    let proposal_id = create_test_proposal(&env, &admin);
    
    // Advance to voting period
    let proposal = get_proposal(&env, proposal_id).unwrap();
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.start_time + 1000;
    });
    
    // Vote with equal for and against
    let voter1 = soroban_sdk::Address::generate(&env);
    let voter2 = soroban_sdk::Address::generate(&env);
    
    vote_proposal(&env, &voter1, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter2, proposal_id, VoteChoice::Against).unwrap();
    
    // Advance past voting period
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.end_time + 100;
    });
    
    // Attempt to queue - should fail (tie is not a win)
    let result = queue_proposal(&env, proposal_id);
    assert_eq!(result, Err(Error::Unauthorized));
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 7: Queue proposal - with abstain votes
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_with_abstain() {
    let (env, admin) = setup_governance();
    let proposal_id = create_test_proposal(&env, &admin);
    
    // Advance to voting period
    let proposal = get_proposal(&env, proposal_id).unwrap();
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.start_time + 1000;
    });
    
    // Vote with majority for, some abstain
    let voter1 = soroban_sdk::Address::generate(&env);
    let voter2 = soroban_sdk::Address::generate(&env);
    let voter3 = soroban_sdk::Address::generate(&env);
    let voter4 = soroban_sdk::Address::generate(&env);
    
    vote_proposal(&env, &voter1, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter2, proposal_id, VoteChoice::For).unwrap();
    vote_proposal(&env, &voter3, proposal_id, VoteChoice::Against).unwrap();
    vote_proposal(&env, &voter4, proposal_id, VoteChoice::Abstain).unwrap();
    
    // Advance past voting period
    env.ledger().with_mut(|li| {
        li.timestamp = proposal.end_time + 100;
    });
    
    // Queue should succeed (abstain doesn't count against)
    let result = queue_proposal(&env, proposal_id);
    assert!(result.is_ok());
    
    let proposal = get_proposal(&env, proposal_id).unwrap();
    assert_eq!(proposal.state, ProposalState::Queued);
    assert_eq!(proposal.votes_for, 2);
    assert_eq!(proposal.votes_against, 1);
    assert_eq!(proposal.votes_abstain, 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 8: Queue proposal - before voting starts
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_queue_proposal_before_voting_starts() {
    let (env, admin) = setup_governance();
    let proposal_id = create_test_proposal(&env, &admin);
    
    // Don't advance time - voting hasn't started
    let result = queue_proposal(&env, proposal_id);
    assert_eq!(result, Err(Error::VotingNotStarted));
}
