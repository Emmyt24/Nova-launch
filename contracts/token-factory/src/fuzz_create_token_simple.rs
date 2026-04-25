//! Simplified fuzz tests for create_token function
//!
//! This module provides targeted fuzzing for token creation with focus on:
//! - String length boundaries (name, symbol, URI)
//! - Decimal bounds (0-18)
//! - Supply validation (positive only)
//! - Fee edge cases
//!
//! All tests use typed errors - no panics.

use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, String as SorobanString};

const FUZZ_ITERATIONS: u32 = 256;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(FUZZ_ITERATIONS))]

    /// Fuzz test: Name length boundaries (0, 1, 64, 65+)
    #[test]
    fn fuzz_name_length_boundaries(
        name_len in prop_oneof![Just(0usize), Just(1usize), Just(64usize), Just(65usize), Just(100usize)],
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        let name_str = "A".repeat(name_len);
        let name = SorobanString::from_str(&env, &name_str);
        let symbol = SorobanString::from_str(&env, "TEST");

        let result = client.try_create_token(
            &creator,
            &name,
            &symbol,
            &7u32,
            &1_000_000i128,
            &None,
            &70_000_000i128,
        );

        let is_valid = name_len > 0 && name_len <= 64;
        prop_assert_eq!(result.is_ok(), is_valid);
    }

    /// Fuzz test: Symbol length boundaries (0, 1, 12, 13+)
    #[test]
    fn fuzz_symbol_length_boundaries(
        symbol_len in prop_oneof![Just(0usize), Just(1usize), Just(12usize), Just(13usize), Just(20usize)],
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        let name = SorobanString::from_str(&env, "Test Token");
        let symbol_str = "A".repeat(symbol_len);
        let symbol = SorobanString::from_str(&env, &symbol_str);

        let result = client.try_create_token(
            &creator,
            &name,
            &symbol,
            &7u32,
            &1_000_000i128,
            &None,
            &70_000_000i128,
        );

        let is_valid = symbol_len > 0 && symbol_len <= 12;
        prop_assert_eq!(result.is_ok(), is_valid);
    }

    /// Fuzz test: Decimal bounds (0-18 valid, 19+ invalid)
    #[test]
    fn fuzz_decimal_bounds(
        decimals in prop_oneof![Just(0u32), Just(7u32), Just(18u32), Just(19u32), Just(100u32)],
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        let name = SorobanString::from_str(&env, "Test Token");
        let symbol = SorobanString::from_str(&env, "TEST");

        let result = client.try_create_token(
            &creator,
            &name,
            &symbol,
            &decimals,
            &1_000_000i128,
            &None,
            &70_000_000i128,
        );

        let is_valid = decimals <= 18;
        prop_assert_eq!(result.is_ok(), is_valid);
    }

    /// Fuzz test: Supply must be positive
    #[test]
    fn fuzz_supply_positive_only(
        supply in prop_oneof![
            Just(-1000i128),
            Just(-1i128),
            Just(0i128),
            Just(1i128),
            Just(1_000_000i128),
        ],
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        let name = SorobanString::from_str(&env, "Test Token");
        let symbol = SorobanString::from_str(&env, "TEST");

        let result = client.try_create_token(
            &creator,
            &name,
            &symbol,
            &7u32,
            &supply,
            &None,
            &70_000_000i128,
        );

        let is_valid = supply > 0;
        prop_assert_eq!(result.is_ok(), is_valid);
    }

    /// Fuzz test: Fee validation (insufficient vs sufficient)
    #[test]
    fn fuzz_fee_validation(
        fee in prop_oneof![
            Just(0i128),
            Just(69_999_999i128),
            Just(70_000_000i128),
            Just(70_000_001i128),
            Just(100_000_000i128),
        ],
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        let base_fee = 70_000_000i128;
        client.initialize(&admin, &treasury, &base_fee, &30_000_000);

        let name = SorobanString::from_str(&env, "Test Token");
        let symbol = SorobanString::from_str(&env, "TEST");

        let result = client.try_create_token(
            &creator,
            &name,
            &symbol,
            &7u32,
            &1_000_000i128,
            &None,
            &fee,
        );

        let is_valid = fee >= base_fee;
        prop_assert_eq!(result.is_ok(), is_valid);
    }

    /// Fuzz test: Metadata URI length boundaries (0, 1, 256, 257+)
    #[test]
    fn fuzz_metadata_uri_boundaries(
        uri_len in prop_oneof![Just(0usize), Just(1usize), Just(256usize), Just(257usize), Just(300usize)],
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        let base_fee = 70_000_000i128;
        let metadata_fee = 30_000_000i128;
        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        let name = SorobanString::from_str(&env, "Test Token");
        let symbol = SorobanString::from_str(&env, "TEST");

        let uri_str = "A".repeat(uri_len);
        let uri = if uri_len > 0 {
            Some(SorobanString::from_str(&env, &uri_str))
        } else {
            None
        };

        let required_fee = if uri.is_some() {
            base_fee + metadata_fee
        } else {
            base_fee
        };

        let result = client.try_create_token(
            &creator,
            &name,
            &symbol,
            &7u32,
            &1_000_000i128,
            &uri,
            &required_fee,
        );

        // URI is valid if None or 1-256 chars
        let is_valid = uri_len == 0 || (uri_len > 0 && uri_len <= 256);
        prop_assert_eq!(result.is_ok(), is_valid);
    }
}
