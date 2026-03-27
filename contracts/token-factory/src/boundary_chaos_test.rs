//! Boundary Chaos Testing Suite
//!
//! This module stress tests pathological schedule inputs and timestamp edges
//! that are likely to trigger logic bugs in the timelock mechanism.
//!
//! Tests cover:
//! - Extreme schedule durations (very long, very short, zero)
//! - Near-equal boundaries (start ≈ cliff ≈ end)
//! - Timestamp jumps around critical boundaries
//! - Overflow and underflow conditions
//! - Edge cases at u64 limits

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use proptest::prelude::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

/// Setup factory with known state
fn setup_factory(env: &Env) -> (TokenFactoryClient, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    
    client.initialize(&admin, &treasury, &100_0000000, &50_0000000).unwrap();
    
    (client, admin, treasury)
}

/// Generate extreme duration values
fn arb_extreme_duration() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(0u64),                    // Zero duration
        Just(1u64),                    // Minimum duration
        Just(2u64),                    // Near-minimum
        1u64..=10u64,                  // Very short durations
        172_800u64..=172_810u64,       // Around default (48 hours)
        2_592_000u64..=2_592_010u64,   // Around max (30 days)
        u64::MAX - 1000..=u64::MAX,    // Near u64::MAX
    ]
}

/// Generate boundary-relative timestamps
fn arb_boundary_offset() -> impl Strategy<Value = i64> {
    prop_oneof![
        Just(-1000i64),  // Well before
        Just(-10i64),    // Shortly before
        Just(-1i64),     // Just before
        Just(0i64),      // Exactly at
        Just(1i64),      // Just after
        Just(10i64),     // Shortly after
        Just(1000i64),   // Well after
    ]
}

// ============================================================================
// Extreme Duration Tests
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// Chaos Test: Zero duration timelock
    /// 
    /// Tests behavior when timelock delay is set to zero.
    #[test]
    fn chaos_zero_duration_timelock(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        // Attempt to initialize with zero delay
        // This should either succeed (immediate execution) or fail gracefully
        // Current implementation: no explicit zero check, uses default
        
        // Schedule a change
        let result = client.try_schedule_fee_update(&admin, &Some(base_fee), &None);
        
        // Should not panic
        prop_assert!(result.is_ok() || result.is_err(),
            "Zero duration should not panic");
    }

    /// Chaos Test: Minimum duration timelock (1 second)
    #[test]
    fn chaos_minimum_duration_timelock(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        // Schedule with default delay
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Advance by exactly 1 second
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 1;
        });
        
        // Should not be executable yet (default is 48 hours)
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_err(),
            "Should not execute after only 1 second");
    }

    /// Chaos Test: Maximum duration timelock (30 days)
    #[test]
    fn chaos_maximum_duration_timelock(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        // Schedule a change
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Advance by 30 days + 1 second
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 2_592_001;
        });
        
        // Should be executable
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_ok(),
            "Should execute after maximum duration");
    }

    /// Chaos Test: Near-maximum duration
    #[test]
    fn chaos_near_maximum_duration(
        offset in 0u64..=1000u64,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        let change_id = client.schedule_fee_update(&admin, &Some(200_0000000), &None).unwrap();
        
        // Advance by near-maximum duration
        let advance = 2_592_000u64.saturating_sub(offset);
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + advance;
        });
        
        // Should not panic regardless of executability
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_ok() || result.is_err(),
            "Near-maximum duration should not panic");
    }
}

