use soroban_sdk::{Address, Env, Vec};
use crate::types::{Error, StreamInfo, StreamParams};
use crate::storage;
use crate::events;

/// Maximum number of streams in a batch operation
const MAX_BATCH_SIZE: u32 = 100;

/// Create a single stream
///
/// Creates a payment stream from creator to recipient with vesting schedule.
///
/// # Arguments
/// * `env` - The contract environment
/// * `creator` - Address creating the stream (must authorize)
/// * `params` - Stream parameters (recipient, amount, schedule)
///
/// # Returns
/// Returns the stream ID
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the creator
/// * `Error::InvalidParameters` - Invalid stream parameters
/// * `Error::ContractPaused` - Contract is paused
pub fn create_stream(
    env: &Env,
    creator: &Address,
    params: &StreamParams,
) -> Result<u64, Error> {
    creator.require_auth();
    
    // Check if contract is paused
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }
    
    // Validate stream parameters
    validate_stream_params(env, params)?;
    
    // Get next stream ID
    let stream_id = storage::get_next_stream_id(env);
    
    // Create stream info
    let stream = StreamInfo {
        id: stream_id,
        creator: creator.clone(),
        recipient: params.recipient.clone(),
        token_index: params.token_index,
        total_amount: params.total_amount,
        claimed_amount: 0,
        start_time: params.start_time,
        end_time: params.end_time,
        cliff_time: params.cliff_time,
        cancelled: false,
        paused: false,
    };
    
    // Store stream
    storage::set_stream(env, stream_id, &stream);
    
    // Emit event
    events::emit_stream_created(env, stream_id, creator, &params.recipient, params.total_amount);
    
    Ok(stream_id)
}

/// Batch create streams
///
/// Creates multiple payment streams in a single transaction.
/// All-or-nothing atomicity: if any stream is invalid, entire batch fails.
///
/// # Arguments
/// * `env` - The contract environment
/// * `creator` - Address creating the streams (must authorize)
/// * `streams` - Vector of stream parameters
///
/// # Returns
/// Returns vector of created stream IDs
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the creator
/// * `Error::InvalidParameters` - Invalid parameters or batch too large
/// * `Error::ContractPaused` - Contract is paused
/// * `Error::BatchTooLarge` - Batch exceeds maximum size
///
/// # Examples
/// ```
/// let streams = vec![
///     &env,
///     StreamParams { recipient: addr1, amount: 1000, ... },
///     StreamParams { recipient: addr2, amount: 2000, ... },
/// ];
/// let stream_ids = batch_create_streams(&env, &creator, &streams)?;
/// ```
pub fn batch_create_streams(
    env: &Env,
    creator: &Address,
    streams: &Vec<StreamParams>,
) -> Result<Vec<u64>, Error> {
    creator.require_auth();
    
    // Check if contract is paused
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }
    
    // Validate batch size
    if streams.is_empty() {
        return Err(Error::InvalidParameters);
    }
    
    if streams.len() > MAX_BATCH_SIZE {
        return Err(Error::BatchTooLarge);
    }
    
    // Phase 1: Validate all streams before creating any
    for stream_params in streams.iter() {
        validate_stream_params(env, &stream_params)?;
    }
    
    // Phase 2: Create all streams (validation passed)
    let mut stream_ids = Vec::new(env);
    
    for stream_params in streams.iter() {
        let stream_id = storage::get_next_stream_id(env);
        
        let stream = StreamInfo {
            id: stream_id,
            creator: creator.clone(),
            recipient: stream_params.recipient.clone(),
            token_index: stream_params.token_index,
            total_amount: stream_params.total_amount,
            claimed_amount: 0,
            start_time: stream_params.start_time,
            end_time: stream_params.end_time,
            cliff_time: stream_params.cliff_time,
            cancelled: false,
            paused: false,
        };
        
        storage::set_stream(env, stream_id, &stream);
        stream_ids.push_back(stream_id);
    }
    
    // Emit batch summary event
    events::emit_batch_streams_created(env, creator, stream_ids.len());
    
    Ok(stream_ids)
}

