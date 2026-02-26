use soroban_sdk::{Address, Env};

use crate::types::{DataKey, FactoryState, TokenInfo, BurnRecord};

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

// Get factory state
pub fn get_factory_state(env: &Env) -> FactoryState {
    FactoryState {
        admin: get_admin(env),
        treasury: get_treasury(env),
        base_fee: get_base_fee(env),
        metadata_fee: get_metadata_fee(env),
    }
}

// ============================================================
// Burn tracking functions
// ============================================================

/// Get the total amount burned for a specific token
pub fn get_total_burned(env: &Env, token_address: &Address) -> i128 {
    if let Some(token_info) = get_token_info_by_address(env, token_address) {
        token_info.total_burned
    } else {
        0
    }
}

/// Get the burn count for a specific token
pub fn get_burn_count(env: &Env, token_address: &Address) -> u32 {
    if let Some(token_info) = get_token_info_by_address(env, token_address) {
        token_info.burn_count
    } else {
        0
    }
}

/// Get the global burn count (total number of burn operations across all tokens)
pub fn get_global_burn_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::BurnCount)
        .unwrap_or(0)
}

/// Increment the burn count for a token and global burn count
pub fn increment_burn_count(env: &Env, token_address: &Address, amount: i128) {
    if let Some(mut token_info) = get_token_info_by_address(env, token_address) {
        token_info.burn_count += 1;
        token_info.total_burned += amount;
        
        // Update the token info in storage
        let index = get_token_index(env, token_address);
        if let Some(idx) = index {
            env.storage().instance().set(&DataKey::Token(idx), &token_info);
        }
        
        // Increment global burn count
        let global_count = get_global_burn_count(env) + 1;
        env.storage().instance().set(&DataKey::BurnCount, &global_count);
    }
}

/// Add a burn record to storage
pub fn add_burn_record(env: &Env, record: &BurnRecord) {
    let index = get_global_burn_count(env);
    env.storage().instance().set(&DataKey::BurnRecord(index), record);
}

/// Get a burn record by index
pub fn get_burn_record(env: &Env, index: u32) -> Option<BurnRecord> {
    env.storage().instance().get(&DataKey::BurnRecord(index))
}

/// Get the total number of burn records
pub fn get_burn_record_count(env: &Env) -> u32 {
    get_global_burn_count(env)
}

/// Update token supply (used for burn operations)
pub fn update_token_supply(env: &Env, token_address: &Address, delta: i128) {
    if let Some(mut token_info) = get_token_info_by_address(env, token_address) {
        token_info.total_supply = token_info.total_supply.checked_sub(delta)
            .expect("Supply cannot go below zero");
        
        let index = get_token_index(env, token_address);
        if let Some(idx) = index {
            env.storage().instance().set(&DataKey::Token(idx), &token_info);
        }
    }
}

// Helper function to get token info by address
fn get_token_info_by_address(env: &Env, token_address: &Address) -> Option<TokenInfo> {
    let token_count = get_token_count(env);
    for i in 0..token_count {
        if let Some(token_info) = get_token_info(env, i) {
            if token_info.address == *token_address {
                return Some(token_info);
            }
        }
    }
    None
}

// Helper function to get token index by address
fn get_token_index(env: &Env, token_address: &Address) -> Option<u32> {
    let token_count = get_token_count(env);
    for i in 0..token_count {
        if let Some(token_info) = get_token_info(env, i) {
            if token_info.address == *token_address {
                return Some(i);
            }
        }
    }
    None
}
