use crate::events;
use crate::storage;
use crate::types::{Error, GovernanceConfig};
use soroban_sdk::{Address, Env};

/// Default quorum percentage (30%)
const DEFAULT_QUORUM_PERCENT: u32 = 30;

/// Default approval percentage (51%)
const DEFAULT_APPROVAL_PERCENT: u32 = 51;

/// Initialize governance configuration
///
/// Sets up quorum and approval thresholds for governance operations.
///
/// # Arguments
/// * `env` - The contract environment
/// * `quorum_percent` - Minimum participation percentage (0-100)
/// * `approval_percent` - Minimum approval percentage (0-100)
///
/// # Errors
/// * `Error::InvalidParameters` - Percentages out of valid range
pub fn initialize_governance(
    env: &Env,
    quorum_percent: Option<u32>,
    approval_percent: Option<u32>,
) -> Result<(), Error> {
    let quorum = quorum_percent.unwrap_or(DEFAULT_QUORUM_PERCENT);
    let approval = approval_percent.unwrap_or(DEFAULT_APPROVAL_PERCENT);

    validate_percentages(quorum, approval)?;

    let config = GovernanceConfig {
        quorum_percent: quorum,
        approval_percent: approval,
        voting_period: 86400, // Default 24 hours
    };

    storage::set_governance_config(env, &config);
    events::emit_governance_configured(env, quorum, approval);

    Ok(())
}