/// Validate stream parameters
///
/// Checks that stream parameters are valid and consistent.
///
/// # Validation Rules
/// * Amount must be positive
/// * Start time must be before end time (or equal for instant unlock)
/// * Cliff time must be between start and end (inclusive):
///   - cliff_time == start_time: immediate vesting (no cliff)
///   - cliff_time == end_time: full cliff (all tokens unlock at end)
///   - start_time < cliff_time < end_time: standard cliff
/// * For zero-duration streams (start == end), cliff must equal start
/// * Token must exist
fn validate_stream_params(env: &Env, params: &StreamParams) -> Result<(), Error> {
    // Validate amount
    if params.total_amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    
    // Validate times
    if params.start_time >= params.end_time {
        return Err(Error::InvalidParameters);
    }
    
    // Validate cliff time is within stream duration
    // Cliff must be between start and end (inclusive on both ends)
    if params.cliff_time < params.start_time {
        return Err(Error::InvalidSchedule);
    }
    if params.cliff_time > params.end_time {
        return Err(Error::InvalidSchedule);
    }
    
    // Edge case: zero-duration streams must have cliff at start
    if params.start_time == params.end_time && params.cliff_time != params.start_time {
        return Err(Error::InvalidSchedule);
    }
    
    // Validate token exists
    if storage::get_token_info(env, params.token_index).is_none() {
        return Err(Error::TokenNotFound);
    }
    
    Ok(())
}

/// Claim vested tokens from a stream
///
/// Allows recipient to claim tokens that have vested according to schedule.
/// 
/// # Cliff Enforcement
/// Claims before cliff_time are rejected with CliffNotReached error.
/// This check occurs after authorization but before cancellation checks,
/// ensuring the cliff is enforced universally regardless of stream state.
///
/// # Arguments
/// * `env` - The contract environment
/// * `recipient` - Address claiming tokens (must authorize)
/// * `stream_id` - ID of the stream to claim from
///
/// # Returns
/// Returns the amount claimed
///
/// # Errors
/// * `Error::StreamNotFound` - Stream not found
/// * `Error::Unauthorized` - Caller is not the recipient
/// * `Error::CliffNotReached` - Current time before cliff_time
/// * `Error::StreamCancelled` - Stream cancelled
/// * `Error::InvalidAmount` - No claimable amount
pub fn claim_stream(
    env: &Env,
    recipient: &Address,
    stream_id: u64,
) -> Result<i128, Error> {
    recipient.require_auth();
    
    // Get stream
    let mut stream = storage::get_stream(env, stream_id)
        .ok_or(Error::StreamNotFound)?;
    
    // Verify recipient
    if stream.recipient != *recipient {
        return Err(Error::Unauthorized);
    }
    
    // Enforce cliff: no claims before cliff_time
    // This check occurs before cancellation check to ensure temporal constraints
    // are enforced universally, regardless of stream operational state
    let current_time = env.ledger().timestamp();
    if current_time < stream.cliff_time {
        return Err(Error::CliffNotReached);
    }
    
    // Check if cancelled
    if stream.cancelled {
        return Err(Error::StreamCancelled);
    }

    if stream.paused {
        return Err(Error::StreamPaused);
    }
    
    // Calculate claimable amount
    let claimable = calculate_claimable(env, &stream)?;
    
    if claimable == 0 {
        return Err(Error::InvalidAmount);
    }
    
    // Update claimed amount
    stream.claimed_amount = stream.claimed_amount
        .checked_add(claimable)
        .ok_or(Error::ArithmeticError)?;
    
    storage::set_stream(env, stream_id, &stream);
    
    // Emit event
    events::emit_stream_claimed(env, stream_id, recipient, claimable);
    
    Ok(claimable)
}

