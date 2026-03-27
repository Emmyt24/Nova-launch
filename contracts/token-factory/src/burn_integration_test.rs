//! Integration tests for Burn Feature
//!
//! This module contains comprehensive integration tests for the burn functionality,
//! covering end-to-end workflows, cross-function tests, and edge cases.

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

#[cfg(test)]
mod end_to_end_workflows {
    use super::*;

    /// Test: Full token lifecycle with burn
    /// Covers: Create token → Burn → Verify supply
    #[test]
    fn test_full_token_lifecycle_with_burn() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create test token
        let _token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Get initial token info by index
        let initial_info = client.get_token_info(&0);
        assert_eq!(initial_info.total_supply, 1_000_000);
        assert_eq!(initial_info.total_burned, 0);
        assert_eq!(initial_info.burn_count, 0);

        // Burn tokens
        client.burn(&_token_address, &creator, &100_000);

        // Verify final state
        let final_info = client.get_token_info(&0);
        assert_eq!(final_info.total_supply, 900_000);
        assert_eq!(final_info.total_burned, 100_000);
        assert_eq!(final_info.burn_count, 1);
    }

    /// Test: Multiple users burning from the same token
    #[test]
    fn test_multiple_users_burning_same_token() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token with supply for multiple users
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // User1 burns tokens
        client.burn(&token_address, &user1, &100_000);
        
        // User2 burns tokens
        client.burn(&token_address, &user2, &50_000);

        // Verify combined burn state
        let info = client.get_token_info(&0);
        assert_eq!(info.total_supply, 850_000); // 1M - 100K - 50K
        assert_eq!(info.total_burned, 150_000);
        assert_eq!(info.burn_count, 2);
    }

    /// Test: Burn after metadata update
    #[test]
    fn test_burn_after_metadata_update() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &500_000,
        );

        // Verify initial metadata
        let info_before = client.get_token_info(&0);
        assert_eq!(info_before.name, String::from_str(&env, "Test Token"));

        // Burn tokens
        client.burn(&token_address, &creator, &100_000);

        // Verify metadata preserved after burn
        let info_after = client.get_token_info(&0);
        assert_eq!(info_after.name, info_before.name);
        assert_eq!(info_after.symbol, info_before.symbol);
        assert_eq!(info_after.total_burned, 100_000);
    }

    /// Test: Admin burn with proper authorization
    #[test]
    fn test_admin_burn_authorization() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token where creator = admin for admin_burn test
        let token_address = client.create_token(
            &admin, // Admin is creator
            &String::from_str(&env, "Admin Token"),
            &String::from_str(&env, "ADM"),
            &7,
            &1_000_000,
        );

        // Admin burns tokens from user (with admin auth)
        client.admin_burn(&token_address, &admin, &user, &50_000);

        // Verify burn occurred
        let info = client.get_token_info(&0);
        assert_eq!(info.total_supply, 950_000);
        assert_eq!(info.total_burned, 50_000);
        assert_eq!(info.burn_count, 1);
    }

    /// Test: Burn and mint in sequence (simulated via multiple burns)
    #[test]
    fn test_burn_and_mint_sequence() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Initial state
        let info1 = client.get_token_info(&0);
        assert_eq!(info1.total_supply, 1_000_000);
        assert_eq!(info1.total_burned, 0);

        // First burn
        client.burn(&token_address, &creator, &200_000);
        
        let info2 = client.get_token_info(&0);
        assert_eq!(info2.total_supply, 800_000);
        assert_eq!(info2.total_burned, 200_000);
        assert_eq!(info2.burn_count, 1);

        // Second burn
        client.burn(&token_address, &creator, &100_000);
        
        let info3 = client.get_token_info(&0);
        assert_eq!(info3.total_supply, 700_000);
        assert_eq!(info3.total_burned, 300_000);
        assert_eq!(info3.burn_count, 2);
    }

    /// Test: Batch burn operations
    #[test]
    fn test_batch_burn_operations() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token with large supply for batch burn
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Prepare batch burns: Vec<(Address, i128)>
        let burns = Vec::from_array(
            &env,
            [
                (user1.clone(), 50_000i128),
                (user2.clone(), 30_000i128),
                (user3.clone(), 20_000i128),
            ],
        );

        // Execute batch burn
        client.burn_batch(&token_address, &burns);

        // Verify batch burn results
        let info = client.get_token_info(&0);
        assert_eq!(info.total_supply, 900_000); // 1M - 100K total
        assert_eq!(info.total_burned, 100_000);
        assert_eq!(info.burn_count, 3);
    }
}

#[cfg(test)]
mod cross_function_tests {
    use super::*;

