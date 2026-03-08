#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, String};
use crate::{TokenFactory, TokenFactoryClient};

// ── Baseline thresholds (CPU instructions) ────────────────────────────
//
// Established from benchmark observations on soroban-sdk 21.x.
// A 20% margin above observed median is applied to absorb minor variance.
//
// To update thresholds, you must:
//   1. Run: cargo test gas_regression_report -- --nocapture
//   2. Copy the new measured values into the constants below (+20% margin)
//   3. Include benchmark output in your PR description
//   4. Get maintainer sign-off before merging
//
// Thresholds must never be raised speculatively.
// Lower them when optimizations land.

const THRESHOLD_INITIALIZE:     u64 = 2_000_000;
const THRESHOLD_CREATE_TOKEN:   u64 = 6_000_000;
const THRESHOLD_BURN:           u64 = 4_000_000;
const THRESHOLD_BURN_X5:        u64 = 12_000_000;
const THRESHOLD_UPDATE_FEES:    u64 = 2_000_000;
const THRESHOLD_GET_STATE:      u64 = 1_500_000;
const THRESHOLD_GET_TOKEN_INFO: u64 = 1_500_000;

// ── Helpers ───────────────────────────────────────────────────────────

fn measure_cpu<F: FnOnce()>(env: &Env, f: F) -> u64 {
    env.budget().reset_unlimited();
    env.budget().reset_default();
    f();
    env.budget().cpu_instruction_cost()
}

fn assert_threshold(operation: &str, measured: u64, threshold: u64) {
    std::println!(
        "[gas_regression] {:<30} measured={:>12}  threshold={:>12}  {}",
        operation, measured, threshold,
        if measured <= threshold { "OK" } else { "EXCEEDED" }
    );
    assert!(
        measured <= threshold,
        "GAS REGRESSION: '{}' used {} CPU instructions, exceeding threshold of {} (+{} over limit)",
        operation, measured, threshold, measured.saturating_sub(threshold)
    );
}

fn setup(env: &Env) -> (Address, TokenFactoryClient, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    (contract_id, client, admin)
}

// ── Regression tests ──────────────────────────────────────────────────

#[test]
fn regression_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    let cpu = measure_cpu(&env, || {
        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    });

    assert_threshold("initialize", cpu, THRESHOLD_INITIALIZE);
}

#[test]
fn regression_create_token() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _admin) = setup(&env);
    let creator = Address::generate(&env);

    let cpu = measure_cpu(&env, || {
        client.create_token(
            &creator,
            &String::from_str(&env, "Regression Token"),
            &String::from_str(&env, "RGT"),
            &7,
            &1_000_000_000,
            &None,
            &70_000_000,
        );
    });

    assert_threshold("create_token", cpu, THRESHOLD_CREATE_TOKEN);
}

#[test]
fn regression_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, setup_admin) = setup(&env);
    let creator = setup_admin.clone();
    client.create_token(
        &creator,
        &String::from_str(&env, "Burn Token"),
        &String::from_str(&env, "BRN"),
        &7,
        &1_000_000_000,
        &None,
        &70_000_000,
    );

    let cpu = measure_cpu(&env, || {
        client.burn(&creator, &0, &1_000_000);
    });

    assert_threshold("burn", cpu, THRESHOLD_BURN);
}

#[test]
fn regression_burn_x5() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, setup_admin) = setup(&env);
    let creator = setup_admin.clone();

    client.create_token(
        &creator,
        &String::from_str(&env, "Batch Token"),
        &String::from_str(&env, "BAT"),
        &7,
        &1_000_000_000,
        &None,
        &70_000_000,
    );

    let cpu = measure_cpu(&env, || {
        client.burn(&creator, &0, &1_000_000);
        client.burn(&creator, &0, &1_000_000);
        client.burn(&creator, &0, &1_000_000);
        client.burn(&creator, &0, &1_000_000);
        client.burn(&creator, &0, &1_000_000);
    });

    assert_threshold("burn_x5", cpu, THRESHOLD_BURN_X5);
}

#[test]
fn regression_update_fees() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, admin) = setup(&env);

    let cpu = measure_cpu(&env, || {
        client.update_fees(&admin, &Some(100_000_000_i128), &Some(50_000_000_i128));
    });

    assert_threshold("update_fees", cpu, THRESHOLD_UPDATE_FEES);
}

#[test]
fn regression_get_state() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, _admin) = setup(&env);

    let cpu = measure_cpu(&env, || {
        let _ = client.get_state();
    });

    assert_threshold("get_state", cpu, THRESHOLD_GET_STATE);
}

#[test]
fn regression_get_token_info() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client, creator) = setup(&env);

    client.create_token(
        &creator,
        &String::from_str(&env, "Info Token"),
        &String::from_str(&env, "INF"),
        &7,
        &1_000_000_000,
        &None,
        &70_000_000,
    );

    let cpu = measure_cpu(&env, || {
        let _ = client.get_token_info(&0_u32);
    });

    assert_threshold("get_token_info", cpu, THRESHOLD_GET_TOKEN_INFO);
}

/// Full regression summary report.
/// Run with: cargo test gas_regression_report -- --nocapture
#[test]
fn gas_regression_report() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let init_client = TokenFactoryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let cpu_init = measure_cpu(&env, || {
        init_client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
    });

    let (_id, client, setup_admin) = setup(&env);

    env.budget().reset_unlimited();
    client.create_token(
        &setup_admin,
        &String::from_str(&env, "Report Token"),
        &String::from_str(&env, "RPT"),
        &7,
        &1_000_000_000,
        &None,
        &70_000_000,
    );
    let cpu_create = env.budget().cpu_instruction_cost();

    let cpu_burn = measure_cpu(&env, || {
        client.burn(&setup_admin, &0, &1_000_000);
    });
    let cpu_update = measure_cpu(&env, || {
        client.update_fees(&setup_admin, &Some(100_000_000_i128), &Some(50_000_000_i128));
    });
    let cpu_state = measure_cpu(&env, || { let _ = client.get_state(); });
    let cpu_info  = measure_cpu(&env, || { let _ = client.get_token_info(&0_u32); });

    std::println!();
    std::println!("Nova-Launch Gas Regression Report");
    std::println!("{}", "=".repeat(70));
    std::println!("{:<30} {:>14} {:>14} {:>8}", "Operation", "Measured", "Threshold", "Status");
    std::println!("{}", "-".repeat(70));

    let rows: &[(&str, u64, u64)] = &[
        ("initialize",     cpu_init,   THRESHOLD_INITIALIZE),
        ("create_token",   cpu_create, THRESHOLD_CREATE_TOKEN),
        ("burn",           cpu_burn,   THRESHOLD_BURN),
        ("update_fees",    cpu_update, THRESHOLD_UPDATE_FEES),
        ("get_state",      cpu_state,  THRESHOLD_GET_STATE),
        ("get_token_info", cpu_info,   THRESHOLD_GET_TOKEN_INFO),
    ];

    for (op, measured, threshold) in rows {
        let status = if measured <= threshold { "OK" } else { "EXCEEDED" };
        std::println!("{:<30} {:>14} {:>14} {:>8}", op, measured, threshold, status);
        assert!(measured <= threshold,
            "GAS REGRESSION: '{}' exceeded threshold ({} > {})", op, measured, threshold);
    }

    std::println!("{}", "=".repeat(70));
}
