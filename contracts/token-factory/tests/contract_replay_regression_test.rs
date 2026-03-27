#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};

#[derive(Debug, PartialEq, Clone)]
enum Error {
    Unauthorized, InvalidParameters, InvalidAmount, TokenNotFound,
    ContractPaused, AlreadyExecuted, ProposalCancelled, ProposalNotQueued,
    NoPendingAdmin, WrongPendingAdmin,
}

#[derive(Debug, PartialEq, Clone)]
enum ProposalState { Queued, Executed, Cancelled }

#[derive(Clone)]
struct StreamInfo {
    creator: Address, recipient: Address,
    amount: i128, claimed_amount: i128,
    start_time: u64, end_time: u64,
    cancelled: bool, paused: bool,
}

#[derive(Clone)]
struct Proposal {
    state: ProposalState, eta: u64,
    cancelled_at: Option<u64>, executed_at: Option<u64>,
}

use std::cell::RefCell;
use std::collections::HashMap;

thread_local! {
    static STREAMS: RefCell<HashMap<u64, StreamInfo>> = RefCell::new(HashMap::new());
    static PROPOSALS: RefCell<HashMap<u64, Proposal>> = RefCell::new(HashMap::new());
    static ADMIN: RefCell<Option<Address>> = RefCell::new(None);
    static PENDING_ADMIN: RefCell<Option<Address>> = RefCell::new(None);
}

fn reset_state() {
    STREAMS.with(|s| s.borrow_mut().clear());
    PROPOSALS.with(|p| p.borrow_mut().clear());
    ADMIN.with(|a| *a.borrow_mut() = None);
    PENDING_ADMIN.with(|p| *p.borrow_mut() = None);
}
fn set_stream(id: u64, s: StreamInfo) { STREAMS.with(|m| { m.borrow_mut().insert(id, s); }); }
fn get_stream(id: u64) -> Option<StreamInfo> { STREAMS.with(|m| m.borrow().get(&id).cloned()) }
fn set_proposal(id: u64, p: Proposal) { PROPOSALS.with(|m| { m.borrow_mut().insert(id, p); }); }
fn get_proposal(id: u64) -> Option<Proposal> { PROPOSALS.with(|m| m.borrow().get(&id).cloned()) }
fn set_admin(a: Address) { ADMIN.with(|v| *v.borrow_mut() = Some(a)); }
fn get_admin() -> Option<Address> { ADMIN.with(|v| v.borrow().clone()) }
fn set_pending_admin(a: Option<Address>) { PENDING_ADMIN.with(|v| *v.borrow_mut() = a); }
fn get_pending_admin() -> Option<Address> { PENDING_ADMIN.with(|v| v.borrow().clone()) }

fn propose_admin(caller: &Address, new_admin: &Address) -> Result<(), Error> {
    if get_admin().as_ref() != Some(caller) { return Err(Error::Unauthorized); }
    set_pending_admin(Some(new_admin.clone()));
    Ok(())
}

fn accept_admin(caller: &Address) -> Result<(), Error> {
    match get_pending_admin() {
        None => Err(Error::NoPendingAdmin),
        Some(p) if p != *caller => Err(Error::WrongPendingAdmin),
        Some(p) => { set_admin(p); set_pending_admin(None); Ok(()) }
    }
}

fn execute_proposal(env: &Env, pid: u64) -> Result<(), Error> {
    let mut p = get_proposal(pid).ok_or(Error::ProposalNotQueued)?;
    match p.state {
        ProposalState::Executed  => return Err(Error::AlreadyExecuted),
        ProposalState::Cancelled => return Err(Error::ProposalCancelled),
        ProposalState::Queued    => {}
    }
    if env.ledger().timestamp() <= p.eta { return Err(Error::InvalidParameters); }
    p.state = ProposalState::Executed;
    p.executed_at = Some(env.ledger().timestamp());
    set_proposal(pid, p);
    Ok(())
}