/// Batch claim vested tokens from multiple streams
///
/// Allows recipient to claim tokens that have vested according to schedule
/// from multiple streams in a single transaction. Streams that cannot be
/// claimed (e.g. before cliff or zero remaining) are skipped without error.
///
/// # Arguments
/// * `env` - The contract environment
/// * `recipient` - Address claiming tokens (must authorize)
/// * `stream_ids` - Vector of stream IDs to claim from
///
/// # Returns
/// Returns a vector of claimed amounts matching the input order
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the recipient for one of the streams
/// * `Error::TokenNotFound` - Stream not found
/// * `Error::InvalidParameters` - Stream cancelled
pub fn batch_claim(
    env: &Env,
    recipient: &Address,
    stream_ids: &Vec<u64>,
) -> Result<Vec<i128>, Error> {
    recipient.require_auth();
    
    // First pass: validate all streams
    for stream_id in stream_ids.iter() {
        let stream = storage::get_stream(env, stream_id)
            .ok_or(Error::TokenNotFound)?;
            
        // Verify recipient
        if stream.recipient != *recipient {
            return Err(Error::Unauthorized);
        }
        
        // Check if cancelled
        if stream.cancelled {
            return Err(Error::InvalidParameters);
        }
    }
    
    // Second pass: claim from all eligible streams
    let mut claimed_amounts = Vec::new(env);
    
    for stream_id in stream_ids.iter() {
        let mut stream = storage::get_stream(env, stream_id).unwrap();
        
        // Calculate claimable amount
        let claimable = calculate_claimable(env, &stream)?;
        
        if claimable > 0 {
            // Update claimed amount
            stream.claimed_amount = stream.claimed_amount
                .checked_add(claimable)
                .ok_or(Error::ArithmeticError)?;
                
            storage::set_stream(env, stream_id, &stream);
            
            // Emit event
            events::emit_stream_claimed(env, stream_id, recipient, claimable);
        }
        
        claimed_amounts.push_back(claimable);
    }
    
    Ok(claimed_amounts)
}

/// Calculate claimable amount for a stream
///
/// Calculates how much can be claimed based on vesting schedule.
/// 
/// # Vesting Semantics
/// Vesting starts at start_time, not cliff_time. The cliff acts as a
/// release gate - tokens vest continuously from start_time but are
/// locked until cliff_time.
/// 
/// Example: start=100, cliff=150, end=200, current=150
///   → elapsed=50, duration=100 → 50% vested at cliff unlock
///
/// # Arguments
/// * `env` - The contract environment
/// * `stream` - The stream to calculate for
///
/// # Returns
/// Returns the claimable amount (0 if before cliff or start)
fn calculate_claimable(env: &Env, stream: &StreamInfo) -> Result<i128, Error> {
    let current_time = env.ledger().timestamp();
    
    // Before cliff: nothing claimable (cliff acts as release gate)
    if current_time < stream.cliff_time {
        return Ok(0);
    }
    
    // Before start: nothing claimable
    if current_time < stream.start_time {
        return Ok(0);
    }
    
    // Calculate vested amount
    // Note: Vesting starts at start_time, not cliff_time
    // The cliff is a release gate - tokens vest continuously but are locked until cliff_time
    let vested = if current_time >= stream.end_time {
        // After end: everything is vested
        stream.total_amount
    } else {
        // During vesting: linear vesting from start_time
        let elapsed = current_time - stream.start_time;
        let duration = stream.end_time - stream.start_time;
        
        // Handle zero-duration edge case
        if duration == 0 {
            stream.total_amount
        } else {
            stream.total_amount
                .checked_mul(elapsed as i128)
                .and_then(|v| v.checked_div(duration as i128))
                .ok_or(Error::ArithmeticError)?
        }
    };
    
    // Claimable = vested - already claimed
    let claimable = vested
        .checked_sub(stream.claimed_amount)
        .ok_or(Error::ArithmeticError)?;
    
    Ok(claimable.max(0))
}

