//! Oracle Integration Tests
//!
//! Covers the full lifecycle of the oracle price-feed feature:
//! configuration, authorization, price submission, price retrieval,
//! staleness enforcement, and all error paths.

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

// ─── helpers ────────────────────────────────────────────────────────────────

fn setup() -> (Env, TokenFactoryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    (env, client, admin, treasury)
}

// ─── Error code stability ────────────────────────────────────────────────────

#[test]
fn test_oracle_error_codes_are_stable() {
    assert_eq!(crate::types::Error::OracleNotFound.0, 55);
    assert_eq!(crate::types::Error::OraclePriceStale.0, 56);
    assert_eq!(crate::types::Error::OracleUnauthorized.0, 57);
    assert_eq!(crate::types::Error::OraclePriceInvalid.0, 58);
}

// ─── configure_oracle ────────────────────────────────────────────────────────

#[test]
fn test_configure_oracle_success() {
    let (_env, client, admin, _) = setup();
    client.configure_oracle(&admin, &7200, &2);

    let cfg = client.get_oracle_config();
    assert_eq!(cfg.max_age_seconds, 7200);
    assert_eq!(cfg.min_sources, 2);
}

#[test]
fn test_configure_oracle_default_before_setup() {
    let (_env, client, _admin, _) = setup();
    // Default config should be returned before any explicit configuration
    let cfg = client.get_oracle_config();
    assert_eq!(cfg.max_age_seconds, 3600);
    assert_eq!(cfg.min_sources, 1);
}

#[test]
fn test_configure_oracle_unauthorized() {
    let (_env, client, _admin, _) = setup();
    let attacker = Address::generate(&_env);
    let result = client.try_configure_oracle(&attacker, &3600, &1);
    assert!(result.is_err());
}

#[test]
fn test_configure_oracle_zero_max_age_rejected() {
    let (_env, client, admin, _) = setup();
    let result = client.try_configure_oracle(&admin, &0, &1);
    assert!(result.is_err());
}

#[test]
fn test_configure_oracle_can_be_updated() {
    let (_env, client, admin, _) = setup();
    client.configure_oracle(&admin, &3600, &1);
    client.configure_oracle(&admin, &1800, &3);

    let cfg = client.get_oracle_config();
    assert_eq!(cfg.max_age_seconds, 1800);
    assert_eq!(cfg.min_sources, 3);
}

// ─── set_oracle_authorized ───────────────────────────────────────────────────

#[test]
fn test_authorize_oracle_source() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    assert!(!client.is_oracle_authorized(&source));
    client.set_oracle_authorized(&admin, &source, &true);
    assert!(client.is_oracle_authorized(&source));
}

#[test]
fn test_deauthorize_oracle_source() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.set_oracle_authorized(&admin, &source, &true);
    client.set_oracle_authorized(&admin, &source, &false);
    assert!(!client.is_oracle_authorized(&source));
}

#[test]
fn test_authorize_oracle_unauthorized_caller() {
    let (env, client, _admin, _) = setup();
    let attacker = Address::generate(&env);
    let source = Address::generate(&env);

    let result = client.try_set_oracle_authorized(&attacker, &source, &true);
    assert!(result.is_err());
}

#[test]
fn test_multiple_sources_can_be_authorized() {
    let (env, client, admin, _) = setup();
    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);

    client.set_oracle_authorized(&admin, &s1, &true);
    client.set_oracle_authorized(&admin, &s2, &true);

    assert!(client.is_oracle_authorized(&s1));
    assert!(client.is_oracle_authorized(&s2));
    assert!(!client.is_oracle_authorized(&s3));
}

// ─── submit_price ────────────────────────────────────────────────────────────

#[test]
fn test_submit_price_success() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.set_oracle_authorized(&admin, &source, &true);
    client.submit_price(&source, &1_000_000, &7);

    let data = client.get_oracle_price(&source);
    assert_eq!(data.price, 1_000_000);
    assert_eq!(data.decimals, 7);
}

#[test]
fn test_submit_price_unauthorized_source() {
    let (env, client, _admin, _) = setup();
    let source = Address::generate(&env);

    let result = client.try_submit_price(&source, &1_000_000, &7);
    assert!(result.is_err());
}

#[test]
fn test_submit_price_zero_rejected() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.set_oracle_authorized(&admin, &source, &true);
    let result = client.try_submit_price(&source, &0, &7);
    assert!(result.is_err());
}

