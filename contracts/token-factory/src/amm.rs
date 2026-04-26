//! Automated Market Maker (AMM) Module
//!
//! Implements a constant-product AMM (x * y = k) for token swaps and
//! liquidity provision. LP tokens are tracked as a simple integer share
//! of the pool stored in contract state.
//!
//! ## Formula
//!
//! Swap output uses the constant-product invariant with no fee:
//!
//! ```text
//! amount_out = (reserve_out * amount_in) / (reserve_in + amount_in)
//! ```
//!
//! Spot price (token_a per token_b):
//!
//! ```text
//! price = reserve_a * PRICE_PRECISION / reserve_b
//! ```
//!
//! ## Pool Key Ordering
//!
//! Pools are keyed by `(token_a, token_b)` where the pair is stored in the
//! order supplied by the first `add_liquidity` call. Callers must supply
//! tokens in the same order for subsequent operations.

use crate::types::{AmmPool, DataKey, Error};
use soroban_sdk::{symbol_short, Address, Env};

/// Fixed-point precision multiplier for price calculations.
pub const PRICE_PRECISION: i128 = 1_000_000_000;

fn load_pool(env: &Env, token_a: &Address, token_b: &Address) -> Option<AmmPool> {
    let key = DataKey::AmmPool(token_a.clone(), token_b.clone());
    env.storage().instance().get(&key)
}

fn save_pool(env: &Env, pool: &AmmPool) {
    let key = DataKey::AmmPool(pool.token_a.clone(), pool.token_b.clone());
    env.storage().instance().set(&key, pool);
}

fn require_pool(env: &Env, token_a: &Address, token_b: &Address) -> Result<AmmPool, Error> {
    load_pool(env, token_a, token_b).ok_or(Error::PoolNotFound)
}

/// Add liquidity to a token pair pool and receive LP tokens.
///
/// On the first call for a pair the pool is created. Subsequent calls must
/// supply both tokens in the same order used at creation.
///
/// # Arguments
/// * `env` - Contract environment
/// * `caller` - Liquidity provider (must authorize)
/// * `token_a` - First token address
/// * `token_b` - Second token address
/// * `amount_a` - Amount of `token_a` to deposit (must be > 0)
/// * `amount_b` - Amount of `token_b` to deposit (must be > 0)
///
/// # Returns
/// LP tokens minted to the caller.
///
/// # Errors
/// * `Error::InvalidAmount` - Either amount is zero or negative
/// * `Error::InvalidTokenPair` - `token_a == token_b`
pub fn add_liquidity(
    env: &Env,
    caller: &Address,
    token_a: &Address,
    token_b: &Address,
    amount_a: i128,
    amount_b: i128,
) -> Result<i128, Error> {
    caller.require_auth();

    if amount_a <= 0 || amount_b <= 0 {
        return Err(Error::InvalidAmount);
    }
    if token_a == token_b {
        return Err(Error::InvalidTokenPair);
    }

    let lp_minted;

    let pool = match load_pool(env, token_a, token_b) {
        None => {
            // First deposit: LP tokens = geometric mean of amounts
            lp_minted = isqrt(
                amount_a
                    .checked_mul(amount_b)
                    .ok_or(Error::ArithmeticError)?,
            );
            AmmPool {
                token_a: token_a.clone(),
                token_b: token_b.clone(),
                reserve_a: amount_a,
                reserve_b: amount_b,
                total_lp: lp_minted,
            }
        }
        Some(mut p) => {
            // Proportional deposit
            lp_minted = amount_a
                .checked_mul(p.total_lp)
                .ok_or(Error::ArithmeticError)?
                .checked_div(p.reserve_a)
                .ok_or(Error::ArithmeticError)?;
            p.reserve_a = p
                .reserve_a
                .checked_add(amount_a)
                .ok_or(Error::ArithmeticError)?;
            p.reserve_b = p
                .reserve_b
                .checked_add(amount_b)
                .ok_or(Error::ArithmeticError)?;
            p.total_lp = p
                .total_lp
                .checked_add(lp_minted)
                .ok_or(Error::ArithmeticError)?;
            p
        }
    };

    save_pool(env, &pool);

    // topics: ["amm", "liq_added"]  (liq_added = 9 chars, fits)
    // data:   caller + token_a + token_b + amount_a + amount_b
    env.events().publish(
        (symbol_short!("amm"), symbol_short!("liq_added")),
        (caller.clone(), token_a.clone(), token_b.clone(), amount_a, amount_b),
    );

    Ok(lp_minted)
}

