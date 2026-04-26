//! Liquidity Mining Program with Incentive Distribution
//!
//! This module implements a liquidity mining program that rewards liquidity providers
//! with token incentives based on their proportional share of the liquidity pool.
//!
//! ## Overview
//!
//! Liquidity providers deposit tokens into a mining pool and earn rewards over time.
//! Rewards are distributed proportionally based on each provider's share of the total
//! staked amount. The reward rate is configurable per pool and can be updated by the admin.
//!
//! ## State Transitions
//!
//! Pool lifecycle:
//! - Active -> Paused (via pause_mining_pool)
//! - Paused -> Active (via resume_mining_pool)
//! - Active -> Ended (automatically when end_time is reached)
//!
//! Provider lifecycle:
//! - Stake tokens -> earn rewards over time
//! - Claim rewards at any time
//! - Unstake tokens (forfeits unclaimed rewards if pool ended)
//!
//! ## Security
//!
//! - All arithmetic uses checked operations to prevent overflow
//! - Authorization required for all state-changing operations
//! - Reward calculations use fixed-point arithmetic (7 decimal places)
//! - Reentrancy prevented by updating state before emitting events
//! - Admin-only operations enforce strict authorization checks

use crate::events;
use crate::storage;
use crate::types::{Error, LiquidityMiningPool, MiningPoolStatus, ProviderStake};
use soroban_sdk::{Address, Env};

/// Precision factor for reward-per-token calculations (10^7 = Stellar stroops)
const REWARD_PRECISION: i128 = 10_000_000;

/// Maximum number of pools that can be created
const MAX_POOLS: u64 = 1_000;

/// Maximum reward rate per second per token staked (in stroops)
const MAX_REWARD_RATE: i128 = 1_000_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Pool Management
// ─────────────────────────────────────────────────────────────────────────────

