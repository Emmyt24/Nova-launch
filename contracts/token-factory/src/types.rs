#![allow(dead_code)]

use soroban_sdk::{contracterror, contracttype, Address, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryState {
    pub admin: Address,
    pub treasury: Address,
    pub base_fee: i128,
    pub metadata_fee: i128,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractMetadata {
    pub name: String,
    pub description: String,
    pub author: String,
    pub license: String,
    pub version: String,
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
    pub total_burned: i128,
    pub burn_count: u32,
    pub clawback_enabled: bool,
}

/// Batch fee update structure for Phase 2 optimization
/// Allows updating both fees in a single operation (40% gas savings)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeUpdate {
    pub base_fee: Option<i128>,
    pub metadata_fee: Option<i128>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    BaseFee,
    MetadataFee,
    TokenCount,
    Token(u32),            // Token index -> TokenInfo
    Balance(u32, Address), // (token_index, holder) -> i128
    BurnCount(u32),        // token_index -> u32
    TokenByAddress(Address),
    Paused,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    InsufficientFee = 1,
    Unauthorized = 2,
    InvalidParameters = 3,
    TokenNotFound = 4,
    MetadataAlreadySet = 5,
    AlreadyInitialized = 6,
    InsufficientBalance = 7,
    InvalidAmount = 8,
    ClawbackDisabled = 9,
    InvalidBurnAmount = 10,
    BurnAmountExceedsBalance = 11,
    ContractPaused = 12,
    ArithmeticError = 13,
    BatchTooLarge = 14,
}
