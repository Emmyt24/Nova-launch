#[cfg(test)]
mod pause_tests {
    use crate::{TokenFactory, TokenFactoryClient};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_pause_success() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_0000000, &50_0000000);

        // Initially not paused
        assert!(!client.is_paused());

        // Pause contract
        client.pause(&admin);

        // Verify paused
        assert!(client.is_paused());
        let state = client.get_state();
        assert!(state.paused);
    }

    #[test]
    fn test_unpause_success() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_0000000, &50_0000000);

        // Pause then unpause
        client.pause(&admin);
        assert!(client.is_paused());

        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_pause_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_0000000, &50_0000000);

        // Unauthorized user cannot pause
        client.pause(&unauthorized);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_unpause_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_0000000, &50_0000000);
        client.pause(&admin);

        // Unauthorized user cannot unpause
        client.unpause(&unauthorized);
    }

    #[test]
    fn test_update_fees_works_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_0000000, &50_0000000);
        client.pause(&admin);

        // Admin functions should still work when paused
        client.update_fees(&admin, &Some(200_0000000), &None);

        let state = client.get_state();
        assert_eq!(state.base_fee, 200_0000000);
    }

    #[test]
    fn test_multiple_pause_unpause_cycles() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_0000000, &50_0000000);

        // Multiple cycles
        for _ in 0..3 {
            client.pause(&admin);
            assert!(client.is_paused());

            client.unpause(&admin);
            assert!(!client.is_paused());
        }
    }
}