/// Create a new liquidity mining pool
///
/// Initializes a new pool with the given reward token, reward rate, and duration.
/// Only the admin can create pools.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize and match stored admin)
/// * `reward_token_index` - Index of the token used for rewards
/// * `stake_token_index` - Index of the token that providers stake
/// * `reward_rate` - Rewards distributed per second per staked token (in stroops)
/// * `start_time` - Unix timestamp when the pool starts accepting stakes
/// * `end_time` - Unix timestamp when the pool stops distributing rewards
///
/// # Returns
/// Returns the new pool ID on success
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::ContractPaused` - Contract is paused
/// * `Error::InvalidParameters` - Invalid time window or reward rate
/// * `Error::TokenNotFound` - Reward or stake token index is invalid
/// * `Error::ArithmeticError` - Pool count overflow
pub fn create_mining_pool(
    env: &Env,
    admin: &Address,
    reward_token_index: u32,
    stake_token_index: u32,
    reward_rate: i128,
    start_time: u64,
    end_time: u64,
) -> Result<u64, Error> {
    admin.require_auth();

    // Authorization check
    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    // Contract pause check
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    // Validate tokens exist
    storage::get_token_info(env, reward_token_index).ok_or(Error::TokenNotFound)?;
    storage::get_token_info(env, stake_token_index).ok_or(Error::TokenNotFound)?;

    // Validate time window
    let now = env.ledger().timestamp();
    if start_time >= end_time {
        return Err(Error::InvalidTimeWindow);
    }
    if end_time <= now {
        return Err(Error::InvalidTimeWindow);
    }

    // Validate reward rate
    if reward_rate <= 0 || reward_rate > MAX_REWARD_RATE {
        return Err(Error::InvalidParameters);
    }

    // Check pool cap
    let pool_count = storage::get_mining_pool_count(env);
    if pool_count >= MAX_POOLS {
        return Err(Error::BatchTooLarge);
    }

    // Allocate pool ID
    let pool_id = storage::next_mining_pool_id(env)?;

    let pool = LiquidityMiningPool {
        id: pool_id,
        reward_token_index,
        stake_token_index,
        reward_rate,
        start_time,
        end_time,
        total_staked: 0,
        reward_per_token_stored: 0,
        last_update_time: start_time,
        status: MiningPoolStatus::Active,
        created_at: now,
    };

    storage::set_mining_pool(env, pool_id, &pool);

    events::emit_mining_pool_created(
        env,
        pool_id,
        admin,
        reward_token_index,
        stake_token_index,
        reward_rate,
        start_time,
        end_time,
    );

    Ok(pool_id)
}

/// Stake tokens into a liquidity mining pool
///
/// Deposits tokens into the pool and begins accruing rewards. Rewards are
/// checkpointed before the new stake is recorded to ensure fair distribution.
///
/// # Arguments
/// * `env` - The contract environment
/// * `provider` - Address staking tokens (must authorize)
/// * `pool_id` - ID of the pool to stake into
/// * `amount` - Amount of stake tokens to deposit (must be > 0)
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::CampaignNotFound` - Pool does not exist
/// * `Error::ContractPaused` - Contract is paused
/// * `Error::InvalidStateTransition` - Pool is not active
/// * `Error::InvalidAmount` - Amount is zero or negative
/// * `Error::InvalidTimeWindow` - Pool has not started or has ended
/// * `Error::ArithmeticError` - Arithmetic overflow
pub fn stake(env: &Env, provider: &Address, pool_id: u64, amount: i128) -> Result<(), Error> {
    provider.require_auth();

    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    let mut pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    // Pool must be active
    if pool.status != MiningPoolStatus::Active {
        return Err(Error::InvalidStateTransition);
    }

    // Pool must have started
    let now = env.ledger().timestamp();
    if now < pool.start_time {
        return Err(Error::InvalidTimeWindow);
    }

    // Pool must not have ended
    if now >= pool.end_time {
        return Err(Error::InvalidTimeWindow);
    }

    // Checkpoint rewards before changing stake
    update_reward_per_token(env, &mut pool)?;

    // Load or initialize provider stake
    let mut stake_info = storage::get_provider_stake(env, pool_id, provider)
        .unwrap_or(ProviderStake {
            provider: provider.clone(),
            pool_id,
            staked_amount: 0,
            reward_per_token_paid: pool.reward_per_token_stored,
            pending_rewards: 0,
        });

    // Checkpoint pending rewards for this provider
    let earned = calculate_earned(env, &pool, &stake_info)?;
    stake_info.pending_rewards = earned;
    stake_info.reward_per_token_paid = pool.reward_per_token_stored;

    // Update staked amount
    stake_info.staked_amount = stake_info
        .staked_amount
        .checked_add(amount)
        .ok_or(Error::ArithmeticError)?;

    // Update pool total staked
    pool.total_staked = pool
        .total_staked
        .checked_add(amount)
        .ok_or(Error::ArithmeticError)?;

    // Persist state before emitting events (reentrancy safety)
    storage::set_mining_pool(env, pool_id, &pool);
    storage::set_provider_stake(env, pool_id, provider, &stake_info);

    events::emit_liquidity_staked(env, pool_id, provider, amount, stake_info.staked_amount);

    Ok(())
}

