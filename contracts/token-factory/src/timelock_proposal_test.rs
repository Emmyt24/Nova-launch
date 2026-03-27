#![cfg(test)]

use crate::timelock::{create_proposal, get_proposal, initialize_timelock};
use crate::types::{ActionType, Error};
use crate::test_helpers::*;
use soroban_sdk::vec;

#[test]
fn test_create_proposal_valid() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    
    let current_time = time.now();
    let start_time = current_time + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    
    let payload = test_payload(&test_env.env, &[1, 2, 3]);
    
    let proposal_id = create_proposal(
        &test_env.env,
        &test_env.admin,
        ActionType::FeeChange,
        payload.clone(),
        start_time,
        end_time,
        eta,
    ).unwrap();
    
    assert_eq!(proposal_id, 0);
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_proposal_count(1);
    
    let proposal = get_proposal(&test_env.env, proposal_id).unwrap();
    assert_eq!(proposal.id, proposal_id);
    assert_eq!(proposal.proposer, test_env.admin);
    assert_eq!(proposal.action_type, ActionType::FeeChange);
    assert_eq!(proposal.payload, payload);
    assert_eq!(proposal.start_time, start_time);
    assert_eq!(proposal.end_time, end_time);
    assert_eq!(proposal.eta, eta);
    assert_eq!(proposal.created_at, current_time);
    assert_eq!(proposal.votes_for, 0);
    assert_eq!(proposal.votes_against, 0);
    assert_eq!(proposal.votes_abstain, 0);
}

#[test]
fn test_create_proposal_unauthorized() {
    let test_env = TestEnv::with_timelock(3600);
    let actors = ActorGenerator::new(&test_env.env);
    let unauthorized = actors.generate();
    
    let time = TimeController::new(&test_env.env);
    let current_time = time.now();
    
    let payload = test_payload(&test_env.env, &[1, 2, 3]);
    
    let result = create_proposal(
        &test_env.env,
        &unauthorized,
        ActionType::FeeChange,
        payload,
        current_time + 100,
        current_time + 86500,
        current_time + 90100,
    );
    
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn test_create_proposal_start_time_in_past() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    
    let current_time = time.now();
    let start_time = current_time - 100;
    let end_time = current_time + 86400;
    let eta = end_time + 3600;
    
    let payload = test_payload(&test_env.env, &[1, 2, 3]);
    
    let result = create_proposal(
        &test_env.env,
        &test_env.admin,
        ActionType::FeeChange,
        payload,
        start_time,
        end_time,
        eta,
    );
    
    assert_eq!(result, Err(Error::InvalidTimeWindow));
}

#[test]
fn test_create_proposal_end_before_start() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    
    let current_time = time.now();
    let start_time = current_time + 100;
    let end_time = start_time - 10;
    let eta = end_time + 3600;
    
    let payload = test_payload(&test_env.env, &[1, 2, 3]);
    
    let result = create_proposal(
        &test_env.env,
        &test_env.admin,
        ActionType::FeeChange,
        payload,
        start_time,
        end_time,
        eta,
    );
    
    assert_eq!(result, Err(Error::InvalidTimeWindow));
}

#[test]
fn test_create_proposal_eta_before_end() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    
    let current_time = time.now();
    let start_time = current_time + 100;
    let end_time = start_time + 86400;
    let eta = end_time - 100;
    
    let payload = test_payload(&test_env.env, &[1, 2, 3]);
    
    let result = create_proposal(
        &test_env.env,
        &test_env.admin,
        ActionType::FeeChange,
        payload,
        start_time,
        end_time,
        eta,
    );
    
    assert_eq!(result, Err(Error::InvalidTimeWindow));
}

#[test]
fn test_create_proposal_payload_too_large() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    
    let current_time = time.now();
    let start_time = current_time + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    
    // Create payload larger than 1024 bytes
    let large_payload = test_payload(&test_env.env, &[1u8; 1025]);
    
    let result = create_proposal(
        &test_env.env,
        &test_env.admin,
        ActionType::FeeChange,
        large_payload,
        start_time,
        end_time,
        eta,
    );
    
    assert_eq!(result, Err(Error::PayloadTooLarge));
}

#[test]
fn test_create_proposal_max_payload_size() {
    let test_env = TestEnv::with_timelock(3600);
    
    let proposal_id = ProposalBuilder::new(&test_env.env, &test_env.admin)
        .payload({
            test_payload(&test_env.env, &[1u8; 1024])
        })
        .build()
        .unwrap();
    
    let proposal = get_proposal(&test_env.env, proposal_id).unwrap();
    assert_eq!(proposal.payload.len(), 1024);
}

#[test]
fn test_create_multiple_proposals() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    
    let current_time = time.now();
    let payload = test_payload(&test_env.env, &[1, 2, 3]);
    
    let proposal_id_1 = create_proposal(
        &test_env.env,
        &test_env.admin,
        ActionType::FeeChange,
        payload.clone(),
        current_time + 100,
        current_time + 86500,
        current_time + 90100,
    ).unwrap();
    
    let proposal_id_2 = create_proposal(
        &test_env.env,
        &test_env.admin,
        ActionType::TreasuryChange,
        payload,
        current_time + 200,
        current_time + 86600,
        current_time + 90200,
    ).unwrap();
    
    assert_eq!(proposal_id_1, 0);
    assert_eq!(proposal_id_2, 1);
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_proposal_count(2);
    
    let prop1 = get_proposal(&test_env.env, proposal_id_1).unwrap();
    let prop2 = get_proposal(&test_env.env, proposal_id_2).unwrap();
    
    assert_eq!(prop1.action_type, ActionType::FeeChange);
    assert_eq!(prop2.action_type, ActionType::TreasuryChange);
}

#[test]
fn test_create_proposal_different_action_types() {
    let test_env = TestEnv::with_timelock(3600);
    let time = TimeController::new(&test_env.env);
    
    let current_time = time.now();
    let start_time = current_time + 100;
    let end_time = start_time + 86400;
    let eta = end_time + 3600;
    let payload = test_payload(&test_env.env, &[1, 2, 3]);
    
    let action_types = vec![
        &test_env.env,
        ActionType::FeeChange,
        ActionType::TreasuryChange,
        ActionType::PauseContract,
        ActionType::UnpauseContract,
        ActionType::PolicyUpdate,
    ];
    
    for (i, action_type) in action_types.iter().enumerate() {
        let proposal_id = create_proposal(
            &test_env.env,
            &test_env.admin,
            action_type.clone(),
            payload.clone(),
            start_time + (i as u64 * 1000),
            end_time + (i as u64 * 1000),
            eta + (i as u64 * 1000),
        ).unwrap();
        
        let proposal = get_proposal(&test_env.env, proposal_id).unwrap();
        assert_eq!(proposal.action_type, action_type);
    }
    
    let state = StateAssertions::new(&test_env.env);
    state.assert_proposal_count(5);
}

#[test]
fn test_get_nonexistent_proposal() {
    let test_env = TestEnv::with_timelock(3600);
    
    let result = get_proposal(&test_env.env, 999);
    assert!(result.is_none());
}

#[test]
fn test_create_proposal_empty_payload() {
    let test_env = TestEnv::with_timelock(3600);
    
    let proposal_id = ProposalBuilder::new(&test_env.env, &test_env.admin)
        .payload(test_payload(&test_env.env, &[]))
        .build()
        .unwrap();
    
    let proposal = get_proposal(&test_env.env, proposal_id).unwrap();
    assert_eq!(proposal.payload.len(), 0);
}
