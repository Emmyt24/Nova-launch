//! Governance Delegation System — Event Emission
//!
//! All events follow the same pattern as the token-factory contract:
//! - Topic tuple: (symbol, primary_key)
//! - Data tuple: remaining fields
//!
//! Keeping events lean reduces gas costs (fewer bytes serialised).

use soroban_sdk::{symbol_short, Address, Env};

/// Emitted when a delegator assigns their vote power to a delegatee.
///
/// Topic: ("delegated",)
/// Data:  (delegator, delegatee, amount)
pub fn emit_delegated(env: &Env, delegator: &Address, delegatee: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("delegated"),),
        (delegator.clone(), delegatee.clone(), amount),
    );
}

/// Emitted when a delegator revokes their current delegation.
///
/// Topic: ("undelegated",)
/// Data:  (delegator, former_delegatee, amount_returned)
pub fn emit_undelegated(
    env: &Env,
    delegator: &Address,
    former_delegatee: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("undlgtd"),),
        (delegator.clone(), former_delegatee.clone(), amount),
    );
}

/// Emitted when a delegator changes their delegatee.
///
/// Topic: ("redelegated",)
/// Data:  (delegator, old_delegatee, new_delegatee, amount)
pub fn emit_redelegated(
    env: &Env,
    delegator: &Address,
    old_delegatee: &Address,
    new_delegatee: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("redlgtd"),),
        (
            delegator.clone(),
            old_delegatee.clone(),
            new_delegatee.clone(),
            amount,
        ),
    );
}

/// Emitted when a vote-power snapshot is taken.
///
/// Topic: ("snapshot",)
/// Data:  (address, ledger, power)
pub fn emit_snapshot(env: &Env, address: &Address, ledger: u32, power: i128) {
    env.events().publish(
        (symbol_short!("snapshot"),),
        (address.clone(), ledger, power),
    );
}

/// Emitted when the admin transfers administrative control.
pub fn emit_admin_transfer(env: &Env, old_admin: &Address, new_admin: &Address) {
    env.events().publish(
        (symbol_short!("adm_xfer"),),
        (old_admin.clone(), new_admin.clone()),
    );
}

/// Emitted when the contract is paused or unpaused.
pub fn emit_pause_changed(env: &Env, admin: &Address, paused: bool) {
    env.events().publish(
        (symbol_short!("pause"),),
        (admin.clone(), paused),
    );
}
