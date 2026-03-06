use soroban_sdk::{Address, Env, Vec};
use crate::types::{Error, PaginatedTokens, TokenInfo};
use crate::storage;
use crate::types::{PaginatedProposals, Proposal, ActionType};

/// Maximum number of tokens per page
const MAX_PAGE_SIZE: u32 = 100;

/// Default page size if not specified
const DEFAULT_PAGE_SIZE: u32 = 20;

/// Get tokens created by a specific address with pagination
///
/// Returns a paginated list of tokens created by the specified address.
/// Results are ordered by token creation order (token index).
///
/// # Arguments
/// * `env` - The contract environment
/// * `creator` - Address of the token creator
/// * `cursor` - Optional cursor for pagination (None = start from beginning)
/// * `limit` - Maximum number of tokens to return (capped at MAX_PAGE_SIZE)
///
/// # Returns
/// Returns `PaginatedTokens` containing:
/// - `tokens`: Vector of TokenInfo for this page
/// - `cursor`: Optional cursor for next page (None = no more results)
///
/// # Cursor Semantics
/// - Cursor contains `next_index` which is the position in the creator's token list
/// - Cursors are deterministic and stable across calls
/// - Empty cursor (None) starts from the beginning
/// - Returned cursor of None indicates end of results
///
/// # Examples
/// ```
/// // First page
/// let page1 = factory.get_tokens_by_creator(&env, creator, None, 20)?;
/// 
/// // Next page
/// if let Some(cursor) = page1.cursor {
///     let page2 = factory.get_tokens_by_creator(&env, creator, Some(cursor), 20)?;
/// }
/// ```
pub fn get_tokens_by_creator(
    env: &Env,
    creator: &Address,
    cursor: Option<u32>,
    limit: Option<u32>,
) -> Result<PaginatedTokens, Error> {
    // Validate and cap limit
    let page_size = limit
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .min(MAX_PAGE_SIZE)
        .max(1); // At least 1
    
    // Get all token indices for this creator
    let creator_tokens = storage::get_creator_tokens(env, creator);
    
    // Determine starting position
    let start_pos = cursor.unwrap_or(0);
    
    // Check if we're past the end
    if start_pos >= creator_tokens.len() {
        return Ok(PaginatedTokens {
            tokens: Vec::new(env),
            cursor: None,
        });
    }
    
    // Collect tokens for this page
    let mut tokens = Vec::new(env);
    let mut count = 0_u32;
    let mut current_pos = start_pos;
    
    while count < page_size && current_pos < creator_tokens.len() {
        let token_index = creator_tokens.get(current_pos).unwrap();
        
        if let Some(token_info) = storage::get_token_info(env, token_index) {
            tokens.push_back(token_info);
            count += 1;
        }
        
        current_pos += 1;
    }
    
    // Determine next cursor
    let next_cursor = if current_pos < creator_tokens.len() {
        Some(current_pos)
    } else {
        None
    };
    
    Ok(PaginatedTokens {
        tokens,
        cursor: next_cursor,
    })
}

/// Get the total number of tokens created by an address
///
/// Returns the count without fetching the actual token data.
///
/// # Arguments
/// * `env` - The contract environment
/// * `creator` - Address of the token creator
///
/// # Returns
/// Returns the number of tokens created by this address
pub fn get_creator_token_count(env: &Env, creator: &Address) -> u32 {
    storage::get_creator_token_count(env, creator)
}

