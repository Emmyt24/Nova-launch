#[cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, Address, Address, u32) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, crate::TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let admin    = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128).unwrap();

    client.create_token(
        &admin,
        &soroban_sdk::String::from_str(&env, "PauseToken"),
        &soroban_sdk::String::from_str(&env, "PTK"),
        &6_u32,
        &1_000_000_i128,
        &None,
        &100_i128,
    );

    let token_index = 0_u32;
    crate::storage::set_balance(&env, token_index, &admin, 1_000_000_i128);

    (env, contract_id, admin, treasury, token_index)
}

#[test]
fn token_not_paused_by_default() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    assert!(!client.is_token_paused(&token_index));
    assert!(!client.get_token_info(&token_index).unwrap().is_paused);
}

#[test]
fn pause_sets_flag_unpause_clears_it() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();
    assert!(client.is_token_paused(&token_index));
    assert!(client.get_token_info(&token_index).unwrap().is_paused);

    client.unpause_token(&admin, &token_index).unwrap();
    assert!(!client.is_token_paused(&token_index));
    assert!(!client.get_token_info(&token_index).unwrap().is_paused);
}

#[test]
fn burn_blocked_when_token_paused() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();

    let result = client.burn(&admin, &token_index, &100_i128);
    assert_eq!(result, Err(crate::types::Error::TokenPaused));
}

#[test]
fn admin_burn_blocked_when_token_paused() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let holder = Address::generate(&env);
    crate::storage::set_balance(&env, token_index, &holder, 500_i128);

    client.pause_token(&admin, &token_index).unwrap();

    let result = client.admin_burn(&admin, &token_index, &holder, &100_i128);
    assert_eq!(result, Err(crate::types::Error::TokenPaused));
}

#[test]
fn batch_burn_blocked_when_token_paused() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let holder = Address::generate(&env);
    crate::storage::set_balance(&env, token_index, &holder, 500_i128);

    client.pause_token(&admin, &token_index).unwrap();

    let burns = soroban_sdk::vec![&env, (holder, 100_i128)];
    let result = client.batch_burn(&admin, &token_index, &burns);
    assert_eq!(result, Err(crate::types::Error::TokenPaused));
}

#[test]
fn set_metadata_blocked_when_token_paused() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();

    let result = client.set_metadata(
        &token_index,
        &soroban_sdk::String::from_str(&env, "ipfs://Qmtest"),
    );
    assert_eq!(result, Err(crate::types::Error::TokenPaused));
}

#[test]
fn pausing_one_token_does_not_affect_another() {
    let (env, contract_id, admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    // Create a second token (no .unwrap() — create_token returns Address, not Result)
    client.create_token(
        &admin,
        &soroban_sdk::String::from_str(&env, "Token2"),
        &soroban_sdk::String::from_str(&env, "TK2"),
        &6_u32,
        &500_000_i128,
        &None,
        &100_i128,
    );
    crate::storage::set_balance(&env, 1_u32, &admin, 500_000_i128);

    client.pause_token(&admin, &0_u32).unwrap();

    // Token 1 must be unaffected — burn returns Result, check it's Ok
    let result = client.burn(&admin, &1_u32, &100_i128);
    assert_eq!(result, Ok(()), "Token 1 must not be affected by token 0 pause");

    // Token 0 must be blocked
    let result0 = client.burn(&admin, &0_u32, &100_i128);
    assert_eq!(result0, Err(crate::types::Error::TokenPaused));
}

#[test]
fn non_admin_cannot_pause_token() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let non_admin = Address::generate(&env);
    let result = client.pause_token(&non_admin, &token_index);
    assert_eq!(result, Err(crate::types::Error::Unauthorized));
}

#[test]
fn non_admin_cannot_unpause_token() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();

    let non_admin = Address::generate(&env);
    let result = client.unpause_token(&non_admin, &token_index);
    assert_eq!(result, Err(crate::types::Error::Unauthorized));
}

#[test]
fn pause_on_nonexistent_token_returns_not_found() {
    let (env, contract_id, admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let result = client.pause_token(&admin, &999_u32);
    assert_eq!(result, Err(crate::types::Error::TokenNotFound));
}

#[test]
fn burn_works_after_unpause() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();
    client.unpause_token(&admin, &token_index).unwrap();

    let result = client.burn(&admin, &token_index, &100_i128);
    assert_eq!(result, Ok(()), "Burn must succeed after unpause");
}

// ── Global pause vs token pause interaction tests ─────────────────────────────

