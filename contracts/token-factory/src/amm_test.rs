//! AMM integration tests (Issue #869)
//!
//! Covers:
//! - Add and remove liquidity correctly updates pool reserves
//! - Swap produces correct output using x*y=k formula
//! - Slippage protection rejects swap when output < min_amount_out
//! - Zero amount and invalid token pair inputs are rejected

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> (TokenFactoryClient, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    client.initialize(&admin, &treasury, &1_000_000i128, &500_000i128);
    (client, admin)
}

#[test]
fn test_amm_add_liquidity_creates_pool() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    let lp_tokens = client.add_liquidity(&lp, &token_a, &token_b, &1000i128, &1000i128);
    // LP tokens = isqrt(1000 * 1000) = 1000
    assert_eq!(lp_tokens, 1000i128);
}

#[test]
fn test_amm_add_liquidity_proportional() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    // First deposit
    let lp1 = client.add_liquidity(&lp, &token_a, &token_b, &1000i128, &2000i128);
    // Second deposit: same ratio
    let lp2 = client.add_liquidity(&lp, &token_a, &token_b, &500i128, &1000i128);

    // lp1 = isqrt(1000*2000) = isqrt(2_000_000) = 1414
    assert_eq!(lp1, 1414i128);
    // lp2 = 500 * 1414 / 1000 = 707
    assert_eq!(lp2, 707i128);
}

#[test]
fn test_amm_remove_liquidity_returns_tokens() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    let lp_tokens = client.add_liquidity(&lp, &token_a, &token_b, &1000i128, &2000i128);

    // Remove all liquidity
    let (out_a, out_b) = client.remove_liquidity(&lp, &token_a, &token_b, &lp_tokens);
    // out_a = lp_tokens * reserve_a / total_lp = 1414 * 1000 / 1414 = 1000
    assert_eq!(out_a, 1000i128);
    // out_b = 1414 * 2000 / 1414 = 2000
    assert_eq!(out_b, 2000i128);
}

#[test]
fn test_amm_swap_constant_product() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let swapper = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    // Pool: 1000 A, 1000 B
    client.add_liquidity(&lp, &token_a, &token_b, &1000i128, &1000i128);

    // Swap 100 A for B: out = 1000 * 100 / (1000 + 100) = 100000/1100 = 90
    let out = client.swap(&swapper, &token_a, &token_b, &100i128, &1i128);
    assert_eq!(out, 90i128);
}

#[test]
fn test_amm_swap_reverse_direction() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let swapper = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    // Pool stored as (token_a, token_b)
    client.add_liquidity(&lp, &token_a, &token_b, &1000i128, &2000i128);

    // Swap B -> A: pool is stored as (token_a, token_b), so token_b is token_in
    // reserve_in = 2000 (B), reserve_out = 1000 (A), amount_in = 200
    // out = 1000 * 200 / (2000 + 200) = 200000/2200 = 90
    let out = client.swap(&swapper, &token_b, &token_a, &200i128, &1i128);
    assert_eq!(out, 90i128);
}

#[test]
fn test_amm_slippage_protection() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let swapper = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    client.add_liquidity(&lp, &token_a, &token_b, &1000i128, &1000i128);

    // Expected out = 90, but min_amount_out = 200 → should fail
    let result = client.try_swap(&swapper, &token_a, &token_b, &100i128, &200i128);
    assert!(result.is_err());
}

#[test]
fn test_amm_get_price() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    // Pool: 2000 A, 1000 B → price of A in B = 2000 * 1e9 / 1000 = 2_000_000_000
    client.add_liquidity(&lp, &token_a, &token_b, &2000i128, &1000i128);

    let price = client.get_price(&token_a, &token_b);
    assert_eq!(price, 2_000_000_000i128);
}

#[test]
fn test_amm_zero_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    let result = client.try_add_liquidity(&lp, &token_a, &token_b, &0i128, &1000i128);
    assert!(result.is_err());

    let result = client.try_add_liquidity(&lp, &token_a, &token_b, &1000i128, &0i128);
    assert!(result.is_err());
}

#[test]
fn test_amm_same_token_pair_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let token_a = Address::generate(&env);

    let result = client.try_add_liquidity(&lp, &token_a, &token_a, &1000i128, &1000i128);
    assert!(result.is_err());
}

#[test]
fn test_amm_swap_zero_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let swapper = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    client.add_liquidity(&lp, &token_a, &token_b, &1000i128, &1000i128);

    let result = client.try_swap(&swapper, &token_a, &token_b, &0i128, &0i128);
    assert!(result.is_err());
}

#[test]
fn test_amm_remove_liquidity_no_pool_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let lp = Address::generate(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    let result = client.try_remove_liquidity(&lp, &token_a, &token_b, &100i128);
    assert!(result.is_err());
}

#[test]
fn test_amm_get_price_no_pool_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin) = setup(&env);
    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    let result = client.try_get_price(&token_a, &token_b);
    assert!(result.is_err());
}