fn cancel_stream(caller: &Address, sid: u64) -> Result<(), Error> {
    let mut s = get_stream(sid).ok_or(Error::TokenNotFound)?;
    if s.creator != *caller { return Err(Error::Unauthorized); }
    if s.cancelled { return Err(Error::InvalidParameters); }
    s.cancelled = true;
    set_stream(sid, s);
    Ok(())
}

fn claim_stream(env: &Env, recipient: &Address, sid: u64) -> Result<i128, Error> {
    let mut s = get_stream(sid).ok_or(Error::TokenNotFound)?;
    if s.recipient != *recipient { return Err(Error::Unauthorized); }
    if s.cancelled { return Err(Error::InvalidParameters); }
    if s.paused    { return Err(Error::ContractPaused); }
    let now = env.ledger().timestamp();
    let vested = if now >= s.end_time { s.amount }
        else if now <= s.start_time { 0 }
        else {
            let e = now - s.start_time;
            let d = s.end_time - s.start_time;
            s.amount * e as i128 / d as i128
        };
    let claimable = vested - s.claimed_amount;
    if claimable <= 0 { return Err(Error::InvalidAmount); }
    s.claimed_amount += claimable;
    set_stream(sid, s);
    Ok(claimable)
}

fn make_env() -> Env { let e = Env::default(); e.mock_all_auths(); e }

fn make_stream_fixture(env: &Env) -> (u64, Address, Address) {
    reset_state();
    let creator   = Address::generate(env);
    let recipient = Address::generate(env);
    set_stream(0, StreamInfo {
        creator: creator.clone(), recipient: recipient.clone(),
        amount: 10_000, claimed_amount: 0,
        start_time: 1_000, end_time: 2_000,
        cancelled: false, paused: false,
    });
    (0, creator, recipient)
}

fn make_proposal_fixture(env: &Env) -> (u64, u64) {
    reset_state();
    let eta = env.ledger().timestamp() + 3_600;
    set_proposal(1, Proposal { state: ProposalState::Queued, eta, cancelled_at: None, executed_at: None });
    (1, eta)
}

fn make_admin_fixture(env: &Env) -> (Address, Address) {
    reset_state();
    let admin     = Address::generate(env);
    let new_admin = Address::generate(env);
    set_admin(admin.clone());
    (admin, new_admin)
}

#[test]
fn test_accept_admin_replay_fails_after_acceptance() {
    let env = make_env();
    let (admin, new_admin) = make_admin_fixture(&env);
    propose_admin(&admin, &new_admin).unwrap();
    accept_admin(&new_admin).unwrap();
    assert_eq!(get_admin(), Some(new_admin.clone()));
    assert_eq!(accept_admin(&new_admin), Err(Error::NoPendingAdmin));
}

#[test]
fn test_accept_admin_replay_is_deterministic() {
    let env = make_env();
    let (admin, new_admin) = make_admin_fixture(&env);
    propose_admin(&admin, &new_admin).unwrap();
    accept_admin(&new_admin).unwrap();
    for i in 0..5 {
        assert_eq!(accept_admin(&new_admin), Err(Error::NoPendingAdmin), "replay #{}", i+1);
    }
    assert_eq!(get_admin(), Some(new_admin));
}

#[test]
fn test_accept_admin_stale_replay_fails() {
    let env = make_env();
    let (admin, first) = make_admin_fixture(&env);
    let second = Address::generate(&env);
    propose_admin(&admin, &first).unwrap();
    propose_admin(&admin, &second).unwrap();
    for i in 0..3 {
        assert_eq!(accept_admin(&first), Err(Error::WrongPendingAdmin), "stale replay #{}", i+1);
    }
    accept_admin(&second).unwrap();
    assert_eq!(get_admin(), Some(second));
}