/// Neither token paused nor any other pause → operation succeeds.
#[test]
fn interaction_neither_paused_burn_succeeds() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    assert!(!client.is_token_paused(&token_index));

    let result = client.burn(&admin, &token_index, &100_i128);
    assert_eq!(result, Ok(()), "Burn must succeed when token is not paused");
}

/// Token paused → burn is blocked with TokenPaused error.
#[test]
fn interaction_token_paused_blocks_burn() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();

    let result = client.burn(&admin, &token_index, &100_i128);
    assert_eq!(result, Err(crate::types::Error::TokenPaused));
}

/// Token paused → metadata update is blocked with TokenPaused error.
#[test]
fn interaction_token_paused_blocks_metadata() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();

    let result = client.set_metadata(
        &token_index,
        &soroban_sdk::String::from_str(&env, "ipfs://Qmtest"),
    );
    assert_eq!(result, Err(crate::types::Error::TokenPaused));
}

/// Token pause is strictly per-token — pausing token 0 does not affect token 1.
#[test]
fn interaction_token_pause_is_isolated_per_token() {
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
    crate::storage::set_balance(&env, 1_u32, &admin, 500_000_i128);

    // Pause only token 0
    client.pause_token(&admin, &0_u32).unwrap();

    assert!(client.is_token_paused(&0_u32),  "Token 0 must be paused");
    assert!(!client.is_token_paused(&1_u32), "Token 1 must NOT be paused");

    // Token 1 operations must succeed
    let result1 = client.burn(&admin, &1_u32, &100_i128);
    assert_eq!(result1, Ok(()), "Token 1 burn must succeed while only token 0 is paused");

    // Token 0 operations must be blocked
    let result0 = client.burn(&admin, &0_u32, &100_i128);
    assert_eq!(result0, Err(crate::types::Error::TokenPaused));
}

/// Unpausing a token fully restores all operations.
#[test]
fn interaction_unpause_restores_all_operations() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.pause_token(&admin, &token_index).unwrap();

    // Confirm all ops are blocked
    assert_eq!(
        client.burn(&admin, &token_index, &100_i128),
        Err(crate::types::Error::TokenPaused),
        "Burn must be blocked while paused"
    );

    // Unpause and confirm ops are restored
    client.unpause_token(&admin, &token_index).unwrap();

    let result = client.burn(&admin, &token_index, &100_i128);
    assert_eq!(result, Ok(()), "Burn must succeed after unpause");
}

/// Pause state is accurately reflected in get_token_info.
#[test]
fn interaction_pause_state_reflected_in_get_token_info() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    assert!(!client.get_token_info(&token_index).unwrap().is_paused,
        "is_paused must be false before pausing");

    client.pause_token(&admin, &token_index).unwrap();
    assert!(client.get_token_info(&token_index).unwrap().is_paused,
        "is_paused must be true after pausing");

    client.unpause_token(&admin, &token_index).unwrap();
    assert!(!client.get_token_info(&token_index).unwrap().is_paused,
        "is_paused must be false after unpausing");
}

/// Pause state is accurately reflected in get_token_stats.
#[test]
fn interaction_pause_state_reflected_in_get_token_stats() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    assert!(!client.get_token_stats(&token_index).unwrap().is_paused,
        "stats.is_paused must be false before pausing");

    client.pause_token(&admin, &token_index).unwrap();
    assert!(client.get_token_stats(&token_index).unwrap().is_paused,
        "stats.is_paused must be true after pausing");

    client.unpause_token(&admin, &token_index).unwrap();
    assert!(!client.get_token_stats(&token_index).unwrap().is_paused,
        "stats.is_paused must be false after unpausing");
}

/// Admin burn and batch burn are also blocked when token is paused.
#[test]
fn interaction_all_burn_variants_blocked_when_paused() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let holder = Address::generate(&env);
    crate::storage::set_balance(&env, token_index, &holder, 500_i128);

    client.pause_token(&admin, &token_index).unwrap();

    // Regular burn
    assert_eq!(
        client.burn(&admin, &token_index, &10_i128),
        Err(crate::types::Error::TokenPaused),
        "burn must be blocked"
    );

    // Admin burn
    assert_eq!(
        client.admin_burn(&admin, &token_index, &holder, &10_i128),
        Err(crate::types::Error::TokenPaused),
        "admin_burn must be blocked"
    );

    // Batch burn
    let burns = soroban_sdk::vec![&env, (holder, 10_i128)];
    assert_eq!(
        client.batch_burn(&admin, &token_index, &burns),
        Err(crate::types::Error::TokenPaused),
        "batch_burn must be blocked"
    );
}