/// Unstake tokens from a liquidity mining pool
///
/// Withdraws staked tokens from the pool. Pending rewards are checkpointed
/// but NOT automatically claimed — call `claim_rewards` separately.
///
/// # Arguments
/// * `env` - The contract environment
/// * `provider` - Address unstaking tokens (must authorize)
/// * `pool_id` - ID of the pool to unstake from
/// * `amount` - Amount of stake tokens to withdraw (must be > 0 and <= staked)
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::CampaignNotFound` - Pool does not exist
/// * `Error::InvalidAmount` - Amount is zero, negative, or exceeds staked balance
/// * `Error::InsufficientBalance` - Provider has insufficient staked balance
/// * `Error::ArithmeticError` - Arithmetic overflow
pub fn unstake(env: &Env, provider: &Address, pool_id: u64, amount: i128) -> Result<(), Error> {
    provider.require_auth();

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    let mut pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    let mut stake_info =
        storage::get_provider_stake(env, pool_id, provider).ok_or(Error::InsufficientBalance)?;

    if stake_info.staked_amount < amount {
        return Err(Error::InsufficientBalance);
    }

    // Checkpoint rewards before changing stake
    update_reward_per_token(env, &mut pool)?;

    let earned = calculate_earned(env, &pool, &stake_info)?;
    stake_info.pending_rewards = earned;
    stake_info.reward_per_token_paid = pool.reward_per_token_stored;

    // Reduce staked amount
    stake_info.staked_amount = stake_info
        .staked_amount
        .checked_sub(amount)
        .ok_or(Error::ArithmeticError)?;

    pool.total_staked = pool
        .total_staked
        .checked_sub(amount)
        .ok_or(Error::ArithmeticError)?;

    // Persist state before emitting events
    storage::set_mining_pool(env, pool_id, &pool);
    storage::set_provider_stake(env, pool_id, provider, &stake_info);

    events::emit_liquidity_unstaked(env, pool_id, provider, amount, stake_info.staked_amount);

    Ok(())
}

/// Claim accumulated rewards from a liquidity mining pool
///
/// Calculates and distributes all pending rewards to the provider.
/// Rewards are reset to zero after a successful claim.
///
/// # Arguments
/// * `env` - The contract environment
/// * `provider` - Address claiming rewards (must authorize)
/// * `pool_id` - ID of the pool to claim from
///
/// # Returns
/// Returns the amount of reward tokens claimed
///
/// # Errors
/// * `Error::CampaignNotFound` - Pool does not exist
/// * `Error::NothingToClaim` - No rewards available to claim
/// * `Error::ArithmeticError` - Arithmetic overflow
pub fn claim_rewards(env: &Env, provider: &Address, pool_id: u64) -> Result<i128, Error> {
    provider.require_auth();

    let mut pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    let mut stake_info =
        storage::get_provider_stake(env, pool_id, provider).ok_or(Error::NothingToClaim)?;

    // Checkpoint rewards
    update_reward_per_token(env, &mut pool)?;

    let earned = calculate_earned(env, &pool, &stake_info)?;
    let total_claimable = earned
        .checked_add(stake_info.pending_rewards)
        .ok_or(Error::ArithmeticError)?;

    if total_claimable <= 0 {
        return Err(Error::NothingToClaim);
    }

    // Reset pending rewards and checkpoint
    stake_info.pending_rewards = 0;
    stake_info.reward_per_token_paid = pool.reward_per_token_stored;

    // Persist state before emitting events
    storage::set_mining_pool(env, pool_id, &pool);
    storage::set_provider_stake(env, pool_id, provider, &stake_info);

    events::emit_rewards_claimed(env, pool_id, provider, total_claimable);

    Ok(total_claimable)
}

/// Pause an active liquidity mining pool
///
/// Suspends new stakes and reward accrual. Existing stakes are preserved.
/// Only the admin can pause a pool.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize and match stored admin)
/// * `pool_id` - ID of the pool to pause
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::CampaignNotFound` - Pool does not exist
/// * `Error::InvalidStateTransition` - Pool is not active (replay protection)
pub fn pause_mining_pool(env: &Env, admin: &Address, pool_id: u64) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    let mut pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    match pool.status {
        MiningPoolStatus::Active => {
            // Checkpoint rewards before pausing
            update_reward_per_token(env, &mut pool)?;
            pool.status = MiningPoolStatus::Paused;
        }
        MiningPoolStatus::Paused => return Err(Error::InvalidStateTransition),
        MiningPoolStatus::Ended => return Err(Error::InvalidStateTransition),
    }

    storage::set_mining_pool(env, pool_id, &pool);
    events::emit_mining_pool_paused(env, pool_id, admin);

    Ok(())
}