/// Update governance configuration
///
/// Updates quorum and/or approval thresholds.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize)
/// * `quorum_percent` - Optional new quorum percentage
/// * `approval_percent` - Optional new approval percentage
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::InvalidParameters` - Percentages out of valid range or both None
pub fn update_governance_config(
    env: &Env,
    admin: &Address,
    quorum_percent: Option<u32>,
    approval_percent: Option<u32>,
) -> Result<(), Error> {
    admin.require_auth();

    let current_admin = storage::get_admin(env);
    if *admin != current_admin {
        return Err(Error::Unauthorized);
    }

    if quorum_percent.is_none() && approval_percent.is_none() {
        return Err(Error::InvalidParameters);
    }

    let mut config = storage::get_governance_config(env);

    if let Some(quorum) = quorum_percent {
        config.quorum_percent = quorum;
    }

    if let Some(approval) = approval_percent {
        config.approval_percent = approval;
    }

    validate_percentages(config.quorum_percent, config.approval_percent)?;

    storage::set_governance_config(env, &config);
    events::emit_governance_updated(env, config.quorum_percent, config.approval_percent);

    Ok(())
}

/// Get current governance configuration
///
/// # Arguments
/// * `env` - The contract environment
///
/// # Returns
/// Returns the current GovernanceConfig
pub fn get_governance_config(env: &Env) -> GovernanceConfig {
    storage::get_governance_config(env)
}

/// Check if quorum is met
///
/// # Arguments
/// * `total_votes` - Total number of votes cast
/// * `total_eligible` - Total number of eligible voters
/// * `quorum_percent` - Required quorum percentage
///
/// # Returns
/// Returns true if quorum is met
pub fn is_quorum_met(total_votes: u32, total_eligible: u32, quorum_percent: u32) -> bool {
    if total_eligible == 0 {
        return false;
    }

    let votes_required = (total_eligible as u64 * quorum_percent as u64) / 100;
    total_votes as u64 >= votes_required
}

/// Check if approval threshold is met
///
/// # Arguments
/// * `yes_votes` - Number of yes votes
/// * `total_votes` - Total number of votes cast
/// * `approval_percent` - Required approval percentage
///
/// # Returns
/// Returns true if approval threshold is met
pub fn is_approval_met(yes_votes: u32, total_votes: u32, approval_percent: u32) -> bool {
    if total_votes == 0 {
        return false;
    }

    let yes_required = (total_votes as u64 * approval_percent as u64) / 100;
    yes_votes as u64 >= yes_required
}

/// Validate percentage values
///
/// # Arguments
/// * `quorum_percent` - Quorum percentage to validate
/// * `approval_percent` - Approval percentage to validate
///
/// # Errors
/// * `Error::InvalidParameters` - Percentages exceed 100
fn validate_percentages(quorum_percent: u32, approval_percent: u32) -> Result<(), Error> {
    if quorum_percent > 100 || approval_percent > 100 {
        return Err(Error::InvalidParameters);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, Address, soroban_sdk::Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, crate::TokenFactory);

        let admin = Address::generate(&env);
        env.as_contract(&contract_id, || {
            storage::set_admin(&env, &admin);
        });

        (env, admin, contract_id)
    }

    #[test]
    fn test_initialize_governance_defaults() {
        let (env, _, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, None, None).unwrap();
        });

        let config = env.as_contract(&contract_id, || get_governance_config(&env));
        assert_eq!(config.quorum_percent, 30);
        assert_eq!(config.approval_percent, 51);
    }

    #[test]
    fn test_initialize_governance_custom() {
        let (env, _, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, Some(40), Some(60)).unwrap();
        });

        let config = env.as_contract(&contract_id, || get_governance_config(&env));
        assert_eq!(config.quorum_percent, 40);
        assert_eq!(config.approval_percent, 60);
    }

    #[test]
    fn test_initialize_governance_zero_percent() {
        let (env, _, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, Some(0), Some(0)).unwrap();
        });

        let config = env.as_contract(&contract_id, || get_governance_config(&env));
        assert_eq!(config.quorum_percent, 0);
        assert_eq!(config.approval_percent, 0);
    }

    #[test]
    fn test_initialize_governance_hundred_percent() {
        let (env, _, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, Some(100), Some(100)).unwrap();
        });

        let config = env.as_contract(&contract_id, || get_governance_config(&env));
        assert_eq!(config.quorum_percent, 100);
        assert_eq!(config.approval_percent, 100);
    }

    #[test]
    fn test_initialize_governance_invalid_quorum() {
        let (env, _, contract_id) = setup();

        let result = env.as_contract(&contract_id, || initialize_governance(&env, Some(101), Some(50)));
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_initialize_governance_invalid_approval() {
        let (env, _, contract_id) = setup();

        let result = env.as_contract(&contract_id, || initialize_governance(&env, Some(50), Some(101)));
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_update_governance_config() {
        let (env, admin, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, Some(30), Some(51)).unwrap();
        });

        env.as_contract(&contract_id, || {
            update_governance_config(&env, &admin, Some(50), Some(75)).unwrap();
        });

        let config = env.as_contract(&contract_id, || get_governance_config(&env));
        assert_eq!(config.quorum_percent, 50);
        assert_eq!(config.approval_percent, 75);
    }

    #[test]
    fn test_update_governance_partial() {
        let (env, admin, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, Some(30), Some(51)).unwrap();
        });

        env.as_contract(&contract_id, || {
            update_governance_config(&env, &admin, Some(40), None).unwrap();
        });

        let config = env.as_contract(&contract_id, || get_governance_config(&env));
        assert_eq!(config.quorum_percent, 40);
        assert_eq!(config.approval_percent, 51);
    }

    #[test]
    fn test_update_governance_unauthorized() {
        let (env, _admin, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, Some(30), Some(51)).unwrap();
        });

        let non_admin = Address::generate(&env);
        let result = env.as_contract(&contract_id, || {
            update_governance_config(&env, &non_admin, Some(50), None)
        });
        assert_eq!(result, Err(Error::Unauthorized));
    }

    #[test]
    fn test_update_governance_both_none() {
        let (env, admin, contract_id) = setup();

        env.as_contract(&contract_id, || {
            initialize_governance(&env, Some(30), Some(51)).unwrap();
        });

        let result = env.as_contract(&contract_id, || {
            update_governance_config(&env, &admin, None, None)
        });
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_is_quorum_met_exact() {
        assert!(is_quorum_met(30, 100, 30));
    }

    #[test]
    fn test_is_quorum_met_above() {
        assert!(is_quorum_met(31, 100, 30));
    }

    #[test]
    fn test_is_quorum_met_below() {
        assert!(!is_quorum_met(29, 100, 30));
    }

    #[test]
    fn test_is_quorum_met_zero_eligible() {
        assert!(!is_quorum_met(10, 0, 30));
    }

    #[test]
    fn test_is_quorum_met_zero_percent() {
        assert!(is_quorum_met(0, 100, 0));
    }

    #[test]
    fn test_is_quorum_met_hundred_percent() {
        assert!(is_quorum_met(100, 100, 100));
        assert!(!is_quorum_met(99, 100, 100));
    }

    #[test]
    fn test_is_quorum_met_fifty_percent() {
        assert!(is_quorum_met(50, 100, 50));
        assert!(is_quorum_met(51, 100, 50));
        assert!(!is_quorum_met(49, 100, 50));
    }

    #[test]
    fn test_is_approval_met_exact() {
        assert!(is_approval_met(51, 100, 51));
    }

    #[test]
    fn test_is_approval_met_above() {
        assert!(is_approval_met(52, 100, 51));
    }

    #[test]
    fn test_is_approval_met_below() {
        assert!(!is_approval_met(50, 100, 51));
    }

    #[test]
    fn test_is_approval_met_zero_votes() {
        assert!(!is_approval_met(10, 0, 51));
    }

    #[test]
    fn test_is_approval_met_zero_percent() {
        assert!(is_approval_met(0, 100, 0));
    }

    #[test]
    fn test_is_approval_met_hundred_percent() {
        assert!(is_approval_met(100, 100, 100));
        assert!(!is_approval_met(99, 100, 100));
    }

    #[test]
    fn test_is_approval_met_fifty_percent() {
        assert!(is_approval_met(50, 100, 50));
        assert!(is_approval_met(51, 100, 50));
        assert!(!is_approval_met(49, 100, 50));
    }

    #[test]
    fn test_rounding_behavior() {
        // 33% of 100 = 33 votes required
        assert!(is_quorum_met(33, 100, 33));
        assert!(!is_quorum_met(32, 100, 33));

        // 33% of 99 = 32.67 -> 32 votes required (floor)
        assert!(is_quorum_met(32, 99, 33));
        assert!(!is_quorum_met(31, 99, 33));
    }
}