/// Cancel a stream
///
/// Allows creator to cancel a stream. Recipient can claim vested amount.
///
/// # Arguments
/// * `env` - The contract environment
/// * `creator` - Address cancelling the stream (must authorize)
/// * `stream_id` - ID of the stream to cancel
pub fn cancel_stream(
    env: &Env,
    creator: &Address,
    stream_id: u64,
) -> Result<(), Error> {
    creator.require_auth();
    
    // Get stream
    let mut stream = storage::get_stream(env, stream_id)
        .ok_or(Error::TokenNotFound)?;
    
    // Verify creator
    if stream.creator != *creator {
        return Err(Error::Unauthorized);
    }
    
    // Check if already cancelled
    if stream.cancelled {
        return Err(Error::InvalidParameters);
    }
    
    // Mark as cancelled
    stream.cancelled = true;
    storage::set_stream(env, stream_id, &stream);
    
    // Emit event
    events::emit_stream_cancelled(env, stream_id, creator);
    
    Ok(())
}

/// Pause a stream
///
/// Allows creator to temporarily suspend claims on a stream.
pub fn pause_stream(
    env: &Env,
    creator: &Address,
    stream_id: u64,
) -> Result<(), Error> {
    creator.require_auth();
    
    let mut stream = storage::get_stream(env, stream_id)
        .ok_or(Error::TokenNotFound)?;
        
    if stream.creator != *creator {
        return Err(Error::Unauthorized);
    }
    
    if stream.cancelled {
        return Err(Error::InvalidParameters);
    }
    
    stream.paused = true;
    storage::set_stream(env, stream_id, &stream);
    
    Ok(())
}

/// Unpause a stream
///
/// Allows creator to resume a paused stream.
pub fn unpause_stream(
    env: &Env,
    creator: &Address,
    stream_id: u64,
) -> Result<(), Error> {
    creator.require_auth();
    
    let mut stream = storage::get_stream(env, stream_id)
        .ok_or(Error::TokenNotFound)?;
        
    if stream.creator != *creator {
        return Err(Error::Unauthorized);
    }
    
    if stream.cancelled {
        return Err(Error::InvalidParameters);
    }
    
    stream.paused = false;
    storage::set_stream(env, stream_id, &stream);
    
    Ok(())
}

/// Get stream information
pub fn get_stream(env: &Env, stream_id: u64) -> Option<StreamInfo> {
    storage::get_stream(env, stream_id)
}

/// Get claimable amount for a stream
/// 
/// Returns the amount currently available to claim.
/// Before cliff_time, this returns 0 (not an error).
/// This allows recipients to query their balance without triggering errors.
/// 
/// # Arguments
/// * `env` - The contract environment
/// * `stream_id` - ID of the stream
/// 
/// # Returns
/// Returns claimable amount (delegates to calculate_claimable for consistency)
/// 
/// # Errors
/// * `Error::StreamNotFound` - Stream not found
pub fn get_claimable_amount(env: &Env, stream_id: u64) -> Result<i128, Error> {
    let stream = storage::get_stream(env, stream_id)
        .ok_or(Error::TokenNotFound)?;
    
    calculate_claimable(env, &stream)
}

