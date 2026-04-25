/// Supply Cap Enforcement Tests
///
/// Verifies that the hard supply cap (max_supply) is correctly enforced at:
/// 1. Token creation — initial_supply must not exceed max_supply
/// 2. Minting — cumulative supply must never exceed max_supply
/// 3. Unlimited tokens — no cap means minting is unrestricted
#[cfg(test)]
mod tests {
    use crate::{storage, TokenFactory};
    use soroban_sdk::{
        testutils::Address as _,
        Address, Env, String,
    };

    // ── helpers ──────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000_i128, &30_000_000_i128);

        (env, contract_id, admin, creator)
    }

    /// Create a token via batch_create_tokens (the only public creation path).
    fn create_token_with_cap(
        env: &Env,
        contract_id: &Address,
        creator: &Address,
        initial_supply: i128,
        max_supply: Option<i128>,
    ) -> Result<Address, crate::types::Error> {
        let client = crate::TokenFactoryClient::new(env, contract_id);
        let params = crate::types::TokenCreationParams {
            name: String::from_str(env, "CapToken"),
            symbol: String::from_str(env, "CAP"),
            decimals: 7,
            initial_supply,
            max_supply,
            metadata_uri: None,
        };
        let addresses = client.try_set_metadata(
            creator,
            &soroban_sdk::vec![env, params],
            &70_000_000_i128,
        )?;
        Ok(addresses.get(0).unwrap())
    }

    // ── Creation-time validation ─────────────────────────────────────────────

    /// max_supply == initial_supply is the tightest valid cap.
    #[test]
    fn creation_max_supply_equal_to_initial_supply_is_valid() {
        let (env, contract_id, _admin, creator) = setup();
        let result = create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(1_000_000));
        assert!(result.is_ok(), "max_supply == initial_supply must be accepted");
    }

    /// max_supply > initial_supply is the normal case.
    #[test]
    fn creation_max_supply_greater_than_initial_supply_is_valid() {
        let (env, contract_id, _admin, creator) = setup();
        let result = create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(10_000_000));
        assert!(result.is_ok(), "max_supply > initial_supply must be accepted");
    }

    /// max_supply < initial_supply must be rejected with InvalidMaxSupply.
    #[test]
    fn creation_max_supply_less_than_initial_supply_is_rejected() {
        let (env, contract_id, _admin, creator) = setup();
        let result = create_token_with_cap(&env, &contract_id, &creator, 5_000_000, Some(1_000_000));
        assert_eq!(
            result,
            Err(crate::types::Error::InvalidMaxSupply),
            "max_supply < initial_supply must return InvalidMaxSupply"
        );
    }

    /// No max_supply (unlimited) is always valid.
    #[test]
    fn creation_no_max_supply_is_valid() {
        let (env, contract_id, _admin, creator) = setup();
        let result = create_token_with_cap(&env, &contract_id, &creator, 1_000_000, None);
        assert!(result.is_ok(), "unlimited supply must be accepted");
    }

    /// max_supply is persisted in TokenInfo after creation.
    #[test]
    fn creation_max_supply_is_persisted_in_token_info() {
        let (env, contract_id, _admin, creator) = setup();
        let token_addr =
            create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(5_000_000))
                .unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let info = client.get_token_info_by_address(&token_addr);
        assert_eq!(info.max_supply, Some(5_000_000));
        assert_eq!(info.total_supply, 1_000_000);
    }

    /// Unlimited token has None max_supply in TokenInfo.
    #[test]
    fn creation_unlimited_token_has_none_max_supply() {
        let (env, contract_id, _admin, creator) = setup();
        let token_addr =
            create_token_with_cap(&env, &contract_id, &creator, 1_000_000, None).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let info = client.get_token_info_by_address(&token_addr);
        assert_eq!(info.max_supply, None);
    }

    // ── Mint-time enforcement ────────────────────────────────────────────────

    /// Minting within the remaining cap succeeds.
    #[test]
    fn mint_within_cap_succeeds() {
        let (env, contract_id, _admin, creator) = setup();
        // initial 1M, cap 3M → 2M remaining
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(3_000_000)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let recipient = Address::generate(&env);
        let result = client.try_mint(&creator, &0_u32, &recipient, &1_000_000_i128);
        assert!(result.is_ok(), "mint within cap must succeed");
    }

    /// Minting exactly to the cap succeeds.
    #[test]
    fn mint_exactly_to_cap_succeeds() {
        let (env, contract_id, _admin, creator) = setup();
        // initial 1M, cap 2M → exactly 1M remaining
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(2_000_000)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let recipient = Address::generate(&env);
        let result = client.try_mint(&creator, &0_u32, &recipient, &1_000_000_i128);
        assert!(result.is_ok(), "minting exactly to cap must succeed");

        let info = client.get_token_info(&0_u32).unwrap();
        assert_eq!(info.total_supply, 2_000_000);
    }

    /// Minting one token over the cap is rejected with MaxSupplyExceeded.
    #[test]
    fn mint_one_over_cap_is_rejected() {
        let (env, contract_id, _admin, creator) = setup();
        // initial 1M, cap 2M → 1M remaining; try to mint 1M+1
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(2_000_000)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let recipient = Address::generate(&env);
        let result = client.try_mint(&creator, &0_u32, &recipient, &1_000_001_i128);
        assert_eq!(
            result,
            Err(Ok(crate::types::Error::MaxSupplyExceeded)),
            "minting over cap must return MaxSupplyExceeded"
        );
    }

    /// Supply is unchanged after a rejected mint.
    #[test]
    fn mint_over_cap_does_not_change_supply() {
        let (env, contract_id, _admin, creator) = setup();
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(2_000_000)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let recipient = Address::generate(&env);
        let _ = client.try_mint(&creator, &0_u32, &recipient, &2_000_000_i128); // over cap

        let info = client.get_token_info(&0_u32).unwrap();
        assert_eq!(info.total_supply, 1_000_000, "supply must be unchanged after rejected mint");
    }

    /// When cap is already reached, any further mint is rejected.
    #[test]
    fn mint_when_cap_already_reached_is_rejected() {
        let (env, contract_id, _admin, creator) = setup();
        // initial == cap → no room to mint
        create_token_with_cap(&env, &contract_id, &creator, 2_000_000, Some(2_000_000)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let recipient = Address::generate(&env);
        let result = client.try_mint(&creator, &0_u32, &recipient, &1_i128);
        assert_eq!(
            result,
            Err(Ok(crate::types::Error::MaxSupplyExceeded)),
            "minting when cap is reached must return MaxSupplyExceeded"
        );
    }

    /// Unlimited token can be minted beyond any reasonable amount.
    #[test]
    fn mint_unlimited_token_has_no_cap() {
        let (env, contract_id, _admin, creator) = setup();
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, None).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let recipient = Address::generate(&env);
        // Mint a very large amount — should succeed with no cap
        let result = client.try_mint(&creator, &0_u32, &recipient, &1_000_000_000_i128);
        assert!(result.is_ok(), "unlimited token must accept large mints");
    }

    // ── get_remaining_mintable ───────────────────────────────────────────────

    /// get_remaining_mintable returns correct remaining amount.
    #[test]
    fn get_remaining_mintable_returns_correct_value() {
        let (env, contract_id, _admin, creator) = setup();
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(3_000_000)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let remaining = client.get_remaining_mintable(&0_u32);
        assert_eq!(remaining, Some(2_000_000));
    }

    /// get_remaining_mintable returns None for unlimited tokens.
    #[test]
    fn get_remaining_mintable_returns_none_for_unlimited() {
        let (env, contract_id, _admin, creator) = setup();
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, None).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let remaining = client.get_remaining_mintable(&0_u32);
        assert_eq!(remaining, None);
    }

    /// get_remaining_mintable returns 0 when cap is exactly reached.
    #[test]
    fn get_remaining_mintable_returns_zero_at_cap() {
        let (env, contract_id, _admin, creator) = setup();
        create_token_with_cap(&env, &contract_id, &creator, 2_000_000, Some(2_000_000)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let remaining = client.get_remaining_mintable(&0_u32);
        assert_eq!(remaining, Some(0));
    }

    // ── Supply conservation invariant ────────────────────────────────────────

    /// After multiple mints, total_supply never exceeds max_supply.
    #[test]
    fn supply_never_exceeds_max_after_multiple_mints() {
        let (env, contract_id, _admin, creator) = setup();
        let cap = 3_000_000_i128;
        create_token_with_cap(&env, &contract_id, &creator, 1_000_000, Some(cap)).unwrap();

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let recipient = Address::generate(&env);

        // Mint 1M (total 2M)
        client.mint(&creator, &0_u32, &recipient, &1_000_000_i128);
        // Mint 1M (total 3M — exactly at cap)
        client.mint(&creator, &0_u32, &recipient, &1_000_000_i128);
        // Attempt to mint 1 more — must fail
        let result = client.try_mint(&creator, &0_u32, &recipient, &1_i128);
        assert!(result.is_err(), "supply must not exceed cap");

        let info = client.get_token_info(&0_u32).unwrap();
        assert!(info.total_supply <= cap, "total_supply must never exceed max_supply");
    }
}
