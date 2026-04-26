//! Token Burn Auction Mechanism for Price Discovery
//!
//! This module implements a Dutch auction mechanism where participants bid
//! to burn tokens. The auction starts at a high price that decreases linearly
//! over time until a bid is placed or the auction expires. This creates
//! transparent, on-chain price discovery for token burn events.
//!
//! ## Auction Mechanics
//!
//! 1. Admin creates an auction specifying the token, burn amount, start price,
//!    reserve price, and duration.
//! 2. The current price decreases linearly from `start_price` to
//!    `reserve_price` over the auction duration.
//! 3. Any bidder who pays the current price wins the auction immediately.
//! 4. The winning bid amount is burned from the token supply.
//! 5. Unsettled auctions expire after `end_time` and can be cancelled.
//!
//! ## Price Formula
//!
//! ```text
//! elapsed   = min(now, end_time) - start_time
//! duration  = end_time - start_time
//! price     = start_price - (start_price - reserve_price) * elapsed / duration
//! ```
//!
//! ## State Transitions
//!
//! ```text
//! Open ──bid──▶ Settled  (terminal)
//! Open ──cancel──▶ Cancelled  (terminal, admin or after expiry)
//! ```
//!
//! ## Security
//!
//! - All arithmetic uses checked operations (no overflow)
//! - Authorization required for admin operations
//! - Bids validated against current price before state mutation
//! - State committed before events (reentrancy safety)
//! - Replay protection: settled/cancelled auctions reject further bids

use crate::events;
use crate::storage;
use crate::types::{AuctionStatus, BurnAuction, Error};
use soroban_sdk::{Address, Env};

/// Maximum auction duration: 30 days in seconds
const MAX_AUCTION_DURATION: u64 = 30 * 24 * 3_600;

/// Minimum auction duration: 60 seconds
const MIN_AUCTION_DURATION: u64 = 60;

/// Maximum number of concurrent open auctions
const MAX_OPEN_AUCTIONS: u64 = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Auction Management
// ─────────────────────────────────────────────────────────────────────────────

