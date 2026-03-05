use soroban_sdk::{symbol_short, Address, Env};
use crate::storage;
use crate::types::Error;

const MAX_BATCH_BURN: u32 = 100;

pub fn burn(env: &Env, caller: Address, token_index: u32, amount: i128) -> Result<(), Error> {
    caller.require_auth();
    validate_amount(amount)?;

    let mut info = storage::get_token_info(env, token_index).ok_or(Error::TokenNotFound)?;

    // Token-level pause check
    if storage::is_token_paused(env, token_index) {
        return Err(Error::TokenPaused);
    }

    let balance = storage::get_balance(env, token_index, &caller);
    if balance < amount {
        return Err(Error::InsufficientBalance);
    }

    let new_balance = balance.checked_sub(amount).ok_or(Error::ArithmeticError)?;
    let new_supply  = info.total_supply.checked_sub(amount).ok_or(Error::ArithmeticError)?;

    storage::set_balance(env, token_index, &caller, new_balance);
    info.total_supply = new_supply;
    storage::set_token_info(env, token_index, &info);
    storage::increment_burn_count(env, token_index)?;
    storage::add_total_burned(env, token_index, amount);

    emit_burn_event(env, token_index, &caller, amount, new_supply);
    Ok(())
}

pub fn admin_burn(
    env: &Env,
    admin: Address,
    token_index: u32,
    holder: Address,
    amount: i128,
) -> Result<(), Error> {
    admin.require_auth();

    let current_admin = storage::get_admin(env);
    if admin != current_admin {
        return Err(Error::Unauthorized);
    }

    validate_amount(amount)?;
    validate_address(&holder)?;

    let mut info = storage::get_token_info(env, token_index).ok_or(Error::TokenNotFound)?;

    // Token-level pause check
    if storage::is_token_paused(env, token_index) {
        return Err(Error::TokenPaused);
    }

    let balance = storage::get_balance(env, token_index, &holder);
    if balance < amount {
        return Err(Error::InsufficientBalance);
    }

    let new_balance = balance.checked_sub(amount).ok_or(Error::ArithmeticError)?;
    let new_supply  = info.total_supply.checked_sub(amount).ok_or(Error::ArithmeticError)?;

    storage::set_balance(env, token_index, &holder, new_balance);
    info.total_supply = new_supply;
    storage::set_token_info(env, token_index, &info);
    storage::increment_burn_count(env, token_index)?;
    storage::add_total_burned(env, token_index, amount);

    emit_admin_burn_event(env, token_index, &admin, &holder, amount, new_supply);
    Ok(())
}

pub fn batch_burn(
    env: &Env,
    admin: Address,
    token_index: u32,
    burns: soroban_sdk::Vec<(Address, i128)>,
) -> Result<(), Error> {
    admin.require_auth();

    let current_admin = storage::get_admin(env);
    if admin != current_admin {
        return Err(Error::Unauthorized);
    }

    if burns.len() > MAX_BATCH_BURN {
        return Err(Error::BatchTooLarge);
    }
    if burns.is_empty() {
        return Err(Error::InvalidParameters);
    }

    let mut info = storage::get_token_info(env, token_index).ok_or(Error::TokenNotFound)?;

    // Token-level pause check
    if storage::is_token_paused(env, token_index) {
        return Err(Error::TokenPaused);
    }

    // Pre-validation pass (all-or-nothing guarantee)
    let mut total_burn: i128 = 0;
    for i in 0..burns.len() {
        let (ref holder, amount) = burns.get(i).unwrap();
        validate_amount(amount)?;
        validate_address(holder)?;

        let balance = storage::get_balance(env, token_index, holder);
        if balance < amount {
            return Err(Error::InsufficientBalance);
        }
        total_burn = total_burn.checked_add(amount).ok_or(Error::ArithmeticError)?;
    }

    if info.total_supply < total_burn {
        return Err(Error::InsufficientBalance);
    }

    // Mutation pass
    for i in 0..burns.len() {
        let (ref holder, amount) = burns.get(i).unwrap();
        let balance     = storage::get_balance(env, token_index, holder);
        let new_balance = balance.checked_sub(amount).ok_or(Error::ArithmeticError)?;
        storage::set_balance(env, token_index, holder, new_balance);
    }

    let new_supply = info.total_supply.checked_sub(total_burn).ok_or(Error::ArithmeticError)?;
    info.total_supply = new_supply;
    storage::set_token_info(env, token_index, &info);
    storage::increment_burn_count(env, token_index)?;
    storage::add_total_burned(env, token_index, total_burn);

    emit_batch_burn_event(env, token_index, &admin, burns.len(), total_burn, new_supply);
    Ok(())
}

