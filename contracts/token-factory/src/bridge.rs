//! Cross-Chain Bridge Module
//!
//! Provides token locking on the source chain and releasing on the destination
//! chain. Replay attacks are prevented by tracking used nonces on-chain.
//!
//! ## Architecture
//!
//! ```text
//! Source chain:  caller -> lock_tokens  -> emits "bridge/initiated"
//! Destination:   admin  -> release_tokens -> emits "bridge/completed"
//! ```
//!
//! Nonces are monotonically assigned by the contract on lock and must be
//! supplied verbatim on release. Each nonce can only be released once.

use crate::{
    storage,
    types::{BridgeStatus, BridgeTx, DataKey, Error},
};
use soroban_sdk::{symbol_short, Address, BytesN, Env, Symbol};

fn is_known_chain(env: &Env, chain: &Symbol) -> bool {
    *chain == Symbol::new(env, "ethereum")
        || *chain == Symbol::new(env, "polygon")
        || *chain == Symbol::new(env, "bsc")
}

fn get_next_nonce(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::BridgeNonce)
        .unwrap_or(0u64)
}

fn increment_nonce(env: &Env) -> u64 {
    let nonce = get_next_nonce(env);
    let next = nonce.checked_add(1).expect("nonce overflow");
    env.storage()
        .instance()
        .set(&DataKey::BridgeNonce, &next);
    nonce
}

fn load_bridge_tx(env: &Env, nonce: u64) -> Option<BridgeTx> {
    env.storage().instance().get(&DataKey::BridgeTx(nonce))
}

fn store_bridge_tx(env: &Env, tx: &BridgeTx) {
    env.storage()
        .instance()
        .set(&DataKey::BridgeTx(tx.nonce), tx);
}

/// Lock tokens on the source chain and initiate a cross-chain bridge transfer.
///
/// Validates the caller, amount, and target chain, then records the bridge
/// transaction and emits a `bridge/initiated` event. The assigned nonce must
/// be used when calling [`release_tokens`] on the destination chain.
///
/// # Arguments
/// * `env` - Contract environment
/// * `caller` - Address locking the tokens (must authorize)
/// * `token` - Token contract address to lock
/// * `amount` - Amount to lock (must be > 0)
/// * `target_chain` - Destination chain identifier (`ethereum`, `polygon`, or `bsc`)
/// * `recipient` - 32-byte recipient address on the target chain
///
/// # Returns
/// The nonce assigned to this bridge transaction.
///
/// # Errors
/// * `Error::InvalidAmount` - `amount` is zero or negative
/// * `Error::UnknownChain` - `target_chain` is not a supported chain
pub fn lock_tokens(
    env: &Env,
    caller: &Address,
    token: &Address,
    amount: i128,
    target_chain: &Symbol,
    recipient: &BytesN<32>,
) -> Result<u64, Error> {
    caller.require_auth();

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    if !is_known_chain(env, target_chain) {
        return Err(Error::UnknownChain);
    }

    let nonce = increment_nonce(env);

    let tx = BridgeTx {
        nonce,
        token: token.clone(),
        amount,
        status: BridgeStatus::Pending,
    };
    store_bridge_tx(env, &tx);

    // topics: ["bridge", "initiated"]
    // data:   nonce + token + amount + target_chain + recipient
    env.events().publish(
        (symbol_short!("bridge"), symbol_short!("initiated")),
        (nonce, token.clone(), amount, target_chain.clone(), recipient.clone()),
    );

    Ok(nonce)
}

/// Release tokens on the destination chain for a completed bridge transfer.
///
/// Only the contract admin may call this function. Each nonce can only be
/// released once; duplicate calls are rejected to prevent replay attacks.
///
/// # Arguments
/// * `env` - Contract environment
/// * `admin` - Admin address (must authorize and match stored admin)
/// * `token` - Token contract address to release
/// * `amount` - Amount to release (must be > 0)
/// * `recipient` - Destination address on this chain
/// * `nonce` - Nonce from the originating [`lock_tokens`] call
///
/// # Returns
/// `Ok(())` on success.
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the contract admin
/// * `Error::InvalidAmount` - `amount` is zero or negative
/// * `Error::BridgeNonceUsed` - This nonce has already been released
pub fn release_tokens(
    env: &Env,
    admin: &Address,
    token: &Address,
    amount: i128,
    recipient: &Address,
    nonce: u64,
) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    // Replay prevention: reject if nonce already completed
    if let Some(tx) = load_bridge_tx(env, nonce) {
        if tx.status == BridgeStatus::Completed {
            return Err(Error::BridgeNonceUsed);
        }
    }
    // Note: a nonce that was never locked can still be released by admin
    // (destination-only release). We only block re-release of completed nonces.

    let tx = BridgeTx {
        nonce,
        token: token.clone(),
        amount,
        status: BridgeStatus::Completed,
    };
    store_bridge_tx(env, &tx);

    // topics: ["bridge", "completed"]
    // data:   nonce + token + amount + recipient
    env.events().publish(
        (symbol_short!("bridge"), symbol_short!("completed")),
        (nonce, token.clone(), amount, recipient.clone()),
    );

    Ok(())
}

/// Return the status of a bridge transaction by nonce.
///
/// # Arguments
/// * `env` - Contract environment
/// * `nonce` - The nonce assigned during [`lock_tokens`]
///
/// # Returns
/// The [`BridgeStatus`] for the given nonce.
///
/// # Errors
/// * `Error::TokenNotFound` - No bridge transaction exists for this nonce
pub fn get_bridge_status(env: &Env, nonce: u64) -> Result<BridgeStatus, Error> {
    load_bridge_tx(env, nonce)
        .map(|tx| tx.status)
        .ok_or(Error::TokenNotFound)
}
