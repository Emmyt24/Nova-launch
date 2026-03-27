#![cfg(test)]

use crate::{GovernanceContract, GovernanceContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup_test_env() -> (Env, GovernanceContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);

    let token_address = Address::generate(&env);
    let creator = Address::generate(&env);

    client.initialize(&token_address);

    (env, client, creator, token_address)
}

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);
    let token_address = Address::generate(&env);

    client.initialize(&token_address);
}

#[test]
fn test_cannot_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);
    let token_address = Address::generate(&env);

    client.initialize(&token_address);
    
    // Second initialization should fail
    let result = client.try_initialize(&token_address);
    assert!(result.is_err());
}

#[test]
fn test_create_proposal() {
    let (env, client, creator, _) = setup_test_env();

    let proposal_id = client.create_proposal(
        &creator,
        &String::from_str(&env, "Test proposal"),
        &3600,
        &1000,
        &50,
    );

    assert_eq!(proposal_id, 0);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.id, 0);
    assert_eq!(proposal.creator, creator);
    assert_eq!(proposal.votes_for, 0);
    assert_eq!(proposal.votes_against, 0);
    assert_eq!(proposal.status, crate::types::ProposalStatus::Active);
}

#[test]
fn test_unique_proposal_ids() {
    let (env, client, creator, _) = setup_test_env();

    let id1 = client.create_proposal(
        &creator,
        &String::from_str(&env, "Proposal 1"),
        &3600,
        &1000,
        &50,
    );

    let id2 = client.create_proposal(
        &creator,
        &String::from_str(&env, "Proposal 2"),
        &3600,
        &1000,
        &50,
    );

    assert_ne!(id1, id2);
    assert_eq!(id1, 0);
    assert_eq!(id2, 1);
}