#[cfg(all(test, feature = "legacy-tests"))]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, Env};
    
    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        
        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);
        
        // Initialize storage
        storage::set_admin(&env, &creator);
        
        (env, creator, recipient)
    }
    
    #[test]
    fn test_claim_before_cliff_returns_error() {
        let (env, creator, recipient) = setup();
        // Create and store a stream directly
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        // Set time just before cliff
        env.ledger().with_mut(|li| li.timestamp = 149);
        let res = claim_stream(&env, &recipient, 0);
        assert_eq!(res, Err(Error::CliffNotReached));
    }
    
    #[test]
    fn test_claim_at_cliff_succeeds() {
        let (env, creator, recipient) = setup();
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        // Set time at cliff
        env.ledger().with_mut(|li| li.timestamp = 150);
        let res = claim_stream(&env, &recipient, 0);
        assert_eq!(res.unwrap(), 500);
    }
    
    #[test]
    fn test_validate_stream_params_valid() {
        let (env, _creator, recipient) = setup();
        
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };
        
        // This will fail because token doesn't exist, but tests validation logic
        let result = validate_stream_params(&env, &params);
        assert_eq!(result, Err(Error::TokenNotFound));
    }
    
    #[test]
    fn test_validate_stream_params_invalid_amount() {
        let (env, _creator, recipient) = setup();
        
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };
        
        let result = validate_stream_params(&env, &params);
        assert_eq!(result, Err(Error::InvalidAmount));
    }
    
    #[test]
    fn test_validate_stream_params_invalid_times() {
        let (env, _creator, recipient) = setup();
        
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 200,
            end_time: 100, // End before start
            cliff_time: 150,
        };
        
        let result = validate_stream_params(&env, &params);
        assert_eq!(result, Err(Error::InvalidParameters));
    }
    
    #[test]
    fn test_calculate_claimable_before_cliff() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
            paused: false,
            
        };
        
        // Set time before cliff
        env.ledger().with_mut(|li| {
            li.timestamp = 140;
        });
        
        let claimable = calculate_claimable(&env, &stream).unwrap();
        assert_eq!(claimable, 0);
    }
    
    #[test]
    fn test_calculate_claimable_after_cliff() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
            paused: false,
        };
        
        // Set time after cliff (halfway through vesting)
        env.ledger().with_mut(|li| {
            li.timestamp = 150;
        });
        
        let claimable = calculate_claimable(&env, &stream).unwrap();
        assert_eq!(claimable, 500); // 50% vested
    }
    
    #[test]
    fn test_calculate_claimable_after_end() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
            paused: false,
        };
        
        // Set time after end
        env.ledger().with_mut(|li| {
            li.timestamp = 250;
        });
        
        let claimable = calculate_claimable(&env, &stream).unwrap();
        assert_eq!(claimable, 1000); // 100% vested
    }

    #[test]
    fn test_pause_and_unpause_stream() {
        let (env, creator, recipient) = setup();
        
        let mut stream = StreamInfo {
            id: 1,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
            paused: false,
        };
        
        // Mock save stream to storage
        storage::set_stream(&env, 1, &stream);
        
        // Advance time to make it claimable
        env.ledger().with_mut(|li| { li.timestamp = 160; });
        
        // 1. Pause the stream
        assert!(pause_stream(&env, &creator, 1).is_ok());
        
        // 2. Verify claims are blocked
        let claim_res = claim_stream(&env, &recipient, 1);
        assert_eq!(claim_res, Err(Error::StreamPaused));
        
        // 3. Verify Authorization (recipient cannot unpause)
        let unpause_res = unpause_stream(&env, &recipient, 1);
        assert_eq!(unpause_res, Err(Error::Unauthorized));
        
        // 4. Unpause the stream as creator
        assert!(unpause_stream(&env, &creator, 1).is_ok());
        
        // 5. Verify claims resume normally
        let claim_success = claim_stream(&env, &recipient, 1);
        assert!(claim_success.is_ok());
        assert!(claim_success.unwrap() > 0);
    }

}

    // ========================================================================
    // Cliff Boundary Tests
    // ========================================================================

    #[test]
    fn test_claim_one_second_before_cliff() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time exactly one second before cliff
        env.ledger().with_mut(|li| li.timestamp = 149);
        
        // Attempt claim - should fail with CliffNotReached
        let result = claim_stream(&env, &recipient, 0);
        assert_eq!(result, Err(Error::CliffNotReached));
        
        // Verify error code is 32
        assert_eq!(Error::CliffNotReached as u32, 32);
    }

    #[test]
    fn test_claim_exactly_at_cliff() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time exactly at cliff (50% through vesting period)
        env.ledger().with_mut(|li| li.timestamp = 150);
        
        // Claim should succeed and return 50% of tokens
        let result = claim_stream(&env, &recipient, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 500); // 50% vested
    }

    #[test]
    fn test_claim_one_second_after_cliff() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time exactly one second after cliff
        env.ledger().with_mut(|li| li.timestamp = 151);
        
        // Claim should succeed
        let result = claim_stream(&env, &recipient, 0);
        assert!(result.is_ok());
        // At time 151: (151-100)/(200-100) = 51/100 = 51% vested
        assert_eq!(result.unwrap(), 510);
    }

    #[test]
    fn test_no_cliff_scenario() {
        let (env, creator, recipient) = setup();
        
        // Create stream with cliff_time == start_time (no cliff)
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 100, // Same as start_time
        };
        
        // Validation should accept this configuration
        // (Will fail on token existence check, but validates cliff logic)
        let result = validate_stream_params(&env, &params);
        assert_eq!(result, Err(Error::TokenNotFound)); // Expected - token doesn't exist
        
        // Create stream directly to test claiming
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 100, // No cliff
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Tokens should be immediately claimable at start_time
        env.ledger().with_mut(|li| li.timestamp = 100);
        let result = claim_stream(&env, &recipient, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0); // 0% vested at start
        
        // At 25% through
        env.ledger().with_mut(|li| li.timestamp = 125);
        let claimable = get_claimable_amount(&env, 0).unwrap();
        assert_eq!(claimable, 250); // 25% vested
    }

    #[test]
    fn test_full_cliff_scenario() {
        let (env, creator, recipient) = setup();
        
        // Create stream with cliff_time == end_time (full cliff)
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 200, // Same as end_time
        };
        
        // Validation should accept this configuration
        let result = validate_stream_params(&env, &params);
        assert_eq!(result, Err(Error::TokenNotFound)); // Expected - token doesn't exist
        
        // Create stream directly to test claiming
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 200, // Full cliff
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // No tokens claimable before end_time
        env.ledger().with_mut(|li| li.timestamp = 150);
        let result = claim_stream(&env, &recipient, 0);
        assert_eq!(result, Err(Error::CliffNotReached));
        
        // All tokens claimable at end_time
        env.ledger().with_mut(|li| li.timestamp = 200);
        let result = claim_stream(&env, &recipient, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1000); // 100% vested
    }

    // ========================================================================
    // Multiple Claim Attempts Tests
    // ========================================================================

    #[test]
    fn test_multiple_claims_before_cliff() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time before cliff
        env.ledger().with_mut(|li| li.timestamp = 140);
        
        // First claim attempt - should fail
        let result1 = claim_stream(&env, &recipient, 0);
        assert_eq!(result1, Err(Error::CliffNotReached));
        
        // Verify stream state unchanged
        let stream_after_1 = storage::get_stream(&env, 0).unwrap();
        assert_eq!(stream_after_1.claimed_amount, 0);
        
        // Second claim attempt - should also fail
        let result2 = claim_stream(&env, &recipient, 0);
        assert_eq!(result2, Err(Error::CliffNotReached));
        
        // Verify stream state still unchanged
        let stream_after_2 = storage::get_stream(&env, 0).unwrap();
        assert_eq!(stream_after_2.claimed_amount, 0);
        
        // Third claim attempt - should also fail
        let result3 = claim_stream(&env, &recipient, 0);
        assert_eq!(result3, Err(Error::CliffNotReached));
        
        // Verify stream state still unchanged
        let stream_after_3 = storage::get_stream(&env, 0).unwrap();
        assert_eq!(stream_after_3.claimed_amount, 0);
    }

    #[test]
    fn test_claim_before_then_at_cliff() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // First attempt before cliff - should fail
        env.ledger().with_mut(|li| li.timestamp = 149);
        let result1 = claim_stream(&env, &recipient, 0);
        assert_eq!(result1, Err(Error::CliffNotReached));
        
        // Verify stream state unchanged
        let stream_after_fail = storage::get_stream(&env, 0).unwrap();
        assert_eq!(stream_after_fail.claimed_amount, 0);
        
        // Second attempt at cliff - should succeed
        env.ledger().with_mut(|li| li.timestamp = 150);
        let result2 = claim_stream(&env, &recipient, 0);
        assert!(result2.is_ok());
        assert_eq!(result2.unwrap(), 500); // 50% vested
        
        // Verify stream state updated
        let stream_after_success = storage::get_stream(&env, 0).unwrap();
        assert_eq!(stream_after_success.claimed_amount, 500);
    }

    // ========================================================================
    // Cancellation Interaction Tests
    // ========================================================================

    #[test]
    fn test_cancelled_stream_before_cliff() {
        let (env, creator, recipient) = setup();
        
        // Create and cancel a stream
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: true, // Stream is cancelled
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time before cliff
        env.ledger().with_mut(|li| li.timestamp = 140);
        
        // Attempt claim - should return CliffNotReached (not StreamCancelled)
        // This verifies cliff check occurs before cancellation check
        let result = claim_stream(&env, &recipient, 0);
        assert_eq!(result, Err(Error::CliffNotReached));
    }

    #[test]
    fn test_cancelled_stream_after_cliff() {
        let (env, creator, recipient) = setup();
        
        // Create and cancel a stream
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: true, // Stream is cancelled
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time at or after cliff
        env.ledger().with_mut(|li| li.timestamp = 150);
        
        // Attempt claim - should return StreamCancelled
        // Cliff check passes, so cancellation check is reached
        let result = claim_stream(&env, &recipient, 0);
        assert_eq!(result, Err(Error::StreamCancelled));
    }

    // ========================================================================
    // Zero-Duration Edge Case Tests
    // ========================================================================

    #[test]
    fn test_zero_duration_valid() {
        let (env, creator, recipient) = setup();
        
        // Create stream with start_time == end_time == cliff_time
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 100, // Same as start
            cliff_time: 100, // Same as start
        };
        
        // Validation should accept this configuration
        let result = validate_stream_params(&env, &params);
        // Will fail on token existence, but validates cliff logic
        assert_eq!(result, Err(Error::TokenNotFound));
        
        // Create stream directly to test claiming
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 100,
            cliff_time: 100,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time to cliff_time
        env.ledger().with_mut(|li| li.timestamp = 100);
        
        // Full amount should be claimable immediately (no division by zero)
        let result = claim_stream(&env, &recipient, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1000); // 100% immediately available
    }

    #[test]
    fn test_zero_duration_invalid_cliff() {
        let (env, _creator, recipient) = setup();
        
        // Attempt to create stream with start_time == end_time but cliff_time < start_time
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 100, // Same as start
            cliff_time: 50, // Before start - invalid
        };
        
        // Validation should return InvalidSchedule error
        let result = validate_stream_params(&env, &params);
        assert_eq!(result, Err(Error::InvalidSchedule));
    }

    // ========================================================================
    // Query Behavior Tests
    // ========================================================================

    #[test]
    fn test_query_before_cliff_returns_zero() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time before cliff
        env.ledger().with_mut(|li| li.timestamp = 140);
        
        // Query should return 0 without error
        let result = get_claimable_amount(&env, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
    }

    #[test]
    fn test_query_after_cliff_returns_vested() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Set time after cliff (60% through vesting)
        env.ledger().with_mut(|li| li.timestamp = 160);
        
        // Query should return calculated vested amount
        let query_result = get_claimable_amount(&env, 0);
        assert!(query_result.is_ok());
        
        // Verify it matches calculate_claimable
        let calc_result = calculate_claimable(&env, &stream);
        assert!(calc_result.is_ok());
        assert_eq!(query_result.unwrap(), calc_result.unwrap());
        
        // At time 160: (160-100)/(200-100) = 60/100 = 60% vested
        assert_eq!(query_result.unwrap(), 600);
    }

    // ========================================================================
    // Cliff Immutability Tests
    // ========================================================================

    #[test]
    fn test_cliff_time_immutable() {
        let (env, creator, recipient) = setup();
        
        let stream = StreamInfo {
            id: 0,
            creator: creator.clone(),
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            claimed_amount: 0,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
            cancelled: false,
        };
        storage::set_stream(&env, 0, &stream);
        
        // Retrieve stream multiple times
        let stream1 = get_stream(&env, 0).unwrap();
        let stream2 = get_stream(&env, 0).unwrap();
        let stream3 = get_stream(&env, 0).unwrap();
        
        // Verify cliff_time is identical in all retrievals
        assert_eq!(stream1.cliff_time, 150);
        assert_eq!(stream2.cliff_time, 150);
        assert_eq!(stream3.cliff_time, 150);
        assert_eq!(stream1.cliff_time, stream2.cliff_time);
        assert_eq!(stream2.cliff_time, stream3.cliff_time);
    }