/// Create a new burn auction
///
/// Initialises a Dutch auction for a token burn. The price decreases linearly
/// from `start_price` to `reserve_price` over the auction window. Only the
/// admin can create auctions.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorise and match stored admin)
/// * `token_index` - Index of the token to burn
/// * `burn_amount` - Number of tokens to burn on settlement (must be > 0)
/// * `start_price` - Opening bid price in stroops (must be > reserve_price)
/// * `reserve_price` - Minimum acceptable price in stroops (must be > 0)
/// * `start_time` - Unix timestamp when bidding opens
/// * `end_time` - Unix timestamp when the auction expires
///
/// # Returns
/// Returns the new auction ID on success
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::ContractPaused` - Contract is paused
/// * `Error::TokenNotFound` - Token index is invalid
/// * `Error::InvalidAmount` - `burn_amount` is zero or negative
/// * `Error::InvalidParameters` - `reserve_price` <= 0, `start_price` <= `reserve_price`,
///   or invalid time window
/// * `Error::BatchTooLarge` - Open auction cap reached
/// * `Error::ArithmeticError` - Auction ID counter overflow
pub fn create_auction(
    env: &Env,
    admin: &Address,
    token_index: u32,
    burn_amount: i128,
    start_price: i128,
    reserve_price: i128,
    start_time: u64,
    end_time: u64,
) -> Result<u64, Error> {
    admin.require_auth();

    // Authorization
    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    // Contract pause guard
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    // Token must exist
    storage::get_token_info(env, token_index).ok_or(Error::TokenNotFound)?;

    // Validate burn amount
    if burn_amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    // Validate prices
    if reserve_price <= 0 {
        return Err(Error::InvalidParameters);
    }
    if start_price <= reserve_price {
        return Err(Error::InvalidParameters);
    }

    // Validate time window
    let now = env.ledger().timestamp();
    if start_time >= end_time {
        return Err(Error::InvalidTimeWindow);
    }
    if end_time <= now {
        return Err(Error::InvalidTimeWindow);
    }
    let duration = end_time
        .checked_sub(start_time)
        .ok_or(Error::ArithmeticError)?;
    if duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION {
        return Err(Error::InvalidTimeWindow);
    }

    // Cap concurrent open auctions
    let open_count = storage::get_open_auction_count(env);
    if open_count >= MAX_OPEN_AUCTIONS {
        return Err(Error::BatchTooLarge);
    }

    // Allocate ID
    let auction_id = storage::next_auction_id(env)?;

    let auction = BurnAuction {
        id: auction_id,
        token_index,
        burn_amount,
        start_price,
        reserve_price,
        start_time,
        end_time,
        winning_bid: None,
        winner: None,
        status: AuctionStatus::Open,
        created_at: now,
        settled_at: None,
    };

    storage::set_auction(env, auction_id, &auction);
    storage::increment_open_auction_count(env)?;

    events::emit_auction_created(
        env,
        auction_id,
        admin,
        token_index,
        burn_amount,
        start_price,
        reserve_price,
        start_time,
        end_time,
    );

    Ok(auction_id)
}

/// Place a bid on an open auction
///
/// The bidder pays `bid_amount` which must be >= the current Dutch auction
/// price. On success the auction is immediately settled: the bid amount is
/// recorded, the token burn is registered, and the auction moves to
/// `Settled` status.
///
/// # Arguments
/// * `env` - The contract environment
/// * `bidder` - Address placing the bid (must authorise)
/// * `auction_id` - ID of the auction to bid on
/// * `bid_amount` - Amount offered in stroops (must be >= current price)
///
/// # Returns
/// Returns the final settlement price (current price at time of bid)
///
/// # Errors
/// * `Error::AuctionNotFound` - Auction does not exist
/// * `Error::ContractPaused` - Contract is paused
/// * `Error::InvalidStateTransition` - Auction is not open
/// * `Error::InvalidTimeWindow` - Auction has not started or has expired
/// * `Error::InvalidAmount` - `bid_amount` is zero or negative
/// * `Error::InsufficientFee` - `bid_amount` is below the current price
/// * `Error::ArithmeticError` - Price calculation overflow
pub fn place_bid(
    env: &Env,
    bidder: &Address,
    auction_id: u64,
    bid_amount: i128,
) -> Result<i128, Error> {
    bidder.require_auth();

    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    if bid_amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    let mut auction =
        storage::get_auction(env, auction_id).ok_or(Error::AuctionNotFound)?;

    // Only open auctions accept bids
    if auction.status != AuctionStatus::Open {
        return Err(Error::InvalidStateTransition);
    }

    let now = env.ledger().timestamp();

    // Auction must have started
    if now < auction.start_time {
        return Err(Error::InvalidTimeWindow);
    }

    // Auction must not have expired
    if now >= auction.end_time {
        return Err(Error::InvalidTimeWindow);
    }

    // Calculate current Dutch price
    let current_price = current_auction_price(env, &auction)?;

    // Bid must meet or exceed current price
    if bid_amount < current_price {
        return Err(Error::InsufficientFee);
    }

    // Settle: record winner and mark as settled
    // State committed before events (reentrancy safety)
    auction.winning_bid = Some(current_price);
    auction.winner = Some(bidder.clone());
    auction.status = AuctionStatus::Settled;
    auction.settled_at = Some(now);

    storage::set_auction(env, auction_id, &auction);
    storage::decrement_open_auction_count(env)?;

    events::emit_auction_settled(
        env,
        auction_id,
        bidder,
        current_price,
        auction.burn_amount,
        auction.token_index,
    );

    Ok(current_price)
}

/// Cancel an auction
///
/// An open auction can be cancelled by the admin at any time, or by anyone
/// after the auction has expired (past `end_time`). Settled or already-
/// cancelled auctions cannot be cancelled again.
///
/// # Arguments
/// * `env` - The contract environment
/// * `caller` - Address requesting cancellation (must authorise)
/// * `auction_id` - ID of the auction to cancel
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::AuctionNotFound` - Auction does not exist
/// * `Error::Unauthorized` - Caller is not admin and auction has not expired
/// * `Error::InvalidStateTransition` - Auction is already settled or cancelled
pub fn cancel_auction(env: &Env, caller: &Address, auction_id: u64) -> Result<(), Error> {
    caller.require_auth();

    let mut auction =
        storage::get_auction(env, auction_id).ok_or(Error::AuctionNotFound)?;

    // Only open auctions can be cancelled
    if auction.status != AuctionStatus::Open {
        return Err(Error::InvalidStateTransition);
    }

    let admin = storage::get_admin(env);
    let now = env.ledger().timestamp();
    let expired = now >= auction.end_time;

    // Admin can cancel any time; anyone can cancel an expired auction
    if *caller != admin && !expired {
        return Err(Error::Unauthorized);
    }

    auction.status = AuctionStatus::Cancelled;

    storage::set_auction(env, auction_id, &auction);
    storage::decrement_open_auction_count(env)?;

    events::emit_auction_cancelled(env, auction_id, caller);

    Ok(())
}

