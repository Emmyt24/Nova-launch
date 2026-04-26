#![cfg(test)]

use crate::proposal_state_machine::ProposalStateMachine;
use crate::storage;
use crate::streaming::{claim_stream, create_stream, get_stream};
use crate::test_helpers::*;
use crate::timelock::{
    cancel_change, create_proposal, execute_change, execute_proposal, finalize_proposal,
    get_pending_change, get_proposal, queue_proposal, schedule_fee_update, vote_proposal,
};
use crate::types::{ActionType, Error, GovernanceConfig, ProposalState, StreamParams, VoteChoice};
use soroban_sdk::{testutils::Address as _, vec, Address, Bytes, Env};

fn setup_factory(test_env: &TestEnv) {
    // Already partially set up in TestEnv::new()
    // We might need to ensure tokens exist for streaming tests
    let token_addr = Address::generate(&test_env.env);
    let initial_supply = 1_000_000_000; // Define initial_supply for the context
    let token_info = crate::types::TokenInfo {
        address: token_addr.clone(),
        creator: test_env.admin.clone(),
        name: soroban_sdk::String::from_str(&test_env.env, "Test Token"),
        symbol: soroban_sdk::String::from_str(&test_env.env, "TEST"),
        decimals: 7,
        total_supply: initial_supply,
        initial_supply,
        max_supply: None,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        metadata_version: 0,
        created_at: test_env.env.ledger().timestamp(),
        is_paused: false,
        clawback_enabled: false,
        freeze_enabled: false,
    };
    storage::set_token_info(&test_env.env, 0, &token_info);
    storage::increment_token_count(&test_env.env).unwrap();

    // Initialize governance config for state machine
    storage::set_governance_config(
        &test_env.env,
        &GovernanceConfig {
            quorum_percent: 50,
            approval_percent: 50,
        },
    );
}

fn get_prop_state(env: &Env, prop: &crate::types::Proposal) -> ProposalState {
    let config = storage::get_governance_config(env);
    ProposalStateMachine::get_proposal_state(env, prop, &config)
}

// ========================================================================
// 1. Boundary-Time Test Matrix (t-1, t, t+1)
// ========================================================================

#[test]
fn test_governance_voting_boundaries() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();

    // Proposal: start=100, end=100 + 86400
    let proposal_id = ProposalBuilder::new(&test_env.env, &test_env.admin)
        .build()
        .unwrap();

    // t-1: VotingNotStarted
    set_time(&test_env.env, 99);
    let res = vote_proposal(&test_env.env, &voter, proposal_id, VoteChoice::For);
    assert_eq!(res, Err(Error::VotingNotStarted));

    // t: Success (Inclusive start)
    set_time(&test_env.env, 100);
    vote_proposal(&test_env.env, &voter, proposal_id, VoteChoice::For).unwrap();

    // t+1: Success
    let voter2 = actors.generate();
    set_time(&test_env.env, 101);
    vote_proposal(&test_env.env, &voter2, proposal_id, VoteChoice::For).unwrap();

    // Near end boundary
    let end_time = 100 + 86400;

    // t-1 (end): Success
    let voter3 = actors.generate();
    set_time(&test_env.env, end_time - 1);
    vote_proposal(&test_env.env, &voter3, proposal_id, VoteChoice::For).unwrap();

    // t (end): VotingEnded (End is exclusive)
    let voter4 = actors.generate();
    set_time(&test_env.env, end_time);
    let res = vote_proposal(&test_env.env, &voter4, proposal_id, VoteChoice::For);
    assert_eq!(res, Err(Error::VotingEnded));

    // t+1 (end): VotingEnded
    let voter5 = actors.generate();
    set_time(&test_env.env, end_time + 1);
    let res = vote_proposal(&test_env.env, &voter5, proposal_id, VoteChoice::For);
    assert_eq!(res, Err(Error::VotingEnded));
}

#[test]
fn test_governance_finalization_boundaries() {
    let test_env = TestEnv::with_timelock(3600);
    // proposal: start=100, end=86500
    let proposal_id = ProposalBuilder::new(&test_env.env, &test_env.admin)
        .build()
        .unwrap();
    let end_time = 86500;

    // t-1: VotingEnded (Cannot finalize before end)
    set_time(&test_env.env, end_time - 1);
    let res = finalize_proposal(&test_env.env, proposal_id);
    assert_eq!(res, Err(Error::VotingEnded));

    // t: Success
    set_time(&test_env.env, end_time);
    finalize_proposal(&test_env.env, proposal_id).unwrap();

    let prop = get_proposal(&test_env.env, proposal_id).unwrap();
    let state = get_prop_state(&test_env.env, &prop);
    assert!(state != ProposalState::Created && state != ProposalState::Active);

    // t+1: Redundant Success (already finalized)
    set_time(&test_env.env, end_time + 1);
    finalize_proposal(&test_env.env, proposal_id).unwrap();
}