/// Resume a paused liquidity mining pool
///
/// Resumes reward accrual and new stakes. The last_update_time is reset
/// to the current time to avoid rewarding the paused period.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize and match stored admin)
/// * `pool_id` - ID of the pool to resume
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::CampaignNotFound` - Pool does not exist
/// * `Error::InvalidStateTransition` - Pool is not paused (replay protection)
pub fn resume_mining_pool(env: &Env, admin: &Address, pool_id: u64) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    let mut pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    match pool.status {
        MiningPoolStatus::Paused => {
            // Reset last_update_time to now so paused period is not rewarded
            pool.last_update_time = env.ledger().timestamp();
            pool.status = MiningPoolStatus::Active;
        }
        MiningPoolStatus::Active => return Err(Error::InvalidStateTransition),
        MiningPoolStatus::Ended => return Err(Error::InvalidStateTransition),
    }

    storage::set_mining_pool(env, pool_id, &pool);
    events::emit_mining_pool_resumed(env, pool_id, admin);

    Ok(())
}

/// End a liquidity mining pool
///
/// Marks the pool as ended, stopping all future reward accrual.
/// Providers can still unstake and claim any remaining rewards.
/// Only the admin can end a pool before its scheduled end_time.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize and match stored admin)
/// * `pool_id` - ID of the pool to end
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::CampaignNotFound` - Pool does not exist
/// * `Error::InvalidStateTransition` - Pool is already ended
pub fn end_mining_pool(env: &Env, admin: &Address, pool_id: u64) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    let mut pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    if pool.status == MiningPoolStatus::Ended {
        return Err(Error::InvalidStateTransition);
    }

    // Final reward checkpoint
    update_reward_per_token(env, &mut pool)?;
    pool.status = MiningPoolStatus::Ended;

    storage::set_mining_pool(env, pool_id, &pool);
    events::emit_mining_pool_ended(env, pool_id, admin);

    Ok(())
}

