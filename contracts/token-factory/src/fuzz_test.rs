use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Address;

// Configuration for running more iterations
const PROPERTY_TEST_ITERATIONS: u32 = 500;

// Strategy for generating valid token names (1-32 chars)
fn token_name_strategy() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just("Test Token"),
        Just("My Token"),
        Just("A"),
        Just("ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"),
    ]
}

// Strategy for generating valid token symbols (1-12 chars)
fn token_symbol_strategy() -> impl Strategy<Value = &'static str> {
    prop_oneof![Just("TEST"), Just("TKN"), Just("A"), Just("ABCDEFGHIJKL"),]
}

// Strategy for generating edge case strings
fn edge_case_string_strategy() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just(""),
        Just("a"),
        Just("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
    ]
}

// Strategy for decimals (0-18 is typical, test beyond)
fn decimals_strategy() -> impl Strategy<Value = u32> {
    prop_oneof![Just(0u32), Just(7u32), Just(18u32), Just(255u32),]
}

// Strategy for supply amounts
fn supply_strategy() -> impl Strategy<Value = i128> {
    prop_oneof![
        Just(0i128),
        Just(1i128),
        Just(-1i128),
        Just(i128::MAX),
        Just(i128::MIN),
        1i128..1_000_000_000_000i128,
    ]
}