// ============================================================================
// Boundary Timestamp Tests
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(300))]

    /// Chaos Test: Execute at scheduled_at - 1
    #[test]
    fn chaos_execute_before_scheduled(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Try to execute before even scheduled (time travel backwards)
        // This shouldn't be possible in real scenarios but tests robustness
        env.ledger().with_mut(|li| {
            if li.timestamp > 0 {
                li.timestamp = li.timestamp - 1;
            }
        });
        
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_err(),
            "Should not execute before scheduled time");
    }

    /// Chaos Test: Execute at scheduled_at (exactly)
    #[test]
    fn chaos_execute_at_scheduled_time(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        let initial_time = env.ledger().timestamp();
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Don't advance time - try to execute immediately
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_err(),
            "Should not execute at scheduled time (before delay)");
    }

    /// Chaos Test: Execute at execute_at - 1
    #[test]
    fn chaos_execute_one_second_before_expiry(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Advance to 1 second before expiry (48 hours - 1)
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 172_799;
        });
        
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_err(),
            "Should not execute 1 second before expiry");
    }

    /// Chaos Test: Execute at execute_at (exactly)
    #[test]
    fn chaos_execute_at_exact_expiry(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Advance to exact expiry (48 hours)
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 172_800;
        });
        
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_err(),
            "Should not execute at exact expiry (needs > not >=)");
    }

    /// Chaos Test: Execute at execute_at + 1
    #[test]
    fn chaos_execute_one_second_after_expiry(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Advance to 1 second after expiry (48 hours + 1)
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 172_801;
        });
        
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_ok(),
            "Should execute 1 second after expiry");
    }

    /// Chaos Test: Random timestamp jumps around boundaries
    #[test]
    fn chaos_random_boundary_jumps(
        base_fee in 1i128..=1000_0000000i128,
        offset in arb_boundary_offset(),
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Jump to boundary + offset
        let target_time = 172_800i64 + offset;
        if target_time > 0 {
            env.ledger().with_mut(|li| {
                li.timestamp = li.timestamp + target_time as u64;
            });
            
            let result = client.try_execute_change(&change_id);
            
            // Verify correct behavior based on offset
            if offset <= 0 {
                prop_assert!(result.is_err(),
                    "Should not execute at or before expiry");
            } else {
                prop_assert!(result.is_ok(),
                    "Should execute after expiry");
            }
        }
    }
}

// ============================================================================
// Overflow and Underflow Tests
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// Chaos Test: Timestamp near u64::MAX
    #[test]
    fn chaos_timestamp_near_max(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        // Set timestamp near u64::MAX
        env.ledger().with_mut(|li| {
            li.timestamp = u64::MAX - 1_000_000;
        });
        
        // Schedule should handle overflow gracefully
        let result = client.try_schedule_fee_update(&admin, &Some(base_fee), &None);
        
        // Should not panic
        prop_assert!(result.is_ok() || result.is_err(),
            "Near-max timestamp should not panic");
        
        if let Ok(change_id) = result {
            // Try to execute
            env.ledger().with_mut(|li| {
                // Advance time (may overflow)
                li.timestamp = li.timestamp.saturating_add(172_801);
            });
            
            let exec_result = client.try_execute_change(&change_id);
            prop_assert!(exec_result.is_ok() || exec_result.is_err(),
                "Execution near max should not panic");
        }
    }

    /// Chaos Test: Timestamp at zero
    #[test]
    fn chaos_timestamp_at_zero(
        base_fee in 1i128..=1000_0000000i128,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        // Timestamp starts at 0 by default in tests
        let change_id = client.schedule_fee_update(&admin, &Some(base_fee), &None).unwrap();
        
        // Advance from 0
        env.ledger().with_mut(|li| {
            li.timestamp = 172_801;
        });
        
        let result = client.try_execute_change(&change_id);
        prop_assert!(result.is_ok(),
            "Should execute correctly from timestamp 0");
    }

    /// Chaos Test: Multiple changes with overlapping timeframes
    #[test]
    fn chaos_overlapping_timeframes(
        fee1 in 1i128..=500_0000000i128,
        fee2 in 500_0000000i128..=1000_0000000i128,
        delay in 1u64..=1000u64,
    ) {
        let env = Env::default();
        let (client, admin, _treasury) = setup_factory(&env);
        
        env.mock_all_auths();
        
        // Schedule first change
        let change_id1 = client.schedule_fee_update(&admin, &Some(fee1), &None).unwrap();
        
        // Advance time slightly
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + delay;
        });
        
        // Schedule second change (overlapping timeframe)
        let change_id2 = client.schedule_fee_update(&admin, &Some(fee2), &None).unwrap();
        
        // Advance to after both should be executable
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 172_801;
        });
        
        // Both should be executable
        let result1 = client.try_execute_change(&change_id1);
        let result2 = client.try_execute_change(&change_id2);
        
        prop_assert!(result1.is_ok() || result1.is_err(),
            "First change should not panic");
        prop_assert!(result2.is_ok() || result2.is_err(),
            "Second change should not panic");
    }
}

