use crate::governance::*;
use crate::storage;
use crate::types::Error;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    storage::set_admin(&env, &admin);
    
    (env, admin)
}

// ── Initialization Tests ──

#[test]
fn test_initialize_with_defaults() {
    let (env, _) = setup();
    
    initialize_governance(&env, None, None).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 30);
    assert_eq!(config.approval_percent, 51);
}

#[test]
fn test_initialize_with_custom_values() {
    let (env, _) = setup();
    
    initialize_governance(&env, Some(25), Some(66)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 25);
    assert_eq!(config.approval_percent, 66);
}

#[test]
fn test_initialize_zero_percent_valid() {
    let (env, _) = setup();
    
    initialize_governance(&env, Some(0), Some(0)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 0);
    assert_eq!(config.approval_percent, 0);
}

#[test]
fn test_initialize_fifty_percent() {
    let (env, _) = setup();
    
    initialize_governance(&env, Some(50), Some(50)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 50);
    assert_eq!(config.approval_percent, 50);
}

#[test]
fn test_initialize_hundred_percent_valid() {
    let (env, _) = setup();
    
    initialize_governance(&env, Some(100), Some(100)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 100);
    assert_eq!(config.approval_percent, 100);
}

#[test]
fn test_initialize_quorum_exceeds_hundred() {
    let (env, _) = setup();
    
    let result = initialize_governance(&env, Some(101), Some(50));
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_initialize_approval_exceeds_hundred() {
    let (env, _) = setup();
    
    let result = initialize_governance(&env, Some(50), Some(101));
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_initialize_both_exceed_hundred() {
    let (env, _) = setup();
    
    let result = initialize_governance(&env, Some(150), Some(200));
    assert_eq!(result, Err(Error::InvalidParameters));
}

// ── Update Tests ──

#[test]
fn test_update_both_parameters() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    update_governance_config(&env, &admin, Some(40), Some(60)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 40);
    assert_eq!(config.approval_percent, 60);
}

#[test]
fn test_update_quorum_only() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    update_governance_config(&env, &admin, Some(45), None).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 45);
    assert_eq!(config.approval_percent, 51);
}

#[test]
fn test_update_approval_only() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    update_governance_config(&env, &admin, None, Some(75)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 30);
    assert_eq!(config.approval_percent, 75);
}

#[test]
fn test_update_both_none_fails() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    let result = update_governance_config(&env, &admin, None, None);
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_update_unauthorized() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    let non_admin = Address::generate(&env);
    let result = update_governance_config(&env, &non_admin, Some(50), None);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn test_update_to_zero_percent() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    update_governance_config(&env, &admin, Some(0), Some(0)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 0);
    assert_eq!(config.approval_percent, 0);
}

#[test]
fn test_update_to_hundred_percent() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    update_governance_config(&env, &admin, Some(100), Some(100)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 100);
    assert_eq!(config.approval_percent, 100);
}

#[test]
fn test_update_invalid_quorum() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    let result = update_governance_config(&env, &admin, Some(101), None);
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_update_invalid_approval() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    let result = update_governance_config(&env, &admin, None, Some(101));
    assert_eq!(result, Err(Error::InvalidParameters));
}

// ── Quorum Logic Tests ──

#[test]
fn test_quorum_exact_threshold() {
    assert!(is_quorum_met(30, 100, 30));
}

#[test]
fn test_quorum_above_threshold() {
    assert!(is_quorum_met(31, 100, 30));
    assert!(is_quorum_met(50, 100, 30));
}

#[test]
fn test_quorum_below_threshold() {
    assert!(!is_quorum_met(29, 100, 30));
    assert!(!is_quorum_met(1, 100, 30));
}

#[test]
fn test_quorum_zero_percent_always_met() {
    assert!(is_quorum_met(0, 100, 0));
    assert!(is_quorum_met(1, 100, 0));
}

#[test]
fn test_quorum_hundred_percent_requires_all() {
    assert!(is_quorum_met(100, 100, 100));
    assert!(!is_quorum_met(99, 100, 100));
    assert!(!is_quorum_met(50, 100, 100));
}

#[test]
fn test_quorum_fifty_percent() {
    assert!(is_quorum_met(50, 100, 50));
    assert!(is_quorum_met(51, 100, 50));
    assert!(!is_quorum_met(49, 100, 50));
}

#[test]
fn test_quorum_zero_eligible_voters() {
    assert!(!is_quorum_met(0, 0, 30));
    assert!(!is_quorum_met(10, 0, 30));
}