// Strategy for fee amounts
fn fee_strategy() -> impl Strategy<Value = i128> {
    prop_oneof![
        Just(0i128),
        Just(-1i128),
        Just(-1000i128),
        Just(i128::MAX),
        Just(i128::MIN),
        1i128..1_000_000_000i128,
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(PROPERTY_TEST_ITERATIONS))]

    #[test]
    fn fuzz_admin_authorization_property_update_fees(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
        caller_index in 0u32..10u32,
    ) {
        // Property-based test for admin authorization on update_fees
        // For any privileged operation:
        //   IF caller === admin THEN operation succeeds
        //   ELSE operation fails with Unauthorized error

        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Generate multiple random non-admin addresses
        let non_admin_1 = Address::generate(&env);
        let non_admin_2 = Address::generate(&env);
        let non_admin_3 = Address::generate(&env);

        // Initialize contract
        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Determine caller based on index: 0 = admin, others = non-admins
        let caller = match caller_index % 10 {
            0 => admin.clone(),
            _ => non_admin_1.clone(),
        };

        let is_admin = caller == admin;

        // Test update_fees operation
        let result = client.try_update_fees(&caller, &Some(base_fee + 1), &Some(metadata_fee + 1));

        // Property assertion: IF caller === admin THEN success, ELSE Unauthorized
        if is_admin {
            prop_assert!(result.is_ok(), "Admin should be able to update fees");
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, base_fee + 1);
            prop_assert_eq!(state.metadata_fee, metadata_fee + 1);
        } else {
            prop_assert!(result.is_err(), "Non-admin should fail with Unauthorized");
        }
    }

    #[test]
    fn fuzz_admin_authorization_with_random_addresses(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
        _iteration in 0u32..PROPERTY_TEST_ITERATIONS,
    ) {
        // Test with randomly generated addresses each iteration
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Each iteration generates a new random address
        let random_caller = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Random caller is almost certainly not admin (unless by extremely unlikely collision)
        let is_admin = random_caller == admin;

        let result = client.try_update_fees(&random_caller, &Some(100_000_000), &None);

        if is_admin {
            prop_assert!(result.is_ok());
        } else {
            // With random addresses, should almost always fail
            prop_assert!(result.is_err());
        }
    }

    #[test]
    fn fuzz_admin_vs_multiple_non_admins(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        // Test admin vs multiple distinct non-admin addresses
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Generate 10 distinct non-admin addresses
        let non_admin_1 = Address::generate(&env);
        let non_admin_2 = Address::generate(&env);
        let non_admin_3 = Address::generate(&env);
        let non_admin_4 = Address::generate(&env);
        let non_admin_5 = Address::generate(&env);
        let non_admin_6 = Address::generate(&env);
        let non_admin_7 = Address::generate(&env);
        let non_admin_8 = Address::generate(&env);
        let non_admin_9 = Address::generate(&env);
        let non_admin_10 = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Admin should succeed
        let admin_result = client.try_update_fees(&admin, &Some(100_000_000), &None);
        prop_assert!(admin_result.is_ok(), "Admin should always succeed");

        // All non-admins should fail with Unauthorized
        let non_admins = [
            non_admin_1, non_admin_2, non_admin_3, non_admin_4, non_admin_5,
            non_admin_6, non_admin_7, non_admin_8, non_admin_9, non_admin_10
        ];
        for (i, non_admin) in non_admins.iter().enumerate() {
            let result = client.try_update_fees(non_admin, &Some(100_000_000), &None);
            prop_assert!(result.is_err(), "Non-admin {} should fail", i);
        }
    }

    #[test]
    fn fuzz_authorization_with_various_fee_values(
        initial_base in 0i128..500_000_000i128,
        initial_metadata in 0i128..500_000_000i128,
        new_base in 0i128..1_000_000_000i128,
        new_metadata in 0i128..1_000_000_000i128,
    ) {
        // Test authorization works correctly with various fee values
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let non_admin = Address::generate(&env);

        client.initialize(&admin, &treasury, &initial_base, &initial_metadata);

        // Admin can update any valid fees
        if new_base >= 0 && new_metadata >= 0 {
            let admin_result = client.try_update_fees(&admin, &Some(new_base), &Some(new_metadata));
            prop_assert!(admin_result.is_ok(), "Admin should update fees with valid values");

            let state = client.get_state();
            prop_assert_eq!(state.base_fee, new_base);
            prop_assert_eq!(state.metadata_fee, new_metadata);
        }

        // Re-initialize for non-admin test
        let env2 = Env::default();
        env2.mock_all_auths();
        let contract_id2 = env2.register_contract(None, TokenFactory);
        let client2 = TokenFactoryClient::new(&env2, &contract_id2);
        let admin2 = Address::generate(&env2);
        let treasury2 = Address::generate(&env2);
        let non_admin2 = Address::generate(&env2);

        client2.initialize(&admin2, &treasury2, &initial_base, &initial_metadata);

        // Non-admin always fails regardless of fee values
        let non_admin_result = client2.try_update_fees(&non_admin2, &Some(new_base), &Some(new_metadata));
        prop_assert!(non_admin_result.is_err(), "Non-admin should always fail");
    }

    #[test]
    fn fuzz_authorization_consistency(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
        attempts in 1u32..50u32,
    ) {
        // Test that authorization is consistent across multiple attempts
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let non_admin = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Admin should always succeed
        for _ in 0..attempts {
            let result = client.try_update_fees(&admin, &Some(base_fee + 1), &None);
            prop_assert!(result.is_ok(), "Admin should always succeed");
        }

        // Non-admin should always fail
        for _ in 0..attempts {
            let result = client.try_update_fees(&non_admin, &Some(base_fee + 1), &None);
            prop_assert!(result.is_err(), "Non-admin should always fail");
        }
    }

    #[test]
    fn fuzz_partial_fee_updates_authorization(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        // Test partial fee updates (only base_fee or only metadata_fee)
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let non_admin = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Admin: update only base_fee
        let result1 = client.try_update_fees(&admin, &Some(base_fee + 100), &None);
        prop_assert!(result1.is_ok());

        let state1 = client.get_state();
        prop_assert_eq!(state1.base_fee, base_fee + 100);
        prop_assert_eq!(state1.metadata_fee, metadata_fee); // unchanged

        // Admin: update only metadata_fee
        let result2 = client.try_update_fees(&admin, &None, &Some(metadata_fee + 100));
        prop_assert!(result2.is_ok());

        let state2 = client.get_state();
        prop_assert_eq!(state2.base_fee, base_fee + 100); // unchanged
        prop_assert_eq!(state2.metadata_fee, metadata_fee + 100);

        // Non-admin: partial update base_fee should fail
        let result3 = client.try_update_fees(&non_admin, &Some(base_fee + 200), &None);
        prop_assert!(result3.is_err());

        // Non-admin: partial update metadata_fee should fail
        let result4 = client.try_update_fees(&non_admin, &None, &Some(metadata_fee + 200));
        prop_assert!(result4.is_err());

        // Non-admin: no-op update (both None) should also fail
        let result5 = client.try_update_fees(&non_admin, &None, &None);
        prop_assert!(result5.is_err());
    }
}

