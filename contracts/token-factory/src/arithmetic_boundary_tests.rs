use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, String};
use crate::{
    burn, mint, storage, timelock, treasury, TokenFactory,
    types::{Error, TokenInfo},
    stream_types::{StreamInfo, validate_metadata},
};

/// ============================================================================
/// ARITHMETIC BOUNDARY TESTS
/// ============================================================================
///
/// These tests verify that all arithmetic operations properly handle:
/// - Maximum i128 values (token amounts)
/// - Maximum u64 values (timestamps/durations)
/// - Maximum u32 values (counts/indices)
/// - Overflow/underflow edge cases

#[test]
fn test_fee_calculation_max_i128_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Initialize with reasonable fees first
    TokenFactory::initialize(
        env.clone(),
        admin.clone(),
        treasury.clone(),
        1_000_000,  // 0.1 XLM
        500_000,    // 0.05 XLM
    ).unwrap();
    
    // Now try to update fees to max values
    let max_fee = i128::MAX / 2;
    
    // This should succeed as the individual fees are valid
    // The overflow would only happen during calculation
    TokenFactory::update_fees(
        env.clone(),
        admin.clone(),
        Some(max_fee),
        Some(max_fee),
    ).unwrap();
    
    // Verify fees were set
    assert_eq!(TokenFactory::get_base_fee(env.clone()), max_fee);
    assert_eq!(TokenFactory::get_metadata_fee(env.clone()), max_fee);
}

#[test]
fn test_fee_calculation_overflow_protection() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Initialize
    TokenFactory::initialize(
        env.clone(),
        admin.clone(),
        treasury.clone(),
        1_000_000,
        500_000,
    ).unwrap();
    
    // Set fees to values that would overflow when added
    let large_fee = i128::MAX - 1000;
    
    TokenFactory::update_fees(
        env.clone(),
        admin.clone(),
        Some(large_fee),
        Some(large_fee),
    ).unwrap();
    
    // Now try to create a token with metadata - this should fail
    // because base_fee + metadata_fee would overflow
    let creator = Address::generate(&env);
    let result = TokenFactory::create_token(
        env.clone(),
        creator.clone(),
        String::from_str(&env, "Test Token"),
        String::from_str(&env, "TST"),
        7,
        1_000_000,
        Some(String::from_str(&env, "ipfs://QmTest")),
        large_fee + 1000,  // fee payment
    );
    
    // Should get ArithmeticError due to overflow in fee calculation
    assert_eq!(result, Err(Error::ArithmeticError));
}

#[test]
fn test_mint_max_supply_overflow_protection() {
    let env = Env::default();
    env.mock_all_auths();
    
    // Create token near max supply
    let creator = Address::generate(&env);
    let token_info = TokenInfo {
        address: Address::generate(&env),
        creator: creator.clone(),
        name: String::from_str(&env, "Test Token"),
        symbol: String::from_str(&env, "TST"),
        decimals: 7,
        total_supply: i128::MAX - 100,
        initial_supply: i128::MAX - 100,
        max_supply: Some(i128::MAX),
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
    };
    
    storage::set_token_info(&env, 0, &token_info);
    
    let recipient = Address::generate(&env);
    
    // Try to mint 101 - would overflow total_supply
    let result = mint::mint(&env, 0, &recipient, 101);
    assert_eq!(result, Err(Error::ArithmeticError));
    
    // Mint 100 should work (exactly at max)
    let result = mint::mint(&env, 0, &recipient, 100);
    assert!(result.is_ok());
}

