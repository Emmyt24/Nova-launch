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

    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    client.create_token(
        &admin,
        &soroban_sdk::String::from_str(&env, "StatsToken"),
        &soroban_sdk::String::from_str(&env, "STK"),
        &6_u32,
        &1_000_000_i128,
        &None,
        &100_i128,
    );

    let token_index = 0_u32;
    crate::storage::set_balance(&env, token_index, &admin, 1_000_000_i128);

    (env, contract_id, admin, treasury, token_index)
}

// ── initial state ─────────────────────────────────────────

#[test]
fn stats_initial_state() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let stats = client.get_token_stats(&token_index);

    assert_eq!(stats.current_supply, 1_000_000_i128);
    assert_eq!(stats.total_burned,   0_i128);
    assert_eq!(stats.burn_count,     0_u32);
    assert!(!stats.is_paused);
    assert!(!stats.has_clawback);
}

// ── stats update after burn ───────────────────────────────

#[test]
fn stats_reflect_single_burn() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.burn(&admin, &token_index, &40_000_i128);

    let stats = client.get_token_stats(&token_index);

    assert_eq!(stats.current_supply, 960_000_i128);
    assert_eq!(stats.total_burned,   40_000_i128);
    assert_eq!(stats.burn_count,     1_u32);
}

#[test]
fn stats_accumulate_across_multiple_burns() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.burn(&admin, &token_index, &100_000_i128);
    client.burn(&admin, &token_index, &200_000_i128);
    client.burn(&admin, &token_index, &50_000_i128);

    let stats = client.get_token_stats(&token_index);

    assert_eq!(stats.current_supply, 650_000_i128);
    assert_eq!(stats.total_burned,   350_000_i128);
    assert_eq!(stats.burn_count,     3_u32);
}

#[test]
fn stats_reflect_admin_burn() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let holder = Address::generate(&env);
    crate::storage::set_balance(&env, token_index, &holder, 300_000_i128);

    client.admin_burn(&admin, &token_index, &holder, &300_000_i128);

    let stats = client.get_token_stats(&token_index);

    assert_eq!(stats.total_burned, 300_000_i128);
    assert_eq!(stats.burn_count,   1_u32);
}

#[test]
fn stats_reflect_batch_burn() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let holder_a = Address::generate(&env);
    let holder_b = Address::generate(&env);
    crate::storage::set_balance(&env, token_index, &holder_a, 100_000_i128);
    crate::storage::set_balance(&env, token_index, &holder_b, 100_000_i128);

    let burns = soroban_sdk::vec![
        &env,
        (holder_a, 50_000_i128),
        (holder_b, 75_000_i128),
    ];
    client.batch_burn(&admin, &token_index, &burns);

    let stats = client.get_token_stats(&token_index);

    assert_eq!(stats.total_burned, 125_000_i128);
    assert_eq!(stats.burn_count,   1_u32);
}

// ── supply invariant: current_supply + total_burned == initial_supply ─────

#[test]
fn stats_supply_plus_burned_equals_initial() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    client.burn(&admin, &token_index, &111_111_i128);
    client.burn(&admin, &token_index, &222_222_i128);

    let stats = client.get_token_stats(&token_index);

    assert_eq!(
        stats.current_supply + stats.total_burned,
        1_000_000_i128,
        "current_supply + total_burned must always equal initial supply"
    );
}

// ── pause state reflected in stats ───────────────────────

#[test]
fn stats_reflect_pause_state() {
    let (env, contract_id, admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    assert!(!client.get_token_stats(&token_index).is_paused);

    client.pause_token(&admin, &token_index);
    assert!(client.get_token_stats(&token_index).is_paused);

    client.unpause_token(&admin, &token_index);
    assert!(!client.get_token_stats(&token_index).is_paused);
}

// ── stats on nonexistent token ────────────────────────────

#[test]
fn stats_nonexistent_token_returns_error() {
    let (env, contract_id, _admin, _treasury, _) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let result = client.try_get_token_stats(&999_u32);
    assert_eq!(result, Err(Ok(crate::types::Error::TokenNotFound)));
}

// ── has_clawback is false by default ─────────────────────

#[test]
fn stats_has_clawback_false_by_default() {
    let (env, contract_id, _admin, _treasury, token_index) = setup();
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    assert!(!client.get_token_stats(&token_index).has_clawback);
}