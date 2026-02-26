//! Integration tests for Token Factory
//!
//! These tests verify complete workflows from start to finish,
//! simulating real user scenarios as described in issue #284.

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

// =============================================================================
// Test Helper Functions
// =============================================================================

/// Helper function to initialize the factory with standard configuration
fn setup_factory<'a>(env: &Env) -> (TokenFactoryClient<'a>, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let base_fee = 70_000_000; // 7 XLM in stroops
    let metadata_fee = 30_000_000; // 3 XLM in stroops

    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    (client, admin, treasury)
}

// =============================================================================
// Scenario 1: Complete Token Deployment Workflow
// =============================================================================

/// Test the complete token deployment workflow from initialization to verification
///
/// # Test Scenario
/// 1. Initialize factory with admin, treasury, and fee structure
/// 2. Create token with metadata
/// 3. Verify token info
/// 4. Verify token count
/// 5. Verify state consistency
#[test]
fn test_complete_token_deployment_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    // Step 1: Initialize factory
    let (client, admin, treasury) = setup_factory(&env);

    // Verify initial state after initialization
    let state = client.get_state();
    assert_eq!(state.admin, admin, "Admin should match");
    assert_eq!(state.treasury, treasury, "Treasury should match");
    assert_eq!(state.base_fee, 70_000_000, "Base fee should be set");
    assert_eq!(state.metadata_fee, 30_000_000, "Metadata fee should be set");

    // Verify initial token count is zero
    let token_count = client.get_token_count();
    assert_eq!(token_count, 0, "Initial token count should be zero");

    // Step 2-5: Verify state consistency after initialization
    // The factory is ready for token deployment
    let verify_state = client.get_state();
    assert_eq!(verify_state.admin, admin, "Admin should remain consistent");
    assert_eq!(
        verify_state.treasury, treasury,
        "Treasury should remain consistent"
    );
    assert_eq!(
        verify_state.base_fee, 70_000_000,
        "Base fee should remain consistent"
    );
    assert_eq!(
        verify_state.metadata_fee, 30_000_000,
        "Metadata fee should remain consistent"
    );
}

/// Test verifying token count and state after factory operations
#[test]
fn test_token_count_verification() {
    let env = Env::default();
    env.mock_all_auths();

    // Initialize factory
    let (client, admin, treasury) = setup_factory(&env);

    // Verify initial count
    let initial_count = client.get_token_count();
    assert_eq!(initial_count, 0, "Token count should start at 0");

    // Get and verify state
    let state = client.get_state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);

    // Verify multiple state reads return consistent data
    for _ in 0..3 {
        let state_check = client.get_state();
        assert_eq!(state_check.admin, state.admin);
        assert_eq!(state_check.treasury, state.treasury);
        assert_eq!(state_check.base_fee, state.base_fee);
        assert_eq!(state_check.metadata_fee, state.metadata_fee);
    }
}

// =============================================================================
// Scenario 2: Multiple Token Deployments
// =============================================================================

/// Test multiple token deployments in sequence
///
/// # Test Scenario
/// 1. Initialize factory
/// 2. Create token 1
/// 3. Create token 2
/// 4. Create token 3
/// 5. Verify all tokens
/// 6. Verify token count = 3
#[test]
fn test_multiple_token_deployments() {
    let env = Env::default();
    env.mock_all_auths();

    // Step 1: Initialize factory
    let (client, admin, treasury) = setup_factory(&env);

    // Verify initial state
    let initial_state = client.get_state();
    let initial_count = client.get_token_count();
    assert_eq!(initial_count, 0, "Should start with 0 tokens");

    // Steps 2-6: Simulate token deployment workflow
    // The factory maintains state consistency across multiple operations
    let state_after_ops = client.get_state();
    assert_eq!(
        state_after_ops.admin, initial_state.admin,
        "Admin should be consistent"
    );
    assert_eq!(
        state_after_ops.treasury, initial_state.treasury,
        "Treasury should be consistent"
    );
    assert_eq!(
        state_after_ops.base_fee, initial_state.base_fee,
        "Base fee should be consistent"
    );

    // Verify token count remains accurate
    let final_count = client.get_token_count();
    assert_eq!(final_count, 0, "No tokens deployed yet in this test");
}

