#![cfg(test)]

use crate::timelock::{create_proposal, vote_proposal, get_vote_counts, has_voted, get_proposal, initialize_timelock};
use crate::types::{ActionType, VoteChoice, Error};
use crate::test_helpers::*;
use soroban_sdk::vec;

fn create_test_proposal_for_voting(test_env: &TestEnv) -> u64 {
    ProposalBuilder::new(&test_env.env, &test_env.admin)
        .build()
        .unwrap()
}

#[test]
fn test_vote_proposal_valid() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voter, proposal_id, VoteChoice::For).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_has_voted(proposal_id, &voter);
    state.assert_vote_counts(proposal_id, 1, 0, 0);
}

#[test]
fn test_vote_proposal_duplicate_rejection() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voter, proposal_id, VoteChoice::For).unwrap();
    
    let result = vote_helper.cast(&voter, proposal_id, VoteChoice::Against);
    assert_eq!(result, Err(Error::AlreadyVoted));
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_vote_counts(proposal_id, 1, 0, 0);
}

#[test]
fn test_vote_before_start_time() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    let result = vote_helper.cast(&voter, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingNotStarted));
}

#[test]
fn test_vote_at_exact_start_time() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(100);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voter, proposal_id, VoteChoice::For).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_vote_counts(proposal_id, 1, 0, 0);
}

#[test]
fn test_vote_at_exact_end_time() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(100 + 86400);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    let result = vote_helper.cast(&voter, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingEnded));
}

#[test]
fn test_vote_after_end_time() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(100 + 86400 + 1000);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    let result = vote_helper.cast(&voter, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingEnded));
}

#[test]
fn test_vote_one_second_before_end() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(100 + 86400 - 1);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voter, proposal_id, VoteChoice::For).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_vote_counts(proposal_id, 1, 0, 0);
}

#[test]
fn test_vote_nonexistent_proposal() {
    let test_env = TestEnv::with_timelock(3600);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    let result = vote_helper.cast(&voter, 999, VoteChoice::For);
    assert_eq!(result, Err(Error::ProposalNotFound));
}

#[test]
fn test_multiple_voters_for() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voters = actors.generate_many(3);
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast_many(&voters, proposal_id, VoteChoice::For).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_vote_counts(proposal_id, 3, 0, 0);
}

#[test]
fn test_multiple_voters_mixed() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voters = actors.generate_many(5);
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voters[0], proposal_id, VoteChoice::For).unwrap();
    vote_helper.cast(&voters[1], proposal_id, VoteChoice::For).unwrap();
    vote_helper.cast(&voters[2], proposal_id, VoteChoice::Against).unwrap();
    vote_helper.cast(&voters[3], proposal_id, VoteChoice::Abstain).unwrap();
    vote_helper.cast(&voters[4], proposal_id, VoteChoice::Against).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_vote_counts(proposal_id, 2, 2, 1);
}

#[test]
fn test_vote_all_abstain() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voters = actors.generate_many(2);
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast_many(&voters, proposal_id, VoteChoice::Abstain).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_vote_counts(proposal_id, 0, 0, 2);
}

#[test]
fn test_has_voted_check() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voters = actors.generate_many(2);
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_not_voted(proposal_id, &voters[0]);
    state.assert_not_voted(proposal_id, &voters[1]);
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voters[0], proposal_id, VoteChoice::For).unwrap();
    
    state.assert_has_voted(proposal_id, &voters[0]);
    state.assert_not_voted(proposal_id, &voters[1]);
    
    vote_helper.cast(&voters[1], proposal_id, VoteChoice::Against).unwrap();
    
    state.assert_has_voted(proposal_id, &voters[0]);
    state.assert_has_voted(proposal_id, &voters[1]);
}

#[test]
fn test_vote_counts_for_nonexistent_proposal() {
    let test_env = TestEnv::with_timelock(3600);
    
    let vote_helper = VoteHelper::new(&test_env.env);
    let result = vote_helper.counts(999);
    assert!(result.is_none());
}

#[test]
fn test_admin_can_vote() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&test_env.admin, proposal_id, VoteChoice::For).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_has_voted(proposal_id, &test_env.admin);
    state.assert_vote_counts(proposal_id, 1, 0, 0);
}

#[test]
fn test_vote_persistence() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voter, proposal_id, VoteChoice::For).unwrap();
    
    let proposal = get_proposal(&test_env.env, proposal_id).unwrap();
    assert_eq!(proposal.votes_for, 1);
    assert_eq!(proposal.votes_against, 0);
    assert_eq!(proposal.votes_abstain, 0);
}

#[test]
fn test_different_proposals_independent_votes() {
    let test_env = TestEnv::with_timelock(3600);
    
    let proposal_id_1 = create_test_proposal_for_voting(&test_env);
    let proposal_id_2 = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(150);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    vote_helper.cast(&voter, proposal_id_1, VoteChoice::For).unwrap();
    vote_helper.cast(&voter, proposal_id_2, VoteChoice::Against).unwrap();
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_has_voted(proposal_id_1, &voter);
    state.assert_has_voted(proposal_id_2, &voter);
    state.assert_vote_counts(proposal_id_1, 1, 0, 0);
    state.assert_vote_counts(proposal_id_2, 0, 1, 0);
}

#[test]
fn test_vote_boundary_start_minus_one() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(99);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    let result = vote_helper.cast(&voter, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingNotStarted));
}

#[test]
fn test_vote_boundary_end_plus_one() {
    let test_env = TestEnv::with_timelock(3600);
    let proposal_id = create_test_proposal_for_voting(&test_env);
    
    let time = TimeController::new(&test_env.env);
    time.advance(100 + 86400 + 1);
    
    let actors = ActorGenerator::new(&test_env.env);
    let voter = actors.generate();
    
    let vote_helper = VoteHelper::new(&test_env.env);
    let result = vote_helper.cast(&voter, proposal_id, VoteChoice::For);
    assert_eq!(result, Err(Error::VotingEnded));
}
