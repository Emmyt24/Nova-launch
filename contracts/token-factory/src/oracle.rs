//! Oracle Integration — External Price Feeds
//!
//! Provides a lightweight, permissioned price-feed mechanism for the token factory.
//! Authorized oracle sources push `PriceData` on-chain; consumers read the latest
//! price and validate it against a configurable staleness window.
//!
//! # Architecture
//! - **Admin** configures the oracle (max age, authorized sources) via `configure_oracle`
//!   and `set_oracle_authorized`.
//! - **Authorized sources** push prices via `submit_price`.
//! - **Consumers** read prices via `get_price`, which enforces staleness checks.
//!
//! # Security
//! - Only the contract admin can authorize/deauthorize oracle sources.
//! - Price values must be strictly positive.
//! - Stale prices (older than `max_age_seconds`) are rejected at read time.
//! - All mutations emit versioned events for off-chain indexing.

use soroban_sdk::{symbol_short, Address, Env};

use crate::storage;
use crate::types::{DataKey, Error, OracleConfig, PriceData};

// ─── Storage helpers ─────────────────────────────────────────────────────────

/// Persist the global oracle configuration.
pub fn set_config(env: &Env, config: &OracleConfig) {
    env.storage()
        .instance()
        .set(&DataKey::OracleConfig, config);
}

/// Retrieve the global oracle configuration, or a safe default if not yet set.
pub fn get_config(env: &Env) -> OracleConfig {
    env.storage()
        .instance()
        .get(&DataKey::OracleConfig)
        .unwrap_or(OracleConfig {
            max_age_seconds: 3600, // 1 hour default
            min_sources: 1,
        })
}

/// Mark `source` as authorized (true) or deauthorized (false).
pub fn set_authorized(env: &Env, source: &Address, authorized: bool) {
    env.storage()
        .persistent()
        .set(&DataKey::OracleAuthorized(source.clone()), &authorized);
}

/// Returns `true` if `source` is an authorized oracle.
pub fn is_authorized(env: &Env, source: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::OracleAuthorized(source.clone()))
        .unwrap_or(false)
}

/// Store the latest price submitted by `source`.
pub fn set_price(env: &Env, source: &Address, data: &PriceData) {
    env.storage()
        .persistent()
        .set(&DataKey::OraclePrice(source.clone()), data);
}

/// Retrieve the latest price submitted by `source`, if any.
pub fn get_price_raw(env: &Env, source: &Address) -> Option<PriceData> {
    env.storage()
        .persistent()
        .get(&DataKey::OraclePrice(source.clone()))
}

// ─── Core logic ──────────────────────────────────────────────────────────────

/// Configure the oracle parameters (admin only).
///
/// # Arguments
/// * `admin` - Must be the contract admin and must authorize.
/// * `max_age_seconds` - Prices older than this are considered stale.
/// * `min_sources` - Minimum authorized sources required (currently informational).
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the contract admin.
/// * `Error::InvalidParameters` - `max_age_seconds` is zero.
pub fn configure_oracle(
    env: &Env,
    admin: &Address,
    max_age_seconds: u64,
    min_sources: u32,
) -> Result<(), Error> {
    admin.require_auth();
    if *admin != storage::get_admin(env) {
        return Err(Error::Unauthorized);
    }
    if max_age_seconds == 0 {
        return Err(Error::InvalidParameters);
    }

    set_config(env, &OracleConfig { max_age_seconds, min_sources });

    env.events().publish(
        (symbol_short!("orc_cf_v1"),),
        (max_age_seconds, min_sources),
    );
    Ok(())
}

/// Authorize or deauthorize an oracle price source (admin only).
///
/// # Arguments
/// * `admin` - Must be the contract admin and must authorize.
/// * `source` - The oracle source address to update.
/// * `authorized` - `true` to authorize, `false` to revoke.
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the contract admin.
pub fn set_oracle_authorized(
    env: &Env,
    admin: &Address,
    source: &Address,
    authorized: bool,
) -> Result<(), Error> {
    admin.require_auth();
    if *admin != storage::get_admin(env) {
        return Err(Error::Unauthorized);
    }

    set_authorized(env, source, authorized);

    env.events().publish(
        (symbol_short!("orc_au_v1"), source.clone()),
        (authorized,),
    );
    Ok(())
}

/// Submit a new price observation (authorized oracle sources only).
///
/// The price is stored keyed by the caller's address. Consumers call
/// `get_price` to retrieve and validate it.
///
/// # Arguments
/// * `source` - The oracle source address (must be authorized, must authorize).
/// * `price` - Raw price value (must be > 0).
/// * `decimals` - Decimal places for `price`.
///
/// # Errors
/// * `Error::OracleUnauthorized` - `source` is not an authorized oracle.
/// * `Error::OraclePriceInvalid` - `price` is zero or negative.
pub fn submit_price(
    env: &Env,
    source: &Address,
    price: i128,
    decimals: u32,
) -> Result<(), Error> {
    source.require_auth();

    if !is_authorized(env, source) {
        return Err(Error::OracleUnauthorized);
    }
    if price <= 0 {
        return Err(Error::OraclePriceInvalid);
    }

    let data = PriceData {
        price,
        decimals,
        timestamp: env.ledger().timestamp(),
    };
    set_price(env, source, &data);

    env.events().publish(
        (symbol_short!("orc_pr_v1"), source.clone()),
        (price, decimals, data.timestamp),
    );
    Ok(())
}

/// Retrieve and validate the latest price from `source`.
///
/// Enforces the staleness window configured via `configure_oracle`.
///
/// # Arguments
/// * `source` - The oracle source address whose price to read.
///
/// # Returns
/// The latest `PriceData` if present and fresh.
///
/// # Errors
/// * `Error::OracleNotFound` - No price has been submitted by `source`.
/// * `Error::OraclePriceStale` - The price is older than `max_age_seconds`.
pub fn get_price(env: &Env, source: &Address) -> Result<PriceData, Error> {
    let data = get_price_raw(env, source).ok_or(Error::OracleNotFound)?;

    let config = get_config(env);
    let now = env.ledger().timestamp();
    let age = now.saturating_sub(data.timestamp);

    if age > config.max_age_seconds {
        return Err(Error::OraclePriceStale);
    }

    Ok(data)
}