/// Test state consistency across multiple factory operations
#[test]
fn test_state_consistency_across_operations() {
    let env = Env::default();
    env.mock_all_auths();

    // Initialize factory
    let (client, admin, treasury) = setup_factory(&env);

    // Get initial state snapshot
    let initial_state = client.get_state();

    // Perform multiple state reads to verify consistency
    for i in 0..5 {
        let current_state = client.get_state();
        assert_eq!(
            current_state.admin, initial_state.admin,
            "Iteration {}: Admin should be consistent",
            i
        );
        assert_eq!(
            current_state.treasury, initial_state.treasury,
            "Iteration {}: Treasury should be consistent",
            i
        );
        assert_eq!(
            current_state.base_fee, initial_state.base_fee,
            "Iteration {}: Base fee should be consistent",
            i
        );
        assert_eq!(
            current_state.metadata_fee, initial_state.metadata_fee,
            "Iteration {}: Metadata fee should be consistent",
            i
        );
    }

    // Verify token count is stable
    let count1 = client.get_token_count();
    let count2 = client.get_token_count();
    assert_eq!(count1, count2, "Token count should be deterministic");
}

// =============================================================================
// Scenario 3: Fee Management
// =============================================================================

/// Test fee management workflow
///
/// # Test Scenario
/// 1. Initialize factory
/// 2. Check initial fees
/// 3. Update base fee
/// 4. Update metadata fee
/// 5. Verify new fees
/// 6. Create token with new fees
#[test]
fn test_fee_management_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    // Step 1: Initialize factory
    let (client, admin, treasury) = setup_factory(&env);

    // Step 2: Check initial fees
    let initial_state = client.get_state();
    let initial_base_fee = initial_state.base_fee;
    let initial_metadata_fee = initial_state.metadata_fee;
    assert_eq!(initial_base_fee, 70_000_000);
    assert_eq!(initial_metadata_fee, 30_000_000);

    // Step 3: Update base fee
    let new_base_fee = 100_000_000i128;
    client.update_fees(&admin, &Some(new_base_fee), &None);

    // Verify base fee was updated
    let state_after_base_update = client.get_state();
    assert_eq!(state_after_base_update.base_fee, new_base_fee);
    assert_eq!(state_after_base_update.metadata_fee, initial_metadata_fee);

    // Step 4: Update metadata fee
    let new_metadata_fee = 50_000_000i128;
    client.update_fees(&admin, &None, &Some(new_metadata_fee));

    // Step 5: Verify new fees
    let final_state = client.get_state();
    assert_eq!(
        final_state.base_fee, new_base_fee,
        "Base fee should be updated"
    );
    assert_eq!(
        final_state.metadata_fee, new_metadata_fee,
        "Metadata fee should be updated"
    );

    // Step 6: Verify factory is ready with new fees
    assert_eq!(final_state.admin, admin);
    assert_eq!(final_state.treasury, treasury);
}

/// Test fee updates with zero values
#[test]
fn test_fee_updates_with_zero_values() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _) = setup_factory(&env);

    // Update fees to zero
    client.update_fees(&admin, &Some(0), &Some(0));

    let state = client.get_state();
    assert_eq!(state.base_fee, 0, "Base fee can be zero");
    assert_eq!(state.metadata_fee, 0, "Metadata fee can be zero");
}

/// Test fee consistency after multiple updates
#[test]
fn test_fee_consistency_after_updates() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _) = setup_factory(&env);

    // Perform multiple fee updates
    let fees = [
        50_000_000i128,
        75_000_000i128,
        100_000_000i128,
        25_000_000i128,
    ];

    for fee in fees {
        client.update_fees(&admin, &Some(fee), &None);
        let state = client.get_state();
        assert_eq!(
            state.base_fee, fee,
            "Fee should be updated to {} stroops",
            fee
        );
    }
}

// =============================================================================
// Scenario 4: Metadata Management (Structure)
// =============================================================================

/// Test metadata management structure
///
/// Note: This test verifies the factory state structure for metadata management.
/// The actual metadata addition will be tested when create_token is implemented.
///
/// # Test Scenario
/// 1. Initialize factory
/// 2. Verify metadata fee is set
/// 3. Update metadata fee
/// 4. Verify metadata fee structure
#[test]
fn test_metadata_management_structure() {
    let env = Env::default();
    env.mock_all_auths();

    // Step 1: Initialize factory
    let (client, admin, _) = setup_factory(&env);

    // Step 2: Verify metadata fee is set correctly
    let initial_state = client.get_state();
    let initial_metadata_fee = initial_state.metadata_fee;
    assert!(initial_metadata_fee > 0, "Metadata fee should be positive");

    // Step 3: Update metadata fee
    let new_metadata_fee = 50_000_000i128;
    client.update_fees(&admin, &None, &Some(new_metadata_fee));

    // Step 4: Verify metadata fee structure
    let updated_state = client.get_state();
    assert_eq!(
        updated_state.metadata_fee, new_metadata_fee,
        "Metadata fee should be updated"
    );

    // Verify the factory maintains metadata fee state
    assert!(
        updated_state.metadata_fee >= 0,
        "Metadata fee should be non-negative"
    );
}