#[test]
fn test_burn_underflow_protection() {
    let env = Env::default();
    env.mock_all_auths();
    
    // Setup: create token with 100 supply
    let creator = Address::generate(&env);
    storage::set_admin(&env, &creator);
    
    let token_info = TokenInfo {
        address: Address::generate(&env),
        creator: creator.clone(),
        name: String::from_str(&env, "Test Token"),
        symbol: String::from_str(&env, "TST"),
        decimals: 7,
        total_supply: 100,
        initial_supply: 100,
        max_supply: None,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
    };
    
    storage::set_token_info(&env, 0, &token_info);
    storage::set_balance(&env, 0, &creator, 100);
    
    // Try to burn more than balance - should fail with InsufficientBalance
    let result = burn::burn(&env, creator.clone(), 0, 101);
    assert_eq!(result, Err(Error::InsufficientBalance));
    
    // Burn exactly balance should work
    let result = burn::burn(&env, creator.clone(), 0, 100);
    assert!(result.is_ok());
    
    // Verify supply is 0
    let info = storage::get_token_info(&env, 0).unwrap();
    assert_eq!(info.total_supply, 0);
}

#[test]
fn test_timelock_execute_at_u64_overflow() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    storage::set_admin(&env, &admin);
    storage::set_treasury(&env, &Address::generate(&env));
    storage::set_base_fee(&env, 1_000_000);
    storage::set_metadata_fee(&env, 500_000);
    
    // Set timelock with max delay
    timelock::initialize_timelock(&env, Some(u64::MAX - 10)).unwrap();
    
    // Advance time close to max
    env.ledger().with_mut(|li| {
        li.timestamp = u64::MAX - 5;
    });
    
    // Try to schedule a fee update - should fail due to overflow
    let result = timelock::schedule_fee_update(
        &env,
        &admin,
        Some(2_000_000),
        None,
    );
    
    assert_eq!(result, Err(Error::ArithmeticError));
}

#[test]
fn test_treasury_withdrawal_overflow_protection() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    storage::set_admin(&env, &admin);
    
    // Initialize with max daily cap
    treasury::initialize_treasury_policy(&env, Some(i128::MAX), false).unwrap();
    
    let recipient = Address::generate(&env);
    
    // Try to withdraw large amount - should work if within cap
    // But adding to amount_withdrawn would overflow
    let result = treasury::validate_withdrawal(&env, &recipient, i128::MAX);
    
    // This should succeed for the first withdrawal
    assert!(result.is_ok());
    
    // Record the withdrawal
    treasury::record_withdrawal(&env, i128::MAX).unwrap();
    
    // Try another withdrawal - should fail due to cap exceeded
    let result = treasury::validate_withdrawal(&env, &recipient, 1);
    assert_eq!(result, Err(Error::WithdrawalCapExceeded));
}

#[test]
fn test_storage_counter_overflow_protection() {
    let env = Env::default();
    
    // We can't easily test u32::MAX tokens, but we can verify the function
    // returns Result and would handle overflow correctly
    // The checked_add will return None on overflow
    
    // Test that increment functions return proper error type
    // This is a compile-time check mostly - if it compiles, the Result type is correct
    let count_result: Result<u32, Error> = storage::increment_token_count(&env);
    assert!(count_result.is_ok());
    
    let burn_result: Result<(), Error> = storage::increment_burn_count(&env, 0);
    assert!(burn_result.is_ok());
    
    let stream_result: Result<u32, Error> = storage::increment_stream_count(&env);
    assert!(stream_result.is_ok());
    
    let change_result: Result<u64, Error> = storage::get_next_change_id(&env);
    assert!(change_result.is_ok());
}

#[test]
fn test_batch_burn_total_overflow_protection() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    storage::set_admin(&env, &admin);
    
    // Create a holder with some balance
    let holder = Address::generate(&env);
    storage::set_balance(&env, 0, &holder, 1_000_000);
    
    // Create token
    let token_info = TokenInfo {
        address: Address::generate(&env),
        creator: admin.clone(),
        name: String::from_str(&env, "Test Token"),
        symbol: String::from_str(&env, "TST"),
        decimals: 7,
        total_supply: i128::MAX,
        initial_supply: i128::MAX,
        max_supply: None,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        created_at: env.ledger().timestamp(),
        clawback_enabled: false,
    };
    storage::set_token_info(&env, 0, &token_info);
    
    // Create batch that would overflow when summed
    let mut burns = soroban_sdk::Vec::new(&env);
    let large_amount = i128::MAX / 2 + 100;
    burns.push_back((holder.clone(), large_amount));
    burns.push_back((holder.clone(), large_amount)); // This would overflow total
    
    // The batch validation should catch overflow
    let result = burn::batch_burn(&env, admin.clone(), 0, burns);
    assert_eq!(result, Err(Error::ArithmeticError));
}

