use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

/// Strategy for generating various metadata URIs
fn metadata_uri_strategy() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just("ipfs://QmTest1234567890"),
        Just("https://nova-launch.io/metadata/token1.json"),
        Just("ar://abcd1234efgh"),
        Just("ipfs://bafybeigdyrzt5sfp7udm7drttvve")
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(350))]

    /// Property: Metadata cannot be changed once set
    ///
    /// Requirement:
    /// - Generate tokens with metadata
    /// - Attempt to change metadata
    /// - Verify operation fails with MetadataAlreadySet error
    /// - Verify original metadata remains unchanged
    #[test]
    fn prop_metadata_immutability(
        initial_uri in metadata_uri_strategy(),
        new_uri in metadata_uri_strategy(),
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

        // 1. Create a token with initial metadata
        let initial_metadata = String::from_str(&env, initial_uri);
        let result = client.try_create_token(
            &creator,
            &String::from_str(&env, "PropTest"),
            &String::from_str(&env, "PROP"),
            &7,
            &1_000_000_000,
            &Some(initial_metadata.clone()),
            &(base_fee + metadata_fee),
        );

        prop_assert!(result.is_ok(), "Initial token creation should succeed");

        // Final verification: metadata is set
        let token_index = 0;
        let info = client.get_token_info(&token_index);
        prop_assert_eq!(info.metadata_uri, Some(initial_metadata.clone()), "Initial metadata should be stored");

        // 2. Attempt to change metadata
        let attempt_metadata = String::from_str(&env, new_uri);
        let update_result = client.try_set_metadata(&token_index, &attempt_metadata);

        // 3. Verify operation fails
        prop_assert!(update_result.is_err(), "Operation should have failed");

        // 4. Verify original metadata remains unchanged
        let final_info = client.get_token_info(&token_index);
        prop_assert_eq!(final_info.metadata_uri, Some(initial_metadata), "Original metadata must remain unchanged");
    }
}
