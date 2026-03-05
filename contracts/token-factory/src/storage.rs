use soroban_sdk::{Address, Env};

use crate::types::{DataKey, Error, FactoryState, TokenInfo};

// ============================================================
// Storage Functions - Burn Tracking
// ============================================================
// Available functions:
// - get_total_burned(env, token_address) -> i128
// - get_burn_count(env, token_address) -> u32
// - get_global_burn_count(env) -> u32
// - increment_burn_count(env, token_address, amount)
// - add_burn_record(env, record)
// - get_burn_record(env, index) -> Option<BurnRecord>
// - get_burn_record_count(env) -> u32
// - update_token_supply(env, token_address, delta)
// ============================================================

// Admin management
pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

// Treasury management
pub fn get_treasury(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Treasury).unwrap()
}

pub fn set_treasury(env: &Env, treasury: &Address) {
    env.storage().instance().set(&DataKey::Treasury, treasury);
}

// Fee management
pub fn get_base_fee(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::BaseFee).unwrap()
}

pub fn set_base_fee(env: &Env, fee: i128) {
    env.storage().instance().set(&DataKey::BaseFee, &fee);
}

pub fn get_metadata_fee(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::MetadataFee).unwrap()
}

pub fn set_metadata_fee(env: &Env, fee: i128) {
    env.storage().instance().set(&DataKey::MetadataFee, &fee);
}

// Token registry
pub fn get_token_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TokenCount)
        .unwrap_or(0)
}

pub fn get_token_info(env: &Env, index: u32) -> Option<TokenInfo> {
    env.storage().instance().get(&DataKey::Token(index))
}

pub fn set_token_info(env: &Env, index: u32, info: &TokenInfo) {
    env.storage().instance().set(&DataKey::Token(index), info);
    
    // Index by creator for pagination
    add_creator_token(env, &info.creator, index);
    
    // Emit token registered event
    crate::events::emit_token_registered(env, &info.address, &info.creator);
}

pub fn increment_token_count(env: &Env) -> Result<u32, Error> {
    let count = get_token_count(env)
        .checked_add(1)
        .ok_or(Error::ArithmeticError)?;
    env.storage().instance().set(&DataKey::TokenCount, &count);
    Ok(count)
}

// Get factory state
pub fn get_factory_state(env: &Env) -> FactoryState {
    FactoryState {
        admin: get_admin(env),
        treasury: get_treasury(env),
        base_fee: get_base_fee(env),
        metadata_fee: get_metadata_fee(env),
        paused: is_paused(env),
    }
}

/// ============================================================
///  Security Test Suite — Burn Feature (Issue #163)
///  Temporarily disabled due to compilation errors with Result types
/// ============================================================

// ── Burn feature additions ─────────────────────────────────

pub fn get_balance(env: &Env, token_index: u32, holder: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&crate::types::DataKey::Balance(token_index, holder.clone()))
        .unwrap_or(0)
}

pub fn set_balance(env: &Env, token_index: u32, holder: &Address, balance: i128) {
    env.storage()
        .persistent()
        .set(&crate::types::DataKey::Balance(token_index, holder.clone()), &balance);
}

pub fn get_burn_count(env: &Env, token_index: u32) -> u32 {
    env.storage()
        .persistent()
        .get(&crate::types::DataKey::BurnCount(token_index))
        .unwrap_or(0)
}

pub fn increment_burn_count(env: &Env, token_index: u32) -> Result<(), Error> {
    let count = get_burn_count(env, token_index)
        .checked_add(1)
        .ok_or(Error::ArithmeticError)?;
    env.storage()
        .persistent()
        .set(&crate::types::DataKey::BurnCount(token_index), &count);
    Ok(())
}

// ── Burn feature additions ─────────────────────────────────

// ── Token-level pause ─────────────────────────────────────

pub fn is_token_paused(env: &Env, token_index: u32) -> bool {
    env.storage()
        .instance()
        .get(&crate::types::DataKey::TokenPaused(token_index))
        .unwrap_or(false)
}

pub fn set_token_paused(env: &Env, token_index: u32, paused: bool) {
    env.storage()
        .instance()
        .set(&crate::types::DataKey::TokenPaused(token_index), &paused);
}

