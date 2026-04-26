//! Governance Delegation System — Unit & Integration Tests
//!
//! Coverage areas:
//!  [INIT]  Initialization
//!  [AUTH]  Authorization & access control
//!  [DEL]   Delegation happy paths
//!  [UNDEL] Undelegation
//!  [REDEL] Re-delegation
//!  [SNAP]  Snapshots
//!  [BAL]   Balance management
//!  [PAUSE] Pause / unpause
//!  [EDGE]  Edge cases & error paths
//!
//! NOTE on Soroban test client API:
//! The generated `*Client` methods return the value directly and panic on
//! contract errors.  To test error paths we use `try_*` variants which
//! return `Result<T, soroban_sdk::Error>`.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};
use crate::{GovernanceContract, GovernanceContractClient};

// ─── Test helpers ──────────────────────────────────────────────────────────

/// Deploy and initialise the contract, returning (env, contract_id, admin).
fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &1_000_000_i128);

    (env, contract_id, admin)
}

fn client<'a>(env: &'a Env, contract_id: &'a Address) -> GovernanceContractClient<'a> {
    GovernanceContractClient::new(env, contract_id)
}

/// Give `holder` a balance and initialise their vote power.
fn fund(env: &Env, contract_id: &Address, admin: &Address, holder: &Address, amount: i128) {
    let c = client(env, contract_id);
    c.set_balance(admin, holder, &amount);
}

// ─── [INIT] Initialization ─────────────────────────────────────────────────

#[test]
fn init_succeeds_with_valid_params() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, GovernanceContract);
    let c = GovernanceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    c.initialize(&admin, &1_000_000_i128);
}

#[test]
#[should_panic]
fn init_rejects_zero_supply() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, GovernanceContract);
    let c = GovernanceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    c.initialize(&admin, &0_i128);
}

#[test]
#[should_panic]
fn init_rejects_double_initialization() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    c.initialize(&admin, &1_000_000_i128);
}

// ─── [AUTH] Authorization ──────────────────────────────────────────────────

#[test]
#[should_panic]
fn auth_non_admin_cannot_set_balance() {
    let (env, contract_id, _admin) = setup();
    let c = client(&env, &contract_id);
    let impostor = Address::generate(&env);
    let holder = Address::generate(&env);
    c.set_balance(&impostor, &holder, &1000_i128);
}

#[test]
#[should_panic]
fn auth_non_admin_cannot_pause() {
    let (env, contract_id, _admin) = setup();
    let c = client(&env, &contract_id);
    let impostor = Address::generate(&env);
    c.pause(&impostor);
}

#[test]
#[should_panic]
fn auth_non_admin_cannot_transfer_admin() {
    let (env, contract_id, _admin) = setup();
    let c = client(&env, &contract_id);
    let impostor = Address::generate(&env);
    let new_admin = Address::generate(&env);
    c.transfer_admin(&impostor, &new_admin);
}

// ─── [DEL] Delegation happy paths ─────────────────────────────────────────

#[test]
fn delegate_transfers_vote_power() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 500_i128);

    assert_eq!(c.get_vote_power(&alice), 500_i128);
    assert_eq!(c.get_vote_power(&bob), 0_i128);

    c.delegate(&alice, &bob);

    assert_eq!(c.get_vote_power(&alice), 0_i128);
    assert_eq!(c.get_vote_power(&bob), 500_i128);
}

#[test]
fn delegate_records_delegation() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.delegate(&alice, &bob);

    let record = c.get_delegation(&alice).unwrap();
    assert_eq!(record.delegator, alice);
    assert_eq!(record.delegatee, bob);
}

#[test]
fn delegate_multiple_delegators_to_same_delegatee() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 300_i128);
    fund(&env, &contract_id, &admin, &bob, 200_i128);

    c.delegate(&alice, &carol);
    c.delegate(&bob, &carol);

    assert_eq!(c.get_vote_power(&carol), 500_i128);
    assert_eq!(c.get_vote_power(&alice), 0_i128);
    assert_eq!(c.get_vote_power(&bob), 0_i128);
}

#[test]
#[should_panic]
fn delegate_rejects_self_delegation() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.delegate(&alice, &alice);
}

#[test]
#[should_panic]
fn delegate_rejects_zero_balance() {
    let (env, contract_id, _admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    c.delegate(&alice, &bob);
}

#[test]
#[should_panic]
fn delegate_rejects_circular_delegation() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    fund(&env, &contract_id, &admin, &bob, 100_i128);

    c.delegate(&alice, &bob);
    c.delegate(&bob, &alice); // must panic
}

// ─── [UNDEL] Undelegation ─────────────────────────────────────────────────

#[test]
fn undelegate_returns_vote_power_to_delegator() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 400_i128);
    c.delegate(&alice, &bob);
    assert_eq!(c.get_vote_power(&bob), 400_i128);

    c.undelegate(&alice);

    assert_eq!(c.get_vote_power(&alice), 400_i128);
    assert_eq!(c.get_vote_power(&bob), 0_i128);
}