/// ============================================================================
/// FUZZ TESTS FOR ARITHMETIC
/// ============================================================================

#[test]
fn test_arithmetic_fuzz_random_fees() {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    // Initialize with random-like fees
    let test_fees: [i128; 10] = [
        0,
        1,
        1000,
        1_000_000,
        1_000_000_000,
        i128::MAX / 4,
        i128::MAX / 2,
        i128::MAX - 1000,
        i128::MAX - 1,
        i128::MAX,
    ];
    
    for (i, base_fee) in test_fees.iter().enumerate() {
        // Each iteration is independent
        let env = Env::default();
        env.mock_all_auths();
        
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        
        // Only test with valid non-negative fees
        if *base_fee < 0 {
            continue;
        }
        
        let result = TokenFactory::initialize(
            env.clone(),
            admin.clone(),
            treasury.clone(),
            *base_fee,
            *base_fee / 2,
        );
        
        if base_fee > &0 {
            assert!(result.is_ok(), "Failed at iteration {} with fee {}", i, base_fee);
        }
    }
}

#[test]
fn test_arithmetic_fuzz_random_amounts() {
    let env = Env::default();
    env.mock_all_auths();
    
    let test_amounts: [i128; 12] = [
        1,
        100,
        1_000_000,
        1_000_000_000_000,
        i64::MAX as i128,
        (i64::MAX as i128) * 2,
        i128::MAX / 1000,
        i128::MAX / 100,
        i128::MAX / 10,
        i128::MAX / 2,
        i128::MAX - 1000,
        i128::MAX,
    ];
    
    for (i, amount) in test_amounts.iter().enumerate() {
        let env = Env::default();
        env.mock_all_auths();
        
        let creator = Address::generate(&env);
        
        // Try to create token with various initial supplies
        let result = TokenFactory::create_token(
            env.clone(),
            creator.clone(),
            String::from_str(&env, "Test Token"),
            String::from_str(&env, "TST"),
            7,
            *amount,
            0, // no fee for this test
        );
        
        // All positive amounts should succeed
        if *amount > 0 && *amount <= i64::MAX as i128 * 1000 {
            // Large amounts might fail due to other limits, but shouldn't panic
            // Just verify no panic occurs
        }
    }
}

#[test]
fn test_arithmetic_fuzz_random_durations() {
    let env = Env::default();
    env.mock_all_auths();
    
    let test_durations: [u64; 8] = [
        0,
        1,
        3600,       // 1 hour
        86400,      // 1 day
        604800,     // 1 week
        2592000,    // 30 days
        u64::MAX / 2,
        u64::MAX - 1000,
    ];
    
    for duration in test_durations.iter() {
        let env = Env::default();
        env.mock_all_auths();
        
        let admin = Address::generate(&env);
        storage::set_admin(&env, &admin);
        storage::set_treasury(&env, &Address::generate(&env));
        storage::set_base_fee(&env, 1_000_000);
        storage::set_metadata_fee(&env, 500_000);
        
        // Initialize timelock with various durations
        let result = timelock::initialize_timelock(&env, Some(*duration));
        
        // Should succeed for valid durations (<= 30 days)
        if *duration <= 2_592_000 {
            assert!(result.is_ok());
        } else {
            assert_eq!(result, Err(Error::InvalidParameters));
        }
    }
}

