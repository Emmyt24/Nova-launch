#![cfg(test)]

//! Unit tests for state validation module
//!
//! This test suite verifies that all validation functions correctly enforce
//! the four critical state invariants:
//! 1. Admin address is set and valid
//! 2. Treasury address is set and valid
//! 3. Fees are non-negative
//! 4. Token count matches stored tokens

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{storage, types::Error, validation, TokenFactory};

/// Helper function to create a test environment with initialized contract
fn setup_initialized() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    // Set state directly without using client
    storage::set_admin(&env, &admin);
    storage::set_treasury(&env, &treasury);
    storage::set_base_fee(&env, 100_i128);
    storage::set_metadata_fee(&env, 50_i128);

    let contract_id = Address::generate(&env);
    (env, contract_id, admin, treasury)
}

/// Helper function to create an uninitialized test environment
fn setup_uninitialized() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);

    (env, contract_id)
}

// ═══════════════════════════════════════════════════════════════════════════
// Valid State Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_valid_state_passes_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Valid state should pass all validations
    let result = validation::validate_state(&env);
    assert!(result.is_ok(), "Valid state should pass validation");
}

#[test]
fn test_valid_state_with_zero_fees() {
    let (env, _contract_id) = setup_uninitialized();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    // Initialize with zero fees (valid edge case)
    storage::set_admin(&env, &admin);
    storage::set_treasury(&env, &treasury);
    storage::set_base_fee(&env, 0_i128);
    storage::set_metadata_fee(&env, 0_i128);

    // Zero fees are valid
    let result = validation::validate_state(&env);
    assert!(result.is_ok(), "Zero fees should be valid");
}

#[test]
fn test_valid_state_with_empty_token_storage() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Empty token storage (count = 0) is valid
    let result = validation::validate_token_count(&env);
    assert!(result.is_ok(), "Empty token storage should be valid");
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin Validation Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_missing_admin_fails_validation() {
    let (env, _contract_id) = setup_uninitialized();

    // Admin not set - should fail
    let result = validation::validate_admin(&env);
    assert!(result.is_err(), "Missing admin should fail validation");
    assert_eq!(
        result.unwrap_err(),
        Error::MissingAdmin,
        "Should return MissingAdmin error"
    );
}

#[test]
fn test_missing_admin_fails_state_validation() {
    let (env, _contract_id) = setup_uninitialized();

    // Comprehensive validation should fail on missing admin
    let result = validation::validate_state(&env);
    assert!(result.is_err(), "Missing admin should fail state validation");
    assert_eq!(
        result.unwrap_err(),
        Error::MissingAdmin,
        "Should return MissingAdmin error"
    );
}

#[test]
fn test_valid_admin_passes_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Valid admin should pass
    let result = validation::validate_admin(&env);
    assert!(result.is_ok(), "Valid admin should pass validation");
}

// ═══════════════════════════════════════════════════════════════════════════
// Treasury Validation Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_missing_treasury_fails_validation() {
    let (env, _contract_id) = setup_uninitialized();

    // Treasury not set - should fail
    let result = validation::validate_treasury(&env);
    assert!(result.is_err(), "Missing treasury should fail validation");
    assert_eq!(
        result.unwrap_err(),
        Error::MissingTreasury,
        "Should return MissingTreasury error"
    );
}

#[test]
fn test_valid_treasury_passes_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Valid treasury should pass
    let result = validation::validate_treasury(&env);
    assert!(result.is_ok(), "Valid treasury should pass validation");
}

// ═══════════════════════════════════════════════════════════════════════════
// Fee Validation Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_negative_base_fee_fails_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Set negative base fee
    storage::set_base_fee(&env, -100_i128);

    let result = validation::validate_fees(&env);
    assert!(result.is_err(), "Negative base fee should fail validation");
    assert_eq!(
        result.unwrap_err(),
        Error::InvalidBaseFee,
        "Should return InvalidBaseFee error"
    );
}

