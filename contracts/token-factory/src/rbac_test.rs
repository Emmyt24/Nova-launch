#[cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, TryFromVal};

use crate::types::{Error, Role};

// ── helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, Address, Address, Address, u32) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, crate::TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128).unwrap();

    client.create_token(
        &admin,
        &soroban_sdk::String::from_str(&env, "RbacToken"),
        &soroban_sdk::String::from_str(&env, "RBT"),
        &6_u32,
        &1_000_000_i128,
        &None,
        &100_i128,
    );

    let token_index = 0_u32;
    crate::storage::set_balance(&env, token_index, &admin, 1_000_000_i128);

    (env, contract_id, admin, treasury, token_index)
}

// ── grant_role ────────────────────────────────────────────────────────────────

#[test]
fn grant_role_succeeds_for_creator() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    let result = client.grant_role(&admin, &token_index, &grantee, &Role::Minter);
    assert_eq!(result, Ok(()));
}

#[test]
fn grant_role_non_creator_returns_unauthorized() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let non_creator = Address::generate(&env);
    let grantee = Address::generate(&env);

    let result = client.grant_role(&non_creator, &token_index, &grantee, &Role::Minter);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn grant_role_nonexistent_token_returns_not_found() {
    let (env, contract_id, admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    let result = client.grant_role(&admin, &999_u32, &grantee, &Role::Minter);
    assert_eq!(result, Err(Error::TokenNotFound));
}

#[test]
fn grant_role_is_idempotent() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();
    // Granting again must not error
    let result = client.grant_role(&admin, &token_index, &grantee, &Role::Minter);
    assert_eq!(result, Ok(()));
}

#[test]
fn grant_all_roles_to_same_address() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    for role in [Role::Minter, Role::Burner, Role::Pauser, Role::MetadataManager] {
        client.grant_role(&admin, &token_index, &grantee, &role).unwrap();
        assert!(client.has_role(&token_index, &grantee, &role));
    }
}

// ── revoke_role ───────────────────────────────────────────────────────────────

#[test]
fn revoke_role_succeeds_for_creator() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();
    let result = client.revoke_role(&admin, &token_index, &grantee, &Role::Minter);
    assert_eq!(result, Ok(()));
    assert!(!client.has_role(&token_index, &grantee, &Role::Minter));
}

#[test]
fn revoke_role_non_creator_returns_unauthorized() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);
    let non_creator = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();
    let result = client.revoke_role(&non_creator, &token_index, &grantee, &Role::Minter);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn revoke_role_is_idempotent() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    // Revoke a role that was never granted — must not error
    let result = client.revoke_role(&admin, &token_index, &grantee, &Role::Minter);
    assert_eq!(result, Ok(()));
}

#[test]
fn revoke_role_nonexistent_token_returns_not_found() {
    let (env, contract_id, admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    let result = client.revoke_role(&admin, &999_u32, &grantee, &Role::Minter);
    assert_eq!(result, Err(Error::TokenNotFound));
}

#[test]
fn revoke_only_target_role_leaves_others_intact() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();
    client.grant_role(&admin, &token_index, &grantee, &Role::Burner).unwrap();

    client.revoke_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();

    assert!(!client.has_role(&token_index, &grantee, &Role::Minter));
    assert!(client.has_role(&token_index, &grantee, &Role::Burner));
}

// ── has_role ──────────────────────────────────────────────────────────────────

#[test]
fn has_role_returns_false_before_grant() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let addr = Address::generate(&env);

    assert!(!client.has_role(&token_index, &addr, &Role::Minter));
}

#[test]
fn has_role_returns_true_after_grant() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Pauser).unwrap();
    assert!(client.has_role(&token_index, &grantee, &Role::Pauser));
}

#[test]
fn has_role_returns_false_after_revoke() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Pauser).unwrap();
    client.revoke_role(&admin, &token_index, &grantee, &Role::Pauser).unwrap();
    assert!(!client.has_role(&token_index, &grantee, &Role::Pauser));
}

#[test]
fn roles_are_isolated_per_token() {
    let (env, contract_id, admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    // Create a second token
    client.create_token(
        &admin,
        &soroban_sdk::String::from_str(&env, "Token2"),
        &soroban_sdk::String::from_str(&env, "TK2"),
        &6_u32,
        &500_000_i128,
        &None,
        &100_i128,
    );

    let grantee = Address::generate(&env);
    client.grant_role(&admin, &0_u32, &grantee, &Role::Minter).unwrap();

    assert!(client.has_role(&0_u32, &grantee, &Role::Minter));
    assert!(!client.has_role(&1_u32, &grantee, &Role::Minter));
}

#[test]
fn roles_are_isolated_per_address() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let addr_a = Address::generate(&env);
    let addr_b = Address::generate(&env);

    client.grant_role(&admin, &token_index, &addr_a, &Role::Minter).unwrap();

    assert!(client.has_role(&token_index, &addr_a, &Role::Minter));
    assert!(!client.has_role(&token_index, &addr_b, &Role::Minter));
}