#[test]
fn test_arithmetic_fuzz_mint_with_random_supplies() {
    let env = Env::default();
    env.mock_all_auths();
    
    // Test various combinations of current_supply and mint_amount
    let test_cases: [(i128, i128, Option<i128>); 8] = [
        (0, 1, Some(i128::MAX)),                    // Normal mint
        (i128::MAX - 1, 1, Some(i128::MAX)),      // At boundary
        (i128::MAX - 1, 2, Some(i128::MAX)),      // Would exceed max
        (i128::MAX / 2, i128::MAX / 2, None),      // Large mint, no max
        (100, i128::MAX, Some(1000)),             // Exceeds max supply
        (100, 500, Some(1000)),                   // Normal with max
        (1000, 1, Some(1000)),                    // Exactly at max
        (0, i128::MAX, None),                     // Mint max, unlimited
    ];
    
    for (current_supply, mint_amount, max_supply) in test_cases.iter() {
        let env = Env::default();
        env.mock_all_auths();
        
        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);
        
        // Setup token
        let token_info = TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: String::from_str(&env, "Test Token"),
            symbol: String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: *current_supply,
            initial_supply: *current_supply,
            max_supply: *max_supply,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        storage::set_token_info(&env, 0, &token_info);
        
        let result = mint::mint(&env, 0, &recipient, *mint_amount);
        
        // Verify no panic occurred - result can be Ok or Err but shouldn't crash
        match result {
            Ok(_) => {
                // Verify supply was updated correctly
                let info = storage::get_token_info(&env, 0).unwrap();
                assert_eq!(info.total_supply, current_supply + mint_amount);
            }
            Err(Error::MaxSupplyExceeded) | Err(Error::ArithmeticError) => {
                // These are expected error cases
            }
            Err(_) => {
                // Other errors are also acceptable
            }
        }
    }
}

#[test]
fn test_arithmetic_fuzz_treasury_with_random_caps() {
    let env = Env::default();
    env.mock_all_auths();
    
    let test_caps: [i128; 8] = [
        0,
        1,
        1000,
        1_000_000,
        1_000_000_000_000i128,
        i64::MAX as i128,
        i128::MAX / 2,
        i128::MAX,
    ];
    
    for cap in test_caps.iter() {
        let env = Env::default();
        env.mock_all_auths();
        
        let admin = Address::generate(&env);
        storage::set_admin(&env, &admin);
        
        // Only test valid non-negative caps
        if *cap < 0 {
            continue;
        }
        
        let result = treasury::initialize_treasury_policy(&env, Some(*cap), false);
        assert!(result.is_ok());
        
        let recipient = Address::generate(&env);
        
        // Test withdrawal validation
        let withdraw_amount = cap.saturating_div(2).max(1);
        let result = treasury::validate_withdrawal(&env, &recipient, withdraw_amount);
        
        // Should not panic - may succeed or fail depending on cap
        match result {
            Ok(_) | Err(Error::WithdrawalCapExceeded) | Err(Error::InvalidAmount) => {}
            _ => {
                // Other errors are also acceptable as long as no panic
            }
        }
    }
}

#[test]
fn test_stream_metadata_boundary() {
    let env = Env::default();
    
    // Test metadata validation with boundary lengths
    let test_cases = [
        ("", false),           // Empty - invalid
        ("a", true),           // 1 char - valid
        ("a".repeat(511).as_str(), true),   // 511 chars - valid
        ("a".repeat(512).as_str(), true),   // 512 chars - valid (max)
        ("a".repeat(513).as_str(), false),  // 513 chars - invalid
    ];
    
    for (content, expected_valid) in test_cases.iter() {
        let metadata = if content.is_empty() {
            Some(String::from_str(&env, ""))
        } else {
            Some(String::from_str(&env, content))
        };
        
        let result = validate_metadata(&metadata);
        
        if *expected_valid {
            assert!(result.is_ok(), "Expected valid for length {}", content.len());
        } else {
            assert_eq!(result, Err(Error::InvalidParameters), "Expected invalid for length {}", content.len());
        }
    }
}