#[test]
fn test_negative_metadata_fee_fails_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Set negative metadata fee
    storage::set_metadata_fee(&env, -50_i128);

    let result = validation::validate_fees(&env);
    assert!(result.is_err(), "Negative metadata fee should fail validation");
    assert_eq!(
        result.unwrap_err(),
        Error::InvalidMetadataFee,
        "Should return InvalidMetadataFee error"
    );
}

#[test]
fn test_both_negative_fees_returns_first_error() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Set both fees negative
    storage::set_base_fee(&env, -100_i128);
    storage::set_metadata_fee(&env, -50_i128);

    let result = validation::validate_fees(&env);
    assert!(result.is_err(), "Both negative fees should fail validation");
    // Should return base fee error first (fail-fast ordering)
    assert_eq!(
        result.unwrap_err(),
        Error::InvalidBaseFee,
        "Should return InvalidBaseFee error first"
    );
}

#[test]
fn test_valid_fees_pass_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Valid fees should pass
    let result = validation::validate_fees(&env);
    assert!(result.is_ok(), "Valid fees should pass validation");
}

// ═══════════════════════════════════════════════════════════════════════════
// Token Count Validation Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_consistent_token_count_passes_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Empty token storage is consistent
    let result = validation::validate_token_count(&env);
    assert!(result.is_ok(), "Consistent token count should pass validation");
}

#[test]
fn test_inconsistent_token_count_fails_validation() {
    let (env, _contract_id, _admin, _treasury) = setup_initialized();

    // Manually set token count without creating tokens
    env.storage().instance().set(&crate::types::DataKey::TokenCount, &5u32);

    let result = validation::validate_token_count(&env);
    assert!(result.is_err(), "Inconsistent token count should fail validation");
    assert_eq!(
        result.unwrap_err(),
        Error::InconsistentTokenCount,
        "Should return InconsistentTokenCount error"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Ordering Tests
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_validation_order_admin_first() {
    let (env, _contract_id) = setup_uninitialized();

    // Set treasury and fees but not admin
    let treasury = Address::generate(&env);
    storage::set_treasury(&env, &treasury);
    storage::set_base_fee(&env, 100_i128);
    storage::set_metadata_fee(&env, 50_i128);

    // Should fail on admin check first
    let result = validation::validate_state(&env);
    assert_eq!(
        result.unwrap_err(),
        Error::MissingAdmin,
        "Should check admin first"
    );
}

#[test]
fn test_validation_order_treasury_second() {
    let (env, _contract_id) = setup_uninitialized();

    // Set admin and fees but not treasury
    let admin = Address::generate(&env);
    storage::set_admin(&env, &admin);
    storage::set_base_fee(&env, 100_i128);
    storage::set_metadata_fee(&env, 50_i128);

    // Should fail on treasury check second
    let result = validation::validate_state(&env);
    assert_eq!(
        result.unwrap_err(),
        Error::MissingTreasury,
        "Should check treasury second"
    );
}

#[test]
fn test_validation_order_fees_third() {
    let (env, _contract_id) = setup_uninitialized();

    // Set admin and treasury but negative fees
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    storage::set_admin(&env, &admin);
    storage::set_treasury(&env, &treasury);
    storage::set_base_fee(&env, -100_i128);
    storage::set_metadata_fee(&env, 50_i128);

    // Should fail on fee check third
    let result = validation::validate_state(&env);
    assert_eq!(
        result.unwrap_err(),
        Error::InvalidBaseFee,
        "Should check fees third"
    );
}

#[test]
fn test_validation_order_token_count_last() {
    let (env, _contract_id) = setup_uninitialized();

    // Set everything valid but inconsistent token count
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    storage::set_admin(&env, &admin);
    storage::set_treasury(&env, &treasury);
    storage::set_base_fee(&env, 100_i128);
    storage::set_metadata_fee(&env, 50_i128);
    env.storage().instance().set(&crate::types::DataKey::TokenCount, &5u32);

    // Should fail on token count check last
    let result = validation::validate_state(&env);
    assert_eq!(
        result.unwrap_err(),
        Error::InconsistentTokenCount,
        "Should check token count last"
    );
}