#[test]
fn test_governance_execution_boundaries() {
    let test_env = TestEnv::with_timelock(3600);
    let actors = ActorGenerator::new(&test_env.env);
    let voters = actors.generate_many(3);

    // proposal: start=100, end=86500, eta=90100
    let proposal_id = ProposalBuilder::new(&test_env.env, &test_env.admin)
        .build()
        .unwrap();
    let eta = 90100;

    // Pass the proposal
    set_time(&test_env.env, 150);
    for v in voters {
        vote_proposal(&test_env.env, &v, proposal_id, VoteChoice::For).unwrap();
    }

    // Queue it
    set_time(&test_env.env, 86500);
    queue_proposal(&test_env.env, proposal_id).unwrap();

    // t-1: TimelockNotExpired
    set_time(&test_env.env, eta - 1);
    let res = execute_proposal(&test_env.env, proposal_id);
    assert_eq!(res, Err(Error::TimelockNotExpired));

    // t: Success
    set_time(&test_env.env, eta);
    execute_proposal(&test_env.env, proposal_id).unwrap();

    let prop = get_proposal(&test_env.env, proposal_id).unwrap();
    assert_eq!(
        get_prop_state(&test_env.env, &prop),
        ProposalState::Executed
    );
}

#[test]
fn test_timelock_admin_change_boundaries() {
    let test_env = TestEnv::with_timelock(3600); // 1 hour delay

    set_time(&test_env.env, 1000);
    let change_id =
        schedule_fee_update(&test_env.env, &test_env.admin, Some(2_000_000), None).unwrap();
    let execute_at = 1000 + 3600;

    // t-1: TimelockNotExpired
    set_time(&test_env.env, execute_at - 1);
    let res = execute_change(&test_env.env, change_id);
    assert_eq!(res, Err(Error::TimelockNotExpired));

    // t: Success
    set_time(&test_env.env, execute_at);
    execute_change(&test_env.env, change_id).unwrap();

    let change = get_pending_change(&test_env.env, change_id).unwrap();
    assert!(change.executed);
}

#[test]
fn test_streaming_cliff_boundaries() {
    let test_env = TestEnv::new(); // admin is at index 0 generally
    setup_factory(&test_env);

    let recipient = Address::generate(&test_env.env);
    let params = StreamParams {
        recipient: recipient.clone(),
        token_index: 0,
        total_amount: 1000,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };

    let stream_id = create_stream(&test_env.env, &test_env.admin, &params).unwrap();

    // t-1: CliffNotReached
    set_time(&test_env.env, 149);
    let res = claim_stream(&test_env.env, &recipient, stream_id);
    assert_eq!(res, Err(Error::CliffNotReached));

    // t: Success (50% vested)
    set_time(&test_env.env, 150);
    let claimed = claim_stream(&test_env.env, &recipient, stream_id).unwrap();
    assert_eq!(claimed, 500);

    // t+1: Success
    // (151 - 100) / 100 * 1000 = 510 total vested. 510 - 500 = 10 claimable.
    set_time(&test_env.env, 151);
    let claimed2 = claim_stream(&test_env.env, &recipient, stream_id).unwrap();
    assert_eq!(claimed2, 10);
}

// ========================================================================
// 2. Chained Operations / Hostile Sequencing
// ========================================================================

#[test]
fn test_race_finalize_vs_vote() {
    let test_env = TestEnv::with_timelock(3600);
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();

    let proposal_id = ProposalBuilder::new(&test_env.env, &test_env.admin)
        .build()
        .unwrap();
    let end_time = 86500;

    set_time(&test_env.env, end_time);

    // Try to vote AT end_time - should fail
    let res_vote = vote_proposal(&test_env.env, &voter, proposal_id, VoteChoice::For);
    assert_eq!(res_vote, Err(Error::VotingEnded));

    // Finalize AT end_time - should succeed
    finalize_proposal(&test_env.env, proposal_id).unwrap();
}

#[test]
fn test_back_to_back_lifecycle() {
    let test_env = TestEnv::with_timelock(3600);
    let actors = ActorGenerator::new(&test_env.env);
    let voters = actors.generate_many(3);

    // 1. Create
    set_time(&test_env.env, 1000);
    let proposal_id = ProposalBuilder::new(&test_env.env, &test_env.admin)
        .build()
        .unwrap();

    // 2. Vote
    set_time(&test_env.env, 1100);
    for v in &voters {
        vote_proposal(&test_env.env, v, proposal_id, VoteChoice::For).unwrap();
    }

    // 3. Queue (Earliest possible: end_time)
    let end_time = 1100 + 86400;
    set_time(&test_env.env, end_time);
    queue_proposal(&test_env.env, proposal_id).unwrap();

    // 4. Execute (Earliest possible: eta)
    let eta = end_time + 3600;
    set_time(&test_env.env, eta);
    execute_proposal(&test_env.env, proposal_id).unwrap();

    let prop = get_proposal(&test_env.env, proposal_id).unwrap();
    assert_eq!(
        get_prop_state(&test_env.env, &prop),
        ProposalState::Executed
    );
}

#[test]
fn test_cancel_vs_execute_race() {
    let test_env = TestEnv::with_timelock(3600);

    set_time(&test_env.env, 1000);
    let change_id =
        schedule_fee_update(&test_env.env, &test_env.admin, Some(2_000_000), None).unwrap();
    let execute_at = 1000 + 3600;

    set_time(&test_env.env, execute_at);

    // Admin decides to cancel exactly when it's executable
    cancel_change(&test_env.env, &test_env.admin, change_id).unwrap();

    // Try to execute cancelled change
    let res = execute_change(&test_env.env, change_id);
    assert_eq!(res, Err(Error::TokenNotFound)); // remove_pending_change is called in cancel_change
}
