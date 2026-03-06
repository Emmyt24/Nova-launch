#![cfg(test)]

//! Test helper utilities for deterministic time-dependent testing
//!
//! Provides ergonomic helpers for controlling ledger time in tests,
//! particularly useful for vesting streams and timelock operations.

use soroban_sdk::{testutils::Ledger, Env};

/// Set the ledger timestamp to a specific value
///
/// # Arguments
/// * `env` - The test environment
/// * `timestamp` - Unix timestamp in seconds
///
/// # Example
/// ```
/// set_time(&env, 1000);
/// assert_eq!(env.ledger().timestamp(), 1000);
/// ```
pub fn set_time(env: &Env, timestamp: u64) {
    env.ledger().with_mut(|li| li.timestamp = timestamp);
}

/// Advance the ledger timestamp by a delta
///
/// # Arguments
/// * `env` - The test environment
/// * `delta` - Seconds to advance
///
/// # Example
/// ```
/// set_time(&env, 1000);
/// advance_time(&env, 500);
/// assert_eq!(env.ledger().timestamp(), 1500);
/// ```
pub fn advance_time(env: &Env, delta: u64) {
    env.ledger().with_mut(|li| li.timestamp += delta);
}

/// Get the current ledger timestamp
///
/// # Arguments
/// * `env` - The test environment
///
/// # Returns
/// Current timestamp in seconds
pub fn current_time(env: &Env) -> u64 {
    env.ledger().timestamp()
}

/// Set time to a specific point in a vesting schedule
///
/// # Arguments
/// * `env` - The test environment
/// * `start` - Stream start time
/// * `end` - Stream end time
/// * `progress` - Progress ratio (0.0 = start, 1.0 = end)
///
/// # Example
/// ```
/// // Set time to 50% through vesting period
/// set_time_at_progress(&env, 100, 300, 0.5);
/// assert_eq!(env.ledger().timestamp(), 200);
/// ```
pub fn set_time_at_progress(env: &Env, start: u64, end: u64, progress: f64) {
    let duration = end - start;
    let offset = (duration as f64 * progress) as u64;
    set_time(env, start + offset);
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_set_time() {
        let env = Env::default();
        set_time(&env, 1000);
        assert_eq!(current_time(&env), 1000);
    }

    #[test]
    fn test_advance_time() {
        let env = Env::default();
        set_time(&env, 1000);
        advance_time(&env, 500);
        assert_eq!(current_time(&env), 1500);
        
        advance_time(&env, 250);
        assert_eq!(current_time(&env), 1750);
    }

    #[test]
    fn test_advance_time_from_zero() {
        let env = Env::default();
        advance_time(&env, 100);
        assert_eq!(current_time(&env), 100);
    }

    #[test]
    fn test_set_time_at_progress_start() {
        let env = Env::default();
        set_time_at_progress(&env, 100, 300, 0.0);
        assert_eq!(current_time(&env), 100);
    }

    #[test]
    fn test_set_time_at_progress_middle() {
        let env = Env::default();
        set_time_at_progress(&env, 100, 300, 0.5);
        assert_eq!(current_time(&env), 200);
    }

    #[test]
    fn test_set_time_at_progress_end() {
        let env = Env::default();
        set_time_at_progress(&env, 100, 300, 1.0);
        assert_eq!(current_time(&env), 300);
    }

    #[test]
    fn test_set_time_at_progress_quarter() {
        let env = Env::default();
        set_time_at_progress(&env, 1000, 2000, 0.25);
        assert_eq!(current_time(&env), 1250);
    }

    #[test]
    fn test_boundary_transition_before_to_at() {
        let env = Env::default();
        let cliff = 200;
        
        // Just before cliff
        set_time(&env, cliff - 1);
        assert_eq!(current_time(&env), 199);
        
        // Exactly at cliff
        set_time(&env, cliff);
        assert_eq!(current_time(&env), 200);
    }

    #[test]
    fn test_boundary_transition_at_to_after() {
        let env = Env::default();
        let cliff = 200;
        
        // Exactly at cliff
        set_time(&env, cliff);
        assert_eq!(current_time(&env), 200);
        
        // Just after cliff
        advance_time(&env, 1);
        assert_eq!(current_time(&env), 201);
    }

    #[test]
    fn test_multiple_advances_deterministic() {
        let env = Env::default();
        set_time(&env, 0);
        
        for _ in 0..10 {
            advance_time(&env, 100);
        }
        
        assert_eq!(current_time(&env), 1000);
    }

    #[test]
    fn test_set_time_idempotent() {
        let env = Env::default();
        set_time(&env, 500);
        set_time(&env, 500);
        set_time(&env, 500);
        assert_eq!(current_time(&env), 500);
    }

    #[test]
    fn test_time_can_go_backwards() {
        let env = Env::default();
        set_time(&env, 1000);
        set_time(&env, 500);
        assert_eq!(current_time(&env), 500);
    }
}
