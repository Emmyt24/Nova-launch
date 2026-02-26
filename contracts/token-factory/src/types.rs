use soroban_sdk::{contracterror, contracttype, Address, String};

// ============================================================
// Migration Notes for Burn Tracking
// ============================================================
// This update adds burn tracking capabilities to the storage layer.
//
// Storage Schema Changes:
// - TokenInfo: Added fields (initial_supply, total_burned, burn_count)
// - New DataKey: BurnRecord(u32) - stores individual burn records
// - New DataKey: BurnCount - global counter for total burns
//
// Backward Compatibility:
// - Existing tokens will have default values (0) for new fields
// - No migration required for existing data
// - New fields are optional for existing TokenInfo entries
//
// Usage:
// - Use increment_burn_count() to track a burn operation
// - Use add_burn_record() to store burn details
// - Use get_total_burned() to retrieve burned amount
// - Use get_burn_count() to retrieve burn count per token
// ============================================================

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
    pub initial_supply: i128,
    pub total_burned: i128,
    pub burn_count: u32,
    pub metadata_uri: Option<String>,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BurnRecord {
    pub token_address: Address,
    pub from: Address,
    pub amount: i128,
    pub burned_by: Address,
    pub timestamp: u64,
    pub is_admin_burn: bool,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    BaseFee,
    MetadataFee,
    TokenCount,
    Token(u32),
    BurnRecord(u32),
    BurnCount,
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
}
