#![allow(dead_code)]

use soroban_sdk::{contracterror, contracttype, Address, String};

/// Factory state containing administrative configuration
///
/// Represents the current state of the token factory including
/// administrative addresses, fee structure, and operational status.
///
/// # Fields
/// * `admin` - Address with administrative privileges
/// * `treasury` - Address receiving deployment fees
/// * `base_fee` - Base fee for token deployment (in stroops)
/// * `metadata_fee` - Additional fee for metadata inclusion (in stroops)
/// * `paused` - Whether the contract is paused
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryState {
    pub admin: Address,
    pub treasury: Address,
    pub base_fee: i128,
    pub metadata_fee: i128,
    pub paused: bool,
}

/// Contract metadata for factory identification
///
/// Contains descriptive information about the token factory contract.
///
/// # Fields
/// * `name` - Human-readable contract name
/// * `description` - Brief description of contract purpose
/// * `author` - Contract author or team name
/// * `license` - Software license identifier (e.g., "MIT")
/// * `version` - Semantic version string (e.g., "1.0.0")
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractMetadata {
    pub name: String,
    pub description: String,
    pub author: String,
    pub license: String,
    pub version: String,
}

/// Complete information about a deployed token
///
/// Contains all metadata and state for a token created by the factory.
///
/// # Fields
/// * `address` - The token's contract address
/// * `creator` - Address that deployed the token
/// * `name` - Token name (e.g., "My Token")
/// * `symbol` - Token symbol (e.g., "MTK")
/// * `decimals` - Number of decimal places (typically 7 for Stellar)
/// * `total_supply` - Current circulating supply after burns
/// * `metadata_uri` - Optional IPFS URI for additional metadata
/// * `created_at` - Unix timestamp of token creation
/// * `total_burned` - Cumulative amount of tokens burned
/// * `burn_count` - Number of burn operations performed
/// * `clawback_enabled` - Whether admin can burn from any address
///
/// # Examples
/// ```
/// let token_info = factory.get_token_info(&env, 0)?;
/// assert_eq!(token_info.symbol, "MTK");
/// ```
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
    pub total_burned: i128,
    pub burn_count: u32,
    pub clawback_enabled: bool,
}

/// Batch fee update structure for Phase 2 optimization
///
/// Allows updating both fees in a single operation, providing
/// approximately 40% gas savings compared to separate updates.
///
/// # Fields
/// * `base_fee` - Optional new base fee (None = no change)
/// * `metadata_fee` - Optional new metadata fee (None = no change)
///
/// # Examples
/// ```
/// // Update both fees
/// let update = FeeUpdate {
///     base_fee: Some(1_000_000),
///     metadata_fee: Some(500_000),
/// };
/// ```
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeUpdate {
    pub base_fee: Option<i128>,
    pub metadata_fee: Option<i128>,
}

/// Storage keys for contract data
///
/// Defines all storage locations used by the factory contract.
/// Each variant maps to a specific piece of contract state.
///
/// # Variants
/// * `Admin` - Factory administrator address
/// * `Treasury` - Fee collection address
/// * `BaseFee` - Base deployment fee amount
/// * `MetadataFee` - Metadata deployment fee amount
/// * `TokenCount` - Total number of tokens created
/// * `Token(u32)` - Token info by index
/// * `Balance(u32, Address)` - Token balance for holder
/// * `BurnCount(u32)` - Number of burns for token
/// * `TokenByAddress(Address)` - Token info lookup by address
/// * `Paused` - Contract pause state
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
    TokenByAddress(Address),
    Paused,
}

/// Contract error codes
///
/// Defines all possible error conditions that can occur during
/// contract execution. Each error has a unique numeric code.
///
/// # Variants
/// * `InsufficientFee` - Provided fee is less than required
/// * `Unauthorized` - Caller lacks required permissions
/// * `InvalidParameters` - Function arguments are invalid
/// * `TokenNotFound` - Requested token does not exist
/// * `MetadataAlreadySet` - Token metadata cannot be changed
/// * `AlreadyInitialized` - Contract has already been initialized
/// * `InsufficientBalance` - Account balance too low for operation
/// * `ArithmeticError` - Numeric overflow or underflow occurred
/// * `BatchTooLarge` - Batch operation exceeds maximum size
/// * `InvalidAmount` - Amount is zero or negative
/// * `ClawbackDisabled` - Clawback not enabled for this token
/// * `InvalidBurnAmount` - Burn amount is invalid
/// * `BurnAmountExceedsBalance` - Burn amount exceeds available balance
/// * `ContractPaused` - Operation not allowed while paused
///
/// # Examples
/// ```
/// if amount <= 0 {
///     return Err(Error::InvalidAmount);
/// }
/// ```
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
    ArithmeticError = 8,
    BatchTooLarge = 9,
    InvalidAmount = 10,
    ClawbackDisabled = 11,
    InvalidBurnAmount = 12,
    BurnAmountExceedsBalance = 13,
    ContractPaused = 14,
}