#[test]
fn undelegate_removes_delegation_record() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.delegate(&alice, &bob);
    c.undelegate(&alice);

    assert!(c.get_delegation(&alice).is_none());
}

#[test]
#[should_panic]
fn undelegate_fails_when_no_delegation_exists() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.undelegate(&alice);
}

// ─── [REDEL] Re-delegation ────────────────────────────────────────────────

#[test]
fn redelegate_moves_power_atomically() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 600_i128);

    c.delegate(&alice, &bob);
    assert_eq!(c.get_vote_power(&bob), 600_i128);

    c.delegate(&alice, &carol);

    assert_eq!(c.get_vote_power(&bob), 0_i128);
    assert_eq!(c.get_vote_power(&carol), 600_i128);
    assert_eq!(c.get_vote_power(&alice), 0_i128);
}

#[test]
fn redelegate_to_same_delegatee_is_noop() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.delegate(&alice, &bob);
    c.delegate(&alice, &bob); // no-op, must not panic
    assert_eq!(c.get_vote_power(&bob), 100_i128);
}

// ─── [SNAP] Snapshots ─────────────────────────────────────────────────────

#[test]
fn snapshot_records_current_vote_power() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 250_i128);

    let ledger = env.ledger().sequence();
    c.take_snapshot(&alice);

    let power = c.get_snapshot_power(&alice, &ledger);
    assert_eq!(power, 250_i128);
}

#[test]
#[should_panic]
fn snapshot_not_found_returns_error() {
    let (env, contract_id, _admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    c.get_snapshot_power(&alice, &9999_u32);
}

// ─── [BAL] Balance management ─────────────────────────────────────────────

#[test]
fn set_balance_updates_vote_power_for_undelegated_holder() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);

    c.set_balance(&admin, &alice, &1000_i128);
    assert_eq!(c.get_vote_power(&alice), 1000_i128);

    c.set_balance(&admin, &alice, &1500_i128);
    assert_eq!(c.get_vote_power(&alice), 1500_i128);
}

#[test]
fn set_balance_updates_delegatee_power_when_delegated() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 500_i128);
    c.delegate(&alice, &bob);
    assert_eq!(c.get_vote_power(&bob), 500_i128);

    c.set_balance(&admin, &alice, &800_i128);
    assert_eq!(c.get_vote_power(&bob), 800_i128);
}

#[test]
#[should_panic]
fn set_balance_rejects_negative_value() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    c.set_balance(&admin, &alice, &(-1_i128));
}

// ─── [PAUSE] Pause / unpause ──────────────────────────────────────────────

#[test]
#[should_panic]
fn pause_blocks_delegate() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.pause(&admin);
    c.delegate(&alice, &bob);
}

#[test]
#[should_panic]
fn pause_blocks_undelegate() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.delegate(&alice, &bob);
    c.pause(&admin);
    c.undelegate(&alice);
}

#[test]
fn unpause_restores_operations() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 100_i128);
    c.pause(&admin);
    c.unpause(&admin);
    c.delegate(&alice, &bob); // must not panic
}

#[test]
fn is_paused_reflects_state() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);

    assert!(!c.is_paused());
    c.pause(&admin);
    assert!(c.is_paused());
    c.unpause(&admin);
    assert!(!c.is_paused());
}

// ─── [EDGE] Edge cases ────────────────────────────────────────────────────

#[test]
fn transfer_admin_succeeds() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let new_admin = Address::generate(&env);

    c.transfer_admin(&admin, &new_admin);
    // New admin can pause
    c.pause(&new_admin);
    assert!(c.is_paused());
}

#[test]
#[should_panic]
fn transfer_admin_old_admin_loses_rights() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let new_admin = Address::generate(&env);

    c.transfer_admin(&admin, &new_admin);
    c.pause(&admin); // old admin must no longer work
}

#[test]
#[should_panic]
fn transfer_admin_rejects_same_address() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    c.transfer_admin(&admin, &admin);
}

#[test]
fn vote_power_invariant_preserved_after_delegate_undelegate() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 300_i128);
    fund(&env, &contract_id, &admin, &bob, 200_i128);
    fund(&env, &contract_id, &admin, &carol, 100_i128);

    c.delegate(&alice, &carol);
    c.delegate(&bob, &carol);

    let total = c.get_vote_power(&alice)
        + c.get_vote_power(&bob)
        + c.get_vote_power(&carol);
    assert_eq!(total, 600_i128);

    c.undelegate(&alice);

    let total_after = c.get_vote_power(&alice)
        + c.get_vote_power(&bob)
        + c.get_vote_power(&carol);
    assert_eq!(total_after, 600_i128);
}

#[test]
fn delegate_then_balance_decrease_does_not_underflow() {
    let (env, contract_id, admin) = setup();
    let c = client(&env, &contract_id);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    fund(&env, &contract_id, &admin, &alice, 1000_i128);
    c.delegate(&alice, &bob);

    c.set_balance(&admin, &alice, &400_i128);

    let bob_power = c.get_vote_power(&bob);
    assert!(bob_power >= 0, "Vote power must never be negative");
}
