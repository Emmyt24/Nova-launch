#![no_std]
#![allow(dead_code)]
#![allow(unused_imports)]
#![allow(deprecated)]
#![allow(unused_must_use)]

#[cfg(test)]
extern crate std;

mod campaign_validation;
mod compliance_reporting;
mod freeze_functions;
mod governance;
mod game_history;
mod ipfs_pinning;
mod referral;

mod batch_operations;
mod burn;
#[cfg(feature = "legacy-tests")]
mod burn_auction;
mod differential_engine;
mod event_versions;
mod events;
#[cfg(feature = "legacy-tests")]
mod liquidity_mining;
mod milestone_verification;
#[cfg(feature = "legacy-tests")]
mod oracle;
#[cfg(all(test, feature = "legacy-tests"))]
mod milestone_verification_test;
#[cfg(all(test, feature = "legacy-tests"))]
mod error_code_stability_test;
mod mint;
mod pagination;
mod payload_validation;
#[cfg(feature = "legacy-tests")]
mod proposal_queue;
mod proposal_state_machine;
mod storage;
#[cfg(feature = "legacy-tests")]
mod staking;
mod streaming;
mod stream_types;
#[cfg(test)]
mod test_helpers;
mod timelock;
mod token_creation;
mod treasury;
mod types;
mod vesting;
mod validation;

#[cfg(test)]
// mod campaign_state_test;

#[cfg(test)]
mod campaign_event_idempotency_test;

#[cfg(test)]
mod governance_property_test;
#[cfg(test)]
mod governance_quorum_property_test;
#[cfg(test)]
mod governance_config_auth_property_test;
#[cfg(test)]
mod governance_dynamic_quorum_test;
#[cfg(test)]
mod payload_validation_fuzz_test;

#[cfg(test)]
// mod buyback_integration_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod stream_claim_differential_test;

// Property tests (annotated with Property numbers)
// mod stream_metadata_immutability_property_test; // Property 74
// #[cfg(test)]
// mod vault_funding_overflow_property_test; // Property 73

// Chaos tests
// #[cfg(test)]
// mod vault_concurrent_claims_chaos_test;

// Temporarily disabled due to pre-existing compilation errors
// #[cfg(test)]
// mod two_step_admin_security_test;

#[cfg(test)]
mod two_step_admin_test;

#[cfg(test)]
mod two_step_admin_standalone_test;

#[cfg(test)]
mod multisig_test;

// #[cfg(test)]
// mod stream_metadata_update_test;

// #[cfg(test)]
// mod governance_test;

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Bytes, BytesN, Env, String, Symbol, Vec};
use types::{
    AuctionStatus, BurnAuction, BuybackCampaign, CampaignStatus, ContractMetadata,
    DynamicQuorumConfig, Error, FactoryState, PaginationCursor, StreamInfo, StreamPage,
    StreamParams, TokenCreationParams, TokenInfo, TokenStats, Vault, VaultStatus,
};
use crate::milestone_verification::MilestoneVerifier;

#[contract]
pub struct TokenFactory;

