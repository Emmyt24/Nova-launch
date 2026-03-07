#![allow(dead_code)]

use soroban_sdk::{contracterror, contracttype, Address, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryState {
    pub admin: Address,
    pub treasury: Address,
    pub base_fee: i128,
    pub metadata_fee: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInfo {
    pub address: Address,
    pub creator: Address,
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub total_supply: i128,
    pub metadata_uri: Option<String>,
    pub created_at: u64,
<<<<<<< Updated upstream
    pub is_paused: bool,   // NEW — token-level pause flag
=======
    pub is_paused: bool,
}

/// Compact read-only snapshot of a token's current state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenStats {
    pub current_supply: i128,
    pub total_burned:   i128,
    pub burn_count:     u32,
    pub is_paused:      bool,
    pub has_clawback:   bool,
}

/// Paginated result returned by get_streams_by_beneficiary.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamPage {
    pub token_indices: Vec<u32>,  // page of token indices for this beneficiary
    pub next_cursor:   Option<u32>, // None means no more pages
>>>>>>> Stashed changes
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    BaseFee,
    MetadataFee,
    TokenCount,
    Token(u32),
    Balance(u32, Address),
    BurnCount(u32),
<<<<<<< Updated upstream
    TokenPaused(u32),      // NEW — token_index -> bool
=======
    TokenPaused(u32),
    TotalBurned(u32),
    BeneficiaryStreamCount(Address),          // NEW — how many streams a beneficiary has
    BeneficiaryStreamEntry(Address, u32),     // NEW — (beneficiary, entry_index) -> token_index
>>>>>>> Stashed changes
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    InsufficientFee     = 1,
    Unauthorized        = 2,
    InvalidParameters   = 3,
    TokenNotFound       = 4,
    MetadataAlreadySet  = 5,
    AlreadyInitialized  = 6,
    InsufficientBalance = 7,
    ArithmeticError     = 8,
    BatchTooLarge       = 9,
<<<<<<< Updated upstream
    TokenPaused         = 10,  // NEW
=======
    TokenPaused         = 10,
>>>>>>> Stashed changes
}