#[test]
fn test_old_admin_cannot_replay_accept_after_transfer() {
    let env = make_env();
    let (admin, new_admin) = make_admin_fixture(&env);
    propose_admin(&admin, &new_admin).unwrap();
    accept_admin(&new_admin).unwrap();
    assert!(accept_admin(&admin).is_err());
    assert_eq!(get_admin(), Some(new_admin));
}

#[test]
fn test_execute_proposal_replay_fails() {
    let env = make_env();
    let (pid, eta) = make_proposal_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = eta + 1);
    execute_proposal(&env, pid).unwrap();
    assert_eq!(get_proposal(pid).unwrap().state, ProposalState::Executed);
    assert_eq!(execute_proposal(&env, pid), Err(Error::AlreadyExecuted));
}

#[test]
fn test_execute_proposal_replay_is_deterministic() {
    let env = make_env();
    let (pid, eta) = make_proposal_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = eta + 1);
    execute_proposal(&env, pid).unwrap();
    for i in 0..5 {
        assert_eq!(execute_proposal(&env, pid), Err(Error::AlreadyExecuted), "replay #{}", i+1);
    }
}

#[test]
fn test_execute_cancelled_proposal_replay_fails() {
    let env = make_env();
    let (pid, eta) = make_proposal_fixture(&env);
    let mut p = get_proposal(pid).unwrap();
    p.state = ProposalState::Cancelled;
    p.cancelled_at = Some(env.ledger().timestamp());
    set_proposal(pid, p);
    env.ledger().with_mut(|li| li.timestamp = eta + 1);
    for i in 0..3 {
        assert_eq!(execute_proposal(&env, pid), Err(Error::ProposalCancelled), "attempt #{}", i+1);
    }
}

#[test]
fn test_two_proposals_no_cross_replay() {
    let env = make_env();
    reset_state();
    let eta1 = env.ledger().timestamp() + 1_000;
    let eta2 = env.ledger().timestamp() + 2_000;
    set_proposal(1, Proposal { state: ProposalState::Queued, eta: eta1, cancelled_at: None, executed_at: None });
    set_proposal(2, Proposal { state: ProposalState::Queued, eta: eta2, cancelled_at: None, executed_at: None });
    env.ledger().with_mut(|li| li.timestamp = eta1 + 1);
    execute_proposal(&env, 1).unwrap();
    assert_eq!(get_proposal(2).unwrap().state, ProposalState::Queued);
    env.ledger().with_mut(|li| li.timestamp = eta2 + 1);
    execute_proposal(&env, 2).unwrap();
    assert_eq!(execute_proposal(&env, 1), Err(Error::AlreadyExecuted));
    assert_eq!(execute_proposal(&env, 2), Err(Error::AlreadyExecuted));
}

#[test]
fn test_claim_stream_replay_same_timestamp_fails() {
    let env = make_env();
    let (sid, _, recipient) = make_stream_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = 1_500);
    assert!(claim_stream(&env, &recipient, sid).unwrap() > 0);
    assert_eq!(claim_stream(&env, &recipient, sid), Err(Error::InvalidAmount));
}

#[test]
fn test_claim_stream_replay_after_full_vesting_fails() {
    let env = make_env();
    let (sid, _, recipient) = make_stream_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = 3_000);
    assert_eq!(claim_stream(&env, &recipient, sid).unwrap(), 10_000);
    assert_eq!(claim_stream(&env, &recipient, sid), Err(Error::InvalidAmount));
}

#[test]
fn test_claim_stream_replay_is_deterministic() {
    let env = make_env();
    let (sid, _, recipient) = make_stream_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = 3_000);
    claim_stream(&env, &recipient, sid).unwrap();
    for i in 0..5 {
        assert_eq!(claim_stream(&env, &recipient, sid), Err(Error::InvalidAmount), "replay #{}", i+1);
    }
    let s = get_stream(sid).unwrap();
    assert_eq!(s.claimed_amount, s.amount);
}