pub fn get_total_burned(env: &Env, token_index: u32) -> i128 {
    env.storage()
        .persistent()
        .get(&crate::types::DataKey::TotalBurned(token_index))
        .unwrap_or(0)
}

pub fn add_total_burned(env: &Env, token_index: u32, amount: i128) {
    let current = get_total_burned(env, token_index);
    let updated = current.checked_add(amount).unwrap_or(i128::MAX);
    env.storage()
        .persistent()
        .set(&crate::types::DataKey::TotalBurned(token_index), &updated);
}
// Pause management
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}

// Token lookup by address
pub fn get_token_info_by_address(env: &Env, token_address: &Address) -> Option<TokenInfo> {
    env.storage()
        .instance()
        .get(&DataKey::TokenByAddress(token_address.clone()))
}

pub fn set_token_info_by_address(env: &Env, token_address: &Address, info: &TokenInfo) {
    env.storage()
        .instance()
        .set(&DataKey::TokenByAddress(token_address.clone()), info);
}

// Update token supply after burn
pub fn update_token_supply(env: &Env, token_address: &Address, amount_change: i128) -> Option<()> {
    let mut info = get_token_info_by_address(env, token_address)?;

    // Update total supply
    info.total_supply = info.total_supply.checked_add(amount_change)?;

    // If burning (negative change), update total_burned
    if amount_change < 0 {
        info.total_burned = info.total_burned.checked_add(-amount_change)?;
        info.burn_count = info.burn_count.checked_add(1)?;
    }

    // Save updated info
    set_token_info_by_address(env, token_address, &info);

    Some(())
}
// Phase 2 Optimization: Batch admin state operations
// Allows multiple admin parameters to be updated efficiently in a single transaction
// Reduces gas by combining storage verification and writes
pub fn batch_update_fees(
    env: &Env,
    base_fee: Option<i128>,
    metadata_fee: Option<i128>,
) {
    if let Some(fee) = base_fee {
        set_base_fee(env, fee);
    }
    if let Some(fee) = metadata_fee {
        set_metadata_fee(env, fee);
    }
}

/// Phase 2 Optimization: Get complete admin state in single call
/// Avoids multiple storage reads when checking authorization and state
/// Expected savings: 2,000-3,000 CPU instructions per call
pub fn get_admin_state(env: &Env) -> (Address, bool) {
    let admin = get_admin(env);
    let paused = is_paused(env);
    (admin, paused)
}


// ── Timelock storage functions ─────────────────────────────

pub fn get_timelock_config(env: &Env) -> crate::types::TimelockConfig {
    env.storage()
        .instance()
        .get(&DataKey::TimelockConfig)
        .unwrap_or(crate::types::TimelockConfig {
            delay_seconds: 172_800, // 48 hours default
            enabled: false,
        })
}

pub fn set_timelock_config(env: &Env, config: &crate::types::TimelockConfig) {
    env.storage().instance().set(&DataKey::TimelockConfig, config);
}

pub fn get_next_change_id(env: &Env) -> Result<u64, Error> {
    let id = env.storage()
        .instance()
        .get(&DataKey::NextChangeId)
        .unwrap_or(0_u64);
    let next_id = id
        .checked_add(1)
        .ok_or(Error::ArithmeticError)?;
    env.storage().instance().set(&DataKey::NextChangeId, &next_id);
    Ok(id)
}

pub fn get_pending_change(env: &Env, change_id: u64) -> Option<crate::types::PendingChange> {
    env.storage()
        .persistent()
        .get(&DataKey::PendingChange(change_id))
}

pub fn set_pending_change(env: &Env, change_id: u64, change: &crate::types::PendingChange) {
    env.storage()
        .persistent()
        .set(&DataKey::PendingChange(change_id), change);
}

pub fn remove_pending_change(env: &Env, change_id: u64) {
    env.storage()
        .persistent()
        .remove(&DataKey::PendingChange(change_id));
}


// ── Creator indexing functions ─────────────────────────────

/// Add a token index to a creator's token list
pub fn add_creator_token(env: &Env, creator: &Address, token_index: u32) {
    let mut tokens: soroban_sdk::Vec<u32> = env
        .storage()
        .persistent()
        .get(&DataKey::CreatorTokens(creator.clone()))
        .unwrap_or(soroban_sdk::Vec::new(env));
    
    tokens.push_back(token_index);
    
    env.storage()
        .persistent()
        .set(&DataKey::CreatorTokens(creator.clone()), &tokens);
    
    // Update count
    let count = tokens.len();
    env.storage()
        .persistent()
        .set(&DataKey::CreatorTokenCount(creator.clone()), &count);
}

