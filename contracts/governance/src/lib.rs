#![no_std]

mod storage;
mod types;

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use types::{Proposal, ProposalStatus, Vote, VoteError, FinalizationError};

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    /// Initialize the governance contract with token address
    pub fn initialize(env: Env, token_address: Address) -> Result<(), VoteError> {
        if storage::has_token_address(&env) {
            return Err(VoteError::AlreadyInitialized);
        }
        storage::set_token_address(&env, &token_address);
        storage::set_proposal_count(&env, 0);
        Ok(())
    }

    /// Create a new proposal
    pub fn create_proposal(
        env: Env,
        creator: Address,
        description: String,
        voting_period: u64,
        quorum: i128,
        threshold_percent: u32,
    ) -> u32 {
        creator.require_auth();

        let proposal_id = storage::get_proposal_count(&env);
        let voting_end = env.ledger().timestamp() + voting_period;

        let proposal = Proposal {
            id: proposal_id,
            creator: creator.clone(),
            description,
            voting_end,
            quorum,
            threshold_percent,
            votes_for: 0,
            votes_against: 0,
            status: ProposalStatus::Active,
        };

        storage::set_proposal(&env, proposal_id, &proposal);
        storage::set_proposal_count(&env, proposal_id + 1);

        proposal_id
    }

    /// Cast a vote on a proposal
    pub fn cast_vote(
        env: Env,
        voter: Address,
        proposal_id: u32,
        in_favor: bool,
    ) -> Result<(), VoteError> {
        voter.require_auth();

        // Check if proposal exists
        let mut proposal = storage::get_proposal(&env, proposal_id)
            .ok_or(VoteError::ProposalNotFound)?;

        // Check if proposal is active
        if proposal.status != ProposalStatus::Active {
            return Err(VoteError::ProposalNotActive);
        }

        // Check if voting period has ended
        if env.ledger().timestamp() > proposal.voting_end {
            return Err(VoteError::VotingPeriodEnded);
        }

        // Check if already voted
        if storage::has_voted(&env, proposal_id, &voter) {
            return Err(VoteError::AlreadyVoted);
        }

        // Get vote weight from token balance
        let weight = Self::get_vote_weight(&env, &voter)?;

        // Store vote
        let vote = Vote {
            voter: voter.clone(),
            proposal_id,
            weight,
            in_favor,
        };
        storage::set_vote(&env, proposal_id, &voter, &vote);

        // Update tally
        if in_favor {
            proposal.votes_for = proposal.votes_for.checked_add(weight)
                .ok_or(VoteError::Overflow)?;
        } else {
            proposal.votes_against = proposal.votes_against.checked_add(weight)
                .ok_or(VoteError::Overflow)?;
        }

        storage::set_proposal(&env, proposal_id, &proposal);

        Ok(())
    }

    /// Check if an address has voted on a proposal
    pub fn has_voted(env: Env, proposal_id: u32, voter: Address) -> bool {
        storage::has_voted(&env, proposal_id, &voter)
    }

    /// Get vote weight for an address (token balance)
    fn get_vote_weight(env: &Env, voter: &Address) -> Result<i128, VoteError> {
        let token_address = storage::get_token_address(env)
            .ok_or(VoteError::NotInitialized)?;
        
        let balance = storage::query_token_balance(env, &token_address, voter);
        
        if balance <= 0 {
            return Err(VoteError::InsufficientBalance);
        }

        Ok(balance)
    }

    /// Finalize a proposal after voting period
    pub fn finalize_proposal(env: Env, proposal_id: u32) -> Result<ProposalStatus, FinalizationError> {
        let mut proposal = storage::get_proposal(&env, proposal_id)
            .ok_or(FinalizationError::ProposalNotFound)?;

        // Check if already finalized
        if proposal.status != ProposalStatus::Active {
            return Err(FinalizationError::AlreadyFinalized);
        }

        // Check if voting period has ended
        if env.ledger().timestamp() <= proposal.voting_end {
            return Err(FinalizationError::VotingPeriodNotEnded);
        }

        // Evaluate quorum and threshold
        let total_votes = proposal.votes_for + proposal.votes_against;
        
        let final_status = if total_votes < proposal.quorum {
            ProposalStatus::Failed
        } else {
            let threshold_votes = (total_votes * proposal.threshold_percent as i128) / 100;
            if proposal.votes_for > threshold_votes {
                ProposalStatus::Passed
            } else {
                ProposalStatus::Rejected
            }
        };

        proposal.status = final_status.clone();
        storage::set_proposal(&env, proposal_id, &proposal);

        Ok(final_status)
    }

    /// Get proposal details
    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<Proposal> {
        storage::get_proposal(&env, proposal_id)
    }

    /// Get vote details
    pub fn get_vote(env: Env, proposal_id: u32, voter: Address) -> Option<Vote> {
        storage::get_vote(&env, proposal_id, &voter)
    }
}

#[cfg(test)]
mod test;

#[cfg(test)]
mod vote_accounting_test;