proptest! {
    // Standard iteration tests
    #[test]
    fn fuzz_initialize_with_various_fees(
        base_fee in fee_strategy(),
        metadata_fee in fee_strategy(),
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let result = client.try_initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Negative fees should fail
        if base_fee < 0 || metadata_fee < 0 {
            prop_assert!(result.is_err());
        } else {
            prop_assert!(result.is_ok());
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, base_fee);
            prop_assert_eq!(state.metadata_fee, metadata_fee);
        }
    }

    #[test]
    fn fuzz_update_fees_authorization(
        new_base_fee in fee_strategy(),
        _new_metadata_fee in fee_strategy(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Test with unauthorized address
        let result = client.try_update_fees(&unauthorized, &Some(new_base_fee), &None);
        prop_assert!(result.is_err());

        // Test with admin
        if new_base_fee >= 0 {
            let result = client.try_update_fees(&admin, &Some(new_base_fee), &None);
            prop_assert!(result.is_ok());
        }
    }

    #[test]
    fn fuzz_fee_calculation_consistency(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        let state = client.get_state();

        // Verify fees are stored correctly
        prop_assert_eq!(state.base_fee, base_fee);
        prop_assert_eq!(state.metadata_fee, metadata_fee);

        // Verify total fee calculation doesn't overflow
        let total_fee = base_fee.checked_add(metadata_fee);
        prop_assert!(total_fee.is_some());
    }

    #[test]
    fn fuzz_double_initialization_always_fails(
        base_fee1 in 0i128..1_000_000_000i128,
        metadata_fee1 in 0i128..1_000_000_000i128,
        base_fee2 in 0i128..1_000_000_000i128,
        metadata_fee2 in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin1 = Address::generate(&env);
        let treasury1 = Address::generate(&env);
        let admin2 = Address::generate(&env);
        let treasury2 = Address::generate(&env);

        // First initialization should succeed
        let result1 = client.try_initialize(&admin1, &treasury1, &base_fee1, &metadata_fee1);
        prop_assert!(result1.is_ok());

        // Second initialization should always fail
        let result2 = client.try_initialize(&admin2, &treasury2, &base_fee2, &metadata_fee2);
        prop_assert!(result2.is_err());
    }

    #[test]
    fn fuzz_state_persistence(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Read state multiple times
        for _ in 0..10 {
            let state = client.get_state();
            prop_assert_eq!(state.admin, admin.clone());
            prop_assert_eq!(state.treasury, treasury.clone());
            prop_assert_eq!(state.base_fee, base_fee);
            prop_assert_eq!(state.metadata_fee, metadata_fee);
        }
    }

    #[test]
    fn fuzz_fee_update_idempotency(
        initial_base in 0i128..1_000_000_000i128,
        initial_metadata in 0i128..1_000_000_000i128,
        new_base in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &initial_base, &initial_metadata);

        // Update fee multiple times with same value
        for _ in 0..5 {
            client.update_fees(&admin, &Some(new_base), &None);
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, new_base);
            prop_assert_eq!(state.metadata_fee, initial_metadata);
        }
    }

    #[test]
    fn fuzz_token_count_consistency(
        iterations in 0u32..10u32,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Token count should start at 0
        let initial_count = client.get_token_count();
        prop_assert_eq!(initial_count, 0);

        // Multiple reads should return same value
        for _ in 0..iterations {
            let count = client.get_token_count();
            prop_assert_eq!(count, initial_count);
        }
    }

    #[test]
    fn fuzz_get_nonexistent_token(
        index in 0u32..1000u32,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Getting any token should fail when none exist
        let result = client.try_get_token_info(&index);
        prop_assert!(result.is_err());
    }
}

// Manual edge case tests for specific scenarios
#[cfg(test)]
mod edge_cases {
    use super::*;

    #[test]
    fn test_max_fee_values() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Test with maximum safe i128 values
        let max_safe_fee = i128::MAX / 2;
        let result = client.try_initialize(&admin, &treasury, &max_safe_fee, &max_safe_fee);
        assert!(result.is_ok());
    }

    #[test]
    fn test_zero_fees() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Zero fees should be valid
        let result = client.try_initialize(&admin, &treasury, &0, &0);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 0);
        assert_eq!(state.metadata_fee, 0);
    }

    #[test]
    fn test_negative_fees_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Negative base fee
        let result = client.try_initialize(&admin, &treasury, &-1, &30_000_000);
        assert!(result.is_err());

        // Negative metadata fee
        let result = client.try_initialize(&admin, &treasury, &70_000_000, &-1);
        assert!(result.is_err());

        // Both negative
        let result = client.try_initialize(&admin, &treasury, &-1, &-1);
        assert!(result.is_err());
    }

    #[test]
    fn test_same_admin_and_treasury() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let same_address = Address::generate(&env);

        // Should be allowed to use same address for admin and treasury
        let result = client.try_initialize(&same_address, &same_address, &70_000_000, &30_000_000);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.admin, same_address);
        assert_eq!(state.treasury, same_address);
    }

    #[test]
    fn test_update_fees_with_none() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Update with both None should succeed but change nothing
        let result = client.try_update_fees(&admin, &None, &None);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 70_000_000);
        assert_eq!(state.metadata_fee, 30_000_000);
    }

    #[test]
    fn test_rapid_state_reads() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Rapid consecutive reads should all return consistent state
        for _ in 0..100 {
            let state = client.get_state();
            assert_eq!(state.admin, admin);
            assert_eq!(state.treasury, treasury);
            assert_eq!(state.base_fee, 70_000_000);
            assert_eq!(state.metadata_fee, 30_000_000);
        }
    }

    #[test]
    fn test_fee_boundary_values() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Test boundary: 1 stroop
        let result = client.try_initialize(&admin, &treasury, &1, &1);
        assert!(result.is_ok());
    }
}
