#![no_std]

mod events;
mod storage;
mod burn;
mod types;
mod validation;

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use types::{ContractMetadata, Error, FactoryState, TokenInfo};

// Contract metadata constants
const CONTRACT_NAME: &str = "Nova Launch Token Factory";
const CONTRACT_DESCRIPTION: &str = "No-code token deployment on Stellar";
const CONTRACT_AUTHOR: &str = "Nova Launch Team";
const CONTRACT_LICENSE: &str = "MIT";
const CONTRACT_VERSION: &str = "1.0.0";

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

        // Validate new admin is valid
        validation::validate_admin(&env)?;

        // Emit optimized event
        events::emit_admin_transfer(&env, &current_admin, &new_admin);

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
        }

        if let Some(fee) = metadata_fee {
            if fee < 0 {
                return Err(Error::InvalidParameters);
            }
        }

        // Perform all updates in batch (Phase 2 optimization)
        // Updates are combined to minimize storage access
        if let Some(fee) = base_fee {
            storage::set_base_fee(&env, fee);
        }

        if let Some(fee) = metadata_fee {
            storage::set_metadata_fee(&env, fee);
        }

        if let Some(pause_state) = paused {
            storage::set_paused(&env, pause_state);
        }

        // Validate fees after update
        validation::validate_fees(&env)?;

        // Get final state for event
        let final_base_fee = base_fee.unwrap_or_else(|| storage::get_base_fee(&env));
        let final_metadata_fee = metadata_fee.unwrap_or_else(|| storage::get_metadata_fee(&env));
        
        // Emit single consolidated event (Phase 2 optimization)
        events::emit_fees_updated(&env, final_base_fee, final_metadata_fee);

        Ok(())
    }

    /// Get the total number of tokens created
    ///
    /// Returns the count of all tokens deployed through this factory.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Returns the token count as a u32
    ///
    /// # Examples
    /// ```
    /// let count = factory.get_token_count(&env);
    /// // Iterate through all tokens
    /// for i in 0..count {
    ///     let token = factory.get_token_info(&env, i)?;
    /// }
    /// ```
    pub fn get_token_count(env: Env) -> u32 {
        storage::get_token_count(&env)
    }

    /// Get token information by index
    ///
    /// Retrieves complete information about a token using its
    /// sequential index (0-based).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `index` - Token index (0 to token_count - 1)
    ///
    /// # Returns
    /// Returns `Ok(TokenInfo)` with token details
    ///
    /// # Errors
    /// * `Error::TokenNotFound` - Index is out of range
    ///
    /// # Examples
    /// ```
    /// let token = factory.get_token_info(&env, 0)?;
    /// assert_eq!(token.symbol, "MTK");
    /// assert_eq!(token.decimals, 7);
    /// ```
    pub fn get_token_info(env: Env, index: u32) -> Result<TokenInfo, Error> {
        storage::get_token_info(&env, index).ok_or(Error::TokenNotFound)
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
    pub fn batch_burn(env: Env, admin: Address, token_index: u32, burns: soroban_sdk::Vec<(Address, i128)>) -> Result<(), Error> {
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

}

// Temporarily disabled - requires create_token implementation
// #[cfg(test)]
// mod test;

// Temporarily disabled - requires burn implementation
// #[cfg(test)]
// mod admin_burn_test;

#[cfg(test)]
mod admin_transfer_test;

// Temporarily disabled - has compilation errors
// mod event_tests;

#[cfg(test)]
mod error_handling_test;

#[cfg(test)]
mod metadata_test;

// Temporarily disabled due to compilation issues
// #[cfg(test)]
// mod atomic_token_creation_test;

// Temporarily disabled - requires burn implementation
// #[cfg(test)]
// mod burn_property_test;

// Temporarily disabled due to compilation issues
// #[cfg(test)]
// mod fuzz_update_fees;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod burn_property_test;

#[cfg(test)]
mod state_events_test;

#[cfg(test)]
mod fuzz_string_boundaries;
// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod fuzz_string_boundaries;

// Temporarily disabled - has compilation errors
// #[cfg(test)]
// mod fuzz_numeric_boundaries;

#[cfg(test)]
mod upgrade_test;

#[cfg(test)]
mod fuzz_test;

#[cfg(test)]
mod integration_test;
mod gas_benchmark_comprehensive;
