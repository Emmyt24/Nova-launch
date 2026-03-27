//! Smart Contract Security Tests
//! Tests for common smart contract vulnerabilities

#[cfg(test)]
mod security_tests {
    use crate::{TokenFactory, TokenFactoryClient};
    use soroban_sdk::{
        testutils::Address as _,
        Address, Env,
    };

    fn setup_test_env() -> (Env, TokenFactoryClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        (env, client, admin, treasury)
    }

    #[test]
    fn test_initialization_security() {
        let (_env, client, admin, treasury) = setup_test_env();

        // Verify state is set correctly
        let state = client.get_state();
        assert_eq!(state.admin, admin);
        assert_eq!(state.treasury, treasury);
        assert_eq!(state.base_fee, 70_000_000);
        assert_eq!(state.metadata_fee, 30_000_000);
    }

    #[test]
    #[should_panic]
    fn test_double_initialization_protection() {
        let (_env, client, admin, treasury) = setup_test_env();

        // Attempt to initialize again should fail
        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    }

    #[test]
    fn test_access_control_admin_only() {
        let (_env, client, admin, _) = setup_test_env();

        // Admin can update fees
        client.update_fees(&admin, &Some(100_000_000), &None);
        
        let state = client.get_state();
        assert_eq!(state.base_fee, 100_000_000);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_fee_update() {
        let (_env, client, _admin, _) = setup_test_env();
        let attacker = Address::generate(&_env);

        // Non-admin should not be able to update fees
        client.update_fees(&attacker, &Some(100_000_000), &None);
    }

    #[test]
    fn test_fee_validation() {
        let (_env, client, admin, _) = setup_test_env();

        // Valid fee updates should work
        client.update_fees(&admin, &Some(100_000_000), &Some(50_000_000));
        
        let state = client.get_state();
        assert_eq!(state.base_fee, 100_000_000);
        assert_eq!(state.metadata_fee, 50_000_000);
    }

    #[test]
    fn test_admin_transfer_security() {
        let (_env, client, admin, _) = setup_test_env();
        let new_admin = Address::generate(&_env);

        // Admin can transfer admin rights
        client.transfer_admin(&admin, &new_admin);
        
        let state = client.get_state();
        assert_eq!(state.admin, new_admin);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_admin_transfer() {
        let (_env, client, _admin, _) = setup_test_env();
        let attacker = Address::generate(&_env);
        let new_admin = Address::generate(&_env);

        // Non-admin should not be able to transfer admin rights
        client.transfer_admin(&attacker, &new_admin);
    }

    #[test]
    fn test_pause_functionality() {
        let (_env, client, admin, _) = setup_test_env();

        // Admin can pause
        client.pause(&admin);
        
        let state = client.get_state();
        assert_eq!(state.paused, true);
    }

    #[test]
    fn test_unpause_functionality() {
        let (_env, client, admin, _) = setup_test_env();

        // Pause first
        client.pause(&admin);
        
        // Then unpause
        client.unpause(&admin);
        
        let state = client.get_state();
        assert_eq!(state.paused, false);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_pause() {
        let (_env, client, _admin, _) = setup_test_env();
        let attacker = Address::generate(&_env);

        // Non-admin should not be able to pause
        client.pause(&attacker);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_unpause() {
        let (_env, client, admin, _) = setup_test_env();
        let attacker = Address::generate(&_env);

        // Pause first
        client.pause(&admin);

        // Non-admin should not be able to unpause
        client.unpause(&attacker);
    }

    #[test]
    fn test_state_consistency() {
        let (_env, client, admin, treasury) = setup_test_env();

        // Verify initial state
        let state = client.get_state();
        assert_eq!(state.admin, admin);
        assert_eq!(state.treasury, treasury);
        assert_eq!(state.paused, false);
        
        // Perform operations
        client.pause(&admin);
        client.unpause(&admin);
        
        // State should still be consistent
        let state = client.get_state();
        assert_eq!(state.admin, admin);
        assert_eq!(state.treasury, treasury);
        assert_eq!(state.paused, false);
    }

    #[test]
    fn test_integer_overflow_protection() {
        let (_env, client, admin, _) = setup_test_env();

        // Test with maximum i128 value
        let max_fee = i128::MAX;
        client.update_fees(&admin, &Some(max_fee), &Some(max_fee));
        
        let state = client.get_state();
        assert_eq!(state.base_fee, max_fee);
        assert_eq!(state.metadata_fee, max_fee);
    }

    #[test]
    fn test_zero_fee_handling() {
        let (_env, client, admin, _) = setup_test_env();

        // Zero fees should be allowed
        client.update_fees(&admin, &Some(0), &Some(0));
        
        let state = client.get_state();
        assert_eq!(state.base_fee, 0);
        assert_eq!(state.metadata_fee, 0);
    }

    #[test]
    fn test_partial_fee_update() {
        let (_env, client, admin, _) = setup_test_env();

        // Update only base fee
        client.update_fees(&admin, &Some(150_000_000), &None);
        
        let state = client.get_state();
        assert_eq!(state.base_fee, 150_000_000);
        assert_eq!(state.metadata_fee, 30_000_000); // Should remain unchanged
        
        // Update only metadata fee
        client.update_fees(&admin, &None, &Some(60_000_000));
        
        let state = client.get_state();
        assert_eq!(state.base_fee, 150_000_000); // Should remain unchanged
        assert_eq!(state.metadata_fee, 60_000_000);
    }
}