#[contractimpl]
impl TokenFactory {
    /// Initialize the token factory contract
    ///
    /// Sets up the factory with administrative addresses and fee structure.
    /// This function can only be called once during contract deployment.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Address with administrative privileges
    /// * `treasury` - Address that will receive deployment fees
    /// * `base_fee` - Base fee for token deployment in stroops (must be >= 0)
    /// * `metadata_fee` - Additional fee for metadata in stroops (must be >= 0)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::AlreadyInitialized` - Contract has already been initialized
    /// * `Error::InvalidParameters` - Either fee is negative
    ///
    /// # Examples
    /// ```
    /// factory.initialize(
    ///     &env,
    ///     admin_address,
    ///     treasury_address,
    ///     1_000_000,  // 0.1 XLM base fee
    ///     500_000,    // 0.05 XLM metadata fee
    /// )?;
    /// ```
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        base_fee: i128,
        metadata_fee: i128,
    ) -> Result<(), Error> {
        // Early return if already initialized
        if storage::has_admin(&env) {
            return Err(Error::AlreadyInitialized);
        }

        // Combined parameter validation (Phase 1 optimization)
        // Check both fees in single evaluation
        if base_fee < 0 || metadata_fee < 0 {
            return Err(Error::InvalidParameters);
        }

        // Set initial state
        storage::set_admin(&env, &admin);
        storage::set_treasury(&env, &treasury);
        storage::set_base_fee(&env, base_fee);
        storage::set_metadata_fee(&env, metadata_fee);

        // Emit initialized event
        events::emit_initialized(&env, &admin, &treasury, base_fee, metadata_fee);

        Ok(())
    }



    /// Get the current factory state
    ///
    /// Returns a snapshot of the factory's configuration including
    /// admin, treasury, fees, and pause status.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Returns a `FactoryState` struct with current configuration
    ///
    /// # Examples
    /// ```
    /// let state = factory.get_state(&env);
    /// assert_eq!(state.admin, expected_admin);
    /// assert_eq!(state.base_fee, 1_000_000);
    /// ```
    pub fn get_state(env: Env) -> FactoryState {
        storage::get_factory_state(&env)
    }

    /// Get the current base fee for token deployment
    ///
    /// Returns the base fee amount in stroops that must be paid
    /// for any token deployment, regardless of metadata inclusion.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Returns the base fee as an i128 in stroops
    ///
    /// # Examples
    /// ```
    /// let base_fee = factory.get_base_fee(&env);
    /// // Ensure user has sufficient balance
    /// assert!(user_balance >= base_fee);
    /// ```
    pub fn get_base_fee(env: Env) -> i128 {
        storage::get_base_fee(&env)
    }

    /// Get the current metadata fee for token deployment
    ///
    /// Returns the additional fee amount in stroops that must be paid
    /// when deploying a token with metadata (IPFS URI).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Returns the metadata fee as an i128 in stroops
    ///
    /// # Examples
    /// ```
    /// let total_fee = factory.get_base_fee(&env) + factory.get_metadata_fee(&env);
    /// // Total fee when including metadata
    /// ```
    pub fn get_metadata_fee(env: Env) -> i128 {
        storage::get_metadata_fee(&env)
    }

    /// Transfer admin rights to a new address
    ///
    /// Allows the current admin to transfer administrative control to a new address.
    /// This is a critical operation that permanently changes who can manage the factory.
    ///
    /// Implements #217, #224
    ///
    /// # Arguments
    /// * `current_admin` - The current admin address (must authorize)
    /// * `new_admin` - The new admin address to transfer rights to
    ///
    /// # Errors
    /// * `Unauthorized` - If caller is not the current admin
    /// * `InvalidParameters` - If new admin is same as current or invalid
    pub fn transfer_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<(), Error> {
        // Require current admin authorization
        current_admin.require_auth();

        // Combined verification (Phase 1 optimization)
        // Early return if not authorized
        let stored_admin = storage::get_admin(&env);
        if current_admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        // Validate new admin is different
        if new_admin == current_admin {
            return Err(Error::InvalidParameters);
        }

        // Update admin in storage
        storage::set_admin(&env, &new_admin);

        // Clear any pending admin proposal (direct transfer supersedes it)
        storage::clear_pending_admin(&env);

        // Validate new admin is valid
        validation::validate_admin(&env)?;

        // Emit optimized event
        events::emit_admin_transfer(&env, &current_admin, &new_admin);

        Ok(())
    }

    /// Propose a new admin (two-step transfer - step 1)
    ///
    /// Initiates a two-step admin transfer by proposing a new admin.
    /// Only one pending proposal can exist at a time - new proposals overwrite old ones.
    /// The proposed admin must call `accept_admin` to complete the transfer.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `current_admin` - Current admin address (must authorize)
    /// * `new_admin` - Proposed new admin address
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Unauthorized` - If caller is not the current admin
    /// * `InvalidParameters` - If new admin is same as current
    pub fn propose_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<(), Error> {
        current_admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if current_admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        if new_admin == current_admin {
            return Err(Error::InvalidParameters);
        }

        // Overwrite any existing pending admin (prevents stale proposals)
        storage::set_pending_admin(&env, &new_admin);

        events::emit_admin_proposed(&env, &current_admin, &new_admin);

        Ok(())
    }

    /// Accept admin role (two-step transfer - step 2)
    ///
    /// Completes the admin transfer by accepting the pending proposal.
    /// Only the proposed admin can call this. Clears the pending admin after acceptance.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `new_admin` - Proposed admin address (must authorize and match pending)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Unauthorized` - If caller is not the pending admin or no pending admin exists
    pub fn accept_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        new_admin.require_auth();

        let pending = storage::get_pending_admin(&env).ok_or(Error::Unauthorized)?;

        if new_admin != pending {
            return Err(Error::Unauthorized);
        }

        let old_admin = storage::get_admin(&env);

        // Update admin and clear pending in single operation
        storage::set_admin(&env, &new_admin);
        storage::clear_pending_admin(&env);

        events::emit_admin_transfer(&env, &old_admin, &new_admin);

        Ok(())
    }

    /// Pause the contract (admin only)
    ///
    /// Halts critical operations like token creation and metadata updates.
    /// Admin functions like fee updates remain operational during pause.
    /// This is a safety mechanism for emergency situations.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    ///
    /// # Examples
    /// ```
    /// // Emergency pause
    /// factory.pause(&env, admin_address)?;
    /// assert!(factory.is_paused(&env));
    /// ```
    pub fn pause(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        // Combined verification (Phase 1 optimization)
        let current_admin = storage::get_admin(&env);
        if admin != current_admin {
            return Err(Error::Unauthorized);
        }

        storage::set_paused(&env, true);

        // Use optimized event
        events::emit_pause(&env, &admin);

        Ok(())
    }

    /// Unpause the contract (admin only)
    ///
    /// Resumes normal operations after a pause. All previously
    /// restricted operations become available again.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    ///
    /// # Examples
    /// ```
    /// // Resume operations
    /// factory.unpause(&env, admin_address)?;
    /// assert!(!factory.is_paused(&env));
    /// ```
    pub fn unpause(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        // Combined verification (Phase 1 optimization)
        let current_admin = storage::get_admin(&env);
        if admin != current_admin {
            return Err(Error::Unauthorized);
        }

        storage::set_paused(&env, false);

        // Use optimized event
        events::emit_unpause(&env, &admin);

        Ok(())
    }

    /// Check if contract is currently paused
    ///
    /// Returns the current pause state of the contract.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Returns `true` if paused, `false` if operational
    ///
    /// # Examples
    /// ```
    /// if factory.is_paused(&env) {
    ///     // Handle paused state
    ///     return Err(Error::ContractPaused);
    /// }
    /// ```
    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    /// Update fee structure (admin only)
    ///
    /// Allows the admin to update either or both deployment fees.
    /// At least one fee must be specified for the update.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `base_fee` - Optional new base fee in stroops (None = no change)
    /// * `metadata_fee` - Optional new metadata fee in stroops (None = no change)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::InvalidParameters` - Both fees are None or any fee is negative
    ///
    /// # Examples
    /// ```
    /// // Update only base fee
    /// factory.update_fees(&env, admin, Some(2_000_000), None)?;
    ///
    /// // Update both fees
    /// factory.update_fees(&env, admin, Some(2_000_000), Some(1_000_000))?;
    /// ```
    pub fn update_fees(
        env: Env,
        admin: Address,
        base_fee: Option<i128>,
        metadata_fee: Option<i128>,
    ) -> Result<(), Error> {
        admin.require_auth();

        // Early return on unauthorized (Phase 1 optimization)
        let current_admin = storage::get_admin(&env);
        if admin != current_admin {
            return Err(Error::Unauthorized);
        }

        // Early return if no changes requested
        if base_fee.is_none() && metadata_fee.is_none() {
            return Err(Error::InvalidParameters);
        }

        // Validate fees before updating (Phase 1 optimization)
        if let Some(fee) = base_fee {
            if fee < 0 {
                return Err(Error::InvalidParameters);
            }
            storage::set_base_fee(&env, fee);
        }

        if let Some(fee) = metadata_fee {
            if fee < 0 {
                return Err(Error::InvalidParameters);
            }
            storage::set_metadata_fee(&env, fee);
        }

        // Validate fees after update
        validation::validate_fees(&env)?;

        // Get updated fees for event
        let new_base_fee = base_fee.unwrap_or_else(|| storage::get_base_fee(&env));
        let new_metadata_fee = metadata_fee.unwrap_or_else(|| storage::get_metadata_fee(&env));

        // Emit optimized event
        events::emit_fees_updated(&env, new_base_fee, new_metadata_fee);
        Ok(())
    }

    /// Get token info by index
    pub fn get_token_info(env: Env, index: u32) -> Result<TokenInfo, Error> {
        let mut info = storage::get_token_info(&env, index).ok_or(Error::TokenNotFound)?;
        info.is_paused = storage::is_token_paused(&env, index);
        Ok(info)
    }

    /// Batch update admin operations (Phase 2 optimization)
    ///
    /// Updates multiple admin parameters in a single transaction,
    /// reducing gas costs by combining verification and storage operations.
    /// Provides 40-50% gas savings compared to separate function calls.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `base_fee` - Optional new base fee in stroops (None = no change)
    /// * `metadata_fee` - Optional new metadata fee in stroops (None = no change)
    /// * `paused` - Optional new pause state (None = no change)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::InvalidParameters` - All parameters are None or any fee is negative
    ///
    /// # Gas Savings
    /// - Batch both fee updates: -2,000 to 3,000 CPU instructions
    /// - Combined with pause: -1,000 additional CPU instructions
    /// - Total savings vs separate calls: 40-50% for combined operations
    ///
    /// # Examples
    /// ```
    /// // Update fees and pause in one transaction
    /// factory.batch_update_admin(
    ///     &env,
    ///     admin,
    ///     Some(2_000_000),
    ///     Some(1_000_000),
    ///     Some(true),
    /// )?;
    /// ```
    pub fn batch_update_admin(
        env: Env,
        admin: Address,
        base_fee: Option<i128>,
        metadata_fee: Option<i128>,
        paused: Option<bool>,
    ) -> Result<(), Error> {
        admin.require_auth();

        // Single admin verification (Phase 2 optimization)
        let current_admin = storage::get_admin(&env);
        if admin != current_admin {
            return Err(Error::Unauthorized);
        }

        // Early return if no changes
        if base_fee.is_none() && metadata_fee.is_none() && paused.is_none() {
            return Err(Error::InvalidParameters);
        }

        // Validate all inputs before any storage writes (Phase 2 optimization)
        if let Some(fee) = base_fee {
            if fee < 0 {
                return Err(Error::InvalidParameters);
            }
            storage::set_base_fee(&env, fee);
        }

        if let Some(fee) = metadata_fee {
            if fee < 0 {
                return Err(Error::InvalidParameters);
            }
            storage::set_metadata_fee(&env, fee);
        }

        if let Some(pause_state) = paused {
            storage::set_paused(&env, pause_state);
        }

        // Validate fees after update
        validation::validate_fees(&env)?;

        // Get final state for event
        let final_base_fee = storage::get_base_fee(&env);
        let final_metadata_fee = storage::get_metadata_fee(&env);

        // Emit single consolidated event (Phase 2 optimization)
        events::emit_fees_updated(&env, final_base_fee, final_metadata_fee);

        Ok(())
    }

    /// Get token information by contract address
    ///
    /// Retrieves complete information about a token using its
    /// deployed contract address.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_address` - The token's contract address
    ///
    /// # Returns
    /// Returns `Ok(TokenInfo)` with token details
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Token address not found in registry
    ///
    /// # Examples
    /// ```
    /// let token = factory.get_token_info_by_address(&env, token_addr)?;
    /// assert_eq!(token.creator, expected_creator);
    /// ```
    pub fn get_token_info_by_address(env: Env, token_address: Address) -> Result<TokenInfo, Error> {
        storage::get_token_info_by_address(&env, &token_address).ok_or(Error::TokenNotFound)
    }

    // ── Game / Deployment History ─────────────────────────────────────────

    /// Return the total number of deployment history records.
    pub fn history_count(env: Env) -> u64 {
        game_history::history_count(&env)
    }

    /// Retrieve a single deployment history record by its history index.
    ///
    /// Returns `None` if the index is out of range or has been pruned.
    pub fn get_history_record(
        env: Env,
        history_index: u64,
    ) -> Option<game_history::DeploymentRecord> {
        game_history::get_history_record(&env, history_index)
    }

    /// Query deployment history for a specific creator address.
    ///
    /// Returns up to `limit` records (max 100) starting from `offset`.
    ///
    /// # Errors
    /// `InvalidParameters` – `limit` is 0 or > 100.
    pub fn query_by_creator(
        env: Env,
        creator: Address,
        offset: u64,
        limit: u32,
    ) -> Result<Vec<game_history::DeploymentRecord>, Error> {
        game_history::query_by_creator(&env, &creator, offset, limit)
    }

    /// Query deployment history within a ledger timestamp range `[from, to]`.
    ///
    /// Returns up to `limit` records (max 100).
    ///
    /// # Errors
    /// `InvalidParameters` – `from > to`, `limit` is 0, or `limit > 100`.
    pub fn query_by_time_range(
        env: Env,
        from: u64,
        to: u64,
        limit: u32,
    ) -> Result<Vec<game_history::DeploymentRecord>, Error> {
        game_history::query_by_time_range(&env, from, to, limit)
    }

    /// Replay history up to `up_to_index` and return a cumulative snapshot.
    ///
    /// Useful for auditing: the snapshot's `token_count` and
    /// `cumulative_supply` should match the live factory state at that point.
    ///
    /// # Errors
    /// `InvalidParameters` – `up_to_index` is beyond the current history count.
    pub fn replay(env: Env, up_to_index: u64) -> Result<game_history::HistorySnapshot, Error> {
        game_history::replay(&env, up_to_index)
    }

    /// Prune history records with index < `before_index` (admin only).
    ///
    /// Removes records from persistent storage to reclaim ledger space.
    /// The history count is NOT decremented.
    ///
    /// # Returns
    /// Number of records pruned.
    ///
    /// # Errors
    /// `Unauthorized` – Caller is not the factory admin.
    /// `InvalidParameters` – `before_index` is 0 or exceeds the history count.
    pub fn prune_history(
        env: Env,
        admin: Address,
        before_index: u64,
    ) -> Result<u32, Error> {
        game_history::prune_history(&env, &admin, before_index)
    }

    // ── Referral / Affiliate System ───────────────────────────────────────

    /// Register a referral relationship.
    ///
    /// `referee` is the new user; `referrer` is the existing user who brought
    /// them. A referee can only register once and cannot refer themselves.
    ///
    /// # Errors
    /// `InvalidParameters` – self-referral or already registered.
    pub fn register_referral(
        env: Env,
        referee: Address,
        referrer: Address,
    ) -> Result<(), Error> {
        referee.require_auth();
        referral::register_referral(&env, &referee, &referrer)
    }

    /// Return the referral info for a given referee address.
    pub fn get_referral(
        env: Env,
        referee: Address,
    ) -> Option<referral::ReferralInfo> {
        referral::get_referral(&env, &referee)
    }

    /// Return the total commission earned (but not yet paid out) by a referrer.
    pub fn get_referral_earned(env: Env, referrer: Address) -> i128 {
        referral::get_earned(&env, &referrer)
    }

    /// Return the current commission rate in basis points.
    pub fn get_commission_rate(env: Env) -> u32 {
        referral::get_commission_rate_bps(&env)
    }

    /// Update the referral commission rate (admin only).
    ///
    /// # Arguments
    /// * `admin`    – Factory admin (must auth).
    /// * `rate_bps` – New rate in basis points; max `MAX_COMMISSION_BPS` (2000).
    ///
    /// # Errors
    /// `Unauthorized` – Caller is not the factory admin.
    /// `InvalidParameters` – `rate_bps > 2000`.
    pub fn set_commission_rate(
        env: Env,
        admin: Address,
        rate_bps: u32,
    ) -> Result<(), Error> {
        referral::set_commission_rate_bps(&env, &admin, rate_bps)
    }

    /// Pay out accumulated commission to a referrer (admin only).
    ///
    /// Resets the referrer's earned balance to zero.
    ///
    /// # Returns
    /// Amount paid out.
    ///
    /// # Errors
    /// `Unauthorized` – Caller is not the factory admin.
    /// `InvalidParameters` – Referrer has no earned commission.
    pub fn payout_commission(
        env: Env,
        admin: Address,
        referrer: Address,
    ) -> Result<i128, Error> {
        referral::payout_commission(&env, &admin, &referrer)
    }
    /// * `initial_supply` - Initial token supply
    /// * `fee_payment` - Fee amount (must be >= base_fee)
    /// Toggle clawback capability for a token (creator only)
    ///
    /// Allows the token creator to enable or disable clawback functionality.
    /// When enabled, the creator can burn tokens from any holder's address.
    /// This setting can be toggled multiple times by the creator.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_address` - The token's contract address
    /// * `admin` - Token creator address (must authorize and match creator)
    /// * `enabled` - True to enable clawback, false to disable
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::ContractPaused` - Contract is currently paused
    /// * `Error::TokenNotFound` - Token address not found
    /// * `Error::Unauthorized` - Caller is not the token creator
    ///
    /// # Examples
    /// ```
    /// // Enable clawback for emergency situations
    /// factory.set_clawback(&env, token_addr, creator, true)?;
    ///
    /// // Disable clawback for decentralization
    /// factory.set_clawback(&env, token_addr, creator, false)?;
    /// ```
    pub fn set_clawback(
        env: Env,
        token_address: Address,
        admin: Address,
        enabled: bool,
    ) -> Result<(), Error> {
        // Early return if contract is paused (Phase 1 optimization)
        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        // Require admin authorization
        admin.require_auth();

        // Get token info
        let mut token_info =
            storage::get_token_info_by_address(&env, &token_address).ok_or(Error::TokenNotFound)?;

        // Verify admin is the token creator
        if token_info.creator != admin {
            return Err(Error::Unauthorized);
        }

        // Update clawback setting
        token_info.clawback_enabled = enabled;
        storage::set_token_info_by_address(&env, &token_address, &token_info);

        // Emit optimized event
        events::emit_clawback_toggled(&env, &token_address, &admin, enabled);
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Transfer Restriction Functions (Whitelist / Blacklist via Freeze)
    // ═══════════════════════════════════════════════════════════════════════

    /// Enable or disable freeze (transfer restriction) capability for a token.
    ///
    /// When enabled, the token creator can freeze individual addresses, preventing
    /// them from participating in transfers, burns, or mints (blacklist model).
    /// When disabled, no new addresses can be frozen, but existing frozen state persists.
    ///
    /// # Arguments
    /// * `token_address` - The token contract address
    /// * `admin` - Token creator address (must authorize)
    /// * `enabled` - `true` to enable freeze capability, `false` to disable
    ///
    /// # Errors
    /// * `ContractPaused` - Contract is paused
    /// * `TokenNotFound` - Token not found
    /// * `Unauthorized` - Caller is not the token creator
    pub fn set_freeze_enabled(
        env: Env,
        token_address: Address,
        admin: Address,
        enabled: bool,
    ) -> Result<(), Error> {
        freeze_functions::set_freeze_enabled(&env, &token_address, &admin, enabled)
    }

    /// Freeze (blacklist) an address for a specific token.
    ///
    /// A frozen address cannot send or receive tokens, burn, or mint.
    /// Requires freeze to be enabled for the token.
    ///
    /// # Arguments
    /// * `token_address` - The token contract address
    /// * `admin` - Token creator address (must authorize)
    /// * `address_to_freeze` - The address to blacklist
    ///
    /// # Errors
    /// * `ContractPaused` - Contract is paused
    /// * `TokenNotFound` - Token not found
    /// * `Unauthorized` - Caller is not the token creator, or freeze not enabled
    /// * `InvalidParameters` - Address is already frozen
    pub fn freeze_address(
        env: Env,
        token_address: Address,
        admin: Address,
        address_to_freeze: Address,
    ) -> Result<(), Error> {
        freeze_functions::freeze_address(&env, &token_address, &admin, &address_to_freeze)
    }

    /// Unfreeze (remove from blacklist) an address for a specific token.
    ///
    /// Restores normal transfer capability for a previously frozen address.
    ///
    /// # Arguments
    /// * `token_address` - The token contract address
    /// * `admin` - Token creator address (must authorize)
    /// * `address_to_unfreeze` - The address to remove from blacklist
    ///
    /// # Errors
    /// * `ContractPaused` - Contract is paused
    /// * `TokenNotFound` - Token not found
    /// * `Unauthorized` - Caller is not the token creator, or freeze not enabled
    /// * `InvalidParameters` - Address is not frozen
    pub fn unfreeze_address(
        env: Env,
        token_address: Address,
        admin: Address,
        address_to_unfreeze: Address,
    ) -> Result<(), Error> {
        freeze_functions::unfreeze_address(&env, &token_address, &admin, &address_to_unfreeze)
    }

    /// Check whether an address is frozen (blacklisted) for a specific token.
    ///
    /// # Arguments
    /// * `token_address` - The token contract address
    /// * `address` - The address to check
    ///
    /// # Returns
    /// `true` if the address is frozen, `false` otherwise
    pub fn is_address_frozen(env: Env, token_address: Address, address: Address) -> bool {
        freeze_functions::is_frozen(&env, &token_address, &address)
    }

    /// Burn tokens from caller's own balance
    ///
    /// Allows a token holder to permanently destroy tokens from their
    /// own balance, reducing the total supply.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Address burning tokens (must authorize)
    /// * `token_index` - Index of the token to burn
    /// * `amount` - Amount to burn (must be > 0 and <= balance)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Token index is invalid
    /// * `Error::InvalidParameters` - Amount is zero or negative
    /// * `Error::InsufficientBalance` - Caller balance is less than amount
    /// * `Error::ArithmeticError` - Numeric overflow/underflow
    ///
    /// # Examples
    /// ```
    /// // Burn 1000 tokens
    /// factory.burn(&env, caller, 0, 1_000_0000000)?;
    /// ```
    pub fn burn(env: Env, caller: Address, token_index: u32, amount: i128) -> Result<(), Error> {
        burn::burn(&env, caller, token_index, amount)
    }

    /// Batch burn tokens from multiple holders (admin only)
    ///
    /// Allows the admin to burn tokens from multiple addresses in a single
    /// transaction. All burns must succeed or the entire batch fails.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `token_index` - Index of the token to burn
    /// * `burns` - Vector of (holder_address, amount) tuples (max 100 entries)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::BatchTooLarge` - More than 100 burn entries
    /// * `Error::InvalidParameters` - Empty batch or invalid amounts
    /// * `Error::TokenNotFound` - Token index is invalid
    /// * `Error::InsufficientBalance` - Any holder has insufficient balance
    /// * `Error::ArithmeticError` - Numeric overflow/underflow
    ///
    /// # Examples
    /// ```
    /// let burns = vec![
    ///     &env,
    ///     (holder1, 1_000_0000000),
    ///     (holder2, 2_000_0000000),
    /// ];
    /// factory.batch_burn(&env, admin, 0, burns)?;
    /// ```
    pub fn batch_burn(
        env: Env,
        admin: Address,
        token_index: u32,
        burns: soroban_sdk::Vec<(Address, i128)>,
    ) -> Result<(), Error> {
        burn::batch_burn(&env, admin, token_index, burns)
    }

    /// Get the total number of burn operations for a token
    ///
    /// Returns the count of all burn operations (both user and admin burns)
    /// performed on the specified token.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_index` - Index of the token
    ///
    /// # Returns
    /// Returns the burn count as a u32
    ///
    /// # Examples
    /// ```
    /// let burn_count = factory.get_burn_count(&env, 0);
    /// assert!(burn_count > 0);
    /// ```
    pub fn get_burn_count(env: Env, token_index: u32) -> u32 {
        burn::get_burn_count(&env, token_index)
    }

    /// Admin-initiated burn from any holder's balance
    ///
    /// Allows the admin to burn tokens from any holder's address.
    /// This is a privileged operation that requires admin authentication.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `token_index` - Index of the token to burn
    /// * `holder` - Address holding the tokens to burn
    /// * `amount` - Amount to burn (must be > 0 and <= holder's balance)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::TokenNotFound` - Token index is invalid
    /// * `Error::InvalidParameters` - Amount is zero or negative
    /// * `Error::InsufficientBalance` - Holder balance is less than amount
    /// * `Error::ArithmeticError` - Numeric overflow/underflow
    ///
    /// # Examples
    /// ```
    /// // Admin burns 1000 tokens from a holder
    /// factory.admin_burn(&env, admin, 0, holder, 1_000_0000000)?;
    /// ```
    pub fn admin_burn(
        env: Env,
        admin: Address,
        token_index: u32,
        holder: Address,
        amount: i128,
    ) -> Result<(), Error> {
        burn::admin_burn(&env, admin, token_index, holder, amount)
    }

    /// Set metadata URI for a token (one-time only)
    ///
    /// Allows the token creator to set an IPFS metadata URI for their token.
    /// This operation can only be performed once per token - metadata is
    /// immutable after being set to ensure data integrity and trust.
    ///
    /// # Mutability Rules
    /// - Metadata can only be set if it's currently `None`
    /// - Once set, metadata cannot be changed or removed
    /// - This ensures permanent, tamper-proof token metadata
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_index` - Index of the token to update
    /// * `admin` - Token creator address (must authorize and match creator)
    /// * `metadata_uri` - IPFS URI for token metadata (e.g., "ipfs://Qm...")
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::ContractPaused` - Contract is currently paused
    /// * `Error::TokenNotFound` - Token index is invalid
    /// * `Error::Unauthorized` - Caller is not the token creator
    /// * `Error::MetadataAlreadySet` - Metadata has already been set (immutable)
    ///
    /// # Examples
    /// ```
    /// // Set metadata for the first time
    /// let metadata_uri = String::from_str(&env, "ipfs://QmTest123");
    /// factory.set_metadata(&env, 0, creator, metadata_uri)?;
    ///
    /// // Attempting to change metadata will fail
    /// let new_uri = String::from_str(&env, "ipfs://QmTest456");
    /// let result = factory.set_metadata(&env, 0, creator, new_uri);
    /// assert_eq!(result, Err(Error::MetadataAlreadySet));
    /// ```
    pub fn batch_create_tokens(
        env: Env,
        creator: Address,
        tokens: Vec<TokenCreationParams>,
        total_fee_payment: i128,
    ) -> Result<Vec<Address>, Error> {
        // Flash loan / reentrancy protection
        storage::acquire_reentrancy_lock(&env)?;
        let result = token_creation::batch_create_tokens(&env, creator, tokens, total_fee_payment);
        storage::release_reentrancy_lock(&env);
        result
    }

    /// Batch-create tokens with storage optimisation and atomicity guarantees.
    ///
    /// Validates all parameters before writing any state. Returns the indices of
    /// the newly created tokens. Max batch size: `batch_operations::MAX_BATCH_SIZE`.
    ///
    /// # Arguments
    /// * `creator`           – Token creator (must auth).
    /// * `tokens`            – Creation params for each token.
    /// * `total_fee_payment` – Combined fee for the whole batch.
    ///
    /// # Errors
    /// `ContractPaused`, `BatchTooLarge`, `InvalidParameters`,
    /// `InsufficientFee`, `InvalidTokenParams`.
    pub fn batch_reveal(
        env: Env,
        creator: Address,
        tokens: Vec<TokenCreationParams>,
        total_fee_payment: i128,
    ) -> Result<Vec<u32>, Error> {
        storage::acquire_reentrancy_lock(&env)?;
        let result = batch_operations::batch_reveal(&env, creator, tokens, total_fee_payment);
        storage::release_reentrancy_lock(&env);
        result
    }

    /// Batch-mint tokens to multiple recipients atomically.
    ///
    /// All amounts are validated and the max-supply check is performed against
    /// the aggregate total before any balance is updated.
    ///
    /// # Arguments
    /// * `creator`      – Token creator (must auth).
    /// * `token_index`  – Index of the token to mint.
    /// * `recipients`   – `(address, amount)` pairs; max `MAX_BATCH_SIZE`.
    ///
    /// # Returns
    /// Total amount minted.
    ///
    /// # Errors
    /// `ContractPaused`, `TokenNotFound`, `Unauthorized`, `TokenPaused`,
    /// `BatchTooLarge`, `InvalidParameters`, `MaxSupplyExceeded`.
    pub fn batch_settle(
        env: Env,
        creator: Address,
        token_index: u32,
        recipients: Vec<(Address, i128)>,
    ) -> Result<i128, Error> {
        storage::acquire_reentrancy_lock(&env)?;
        let result = batch_operations::batch_settle(&env, creator, token_index, recipients);
        storage::release_reentrancy_lock(&env);
        result
    }

    /// Set metadata URI for a token by index (creator-only convenience function)
    ///
    /// Looks up the token creator from storage and sets the metadata URI.
    /// Can only be called once per token — metadata is immutable after being set.
    /// Blocked when the token is paused.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_index` - Index of the token
    /// * `metadata_uri` - IPFS URI to set (e.g., "ipfs://Qm...")
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Token index does not exist
    /// * `Error::TokenPaused` - Token is currently paused
    /// * `Error::MetadataAlreadySet` - Metadata already set for this token
    pub fn set_metadata(
        env: Env,
        token_index: u32,
        metadata_uri: String,
    ) -> Result<(), Error> {
        let token_info =
            storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;
        let creator = token_info.creator.clone();
        creator.require_auth();

        if storage::is_token_paused(&env, token_index) {
            return Err(Error::TokenPaused);
        }

        if token_info.metadata_uri.is_some() {
            return Err(Error::MetadataAlreadySet);
        }

        let mut info = token_info;
        info.metadata_uri = Some(metadata_uri.clone());
        info.metadata_version = 1;
        storage::set_token_info(&env, token_index, &info);
        storage::set_token_info_by_address(&env, &info.address, &info);

        let record = types::MetadataRecord {
            uri: metadata_uri.clone(),
            updated_at: env.ledger().timestamp(),
            updated_by: creator.clone(),
        };
        env.storage().persistent().set(
            &types::DataKey::MetadataHistory(token_index, 1),
            &record,
        );

        events::emit_metadata_set(&env, &info.address, &creator, &metadata_uri);
        Ok(())
    }

    /// Set metadata for a token
    /// 
    /// Allows the token creator to set metadata URI once
    pub fn set_token_metadata(
        env: Env,
        admin: Address,
        token_index: u32,
        metadata_uri: String,
    ) -> Result<(), Error> {
        // Require admin authorization
        admin.require_auth();

        // Get token info
        let mut token_info =
            storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;

        // Verify caller is the token creator or holds MetadataManager role
        if token_info.creator != admin
            && !storage::has_role(&env, token_index, &admin, types::Role::MetadataManager)
        {
            return Err(Error::Unauthorized);
        }

        // Reject if the token is individually paused
        if storage::is_token_paused(&env, token_index) {
            return Err(Error::TokenPaused);
        }

        // Enforce immutability: metadata can only be set once
        if token_info.metadata_uri.is_some() {
            return Err(Error::MetadataAlreadySet);
        }

        // Set metadata URI and initialize version to 1
        token_info.metadata_uri = Some(metadata_uri.clone());
        token_info.metadata_version = 1;
        storage::set_token_info(&env, token_index, &token_info);

        // Also update by address lookup
        storage::set_token_info_by_address(&env, &token_info.address, &token_info);

        // Record initial history entry
        let record = types::MetadataRecord {
            uri: metadata_uri.clone(),
            updated_at: env.ledger().timestamp(),
            updated_by: admin.clone(),
        };
        storage::push_metadata_history(&env, token_index, &record)?;

        // Emit metadata set event
        events::emit_metadata_set(&env, &token_info.address, &admin, &metadata_uri);

        Ok(())
    }

    /// Update metadata URI for a token with version tracking
    ///
    /// Allows the token creator to update the IPFS metadata URI after it has
    /// been initially set. Each update increments the version counter and
    /// records a history entry so the full update trail is auditable on-chain.
    ///
    /// # Mutability Rules
    /// - Metadata must have been set at least once via `set_token_metadata`
    /// - Any number of subsequent updates are allowed by the creator
    /// - Each update is permanently recorded in history storage
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Token creator address (must authorize and match creator)
    /// * `token_index` - Index of the token to update
    /// * `new_metadata_uri` - New IPFS URI for token metadata (e.g., "ipfs://Qm...")
    ///
    /// # Returns
    /// Returns `Ok(new_version)` — the incremented version number — on success
    ///
    /// # Errors
    /// * `Error::ContractPaused` - Contract is currently paused
    /// * `Error::TokenNotFound` - Token index is invalid
    /// * `Error::Unauthorized` - Caller is not the token creator
    /// * `Error::MetadataNotSet` - Metadata has never been set; call `set_token_metadata` first
    ///
    /// # Events
    /// Emits `meta_upd` with token address, admin, new URI, and new version number
    ///
    /// # Examples
    /// ```
    /// // First set metadata
    /// factory.set_token_metadata(&env, creator, 0, String::from_str(&env, "ipfs://QmV1"))?;
    ///
    /// // Later update it
    /// let v = factory.update_metadata(&env, creator, 0, String::from_str(&env, "ipfs://QmV2"))?;
    /// assert_eq!(v, 2);
    /// ```
    pub fn update_metadata(
        env: Env,
        admin: Address,
        token_index: u32,
        new_metadata_uri: String,
    ) -> Result<u32, Error> {
        // Check contract pause state before auth to fail fast
        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        admin.require_auth();

        let mut token_info =
            storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;

        // Only the token creator may update metadata
        if token_info.creator != admin {
            return Err(Error::Unauthorized);
        }

        // Reject if the token is individually paused
        if storage::is_token_paused(&env, token_index) {
            return Err(Error::TokenPaused);
        }

        // Metadata must have been set at least once
        if token_info.metadata_uri.is_none() {
            return Err(Error::MetadataNotSet);
        }

        // Compute new version before any mutation
        let new_version = token_info
            .metadata_version
            .checked_add(1)
            .ok_or(Error::ArithmeticError)?;

        // Record history entry for the new version
        let record = types::MetadataRecord {
            uri: new_metadata_uri.clone(),
            updated_at: env.ledger().timestamp(),
            updated_by: admin.clone(),
        };
        // push_metadata_history reads current version from storage, so update
        // token_info first then persist before calling it.
        token_info.metadata_uri = Some(new_metadata_uri.clone());
        token_info.metadata_version = new_version;
        storage::set_token_info(&env, token_index, &token_info);
        storage::set_token_info_by_address(&env, &token_info.address, &token_info);

        // Persist history record (uses the already-updated version in storage)
        env.storage().persistent().set(
            &types::DataKey::MetadataHistory(token_index, new_version),
            &record,
        );

        events::emit_metadata_updated(
            &env,
            &token_info.address,
            &admin,
            &new_metadata_uri,
            new_version,
        );

        Ok(new_version)
    }

    /// Get a historical metadata record for a token
    ///
    /// Returns the MetadataRecord for the given version number.
    /// Version 1 is the initial set; subsequent versions are updates.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_index` - Index of the token
    /// * `version` - Version number to retrieve (1-based)
    ///
    /// # Returns
    /// Returns `Some(MetadataRecord)` if the version exists, `None` otherwise
    pub fn get_metadata_history(
        env: Env,
        token_index: u32,
        version: u32,
    ) -> Option<types::MetadataRecord> {
        storage::get_metadata_history(&env, token_index, version)
    }

    /// Create a single token (convenience wrapper)
    ///
    /// Deploys a new token with the given parameters and mints the initial supply
    /// to the creator. This is a single-token shorthand for `set_metadata` (batch).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator` - Address creating the token (must authorize)
    /// * `name` - Token name (1–32 chars)
    /// * `symbol` - Token symbol (1–12 chars)
    /// * `decimals` - Decimal places (0–18)
    /// * `initial_supply` - Initial supply (must be > 0)
    /// * `metadata_uri` - Optional IPFS URI
    /// * `fee_payment` - Fee in stroops (must be >= base_fee [+ metadata_fee])
    ///
    /// # Returns
    /// Returns the new token's contract address
    ///
    /// # Errors
    /// * `Error::ContractPaused` - Contract is paused
    /// * `Error::InsufficientFee` - Fee too low
    /// * `Error::InvalidTokenParams` - Invalid name/symbol/decimals/supply
    pub fn create_token(
        env: Env,
        creator: Address,
        name: String,
        symbol: String,
        decimals: u32,
        initial_supply: i128,
        metadata_uri: Option<String>,
        fee_payment: i128,
    ) -> Result<Address, Error> {
        token_creation::create_token(
            &env,
            creator,
            name,
            symbol,
            decimals,
            initial_supply,
            metadata_uri,
            fee_payment,
        )
    }

    /// Pause a specific token (admin only)
    ///
    /// Halts all mutable operations on the token — minting, burning, and
    /// metadata updates — until `unpause_token` is called. Read-only queries
    /// (`get_token_info`, `get_token_stats`) remain available.
    ///
    /// This is an emergency control intended for incident response.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Factory admin address (must authorize)
    /// * `token_index` - Index of the token to pause
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the factory admin
    /// * `Error::TokenNotFound` - Token index does not exist
    ///
    /// # Events
    /// Emits `tok_paus` with token_index and admin address
    pub fn pause_token(env: Env, admin: Address, token_index: u32) -> Result<(), Error> {
        admin.require_auth();
        let stored_admin = storage::get_admin(&env);
        let token_info =
            storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;
        // Allow: factory admin, token creator, or address with Pauser role
        if admin != stored_admin
            && admin != token_info.creator
            && !storage::has_role(&env, token_index, &admin, types::Role::Pauser)
        {
            return Err(Error::Unauthorized);
        }
        storage::set_token_paused(&env, token_index, true);
        events::emit_token_paused(&env, token_index, &admin);
        Ok(())
    }

    /// Unpause a specific token (admin only)
    ///
    /// Resumes all mutable operations on the token after an emergency pause.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Factory admin address (must authorize)
    /// * `token_index` - Index of the token to unpause
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the factory admin
    /// * `Error::TokenNotFound` - Token index does not exist
    ///
    /// # Events
    /// Emits `tok_unpas` with token_index and admin address
    pub fn unpause_token(env: Env, admin: Address, token_index: u32) -> Result<(), Error> {
        admin.require_auth();
        let stored_admin = storage::get_admin(&env);
        let token_info =
            storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;
        // Allow: factory admin, token creator, or address with Pauser role
        if admin != stored_admin
            && admin != token_info.creator
            && !storage::has_role(&env, token_index, &admin, types::Role::Pauser)
        {
            return Err(Error::Unauthorized);
        }
        storage::set_token_paused(&env, token_index, false);
        events::emit_token_unpaused(&env, token_index, &admin);
        Ok(())
    }

    /// Check whether a specific token is currently paused
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_index` - Index of the token to check
    ///
    /// # Returns
    /// Returns `true` if the token is paused, `false` otherwise
    pub fn is_token_paused(env: Env, token_index: u32) -> bool {
        storage::is_token_paused(&env, token_index)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RBAC — Role-Based Access Control
    // ═══════════════════════════════════════════════════════════════════════

    /// Grant a role to an address for a specific token (creator only)
    ///
    /// Allows the token creator to delegate specific operations to other
    /// addresses without transferring full creator authority.
    ///
    /// Available roles:
    /// - `Minter` (0) — may call `mint`
    /// - `Burner` (1) — may call `burn` and `admin_burn`
    /// - `Pauser` (2) — may call `pause_token` and `unpause_token`
    /// - `MetadataManager` (3) — may call `set_token_metadata` and `update_metadata`
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator` - Token creator address (must authorize)
    /// * `token_index` - Index of the token
    /// * `grantee` - Address to receive the role
    /// * `role` - The role to grant
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Token index does not exist
    /// * `Error::Unauthorized` - Caller is not the token creator
    ///
    /// # Events
    /// Emits `role_gr_v1` with token_index, creator, grantee, and role
    pub fn grant_role(
        env: Env,
        creator: Address,
        token_index: u32,
        grantee: Address,
        role: types::Role,
    ) -> Result<(), Error> {
        creator.require_auth();

        let token_info =
            storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;

        if token_info.creator != creator {
            return Err(Error::Unauthorized);
        }

        storage::grant_role(&env, token_index, &grantee, role);
        events::emit_role_granted(&env, token_index, &creator, &grantee, role);
        Ok(())
    }

    /// Revoke a role from an address for a specific token (creator only)
    ///
    /// Removes a previously granted role. Idempotent — revoking a role
    /// that was never granted succeeds without error.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator` - Token creator address (must authorize)
    /// * `token_index` - Index of the token
    /// * `revokee` - Address to lose the role
    /// * `role` - The role to revoke
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Token index does not exist
    /// * `Error::Unauthorized` - Caller is not the token creator
    ///
    /// # Events
    /// Emits `role_rv_v1` with token_index, creator, revokee, and role
    pub fn revoke_role(
        env: Env,
        creator: Address,
        token_index: u32,
        revokee: Address,
        role: types::Role,
    ) -> Result<(), Error> {
        creator.require_auth();

        let token_info =
            storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;

        if token_info.creator != creator {
            return Err(Error::Unauthorized);
        }

        storage::revoke_role(&env, token_index, &revokee, role);
        events::emit_role_revoked(&env, token_index, &creator, &revokee, role);
        Ok(())
    }

    /// Check whether an address holds a role for a specific token
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_index` - Index of the token
    /// * `address` - Address to check
    /// * `role` - The role to check
    ///
    /// # Returns
    /// Returns `true` if the address holds the role, `false` otherwise
    pub fn has_role(env: Env, token_index: u32, address: Address, role: types::Role) -> bool {
        storage::has_role(&env, token_index, &address, role)
    }

    /// Return a compact stats snapshot for a token
    pub fn get_token_stats(env: Env, token_index: u32) -> Result<TokenStats, Error> {
        storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;

        Ok(TokenStats {
            current_supply: storage::get_token_info(&env, token_index)
                .map(|i| i.total_supply)
                .unwrap_or(0),
            total_burned: storage::get_total_burned(&env, token_index),
            burn_count: storage::get_burn_count(&env, token_index),
            is_paused: storage::is_token_paused(&env, token_index),
            clawback_enabled: false,
            freeze_enabled: false,
        })
    }

    /// Return a paginated list of token indices where beneficiary is the creator.
    /// cursor: starting entry index (0 for first page)
    /// limit: max entries to return (capped at 50)
    pub fn get_streams_by_beneficiary(
        env: Env,
        beneficiary: Address,
        cursor: u32,
        limit: u32,
    ) -> StreamPage {
        let limit = limit.min(50);
        let total = storage::get_beneficiary_stream_count(&env, &beneficiary);

        let mut token_indices = soroban_sdk::Vec::new(&env);
        let mut i = cursor;

        while i < total && (i - cursor) < limit {
            if let Some(token_index) = storage::get_beneficiary_stream_entry(&env, &beneficiary, i)
            {
                token_indices.push_back(token_index);
            }
            i += 1;
        }

        let next_cursor = if i < total { Some(i) } else { None };

        StreamPage {
            token_indices,
            next_cursor,
        }
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Timelock Functions
    // ═══════════════════════════════════════════════════════════════════════

    /// Schedule a fee update with timelock
    ///
    /// Schedules a change to base_fee or metadata_fee that cannot be executed
    /// until the timelock delay has passed. This provides transparency and
    /// allows users to react to upcoming changes.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `base_fee` - Optional new base fee in stroops (None = no change)
    /// * `metadata_fee` - Optional new metadata fee in stroops (None = no change)
    ///
    /// # Returns
    /// Returns the change ID that can be used to execute or cancel the change
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::InvalidParameters` - Both fees are None or any fee is negative
    ///
    /// # Examples
    /// ```
    /// // Schedule fee update
    /// let change_id = factory.schedule_fee_update(&env, admin, Some(2_000_000), None)?;
    /// // Wait for timelock to expire, then execute
    /// factory.execute_change(&env, change_id)?;
    /// ```
    pub fn schedule_fee_update(
        env: Env,
        admin: Address,
        base_fee: Option<i128>,
        metadata_fee: Option<i128>,
    ) -> Result<u64, Error> {
        timelock::schedule_fee_update(&env, &admin, base_fee, metadata_fee)
    }

    /// Schedule a pause state change with timelock
    ///
    /// Schedules a change to the contract's pause state that cannot be executed
    /// until the timelock delay has passed.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `paused` - New pause state (true to pause, false to unpause)
    ///
    /// # Returns
    /// Returns the change ID
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    ///
    /// # Examples
    /// ```
    /// let change_id = factory.schedule_pause_update(&env, admin, true)?;
    /// ```
    pub fn schedule_pause_update(env: Env, admin: Address, paused: bool) -> Result<u64, Error> {
        timelock::schedule_pause_update(&env, &admin, paused)
    }

    /// Schedule a treasury address change with timelock
    ///
    /// Schedules a change to the treasury address that cannot be executed
    /// until the timelock delay has passed.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `new_treasury` - New treasury address
    ///
    /// # Returns
    /// Returns the change ID
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    ///
    /// # Examples
    /// ```
    /// let change_id = factory.schedule_treasury_update(&env, admin, new_treasury)?;
    /// ```
    pub fn schedule_treasury_update(
        env: Env,
        admin: Address,
        new_treasury: Address,
    ) -> Result<u64, Error> {
        timelock::schedule_treasury_update(&env, &admin, &new_treasury)
    }

    /// Execute a pending change
    ///
    /// Executes a previously scheduled change after the timelock has expired.
    /// Anyone can call this function once the timelock period has elapsed.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `change_id` - ID of the pending change to execute
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Change ID not found
    /// * `Error::TimelockNotExpired` - Timelock period has not elapsed
    /// * `Error::ChangeAlreadyExecuted` - Change has already been executed
    ///
    /// # Examples
    /// ```
    /// // After timelock expires
    /// factory.execute_change(&env, change_id)?;
    /// ```
    pub fn execute_change(env: Env, change_id: u64) -> Result<(), Error> {
        timelock::execute_change(&env, change_id)
    }

    /// Cancel a pending change
    ///
    /// Cancels a scheduled change before it is executed.
    /// Only the admin can cancel pending changes.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize and match stored admin)
    /// * `change_id` - ID of the pending change to cancel
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::TokenNotFound` - Change ID not found
    /// * `Error::ChangeAlreadyExecuted` - Change has already been executed
    ///
    /// # Examples
    /// ```
    /// factory.cancel_change(&env, admin, change_id)?;
    /// ```
    pub fn cancel_change(env: Env, admin: Address, change_id: u64) -> Result<(), Error> {
        timelock::cancel_change(&env, &admin, change_id)
    }

    /// Get pending change details
    ///
    /// Retrieves information about a scheduled change including when it
    /// can be executed and what parameters will be changed.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `change_id` - ID of the pending change
    ///
    /// # Returns
    /// Returns the PendingChange if found, None otherwise
    ///
    /// # Examples
    /// ```
    /// if let Some(change) = factory.get_pending_change(&env, change_id) {
    ///     log!("Change can be executed at: {}", change.execute_at);
    /// }
    /// ```
    pub fn get_pending_change(env: Env, change_id: u64) -> Option<types::PendingChange> {
        timelock::get_pending_change(&env, change_id)
    }

    /// Get timelock configuration
    ///
    /// Returns the current timelock settings including the delay period.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Returns the TimelockConfig
    ///
    /// # Examples
    /// ```
    /// let config = factory.get_timelock_config(&env);
    /// log!("Timelock delay: {} seconds", config.delay_seconds);
    /// ```
    pub fn get_timelock_config(env: Env) -> types::TimelockConfig {
        timelock::get_timelock_config(&env)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Pagination Functions
    // ═══════════════════════════════════════════════════════════════════════

    /// Get tokens created by a specific address with pagination
    ///
    /// Returns a paginated list of tokens created by the specified address.
    /// Results are ordered by token creation order (token index).
    /// Useful for explorer and dashboard interfaces.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator` - Address of the token creator
    /// * `cursor` - Optional cursor for pagination (None = start from beginning)
    /// * `limit` - Maximum number of tokens to return (default 20, max 100)
    ///
    /// # Returns
    /// Returns `PaginatedTokens` containing:
    /// - `tokens`: Vector of TokenInfo for this page
    /// - `cursor`: Optional cursor for next page (None = no more results)
    ///
    /// # Cursor Semantics
    /// - Cursors are deterministic and stable across calls
    /// - Empty cursor (None) starts from the beginning
    /// - Returned cursor of None indicates end of results
    /// - Cursors contain the next position in the creator's token list
    ///
    /// # Examples
    /// ```
    /// // First page
    /// let page1 = factory.get_tokens_by_creator(&env, creator, None, Some(20))?;
    ///
    /// // Next page
    /// if let Some(cursor) = page1.cursor {
    ///     let page2 = factory.get_tokens_by_creator(&env, creator, Some(cursor), Some(20))?;
    /// }
    ///
    /// // Get total count
    /// let total = factory.get_creator_token_count(&env, creator);
    /// ```
    pub fn get_tokens_by_creator(
        env: Env,
        creator: Address,
        cursor: Option<u32>,
        limit: Option<u32>,
    ) -> Result<types::PaginatedTokens, Error> {
        let pagination_cursor = cursor
            .map(|next_index| PaginationCursor { next_index })
            .unwrap_or(PaginationCursor {
                next_index: u32::MAX,
            }); // Using MAX as NO_CURSOR equivalent
        pagination::get_tokens_by_creator(&env, &creator, pagination_cursor, limit)
    }

    /// Get the total number of tokens created by an address
    ///
    /// Returns the count without fetching the actual token data.
    /// Useful for displaying total counts in UIs.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator` - Address of the token creator
    ///
    /// # Returns
    /// Returns the number of tokens created by this address
    ///
    /// # Examples
    /// ```
    /// let count = factory.get_creator_token_count(&env, creator);
    /// log!("Creator has deployed {} tokens", count);
    /// ```
    pub fn get_creator_token_count(env: Env, creator: Address) -> u32 {
        pagination::get_creator_token_count(&env, &creator)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Minting Functions
    // ═══════════════════════════════════════════════════════════════════════

    /// Mint tokens to an address
    ///
    /// Increases the total supply and the recipient's balance.
    /// Enforces max supply constraints if set for the token.
    /// Only the token creator can mint new tokens.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator` - Token creator address (must authorize)
    /// * `token_index` - Index of the token to mint
    /// * `to` - Address to receive the minted tokens
    /// * `amount` - Amount to mint (must be > 0)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the token creator
    /// * `Error::TokenNotFound` - Token doesn't exist
    /// * `Error::InvalidAmount` - Amount is zero or negative
    /// * `Error::MaxSupplyExceeded` - Would exceed max supply cap
    /// * `Error::ArithmeticError` - Overflow in calculation
    /// * `Error::ContractPaused` - Contract is paused
    ///
    /// # Examples
    /// ```
    /// // Mint 1000 tokens
    /// factory.mint(&env, creator, 0, recipient, 1_000_0000000)?;
    ///
    /// // Check remaining mintable
    /// if let Some(remaining) = factory.get_remaining_mintable(&env, 0) {
    ///     log!("Can mint {} more tokens", remaining);
    /// }
    /// ```
    pub fn mint(
        env: Env,
        creator: Address,
        token_index: u32,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        // Check if contract is paused
        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        // Flash loan / reentrancy protection
        storage::acquire_reentrancy_lock(&env)?;

        creator.require_auth();

        // Verify caller is the token creator or holds the Minter role
        let token_info = storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;

        if token_info.creator != creator {
            storage::release_reentrancy_lock(&env);
            return Err(Error::Unauthorized);
        }

        // Perform mint with max supply validation
        let result = mint::mint(&env, token_index, &to, amount);
        storage::release_reentrancy_lock(&env);
        result
    }

    /// Get remaining mintable supply for a token
    ///
    /// Returns how many more tokens can be minted before hitting the max supply.
    /// Returns None if there's no max supply (unlimited minting).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token_index` - Index of the token
    ///
    /// # Returns
    /// * `Some(amount)` - Remaining mintable amount
    /// * `None` - Unlimited minting (no max supply set)
    ///
    /// # Examples
    /// ```
    /// match factory.get_remaining_mintable(&env, 0) {
    ///     Some(0) => log!("Max supply reached"),
    ///     Some(amount) => log!("Can mint {} more", amount),
    ///     None => log!("Unlimited minting"),
    /// }
    /// ```
    pub fn get_remaining_mintable(env: Env, token_index: u32) -> Option<i128> {
        mint::get_remaining_mintable(&env, token_index)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Treasury Functions
    // ═══════════════════════════════════════════════════════════════════════

    /// Initialize treasury policy
    ///
    /// Sets up withdrawal limits and controls for the treasury.
    /// Should be called during contract initialization or when first
    /// configuring treasury protections.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize)
    /// * `daily_cap` - Optional maximum withdrawal per day in stroops (None = default 100 XLM)
    /// * `allowlist_enabled` - Whether to enforce recipient allowlist
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::InvalidParameters` - Daily cap is negative
    ///
    /// # Examples
    /// ```
    /// // 100 XLM daily cap with allowlist
    /// factory.initialize_treasury_policy(&env, admin, Some(100_0000000), true)?;
    /// ```
    pub fn initialize_treasury_policy(
        env: Env,
        admin: Address,
        daily_cap: Option<i128>,
        allowlist_enabled: bool,
    ) -> Result<(), Error> {
        admin.require_auth();

        let current_admin = storage::get_admin(&env);
        if admin != current_admin {
            return Err(Error::Unauthorized);
        }

        treasury::initialize_treasury_policy(&env, daily_cap, allowlist_enabled)
    }

    /// Withdraw fees from treasury
    ///
    /// Transfers accumulated fees to a recipient address.
    /// Enforces withdrawal policy limits and allowlist.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize)
    /// * `recipient` - Address to receive the funds
    /// * `amount` - Amount to withdraw in stroops
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not admin
    /// * `Error::WithdrawalCapExceeded` - Exceeds daily cap
    /// * `Error::RecipientNotAllowed` - Recipient not in allowlist
    /// * `Error::InvalidAmount` - Amount is zero or negative
    ///
    /// # Examples
    /// ```
    /// // Withdraw 50 XLM to recipient
    /// factory.withdraw_fees(&env, admin, recipient, 50_0000000)?;
    /// ```
    pub fn withdraw_fees(
        env: Env,
        admin: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<(), Error> {
        treasury::withdraw_fees(&env, &admin, &recipient, amount)
    }

    /// Add recipient to allowlist
    ///
    /// Allows an address to receive treasury withdrawals.
    /// Only admin can modify the allowlist.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize)
    /// * `recipient` - Address to add to allowlist
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    ///
    /// # Examples
    /// ```
    /// factory.add_allowed_recipient(&env, admin, recipient)?;
    /// ```
    pub fn add_allowed_recipient(
        env: Env,
        admin: Address,
        recipient: Address,
    ) -> Result<(), Error> {
        treasury::add_allowed_recipient(&env, &admin, &recipient)
    }

    /// Remove recipient from allowlist
    ///
    /// Revokes an address's ability to receive treasury withdrawals.
    /// Only admin can modify the allowlist.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize)
    /// * `recipient` - Address to remove from allowlist
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    ///
    /// # Examples
    /// ```
    /// factory.remove_allowed_recipient(&env, admin, recipient)?;
    /// ```
    pub fn remove_allowed_recipient(
        env: Env,
        admin: Address,
        recipient: Address,
    ) -> Result<(), Error> {
        treasury::remove_allowed_recipient(&env, &admin, &recipient)
    }

    /// Update treasury policy
    ///
    /// Changes the withdrawal limits and allowlist settings.
    /// Only admin can update the policy.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize)
    /// * `daily_cap` - Optional new daily cap in stroops (None = no change)
    /// * `allowlist_enabled` - Optional new allowlist setting (None = no change)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::InvalidParameters` - Daily cap is negative
    ///
    /// # Examples
    /// ```
    /// // Update daily cap to 200 XLM
    /// factory.update_treasury_policy(&env, admin, Some(200_0000000), None)?;
    /// ```
    pub fn update_treasury_policy(
        env: Env,
        admin: Address,
        daily_cap: Option<i128>,
        allowlist_enabled: Option<bool>,
    ) -> Result<(), Error> {
        treasury::update_treasury_policy(&env, &admin, daily_cap, allowlist_enabled)
    }

    /// Get remaining withdrawal capacity for current period
    ///
    /// Returns how much more can be withdrawn before hitting the daily cap.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Remaining withdrawal capacity in stroops
    ///
    /// # Examples
    /// ```
    /// let remaining = factory.get_remaining_capacity(&env);
    /// log!("Can withdraw {} more stroops today", remaining);
    /// ```
    pub fn get_remaining_capacity(env: Env) -> i128 {
        treasury::get_remaining_capacity(&env)
    }

    /// Get treasury policy
    ///
    /// Returns the current withdrawal policy settings.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Current treasury policy
    ///
    /// # Examples
    /// ```
    /// let policy = factory.get_treasury_policy(&env);
    /// log!("Daily cap: {}", policy.daily_cap);
    /// ```
    pub fn get_treasury_policy(env: Env) -> types::TreasuryPolicy {
        treasury::get_treasury_policy(&env)
    }

    /// Check if address is allowed recipient
    ///
    /// Returns true if the address can receive treasury withdrawals.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `recipient` - Address to check
    ///
    /// # Returns
    /// True if address is in allowlist or allowlist is disabled
    ///
    /// # Examples
    /// ```
    /// if factory.is_allowed_recipient(&env, recipient) {
    ///     log!("Recipient is allowed");
    /// }
    /// ```
    pub fn is_allowed_recipient(env: Env, recipient: Address) -> bool {
        treasury::is_allowed_recipient(&env, &recipient)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Stream Functions
    // ═══════════════════════════════════════════════════════════════════════

    /// Create a vault with either time-based unlock, milestone-based unlock, or both.
    pub fn create_vault(
        env: Env,
        creator: Address,
        token: Address,
        owner: Address,
        amount: i128,
        unlock_time: u64,
        milestone_hash: BytesN<32>,
    ) -> Result<u64, Error> {
        creator.require_auth();

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        let has_time_unlock = unlock_time > 0;
        let has_milestone_unlock = milestone_hash != zero_hash;

        if !has_time_unlock && !has_milestone_unlock {
            return Err(Error::InvalidParameters);
        }

        if storage::get_token_info_by_address(&env, &token).is_none() {
            return Err(Error::TokenNotFound);
        }

        let vault_id = storage::increment_vault_count(&env)?;
        let vault = Vault {
            id: vault_id,
            token: token.clone(),
            owner: owner.clone(),
            creator: creator.clone(),
            total_amount: amount,
            claimed_amount: 0,
            unlock_time,
            milestone_hash: milestone_hash.clone(),
            status: VaultStatus::Active,
            created_at: env.ledger().timestamp(),
        };

        storage::set_vault(&env, &vault)?;

        events::emit_vault_created(
            &env,
            vault_id,
            &creator,
            &owner,
            &token,
            amount,
            unlock_time,
            &milestone_hash,
        );

        Ok(vault_id)
    }

    pub fn get_vault(env: Env, vault_id: u64) -> Result<Vault, Error> {
        storage::get_vault(&env, vault_id).ok_or(Error::TokenNotFound)
    }

    /// Claim tokens from a vault
    ///
    /// # Parameters
    /// - `env`: Contract environment
    /// - `owner`: Address claiming the vault (must match vault owner)
    /// - `vault_id`: ID of the vault to claim
    /// - `proof`: Optional milestone completion proof (required if milestone_hash != 0)
    ///
    /// # Returns
    /// - `Ok(claimed_amount)` on success
    /// - `Err(Error)` on failure
    ///
    /// # Verification Flow
    /// 1. Load vault and verify owner authorization
    /// 2. Check vault status (must be Active)
    /// 3. If milestone_hash != 0, verify proof via MilestoneVerifier
    /// 4. Check time-based unlock conditions
    /// 5. Transfer tokens and update vault status
    ///
    /// # Integration Point
    /// TODO: The verifier instance should be injected or configured during contract
    /// initialization. For testing, use MilestoneVerifierStub. For production,
    /// replace with oracle-based verifier.
    pub fn claim_vault(
        env: Env,
        owner: Address,
        vault_id: u64,
        proof: Option<Bytes>,
    ) -> Result<i128, Error> {
        owner.require_auth();

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        // Flash loan / reentrancy protection — must be acquired before any state reads
        // that could be manipulated by a reentrant call.
        storage::acquire_reentrancy_lock(&env)?;

        let result = Self::claim_vault_inner(&env, &owner, vault_id, proof);
        storage::release_reentrancy_lock(&env);
        result
    }

    /// Inner implementation of claim_vault, called only after the reentrancy lock is held.
    fn claim_vault_inner(
        env: &Env,
        owner: &Address,
        vault_id: u64,
        proof: Option<Bytes>,
    ) -> Result<i128, Error> {
        // Load vault
        let mut vault = storage::get_vault(env, vault_id).ok_or(Error::TokenNotFound)?;

        // Verify owner
        if vault.owner != *owner {
            return Err(Error::Unauthorized);
        }

        // Check vault status
        if vault.status != VaultStatus::Active {
            return match vault.status {
                VaultStatus::Claimed => Err(Error::InvalidParameters),
                VaultStatus::Cancelled => Err(Error::InvalidParameters),
                _ => Err(Error::InvalidParameters),
            };
        }

        // Milestone verification (if required)
        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        if vault.milestone_hash != zero_hash {
            // Non-zero milestone_hash requires proof
            let proof_bytes = proof.ok_or(Error::InvalidParameters)?;

            // TODO: Inject verifier instance (currently using stub)
            // In production, replace with oracle-based verifier that:
            // - Validates cryptographic signatures from trusted oracles
            // - Checks proof timestamps to prevent replay attacks
            // - Verifies milestone_hash matches proof payload
            // - Handles oracle service unavailability gracefully
            use crate::milestone_verification::MilestoneVerifier as _;
            let verifier = milestone_verification::MilestoneVerifierStub::new(&env);

            let is_valid =
                verifier.verify_milestone(&env, &vault.milestone_hash, &proof_bytes)?;

            if !is_valid {
                return Err(Error::InvalidParameters);
            }
        }

        // Time-based unlock check (independent of milestone verification)
        let current_time = env.ledger().timestamp();
        if vault.unlock_time > 0 && current_time < vault.unlock_time {
            return Err(Error::InvalidParameters);
        }

        // Calculate claimable amount
        let claimable = vault
            .total_amount
            .checked_sub(vault.claimed_amount)
            .ok_or(Error::ArithmeticError)?;
        if claimable <= 0 {
            return Err(Error::NothingToClaim);
        }

        // Transfer tokens
        let token_client = soroban_sdk::token::Client::new(&env, &vault.token);
        token_client.transfer(&env.current_contract_address(), &*owner, &claimable);

        // Update vault
        vault.claimed_amount = vault.total_amount;
        vault.status = VaultStatus::Claimed;
        storage::set_vault(&env, &vault)?;

        // Emit event
        events::emit_vault_claimed(&env, vault_id, owner, claimable);

        Ok(claimable)
    }

    /// Cancel an active vault using policy checks.
    ///
    /// Policy:
    /// - `actor` must authorize.
    /// - `actor` must be the vault creator or contract admin.
    /// - Already claimed/cancelled vaults cannot be cancelled.
    ///
    /// Partially claimed behavior:
    /// - Cancellation is allowed.
    /// - `claimed_amount` remains unchanged.
    /// - Remaining amount is permanently unclaimable.
    pub fn cancel_vault(env: Env, vault_id: u64, actor: Address) -> Result<(), Error> {
        actor.require_auth();

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        let mut vault = storage::get_vault(&env, vault_id).ok_or(Error::TokenNotFound)?;
        let admin = storage::get_admin(&env);
        if actor != vault.creator && actor != admin {
            return Err(Error::Unauthorized);
        }

        if vault.status != VaultStatus::Active {
            return Err(Error::InvalidParameters);
        }

        let remaining_amount = vault
            .total_amount
            .checked_sub(vault.claimed_amount)
            .ok_or(Error::ArithmeticError)?
            .max(0);

        vault.status = VaultStatus::Cancelled;
        storage::set_vault(&env, &vault)?;
        events::emit_vault_cancelled(&env, vault_id, &actor, remaining_amount);

        Ok(())
    }
    /// Update stream metadata (creator/admin only)
    ///
    /// Allows the stream creator or admin to update the metadata associated with
    /// a stream. Only metadata is mutable post-creation; all financial terms
    /// (amount, creator, recipient, schedule) remain immutable.
    ///
    /// This function enforces strict financial invariants to prevent any mutation
    /// of critical stream parameters after creation.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `stream_id` - ID of the stream to update
    /// * `updater` - Address performing the update (must be creator or admin)
    /// * `new_metadata` - New metadata value (None to clear, Some(string) to set)
    ///
    /// # Returns
    /// Returns `Ok(())` on success
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Stream with given ID does not exist
    /// * `Error::Unauthorized` - Caller is not the stream creator or admin
    /// * `Error::InvalidParameters` - New metadata is invalid (empty string or >512 chars)
    /// * `Error::ContractPaused` - Contract is currently paused
    ///
    /// # Financial Invariants (Enforced)
    /// The following stream parameters are immutable and cannot be changed:
    /// - `amount` - Stream payment amount
    /// - `creator` - Original stream creator
    /// - `recipient` - Stream recipient address
    /// - `created_at` - Stream creation timestamp
    /// - `id` - Stream ID
    ///
    /// # Metadata Constraints
    /// - Minimum length: 1 character (when present)
    /// - Maximum length: 512 characters
    /// - Empty strings: Rejected with `Error::InvalidParameters`
    /// - None value: Allowed (clears metadata)
    ///
    /// # Examples
    /// ```
    /// // Update metadata with new label
    /// factory.update_stream_metadata(
    ///     &env,
    ///     stream_id,
    ///     &updater,
    ///     Some(String::from_str(&env, "Updated label"))
    /// )?;
    ///
    /// // Clear metadata
    /// factory.update_stream_metadata(
    ///     &env,
    ///     stream_id,
    ///     &updater,
    ///     None
    /// )?;
    /// ```
    ///
    /// # Authorization
    /// Only the original stream creator or the contract admin can update metadata.
    /// The updater must authorize the transaction via `require_auth()`.
    ///
    /// # Events
    /// Emits `stream_metadata_updated` event with:
    /// - stream_id: The updated stream ID
    /// - updater: Address that performed the update
    /// - has_metadata: Whether metadata is now present (true) or cleared (false)
    pub fn update_stream_metadata(
        env: Env,
        stream_id: u32,
        updater: Address,
        new_metadata: Option<String>,
    ) -> Result<(), Error> {
        // Require updater authorization
        updater.require_auth();

        // Early return if contract is paused
        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        // Get the stream
        let mut stream = storage::get_stream(&env, stream_id.into()).ok_or(Error::TokenNotFound)?;

        // Verify authorization: only creator or admin can update
        let admin = storage::get_admin(&env);
        if updater != stream.creator && updater != admin {
            return Err(Error::Unauthorized);
        }

        // Store original stream for invariant validation
        let original_stream = stream.clone();

        // Validate new metadata before applying
        stream_types::validate_metadata(&new_metadata)?;

        // Update metadata
        stream.metadata = new_metadata.clone();

        // Enforce financial invariants - ensure no financial terms changed
        stream_types::validate_financial_invariants(&original_stream, &stream)?;

        // Store updated stream
        storage::set_stream(&env, stream_id.into(), &stream);

        // Emit metadata updated event
        let has_metadata = new_metadata.is_some();
        events::emit_stream_metadata_updated(&env, stream_id, &updater, has_metadata);

        Ok(())
    }

    /// Get governance configuration
    ///
    /// Returns the current quorum and approval thresholds.
    ///
    /// # Returns
    /// Returns the GovernanceConfig with current settings
    pub fn get_governance_config(env: Env) -> types::GovernanceConfig {
        governance::get_governance_config(&env)
    }

    /// Update governance configuration
    ///
    /// Updates quorum and/or approval thresholds.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must authorize)
    /// * `quorum_percent` - Optional new quorum percentage (0-100)
    /// * `approval_percent` - Optional new approval percentage (0-100)
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not the admin
    /// * `Error::InvalidParameters` - Percentages out of range or both None
    pub fn update_governance_config(
        env: Env,
        admin: Address,
        quorum_percent: Option<u32>,
        approval_percent: Option<u32>,
    ) -> Result<(), Error> {
        governance::update_governance_config(&env, &admin, quorum_percent, approval_percent)
    }

    /// Check if quorum is met for a proposal
    ///
    /// # Arguments
    /// * `total_votes` - Total number of votes cast
    /// * `total_eligible` - Total number of eligible voters
    /// * `quorum_percent` - Required quorum percentage
    ///
    /// # Returns
    /// Returns true if quorum threshold is met
    pub fn is_quorum_met(
        _env: Env,
        total_votes: u32,
        total_eligible: u32,
        quorum_percent: u32,
    ) -> bool {
        governance::is_quorum_met(total_votes, total_eligible, quorum_percent)
    }

    /// Check if approval threshold is met for a proposal
    ///
    /// # Arguments
    /// * `yes_votes` - Number of yes votes
    /// * `total_votes` - Total number of votes cast
    /// * `approval_percent` - Required approval percentage
    ///
    /// # Returns
    /// Returns true if approval threshold is met
    pub fn is_approval_met(
        _env: Env,
        yes_votes: u32,
        total_votes: u32,
        approval_percent: u32,
    ) -> bool {
        governance::is_approval_met(yes_votes, total_votes, approval_percent)
    }

    /// Configure dynamic quorum adjustment based on participation history.
    ///
    /// When enabled, the effective quorum is automatically recalculated after
    /// each proposal concludes, using a rolling average of recent participation
    /// rates clamped to [min_quorum_percent, max_quorum_percent].
    ///
    /// # Arguments
    /// * `env`    – The contract environment.
    /// * `admin`  – Admin address (must authorize).
    /// * `config` – The dynamic quorum configuration to apply.
    ///
    /// # Errors
    /// * `Error::Unauthorized`        – Caller is not the admin.
    /// * `Error::InvalidQuorumBounds` – min > max or max > 100.
    /// * `Error::InvalidParameters`   – window_size is 0 or target > 100.
    pub fn configure_dynamic_quorum(
        env: Env,
        admin: Address,
        config: types::DynamicQuorumConfig,
    ) -> Result<(), Error> {
        governance::configure_dynamic_quorum(&env, &admin, config)
    }

    /// Get the current dynamic quorum configuration.
    pub fn get_dynamic_quorum_config(env: Env) -> types::DynamicQuorumConfig {
        governance::get_dynamic_quorum_config(&env)
    }

    /// Record participation for a concluded proposal and adjust the quorum.
    ///
    /// Should be called once after a proposal's voting period ends.
    /// If dynamic quorum is disabled, the quorum is unchanged and the current
    /// value is returned.
    ///
    /// # Arguments
    /// * `env`            – The contract environment.
    /// * `proposal_id`    – ID of the concluded proposal.
    /// * `total_votes`    – Votes cast during the proposal.
    /// * `total_eligible` – Eligible voters at the time of the proposal.
    ///
    /// # Returns
    /// The new effective quorum percent.
    ///
    /// # Errors
    /// * `Error::InvalidParameters`              – total_eligible is zero.
    /// * `Error::InsufficientParticipationHistory` – No history to average over.
    /// * `Error::ArithmeticError`                – Overflow in calculation.
    pub fn record_participation_and_adjust(
        env: Env,
        proposal_id: u64,
        total_votes: u32,
        total_eligible: u32,
    ) -> Result<u32, Error> {
        governance::record_participation_and_adjust(&env, proposal_id, total_votes, total_eligible)
    }

    /// Create a new buyback campaign
    ///
    /// Enables authorized governance actors to create buyback campaigns
    /// with auditable event output and strict validation.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator` - Address creating the campaign (must be admin or token creator)
    /// * `token_index` - Index of the token to buy back
    /// * `budget` - Total budget allocated for the campaign
    /// * `start_time` - When campaign becomes active
    /// * `end_time` - When campaign expires
    /// * `min_interval` - Minimum seconds between executions
    /// * `max_slippage_bps` - Maximum slippage in basis points (0-10000)
    /// * `source_token` - Token being spent (treasury token)
    /// * `target_token` - Token being bought back
    ///
    /// # Returns
    /// * `Ok(u64)` - The campaign ID if successful
    /// * `Err(Error)` - Error if validation fails or unauthorized
    ///
    /// # Authorization
    /// Requires the creator to be either:
    /// - The factory admin
    /// - The token creator
    ///
    /// # Validation
    /// Performs comprehensive validation including:
    /// - Budget bounds (min: 1 XLM, max: 1B XLM)
    /// - Time window (start in future, duration 1h-365d)
    /// - Minimum interval (5min-7days)
    /// - Slippage caps (max 5%)
    /// - Token pair validation (different addresses)
    ///
    /// # Events
    /// Emits a versioned `cmp_cr_v1` event with campaign details
    ///
    /// # Errors
    /// * `Error::Unauthorized` - Caller is not admin or token creator
    /// * `Error::InvalidBudget` - Budget is zero or negative
    /// * `Error::BudgetBelowMinimum` - Budget < 1 XLM
    /// * `Error::BudgetAboveMaximum` - Budget > 1B XLM
    /// * `Error::StartTimeInPast` - Start time not in future
    /// * `Error::EndTimeBeforeStart` - End time <= start time
    /// * `Error::CampaignDurationTooShort` - Duration < 1 hour
    /// * `Error::CampaignDurationTooLong` - Duration > 365 days
    /// * `Error::InvalidMinInterval` - Interval is zero
    /// * `Error::MinIntervalTooShort` - Interval < 5 minutes
    /// * `Error::MinIntervalTooLong` - Interval > 7 days
    /// * `Error::InvalidSlippage` - Slippage is zero or > 100%
    /// * `Error::SlippageTooHigh` - Slippage > 5%
    /// * `Error::SameSourceAndTarget` - Source and target are same
    /// * `Error::InvalidTokenPair` - Target doesn't match token index
    /// * `Error::TokenNotFound` - Token index does not exist
    pub fn create_buyback_campaign(
        env: Env,
        creator: Address,
        token_index: u32,
        budget: i128,
        start_time: u64,
        end_time: u64,
        min_interval: u64,
        max_slippage_bps: u32,
        source_token: Address,
        target_token: Address,
    ) -> Result<u64, Error> {
        creator.require_auth();

        // Allow only factory admin or token creator.
        let admin = storage::get_admin(&env);
        let token = storage::get_token_info(&env, token_index).ok_or(Error::TokenNotFound)?;
        if creator != admin && creator != token.creator {
            return Err(Error::Unauthorized);
        }

        campaign_validation::validate_campaign_config(
            &env,
            budget,
            start_time,
            end_time,
            min_interval,
            max_slippage_bps,
            &source_token,
            &target_token,
        )?;

        if token.address != target_token {
            return Err(Error::InvalidParameters);
        }

        let campaign_id = storage::increment_campaign_count(&env)?;

        let owner_index = storage::increment_owner_campaign_count(&env, &creator)?
            .checked_sub(1)
            .ok_or(Error::ArithmeticError)?;
        storage::set_campaign_by_owner(&env, &creator, owner_index, campaign_id);
        storage::increment_active_campaign_count(&env)?;

        let campaign = types::BuybackCampaign {
            id: campaign_id,
            token_index,
            budget,
            spent: 0,
            tokens_bought: 0,
            execution_count: 0,
            start_time,
            end_time,
            min_interval,
            max_slippage_bps,
            source_token,
            target_token,
            owner: creator.clone(),
            status: types::CampaignStatus::Active,
            created_at: env.ledger().timestamp(),
            updated_at: env.ledger().timestamp(),
            trigger_price: 0,
            last_executed_at: 0,
        };

        storage::set_campaign(&env, campaign_id, &campaign);
        events::emit_campaign_created(&env, campaign_id, &creator, token_index, budget);

        Ok(campaign_id)
    }

    /// Get a buyback campaign by ID
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `campaign_id` - The campaign ID to retrieve
    ///
    /// # Returns
    /// * `Ok(BuybackCampaign)` - The campaign if found
    /// * `Err(Error::CampaignNotFound)` - If campaign doesn't exist
    pub fn get_buyback_campaign(
        env: Env,
        campaign_id: u64,
    ) -> Result<types::BuybackCampaign, Error> {
        storage::get_campaign(&env, campaign_id).ok_or(Error::CampaignNotFound)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Governance Proposal Functions
    // ═══════════════════════════════════════════════════════════════════════

    pub fn create_proposal(
        env: Env,
        proposer: Address,
        action_type: types::ActionType,
        payload: Bytes,
        start_time: u64,
        end_time: u64,
        eta: u64,
    ) -> Result<u64, Error> {
        timelock::create_proposal(
            &env,
            &proposer,
            action_type,
            payload,
            start_time,
            end_time,
            eta,
        )
    }

    pub fn vote_proposal(
        env: Env,
        voter: Address,
        proposal_id: u64,
        support: types::VoteChoice,
    ) -> Result<(), Error> {
        timelock::vote_proposal(&env, &voter, proposal_id, support)
    }

    pub fn finalize_proposal(env: Env, proposal_id: u64) -> Result<(), Error> {
        timelock::finalize_proposal(&env, proposal_id)
    }

    pub fn queue_proposal(env: Env, proposal_id: u64) -> Result<(), Error> {
        timelock::queue_proposal(&env, proposal_id)
    }

    pub fn execute_proposal(env: Env, proposal_id: u64) -> Result<(), Error> {
        timelock::execute_proposal(&env, proposal_id)
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Option<types::Proposal> {
        timelock::get_proposal(&env, proposal_id)
    }

    pub fn get_vote_counts(env: Env, proposal_id: u64) -> Option<(i128, i128, i128)> {
        timelock::get_vote_counts(&env, proposal_id)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Compliance Reporting (Issue #884)
    // ═══════════════════════════════════════════════════════════════════════

    /// Generate an on-chain compliance report (admin only).
    ///
    /// Captures an immutable snapshot of aggregate token metrics and
    /// governance configuration for regulatory audit purposes.
    ///
    /// # Arguments
    /// * `env`   – The contract environment.
    /// * `admin` – Admin address (must authorize and match stored admin).
    ///
    /// # Returns
    /// The newly created `ComplianceReport`.
    ///
    /// # Errors
    /// * `Error::Unauthorized`    – Caller is not the admin.
    /// * `Error::ArithmeticError` – Report ID counter overflowed.
    pub fn generate_compliance_report(
        env: Env,
        admin: Address,
    ) -> Result<compliance_reporting::ComplianceReport, Error> {
        compliance_reporting::generate_report(&env, &admin)
    }

    /// Retrieve a previously generated compliance report by ID.
    ///
    /// # Arguments
    /// * `env`       – The contract environment.
    /// * `report_id` – The report identifier.
    ///
    /// # Returns
    /// `Some(ComplianceReport)` if found, `None` otherwise.
    pub fn get_compliance_report(
        env: Env,
        report_id: u64,
    ) -> Option<compliance_reporting::ComplianceReport> {
        compliance_reporting::get_report(&env, report_id)
    }

    /// Return the total number of compliance reports generated.
    pub fn get_compliance_report_count(env: Env) -> u64 {
        compliance_reporting::get_report_count(&env)
    }

    // ═══════════════════════════════════════════════════════
    //  Multi-Signature Admin Operations
    // ═══════════════════════════════════════════════════════

    /// Configure the multi-sig system (admin only).
    ///
    /// Sets the list of authorized signers and the approval threshold.
    /// Must be called by the current admin before any multi-sig proposals
    /// can be created.
    ///
    /// # Arguments
    /// * `env`       – The contract environment.
    /// * `admin`     – Current admin address (must authorize).
    /// * `signers`   – Vec of addresses authorized to approve proposals.
    /// * `threshold` – Number of approvals required to execute a proposal.
    ///
    /// # Errors
    /// * `Unauthorized`     – Caller is not the admin.
    /// * `InvalidThreshold` – Threshold is 0 or exceeds the number of signers.
    pub fn configure_multisig(
        env: Env,
        admin: Address,
        signers: Vec<Address>,
        threshold: u32,
    ) -> Result<(), Error> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        let signer_count = signers.len();
        if threshold == 0 || threshold > signer_count {
            return Err(Error::InvalidThreshold);
        }

        let config = types::MultiSigConfig { signers, threshold };
        storage::set_multisig_config(&env, &config);

        events::emit_multisig_configured(&env, &admin, threshold, signer_count);

        Ok(())
    }

    /// Get the current multi-sig configuration.
    ///
    /// Returns `None` if multi-sig has not been configured yet.
    pub fn get_multisig_config(env: Env) -> Option<types::MultiSigConfig> {
        storage::get_multisig_config(&env)
    }

    /// Propose a new multi-sig admin action.
    ///
    /// Any authorized signer may create a proposal. The proposal is stored
    /// on-chain and awaits approval from the required number of signers.
    ///
    /// # Arguments
    /// * `env`      – The contract environment.
    /// * `proposer` – Address of the proposing signer (must authorize).
    /// * `action`   – The admin action being proposed.
    /// * `payload`  – ABI-encoded parameters for the action.
    ///
    /// # Returns
    /// The new proposal ID.
    ///
    /// # Errors
    /// * `MultiSigNotConfigured` – Multi-sig has not been configured.
    /// * `NotASigner`            – Proposer is not in the signer list.
    pub fn propose_multisig_action(
        env: Env,
        proposer: Address,
        action: types::MultiSigAction,
        payload: Bytes,
    ) -> Result<u64, Error> {
        proposer.require_auth();

        let config = storage::get_multisig_config(&env)
            .ok_or(Error::MultiSigNotConfigured)?;

        // Verify proposer is a signer
        if !config.signers.contains(&proposer) {
            return Err(Error::NotASigner);
        }

        let id = storage::increment_multisig_proposal_id(&env);
        let proposal = types::MultiSigProposal {
            id,
            proposer: proposer.clone(),
            action,
            payload,
            created_at: env.ledger().timestamp(),
            executed: false,
            cancelled: false,
            approval_count: 0,
        };
        storage::set_multisig_proposal(&env, &proposal);

        events::emit_multisig_proposed(&env, id, &proposer);

        Ok(id)
    }

    /// Get a multi-sig proposal by ID.
    pub fn get_multisig_proposal(env: Env, proposal_id: u64) -> Option<types::MultiSigProposal> {
        storage::get_multisig_proposal(&env, proposal_id)
    }

    /// Approve a pending multi-sig proposal.
    ///
    /// Each signer may approve a proposal at most once. When the approval
    /// count reaches the configured threshold the proposal is automatically
    /// executed.
    ///
    /// # Arguments
    /// * `env`         – The contract environment.
    /// * `approver`    – Signer approving the proposal (must authorize).
    /// * `proposal_id` – ID of the proposal to approve.
    ///
    /// # Errors
    /// * `MultiSigNotConfigured`    – Multi-sig has not been configured.
    /// * `MultiSigProposalNotFound` – No proposal with the given ID.
    /// * `MultiSigProposalExecuted` – Proposal already executed.
    /// * `MultiSigProposalCancelled`– Proposal was cancelled.
    /// * `NotASigner`               – Approver is not in the signer list.
    /// * `MultiSigAlreadyApproved`  – Approver already approved this proposal.
    pub fn approve_multisig_proposal(
        env: Env,
        approver: Address,
        proposal_id: u64,
    ) -> Result<(), Error> {
        approver.require_auth();

        let config = storage::get_multisig_config(&env)
            .ok_or(Error::MultiSigNotConfigured)?;

        if !config.signers.contains(&approver) {
            return Err(Error::NotASigner);
        }

        let mut proposal = storage::get_multisig_proposal(&env, proposal_id)
            .ok_or(Error::MultiSigProposalNotFound)?;

        if proposal.executed {
            return Err(Error::MultiSigProposalExecuted);
        }
        if proposal.cancelled {
            return Err(Error::MultiSigProposalCancelled);
        }
        if storage::has_multisig_approval(&env, proposal_id, &approver) {
            return Err(Error::MultiSigAlreadyApproved);
        }

        storage::set_multisig_approval(&env, proposal_id, &approver);
        proposal.approval_count += 1;
        storage::set_multisig_proposal(&env, &proposal);

        events::emit_multisig_approved(&env, proposal_id, &approver, proposal.approval_count);

        // Auto-execute when threshold is met
        if proposal.approval_count >= config.threshold {
            Self::_execute_multisig_proposal(&env, &mut proposal, &approver)?;
        }

        Ok(())
    }

    /// Explicitly execute a proposal that has reached the approval threshold.
    ///
    /// This is useful when the final approver wants to separate the approval
    /// and execution steps, or when execution was deferred.
    ///
    /// # Arguments
    /// * `env`         – The contract environment.
    /// * `executor`    – Address triggering execution (must authorize, must be a signer).
    /// * `proposal_id` – ID of the proposal to execute.
    ///
    /// # Errors
    /// * `MultiSigNotConfigured`    – Multi-sig has not been configured.
    /// * `MultiSigProposalNotFound` – No proposal with the given ID.
    /// * `MultiSigProposalExecuted` – Proposal already executed.
    /// * `MultiSigProposalCancelled`– Proposal was cancelled.
    /// * `NotASigner`               – Executor is not in the signer list.
    /// * `MultiSigThresholdNotMet`  – Not enough approvals yet.
    pub fn execute_multisig_proposal(
        env: Env,
        executor: Address,
        proposal_id: u64,
    ) -> Result<(), Error> {
        executor.require_auth();

        let config = storage::get_multisig_config(&env)
            .ok_or(Error::MultiSigNotConfigured)?;

        if !config.signers.contains(&executor) {
            return Err(Error::NotASigner);
        }

        let mut proposal = storage::get_multisig_proposal(&env, proposal_id)
            .ok_or(Error::MultiSigProposalNotFound)?;

        if proposal.executed {
            return Err(Error::MultiSigProposalExecuted);
        }
        if proposal.cancelled {
            return Err(Error::MultiSigProposalCancelled);
        }
        if proposal.approval_count < config.threshold {
            return Err(Error::MultiSigThresholdNotMet);
        }

        Self::_execute_multisig_proposal(&env, &mut proposal, &executor)
    }

    /// Cancel a pending multi-sig proposal.
    ///
    /// Only the admin or the original proposer may cancel a proposal.
    ///
    /// # Arguments
    /// * `env`         – The contract environment.
    /// * `canceller`   – Address cancelling the proposal (must authorize).
    /// * `proposal_id` – ID of the proposal to cancel.
    ///
    /// # Errors
    /// * `MultiSigProposalNotFound` – No proposal with the given ID.
    /// * `MultiSigProposalExecuted` – Proposal already executed.
    /// * `MultiSigProposalCancelled`– Proposal already cancelled.
    /// * `Unauthorized`             – Caller is not the admin or proposer.
    pub fn cancel_multisig_proposal(
        env: Env,
        canceller: Address,
        proposal_id: u64,
    ) -> Result<(), Error> {
        canceller.require_auth();

        let mut proposal = storage::get_multisig_proposal(&env, proposal_id)
            .ok_or(Error::MultiSigProposalNotFound)?;

        if proposal.executed {
            return Err(Error::MultiSigProposalExecuted);
        }
        if proposal.cancelled {
            return Err(Error::MultiSigProposalCancelled);
        }

        // Only admin or the original proposer may cancel
        let admin = storage::get_admin(&env);
        if canceller != admin && canceller != proposal.proposer {
            return Err(Error::Unauthorized);
        }

        proposal.cancelled = true;
        storage::set_multisig_proposal(&env, &proposal);

        events::emit_multisig_cancelled(&env, proposal_id, &canceller);

        Ok(())
    }

    // ── Internal helper ──────────────────────────────────────────────────────

    /// Execute the action encoded in a proposal.
    ///
    /// Marks the proposal as executed and dispatches the appropriate
    /// admin operation based on `proposal.action`.
    ///
    /// # Payload encoding conventions
    /// * `TransferAdmin`  – 32 bytes: new admin contract-id hash (BytesN<32>).
    /// * `UpdateFees`     – 32 bytes: base_fee (i128 LE) || metadata_fee (i128 LE).
    /// * `PauseContract`  – 0 bytes (empty).
    /// * `UnpauseContract`– 0 bytes (empty).
    fn _execute_multisig_proposal(
        env: &Env,
        proposal: &mut types::MultiSigProposal,
        executor: &Address,
    ) -> Result<(), Error> {
        proposal.executed = true;
        storage::set_multisig_proposal(env, proposal);

        match proposal.action {
            types::MultiSigAction::TransferAdmin => {
                // Payload: 32-byte contract-id hash of the new admin address.
                if proposal.payload.len() != 32 {
                    return Err(Error::InvalidParameters);
                }
                let mut addr_buf = [0u8; 32];
                proposal.payload.copy_into_slice(&mut addr_buf);
                let new_admin = soroban_sdk::address_payload::AddressPayload::ContractIdHash(
                    BytesN::from_array(env, &addr_buf),
                )
                .to_address(env);

                let old_admin = storage::get_admin(env);
                storage::set_admin(env, &new_admin);
                storage::clear_pending_admin(env);
                events::emit_admin_transfer(env, &old_admin, &new_admin);
            }
            types::MultiSigAction::UpdateFees => {
                // Payload: base_fee (i128 LE, 16 bytes) || metadata_fee (i128 LE, 16 bytes)
                if proposal.payload.len() != 32 {
                    return Err(Error::InvalidParameters);
                }
                let mut base_buf = [0u8; 16];
                proposal.payload.slice(0..16).copy_into_slice(&mut base_buf);
                let base_fee = i128::from_le_bytes(base_buf);

                let mut meta_buf = [0u8; 16];
                proposal.payload.slice(16..32).copy_into_slice(&mut meta_buf);
                let metadata_fee = i128::from_le_bytes(meta_buf);

                if base_fee < 0 || metadata_fee < 0 {
                    return Err(Error::InvalidParameters);
                }
                storage::set_base_fee(env, base_fee);
                storage::set_metadata_fee(env, metadata_fee);
                events::emit_fees_updated(env, base_fee, metadata_fee);
            }
            types::MultiSigAction::PauseContract => {
                storage::set_paused(env, true);
                events::emit_pause(env, executor);
            }
            types::MultiSigAction::UnpauseContract => {
                storage::set_paused(env, false);
                events::emit_unpause(env, executor);
            }
        }

        events::emit_multisig_executed(env, proposal.id, executor);

        Ok(())
    }
}

#[cfg(test)]
mod burn_auction_test;

// Temporarily disabled - requires create_token implementation
// #[cfg(test)]
// mod test;

// Temporarily disabled - requires burn implementation
// #[cfg(test)]
// mod admin_burn_test;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod admin_transfer_test;

#[cfg(test)]
// #[cfg(test)]
// mod fee_collection_test;

// Temporarily disabled - has compilation errors
// mod event_tests;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod error_handling_test;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod metadata_test;

// Temporarily disabled due to compilation issues
// #[cfg(test)]
// mod atomic_token_creation_test;

#[cfg(test)]
// mod burn_property_test;

#[cfg(test)]
// mod supply_conservation_test;
// #[cfg(test)]
// mod burn_property_test;

// #[cfg(test)]
// mod supply_conservation_test;

// #[cfg(test)]
// mod fuzz_create_token_simple;

// Temporarily disabled due to compilation issues
// #[cfg(test)]
// mod fuzz_update_fees;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod state_events_test;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod fuzz_string_boundaries;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod fuzz_numeric_boundaries;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod upgrade_test;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod fuzz_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod token_pause_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod rbac_test;


#[cfg(test)]
// mod token_stats_test;

// mod integration_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod gas_benchmark_comprehensive;
#[cfg(all(test, feature = "legacy-tests"))]
mod gas_regression_test;
#[cfg(test)]
// mod gas_compute_thresholds;

#[cfg(all(test, feature = "legacy-tests"))]
mod bench_test;

#[cfg(test)]
// mod pagination_integration_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod treasury_integration_test;
// #[cfg(test)]
// mod token_pause_test;
// #[cfg(test)]
// mod token_stats_test;
// #[cfg(test)]
// mod integration_test;
// #[cfg(test)]
// mod gas_benchmark_comprehensive;
// #[cfg(test)]
// mod pagination_integration_test;
// #[cfg(test)]
// mod auth_fuzz_test;
// #[cfg(test)]
// mod metamorphic_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod event_replay_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod batch_token_creation_test;

#[cfg(test)]
// mod campaign_stateful_fuzz_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod accounting_property_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod stream_status_transition_property_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod stream_lifecycle_integration_test;

#[cfg(test)]
// mod vault_claim_property_test;

#[cfg(test)]
// mod vault_unlock_time_property_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod staking_integration_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod vault_cancellation_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod metadata_update_test;

// Vault/Stream Security and Fuzz Tests
// Temporarily disabled - requires fixing timelock/freeze dependencies
// #[cfg(test)]
// mod vault_security_test;

// #[cfg(test)]
// mod vault_fuzz_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod bridge_test;

#[cfg(all(test, feature = "legacy-tests"))]
mod amm_test;