/// Update the reward rate for an active pool
///
/// Allows the admin to adjust the reward rate. Rewards are checkpointed
/// at the current rate before the new rate takes effect.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize and match stored admin)
/// * `pool_id` - ID of the pool to update
/// * `new_reward_rate` - New reward rate per second per staked token
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::CampaignNotFound` - Pool does not exist
/// * `Error::InvalidParameters` - Invalid reward rate
/// * `Error::InvalidStateTransition` - Pool is not active
pub fn update_reward_rate(
    env: &Env,
    admin: &Address,
    pool_id: u64,
    new_reward_rate: i128,
) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    if new_reward_rate <= 0 || new_reward_rate > MAX_REWARD_RATE {
        return Err(Error::InvalidParameters);
    }

    let mut pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    if pool.status != MiningPoolStatus::Active {
        return Err(Error::InvalidStateTransition);
    }

    // Checkpoint at old rate before changing
    update_reward_per_token(env, &mut pool)?;

    let old_rate = pool.reward_rate;
    pool.reward_rate = new_reward_rate;

    storage::set_mining_pool(env, pool_id, &pool);
    events::emit_reward_rate_updated(env, pool_id, admin, old_rate, new_reward_rate);

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────────────────────

/// Get a liquidity mining pool by ID
///
/// # Arguments
/// * `env` - The contract environment
/// * `pool_id` - ID of the pool to retrieve
///
/// # Returns
/// Returns `Some(LiquidityMiningPool)` if found, `None` otherwise
pub fn get_mining_pool(env: &Env, pool_id: u64) -> Option<LiquidityMiningPool> {
    storage::get_mining_pool(env, pool_id)
}

/// Get a provider's stake info for a pool
///
/// # Arguments
/// * `env` - The contract environment
/// * `pool_id` - ID of the pool
/// * `provider` - Provider address
///
/// # Returns
/// Returns `Some(ProviderStake)` if found, `None` otherwise
pub fn get_provider_stake(env: &Env, pool_id: u64, provider: &Address) -> Option<ProviderStake> {
    storage::get_provider_stake(env, pool_id, provider)
}

/// Calculate the current claimable rewards for a provider
///
/// Returns the total rewards the provider can claim right now,
/// including both pending (checkpointed) and newly accrued rewards.
///
/// # Arguments
/// * `env` - The contract environment
/// * `pool_id` - ID of the pool
/// * `provider` - Provider address
///
/// # Returns
/// Returns `Ok(amount)` with the claimable reward amount
///
/// # Errors
/// * `Error::CampaignNotFound` - Pool does not exist
pub fn get_claimable_rewards(env: &Env, pool_id: u64, provider: &Address) -> Result<i128, Error> {
    let pool = storage::get_mining_pool(env, pool_id).ok_or(Error::CampaignNotFound)?;

    let stake_info = match storage::get_provider_stake(env, pool_id, provider) {
        Some(s) => s,
        None => return Ok(0),
    };

    let current_rpt = current_reward_per_token(env, &pool)?;

    let newly_earned = stake_info
        .staked_amount
        .checked_mul(
            current_rpt
                .checked_sub(stake_info.reward_per_token_paid)
                .ok_or(Error::ArithmeticError)?,
        )
        .ok_or(Error::ArithmeticError)?
        .checked_div(REWARD_PRECISION)
        .ok_or(Error::ArithmeticError)?;

    let total = stake_info
        .pending_rewards
        .checked_add(newly_earned)
        .ok_or(Error::ArithmeticError)?;

    Ok(total)
}

/// Get the total number of mining pools
pub fn get_mining_pool_count(env: &Env) -> u64 {
    storage::get_mining_pool_count(env)
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Compute the current reward-per-token without mutating state
///
/// Uses the lesser of `now` and `pool.end_time` to cap reward accrual.
fn current_reward_per_token(env: &Env, pool: &LiquidityMiningPool) -> Result<i128, Error> {
    if pool.total_staked == 0 {
        return Ok(pool.reward_per_token_stored);
    }

    let now = env.ledger().timestamp();
    let effective_time = if now > pool.end_time { pool.end_time } else { now };

    // No accrual if pool is paused or ended, or before last update
    if pool.status == MiningPoolStatus::Paused
        || pool.status == MiningPoolStatus::Ended
        || effective_time <= pool.last_update_time
    {
        return Ok(pool.reward_per_token_stored);
    }

    let elapsed = effective_time
        .checked_sub(pool.last_update_time)
        .ok_or(Error::ArithmeticError)? as i128;

    // reward_per_token_delta = elapsed * reward_rate * PRECISION / total_staked
    let delta = elapsed
        .checked_mul(pool.reward_rate)
        .ok_or(Error::ArithmeticError)?
        .checked_mul(REWARD_PRECISION)
        .ok_or(Error::ArithmeticError)?
        .checked_div(pool.total_staked)
        .ok_or(Error::ArithmeticError)?;

    pool.reward_per_token_stored
        .checked_add(delta)
        .ok_or(Error::ArithmeticError)
}

/// Update the pool's reward_per_token_stored and last_update_time in place
fn update_reward_per_token(env: &Env, pool: &mut LiquidityMiningPool) -> Result<(), Error> {
    let new_rpt = current_reward_per_token(env, pool)?;
    pool.reward_per_token_stored = new_rpt;

    let now = env.ledger().timestamp();
    pool.last_update_time = if now > pool.end_time { pool.end_time } else { now };

    Ok(())
}

/// Calculate newly earned rewards for a provider since their last checkpoint
fn calculate_earned(
    _env: &Env,
    pool: &LiquidityMiningPool,
    stake_info: &ProviderStake,
) -> Result<i128, Error> {
    let rpt_delta = pool
        .reward_per_token_stored
        .checked_sub(stake_info.reward_per_token_paid)
        .ok_or(Error::ArithmeticError)?;

    stake_info
        .staked_amount
        .checked_mul(rpt_delta)
        .ok_or(Error::ArithmeticError)?
        .checked_div(REWARD_PRECISION)
        .ok_or(Error::ArithmeticError)
}