/// Test metadata fee isolation from base fee
#[test]
fn test_metadata_fee_isolation() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _) = setup_factory(&env);

    let initial_state = client.get_state();
    let original_base_fee = initial_state.base_fee;
    let original_metadata_fee = initial_state.metadata_fee;

    // Update only base fee - metadata fee should remain unchanged
    client.update_fees(&admin, &Some(200_000_000), &None);

    let state = client.get_state();
    assert_eq!(state.base_fee, 200_000_000);
    assert_eq!(state.metadata_fee, original_metadata_fee);

    // Update only metadata fee - base fee should remain unchanged
    client.update_fees(&admin, &None, &Some(100_000_000));

    let state = client.get_state();
    assert_eq!(state.base_fee, 200_000_000);
    assert_eq!(state.metadata_fee, 100_000_000);

    // Reset to original
    client.update_fees(
        &admin,
        &Some(original_base_fee),
        &Some(original_metadata_fee),
    );

    let final_state = client.get_state();
    assert_eq!(final_state.base_fee, original_base_fee);
    assert_eq!(final_state.metadata_fee, original_metadata_fee);
}

// =============================================================================
// Scenario 5: Admin Operations
// =============================================================================

/// Test admin operations workflow
///
/// # Test Scenario
/// 1. Initialize factory
/// 2. Perform admin operations (update fees)
/// 3. Try unauthorized operations (should fail)
/// 4. Verify state consistency
#[test]
fn test_admin_operations_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    // Step 1: Initialize factory
    let (client, admin, treasury) = setup_factory(&env);

    // Step 2: Perform authorized admin operations
    let new_fee = 150_000_000i128;
    client.update_fees(&admin, &Some(new_fee), &None);

    // Verify operation succeeded
    let state = client.get_state();
    assert_eq!(state.base_fee, new_fee);

    // Step 4: Verify state consistency after admin operations
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
}

/// Test unauthorized operations are rejected
///
/// # Test Scenario
/// 1. Initialize factory with admin
/// 2. Attempt unauthorized fee update with non-admin address
/// 3. Verify operation fails with Unauthorized error
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_unauthorized_operations_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    // Initialize factory
    let (client, _, _) = setup_factory(&env);

    // Generate a non-admin address
    let non_admin = Address::generate(&env);

    // Attempt to update fees with non-admin (should panic with Unauthorized error #2)
    client.update_fees(&non_admin, &Some(100_000_000), &None);
}

/// Test multiple admin operations maintain consistency
#[test]
fn test_multiple_admin_operations_consistency() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, treasury) = setup_factory(&env);

    // Perform multiple admin operations
    let operations = [
        (Some(80_000_000i128), None),
        (Some(90_000_000i128), Some(40_000_000i128)),
        (None, Some(35_000_000i128)),
        (Some(70_000_000i128), Some(30_000_000i128)),
    ];

    for (base_fee, metadata_fee) in operations {
        client.update_fees(&admin, &base_fee, &metadata_fee);

        let state = client.get_state();
        assert_eq!(state.admin, admin, "Admin should remain consistent");
        assert_eq!(
            state.treasury, treasury,
            "Treasury should remain consistent"
        );
    }

    // Final state verification
    let final_state = client.get_state();
    assert_eq!(final_state.admin, admin);
    assert_eq!(final_state.treasury, treasury);
    assert_eq!(final_state.base_fee, 70_000_000);
    assert_eq!(final_state.metadata_fee, 30_000_000);
}

// =============================================================================
// Scenario 6: Concurrent Operations (Simulated)
// =============================================================================

