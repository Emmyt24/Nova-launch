use soroban_sdk::{contracttype, contracterror, Address, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub creator: Address,
    pub description: String,
    pub voting_end: u64,
    pub quorum: i128,
    pub threshold_percent: u32,
    pub votes_for: i128,
    pub votes_against: i128,
    pub status: ProposalStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Rejected,
    Failed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub voter: Address,
    pub proposal_id: u32,
    pub weight: i128,
    pub in_favor: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum VoteError {
    ProposalNotFound = 1,
    ProposalNotActive = 2,
    AlreadyVoted = 3,
    InsufficientBalance = 4,
    VotingPeriodEnded = 5,
    NotInitialized = 6,
    AlreadyInitialized = 7,
    Overflow = 8,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FinalizationError {
    ProposalNotFound = 1,
    VotingPeriodNotEnded = 2,
    AlreadyFinalized = 3,
}

#[contracttype]
pub enum DataKey {
    Proposal(u32),
    Vote(u32, Address),
    ProposalCount,
    TokenAddress,
}