/// Remove liquidity from a pool by burning LP tokens.
///
/// # Arguments
/// * `env` - Contract environment
/// * `caller` - LP token holder (must authorize)
/// * `token_a` - First token address
/// * `token_b` - Second token address
/// * `lp_amount` - LP tokens to burn (must be > 0)
///
/// # Returns
/// `(amount_a, amount_b)` returned to the caller.
///
/// # Errors
/// * `Error::InvalidAmount` - `lp_amount` is zero or negative
/// * `Error::PoolNotFound` - Pool does not exist
/// * `Error::InsufficientLiquidity` - Pool has no LP tokens
pub fn remove_liquidity(
    env: &Env,
    caller: &Address,
    token_a: &Address,
    token_b: &Address,
    lp_amount: i128,
) -> Result<(i128, i128), Error> {
    caller.require_auth();

    if lp_amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    let mut pool = require_pool(env, token_a, token_b)?;

    if pool.total_lp == 0 {
        return Err(Error::InsufficientLiquidity);
    }

    let out_a = lp_amount
        .checked_mul(pool.reserve_a)
        .ok_or(Error::ArithmeticError)?
        .checked_div(pool.total_lp)
        .ok_or(Error::ArithmeticError)?;
    let out_b = lp_amount
        .checked_mul(pool.reserve_b)
        .ok_or(Error::ArithmeticError)?
        .checked_div(pool.total_lp)
        .ok_or(Error::ArithmeticError)?;

    pool.reserve_a = pool
        .reserve_a
        .checked_sub(out_a)
        .ok_or(Error::ArithmeticError)?;
    pool.reserve_b = pool
        .reserve_b
        .checked_sub(out_b)
        .ok_or(Error::ArithmeticError)?;
    pool.total_lp = pool
        .total_lp
        .checked_sub(lp_amount)
        .ok_or(Error::ArithmeticError)?;

    save_pool(env, &pool);

    // topics: ["amm", "liq_rmvd"]  (liq_rmvd = 8 chars)
    // data:   caller + lp_amount
    env.events().publish(
        (symbol_short!("amm"), symbol_short!("liq_rmvd")),
        (caller.clone(), lp_amount),
    );

    Ok((out_a, out_b))
}

