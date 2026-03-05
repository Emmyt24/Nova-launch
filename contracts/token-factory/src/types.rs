#![allow(dead_code)]

use soroban_sdk::{contracterror, contracttype, Address, String, Vec};

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
/// * `initial_supply` - Initial supply at token creation
/// * `max_supply` - Optional maximum supply cap (None = unlimited)
/// * `metadata_uri` - Optional IPFS URI for additional metadata
/// * `created_at` - Unix timestamp of token creation
/// * `total_burned` - Cumulative amount of tokens burned
/// * `burn_count` - Number of burn operations performed
/// * `metadata_uri` - Optional IPFS URI for additional metadata
/// * `created_at` - Unix timestamp of token creation
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
    pub max_supply: Option<i128>,
    pub total_burned: i128,
    pub burn_count: u32,
    pub metadata_uri: Option<String>,
    pub created_at: u64,
    pub is_paused: bool,   // NEW — token-level pause flag
    pub is_paused: bool,
}

/// Compact read-only snapshot of a token's current state.
/// Returned by get_token_stats().
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenStats {
    pub current_supply: i128,  // live circulating supply
    pub total_burned:   i128,  // cumulative amount burned since creation
    pub burn_count:     u32,   // number of burn operations performed
    pub is_paused:      bool,  // token-level pause flag
    pub has_clawback:   bool,  // clawback policy flag (reserved; always false for now)
    pub total_burned: i128,
    pub burn_count: u32,
    pub clawback_enabled: bool,
    pub freeze_enabled: bool,
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
/// * `TimelockConfig` - Timelock configuration
/// * `PendingChange(u64)` - Pending change by ID
/// * `NextChangeId` - Next available change ID
/// * `CreatorTokens(Address)` - Vector of token indices for a creator
/// * `CreatorTokenCount(Address)` - Number of tokens created by address
/// * `TreasuryPolicy` - Treasury withdrawal policy
/// * `WithdrawalPeriod` - Current withdrawal period tracking
/// * `AllowedRecipient(Address)` - Whether address is allowed recipient
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
    TokenPaused(u32),      // NEW — token_index -> bool
    TokenPaused(u32),
    TotalBurned(u32),   // NEW — cumulative burned amount per token
    TokenByAddress(Address),
    Paused,
    TimelockConfig,
    PendingChange(u64),
    NextChangeId,
    CreatorTokens(Address),
    CreatorTokenCount(Address),
    TreasuryPolicy,
    WithdrawalPeriod,
    AllowedRecipient(Address),
    // Stream management keys
    StreamCount,                    // Total number of streams created
    Stream(u32),                    // Stream info by ID
    StreamByCreator(Address, u32),  // Index streams by creator for pagination
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
/// * `TimelockNotExpired` - Timelock period has not elapsed
/// * `ChangeAlreadyExecuted` - Change has already been executed
/// * `MaxSupplyExceeded` - Minting would exceed max supply cap
/// * `InvalidMaxSupply` - Max supply is less than initial supply
/// * `WithdrawalCapExceeded` - Withdrawal would exceed daily cap
/// * `RecipientNotAllowed` - Recipient not in allowlist
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
    InsufficientFee     = 1,
    Unauthorized        = 2,
    InvalidParameters   = 3,
    TokenNotFound       = 4,
    MetadataAlreadySet  = 5,
    AlreadyInitialized  = 6,
    InsufficientBalance = 7,
    ArithmeticError     = 8,
    BatchTooLarge       = 9,
    TokenPaused         = 10,  // NEW
}
    TokenPaused         = 10,
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
    TimelockNotExpired = 15,
    ChangeAlreadyExecuted = 16,
    MaxSupplyExceeded = 17,
    InvalidMaxSupply = 18,
    WithdrawalCapExceeded = 19,
    RecipientNotAllowed = 20,
    MissingAdmin = 21,
    MissingTreasury = 22,
    InvalidBaseFee = 23,
    InvalidMetadataFee = 24,
    InconsistentTokenCount = 25,

/// Timelock configuration
///
/// Defines the delay period for sensitive operations.
///
/// # Fields
/// * `delay_seconds` - Time delay in seconds before changes can be executed
/// * `enabled` - Whether timelock is currently active
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockConfig {
    pub delay_seconds: u64,
    pub enabled: bool,
}

/// Type of pending change
///
/// Identifies which operation is being timelocked.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ChangeType {
    FeeUpdate,
    PauseUpdate,
    TreasuryUpdate,
}

/// Pending change awaiting timelock expiry
///
/// Represents a scheduled change that cannot be executed
/// until the timelock period has elapsed.
///
/// # Fields
/// * `id` - Unique identifier for this change
/// * `change_type` - Type of change being scheduled
/// * `scheduled_by` - Admin who scheduled the change
/// * `scheduled_at` - Timestamp when change was scheduled
/// * `execute_at` - Timestamp when change can be executed
/// * `executed` - Whether the change has been executed
/// * `base_fee` - New base fee (for FeeUpdate)
/// * `metadata_fee` - New metadata fee (for FeeUpdate)
/// * `paused` - New pause state (for PauseUpdate)
/// * `treasury` - New treasury address (for TreasuryUpdate)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingChange {
    pub id: u64,
    pub change_type: ChangeType,
    pub scheduled_by: Address,
    pub scheduled_at: u64,
    pub execute_at: u64,
    pub executed: bool,
    pub base_fee: Option<i128>,
    pub metadata_fee: Option<i128>,
    pub paused: Option<bool>,
    pub treasury: Option<Address>,
}

/// Pagination cursor for token queries
///
/// Represents the position in a paginated result set.
/// Uses token index as the cursor for deterministic ordering.
///
/// # Fields
/// * `next_index` - The next token index to fetch (u32::MAX = end of results)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaginationCursor {
    pub next_index: u32,
}

/// Paginated token result
///
/// Contains a page of tokens and a cursor for fetching the next page.
///
/// # Fields
/// * `tokens` - Vector of token info for this page
/// * `cursor` - Cursor for next page (None = no more results)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaginatedTokens {
    pub tokens: soroban_sdk::Vec<TokenInfo>,
    pub cursor: Option<u32>,
}

/// Treasury withdrawal policy
///
/// Defines limits and controls for treasury withdrawals.
///
/// # Fields
/// * `daily_cap` - Maximum amount that can be withdrawn per day (in stroops)
/// * `allowlist_enabled` - Whether recipient allowlist is enforced
/// * `period_duration` - Duration of withdrawal period in seconds (default 86400 = 1 day)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryPolicy {
    pub daily_cap: i128,
    pub allowlist_enabled: bool,
    pub period_duration: u64,
}

/// Treasury withdrawal tracking for current period
///
/// Tracks withdrawals within the current time period.
///
/// # Fields
/// * `period_start` - Timestamp when current period started
/// * `amount_withdrawn` - Total amount withdrawn in current period
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalPeriod {
    pub period_start: u64,
    pub amount_withdrawn: i128,
}

