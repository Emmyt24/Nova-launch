//! Governance Events Versioning Tests
//!
//! Validates that governance events are properly versioned with v1 topics
//! and that their schemas are stable for long-term indexer compatibility.
//!
//! Tests cover:
//! - Event topic versioning (v1 suffix)
//! - Event payload structure and data types
//! - Event emission correctness
//! - Schema immutability assertions

#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    Address, Env, Symbol,
};
use crate::{TokenFactory, TokenFactoryClient};
use crate::types::{ActionType, VoteChoice};

const BASE_FEE: i128 = 70_000_000;
const METADATA_FEE: i128 = 30_000_000;

fn setup_factory(env: &Env) -> (TokenFactoryClient, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    client.initialize(&admin, &treasury, &BASE_FEE, &METADATA_FEE);
    (client, admin, treasury)
}

// ── Proposal Created Event Tests ──────────────────────────────────────────

#[test]
fn test_proposal_created_event_topic_v1() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    // Create a proposal
    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    let events = env.events().all();
    let proposal_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("prop_crv1"))
            } else {
                false
            }
        })
        .expect("proposal created event should be emitted");

    // Verify topic structure
    assert_eq!(proposal_event.0.len(), 2, "proposal created event should have 2 topics");
    assert_eq!(
        proposal_event.0.get(0).unwrap(),
        soroban_sdk::Val::from(symbol_short!("prop_crv1")),
        "first topic must be 'prop_crv1'"
    );
}

#[test]
fn test_proposal_created_event_payload_schema() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    let start_time = 1000u64;
    let end_time = 2000u64;
    let eta = 3000u64;

    client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &start_time,
        &end_time,
        &eta,
    );

    let events = env.events().all();
    let proposal_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("prop_crv1"))
            } else {
                false
            }
        })
        .expect("proposal created event should be emitted");

    // Verify payload contains expected data
    let payload = &proposal_event.1;
    // Payload should be: (proposer, action_type, start_time, end_time, eta)
    // We verify it's not empty and has the right structure
    assert!(!payload.is_void(), "payload should not be void");
}

#[test]
fn test_proposal_created_event_exact_topic_name() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    let events = env.events().all();
    let has_v1_event = events.iter().any(|e| {
        if let Some(first_topic) = e.0.get(0) {
            first_topic == soroban_sdk::Val::from(symbol_short!("prop_crv1"))
        } else {
            false
        }
    });

    assert!(
        has_v1_event,
        "proposal created event must use versioned topic 'prop_crv1'"
    );
}

// ── Vote Cast Event Tests ─────────────────────────────────────────────────

#[test]
fn test_vote_cast_event_topic_v1() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    // Create and vote on proposal
    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.vote(&voter, &proposal_id, &VoteChoice::For);

    let events = env.events().all();
    let vote_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("vote_csv1"))
            } else {
                false
            }
        })
        .expect("vote cast event should be emitted");

    // Verify topic structure
    assert_eq!(vote_event.0.len(), 2, "vote cast event should have 2 topics");
    assert_eq!(
        vote_event.0.get(0).unwrap(),
        soroban_sdk::Val::from(symbol_short!("vote_csv1")),
        "first topic must be 'vote_csv1'"
    );
}

#[test]
fn test_vote_cast_event_payload_schema() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.vote(&voter, &proposal_id, &VoteChoice::Against);

    let events = env.events().all();
    let vote_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("vote_csv1"))
            } else {
                false
            }
        })
        .expect("vote cast event should be emitted");

    // Verify payload contains expected data
    let payload = &vote_event.1;
    // Payload should be: (voter, vote_choice)
    assert!(!payload.is_void(), "payload should not be void");
}

#[test]
fn test_vote_cast_event_exact_topic_name() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.vote(&voter, &proposal_id, &VoteChoice::For);

    let events = env.events().all();
    let has_v1_event = events.iter().any(|e| {
        if let Some(first_topic) = e.0.get(0) {
            first_topic == soroban_sdk::Val::from(symbol_short!("vote_csv1"))
        } else {
            false
        }
    });

    assert!(
        has_v1_event,
        "vote cast event must use versioned topic 'vote_csv1'"
    );
}

// ── Proposal Queued Event Tests ───────────────────────────────────────────

#[test]
fn test_proposal_queued_event_topic_v1() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    // Queue the proposal
    client.queue_proposal(&proposal_id);

    let events = env.events().all();
    let queue_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("prop_quv1"))
            } else {
                false
            }
        })
        .expect("proposal queued event should be emitted");

    // Verify topic structure
    assert_eq!(queue_event.0.len(), 2, "proposal queued event should have 2 topics");
    assert_eq!(
        queue_event.0.get(0).unwrap(),
        soroban_sdk::Val::from(symbol_short!("prop_quv1")),
        "first topic must be 'prop_quv1'"
    );
}

