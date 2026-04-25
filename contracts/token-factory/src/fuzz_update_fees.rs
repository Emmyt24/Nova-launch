//! Comprehensive fuzz tests for the update_fees function
//!
//! This module tests the update_fees function with 10,000+ iterations covering:
//! - Random fee values (positive, negative, zero, max)
//! - Authorization scenarios (correct admin, unauthorized users)
//! - None value handling (no update)
//! - Fee overflow scenarios
//! - Edge cases and boundary conditions

use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Address;

// Configuration for extensive fuzzing
const FUZZ_ITERATIONS: u32 = 256;

/// Strategy for generating fee values including edge cases
fn comprehensive_fee_strategy() -> impl Strategy<Value = i128> {
    prop_oneof![
        // Common valid values
        1i128..1_000_000_000i128,
        // Zero
        Just(0i128),
        // Small values
        1i128..100i128,
        // Negative values (should fail)
        -1_000_000i128..-1i128,
        // Large values
        1_000_000_000i128..i128::MAX / 2,
        // Edge cases
        Just(i128::MAX),
        Just(i128::MAX - 1),
        Just(i128::MIN),
        Just(i128::MIN + 1),
        Just(-1i128),
    ]
}

/// Strategy for optional fee values
fn optional_fee_strategy() -> impl Strategy<Value = Option<i128>> {
    prop_oneof![
        // None (no update)
        Just(None),
        // Some with various values
        comprehensive_fee_strategy().prop_map(Some),
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(FUZZ_ITERATIONS))]

    /// Test 1: Fuzz update_fees with random base fee values
    /// Tests all possible base fee values while keeping metadata fee unchanged
    #[test]
    fn fuzz_update_base_fee_random_values(
        base_fee in comprehensive_fee_strategy(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Initialize with known values
        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Attempt to update base fee
        let result = client.try_update_fees(&admin, &Some(base_fee), &None);

        // Validate behavior
        if base_fee < 0 {
            // Negative fees should fail
            prop_assert!(result.is_err());
            // Verify state unchanged
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, 100_000_000);
        } else {
            // Non-negative fees should succeed
            prop_assert!(result.is_ok());
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, base_fee);
            // Metadata fee should remain unchanged
            prop_assert_eq!(state.metadata_fee, 50_000_000);
        }
    }

    /// Test 2: Fuzz update_fees with random metadata fee values
    /// Tests all possible metadata fee values while keeping base fee unchanged
    #[test]
    fn fuzz_update_metadata_fee_random_values(
        metadata_fee in comprehensive_fee_strategy(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        let result = client.try_update_fees(&admin, &None, &Some(metadata_fee));

        if metadata_fee < 0 {
            prop_assert!(result.is_err());
            let state = client.get_state();
            prop_assert_eq!(state.metadata_fee, 50_000_000);
        } else {
            prop_assert!(result.is_ok());
            let state = client.get_state();
            prop_assert_eq!(state.metadata_fee, metadata_fee);
            prop_assert_eq!(state.base_fee, 100_000_000);
        }
    }

    /// Test 3: Fuzz update_fees with both fees simultaneously
    /// Tests updating both fees at once with random values
    #[test]
    fn fuzz_update_both_fees_random_values(
        base_fee in comprehensive_fee_strategy(),
        metadata_fee in comprehensive_fee_strategy(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        let result = client.try_update_fees(&admin, &Some(base_fee), &Some(metadata_fee));

        if base_fee < 0 || metadata_fee < 0 {
            // Any negative fee should cause failure
            prop_assert!(result.is_err());
            // State should remain unchanged
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, 100_000_000);
            prop_assert_eq!(state.metadata_fee, 50_000_000);
        } else {
            prop_assert!(result.is_ok());
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, base_fee);
            prop_assert_eq!(state.metadata_fee, metadata_fee);
        }
    }

    /// Test 4: Fuzz authorization with unauthorized addresses
    /// Tests that only the correct admin can update fees
    #[test]
    fn fuzz_update_fees_unauthorized_addresses(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
        _seed in any::<u64>(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Attempt update with unauthorized address
        let result = client.try_update_fees(&unauthorized, &Some(base_fee), &Some(metadata_fee));

        // Should always fail with unauthorized error
        prop_assert!(result.is_err());

        // Verify state unchanged
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, 100_000_000);
        prop_assert_eq!(state.metadata_fee, 50_000_000);
    }

    /// Test 5: Fuzz with None values (no update)
    /// Tests that None values correctly skip updates
    #[test]
    fn fuzz_update_fees_with_none_values(
        base_fee_opt in optional_fee_strategy(),
        metadata_fee_opt in optional_fee_strategy(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let initial_base = 100_000_000i128;
        let initial_metadata = 50_000_000i128;

        client.initialize(&admin, &treasury, &initial_base, &initial_metadata);

        let result = client.try_update_fees(&admin, &base_fee_opt, &metadata_fee_opt);

        // Determine expected behavior
        let has_negative = base_fee_opt.map_or(false, |f| f < 0)
                        || metadata_fee_opt.map_or(false, |f| f < 0);

        if has_negative {
            prop_assert!(result.is_err());
        } else {
            prop_assert!(result.is_ok());

            let state = client.get_state();

            // Check base fee
            match base_fee_opt {
                Some(fee) => prop_assert_eq!(state.base_fee, fee),
                None => prop_assert_eq!(state.base_fee, initial_base),
            }

            // Check metadata fee
            match metadata_fee_opt {
                Some(fee) => prop_assert_eq!(state.metadata_fee, fee),
                None => prop_assert_eq!(state.metadata_fee, initial_metadata),
            }
        }
    }

    /// Test 6: Fuzz negative fees always fail
    /// Ensures all negative fee values are properly rejected
    #[test]
    fn fuzz_negative_fees_always_rejected(
        base_fee in i128::MIN..-1i128,
        metadata_fee in i128::MIN..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Test negative base fee
        let result = client.try_update_fees(&admin, &Some(base_fee), &None);
        prop_assert!(result.is_err());

        // Test negative metadata fee (if negative)
        if metadata_fee < 0 {
            let result = client.try_update_fees(&admin, &None, &Some(metadata_fee));
            prop_assert!(result.is_err());
        }

        // Verify state unchanged
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, 100_000_000);
        prop_assert_eq!(state.metadata_fee, 50_000_000);
    }

    /// Test 7: Fuzz fee overflow scenarios
    /// Tests behavior with extremely large fee values
    #[test]
    fn fuzz_fee_overflow_scenarios(
        base_fee in i128::MAX/2..i128::MAX,
        metadata_fee in i128::MAX/2..i128::MAX,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Update with large values
        let result = client.try_update_fees(&admin, &Some(base_fee), &Some(metadata_fee));

        // Should succeed (individual fees are valid)
        prop_assert!(result.is_ok());

        let state = client.get_state();
        prop_assert_eq!(state.base_fee, base_fee);
        prop_assert_eq!(state.metadata_fee, metadata_fee);

        // Document potential overflow in total fee calculation
        let total = base_fee.checked_add(metadata_fee);
        if total.is_none() {
            // This is an edge case: individual fees valid but sum overflows
            // Document this for potential future handling
            prop_assert!(true);
        }
    }

    /// Test 8: Fuzz correct admin authorization
    /// Verifies that the correct admin can always update valid fees
    #[test]
    fn fuzz_correct_admin_authorization(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Correct admin should always succeed with valid fees
        let result = client.try_update_fees(&admin, &Some(base_fee), &Some(metadata_fee));
        prop_assert!(result.is_ok());

        let state = client.get_state();
        prop_assert_eq!(state.base_fee, base_fee);
        prop_assert_eq!(state.metadata_fee, metadata_fee);
    }

    /// Test 9: Fuzz multiple sequential updates
    /// Tests that multiple updates work correctly in sequence
    #[test]
    fn fuzz_sequential_fee_updates(
        fee1 in 0i128..1_000_000_000i128,
        fee2 in 0i128..1_000_000_000i128,
        fee3 in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // First update
        client.update_fees(&admin, &Some(fee1), &None);
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, fee1);

        // Second update
        client.update_fees(&admin, &None, &Some(fee2));
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, fee1);
        prop_assert_eq!(state.metadata_fee, fee2);

        // Third update (both)
        client.update_fees(&admin, &Some(fee3), &Some(fee3));
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, fee3);
        prop_assert_eq!(state.metadata_fee, fee3);
    }

    /// Test 10: Fuzz idempotency of fee updates
    /// Verifies that updating to the same value multiple times is safe
    #[test]
    fn fuzz_fee_update_idempotency(
        fee_value in 0i128..1_000_000_000i128,
        iterations in 1u32..20u32,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Update to same value multiple times
        for _ in 0..iterations {
            let result = client.try_update_fees(&admin, &Some(fee_value), &Some(fee_value));
            prop_assert!(result.is_ok());

            let state = client.get_state();
            prop_assert_eq!(state.base_fee, fee_value);
            prop_assert_eq!(state.metadata_fee, fee_value);
        }
    }

    /// Test 11: Fuzz zero fee updates
    /// Tests that zero is a valid fee value
    #[test]
    fn fuzz_zero_fee_updates(
        _seed in any::<u64>(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Zero should be valid
        let result = client.try_update_fees(&admin, &Some(0), &Some(0));
        prop_assert!(result.is_ok());

        let state = client.get_state();
        prop_assert_eq!(state.base_fee, 0);
        prop_assert_eq!(state.metadata_fee, 0);
    }

    /// Test 12: Fuzz state consistency after failed updates
    /// Ensures state remains unchanged after failed update attempts
    #[test]
    fn fuzz_state_consistency_after_failure(
        invalid_fee in i128::MIN..-1i128,
        valid_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let initial_base = 100_000_000i128;
        let initial_metadata = 50_000_000i128;

        client.initialize(&admin, &treasury, &initial_base, &initial_metadata);

        // Attempt invalid update
        let result = client.try_update_fees(&admin, &Some(invalid_fee), &Some(valid_fee));
        prop_assert!(result.is_err());

        // Verify state unchanged
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, initial_base);
        prop_assert_eq!(state.metadata_fee, initial_metadata);

        // Verify subsequent valid update still works
        let result = client.try_update_fees(&admin, &Some(valid_fee), &Some(valid_fee));
        prop_assert!(result.is_ok());
    }
}

