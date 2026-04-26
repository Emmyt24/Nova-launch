#[cfg(test)]
mod token_fractionalization_test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
        Address, BytesN, Env, String,
    };

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let owner = Address::generate(&env);

        // Initialize factory
        let factory = TokenFactoryClient::new(&env, &contract_id);
        factory.initialize(&admin, &treasury, &1_000_000, &500_000);

        (env, contract_id, admin, owner)
    }

    #[test]
    fn test_fractionalize_asset_success() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let total_supply = 1_000_000_0000000; // 1M tokens with 7 decimals
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // Test successful fractionalization
        let result = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        );

        assert!(result.is_ok());
        let (vault_id, fractional_token) = result.unwrap();
        assert_eq!(vault_id, 1);

        // Verify vault was created
        let vault = factory.get_fractional_vault(&vault_id).unwrap();
        assert_eq!(vault.asset_id, asset_id);
        assert_eq!(vault.owner, owner);
        assert_eq!(vault.total_supply, total_supply);
        assert_eq!(vault.status, types::FractionalStatus::Active);

        // Verify asset is marked as fractionalized
        assert!(factory.is_asset_fractionalized(&asset_id));

        // Verify authorization was required
        assert_eq!(
            env.auths(),
            std::vec![(
                owner.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        contract_id.clone(),
                        symbol_short!("frac_ast"),
                        (
                            owner.clone(),
                            asset_id.clone(),
                            asset_contract.clone(),
                            total_supply,
                            token_name.clone(),
                            token_symbol.clone(),
                        ).into_val(&env)
                    )),
                    sub_invocations: std::vec![]
                }
            )]
        );
    }

    #[test]
    fn test_fractionalize_asset_already_fractionalized() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let total_supply = 1_000_000_0000000;
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // First fractionalization should succeed
        factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        ).unwrap();

        // Second fractionalization should fail
        let result = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        );

        assert_eq!(result, Err(Ok(Error::AssetAlreadyFractionalized)));
    }

    #[test]
    fn test_fractionalize_asset_invalid_parameters() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // Test with zero supply
        let result = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &0,
            &token_name,
            &token_symbol,
        );

        assert_eq!(result, Err(Ok(Error::InvalidParameters)));

        // Test with negative supply
        let result = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &(-1000),
            &token_name,
            &token_symbol,
        );

        assert_eq!(result, Err(Ok(Error::InvalidParameters)));
    }

    #[test]
    fn test_redeem_asset_success() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let total_supply = 1_000_000_0000000;
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // Fractionalize asset
        let (vault_id, fractional_token) = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        ).unwrap();

        // Owner should have all fractional tokens
        let token_client = soroban_sdk::token::Client::new(&env, &fractional_token);
        let balance = token_client.balance(&owner);
        assert_eq!(balance, total_supply);

        // Test successful redemption
        let result = factory.redeem_asset(&owner, &vault_id);
        assert!(result.is_ok());

        // Verify vault status changed
        let vault = factory.get_fractional_vault(&vault_id).unwrap();
        assert_eq!(vault.status, types::FractionalStatus::Redeemed);

        // Verify asset is no longer marked as fractionalized
        assert!(!factory.is_asset_fractionalized(&asset_id));

        // Verify tokens were burned
        let balance_after = token_client.balance(&owner);
        assert_eq!(balance_after, 0);
    }

    #[test]
    fn test_redeem_asset_insufficient_tokens() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let total_supply = 1_000_000_0000000;
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // Fractionalize asset
        let (vault_id, fractional_token) = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        ).unwrap();

        // Transfer some tokens to another user
        let other_user = Address::generate(&env);
        let token_client = soroban_sdk::token::Client::new(&env, &fractional_token);
        token_client.transfer(&owner, &other_user, &(total_supply / 2));

        // Owner no longer has 100% of tokens, redemption should fail
        let result = factory.redeem_asset(&owner, &vault_id);
        assert_eq!(result, Err(Ok(Error::InsufficientFractionalTokens)));

        // Other user also doesn't have 100%, should fail
        let result = factory.redeem_asset(&other_user, &vault_id);
        assert_eq!(result, Err(Ok(Error::InsufficientFractionalTokens)));
    }

    #[test]
    fn test_redeem_asset_not_found() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        // Try to redeem non-existent vault
        let result = factory.redeem_asset(&owner, &999);
        assert_eq!(result, Err(Ok(Error::FractionalVaultNotFound)));
    }

    #[test]
    fn test_redeem_asset_already_redeemed() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let total_supply = 1_000_000_0000000;
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // Fractionalize and redeem asset
        let (vault_id, _) = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        ).unwrap();

        factory.redeem_asset(&owner, &vault_id).unwrap();

        // Try to redeem again
        let result = factory.redeem_asset(&owner, &vault_id);
        assert_eq!(result, Err(Ok(Error::AssetAlreadyRedeemed)));
    }

    #[test]
    fn test_get_fractional_vault() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let total_supply = 1_000_000_0000000;
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // Fractionalize asset
        let (vault_id, fractional_token) = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        ).unwrap();

        // Get vault info
        let vault = factory.get_fractional_vault(&vault_id).unwrap();
        assert_eq!(vault.id, vault_id);
        assert_eq!(vault.asset_id, asset_id);
        assert_eq!(vault.asset_contract, asset_contract);
        assert_eq!(vault.owner, owner);
        assert_eq!(vault.fractional_token, fractional_token);
        assert_eq!(vault.total_supply, total_supply);
        assert_eq!(vault.status, types::FractionalStatus::Active);
        assert!(vault.created_at > 0);

        // Test non-existent vault
        let result = factory.get_fractional_vault(&999);
        assert_eq!(result, Err(Ok(Error::FractionalVaultNotFound)));
    }

    #[test]
    fn test_is_asset_fractionalized() {
        let (env, contract_id, _admin, owner) = setup();
        let factory = TokenFactoryClient::new(&env, &contract_id);

        let asset_id = BytesN::from_array(&env, &[1u8; 32]);
        let asset_contract = Address::generate(&env);
        let total_supply = 1_000_000_0000000;
        let token_name = String::from_str(&env, "Fractional Art");
        let token_symbol = String::from_str(&env, "FART");

        // Initially not fractionalized
        assert!(!factory.is_asset_fractionalized(&asset_id));

        // Fractionalize asset
        let (vault_id, _) = factory.fractionalize_asset(
            &owner,
            &asset_id,
            &asset_contract,
            &total_supply,
            &token_name,
            &token_symbol,
        ).unwrap();

        // Now should be fractionalized
        assert!(factory.is_asset_fractionalized(&asset_id));

        // After redemption, should not be fractionalized
        factory.redeem_asset(&owner, &vault_id).unwrap();
        assert!(!factory.is_asset_fractionalized(&asset_id));
    }
}