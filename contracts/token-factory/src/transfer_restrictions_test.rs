/// Transfer Restrictions Tests — Whitelist / Blacklist via Freeze
///
/// Covers:
/// - set_freeze_enabled: enable/disable, auth, paused
/// - freeze_address: success, already frozen, freeze-not-enabled, unauthorized, paused, token-not-found
/// - unfreeze_address: success, not-frozen, freeze-not-enabled, unauthorized, paused
/// - is_address_frozen: default false, after freeze, after unfreeze
/// - Multi-address independence
/// - Freeze state persists when freeze capability is disabled
/// - Storage cleanup: entry removed on unfreeze
#[cfg(test)]
mod tests {
    use crate::{storage, types::DataKey, types::TokenInfo, TokenFactory, TokenFactoryClient};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    // ── helpers ──────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &1_000_000_i128, &500_000_i128);

        (env, contract_id, admin, treasury)
    }

    /// Register a TokenInfo directly in storage (avoids needing a real token deploy).
    fn register_token(
        env: &Env,
        contract_id: &Address,
        token_address: &Address,
        creator: &Address,
        freeze_enabled: bool,
    ) {
        let info = TokenInfo {
            address: token_address.clone(),
            creator: creator.clone(),
            name: String::from_str(env, "Test Token"),
            symbol: String::from_str(env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled,
        };
        env.as_contract(contract_id, || {
            env.storage()
                .instance()
                .set(&DataKey::TokenByAddress(token_address.clone()), &info);
        });
    }

    // ── set_freeze_enabled ───────────────────────────────────────────────────

    #[test]
    fn set_freeze_enabled_enables_freeze() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, false);

        client.set_freeze_enabled(&token, &admin, &true);

        // Verify stored flag
        let info: TokenInfo = env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .get(&DataKey::TokenByAddress(token.clone()))
                .unwrap()
        });
        assert!(info.freeze_enabled);
    }

    #[test]
    fn set_freeze_enabled_disables_freeze() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.set_freeze_enabled(&token, &admin, &false);

        let info: TokenInfo = env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .get(&DataKey::TokenByAddress(token.clone()))
                .unwrap()
        });
        assert!(!info.freeze_enabled);
    }

    #[test]
    fn set_freeze_enabled_unauthorized_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let attacker = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, false);

        let result = client.try_set_freeze_enabled(&token, &attacker, &true);
        assert!(result.is_err());
    }

    #[test]
    fn set_freeze_enabled_token_not_found_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let nonexistent = Address::generate(&env);

        let result = client.try_set_freeze_enabled(&nonexistent, &admin, &true);
        assert!(result.is_err());
    }

    #[test]
    fn set_freeze_enabled_when_paused_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, false);

        client.pause(&admin);
        let result = client.try_set_freeze_enabled(&token, &admin, &true);
        assert!(result.is_err());
    }

    // ── freeze_address ───────────────────────────────────────────────────────

    #[test]
    fn freeze_address_success() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);

        assert!(client.is_address_frozen(&token, &user));
    }

    #[test]
    fn freeze_address_emits_event() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);

        let events = env.events().all();
        assert!(!events.is_empty(), "freeze event must be emitted");
    }

    #[test]
    fn freeze_address_already_frozen_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        let result = client.try_freeze_address(&token, &admin, &user);
        assert!(result.is_err(), "freezing an already-frozen address must fail");
    }

    #[test]
    fn freeze_address_freeze_not_enabled_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, false); // freeze disabled

        let result = client.try_freeze_address(&token, &admin, &user);
        assert!(result.is_err(), "freeze must fail when freeze_enabled is false");
    }

    #[test]
    fn freeze_address_unauthorized_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let attacker = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        let result = client.try_freeze_address(&token, &attacker, &user);
        assert!(result.is_err());
    }

    #[test]
    fn freeze_address_when_paused_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.pause(&admin);
        let result = client.try_freeze_address(&token, &admin, &user);
        assert!(result.is_err());
    }

    #[test]
    fn freeze_address_token_not_found_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let nonexistent = Address::generate(&env);
        let user = Address::generate(&env);

        let result = client.try_freeze_address(&nonexistent, &admin, &user);
        assert!(result.is_err());
    }

    // ── unfreeze_address ─────────────────────────────────────────────────────

    #[test]
    fn unfreeze_address_success() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        assert!(client.is_address_frozen(&token, &user));

        client.unfreeze_address(&token, &admin, &user);
        assert!(!client.is_address_frozen(&token, &user));
    }

    #[test]
    fn unfreeze_address_emits_event() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        let events_before = env.events().all().len();

        client.unfreeze_address(&token, &admin, &user);

        assert!(
            env.events().all().len() > events_before,
            "unfreeze event must be emitted"
        );
    }

    #[test]
    fn unfreeze_address_not_frozen_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        let result = client.try_unfreeze_address(&token, &admin, &user);
        assert!(result.is_err(), "unfreezing a non-frozen address must fail");
    }

    #[test]
    fn unfreeze_address_freeze_not_enabled_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, false);

        let result = client.try_unfreeze_address(&token, &admin, &user);
        assert!(result.is_err());
    }

    #[test]
    fn unfreeze_address_unauthorized_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let attacker = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        let result = client.try_unfreeze_address(&token, &attacker, &user);
        assert!(result.is_err());
    }

    #[test]
    fn unfreeze_address_when_paused_rejected() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        client.pause(&admin);

        let result = client.try_unfreeze_address(&token, &admin, &user);
        assert!(result.is_err());
    }

    // ── is_address_frozen ────────────────────────────────────────────────────

    #[test]
    fn is_address_frozen_default_false() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        assert!(!client.is_address_frozen(&token, &user));
    }

    #[test]
    fn is_address_frozen_true_after_freeze() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        assert!(client.is_address_frozen(&token, &user));
    }

    #[test]
    fn is_address_frozen_false_after_unfreeze() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        client.unfreeze_address(&token, &admin, &user);
        assert!(!client.is_address_frozen(&token, &user));
    }

    // ── Multi-address independence ────────────────────────────────────────────

    #[test]
    fn freeze_is_per_address_independent() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user1);
        client.freeze_address(&token, &admin, &user2);

        assert!(client.is_address_frozen(&token, &user1));
        assert!(client.is_address_frozen(&token, &user2));
        assert!(!client.is_address_frozen(&token, &user3));

        client.unfreeze_address(&token, &admin, &user1);

        assert!(!client.is_address_frozen(&token, &user1));
        assert!(client.is_address_frozen(&token, &user2));
    }

    /// Freeze state is per-token: freezing on token A does not affect token B.
    #[test]
    fn freeze_is_per_token_independent() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token_a = Address::generate(&env);
        let token_b = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token_a, &admin, true);
        register_token(&env, &contract_id, &token_b, &admin, true);

        client.freeze_address(&token_a, &admin, &user);

        assert!(client.is_address_frozen(&token_a, &user));
        assert!(!client.is_address_frozen(&token_b, &user));
    }

    // ── Freeze state persists when capability is disabled ────────────────────

    #[test]
    fn frozen_state_persists_when_freeze_disabled() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        assert!(client.is_address_frozen(&token, &user));

        // Disable freeze capability
        client.set_freeze_enabled(&token, &admin, &false);

        // Frozen state must persist
        assert!(client.is_address_frozen(&token, &user));

        // New freezes must be rejected
        let user2 = Address::generate(&env);
        let result = client.try_freeze_address(&token, &admin, &user2);
        assert!(result.is_err());
    }

    // ── Storage cleanup ───────────────────────────────────────────────────────

    /// After unfreeze, the storage entry is removed (not just set to false).
    #[test]
    fn unfreeze_removes_storage_entry() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        client.unfreeze_address(&token, &admin, &user);

        // Entry should be absent (not just false)
        let has_entry: bool = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .has(&DataKey::FrozenAddress(token.clone(), user.clone()))
        });
        assert!(!has_entry, "storage entry must be removed on unfreeze");
    }

    // ── Re-freeze after unfreeze ──────────────────────────────────────────────

    #[test]
    fn can_refreeze_after_unfreeze() {
        let (env, contract_id, admin, _) = setup();
        let client = TokenFactoryClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        let user = Address::generate(&env);
        register_token(&env, &contract_id, &token, &admin, true);

        client.freeze_address(&token, &admin, &user);
        client.unfreeze_address(&token, &admin, &user);

        // Should be able to freeze again
        let result = client.try_freeze_address(&token, &admin, &user);
        assert!(result.is_ok(), "re-freezing after unfreeze must succeed");
        assert!(client.is_address_frozen(&token, &user));
    }
}
