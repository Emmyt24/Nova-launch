use soroban_sdk::{testutils::Address as _, Address, Env};

// Mock minimal storage and types for standalone testing
mod mock {
    use soroban_sdk::{Address, Env};

    pub struct GovernanceConfig {
        pub quorum_percent: u32,
        pub approval_percent: u32,
    }

    pub fn is_quorum_met(total_votes: u32, total_eligible: u32, quorum_percent: u32) -> bool {
        if total_eligible == 0 {
            return false;
        }

        let votes_required = (total_eligible as u64 * quorum_percent as u64) / 100;
        total_votes as u64 >= votes_required
    }

    pub fn is_approval_met(yes_votes: u32, total_votes: u32, approval_percent: u32) -> bool {
        if total_votes == 0 {
            return false;
        }

        let yes_required = (total_votes as u64 * approval_percent as u64) / 100;
        yes_votes as u64 >= yes_required
    }
}

#[test]
fn test_quorum_zero_percent() {
    assert!(mock::is_quorum_met(0, 100, 0));
    assert!(mock::is_quorum_met(1, 100, 0));
}

#[test]
fn test_quorum_fifty_percent() {
    assert!(mock::is_quorum_met(50, 100, 50));
    assert!(mock::is_quorum_met(51, 100, 50));
    assert!(!mock::is_quorum_met(49, 100, 50));
}

#[test]
fn test_quorum_hundred_percent() {
    assert!(mock::is_quorum_met(100, 100, 100));
    assert!(!mock::is_quorum_met(99, 100, 100));
}

#[test]
fn test_approval_zero_percent() {
    assert!(mock::is_approval_met(0, 100, 0));
    assert!(mock::is_approval_met(1, 100, 0));
}

#[test]
fn test_approval_fifty_percent() {
    assert!(mock::is_approval_met(50, 100, 50));
    assert!(mock::is_approval_met(51, 100, 50));
    assert!(!mock::is_approval_met(49, 100, 50));
}

#[test]
fn test_approval_hundred_percent() {
    assert!(mock::is_approval_met(100, 100, 100));
    assert!(!mock::is_approval_met(99, 100, 100));
}

#[test]
fn test_realistic_dao_scenario() {
    // 1000 members, 30% quorum, 66% approval
    let total_eligible = 1000;
    let quorum_threshold = 30;
    let approval_threshold = 66;

    // 350 votes, 250 yes (71% approval) - both met
    assert!(mock::is_quorum_met(350, total_eligible, quorum_threshold));
    assert!(mock::is_approval_met(250, 350, approval_threshold));

    // 350 votes, 200 yes (57% approval) - approval fails
    assert!(mock::is_quorum_met(350, total_eligible, quorum_threshold));
    assert!(!mock::is_approval_met(200, 350, approval_threshold));
}