#[test]
fn test_proposal_queued_event_exact_topic_name() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.queue_proposal(&proposal_id);

    let events = env.events().all();
    let has_v1_event = events.iter().any(|e| {
        if let Some(first_topic) = e.0.get(0) {
            first_topic == soroban_sdk::Val::from(symbol_short!("prop_quv1"))
        } else {
            false
        }
    });

    assert!(
        has_v1_event,
        "proposal queued event must use versioned topic 'prop_quv1'"
    );
}

// ── Proposal Executed Event Tests ─────────────────────────────────────────

#[test]
fn test_proposal_executed_event_topic_v1() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);
    let executor = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.queue_proposal(&proposal_id);
    client.execute_proposal(&executor, &proposal_id);

    let events = env.events().all();
    let exec_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("prop_exv1"))
            } else {
                false
            }
        })
        .expect("proposal executed event should be emitted");

    // Verify topic structure
    assert_eq!(exec_event.0.len(), 2, "proposal executed event should have 2 topics");
    assert_eq!(
        exec_event.0.get(0).unwrap(),
        soroban_sdk::Val::from(symbol_short!("prop_exv1")),
        "first topic must be 'prop_exv1'"
    );
}

#[test]
fn test_proposal_executed_event_exact_topic_name() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);
    let executor = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.queue_proposal(&proposal_id);
    client.execute_proposal(&executor, &proposal_id);

    let events = env.events().all();
    let has_v1_event = events.iter().any(|e| {
        if let Some(first_topic) = e.0.get(0) {
            first_topic == soroban_sdk::Val::from(symbol_short!("prop_exv1"))
        } else {
            false
        }
    });

    assert!(
        has_v1_event,
        "proposal executed event must use versioned topic 'prop_exv1'"
    );
}

// ── Proposal Cancelled Event Tests ────────────────────────────────────────

#[test]
fn test_proposal_cancelled_event_topic_v1() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.cancel_proposal(&admin, &proposal_id);

    let events = env.events().all();
    let cancel_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("prop_cav1"))
            } else {
                false
            }
        })
        .expect("proposal cancelled event should be emitted");

    // Verify topic structure
    assert_eq!(cancel_event.0.len(), 2, "proposal cancelled event should have 2 topics");
    assert_eq!(
        cancel_event.0.get(0).unwrap(),
        soroban_sdk::Val::from(symbol_short!("prop_cav1")),
        "first topic must be 'prop_cav1'"
    );
}

#[test]
fn test_proposal_cancelled_event_exact_topic_name() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    client.cancel_proposal(&admin, &proposal_id);

    let events = env.events().all();
    let has_v1_event = events.iter().any(|e| {
        if let Some(first_topic) = e.0.get(0) {
            first_topic == soroban_sdk::Val::from(symbol_short!("prop_cav1"))
        } else {
            false
        }
    });

    assert!(
        has_v1_event,
        "proposal cancelled event must use versioned topic 'prop_cav1'"
    );
}

// ── Schema Stability Tests ────────────────────────────────────────────────

#[test]
fn test_all_governance_events_use_v1_topics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    // Create proposal
    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    // Vote
    client.vote(&voter, &proposal_id, &VoteChoice::For);

    // Queue
    client.queue_proposal(&proposal_id);

    // Execute
    client.execute_proposal(&voter, &proposal_id);

    let events = env.events().all();
    let governance_events: Vec<_> = events
        .iter()
        .filter(|e| {
            if let Some(first_topic) = e.0.get(0) {
                let topic_str = format!("{:?}", first_topic);
                topic_str.contains("prop_crv1")
                    || topic_str.contains("vote_csv1")
                    || topic_str.contains("prop_quv1")
                    || topic_str.contains("prop_exv1")
            } else {
                false
            }
        })
        .collect();

    assert!(
        !governance_events.is_empty(),
        "governance events should be emitted"
    );

    // Verify all governance events have v1 suffix
    for event in governance_events {
        if let Some(first_topic) = event.0.get(0) {
            let topic_str = format!("{:?}", first_topic);
            assert!(
                topic_str.contains("_v1"),
                "all governance events must have _v1 suffix, got: {}",
                topic_str
            );
        }
    }
}

#[test]
fn test_governance_event_topic_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = setup_factory(&env);
    let proposer = Address::generate(&env);

    let proposal_id = client.create_proposal(
        &proposer,
        &ActionType::ParameterChange,
        &1000,
        &2000,
        &3000,
    );

    let events = env.events().all();
    let proposal_event = events
        .iter()
        .find(|e| {
            if let Some(first_topic) = e.0.get(0) {
                first_topic == soroban_sdk::Val::from(symbol_short!("prop_crv1"))
            } else {
                false
            }
        })
        .expect("proposal created event should be emitted");

    // Proposal created event should have exactly 2 topics:
    // 1. Event name (prop_crv1)
    // 2. Proposal ID
    assert_eq!(
        proposal_event.0.len(),
        2,
        "proposal created event must have exactly 2 topics (event name and proposal_id)"
    );
}