pub fn get_burn_count(env: &Env, token_index: u32) -> u32 {
    storage::get_burn_count(env, token_index)
}

pub fn get_balance(env: &Env, token_index: u32, holder: &Address) -> i128 {
    storage::get_balance(env, token_index, holder)
}

fn validate_amount(amount: i128) -> Result<(), Error> {
    if amount <= 0 {
        return Err(Error::InvalidParameters);
    }
    Ok(())
}

fn validate_address(addr: &Address) -> Result<(), Error> {
    let _ = addr;
    Ok(())
}

// ─────────────────────────────────────────────
//  Event emission
// ─────────────────────────────────────────────

/// Emit burn event (v1)
/// 
/// **Schema Version**: 1
/// **Event Name**: burn_v1
/// 
/// **Topics** (indexed):
/// - Event name: "burn_v1"
/// - token_index: u32 - The token index
/// 
/// **Payload** (non-indexed):
/// - caller: Address - The address that burned tokens
/// - amount: i128 - The amount burned
/// - new_supply: i128 - The new total supply after burn
/// 
/// **Schema Stability**: This schema is immutable. Any changes require a new version.
fn emit_burn_event(env: &Env, token_index: u32, caller: &Address, amount: i128, new_supply: i128) {
    env.events().publish(
        (symbol_short!("burn_v1"), token_index),
        (caller.clone(), amount, new_supply),
    );
}

/// Emit admin burn event (v1)
/// 
/// **Schema Version**: 1
/// **Event Name**: adm_bn_v1
/// 
/// **Topics** (indexed):
/// - Event name: "adm_bn_v1"
/// - token_index: u32 - The token index
/// 
/// **Payload** (non-indexed):
/// - admin: Address - The admin who initiated the burn
/// - holder: Address - The address whose tokens were burned
/// - amount: i128 - The amount burned
/// - new_supply: i128 - The new total supply after burn
/// 
/// **Schema Stability**: This schema is immutable. Any changes require a new version.
fn emit_admin_burn_event(
    env: &Env,
    token_index: u32,
    admin: &Address,
    holder: &Address,
    amount: i128,
    new_supply: i128,
) {
    env.events().publish(
        (symbol_short!("adm_bn_v1"), token_index),
        (admin.clone(), holder.clone(), amount, new_supply),
    );
}

/// Emit batch burn event (v1)
/// 
/// **Schema Version**: 1
/// **Event Name**: bch_bn_v1
/// 
/// **Topics** (indexed):
/// - Event name: "bch_bn_v1"
/// - token_index: u32 - The token index
/// 
/// **Payload** (non-indexed):
/// - admin: Address - The admin who initiated the batch burn
/// - count: u32 - The number of burns in the batch
/// - total_burned: i128 - The total amount burned across all burns
/// - new_supply: i128 - The new total supply after batch burn
/// 
/// **Schema Stability**: This schema is immutable. Any changes require a new version.
fn emit_batch_burn_event(
    env: &Env,
    token_index: u32,
    admin: &Address,
    count: u32,
    total_burned: i128,
    new_supply: i128,
) {
    env.events().publish(
        (symbol_short!("bch_bn_v1"), token_index),
        (admin.clone(), count, total_burned, new_supply),
    );
}