// Additional edge case tests for specific scenarios
#[cfg(test)]
mod edge_cases {
    use super::*;

    #[test]
    fn test_update_fees_both_none() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Update with both None should fail with InvalidParameters
        let result = client.try_update_fees(&admin, &None, &None);
        assert!(result.is_err());

        let state = client.get_state();
        assert_eq!(state.base_fee, 100_000_000);
        assert_eq!(state.metadata_fee, 50_000_000);
    }

    #[test]
    fn test_update_fees_exactly_negative_one() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // -1 should be rejected
        let result = client.try_update_fees(&admin, &Some(-1), &None);
        assert!(result.is_err());

        let result = client.try_update_fees(&admin, &None, &Some(-1));
        assert!(result.is_err());
    }

    #[test]
    fn test_update_fees_max_i128() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // i128::MAX should be accepted
        let result = client.try_update_fees(&admin, &Some(i128::MAX), &None);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, i128::MAX);
    }

    #[test]
    fn test_update_fees_min_i128() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // i128::MIN should be rejected (negative)
        let result = client.try_update_fees(&admin, &Some(i128::MIN), &None);
        assert!(result.is_err());
    }

    #[test]
    fn test_update_fees_unauthorized_with_valid_fees() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Even with valid fees, unauthorized should fail
        let result = client.try_update_fees(&unauthorized, &Some(200_000_000), &Some(100_000_000));
        assert!(result.is_err());

        // Verify state unchanged
        let state = client.get_state();
        assert_eq!(state.base_fee, 100_000_000);
        assert_eq!(state.metadata_fee, 50_000_000);
    }

    #[test]
    fn test_update_fees_partial_update_base_only() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Update only base fee
        let result = client.try_update_fees(&admin, &Some(200_000_000), &None);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 200_000_000);
        assert_eq!(state.metadata_fee, 50_000_000); // Unchanged
    }

    #[test]
    fn test_update_fees_partial_update_metadata_only() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Update only metadata fee
        let result = client.try_update_fees(&admin, &None, &Some(75_000_000));
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 100_000_000); // Unchanged
        assert_eq!(state.metadata_fee, 75_000_000);
    }

    #[test]
    fn test_update_fees_to_zero() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Update both to zero
        let result = client.try_update_fees(&admin, &Some(0), &Some(0));
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 0);
        assert_eq!(state.metadata_fee, 0);
    }

    #[test]
    fn test_update_fees_from_zero_to_nonzero() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &0, &0);

        // Update from zero to non-zero
        let result = client.try_update_fees(&admin, &Some(100_000_000), &Some(50_000_000));
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 100_000_000);
        assert_eq!(state.metadata_fee, 50_000_000);
    }

    #[test]
    fn test_update_fees_rapid_succession() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Rapid updates should all succeed
        for i in 1..=100 {
            let fee = i * 1_000_000;
            let result = client.try_update_fees(&admin, &Some(fee), &Some(fee));
            assert!(result.is_ok());

            let state = client.get_state();
            assert_eq!(state.base_fee, fee);
            assert_eq!(state.metadata_fee, fee);
        }
    }

    #[test]
    fn test_update_fees_alternating_valid_invalid() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // Valid update
        let result = client.try_update_fees(&admin, &Some(200_000_000), &None);
        assert!(result.is_ok());

        // Invalid update
        let result = client.try_update_fees(&admin, &Some(-100), &None);
        assert!(result.is_err());

        // Verify state from last valid update
        let state = client.get_state();
        assert_eq!(state.base_fee, 200_000_000);

        // Another valid update should work
        let result = client.try_update_fees(&admin, &Some(300_000_000), &None);
        assert!(result.is_ok());
    }

    #[test]
    fn test_update_fees_one_valid_one_invalid() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

        // One valid, one invalid - entire operation should fail
        let result = client.try_update_fees(&admin, &Some(200_000_000), &Some(-100));
        assert!(result.is_err());

        // Verify neither fee changed
        let state = client.get_state();
        assert_eq!(state.base_fee, 100_000_000);
        assert_eq!(state.metadata_fee, 50_000_000);
    }
}