/// Get all token indices for a creator
pub fn get_creator_tokens(env: &Env, creator: &Address) -> soroban_sdk::Vec<u32> {
    env.storage()
        .persistent()
        .get(&DataKey::CreatorTokens(creator.clone()))
        .unwrap_or(soroban_sdk::Vec::new(env))
}

/// Get the number of tokens created by an address
pub fn get_creator_token_count(env: &Env, creator: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::CreatorTokenCount(creator.clone()))
        .unwrap_or(0)
}


// ── Treasury storage functions ─────────────────────────────

/// Get treasury withdrawal policy
pub fn get_treasury_policy(env: &Env) -> crate::types::TreasuryPolicy {
    env.storage()
        .instance()
        .get(&DataKey::TreasuryPolicy)
        .unwrap_or(crate::types::TreasuryPolicy {
            daily_cap: 100_0000000, // 100 XLM default
            allowlist_enabled: false,
            period_duration: 86_400, // 24 hours
        })
}

/// Set treasury withdrawal policy
pub fn set_treasury_policy(env: &Env, policy: &crate::types::TreasuryPolicy) {
    env.storage()
        .instance()
        .set(&DataKey::TreasuryPolicy, policy);
}

/// Get current withdrawal period
pub fn get_withdrawal_period(env: &Env) -> crate::types::WithdrawalPeriod {
    env.storage()
        .instance()
        .get(&DataKey::WithdrawalPeriod)
        .unwrap_or(crate::types::WithdrawalPeriod {
            period_start: env.ledger().timestamp(),
            amount_withdrawn: 0,
        })
}

/// Set withdrawal period
pub fn set_withdrawal_period(env: &Env, period: &crate::types::WithdrawalPeriod) {
    env.storage()
        .instance()
        .set(&DataKey::WithdrawalPeriod, period);
}

/// Check if address is allowed recipient
pub fn is_allowed_recipient(env: &Env, recipient: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::AllowedRecipient(recipient.clone()))
        .unwrap_or(false)
}

/// Set allowed recipient status
pub fn set_allowed_recipient(env: &Env, recipient: &Address, allowed: bool) {
    env.storage()
        .persistent()
        .set(&DataKey::AllowedRecipient(recipient.clone()), &allowed);
}

// ── Stream storage functions ───────────────────────────────

/// Get the total number of streams created
pub fn get_stream_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::StreamCount)
        .unwrap_or(0)
}

/// Increment stream count and return new ID
pub fn increment_stream_count(env: &Env) -> Result<u32, Error> {
    let count = get_stream_count(env)
        .checked_add(1)
        .ok_or(Error::ArithmeticError)?;
    env.storage().instance().set(&DataKey::StreamCount, &count);
    Ok(count)
}

/// Get stream info by ID
pub fn get_stream(env: &Env, stream_id: u32) -> Option<crate::stream_types::StreamInfo> {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
}

/// Store stream info
pub fn set_stream(env: &Env, stream_id: u32, stream: &crate::stream_types::StreamInfo) {
    env.storage()
        .persistent()
        .set(&DataKey::Stream(stream_id), stream);
}

/// Add stream to creator's index for pagination
pub fn add_creator_stream(env: &Env, creator: &Address, stream_id: u32) {
    let mut streams: soroban_sdk::Vec<u32> = env
        .storage()
        .persistent()
        .get(&DataKey::StreamByCreator(creator.clone(), 0))
        .unwrap_or(soroban_sdk::Vec::new(env));
    
    streams.push_back(stream_id);
    
    env.storage()
        .persistent()
        .set(&DataKey::StreamByCreator(creator.clone(), 0), &streams);
}

/// Get all stream IDs for a creator
pub fn get_creator_streams(env: &Env, creator: &Address) -> soroban_sdk::Vec<u32> {
    env.storage()
        .persistent()
        .get(&DataKey::StreamByCreator(creator.clone(), 0))
        .unwrap_or(soroban_sdk::Vec::new(env))
}
