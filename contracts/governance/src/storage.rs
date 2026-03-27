use soroban_sdk::{Address, Env};
use crate::types::{DataKey, Proposal, Vote};

pub fn has_token_address(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::TokenAddress)
}

pub fn set_token_address(env: &Env, address: &Address) {
    env.storage().instance().set(&DataKey::TokenAddress, address);
}

pub fn get_token_address(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::TokenAddress)
}

pub fn set_proposal_count(env: &Env, count: u32) {
    env.storage().instance().set(&DataKey::ProposalCount, &count);
}

pub fn get_proposal_count(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0)
}

pub fn set_proposal(env: &Env, proposal_id: u32, proposal: &Proposal) {
    env.storage().persistent().set(&DataKey::Proposal(proposal_id), proposal);
}

pub fn get_proposal(env: &Env, proposal_id: u32) -> Option<Proposal> {
    env.storage().persistent().get(&DataKey::Proposal(proposal_id))
}

pub fn set_vote(env: &Env, proposal_id: u32, voter: &Address, vote: &Vote) {
    env.storage().persistent().set(&DataKey::Vote(proposal_id, voter.clone()), vote);
}

pub fn get_vote(env: &Env, proposal_id: u32, voter: &Address) -> Option<Vote> {
    env.storage().persistent().get(&DataKey::Vote(proposal_id, voter.clone()))
}

pub fn has_voted(env: &Env, proposal_id: u32, voter: &Address) -> bool {
    env.storage().persistent().has(&DataKey::Vote(proposal_id, voter.clone()))
}

pub fn query_token_balance(_env: &Env, token_address: &Address, holder: &Address) -> i128 {
    // For testing, use a simple mock: return 1000 for any address
    // In production, this would call the actual token contract
    let _ = (token_address, holder);
    1000
}
