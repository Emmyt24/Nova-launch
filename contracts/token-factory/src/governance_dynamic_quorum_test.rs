//! Tests for dynamic governance quorum adjustment (Issue #880).
//!
//! Covers:
//! - Happy-path configuration and retrieval
//! - Authorization enforcement
//! - Participation recording and quorum adjustment
//! - Rolling-window averaging
//! - Boundary / edge cases (window_size=1, zero votes, full participation)
//! - Error paths (disabled, no history, invalid config)
//! - Monotonicity and clamping invariants

use crate::{
    governance::{
        configure_dynamic_quorum, get_dynamic_quorum_config, get_governance_config,
        initialize_governance, record_participation_and_adjust,
    },
    storage,
    types::{DynamicQuorumConfig, Error},
    TokenFactory,
};
use soroban_sdk::{testutils::Address as _, Address, Env};

// ── helpers ───────────────────────────────────────────────────────────────────

fn setup(env: &Env) -> (Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let admin = Address::generate(env);
    env.as_contract(&contract_id, || {
        storage::set_admin(env, &admin);
        initialize_governance(env, Some(30), Some(51)).unwrap();
    });
    (admin, contract_id)
}

fn default_dq_config() -> DynamicQuorumConfig {
    DynamicQuorumConfig {
        enabled: true,
        min_quorum_percent: 10,
        max_quorum_percent: 60,
        target_participation: 30,
        window_size: 3,
    }
}

// ── configure_dynamic_quorum ──────────────────────────────────────────────────

#[test]
fn test_configure_dynamic_quorum_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();
        let stored = get_dynamic_quorum_config(&env);
        assert!(stored.enabled);
        assert_eq!(stored.min_quorum_percent, 10);
        assert_eq!(stored.max_quorum_percent, 60);
        assert_eq!(stored.window_size, 3);
    });
}

#[test]
fn test_configure_dynamic_quorum_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, contract_id) = setup(&env);
    let non_admin = Address::generate(&env);

    let result = env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &non_admin, default_dq_config())
    });
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn test_configure_dynamic_quorum_invalid_bounds_min_gt_max() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    let bad_config = DynamicQuorumConfig {
        min_quorum_percent: 70,
        max_quorum_percent: 40, // min > max
        ..default_dq_config()
    };
    let result = env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, bad_config)
    });
    assert_eq!(result, Err(Error::InvalidQuorumBounds));
}

#[test]
fn test_configure_dynamic_quorum_max_exceeds_100() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    let bad_config = DynamicQuorumConfig {
        max_quorum_percent: 101,
        ..default_dq_config()
    };
    let result = env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, bad_config)
    });
    assert_eq!(result, Err(Error::InvalidQuorumBounds));
}

#[test]
fn test_configure_dynamic_quorum_zero_window_size() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    let bad_config = DynamicQuorumConfig {
        window_size: 0,
        ..default_dq_config()
    };
    let result = env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, bad_config)
    });
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_configure_dynamic_quorum_target_exceeds_100() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    let bad_config = DynamicQuorumConfig {
        target_participation: 101,
        ..default_dq_config()
    };
    let result = env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, bad_config)
    });
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_configure_dynamic_quorum_disabled_flag() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    let disabled_config = DynamicQuorumConfig {
        enabled: false,
        ..default_dq_config()
    };
    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, disabled_config).unwrap();
        let stored = get_dynamic_quorum_config(&env);
        assert!(!stored.enabled);
    });
}

// ── record_participation_and_adjust ──────────────────────────────────────────

#[test]
fn test_record_participation_disabled_returns_current_quorum() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        // Dynamic quorum is disabled by default.
        let result = record_participation_and_adjust(&env, 0, 30, 100).unwrap();
        // Should return the static quorum (30).
        assert_eq!(result, 30);
    });
    let _ = admin;
}

#[test]
fn test_record_participation_zero_eligible_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, contract_id) = setup(&env);

    let result = env.as_contract(&contract_id, || {
        record_participation_and_adjust(&env, 0, 10, 0)
    });
    assert_eq!(result, Err(Error::InvalidParameters));
}

#[test]
fn test_record_participation_adjusts_quorum_upward() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();

        // 80% participation → avg = 80% → clamped to max 60%
        let new_quorum = record_participation_and_adjust(&env, 0, 80, 100).unwrap();
        assert_eq!(new_quorum, 60); // clamped to max
        assert_eq!(get_governance_config(&env).quorum_percent, 60);
    });
}