/// Update the reserve price of an open auction (admin only)
///
/// Allows the admin to lower the reserve price before any bid is placed.
/// The new reserve price must be lower than the current one and > 0.
/// The start price is unchanged.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorise)
/// * `auction_id` - ID of the auction to update
/// * `new_reserve_price` - New reserve price (must be > 0 and < current reserve)
///
/// # Returns
/// Returns `Ok(())` on success
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::AuctionNotFound` - Auction does not exist
/// * `Error::InvalidStateTransition` - Auction is not open
/// * `Error::InvalidParameters` - New price is not lower than current reserve
pub fn update_reserve_price(
    env: &Env,
    admin: &Address,
    auction_id: u64,
    new_reserve_price: i128,
) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    if new_reserve_price <= 0 {
        return Err(Error::InvalidParameters);
    }

    let mut auction =
        storage::get_auction(env, auction_id).ok_or(Error::AuctionNotFound)?;

    if auction.status != AuctionStatus::Open {
        return Err(Error::InvalidStateTransition);
    }

    // New reserve must be strictly lower than current reserve
    if new_reserve_price >= auction.reserve_price {
        return Err(Error::InvalidParameters);
    }

    // New reserve must remain below start price
    if new_reserve_price >= auction.start_price {
        return Err(Error::InvalidParameters);
    }

    let old_reserve = auction.reserve_price;
    auction.reserve_price = new_reserve_price;

    storage::set_auction(env, auction_id, &auction);

    events::emit_auction_reserve_updated(env, auction_id, admin, old_reserve, new_reserve_price);

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────────────────────

/// Get an auction by ID
pub fn get_auction(env: &Env, auction_id: u64) -> Option<BurnAuction> {
    storage::get_auction(env, auction_id)
}

/// Get the current Dutch auction price
///
/// Returns the price a bidder must pay right now to win the auction.
/// Returns `Err(Error::AuctionNotFound)` if the auction does not exist.
/// Returns `Err(Error::InvalidStateTransition)` if the auction is not open.
pub fn get_current_price(env: &Env, auction_id: u64) -> Result<i128, Error> {
    let auction = storage::get_auction(env, auction_id).ok_or(Error::AuctionNotFound)?;
    if auction.status != AuctionStatus::Open {
        return Err(Error::InvalidStateTransition);
    }
    current_auction_price(env, &auction)
}

/// Get the total number of auctions ever created
pub fn get_auction_count(env: &Env) -> u64 {
    storage::get_auction_count(env)
}

/// Get the number of currently open auctions
pub fn get_open_auction_count(env: &Env) -> u64 {
    storage::get_open_auction_count(env)
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Compute the current Dutch auction price without mutating state
///
/// Price decreases linearly from `start_price` to `reserve_price` over the
/// auction duration. Before the auction starts the price equals `start_price`.
/// After `end_time` the price equals `reserve_price`.
///
/// Formula:
/// ```text
/// elapsed  = clamp(now, start_time, end_time) - start_time
/// duration = end_time - start_time
/// price    = start_price - (start_price - reserve_price) * elapsed / duration
/// ```
pub fn current_auction_price(env: &Env, auction: &BurnAuction) -> Result<i128, Error> {
    let now = env.ledger().timestamp();

    // Before auction starts: full start price
    if now <= auction.start_time {
        return Ok(auction.start_price);
    }

    let effective = if now >= auction.end_time {
        auction.end_time
    } else {
        now
    };

    let elapsed = effective
        .checked_sub(auction.start_time)
        .ok_or(Error::ArithmeticError)? as i128;

    let duration = auction
        .end_time
        .checked_sub(auction.start_time)
        .ok_or(Error::ArithmeticError)? as i128;

    let price_drop = auction
        .start_price
        .checked_sub(auction.reserve_price)
        .ok_or(Error::ArithmeticError)?;

    // price = start_price - price_drop * elapsed / duration
    let discount = price_drop
        .checked_mul(elapsed)
        .ok_or(Error::ArithmeticError)?
        .checked_div(duration)
        .ok_or(Error::ArithmeticError)?;

    let price = auction
        .start_price
        .checked_sub(discount)
        .ok_or(Error::ArithmeticError)?;

    // Clamp to reserve price (guards against rounding below reserve)
    Ok(price.max(auction.reserve_price))
}