/// Get streams for a specific token with pagination
///
/// Returns a paginated list of streams associated with the specified token.
/// Results are ordered by stream creation order (stream ID ascending).
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_index` - Index of the token
/// * `cursor` - Optional cursor for pagination (None = start from beginning)
/// * `limit` - Maximum number of streams to return (capped at MAX_PAGE_SIZE)
///
/// # Returns
/// Returns `PaginatedStreams` containing:
/// - `streams`: Vector of StreamInfo for this page
/// - `cursor`: Optional cursor for next page (None = no more results)
///
/// # Errors
/// Returns `Error::TokenNotFound` if the token_index does not exist
///
/// # Cursor Semantics
/// - Cursor contains `next_index` which is the position in the token's stream list
/// - Cursors are deterministic and stable across calls
/// - Empty cursor (None) starts from the beginning
/// - Returned cursor of None indicates end of results
///
/// # Examples
/// ```
/// // First page
/// let page1 = factory.get_streams_by_token(&env, token_index, None, Some(20))?;
/// 
/// // Next page
/// if let Some(cursor) = page1.cursor {
///     let page2 = factory.get_streams_by_token(&env, token_index, Some(cursor), Some(20))?;
/// }
/// 
/// // Get total count
/// let total = factory.get_stream_count_by_token(&env, token_index)?;
/// ```
pub fn get_streams_by_token(
    env: &Env,
    token_index: u32,
    cursor: Option<PaginationCursor>,
    limit: Option<u32>,
) -> Result<PaginatedStreams, Error> {
    // Validate token exists
    if storage::get_token_info(env, token_index).is_none() {
        return Err(Error::TokenNotFound);
    }
    
    // Validate and cap limit
    let page_size = limit
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .min(MAX_PAGE_SIZE)
        .max(1); // At least 1
    
    // Get all stream IDs for this token
    let stream_ids = storage::get_token_streams(env, token_index);
    
    // Determine starting position
    let start_pos = cursor
        .as_ref()
        .and_then(|c| c.next_index)
        .unwrap_or(0);
    
    // Check if we're past the end
    if start_pos >= stream_ids.len() {
        return Ok(PaginatedStreams {
            streams: Vec::new(env),
            cursor: None,
        });
    }
    
    // Collect streams for this page
    let mut streams = Vec::new(env);
    let mut count = 0_u32;
    let mut current_pos = start_pos;
    
    while count < page_size && current_pos < stream_ids.len() {
        let stream_id = stream_ids.get(current_pos).unwrap();
        
        // TODO: Load actual StreamInfo from storage
        // For now, create a placeholder - this will be replaced when stream storage is implemented
        let stream_info = StreamInfo {
            id: stream_id,
            creator: Address::generate(env),
            recipient: Address::generate(env),
            amount: 0,
            metadata: None,
            created_at: env.ledger().timestamp(),
        };
        
        streams.push_back(stream_info);
        count += 1;
        current_pos += 1;
    }
    
    // Determine next cursor
    let next_cursor = if current_pos < stream_ids.len() {
        Some(PaginationCursor {
            next_index: Some(current_pos),
        })
    } else {
        None
    };
    
    Ok(PaginatedStreams {
        streams,
        cursor: next_cursor,
    })
}

