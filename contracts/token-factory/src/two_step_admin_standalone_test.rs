//! Minimal standalone test for two-step admin transfer
//! This test can be run independently to verify the functionality

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_two_step_admin_transfer_works() {
    let env = Env::default();
    env.mock_all_auths();

    // Register contract
    let contract_id = env.register_contract(None, crate::TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let new_admin = Address::generate(&env);

    // Initialize
    client
        .initialize(&admin, &treasury, &100_000_000, &50_000_000)
        .unwrap();

    // Verify initial admin
    let state = client.get_state();
    assert_eq!(state.admin, admin, "Initial admin should be set");

    // Step 1: Propose new admin
    client.propose_admin(&admin, &new_admin).unwrap();

    // Admin should still be the old one
    let state = client.get_state();
    assert_eq!(state.admin, admin, "Admin should not change after proposal");

    // Step 2: New admin accepts
    client.accept_admin(&new_admin).unwrap();

    // Admin should now be the new one
    let state = client.get_state();
    assert_eq!(state.admin, new_admin, "Admin should be updated after acceptance");

    println!("✅ Two-step admin transfer works correctly!");
}

#[test]
fn test_unauthorized_acceptance_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, crate::TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client
        .initialize(&admin, &treasury, &100_000_000, &50_000_000)
        .unwrap();

    // Propose transfer
    client.propose_admin(&admin, &new_admin).unwrap();

    // Unauthorized address tries to accept
    let result = client.try_accept_admin(&unauthorized);
    assert!(result.is_err(), "Unauthorized acceptance should fail");

    // Admin should be unchanged
    let state = client.get_state();
    assert_eq!(state.admin, admin, "Admin should remain unchanged");

    println!("✅ Unauthorized acceptance correctly rejected!");
}

#[test]
fn test_no_pending_admin_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, crate::TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let random = Address::generate(&env);

    client
        .initialize(&admin, &treasury, &100_000_000, &50_000_000)
        .unwrap();

    // Try to accept without any proposal
    let result = client.try_accept_admin(&random);
    assert!(result.is_err(), "Accept without proposal should fail");

    println!("✅ No pending admin error correctly handled!");
}

#[test]
fn test_stale_proposal_overwritten() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, crate::TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let first_proposed = Address::generate(&env);
    let second_proposed = Address::generate(&env);

    client
        .initialize(&admin, &treasury, &100_000_000, &50_000_000)
        .unwrap();

    // First proposal
    client.propose_admin(&admin, &first_proposed).unwrap();

    // Second proposal overwrites
    client.propose_admin(&admin, &second_proposed).unwrap();

    // First proposed cannot accept
    let result = client.try_accept_admin(&first_proposed);
    assert!(result.is_err(), "Stale proposal should be rejected");

    // Second proposed can accept
    client.accept_admin(&second_proposed).unwrap();

    let state = client.get_state();
    assert_eq!(state.admin, second_proposed, "Second proposal should succeed");

    println!("✅ Stale proposals correctly overwritten!");
}

#[test]
#[allow(deprecated)]
fn test_backward_compatibility() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, crate::TokenFactory);
    let client = crate::TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client
        .initialize(&admin, &treasury, &100_000_000, &50_000_000)
        .unwrap();

    // Old single-step transfer should still work
    client.transfer_admin(&admin, &new_admin).unwrap();

    let state = client.get_state();
    assert_eq!(state.admin, new_admin, "Old transfer method should work");

    println!("✅ Backward compatibility maintained!");
}
