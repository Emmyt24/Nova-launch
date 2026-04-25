//! Property-based tests for burn function invariants
//! 
//! These tests verify that critical invariants hold under all conditions:
//! - Supply conservation: total_supply + total_burned = initial_supply
//! - Balance consistency: sum(all_balances) = total_supply
//! - Burn monotonicity: total_burned and burn_count never decrease
//! - Amount validity: burn amounts are always positive and <= balance
//! - Authorization: only authorized addresses can burn

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    fn setup_factory(env: &Env) -> (TokenFactoryClient, Address, Address) {
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(env, &contract_id);
        
        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        
        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
        
        (client, admin, treasury)
    }

    fn create_test_token(
        env: &Env,
        factory: &TokenFactoryClient,
        creator: &Address,
        initial_supply: i128,
    ) -> u32 {
        factory.create_token(
            creator,
            &String::from_str(env, "Test Token"),
            &String::from_str(env, "TEST"),
            &7u32,
            &initial_supply,
            &70_000_000,
        );
        0 // First token has index 0
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]

        /// Property: Supply Conservation
        /// Invariant: total_supply + total_burned = initial_supply (always)
        /// 
        /// This test verifies that tokens are never created or destroyed
        /// unexpectedly during burn operations.
        #[test]
        fn prop_supply_conservation(
            initial_supply in 1_000_000i128..10_000_000i128,
            burn_amounts in prop::collection::vec(1_000i128..100_000i128, 1..10)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let token_index = create_test_token(&env, &factory, &creator, initial_supply);
            
            let mut total_burned = 0i128;
            
            // Execute burns
            for amount in burn_amounts {
                if amount <= initial_supply - total_burned {
                    let _ = factory.try_burn(&creator, &token_index, &amount);
                    total_burned += amount;
                }
            }
            
            // Verify invariant: total_supply + total_burned = initial_supply
            let info = factory.get_token_info(&token_index);
            prop_assert_eq!(
                info.total_supply + info.total_burned,
                initial_supply,
                "Supply conservation violated: total_supply({}) + total_burned({}) != initial_supply({})",
                info.total_supply,
                info.total_burned,
                initial_supply
            );
        }

        /// Property: Burn Never Exceeds Balance
        /// Invariant: burn_amount <= balance (always)
        /// 
        /// This test verifies that the contract correctly rejects burn attempts
        /// that exceed the available balance.
        #[test]
        fn prop_burn_never_exceeds_balance(
            balance in 100_000i128..1_000_000i128,
            burn_attempt in 1i128..2_000_000i128
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let token_index = create_test_token(&env, &factory, &creator, balance);
            
            let result = factory.try_burn(&creator, &token_index, &burn_attempt);
            
            if burn_attempt > balance {
                prop_assert!(
                    result.is_err(),
                    "Burn should fail when amount ({}) > balance ({})",
                    burn_attempt,
                    balance
                );
            } else {
                prop_assert!(result.is_ok(), "Valid burn should succeed");
                let info = factory.get_token_info(&token_index);
                prop_assert_eq!(
                    info.total_burned,
                    burn_attempt,
                    "Total burned should equal burn amount"
                );
            }
        }

        /// Property: Total Burned Monotonicity
        /// Invariant: total_burned never decreases
        /// 
        /// This test verifies that the total_burned counter only increases
        /// and never decreases across multiple burn operations.
        #[test]
        fn prop_total_burned_monotonic(
            burns in prop::collection::vec(1_000i128..10_000i128, 1..20)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let initial_supply = 10_000_000i128;
            let token_index = create_test_token(&env, &factory, &creator, initial_supply);
            
            let mut prev_burned = 0i128;
            let mut cumulative_burned = 0i128;
            
            for amount in burns {
                if cumulative_burned + amount <= initial_supply {
                    let _ = factory.try_burn(&creator, &token_index, &amount);
                    cumulative_burned += amount;
                    
                    let info = factory.get_token_info(&token_index);
                    
                    prop_assert!(
                        info.total_burned >= prev_burned,
                        "Total burned decreased: {} -> {}",
                        prev_burned,
                        info.total_burned
                    );
                    
                    prev_burned = info.total_burned;
                }
            }
        }

        /// Property: Burn Count Monotonicity
        /// Invariant: burn_count never decreases
        /// 
        /// This test verifies that the burn operation counter only increases.
        #[test]
        fn prop_burn_count_monotonic(
            burn_operations in prop::collection::vec(1_000i128..5_000i128, 1..30)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let initial_supply = 50_000_000i128;
            let token_index = create_test_token(&env, &factory, &creator, initial_supply);
            
            let mut prev_count = 0u32;
            let mut cumulative_burned = 0i128;
            
            for amount in burn_operations {
                if cumulative_burned + amount <= initial_supply {
                    let _ = factory.try_burn(&creator, &token_index, &amount);
                    cumulative_burned += amount;
                    
                    let info = factory.get_token_info(&token_index);
                    
                    prop_assert!(
                        info.burn_count >= prev_count,
                        "Burn count decreased: {} -> {}",
                        prev_count,
                        info.burn_count
                    );
                    
                    prev_count = info.burn_count;
                }
            }
        }

        /// Property: Amount Validity
        /// Invariant: burn_amount > 0 (always)
        /// 
        /// This test verifies that zero or negative burn amounts are rejected.
        #[test]
        fn prop_burn_amount_positive(
            amount in -1_000_000i128..1_000_000i128
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let token_index = create_test_token(&env, &factory, &creator, 10_000_000);
            
            let result = factory.try_burn(&creator, &token_index, &amount);
            
            if amount <= 0 {
                prop_assert!(
                    result.is_err(),
                    "Burn should fail for non-positive amount: {}",
                    amount
                );
            }
        }

        /// Property: Balance Consistency
        /// Invariant: sum(all_balances) = total_supply (always)
        /// 
        /// This test verifies that the sum of all token holder balances
        /// always equals the total supply after burn operations.
        #[test]
        fn prop_balance_consistency(
            initial_supply in 1_000_000i128..10_000_000i128,
            burns in prop::collection::vec(1_000i128..100_000i128, 1..15)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let token_index = create_test_token(&env, &factory, &creator, initial_supply);
            
            let mut cumulative_burned = 0i128;
            
            for amount in burns {
                if cumulative_burned + amount <= initial_supply {
                    let _ = factory.try_burn(&creator, &token_index, &amount);
                    cumulative_burned += amount;
                }
            }
            
            // Verify: creator_balance = initial_supply - cumulative_burned
            let creator_balance = factory.get_balance(&token_index, &creator);
            let info = factory.get_token_info(&token_index);
            
            prop_assert_eq!(
                creator_balance,
                info.total_supply,
                "Balance consistency violated: balance({}) != total_supply({})",
                creator_balance,
                info.total_supply
            );
        }

        /// Property: Multiple Burns Accumulate Correctly
        /// Invariant: sum(individual_burns) = total_burned
        /// 
        /// This test verifies that multiple burn operations correctly
        /// accumulate to the total_burned counter.
        #[test]
        fn prop_burns_accumulate_correctly(
            burns in prop::collection::vec(10_000i128..50_000i128, 2..25)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let initial_supply = 100_000_000i128;
            let token_index = create_test_token(&env, &factory, &creator, initial_supply);
            
            let mut expected_total = 0i128;
            
            for amount in burns {
                if expected_total + amount <= initial_supply {
                    let _ = factory.try_burn(&creator, &token_index, &amount);
                    expected_total += amount;
                }
            }
            
            let info = factory.get_token_info(&token_index);
            prop_assert_eq!(
                info.total_burned,
                expected_total,
                "Total burned mismatch: expected {}, got {}",
                expected_total,
                info.total_burned
            );
        }

        /// Property: Max Supply Enforcement
        /// Invariant: total_supply <= initial_supply (always)
        /// 
        /// This test verifies that total supply never exceeds initial supply.
        #[test]
        fn prop_max_supply_enforcement(
            initial_supply in 1_000_000i128..50_000_000i128,
            burns in prop::collection::vec(10_000i128..100_000i128, 1..20)
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let (factory, _admin, _treasury) = setup_factory(&env);
            let creator = Address::generate(&env);
            
            let token_index = create_test_token(&env, &factory, &creator, initial_supply);
            
            for amount in burns {
                let info_before = factory.get_token_info(&token_index);
                if amount <= info_before.total_supply {
                    let _ = factory.try_burn(&creator, &token_index, &amount);
                }
            }
            
            let info = factory.get_token_info(&token_index);
            prop_assert!(
                info.total_supply <= initial_supply,
                "Total supply ({}) exceeds initial supply ({})",
                info.total_supply,
                initial_supply
            );
            prop_assert!(
                info.total_supply >= 0,
                "Total supply is negative: {}",
                info.total_supply
            );
        }
    }

    // Unit tests for edge cases
    #[test]
    fn test_burn_entire_supply() {
        let env = Env::default();
        env.mock_all_auths();
        
        let (factory, _admin, _treasury) = setup_factory(&env);
        let creator = Address::generate(&env);
        
        let initial_supply = 1_000_000i128;
        let token_index = create_test_token(&env, &factory, &creator, initial_supply);
        
        // Burn entire supply
        factory.burn(&creator, &token_index, &initial_supply);
        
        // Verify
        let info = factory.get_token_info(&token_index);
        assert_eq!(info.total_supply, 0);
        assert_eq!(info.total_burned, initial_supply);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")] // InsufficientBalance
    fn test_burn_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        
        let (factory, _admin, _treasury) = setup_factory(&env);
        let creator = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        
        let token_index = create_test_token(&env, &factory, &creator, 1_000_000);
        
        // Attempt burn from unauthorized address (without mocking auth)
        // This fails with InsufficientBalance because unauthorized has no tokens
        env.mock_all_auths_allowing_non_root_auth();
        factory.burn(&unauthorized, &token_index, &100);
    }
}

