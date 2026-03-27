#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use crate::{TokenFactory, TokenFactoryClient};

    fn setup() -> (Env, TokenFactoryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury, &1_000_000i128, &500_000i128);
        (env, client)
    }

    /// Test: get_token_count returns 0 on fresh contract
    #[test]
    fn test_get_token_count_initial_zero() {
        let (_env, client) = setup();
        assert_eq!(client.get_token_count(), 0u32);
    }

    /// Test: get_token_count return type is u32
    #[test]
    fn test_get_token_count_returns_u32() {
        let (_env, client) = setup();
        let count: u32 = client.get_token_count();
        assert_eq!(count, 0u32);
    }

    /// Test: get_token_count is consistent across multiple calls
    #[test]
    fn test_get_token_count_idempotent() {
        let (_env, client) = setup();
        assert_eq!(client.get_token_count(), client.get_token_count());
    }
}