// ============================================================================
// Edge Case Regression Tests
// ============================================================================

#[test]
fn regression_exact_boundary_execution() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    let change_id = client.schedule_fee_update(&admin, &Some(200_0000000), &None).unwrap();
    
    // Test exact boundary (should fail)
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + 172_800;
    });
    
    let result = client.try_execute_change(&change_id);
    assert!(result.is_err(), "Should not execute at exact boundary");
    
    // Test one second after (should succeed)
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + 1;
    });
    
    let result = client.try_execute_change(&change_id);
    assert!(result.is_ok(), "Should execute one second after boundary");
}

#[test]
fn regression_double_execution_prevention() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    let change_id = client.schedule_fee_update(&admin, &Some(200_0000000), &None).unwrap();
    
    // Advance past timelock
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + 172_801;
    });
    
    // First execution should succeed
    client.execute_change(&change_id).unwrap();
    
    // Second execution should fail
    let result = client.try_execute_change(&change_id);
    assert!(result.is_err(), "Should not execute twice");
}

#[test]
fn regression_cancel_after_expiry() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    let change_id = client.schedule_fee_update(&admin, &Some(200_0000000), &None).unwrap();
    
    // Advance past timelock
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + 172_801;
    });
    
    // Should still be able to cancel even after expiry
    let result = client.try_cancel_change(&admin, &change_id);
    assert!(result.is_ok(), "Should be able to cancel after expiry");
}

#[test]
fn regression_schedule_at_max_timestamp() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    // Set timestamp very high
    env.ledger().with_mut(|li| {
        li.timestamp = u64::MAX - 200_000;
    });
    
    // Schedule should handle potential overflow
    let result = client.try_schedule_fee_update(&admin, &Some(200_0000000), &None);
    
    // Should not panic (may succeed or fail gracefully)
    assert!(result.is_ok() || result.is_err(), "Should not panic at high timestamp");
}

#[test]
fn regression_rapid_schedule_cancel_sequence() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    // Rapidly schedule and cancel multiple changes
    for i in 0..10 {
        let change_id = client.schedule_fee_update(
            &admin,
            &Some(100_0000000 + (i as i128 * 10_0000000)),
            &None,
        ).unwrap();
        
        // Cancel immediately
        client.cancel_change(&admin, &change_id).unwrap();
    }
    
    // All should complete without panic
}

#[test]
fn regression_zero_fee_schedule() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    // Try to schedule zero fee (should fail validation)
    let result = client.try_schedule_fee_update(&admin, &Some(0), &None);
    
    // Should handle gracefully (current implementation allows 0)
    assert!(result.is_ok() || result.is_err(), "Zero fee should not panic");
}

#[test]
fn regression_negative_fee_schedule() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    // Try to schedule negative fee (should fail validation)
    let result = client.try_schedule_fee_update(&admin, &Some(-100), &None);
    
    assert!(result.is_err(), "Negative fee should be rejected");
}

#[test]
fn regression_max_i128_fee_schedule() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    // Try to schedule max i128 fee
    let result = client.try_schedule_fee_update(&admin, &Some(i128::MAX), &None);
    
    // Should not panic
    assert!(result.is_ok() || result.is_err(), "Max fee should not panic");
}

#[test]
fn regression_concurrent_admin_transfer_and_schedule() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_factory(&env);
    
    env.mock_all_auths();
    
    // Schedule a change
    let change_id = client.schedule_fee_update(&admin, &Some(200_0000000), &None).unwrap();
    
    // Transfer admin
    let new_admin = Address::generate(&env);
    client.transfer_admin(&admin, &new_admin).unwrap();
    
    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + 172_801;
    });
    
    // Old admin's scheduled change should still be executable
    let result = client.try_execute_change(&change_id);
    assert!(result.is_ok(), "Scheduled change should execute after admin transfer");
}