#[test]
fn test_submit_price_negative_rejected() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.set_oracle_authorized(&admin, &source, &true);
    let result = client.try_submit_price(&source, &-1, &7);
    assert!(result.is_err());
}

#[test]
fn test_submit_price_updates_existing() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.set_oracle_authorized(&admin, &source, &true);
    client.submit_price(&source, &1_000_000, &7);
    client.submit_price(&source, &2_000_000, &7);

    let data = client.get_oracle_price(&source);
    assert_eq!(data.price, 2_000_000);
}

#[test]
fn test_submit_price_deauthorized_source_rejected() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.set_oracle_authorized(&admin, &source, &true);
    client.submit_price(&source, &1_000_000, &7);

    // Revoke authorization
    client.set_oracle_authorized(&admin, &source, &false);

    let result = client.try_submit_price(&source, &2_000_000, &7);
    assert!(result.is_err());
}

// ─── get_oracle_price ────────────────────────────────────────────────────────

#[test]
fn test_get_price_not_found() {
    let (env, client, _admin, _) = setup();
    let source = Address::generate(&env);

    let result = client.try_get_oracle_price(&source);
    assert!(result.is_err());
}

#[test]
fn test_get_price_fresh() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.configure_oracle(&admin, &3600, &1);
    client.set_oracle_authorized(&admin, &source, &true);
    client.submit_price(&source, &5_000_000, &7);

    let data = client.get_oracle_price(&source);
    assert_eq!(data.price, 5_000_000);
    assert_eq!(data.decimals, 7);
}

#[test]
fn test_get_price_stale_rejected() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.configure_oracle(&admin, &60, &1); // 60-second window
    client.set_oracle_authorized(&admin, &source, &true);
    client.submit_price(&source, &1_000_000, &7);

    // Advance ledger time past the staleness window
    env.ledger().with_mut(|l| l.timestamp += 61);

    let result = client.try_get_oracle_price(&source);
    assert!(result.is_err());
}

#[test]
fn test_get_price_exactly_at_boundary_is_fresh() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    client.configure_oracle(&admin, &60, &1);
    client.set_oracle_authorized(&admin, &source, &true);
    client.submit_price(&source, &1_000_000, &7);

    // Advance to exactly the boundary — should still be valid (age == max_age)
    env.ledger().with_mut(|l| l.timestamp += 60);

    let data = client.get_oracle_price(&source);
    assert_eq!(data.price, 1_000_000);
}

#[test]
fn test_get_price_independent_per_source() {
    let (env, client, admin, _) = setup();
    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);

    client.configure_oracle(&admin, &3600, &1);
    client.set_oracle_authorized(&admin, &s1, &true);
    client.set_oracle_authorized(&admin, &s2, &true);

    client.submit_price(&s1, &1_000_000, &7);
    client.submit_price(&s2, &2_000_000, &6);

    assert_eq!(client.get_oracle_price(&s1).price, 1_000_000);
    assert_eq!(client.get_oracle_price(&s2).price, 2_000_000);
    assert_eq!(client.get_oracle_price(&s1).decimals, 7);
    assert_eq!(client.get_oracle_price(&s2).decimals, 6);
}

// ─── Integration: full lifecycle ─────────────────────────────────────────────

#[test]
fn test_full_oracle_lifecycle() {
    let (env, client, admin, _) = setup();
    let source = Address::generate(&env);

    // 1. Configure
    client.configure_oracle(&admin, &300, &1);
    assert_eq!(client.get_oracle_config().max_age_seconds, 300);

    // 2. Authorize
    client.set_oracle_authorized(&admin, &source, &true);
    assert!(client.is_oracle_authorized(&source));

    // 3. Submit
    client.submit_price(&source, &42_000_000, &7);

    // 4. Read fresh price
    let data = client.get_oracle_price(&source);
    assert_eq!(data.price, 42_000_000);

    // 5. Advance time past window → stale
    env.ledger().with_mut(|l| l.timestamp += 301);
    assert!(client.try_get_oracle_price(&source).is_err());

    // 6. Re-submit refreshes the price
    client.submit_price(&source, &43_000_000, &7);
    let data = client.get_oracle_price(&source);
    assert_eq!(data.price, 43_000_000);

    // 7. Deauthorize → further submissions rejected
    client.set_oracle_authorized(&admin, &source, &false);
    assert!(client.try_submit_price(&source, &44_000_000, &7).is_err());
}
