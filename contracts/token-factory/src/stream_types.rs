use soroban_sdk::{contracttype, Address, String, Vec};
use crate::types::{Error, PaginationCursor};

/// Stream information with optional metadata
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamInfo {
    pub id: u32,
    pub creator: Address,
    pub recipient: Address,
    pub token_index: u32,
    pub amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub claimed_amount: i128,
    pub metadata: Option<String>,
    pub created_at: u64,
    pub claimed: bool,
    pub paused: bool,
    pub cancelled: bool,
}

/// Metadata update request - only metadata can be changed
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataUpdate {
    pub stream_id: u32,
    pub new_metadata: Option<String>,
}

/// Paginated stream result
///
/// Contains a page of streams and a cursor for fetching the next page.
///
/// # Fields
/// * `streams` - Vector of stream info for this page
/// * `cursor` - Cursor for next page (None = no more results)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaginatedStreams {
    pub streams: Vec<StreamInfo>,
    pub cursor: Option<PaginationCursor>,
}

/// Validate stream metadata length (max 512 chars)
/// 
/// # Validation Rules
/// - None value: Always valid (metadata is optional)
/// - Empty string: Invalid (returns Error::InvalidParameters)
/// - 1-512 characters: Valid
/// - >512 characters: Invalid (returns Error::InvalidParameters)
pub fn validate_metadata(metadata: &Option<String>) -> Result<(), Error> {
    if let Some(meta) = metadata {
        let len = meta.len();
        if len == 0 || len > 512 {
            return Err(Error::InvalidParameters);
        }
    }
    Ok(())
}

/// Validate that financial terms remain immutable
/// 
/// This function ensures that critical financial parameters cannot be modified
/// after stream creation. It's used to enforce the invariant that amount and
/// schedule are locked once a stream is created.
/// 
/// # Parameters
/// - `original`: The original stream info at creation time
/// - `updated`: The proposed updated stream info
/// 
/// # Returns
/// - Ok(()) if financial terms are unchanged
/// - Err(Error::InvalidParameters) if any financial term differs
pub fn validate_financial_invariants(
    original: &StreamInfo,
    updated: &StreamInfo,
) -> Result<(), Error> {
    // Verify immutable financial terms
    if original.amount != updated.amount {
        return Err(Error::InvalidParameters);
    }
    
    if original.creator != updated.creator {
        return Err(Error::InvalidParameters);
    }
    
    if original.recipient != updated.recipient {
        return Err(Error::InvalidParameters);
    }
    
    if original.created_at != updated.created_at {
        return Err(Error::InvalidParameters);
    }
    
    if original.id != updated.id {
        return Err(Error::InvalidParameters);
    }
    
    if original.token_index != updated.token_index {
        return Err(Error::InvalidParameters);
    }
    
    if original.start_time != updated.start_time {
        return Err(Error::InvalidParameters);
    }
    
    if original.end_time != updated.end_time {
        return Err(Error::InvalidParameters);
    }
    
    if original.claimed_amount != updated.claimed_amount {
        return Err(Error::InvalidParameters);
    }
    
    Ok(())
}

/// Calculate claimable amount for a stream at current time
/// 
/// This is a pure calculation function that computes how much can be claimed
/// based on the stream's vesting schedule. It uses linear vesting between
/// start_time and end_time.
/// 
/// # Parameters
/// - `stream`: The stream information
/// - `current_time`: The current ledger timestamp
/// 
/// # Returns
/// The amount that can be claimed (vested amount - already claimed amount)
/// 
/// # Vesting Logic
/// - Before start_time: 0 claimable
/// - At start_time: 0 claimable (vesting starts after start_time)
/// - Between start and end: Linear vesting proportional to elapsed time
/// - At or after end_time: Full amount claimable
/// 
/// # Formula
/// ```
/// vested = (amount * elapsed_time) / total_duration
/// claimable = vested - claimed_amount
/// ```
pub fn calculate_claimable_amount(stream: &StreamInfo, current_time: u64) -> i128 {
    // Before or at start time: nothing vested yet
    if current_time <= stream.start_time {
        return 0;
    }
    
    // After end time: everything is vested
    if current_time >= stream.end_time {
        let vested = stream.amount;
        let claimable = vested.saturating_sub(stream.claimed_amount);
        return claimable.max(0);
    }
    
    // During vesting period: linear vesting
    let elapsed = current_time.saturating_sub(stream.start_time);
    let duration = stream.end_time.saturating_sub(stream.start_time);
    
    // Avoid division by zero
    if duration == 0 {
        return 0;
    }
    
    // Calculate vested amount: (amount * elapsed) / duration
    // Use checked arithmetic to prevent overflow
    let vested = stream.amount
        .saturating_mul(elapsed as i128)
        .saturating_div(duration as i128);
    
    // Claimable = vested - already claimed
    let claimable = vested.saturating_sub(stream.claimed_amount);
    claimable.max(0)
}