    /// Test: Burn affects get_token_info correctly
    #[test]
    fn test_burn_affects_get_token_info() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &500_000,
        );

        // Get token info by index
        let info_before = client.get_token_info(&0);
        assert_eq!(info_before.total_supply, 500_000);
        assert_eq!(info_before.total_burned, 0);

        // Burn tokens
        client.burn(&token_address, &creator, &100_000);

        // Get token info again - should reflect burn
        let info_after = client.get_token_info(&0);
        assert_eq!(info_after.total_supply, 400_000);
        assert_eq!(info_after.total_burned, 100_000);
        assert_eq!(info_after.burn_count, 1);
    }

    /// Test: Burn affects get_state correctly
    #[test]
    fn test_burn_affects_get_state() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Get initial factory state
        let state_before = client.get_state();
        assert_eq!(state_before.admin, admin);
        assert_eq!(state_before.treasury, treasury);
        assert_eq!(state_before.base_fee, 70_000_000);

        // Create token and burn
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );
        client.burn(&token_address, &creator, &100_000);

        // Factory state should be unchanged by burn (only token-specific data changes)
        let state_after = client.get_state();
        assert_eq!(state_after.admin, admin);
        assert_eq!(state_after.treasury, treasury);
        assert_eq!(state_after.base_fee, 70_000_000);
        assert_eq!(state_after.metadata_fee, 30_000_000);
    }

    /// Test: Burn after admin transfer (simulated)
    #[test]
    fn test_burn_after_admin_transfer() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let new_creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token with new creator
        let token_address = client.create_token(
            &new_creator,
            &String::from_str(&env, "Transferred Token"),
            &String::from_str(&env, "TRN"),
            &7,
            &1_000_000,
        );

        // New creator burns tokens
        client.burn(&token_address, &new_creator, &250_000);

        // Verify burn occurred
        let info = client.get_token_info(&0);
        assert_eq!(info.total_supply, 750_000);
        assert_eq!(info.total_burned, 250_000);
        assert_eq!(info.burn_count, 1);
    }

    /// Test: State consistency across multiple burns
    #[test]
    fn test_state_consistency_across_burns() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Perform multiple burns and verify state consistency
        let mut expected_supply = 1_000_000i128;
        let mut expected_burned = 0i128;
        let mut expected_count = 0u32;

        let burn_amounts = [100_000, 50_000, 25_000, 75_000, 250_000];

        for amount in burn_amounts {
            client.burn(&token_address, &creator, &amount);
            
            expected_supply -= amount;
            expected_burned += amount;
            expected_count += 1;

            // Verify state after each burn
            let info = client.get_token_info(&0);
            assert_eq!(
                info.total_supply, expected_supply,
                "Supply mismatch after burn of {}",
                amount
            );
            assert_eq!(
                info.total_burned, expected_burned,
                "Burned amount mismatch after burn of {}",
                amount
            );
            assert_eq!(
                info.burn_count, expected_count,
                "Burn count mismatch after burn of {}",
                amount
            );
        }

        // Final verification
        let final_info = client.get_token_info(&0);
        assert_eq!(final_info.total_supply, 500_000); // 1M - 500K
        assert_eq!(final_info.total_burned, 500_000);
        assert_eq!(final_info.burn_count, 5);
    }
}

#[cfg(test)]
mod error_cases {
    use super::*;

    /// Test: Burn with zero amount should fail
    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_burn_zero_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Attempt to burn zero - should panic with InvalidBurnAmount (#9)
        client.burn(&token_address, &creator, &0);
    }

    /// Test: Burn with negative amount should fail
    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_burn_negative_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Attempt to burn negative amount - should panic
        client.burn(&token_address, &creator, &-1000);
    }

    /// Test: Burn from non-existent token should fail
    #[test]
    #[should_panic]
    fn test_burn_nonexistent_token_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Attempt to burn from non-existent token
        let nonexistent_token = Address::generate(&env);
        client.burn(&nonexistent_token, &creator, &1000);
    }

    /// Test: Admin burn with unauthorized admin fails
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_admin_burn_unauthorized_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);
        let unauthorized_admin = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token with different creator
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Attempt admin burn with wrong admin - should panic with Unauthorized (#2)
        client.admin_burn(&token_address, &unauthorized_admin, &creator, &1000);
    }

    /// Test: Burn amount exceeding supply should fail (overflow protection)
    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_burn_exceeds_supply_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token with small supply
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000,
        );

        // Attempt to burn more than supply - should panic
        client.burn(&token_address, &creator, &2_000);
    }
}

#[cfg(test)]
mod performance_tests {
    use super::*;

    /// Test: Multiple rapid burns perform correctly
    #[test]
    fn test_rapid_burn_operations() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token with large supply
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &10_000_000,
        );

        // Perform 100 small burns
        for _ in 0..100 {
            client.burn(&token_address, &creator, &10_000);
        }

        // Verify final state
        let info = client.get_token_info(&0);
        assert_eq!(info.total_supply, 9_000_000); // 10M - 1M
        assert_eq!(info.total_burned, 1_000_000);
        assert_eq!(info.burn_count, 100);
    }

    /// Test: Batch burn performance
    #[test]
    fn test_batch_burn_performance() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Create token with large supply
        let token_address = client.create_token(
            &creator,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
            &7,
            &1_000_000,
        );

        // Create batch of burns
        let mut burns_vec: Vec<(Address, i128)> = Vec::new(&env);
        for i in 0..10 {
            let user = Address::generate(&env);
            burns_vec.push_back((user, 10_000 * (i + 1) as i128));
        }
        let burns = burns_vec;

        // Execute batch burn
        client.burn_batch(&token_address, &burns);

        // Verify
        let info = client.get_token_info(&0);
        assert_eq!(info.total_supply, 450_000); // 1M - 550K
        assert_eq!(info.total_burned, 550_000);
        assert_eq!(info.burn_count, 10);
    }
}