#[test]
fn test_quorum_rounding_down() {
    // 33% of 100 = 33 votes required
    assert!(is_quorum_met(33, 100, 33));
    assert!(!is_quorum_met(32, 100, 33));
    
    // 33% of 99 = 32.67 -> 32 votes required (floor)
    assert!(is_quorum_met(32, 99, 33));
    assert!(!is_quorum_met(31, 99, 33));
}

#[test]
fn test_quorum_small_numbers() {
    // 50% of 3 = 1.5 -> 1 vote required
    assert!(is_quorum_met(1, 3, 50));
    assert!(!is_quorum_met(0, 3, 50));
    
    // 100% of 1 = 1 vote required
    assert!(is_quorum_met(1, 1, 100));
    assert!(!is_quorum_met(0, 1, 100));
}

// ── Approval Logic Tests ──

#[test]
fn test_approval_exact_threshold() {
    assert!(is_approval_met(51, 100, 51));
}

#[test]
fn test_approval_above_threshold() {
    assert!(is_approval_met(52, 100, 51));
    assert!(is_approval_met(75, 100, 51));
}

#[test]
fn test_approval_below_threshold() {
    assert!(!is_approval_met(50, 100, 51));
    assert!(!is_approval_met(25, 100, 51));
}

#[test]
fn test_approval_zero_percent_always_met() {
    assert!(is_approval_met(0, 100, 0));
    assert!(is_approval_met(1, 100, 0));
}

#[test]
fn test_approval_hundred_percent_requires_all() {
    assert!(is_approval_met(100, 100, 100));
    assert!(!is_approval_met(99, 100, 100));
    assert!(!is_approval_met(50, 100, 100));
}

#[test]
fn test_approval_fifty_percent() {
    assert!(is_approval_met(50, 100, 50));
    assert!(is_approval_met(51, 100, 50));
    assert!(!is_approval_met(49, 100, 50));
}

#[test]
fn test_approval_zero_total_votes() {
    assert!(!is_approval_met(0, 0, 51));
    assert!(!is_approval_met(10, 0, 51));
}

#[test]
fn test_approval_rounding_down() {
    // 51% of 100 = 51 yes votes required
    assert!(is_approval_met(51, 100, 51));
    assert!(!is_approval_met(50, 100, 51));
    
    // 51% of 99 = 50.49 -> 50 yes votes required (floor)
    assert!(is_approval_met(50, 99, 51));
    assert!(!is_approval_met(49, 99, 51));
}

#[test]
fn test_approval_small_numbers() {
    // 50% of 3 = 1.5 -> 1 yes vote required
    assert!(is_approval_met(1, 3, 50));
    assert!(!is_approval_met(0, 3, 50));
    
    // 100% of 1 = 1 yes vote required
    assert!(is_approval_met(1, 1, 100));
    assert!(!is_approval_met(0, 1, 100));
}

// ── Combined Quorum and Approval Tests ──

#[test]
fn test_both_thresholds_met() {
    // 60 votes out of 100 eligible (60% quorum)
    // 40 yes out of 60 votes (66.67% approval)
    assert!(is_quorum_met(60, 100, 50));
    assert!(is_approval_met(40, 60, 60));
}

#[test]
fn test_quorum_met_approval_not() {
    // 60 votes out of 100 eligible (60% quorum) ✓
    // 30 yes out of 60 votes (50% approval) ✗ (need 51%)
    assert!(is_quorum_met(60, 100, 50));
    assert!(!is_approval_met(30, 60, 51));
}

#[test]
fn test_approval_met_quorum_not() {
    // 40 votes out of 100 eligible (40% quorum) ✗ (need 50%)
    // 30 yes out of 40 votes (75% approval) ✓
    assert!(!is_quorum_met(40, 100, 50));
    assert!(is_approval_met(30, 40, 60));
}

#[test]
fn test_neither_threshold_met() {
    // 40 votes out of 100 eligible (40% quorum) ✗
    // 20 yes out of 40 votes (50% approval) ✗
    assert!(!is_quorum_met(40, 100, 50));
    assert!(!is_approval_met(20, 40, 51));
}

// ── Edge Case Tests ──

#[test]
fn test_unanimous_approval() {
    assert!(is_approval_met(100, 100, 100));
    assert!(is_approval_met(50, 50, 100));
    assert!(is_approval_met(1, 1, 100));
}