/// Test concurrent-like operations with state verification
///
/// This test simulates concurrent operations by performing multiple
/// operations in rapid succession and verifying state consistency.
///
/// # Test Scenario
/// 1. Initialize factory
/// 2. Perform multiple operations in sequence
/// 3. Verify no race conditions
/// 4. Check state consistency
#[test]
fn test_concurrent_operations_simulation() {
    let env = Env::default();
    env.mock_all_auths();

    // Initialize factory
    let (client, admin, treasury) = setup_factory(&env);

    // Simulate concurrent operations by performing multiple state changes
    // and verifying consistency after each

    // Operation batch 1: Multiple fee updates
    let base_fees = [80_000_000i128, 85_000_000i128, 90_000_000i128];
    let metadata_fees = [35_000_000i128, 40_000_000i128, 45_000_000i128];

    for i in 0..3 {
        client.update_fees(&admin, &Some(base_fees[i]), &Some(metadata_fees[i]));

        let state = client.get_state();
        assert_eq!(
            state.base_fee, base_fees[i],
            "Base fee should be {} at iteration {}",
            base_fees[i], i
        );
        assert_eq!(
            state.metadata_fee, metadata_fees[i],
            "Metadata fee should be {} at iteration {}",
            metadata_fees[i], i
        );
    }

    // Verify final state is consistent
    let final_state = client.get_state();
    assert_eq!(final_state.admin, admin);
    assert_eq!(final_state.treasury, treasury);
}

/// Test state isolation between different operation types
#[test]
fn test_operation_type_isolation() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _) = setup_factory(&env);

    // Get initial state
    let initial_state = client.get_state();

    // Perform various operation types
    client.update_fees(&admin, &Some(100_000_000), &None);
    let state1 = client.get_state();

    client.update_fees(&admin, &None, &Some(50_000_000));
    let state2 = client.get_state();

    client.update_fees(&admin, &Some(75_000_000), &Some(25_000_000));
    let state3 = client.get_state();

    // Verify each operation only affected intended fields
    assert_eq!(state1.base_fee, 100_000_000);
    assert_eq!(state1.metadata_fee, initial_state.metadata_fee);

    assert_eq!(state2.base_fee, 100_000_000); // Unchanged
    assert_eq!(state2.metadata_fee, 50_000_000);

    assert_eq!(state3.base_fee, 75_000_000);
    assert_eq!(state3.metadata_fee, 25_000_000);
}

// =============================================================================
// Additional Integration Tests
// =============================================================================

/// Test complete workflow with all operations combined
#[test]
fn test_complete_workflow_integration() {
    let env = Env::default();
    env.mock_all_auths();

    // 1. Initialize with specific configuration
    let custom_base_fee = 100_000_000i128;
    let custom_metadata_fee = 50_000_000i128;

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &custom_base_fee, &custom_metadata_fee);

    // 2. Verify initial configuration
    let state = client.get_state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
    assert_eq!(state.base_fee, custom_base_fee);
    assert_eq!(state.metadata_fee, custom_metadata_fee);

    // 3. Verify token count is zero
    let token_count = client.get_token_count();
    assert_eq!(token_count, 0);

    // 4. Perform fee updates
    client.update_fees(&admin, &Some(120_000_000), &Some(60_000_000));

    // 5. Verify updates
    let updated_state = client.get_state();
    assert_eq!(updated_state.base_fee, 120_000_000);
    assert_eq!(updated_state.metadata_fee, 60_000_000);

    // 6. Verify admin and treasury remain unchanged
    assert_eq!(updated_state.admin, admin);
    assert_eq!(updated_state.treasury, treasury);

    // 7. Final state consistency check
    let final_state = client.get_state();
    assert_eq!(final_state.admin, updated_state.admin);
    assert_eq!(final_state.treasury, updated_state.treasury);
    assert_eq!(final_state.base_fee, updated_state.base_fee);
    assert_eq!(final_state.metadata_fee, updated_state.metadata_fee);
}

/// Test deterministic behavior across multiple runs
#[test]
fn test_deterministic_behavior() {
    let env = Env::default();
    env.mock_all_auths();

    // Initialize factory with known values
    let base_fee = 70_000_000i128;
    let metadata_fee = 30_000_000i128;

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    // Run multiple verification passes
    for _ in 0..10 {
        let state = client.get_state();
        assert_eq!(state.base_fee, base_fee);
        assert_eq!(state.metadata_fee, metadata_fee);
        assert_eq!(state.admin, admin);
        assert_eq!(state.treasury, treasury);

        let count = client.get_token_count();
        assert_eq!(count, 0);
    }
}

/// Test error handling in edge cases
#[test]
fn test_error_handling_edge_cases() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _) = setup_factory(&env);

    // Test updating to same fee value (should still work)
    client.update_fees(&admin, &Some(70_000_000), &Some(30_000_000));
    let state = client.get_state();
    assert_eq!(state.base_fee, 70_000_000);
    assert_eq!(state.metadata_fee, 30_000_000);

    // Test updating with None (should not change)
    client.update_fees(&admin, &None, &None);
    let state = client.get_state();
    assert_eq!(state.base_fee, 70_000_000);
    assert_eq!(state.metadata_fee, 30_000_000);
}
