#![allow(dead_code)]

use soroban_sdk::{self, contracttype, Address, Bytes, BytesN, String, Vec};

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
    pub is_paused: bool,
    pub clawback_enabled: bool,
    pub freeze_enabled: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamInfo {
    pub id: u64,
    pub creator: Address,
    pub recipient: Address,
    pub token_index: u32,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub cliff_time: u64,
    pub metadata: Option<String>,
    pub cancelled: bool,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamParams {
    pub recipient: Address,
    pub token_index: u32,
    pub total_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub cliff_time: u64,
}

/// Token creation parameters
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenCreationParams {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub initial_supply: i128,
    pub max_supply: Option<i128>,
    pub metadata_uri: Option<String>,
}

/// Timelock configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockConfig {
    pub delay_seconds: u64,
    pub enabled: bool,
}

/// Governance configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceConfig {
    pub quorum_percent: u32,
    pub approval_percent: u32,
    pub voting_period: u64,
}

/// Buyback campaign structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuybackCampaign {
    pub id: u64,
    pub token_index: u32,
    pub budget: i128,
    pub spent: i128,
    pub tokens_bought: i128,
    pub execution_count: u32,
    pub start_time: u64,
    pub end_time: u64,
    pub min_interval: u64,
    pub max_slippage_bps: u32,
    pub source_token: Address,
    pub target_token: Address,
    pub owner: Address,
    pub status: CampaignStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

/// Campaign status enum
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    Active = 0,
    Paused = 1,
    Completed = 2,
    Cancelled = 3,
    Expired = 4,
}

/// Individual buyback step
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuybackStep {
    pub step_number: u32,
    pub amount: i128,
    pub status: StepStatus,
    pub executed_at: Option<u64>,
    pub tx_hash: Option<String>,
}

/// Step execution status
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StepStatus {
    Pending = 0,
    Completed = 1,
    Failed = 2,
}

/// Current lifecycle state for a vault allocation.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VaultStatus {
    Active,
    Claimed,
    Cancelled,
}

/// Time-locked and milestone-gated token allocation vault.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vault {
    pub id: u64,
    pub token: Address,
    pub owner: Address,
    pub creator: Address,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub unlock_time: u64,
    pub milestone_hash: BytesN<32>,
    pub status: VaultStatus,
    pub created_at: u64,
}