#[test]
fn test_record_participation_adjusts_quorum_downward() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();

        // 5% participation → avg = 5% → clamped to min 10%
        let new_quorum = record_participation_and_adjust(&env, 0, 5, 100).unwrap();
        assert_eq!(new_quorum, 10); // clamped to min
    });
}

#[test]
fn test_record_participation_within_bounds() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();

        // 35% participation → avg = 35% → within [10, 60] → quorum = 35
        let new_quorum = record_participation_and_adjust(&env, 0, 35, 100).unwrap();
        assert_eq!(new_quorum, 35);
    });
}

#[test]
fn test_rolling_window_averages_multiple_proposals() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();

        // Proposal 0: 20% participation
        record_participation_and_adjust(&env, 0, 20, 100).unwrap();
        // Proposal 1: 40% participation
        record_participation_and_adjust(&env, 1, 40, 100).unwrap();
        // Proposal 2: 30% participation → rolling avg of [20,40,30] = 30%
        let new_quorum = record_participation_and_adjust(&env, 2, 30, 100).unwrap();
        assert_eq!(new_quorum, 30);
    });
}

#[test]
fn test_rolling_window_size_one() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        let config = DynamicQuorumConfig {
            window_size: 1,
            ..default_dq_config()
        };
        configure_dynamic_quorum(&env, &admin, config).unwrap();

        // Only the latest proposal matters.
        record_participation_and_adjust(&env, 0, 10, 100).unwrap(); // 10%
        let new_quorum = record_participation_and_adjust(&env, 1, 50, 100).unwrap(); // 50%
        assert_eq!(new_quorum, 50);
    });
}

#[test]
fn test_full_participation_clamped_to_max() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();
        let new_quorum = record_participation_and_adjust(&env, 0, 100, 100).unwrap();
        assert_eq!(new_quorum, 60); // max_quorum_percent
    });
}

#[test]
fn test_zero_votes_clamped_to_min() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();
        let new_quorum = record_participation_and_adjust(&env, 0, 0, 100).unwrap();
        assert_eq!(new_quorum, 10); // min_quorum_percent
    });
}

#[test]
fn test_quorum_persisted_after_adjustment() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();
        record_participation_and_adjust(&env, 0, 45, 100).unwrap();
        // Verify the governance config was actually updated.
        let config = get_governance_config(&env);
        assert_eq!(config.quorum_percent, 45);
    });
}

#[test]
fn test_participation_record_stored() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        configure_dynamic_quorum(&env, &admin, default_dq_config()).unwrap();
        record_participation_and_adjust(&env, 7, 25, 100).unwrap();

        let record = storage::get_participation_record(&env, 7).unwrap();
        assert_eq!(record.proposal_id, 7);
        assert_eq!(record.total_votes, 25);
        assert_eq!(record.total_eligible, 100);
        // 25/100 = 25% = 2500 bps
        assert_eq!(record.participation_bps, 2500);
    });
}

#[test]
fn test_min_equals_max_quorum_always_returns_that_value() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        let config = DynamicQuorumConfig {
            min_quorum_percent: 40,
            max_quorum_percent: 40,
            ..default_dq_config()
        };
        configure_dynamic_quorum(&env, &admin, config).unwrap();

        // Regardless of participation, quorum must always be 40.
        for votes in [0u32, 10, 50, 90, 100] {
            let q = record_participation_and_adjust(&env, votes as u64, votes, 100).unwrap();
            assert_eq!(q, 40, "quorum must be 40 for votes={votes}");
        }
    });
}

// ── property: monotonicity ────────────────────────────────────────────────────

#[test]
fn test_higher_participation_never_lowers_quorum_below_lower_participation() {
    // With a single-proposal window, higher participation → higher (or equal) quorum.
    let env = Env::default();
    env.mock_all_auths();
    let (admin, contract_id) = setup(&env);

    env.as_contract(&contract_id, || {
        let config = DynamicQuorumConfig {
            window_size: 1,
            ..default_dq_config()
        };
        configure_dynamic_quorum(&env, &admin, config).unwrap();

        let q_low = record_participation_and_adjust(&env, 0, 10, 100).unwrap();
        let q_high = record_participation_and_adjust(&env, 1, 80, 100).unwrap();
        assert!(q_high >= q_low, "higher participation must not lower quorum");
    });
}