#[test]
fn test_one_vote_short_of_unanimous() {
    assert!(!is_approval_met(99, 100, 100));
    assert!(!is_approval_met(49, 50, 100));
}

#[test]
fn test_majority_thresholds() {
    // Simple majority (>50%)
    assert!(is_approval_met(51, 100, 51));
    assert!(!is_approval_met(50, 100, 51));
    
    // Supermajority (>66%)
    assert!(is_approval_met(67, 100, 67));
    assert!(!is_approval_met(66, 100, 67));
}

#[test]
fn test_extreme_low_participation() {
    // 1 vote out of 1000 eligible
    assert!(!is_quorum_met(1, 1000, 10));
    assert!(is_quorum_met(100, 1000, 10));
}

#[test]
fn test_extreme_high_participation() {
    // All eligible voters participate
    assert!(is_quorum_met(1000, 1000, 100));
    assert!(is_quorum_met(1000, 1000, 50));
    assert!(is_quorum_met(1000, 1000, 1));
}

// ── Boundary Tests ──

#[test]
fn test_one_percent_threshold() {
    // 1% of 100 = 1 vote required
    assert!(is_quorum_met(1, 100, 1));
    assert!(!is_quorum_met(0, 100, 1));
    
    assert!(is_approval_met(1, 100, 1));
    assert!(!is_approval_met(0, 100, 1));
}

#[test]
fn test_ninety_nine_percent_threshold() {
    // 99% of 100 = 99 votes required
    assert!(is_quorum_met(99, 100, 99));
    assert!(!is_quorum_met(98, 100, 99));
    
    assert!(is_approval_met(99, 100, 99));
    assert!(!is_approval_met(98, 100, 99));
}

// ── Integration Tests ──

#[test]
fn test_update_preserves_unspecified_values() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(25), Some(60)).unwrap();
    
    // Update only quorum
    update_governance_config(&env, &admin, Some(35), None).unwrap();
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 35);
    assert_eq!(config.approval_percent, 60);
    
    // Update only approval
    update_governance_config(&env, &admin, None, Some(70)).unwrap();
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 35);
    assert_eq!(config.approval_percent, 70);
}

#[test]
fn test_multiple_updates_sequence() {
    let (env, admin) = setup();
    
    initialize_governance(&env, Some(30), Some(51)).unwrap();
    
    update_governance_config(&env, &admin, Some(40), None).unwrap();
    update_governance_config(&env, &admin, None, Some(60)).unwrap();
    update_governance_config(&env, &admin, Some(50), Some(75)).unwrap();
    
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 50);
    assert_eq!(config.approval_percent, 75);
}

#[test]
fn test_get_config_before_initialization() {
    let (env, _) = setup();
    
    // Should return defaults
    let config = get_governance_config(&env);
    assert_eq!(config.quorum_percent, 30);
    assert_eq!(config.approval_percent, 51);
}

// ── Real-world Scenario Tests ──

#[test]
fn test_realistic_dao_scenario() {
    // DAO with 1000 members, 30% quorum, 66% approval
    let total_eligible = 1000;
    let quorum_threshold = 30;
    let approval_threshold = 66;
    
    // Scenario 1: 350 votes, 250 yes (71% approval)
    assert!(is_quorum_met(350, total_eligible, quorum_threshold));
    assert!(is_approval_met(250, 350, approval_threshold));
    
    // Scenario 2: 350 votes, 200 yes (57% approval) - fails approval
    assert!(is_quorum_met(350, total_eligible, quorum_threshold));
    assert!(!is_approval_met(200, 350, approval_threshold));
    
    // Scenario 3: 250 votes, 200 yes (80% approval) - fails quorum
    assert!(!is_quorum_met(250, total_eligible, quorum_threshold));
    assert!(is_approval_met(200, 250, approval_threshold));
}

#[test]
fn test_small_dao_scenario() {
    // Small DAO with 10 members, 50% quorum, 60% approval
    let total_eligible = 10;
    let quorum_threshold = 50;
    let approval_threshold = 60;
    
    // 5 votes (50% quorum), 3 yes (60% approval) - both met
    assert!(is_quorum_met(5, total_eligible, quorum_threshold));
    assert!(is_approval_met(3, 5, approval_threshold));
    
    // 5 votes (50% quorum), 2 yes (40% approval) - approval fails
    assert!(is_quorum_met(5, total_eligible, quorum_threshold));
    assert!(!is_approval_met(2, 5, approval_threshold));
}