/// Compact read-only snapshot of a token's current state.
/// Returned by get_token_stats().
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenStats {
    pub current_supply: i128, // live circulating supply
    pub total_burned: i128,   // cumulative amount burned since creation
    pub burn_count: u32,
    pub is_paused: bool,
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
    TokenPaused(u32),
    TotalBurned(u32),
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
    Proposal(u64),
    ProposalCount,
    NextProposalId,
    ProposalVote(u64, Address),
    StreamCount,
    Stream(u32),
    TokenStreams(u32),
    TokenStreamCount(u32),
    NextStreamId,
    GovernanceConfig,
    Vault(u64),
    VaultCount,
    VaultByOwner(Address, u32),
    OwnerVaultCount(Address),
    VaultByCreator(Address, u32),
    CreatorVaultCount(Address),
    PendingAdmin,
    BuybackCampaign(u64),
    BuybackCampaignCount,
    CampaignByCreator(Address, u32),
    CreatorCampaignCount(Address),
    ActiveCampaigns,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Error(pub u32);

#[allow(non_upper_case_globals)]
impl Error {
    pub const InsufficientFee: Self = Self(1);
    pub const Unauthorized: Self = Self(2);
    pub const InvalidParameters: Self = Self(3);
    pub const TokenNotFound: Self = Self(4);
    pub const MetadataAlreadySet: Self = Self(5);
    pub const AlreadyInitialized: Self = Self(6);
    pub const InsufficientBalance: Self = Self(7);
    pub const ArithmeticError: Self = Self(8);
    pub const BatchTooLarge: Self = Self(9);
    pub const InvalidAmount: Self = Self(10);
    pub const ClawbackDisabled: Self = Self(11);
    pub const InvalidBurnAmount: Self = Self(12);
    pub const BurnAmountExceedsBalance: Self = Self(13);
    pub const ContractPaused: Self = Self(14);
    pub const InvalidTokenParams: Self = Self(15);
    pub const BatchCreationFailed: Self = Self(16);
    pub const StreamNotFound: Self = Self(17);
    pub const InvalidSchedule: Self = Self(18);
    pub const StreamCancelled: Self = Self(19);
    pub const CliffNotReached: Self = Self(20);
    pub const NothingToClaim: Self = Self(21);
    pub const MissingAdmin: Self = Self(22);
    pub const MissingTreasury: Self = Self(23);
    pub const InvalidBaseFee: Self = Self(24);
    pub const InvalidMetadataFee: Self = Self(25);
    pub const InconsistentTokenCount: Self = Self(26);
    pub const WithdrawalCapExceeded: Self = Self(27);
    pub const RecipientNotAllowed: Self = Self(28);
    pub const TimelockNotExpired: Self = Self(29);
    pub const ChangeAlreadyExecuted: Self = Self(30);
    pub const ChangeNotFound: Self = Self(31);
    pub const MaxSupplyExceeded: Self = Self(32);
    pub const InvalidMaxSupply: Self = Self(33);
    pub const MintingDisabled: Self = Self(34);
    pub const TokenPaused: Self = Self(35);
    pub const FreezeNotEnabled: Self = Self(36);
    pub const AddressFrozen: Self = Self(37);
    pub const AddressNotFrozen: Self = Self(38);
    pub const ProposalInTerminalState: Self = Self(39);
    pub const InvalidStateTransition: Self = Self(40);
    pub const InvalidTimeWindow: Self = Self(41);
    pub const PayloadTooLarge: Self = Self(42);
    pub const ProposalNotFound: Self = Self(43);
    pub const VotingNotStarted: Self = Self(44);
    pub const VotingEnded: Self = Self(45);
    pub const VotingClosed: Self = Self(46);
    pub const AlreadyVoted: Self = Self(47);
    pub const ProposalNotQueued: Self = Self(48);
    pub const ProposalCancelled: Self = Self(49);
    pub const QuorumNotMet: Self = Self(50);
    pub const CampaignNotFound: Self = Self(51);
    pub const InvalidBudget: Self = Self(52);
    pub const InsufficientBudget: Self = Self(53);
}

impl From<Error> for soroban_sdk::Error {
    fn from(value: Error) -> Self {
        soroban_sdk::Error::from_contract_error(value.0)
    }
}

impl From<&Error> for soroban_sdk::Error {
    fn from(value: &Error) -> Self {
        soroban_sdk::Error::from_contract_error(value.0)
    }
}

impl From<soroban_sdk::Error> for Error {
    fn from(value: soroban_sdk::Error) -> Self {
        if value.is_type(soroban_sdk::xdr::ScErrorType::Contract) {
            Error(value.get_code())
        } else {
            // Preserve compatibility with existing call sites expecting a contract error.
            Error::InvalidParameters
        }
    }
}

// Buyback error code mapping (reusing existing errors):
// - CampaignNotFound -> TokenNotFound (4)
// - CampaignInactive -> ContractPaused (14)  
// - BudgetExhausted -> InsufficientFee (1)
// - SlippageExceeded -> InvalidAmount (10)
// - InvalidBuybackParams -> InvalidParameters (3)

/// Type of pending change
///
/// Identifies which operation is being timelocked.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActionType {
    FeeChange,
    TreasuryChange,
    PauseContract,
    UnpauseContract,
    PolicyUpdate,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VoteChoice {
    For,
    Against,
    Abstain,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProposalState {
    Created,
    Active,
    Succeeded,
    Defeated,
    Queued,
    Executed,
    Cancelled,
    Expired,
    Failed,
}

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

/// Governance proposal
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub action_type: ActionType,
    pub payload: Bytes,
    pub description: String,
    pub created_at: u64,
    pub start_time: u64,
    pub end_time: u64,
    pub eta: u64,
    pub votes_for: i128,
    pub votes_against: i128,
    pub votes_abstain: i128,
    pub state: ProposalState,
    pub executed_at: Option<u64>,
    pub cancelled_at: Option<u64>,
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
pub struct StreamPage {
    pub token_indices: Vec<u32>,
    pub next_cursor: Option<u32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaginatedTokens {
    pub tokens: soroban_sdk::Vec<TokenInfo>,
    pub has_more: bool,
    pub cursor: PaginationCursor,
}

/// Paginated vault result
///
/// Contains a page of vaults and an optional cursor for fetching the next page.
///
/// # Fields
/// * `vaults` - Vector of vault records in ascending vault_id order
/// * `next_cursor` - Cursor for next page (None = no more results)
///   - For get_vaults_page: next vault_id to fetch
///   - For get_vaults_by_owner: next index in owner's vault list
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultsPage {
    pub vaults: soroban_sdk::Vec<Vault>,
    pub next_cursor: Option<u64>,
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

#[cfg(test)]
mod tests {
    use super::{DataKey, Vault, VaultStatus};
    use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, BytesN, Env};

    #[contract]
    struct VaultTypeTestContract;

    #[contractimpl]
    impl VaultTypeTestContract {}

    fn setup() -> (Env, Address) {
        let env = Env::default();
        let contract_id = env.register_contract(None, VaultTypeTestContract);
        (env, contract_id)
    }

    #[test]
    fn test_vault_status_serialization_round_trip() {
        let (env, contract_id) = setup();
        let variants = [
            VaultStatus::Active,
            VaultStatus::Claimed,
            VaultStatus::Cancelled,
        ];

        env.as_contract(&contract_id, || {
            for (i, status) in variants.iter().enumerate() {
                let key = DataKey::Vault(i as u64);
                env.storage().instance().set(&key, status);
                let decoded: VaultStatus = env.storage().instance().get(&key).unwrap();
                assert_eq!(decoded, *status);
            }
        });
    }

    #[test]
    fn test_vault_serialization_round_trip() {
        let (env, contract_id) = setup();
        let vault = Vault {
            id: 42,
            token: Address::generate(&env),
            owner: Address::generate(&env),
            creator: Address::generate(&env),
            total_amount: 1_000_000,
            claimed_amount: 250_000,
            unlock_time: 1_750_000_000,
            milestone_hash: BytesN::from_array(&env, &[7u8; 32]),
            status: VaultStatus::Active,
            created_at: 1_700_000_000,
        };

        env.as_contract(&contract_id, || {
            let key = DataKey::Vault(vault.id);
            env.storage().instance().set(&key, &vault);
            let decoded: Vault = env.storage().instance().get(&key).unwrap();
            assert_eq!(decoded, vault);
        });
    }

    #[test]
    fn test_vault_datakey_serialization_round_trip() {
        let (env, contract_id) = setup();
        let owner = Address::generate(&env);
        let creator = Address::generate(&env);
        let keys = [
            DataKey::Vault(99),
            DataKey::VaultCount,
            DataKey::VaultByOwner(owner, 1),
            DataKey::OwnerVaultCount(Address::generate(&env)),
            DataKey::VaultByCreator(creator, 2),
            DataKey::CreatorVaultCount(Address::generate(&env)),
        ];

        env.as_contract(&contract_id, || {
            for (i, key) in keys.iter().enumerate() {
                env.storage().instance().set(key, &(i as u32));
                let value: u32 = env.storage().instance().get(key).unwrap();
                assert_eq!(value, i as u32);
            }
        });
    }

    #[test]
    fn test_campaign_status_serialization_round_trip() {
        let (env, contract_id) = setup();
        let variants = [
            super::CampaignStatus::Active,
            super::CampaignStatus::Paused,
            super::CampaignStatus::Completed,
            super::CampaignStatus::Cancelled,
        ];

        env.as_contract(&contract_id, || {
            for (i, status) in variants.iter().enumerate() {
                let key = DataKey::BuybackCampaign(i as u64);
                env.storage().instance().set(&key, status);
                let decoded: super::CampaignStatus = env.storage().instance().get(&key).unwrap();
                assert_eq!(decoded, *status);
            }
        });
    }

    #[test]
    fn test_buyback_campaign_serialization_round_trip() {
        let (env, contract_id) = setup();
        let campaign = super::BuybackCampaign {
            id: 123,
            token_index: 5,
            creator: Address::generate(&env),
            budget: 10_000_000_0000000,
            spent: 2_500_000_0000000,
            tokens_bought: 500_000_0000000,
            execution_count: 10,
            status: super::CampaignStatus::Active,
            created_at: 1_700_000_000,
            updated_at: 1_700_100_000,
            start_time: 1_700_000_000,
            end_time: 1_700_864_000,
            min_interval: 3600,
            max_slippage_bps: 100,
            source_token: Address::generate(&env),
            target_token: Address::generate(&env),
        };

        env.as_contract(&contract_id, || {
            let key = DataKey::BuybackCampaign(campaign.id);
            env.storage().instance().set(&key, &campaign);
            let decoded: super::BuybackCampaign = env.storage().instance().get(&key).unwrap();
            assert_eq!(decoded, campaign);
        });
    }

    #[test]
    fn test_campaign_datakey_serialization_round_trip() {
        let (env, contract_id) = setup();
        let creator = Address::generate(&env);
        let keys = [
            DataKey::BuybackCampaign(42),
            DataKey::BuybackCampaignCount,
            DataKey::NextCampaignId,
            DataKey::CampaignByCreator(creator.clone(), 0),
            DataKey::CreatorCampaignCount(creator.clone()),
            DataKey::CampaignByToken(5, 0),
            DataKey::TokenCampaignCount(5),
        ];

        env.as_contract(&contract_id, || {
            for (i, key) in keys.iter().enumerate() {
                env.storage().instance().set(key, &(i as u64));
                let value: u64 = env.storage().instance().get(key).unwrap();
                assert_eq!(value, i as u64);
            }
        });
    }

    #[test]
    fn test_campaign_field_ordering_deterministic() {
        let (env, contract_id) = setup();
        
        // Create two identical campaigns
        let campaign1 = super::BuybackCampaign {
            id: 1,
            token_index: 0,
            creator: Address::generate(&env),
            budget: 1_000_000,
            spent: 0,
            tokens_bought: 0,
            execution_count: 0,
            status: super::CampaignStatus::Active,
            created_at: 1_000_000,
            updated_at: 1_000_000,
            start_time: 1_000_000,
            end_time: 2_000_000,
            min_interval: 600,
            max_slippage_bps: 100,
            source_token: Address::generate(&env),
            target_token: Address::generate(&env),
        };

        let campaign2 = super::BuybackCampaign {
            id: campaign1.id,
            token_index: campaign1.token_index,
            creator: campaign1.creator.clone(),
            budget: campaign1.budget,
            spent: campaign1.spent,
            tokens_bought: campaign1.tokens_bought,
            execution_count: campaign1.execution_count,
            status: campaign1.status,
            created_at: campaign1.created_at,
            updated_at: campaign1.updated_at,
            start_time: campaign1.start_time,
            end_time: campaign1.end_time,
            min_interval: campaign1.min_interval,
            max_slippage_bps: campaign1.max_slippage_bps,
            source_token: campaign1.source_token.clone(),
            target_token: campaign1.target_token.clone(),
        };

        // Verify they are equal
        assert_eq!(campaign1, campaign2);

        // Verify serialization produces identical results
        env.as_contract(&contract_id, || {
            env.storage().instance().set(&DataKey::BuybackCampaign(1), &campaign1);
            env.storage().instance().set(&DataKey::BuybackCampaign(2), &campaign2);
            
            let decoded1: super::BuybackCampaign = env.storage().instance().get(&DataKey::BuybackCampaign(1)).unwrap();
            let decoded2: super::BuybackCampaign = env.storage().instance().get(&DataKey::BuybackCampaign(2)).unwrap();
            
            assert_eq!(decoded1, decoded2);
        });
    }

    #[test]
    fn test_campaign_storage_retrieval_by_id() {
        let (env, contract_id) = setup();
        
        let campaigns = vec![
            super::BuybackCampaign {
                id: 0,
                token_index: 0,
                creator: Address::generate(&env),
                budget: 1_000_000,
                spent: 0,
                tokens_bought: 0,
                execution_count: 0,
                status: super::CampaignStatus::Active,
                created_at: 1_000_000,
                updated_at: 1_000_000,
                start_time: 1_000_000,
                end_time: 2_000_000,
                min_interval: 600,
                max_slippage_bps: 100,
                source_token: Address::generate(&env),
                target_token: Address::generate(&env),
            },
            super::BuybackCampaign {
                id: 1,
                token_index: 1,
                creator: Address::generate(&env),
                budget: 2_000_000,
                spent: 500_000,
                tokens_bought: 100_000,
                execution_count: 5,
                status: super::CampaignStatus::Paused,
                created_at: 1_100_000,
                updated_at: 1_200_000,
                start_time: 1_100_000,
                end_time: 2_100_000,
                min_interval: 900,
                max_slippage_bps: 200,
                source_token: Address::generate(&env),
                target_token: Address::generate(&env),
            },
        ];

        env.as_contract(&contract_id, || {
            // Store campaigns
            for campaign in &campaigns {
                env.storage().instance().set(&DataKey::BuybackCampaign(campaign.id), campaign);
            }

            // Retrieve and verify each campaign
            for campaign in &campaigns {
                let retrieved: super::BuybackCampaign = 
                    env.storage().instance().get(&DataKey::BuybackCampaign(campaign.id)).unwrap();
                assert_eq!(retrieved, *campaign);
            }
        });
    }

    #[test]
    fn test_campaign_storage_retrieval_by_creator() {
        let (env, contract_id) = setup();
        let creator = Address::generate(&env);

        env.as_contract(&contract_id, || {
            // Store campaign indexes for creator
            env.storage().instance().set(&DataKey::CampaignByCreator(creator.clone(), 0), &10u64);
            env.storage().instance().set(&DataKey::CampaignByCreator(creator.clone(), 1), &20u64);
            env.storage().instance().set(&DataKey::CreatorCampaignCount(creator.clone()), &2u32);

            // Retrieve and verify
            let campaign_id_0: u64 = env.storage().instance().get(&DataKey::CampaignByCreator(creator.clone(), 0)).unwrap();
            let campaign_id_1: u64 = env.storage().instance().get(&DataKey::CampaignByCreator(creator.clone(), 1)).unwrap();
            let count: u32 = env.storage().instance().get(&DataKey::CreatorCampaignCount(creator.clone())).unwrap();

            assert_eq!(campaign_id_0, 10);
            assert_eq!(campaign_id_1, 20);
            assert_eq!(count, 2);
        });
    }

    #[test]
    fn test_campaign_storage_retrieval_by_token() {
        let (env, contract_id) = setup();
        let token_index = 5u32;

        env.as_contract(&contract_id, || {
            // Store campaign indexes for token
            env.storage().instance().set(&DataKey::CampaignByToken(token_index, 0), &100u64);
            env.storage().instance().set(&DataKey::CampaignByToken(token_index, 1), &200u64);
            env.storage().instance().set(&DataKey::TokenCampaignCount(token_index), &2u32);

            // Retrieve and verify
            let campaign_id_0: u64 = env.storage().instance().get(&DataKey::CampaignByToken(token_index, 0)).unwrap();
            let campaign_id_1: u64 = env.storage().instance().get(&DataKey::CampaignByToken(token_index, 1)).unwrap();
            let count: u32 = env.storage().instance().get(&DataKey::TokenCampaignCount(token_index)).unwrap();

            assert_eq!(campaign_id_0, 100);
            assert_eq!(campaign_id_1, 200);
            assert_eq!(count, 2);
        });
    }

    #[test]
    fn test_campaign_status_all_variants() {
        let (env, contract_id) = setup();
        
        let statuses = [
            (super::CampaignStatus::Active, "Active"),
            (super::CampaignStatus::Paused, "Paused"),
            (super::CampaignStatus::Completed, "Completed"),
            (super::CampaignStatus::Cancelled, "Cancelled"),
        ];

        env.as_contract(&contract_id, || {
            for (i, (status, _name)) in statuses.iter().enumerate() {
                let key = DataKey::BuybackCampaign(i as u64);
                env.storage().instance().set(&key, status);
                let decoded: super::CampaignStatus = env.storage().instance().get(&key).unwrap();
                assert_eq!(decoded, *status);
            }
        });
    }

    #[test]
    fn test_campaign_with_max_values() {
        let (env, contract_id) = setup();
        
        let campaign = super::BuybackCampaign {
            id: u64::MAX,
            token_index: u32::MAX,
            creator: Address::generate(&env),
            budget: i128::MAX,
            spent: i128::MAX,
            tokens_bought: i128::MAX,
            execution_count: u32::MAX,
            status: super::CampaignStatus::Completed,
            created_at: u64::MAX,
            updated_at: u64::MAX,
            start_time: u64::MAX,
            end_time: u64::MAX,
            min_interval: u64::MAX,
            max_slippage_bps: u32::MAX,
            source_token: Address::generate(&env),
            target_token: Address::generate(&env),
        };

        env.as_contract(&contract_id, || {
            env.storage().instance().set(&DataKey::BuybackCampaign(campaign.id), &campaign);
            let decoded: super::BuybackCampaign = env.storage().instance().get(&DataKey::BuybackCampaign(campaign.id)).unwrap();
            assert_eq!(decoded, campaign);
        });
    }

    #[test]
    fn test_campaign_with_min_values() {
        let (env, contract_id) = setup();
        
        let campaign = super::BuybackCampaign {
            id: 0,
            token_index: 0,
            creator: Address::generate(&env),
            budget: 0,
            spent: 0,
            tokens_bought: 0,
            execution_count: 0,
            status: super::CampaignStatus::Active,
            created_at: 0,
            updated_at: 0,
            start_time: 0,
            end_time: 0,
            min_interval: 0,
            max_slippage_bps: 0,
            source_token: Address::generate(&env),
            target_token: Address::generate(&env),
        };

        env.as_contract(&contract_id, || {
            env.storage().instance().set(&DataKey::BuybackCampaign(campaign.id), &campaign);
            let decoded: super::BuybackCampaign = env.storage().instance().get(&DataKey::BuybackCampaign(campaign.id)).unwrap();
            assert_eq!(decoded, campaign);
        });
    }
}

    #[test]
    fn test_campaign_status_serialization_round_trip() {
        let (env, contract_id) = setup();
        let variants = [
            super::CampaignStatus::Active,
            super::CampaignStatus::Paused,
            super::CampaignStatus::Completed,
            super::CampaignStatus::Cancelled,
        ];

        env.as_contract(&contract_id, || {
            for (i, status) in variants.iter().enumerate() {
                let key = DataKey::Campaign(i as u64);
                env.storage().instance().set(&key, status);
                let decoded: super::CampaignStatus = env.storage().instance().get(&key).unwrap();
                assert_eq!(decoded, *status);
            }
        });
    }

    #[test]
    fn test_campaign_serialization_round_trip() {
        let (env, contract_id) = setup();
        let campaign = super::BuybackCampaign {
            id: 1,
            token_index: 0,
            owner: Address::generate(&env),
            budget_allocated: 10_000_0000000,
            budget_spent: 2_500_0000000,
            tokens_burned: 50_000_0000000,
            burn_count: 10,
            start_time: 1700000000,
            end_time: 1702592000,
            status: super::CampaignStatus::Active,
            created_at: 1700000000,
        };

        env.as_contract(&contract_id, || {
            let key = DataKey::Campaign(campaign.id);
            env.storage().instance().set(&key, &campaign);
            let decoded: super::BuybackCampaign = env.storage().instance().get(&key).unwrap();
            assert_eq!(decoded, campaign);
        });
    }

    #[test]
    fn test_campaign_deterministic_encoding() {
        let (env, contract_id) = setup();
        let owner = Address::generate(&env);
        
        let campaign1 = super::BuybackCampaign {
            id: 42,
            token_index: 5,
            owner: owner.clone(),
            budget_allocated: 1_000_000,
            budget_spent: 250_000,
            tokens_burned: 10_000,
            burn_count: 5,
            start_time: 1700000000,
            end_time: 1702592000,
            status: super::CampaignStatus::Active,
            created_at: 1700000000,
        };

        let campaign2 = super::BuybackCampaign {
            id: 42,
            token_index: 5,
            owner: owner.clone(),
            budget_allocated: 1_000_000,
            budget_spent: 250_000,
            tokens_burned: 10_000,
            burn_count: 5,
            start_time: 1700000000,
            end_time: 1702592000,
            status: super::CampaignStatus::Active,
            created_at: 1700000000,
        };

        env.as_contract(&contract_id, || {
            env.storage().instance().set(&DataKey::Campaign(1), &campaign1);
            env.storage().instance().set(&DataKey::Campaign(2), &campaign2);

            let decoded1: super::BuybackCampaign = env.storage().instance().get(&DataKey::Campaign(1)).unwrap();
            let decoded2: super::BuybackCampaign = env.storage().instance().get(&DataKey::Campaign(2)).unwrap();

            assert_eq!(decoded1, decoded2);
            assert_eq!(decoded1, campaign1);
            assert_eq!(decoded2, campaign2);
        });
    }

    #[test]
    fn test_campaign_datakey_serialization_round_trip() {
        let (env, contract_id) = setup();
        let owner = Address::generate(&env);
        let keys = [
            DataKey::Campaign(1),
            DataKey::Campaign(999),
            DataKey::CampaignCount,
            DataKey::CampaignByOwner(owner.clone(), 0),
            DataKey::OwnerCampaignCount(owner.clone()),
            DataKey::ActiveCampaigns,
            DataKey::ActiveCampaignCount,
        ];

        env.as_contract(&contract_id, || {
            for (i, key) in keys.iter().enumerate() {
                env.storage().instance().set(key, &(i as u32));
                let value: u32 = env.storage().instance().get(key).unwrap();
                assert_eq!(value, i as u32);
            }
        });
    }

    #[test]
    fn test_campaign_boundary_values() {
        let (env, contract_id) = setup();
        
        let campaign = super::BuybackCampaign {
            id: u64::MAX,
            token_index: u32::MAX,
            owner: Address::generate(&env),
            budget_allocated: i128::MAX,
            budget_spent: 0,
            tokens_burned: i128::MAX,
            burn_count: u32::MAX,
            start_time: u64::MAX,
            end_time: u64::MAX,
            status: super::CampaignStatus::Completed,
            created_at: u64::MAX,
        };

        env.as_contract(&contract_id, || {
            env.storage().instance().set(&DataKey::Campaign(u64::MAX), &campaign);
            let decoded: super::BuybackCampaign = env.storage().instance().get(&DataKey::Campaign(u64::MAX)).unwrap();
            assert_eq!(decoded, campaign);
        });
    }