// ── Minter role integration ───────────────────────────────────────────────────

#[test]
fn minter_role_allows_mint() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let minter = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.grant_role(&admin, &token_index, &minter, &Role::Minter).unwrap();
    let result = client.mint(&minter, &token_index, &recipient, &1_000_i128);
    assert_eq!(result, Ok(()));
}

#[test]
fn without_minter_role_mint_returns_unauthorized() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let non_minter = Address::generate(&env);
    let recipient = Address::generate(&env);

    let result = client.mint(&non_minter, &token_index, &recipient, &1_000_i128);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn creator_can_mint_without_explicit_role() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let recipient = Address::generate(&env);

    let result = client.mint(&admin, &token_index, &recipient, &500_i128);
    assert_eq!(result, Ok(()));
}

#[test]
fn revoked_minter_cannot_mint() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let minter = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.grant_role(&admin, &token_index, &minter, &Role::Minter).unwrap();
    client.revoke_role(&admin, &token_index, &minter, &Role::Minter).unwrap();

    let result = client.mint(&minter, &token_index, &recipient, &1_000_i128);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn minter_role_blocked_when_contract_paused() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let minter = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.grant_role(&admin, &token_index, &minter, &Role::Minter).unwrap();
    client.pause(&admin).unwrap();

    let result = client.mint(&minter, &token_index, &recipient, &1_000_i128);
    assert_eq!(result, Err(Error::ContractPaused));
}

// ── Pauser role integration ───────────────────────────────────────────────────

#[test]
fn pauser_role_allows_pause_token() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let pauser = Address::generate(&env);

    client.grant_role(&admin, &token_index, &pauser, &Role::Pauser).unwrap();
    let result = client.pause_token(&pauser, &token_index);
    assert_eq!(result, Ok(()));
    assert!(client.is_token_paused(&token_index));
}

#[test]
fn pauser_role_allows_unpause_token() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let pauser = Address::generate(&env);

    client.grant_role(&admin, &token_index, &pauser, &Role::Pauser).unwrap();
    client.pause_token(&pauser, &token_index).unwrap();

    let result = client.unpause_token(&pauser, &token_index);
    assert_eq!(result, Ok(()));
    assert!(!client.is_token_paused(&token_index));
}

#[test]
fn without_pauser_role_pause_returns_unauthorized() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let non_pauser = Address::generate(&env);

    let result = client.pause_token(&non_pauser, &token_index);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn without_pauser_role_unpause_returns_unauthorized() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let non_pauser = Address::generate(&env);

    client.pause_token(&admin, &token_index).unwrap();
    let result = client.unpause_token(&non_pauser, &token_index);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn revoked_pauser_cannot_pause() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let pauser = Address::generate(&env);

    client.grant_role(&admin, &token_index, &pauser, &Role::Pauser).unwrap();
    client.revoke_role(&admin, &token_index, &pauser, &Role::Pauser).unwrap();

    let result = client.pause_token(&pauser, &token_index);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn factory_admin_can_pause_without_explicit_role() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let result = client.pause_token(&admin, &token_index);
    assert_eq!(result, Ok(()));
}

// ── MetadataManager role integration ─────────────────────────────────────────

#[test]
fn metadata_manager_role_allows_set_token_metadata() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let manager = Address::generate(&env);

    client.grant_role(&admin, &token_index, &manager, &Role::MetadataManager).unwrap();
    let result = client.set_token_metadata(
        &manager,
        &token_index,
        &soroban_sdk::String::from_str(&env, "ipfs://QmTest"),
    );
    assert_eq!(result, Ok(()));
}

#[test]
fn without_metadata_manager_role_set_metadata_returns_unauthorized() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let non_manager = Address::generate(&env);

    let result = client.set_token_metadata(
        &non_manager,
        &token_index,
        &soroban_sdk::String::from_str(&env, "ipfs://QmTest"),
    );
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn creator_can_set_metadata_without_explicit_role() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let result = client.set_token_metadata(
        &admin,
        &token_index,
        &soroban_sdk::String::from_str(&env, "ipfs://QmCreator"),
    );
    assert_eq!(result, Ok(()));
}

#[test]
fn revoked_metadata_manager_cannot_set_metadata() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let manager = Address::generate(&env);

    client.grant_role(&admin, &token_index, &manager, &Role::MetadataManager).unwrap();
    client.revoke_role(&admin, &token_index, &manager, &Role::MetadataManager).unwrap();

    let result = client.set_token_metadata(
        &manager,
        &token_index,
        &soroban_sdk::String::from_str(&env, "ipfs://QmTest"),
    );
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn metadata_manager_blocked_when_token_paused() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let manager = Address::generate(&env);

    client.grant_role(&admin, &token_index, &manager, &Role::MetadataManager).unwrap();
    client.pause_token(&admin, &token_index).unwrap();

    let result = client.set_token_metadata(
        &manager,
        &token_index,
        &soroban_sdk::String::from_str(&env, "ipfs://QmTest"),
    );
    assert_eq!(result, Err(Error::TokenPaused));
}