/// Get the total number of streams for a token
///
/// Returns the count without loading stream data.
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_index` - Index of the token
///
/// # Returns
/// Returns the number of streams for this token
///
/// # Errors
/// Returns `Error::TokenNotFound` if the token_index does not exist
pub fn get_stream_count_by_token(
    env: &Env,
    token_index: u32,
) -> Result<u32, Error> {
    // Validate token exists
    if storage::get_token_info(env, token_index).is_none() {
        return Err(Error::TokenNotFound);
    }
    
    Ok(storage::get_token_stream_count(env, token_index))
}

/// Get governance proposals with pagination
///
/// Returns a paginated list of proposals.
/// Results are ordered deterministically by proposal ID ascending.
///
/// # Arguments
/// * `env` - The contract environment
/// * `cursor` - Optional cursor for pagination (None = start from beginning)
/// * `limit` - Maximum number of proposals to return (capped at MAX_PAGE_SIZE)
///
/// # Returns
/// Returns `PaginatedProposals` containing:
/// - `proposals`: Vector of Proposal for this page
/// - `cursor`: Optional cursor for next page (None = no more results)
pub fn get_proposals_page(
    env: &Env,
    cursor: Option<u64>,
    limit: Option<u32>,
) -> Result<PaginatedProposals, Error> {
    // Validate and cap limit
    let page_size = limit
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .min(MAX_PAGE_SIZE)
        .max(1);
    
    // Total proposals are tracked by the NextProposalId which corresponds to the count
    let total_proposals = storage::get_proposal_count(env) as u64;
    
    // Determine starting position
    let start_pos = cursor.unwrap_or(0);
    
    // Check if we're past the end
    if start_pos >= total_proposals {
        return Ok(PaginatedProposals {
            proposals: Vec::new(env),
            cursor: None,
        });
    }
    
    // Collect proposals for this page
    let mut proposals = Vec::new(env);
    let mut count = 0_u32;
    let mut current_pos = start_pos;
    
    while count < page_size && current_pos < total_proposals {
        if let Some(proposal) = storage::get_proposal(env, current_pos) {
            proposals.push_back(proposal);
            count += 1;
        }
        
        current_pos += 1;
    }
    
    // Determine next cursor
    let next_cursor = if current_pos < total_proposals {
        Some(current_pos)
    } else {
        None
    };
    
    Ok(PaginatedProposals {
        proposals,
        cursor: next_cursor,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};
    
    fn setup_with_tokens(token_count: u32) -> (Env, Address) {
        let env = Env::default();
        let creator = Address::generate(&env);
        
        // Create mock tokens
        for i in 0..token_count {
            let token_info = TokenInfo {
                address: Address::generate(&env),
                creator: creator.clone(),
                name: soroban_sdk::String::from_str(&env, "Test Token"),
                symbol: soroban_sdk::String::from_str(&env, "TST"),
                decimals: 7,
                total_supply: 1_000_000,
                initial_supply: 1_000_000,
                max_supply: None,
                total_burned: 0,
                burn_count: 0,
                metadata_uri: None,
                created_at: env.ledger().timestamp(),
                clawback_enabled: false,
            };
            
            storage::set_token_info(&env, i, &token_info);
            storage::add_creator_token(&env, &creator, i);
        }
        
        (env, creator)
    }
    
    #[test]
    fn test_get_tokens_first_page() {
        let (env, creator) = setup_with_tokens(50);
        
        let result = get_tokens_by_creator(&env, &creator, None, Some(20)).unwrap();
        
        assert_eq!(result.tokens.len(), 20);
        assert!(result.cursor.is_some());
    }
    
    #[test]
    fn test_get_tokens_pagination() {
        let (env, creator) = setup_with_tokens(50);
        
        // First page
        let page1 = get_tokens_by_creator(&env, &creator, None, Some(20)).unwrap();
        assert_eq!(page1.tokens.len(), 20);
        assert!(page1.cursor.is_some());
        
        // Second page
        let page2 = get_tokens_by_creator(&env, &creator, page1.cursor, Some(20)).unwrap();
        assert_eq!(page2.tokens.len(), 20);
        assert!(page2.cursor.is_some());
        
        // Third page (last 10)
        let page3 = get_tokens_by_creator(&env, &creator, page2.cursor, Some(20)).unwrap();
        assert_eq!(page3.tokens.len(), 10);
        assert!(page3.cursor.is_none()); // No more results
    }
    
    #[test]
    fn test_get_tokens_empty_results() {
        let env = Env::default();
        let creator = Address::generate(&env);
        
        let result = get_tokens_by_creator(&env, &creator, None, Some(20)).unwrap();
        
        assert_eq!(result.tokens.len(), 0);
        assert!(result.cursor.is_none());
    }
    
    #[test]
    fn test_get_tokens_single_token() {
        let (env, creator) = setup_with_tokens(1);
        
        let result = get_tokens_by_creator(&env, &creator, None, Some(20)).unwrap();
        
        assert_eq!(result.tokens.len(), 1);
        assert!(result.cursor.is_none());
    }
    
    #[test]
    fn test_get_tokens_exact_page_size() {
        let (env, creator) = setup_with_tokens(20);
        
        let result = get_tokens_by_creator(&env, &creator, None, Some(20)).unwrap();
        
        assert_eq!(result.tokens.len(), 20);
        assert!(result.cursor.is_none()); // Exactly one page
    }
    
    #[test]
    fn test_get_tokens_max_limit_enforced() {
        let (env, creator) = setup_with_tokens(200);
        
        // Request more than MAX_PAGE_SIZE
        let result = get_tokens_by_creator(&env, &creator, None, Some(150)).unwrap();
        
        // Should be capped at MAX_PAGE_SIZE (100)
        assert_eq!(result.tokens.len(), 100);
        assert!(result.cursor.is_some());
    }
    
    #[test]
    fn test_get_tokens_default_limit() {
        let (env, creator) = setup_with_tokens(50);
        
        // No limit specified, should use DEFAULT_PAGE_SIZE (20)
        let result = get_tokens_by_creator(&env, &creator, None, None).unwrap();
        
        assert_eq!(result.tokens.len(), 20);
        assert!(result.cursor.is_some());
    }
    
    #[test]
    fn test_get_tokens_cursor_past_end() {
        let (env, creator) = setup_with_tokens(10);
        
        // Create cursor past the end
        let invalid_cursor = 100u32;
        
        let result = get_tokens_by_creator(&env, &creator, Some(invalid_cursor), Some(20)).unwrap();
        
        assert_eq!(result.tokens.len(), 0);
        assert!(result.cursor.is_none());
    }
    
    #[test]
    fn test_get_tokens_deterministic_ordering() {
        let (env, creator) = setup_with_tokens(30);
        
        // Fetch first page twice
        let result1 = get_tokens_by_creator(&env, &creator, None, Some(10)).unwrap();
        let result2 = get_tokens_by_creator(&env, &creator, None, Some(10)).unwrap();
        
        // Results should be identical
        assert_eq!(result1.tokens.len(), result2.tokens.len());
        for i in 0..result1.tokens.len() {
            let token1 = result1.tokens.get(i).unwrap();
            let token2 = result2.tokens.get(i).unwrap();
            assert_eq!(token1.address, token2.address);
        }
    }
    
    #[test]
    fn test_get_creator_token_count() {
        let (env, creator) = setup_with_tokens(42);
        
        let count = get_creator_token_count(&env, &creator);
        
        assert_eq!(count, 42);
    }
    
    #[test]
    fn test_get_creator_token_count_zero() {
        let env = Env::default();
        let creator = Address::generate(&env);
        
        let count = get_creator_token_count(&env, &creator);
        
        assert_eq!(count, 0);
    }
    
    #[test]
    fn test_pagination_boundary_conditions() {
        let (env, creator) = setup_with_tokens(21);
        
        // First page of 20
        let page1 = get_tokens_by_creator(&env, &creator, None, Some(20)).unwrap();
        assert_eq!(page1.tokens.len(), 20);
        assert!(page1.cursor.is_some());
        
        // Second page should have exactly 1 token
        let page2 = get_tokens_by_creator(&env, &creator, page1.cursor, Some(20)).unwrap();
        assert_eq!(page2.tokens.len(), 1);
        assert!(page2.cursor.is_none());
    }
    
    #[test]
    fn test_multiple_creators_isolated() {
        let env = Env::default();
        let creator1 = Address::generate(&env);
        let creator2 = Address::generate(&env);
        
        for i in 0..10 {
            let token_info = TokenInfo {
                address: Address::generate(&env),
                creator: creator1.clone(),
                name: soroban_sdk::String::from_str(&env, "Token1"),
                symbol: soroban_sdk::String::from_str(&env, "TK1"),
                decimals: 7,
                total_supply: 1_000_000,
                initial_supply: 1_000_000,
                max_supply: None,
                total_burned: 0,
                burn_count: 0,
                metadata_uri: None,
                created_at: env.ledger().timestamp(),
                clawback_enabled: false,
            };
            storage::set_token_info(&env, i, &token_info);
            storage::add_creator_token(&env, &creator1, i);
        }
        
        // Create tokens for creator2
        for i in 10..15 {
            let token_info = TokenInfo {
                address: Address::generate(&env),
                creator: creator2.clone(),
                name: soroban_sdk::String::from_str(&env, "Token2"),
                symbol: soroban_sdk::String::from_str(&env, "TK2"),
                decimals: 7,
                total_supply: 2_000_000,
                initial_supply: 2_000_000,
                max_supply: None,
                total_burned: 0,
                burn_count: 0,
                metadata_uri: None,
                created_at: env.ledger().timestamp(),
                clawback_enabled: false,
            };
            storage::set_token_info(&env, i, &token_info);
            storage::add_creator_token(&env, &creator2, i);
        }
        
        // Verify creator1 has 10 tokens
        let result1 = get_tokens_by_creator(&env, &creator1, None, Some(20)).unwrap();
        assert_eq!(result1.tokens.len(), 10);
        
        // Verify creator2 has 5 tokens
        let result2 = get_tokens_by_creator(&env, &creator2, None, Some(20)).unwrap();
        assert_eq!(result2.tokens.len(), 5);
    }
}

    // ═══════════════════════════════════════════════════════════════════════
    // Stream Query Tests
    // ═══════════════════════════════════════════════════════════════════════
    
    fn setup_token_with_streams(stream_count: u32) -> (Env, u32) {
        let env = Env::default();
        let creator = Address::generate(&env);
        
        // Create a token
        let token_info = TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        let token_index = 0;
        storage::set_token_info(&env, token_index, &token_info);
        
        // Add streams to the token
        for stream_id in 0..stream_count {
            storage::add_token_stream(&env, token_index, stream_id);
        }
        
        (env, token_index)
    }
    
    // Task 7.1: Test for empty stream list
    #[test]
    fn test_get_streams_empty_list() {
        let env = Env::default();
        let creator = Address::generate(&env);
        
        // Create token with no streams
        let token_info = TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        let token_index = 0;
        storage::set_token_info(&env, token_index, &token_info);
        
        // Query streams - should return empty page
        let result = get_streams_by_token(&env, token_index, None, Some(20)).unwrap();
        assert_eq!(result.streams.len(), 0);
        assert!(result.cursor.is_none());
        
        // Query count - should return 0
        let count = get_stream_count_by_token(&env, token_index).unwrap();
        assert_eq!(count, 0);
    }
    
    // Task 7.2: Test for single stream
    #[test]
    fn test_get_streams_single_stream() {
        let (env, token_index) = setup_token_with_streams(1);
        
        // Query streams
        let result = get_streams_by_token(&env, token_index, None, Some(20)).unwrap();
        assert_eq!(result.streams.len(), 1);
        assert!(result.cursor.is_none());
        assert_eq!(result.streams.get(0).unwrap().id, 0);
        
        // Query count
        let count = get_stream_count_by_token(&env, token_index).unwrap();
        assert_eq!(count, 1);
    }
    
    // Task 7.3: Test for exact page boundaries
    #[test]
    fn test_get_streams_exact_page_boundaries() {
        // Test with exactly 20 streams (default page size)
        let (env, token_index) = setup_token_with_streams(20);
        
        let result = get_streams_by_token(&env, token_index, None, Some(20)).unwrap();
        assert_eq!(result.streams.len(), 20);
        assert!(result.cursor.is_none()); // Exactly one page
        
        // Test with exactly 100 streams (max page size)
        let (env2, token_index2) = setup_token_with_streams(100);
        
        let result2 = get_streams_by_token(&env2, token_index2, None, Some(100)).unwrap();
        assert_eq!(result2.streams.len(), 100);
        assert!(result2.cursor.is_none()); // Exactly one page at max size
    }
    
    // Task 7.4: Test for cursor past end
    #[test]
    fn test_get_streams_cursor_past_end() {
        let (env, token_index) = setup_token_with_streams(10);
        
        // Create cursor pointing past the end
        let invalid_cursor = PaginationCursor {
            next_index: Some(100),
        };
        
        let result = get_streams_by_token(&env, token_index, Some(invalid_cursor), Some(20)).unwrap();
        assert_eq!(result.streams.len(), 0);
        assert!(result.cursor.is_none());
    }
    
    // Task 7.5: Test for multi-token isolation
    #[test]
    fn test_get_streams_multi_token_isolation() {
        let env = Env::default();
        let creator = Address::generate(&env);
        
        // Create token 0 with 5 streams
        let token_info_0 = TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(&env, "Token 0"),
            symbol: soroban_sdk::String::from_str(&env, "TK0"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        storage::set_token_info(&env, 0, &token_info_0);
        for stream_id in 0..5 {
            storage::add_token_stream(&env, 0, stream_id);
        }
        
        // Create token 1 with 3 streams
        let token_info_1 = TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(&env, "Token 1"),
            symbol: soroban_sdk::String::from_str(&env, "TK1"),
            decimals: 7,
            total_supply: 2_000_000,
            initial_supply: 2_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        storage::set_token_info(&env, 1, &token_info_1);
        for stream_id in 10..13 {
            storage::add_token_stream(&env, 1, stream_id);
        }
        
        // Query token 0 - should return only its 5 streams
        let result_0 = get_streams_by_token(&env, 0, None, Some(20)).unwrap();
        assert_eq!(result_0.streams.len(), 5);
        for i in 0..5 {
            assert_eq!(result_0.streams.get(i).unwrap().id, i);
        }
        
        // Query token 1 - should return only its 3 streams
        let result_1 = get_streams_by_token(&env, 1, None, Some(20)).unwrap();
        assert_eq!(result_1.streams.len(), 3);
        for i in 0..3 {
            assert_eq!(result_1.streams.get(i).unwrap().id, 10 + i);
        }
    }
    
    // Task 7.6: Test for multi-page pagination
    #[test]
    fn test_get_streams_multi_page_pagination() {
        let (env, token_index) = setup_token_with_streams(50);
        
        // First page (20 streams)
        let page1 = get_streams_by_token(&env, token_index, None, Some(20)).unwrap();
        assert_eq!(page1.streams.len(), 20);
        assert!(page1.cursor.is_some());
        
        // Second page (20 streams)
        let page2 = get_streams_by_token(&env, token_index, page1.cursor, Some(20)).unwrap();
        assert_eq!(page2.streams.len(), 20);
        assert!(page2.cursor.is_some());
        
        // Third page (10 streams)
        let page3 = get_streams_by_token(&env, token_index, page2.cursor, Some(20)).unwrap();
        assert_eq!(page3.streams.len(), 10);
        assert!(page3.cursor.is_none()); // No more results
    }
    
    // Task 7.7: Test for max page size enforcement
    #[test]
    fn test_get_streams_max_page_size_enforcement() {
        let (env, token_index) = setup_token_with_streams(200);
        
        // Request more than MAX_PAGE_SIZE (100)
        let result = get_streams_by_token(&env, token_index, None, Some(150)).unwrap();
        
        // Should be capped at MAX_PAGE_SIZE
        assert_eq!(result.streams.len(), 100);
        assert!(result.cursor.is_some());
    }
    
    // Task 7.8: Test for default page size
    #[test]
    fn test_get_streams_default_page_size() {
        let (env, token_index) = setup_token_with_streams(50);
        
        // No limit specified, should use DEFAULT_PAGE_SIZE (20)
        let result = get_streams_by_token(&env, token_index, None, None).unwrap();
        
        assert_eq!(result.streams.len(), 20);
        assert!(result.cursor.is_some());
    }
    
    // Task 7.9: Test for invalid token index
    #[test]
    fn test_get_streams_invalid_token_index() {
        let env = Env::default();
        
        // Query non-existent token with get_streams_by_token
        let result = get_streams_by_token(&env, 999, None, Some(20));
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), Error::TokenNotFound);
        
        // Query non-existent token with get_stream_count_by_token
        let count_result = get_stream_count_by_token(&env, 999);
        assert!(count_result.is_err());
        assert_eq!(count_result.unwrap_err(), Error::TokenNotFound);
    }
    
    // Additional test: Stream ordering by creation (stream ID ascending)
    #[test]
    fn test_get_streams_ordering() {
        let (env, token_index) = setup_token_with_streams(30);
        
        // Query all streams
        let result = get_streams_by_token(&env, token_index, None, Some(100)).unwrap();
        
        // Verify streams are ordered by stream_id ascending
        for i in 0..result.streams.len() {
            assert_eq!(result.streams.get(i).unwrap().id, i);
        }
    }
    
    // Additional test: Pagination determinism
    #[test]
    fn test_get_streams_determinism() {
        let (env, token_index) = setup_token_with_streams(30);
        
        // Fetch first page twice
        let result1 = get_streams_by_token(&env, token_index, None, Some(10)).unwrap();
        let result2 = get_streams_by_token(&env, token_index, None, Some(10)).unwrap();
        
        // Results should be identical
        assert_eq!(result1.streams.len(), result2.streams.len());
        for i in 0..result1.streams.len() {
            let stream1 = result1.streams.get(i).unwrap();
            let stream2 = result2.streams.get(i).unwrap();
            assert_eq!(stream1.id, stream2.id);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Proposal Query Tests
    // ═══════════════════════════════════════════════════════════════════════
    
    fn setup_with_proposals(proposal_count: u32) -> Env {
        let env = Env::default();
        let proposer = Address::generate(&env);
        
        for i in 0..proposal_count {
            let id = storage::get_next_proposal_id(&env);
            let proposal = Proposal {
                id,
                proposer: proposer.clone(),
                action_type: ActionType::PauseContract,
                payload: Vec::new(&env),
                start_time: env.ledger().timestamp(),
                end_time: env.ledger().timestamp() + 86400,
                eta: 0,
                created_at: env.ledger().timestamp(),
                votes_for: 0,
                votes_against: 0,
                votes_abstain: 0,
            };
            storage::set_proposal(&env, id, &proposal);
            storage::increment_proposal_count(&env);
        }
        
        env
    }

    #[test]
    fn test_get_proposals_empty() {
        let env = setup_with_proposals(0);
        let result = get_proposals_page(&env, None, Some(20)).unwrap();
        
        assert_eq!(result.proposals.len(), 0);
        assert!(result.cursor.is_none());
    }

    #[test]
    fn test_get_proposals_partial() {
        let env = setup_with_proposals(5);
        let result = get_proposals_page(&env, None, Some(10)).unwrap();
        
        assert_eq!(result.proposals.len(), 5);
        assert!(result.cursor.is_none());
    }

    #[test]
    fn test_get_proposals_full_page() {
        let env = setup_with_proposals(25);
        
        // First full page
        let page1 = get_proposals_page(&env, None, Some(10)).unwrap();
        assert_eq!(page1.proposals.len(), 10);
        assert_eq!(page1.cursor, Some(10));
        
        // Second full page
        let page2 = get_proposals_page(&env, page1.cursor, Some(10)).unwrap();
        assert_eq!(page2.proposals.len(), 10);
        assert_eq!(page2.cursor, Some(20));
        
        // Third partial page
        let page3 = get_proposals_page(&env, page2.cursor, Some(10)).unwrap();
        assert_eq!(page3.proposals.len(), 5);
        assert!(page3.cursor.is_none());
    }

    #[test]
    fn test_get_proposals_deterministic() {
        let env = setup_with_proposals(20);
        
        let result1 = get_proposals_page(&env, None, Some(20)).unwrap();
        let result2 = get_proposals_page(&env, None, Some(20)).unwrap();
        
        assert_eq!(result1.proposals.len(), result2.proposals.len());
        for i in 0..result1.proposals.len() {
            let p1 = result1.proposals.get(i).unwrap();
            let p2 = result2.proposals.get(i).unwrap();
            assert_eq!(p1.id, p2.id);
            // Verify items are returned in ascending order
            assert_eq!(p1.id, i as u64);
        }
    }