#[test]
fn test_claim_stream_replay_on_cancelled_fails() {
    let env = make_env();
    let (sid, creator, recipient) = make_stream_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = 1_500);
    let partial = claim_stream(&env, &recipient, sid).unwrap();
    cancel_stream(&creator, sid).unwrap();
    for i in 0..3 {
        assert_eq!(claim_stream(&env, &recipient, sid), Err(Error::InvalidParameters), "claim #{}", i+1);
    }
    assert_eq!(get_stream(sid).unwrap().claimed_amount, partial);
}

#[test]
fn test_claim_stream_unauthorized_replay_fails() {
    let env = make_env();
    let (sid, _, recipient) = make_stream_fixture(&env);
    let attacker = Address::generate(&env);
    env.ledger().with_mut(|li| li.timestamp = 1_500);
    claim_stream(&env, &recipient, sid).unwrap();
    for i in 0..3 {
        assert_eq!(claim_stream(&env, &attacker, sid), Err(Error::Unauthorized), "attacker replay #{}", i+1);
    }
}

#[test]
fn test_claim_stream_incremental_no_double_accounting() {
    let env = make_env();
    let (sid, _, recipient) = make_stream_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = 1_250);
    let c1 = claim_stream(&env, &recipient, sid).unwrap();
    assert_eq!(c1, 2_500);
    env.ledger().with_mut(|li| li.timestamp = 1_500);
    let c2 = claim_stream(&env, &recipient, sid).unwrap();
    assert_eq!(c2, 2_500);
    env.ledger().with_mut(|li| li.timestamp = 3_000);
    let c3 = claim_stream(&env, &recipient, sid).unwrap();
    assert_eq!(c3, 5_000);
    let s = get_stream(sid).unwrap();
    assert_eq!(c1 + c2 + c3, s.amount);
    assert_eq!(s.claimed_amount, s.amount);
    assert_eq!(claim_stream(&env, &recipient, sid), Err(Error::InvalidAmount));
}

#[test]
fn test_cancel_stream_replay_fails() {
    let env = make_env();
    let (sid, creator, _) = make_stream_fixture(&env);
    cancel_stream(&creator, sid).unwrap();
    assert_eq!(cancel_stream(&creator, sid), Err(Error::InvalidParameters));
}

#[test]
fn test_cancel_stream_replay_is_deterministic() {
    let env = make_env();
    let (sid, creator, _) = make_stream_fixture(&env);
    cancel_stream(&creator, sid).unwrap();
    for i in 0..5 {
        assert_eq!(cancel_stream(&creator, sid), Err(Error::InvalidParameters), "replay #{}", i+1);
    }
    assert!(get_stream(sid).unwrap().cancelled);
}

#[test]
fn test_cancel_stream_unauthorized_replay_fails() {
    let env = make_env();
    let (sid, creator, _) = make_stream_fixture(&env);
    let attacker = Address::generate(&env);
    for i in 0..3 {
        assert_eq!(cancel_stream(&attacker, sid), Err(Error::Unauthorized), "attacker replay #{}", i+1);
    }
    assert!(!get_stream(sid).unwrap().cancelled);
    cancel_stream(&creator, sid).unwrap();
    assert!(get_stream(sid).unwrap().cancelled);
}

#[test]
fn test_cancel_then_claim_replay_no_state_drift() {
    let env = make_env();
    let (sid, creator, recipient) = make_stream_fixture(&env);
    env.ledger().with_mut(|li| li.timestamp = 1_500);
    let pre = claim_stream(&env, &recipient, sid).unwrap();
    assert!(pre > 0);
    cancel_stream(&creator, sid).unwrap();
    let claimed_at_cancel = get_stream(sid).unwrap().claimed_amount;
    assert_eq!(cancel_stream(&creator, sid), Err(Error::InvalidParameters));
    for _ in 0..3 { let _ = claim_stream(&env, &recipient, sid); }
    assert_eq!(get_stream(sid).unwrap().claimed_amount, claimed_at_cancel);
}