// ── Event emission ────────────────────────────────────────────────────────────

#[test]
fn grant_role_emits_role_granted_event() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();

    let events = env.events().all();
    let target = soroban_sdk::Symbol::new(&env, "role_gr_v1");
    let found = events.iter().any(|e| {
        e.1.get(0)
            .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
            .map(|s| s == target)
            .unwrap_or(false)
    });
    assert!(found, "role_gr_v1 event must be emitted on grant_role");
}

#[test]
fn revoke_role_emits_role_revoked_event() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    client.grant_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();
    client.revoke_role(&admin, &token_index, &grantee, &Role::Minter).unwrap();

    let events = env.events().all();
    let target = soroban_sdk::Symbol::new(&env, "role_rv_v1");
    let found = events.iter().any(|e| {
        e.1.get(0)
            .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
            .map(|s| s == target)
            .unwrap_or(false)
    });
    assert!(found, "role_rv_v1 event must be emitted on revoke_role");
}

// ── Edge cases ────────────────────────────────────────────────────────────────

#[test]
fn multiple_addresses_can_hold_same_role() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let addr_a = Address::generate(&env);
    let addr_b = Address::generate(&env);

    client.grant_role(&admin, &token_index, &addr_a, &Role::Minter).unwrap();
    client.grant_role(&admin, &token_index, &addr_b, &Role::Minter).unwrap();

    assert!(client.has_role(&token_index, &addr_a, &Role::Minter));
    assert!(client.has_role(&token_index, &addr_b, &Role::Minter));
}

#[test]
fn revoking_one_address_does_not_affect_another() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let addr_a = Address::generate(&env);
    let addr_b = Address::generate(&env);

    client.grant_role(&admin, &token_index, &addr_a, &Role::Minter).unwrap();
    client.grant_role(&admin, &token_index, &addr_b, &Role::Minter).unwrap();
    client.revoke_role(&admin, &token_index, &addr_a, &Role::Minter).unwrap();

    assert!(!client.has_role(&token_index, &addr_a, &Role::Minter));
    assert!(client.has_role(&token_index, &addr_b, &Role::Minter));
}

#[test]
fn grant_and_revoke_cycle_leaves_no_role() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);
    let grantee = Address::generate(&env);

    for _ in 0..3 {
        client.grant_role(&admin, &token_index, &grantee, &Role::Burner).unwrap();
        assert!(client.has_role(&token_index, &grantee, &Role::Burner));
        client.revoke_role(&admin, &token_index, &grantee, &Role::Burner).unwrap();
        assert!(!client.has_role(&token_index, &grantee, &Role::Burner));
    }
}

#[test]
fn role_on_different_tokens_are_independent() {
    let (env, contract_id, admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    // Create second token
    client.create_token(
        &admin,
        &soroban_sdk::String::from_str(&env, "Token2"),
        &soroban_sdk::String::from_str(&env, "TK2"),
        &6_u32,
        &500_000_i128,
        &None,
        &100_i128,
    );

    let grantee = Address::generate(&env);
    client.grant_role(&admin, &0_u32, &grantee, &Role::Pauser).unwrap();
    client.grant_role(&admin, &1_u32, &grantee, &Role::Minter).unwrap();

    assert!(client.has_role(&0_u32, &grantee, &Role::Pauser));
    assert!(!client.has_role(&0_u32, &grantee, &Role::Minter));
    assert!(client.has_role(&1_u32, &grantee, &Role::Minter));
    assert!(!client.has_role(&1_u32, &grantee, &Role::Pauser));
}

#[test]
fn creator_address_does_not_implicitly_hold_stored_role() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    // Creator can perform role-gated ops, but has_role returns false
    // because creator authority is checked separately, not via stored role
    assert!(!client.has_role(&token_index, &admin, &Role::Minter));
    assert!(!client.has_role(&token_index, &admin, &Role::Pauser));
    assert!(!client.has_role(&token_index, &admin, &Role::MetadataManager));
}

#[test]
fn minter_role_scoped_to_correct_token_only() {
    let (env, contract_id, admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.create_token(
        &admin,
        &soroban_sdk::String::from_str(&env, "Token2"),
        &soroban_sdk::String::from_str(&env, "TK2"),
        &6_u32,
        &500_000_i128,
        &None,
        &100_i128,
    );

    let minter = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Grant Minter only on token 0
    client.grant_role(&admin, &0_u32, &minter, &Role::Minter).unwrap();

    // Minting on token 0 must succeed
    assert_eq!(client.mint(&minter, &0_u32, &recipient, &100_i128), Ok(()));

    // Minting on token 1 must fail — role not granted there
    let result = client.mint(&minter, &1_u32, &recipient, &100_i128);
    assert_eq!(result, Err(Error::Unauthorized));
}