/// Execute a token swap using the constant-product formula.
///
/// Uses `amount_out = (reserve_out * amount_in) / (reserve_in + amount_in)`.
/// The swap is rejected if the computed output is below `min_amount_out`
/// (slippage protection).
///
/// # Arguments
/// * `env` - Contract environment
/// * `caller` - Swapper (must authorize)
/// * `token_in` - Token being sold
/// * `token_out` - Token being bought
/// * `amount_in` - Amount of `token_in` to sell (must be > 0)
/// * `min_amount_out` - Minimum acceptable output (slippage guard)
///
/// # Returns
/// Actual amount of `token_out` received.
///
/// # Errors
/// * `Error::InvalidAmount` - `amount_in` is zero or negative
/// * `Error::PoolNotFound` - No pool for this pair
/// * `Error::InsufficientLiquidity` - Pool reserves are zero
/// * `Error::SlippageExceeded` - Output is below `min_amount_out`
pub fn swap(
    env: &Env,
    caller: &Address,
    token_in: &Address,
    token_out: &Address,
    amount_in: i128,
    min_amount_out: i128,
) -> Result<i128, Error> {
    caller.require_auth();

    if amount_in <= 0 {
        return Err(Error::InvalidAmount);
    }

    // Try both orderings of the pool key
    let (mut pool, a_is_in) = if let Some(p) = load_pool(env, token_in, token_out) {
        (p, true)
    } else if let Some(p) = load_pool(env, token_out, token_in) {
        (p, false)
    } else {
        return Err(Error::PoolNotFound);
    };

    let (reserve_in, reserve_out) = if a_is_in {
        (pool.reserve_a, pool.reserve_b)
    } else {
        (pool.reserve_b, pool.reserve_a)
    };

    if reserve_in == 0 || reserve_out == 0 {
        return Err(Error::InsufficientLiquidity);
    }

    // Constant-product: amount_out = reserve_out * amount_in / (reserve_in + amount_in)
    let numerator = reserve_out
        .checked_mul(amount_in)
        .ok_or(Error::ArithmeticError)?;
    let denominator = reserve_in
        .checked_add(amount_in)
        .ok_or(Error::ArithmeticError)?;
    let amount_out = numerator
        .checked_div(denominator)
        .ok_or(Error::ArithmeticError)?;

    if amount_out < min_amount_out {
        return Err(Error::SlippageExceeded);
    }

    // Update reserves
    if a_is_in {
        pool.reserve_a = pool
            .reserve_a
            .checked_add(amount_in)
            .ok_or(Error::ArithmeticError)?;
        pool.reserve_b = pool
            .reserve_b
            .checked_sub(amount_out)
            .ok_or(Error::ArithmeticError)?;
    } else {
        pool.reserve_b = pool
            .reserve_b
            .checked_add(amount_in)
            .ok_or(Error::ArithmeticError)?;
        pool.reserve_a = pool
            .reserve_a
            .checked_sub(amount_out)
            .ok_or(Error::ArithmeticError)?;
    }

    save_pool(env, &pool);

    // topics: ["amm", "swap"]
    // data:   caller + token_in + amount_in + token_out + amount_out
    env.events().publish(
        (symbol_short!("amm"), symbol_short!("swap")),
        (caller.clone(), token_in.clone(), amount_in, token_out.clone(), amount_out),
    );

    Ok(amount_out)
}

/// Return the current spot price of `token_a` in terms of `token_b`.
///
/// Price is expressed as `reserve_a * PRICE_PRECISION / reserve_b`, so
/// divide the result by [`PRICE_PRECISION`] to get the human-readable ratio.
///
/// # Arguments
/// * `env` - Contract environment
/// * `token_a` - Numerator token
/// * `token_b` - Denominator token
///
/// # Returns
/// Spot price scaled by [`PRICE_PRECISION`].
///
/// # Errors
/// * `Error::PoolNotFound` - No pool for this pair
/// * `Error::InsufficientLiquidity` - Pool reserves are zero
pub fn get_price(env: &Env, token_a: &Address, token_b: &Address) -> Result<i128, Error> {
    let pool = if let Some(p) = load_pool(env, token_a, token_b) {
        p
    } else if let Some(p) = load_pool(env, token_b, token_a) {
        // Invert: price of token_a in token_b = reserve_b / reserve_a (from reversed pool)
        if p.reserve_a == 0 {
            return Err(Error::InsufficientLiquidity);
        }
        return p
            .reserve_b
            .checked_mul(PRICE_PRECISION)
            .ok_or(Error::ArithmeticError)?
            .checked_div(p.reserve_a)
            .ok_or(Error::ArithmeticError);
    } else {
        return Err(Error::PoolNotFound);
    };

    if pool.reserve_b == 0 {
        return Err(Error::InsufficientLiquidity);
    }

    pool.reserve_a
        .checked_mul(PRICE_PRECISION)
        .ok_or(Error::ArithmeticError)?
        .checked_div(pool.reserve_b)
        .ok_or(Error::ArithmeticError)
}

/// Integer square root (floor).
fn isqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}
