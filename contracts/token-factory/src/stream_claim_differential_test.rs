//! Differential tests for stream claim parity
//!
//! Ensures claimable_amount read path and claim_stream execution path
//! always compute identical deltas across all schedule variants.

#[cfg(test)]
mod stream_claim_differential_tests {
    use crate::streaming::{create_stream, get_claimable_amount, claim_stream};
    use crate::types::StreamParams;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        (env, creator, recipient, token)
    }

    // ═══════════════════════════════════════════════════════
    //  Pre-Cliff Tests
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_parity_before_cliff() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1500,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // Set time before cliff
        env.ledger().with_mut(|li| li.timestamp = 1200);

        // Read path
        let claimable = get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable, 0, "Should be 0 before cliff");

        // Write path should fail with CliffNotReached
        let result = claim_stream(&env, &recipient, stream_id);
        assert!(result.is_err(), "Claim should fail before cliff");
    }

    #[test]
    fn test_parity_at_cliff_zero_vested() {
        let (env, creator, recipient, _token) = setup();

        // Cliff equals start time - nothing vested yet
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1500,
            end_time: 2000,
            cliff_time: 1500,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        env.ledger().with_mut(|li| li.timestamp = 1500);

        let claimable = get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable, 0, "Nothing vested at start");

        let result = claim_stream(&env, &recipient, stream_id);
        assert!(result.is_err(), "Should fail with NothingToClaim");
    }

    // ═══════════════════════════════════════════════════════
    //  Mid-Vesting Tests
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_parity_mid_vesting_after_cliff() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1200,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // Mid-vesting: 50% through (1500 out of 1000-2000)
        env.ledger().with_mut(|li| li.timestamp = 1500);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let expected = 500_0000000; // 50% of 1000
        assert_eq!(claimable_read, expected, "Read path should return 50%");

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read, "Write path must match read path");
    }

    #[test]
    fn test_parity_mid_vesting_25_percent() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // 25% through vesting
        env.ledger().with_mut(|li| li.timestamp = 1250);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let expected = 250_0000000;
        assert_eq!(claimable_read, expected);

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    #[test]
    fn test_parity_mid_vesting_75_percent() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // 75% through vesting
        env.ledger().with_mut(|li| li.timestamp = 1750);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let expected = 750_0000000;
        assert_eq!(claimable_read, expected);

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    // ═══════════════════════════════════════════════════════
    //  Post-End Tests
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_parity_at_end_time() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        env.ledger().with_mut(|li| li.timestamp = 2000);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable_read, 1000_0000000, "All tokens claimable at end");

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    #[test]
    fn test_parity_after_end_time() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        env.ledger().with_mut(|li| li.timestamp = 3000);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable_read, 1000_0000000);

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    // ═══════════════════════════════════════════════════════
    //  Multiple Claims Tests
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_parity_after_partial_claim() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // First claim at 50%
        env.ledger().with_mut(|li| li.timestamp = 1500);
        let first_claim = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(first_claim, 500_0000000);

        // Second claim at 75%
        env.ledger().with_mut(|li| li.timestamp = 1750);
        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let expected = 250_0000000; // 75% - 50% already claimed
        assert_eq!(claimable_read, expected);

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    #[test]
    fn test_parity_nothing_to_claim_after_full_claim() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // Claim everything at end
        env.ledger().with_mut(|li| li.timestamp = 2000);
        claim_stream(&env, &recipient, stream_id).unwrap();

        // Try to read/claim again
        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable_read, 0);

        let result = claim_stream(&env, &recipient, stream_id);
        assert!(result.is_err(), "Should fail with NothingToClaim");
    }

    // ═══════════════════════════════════════════════════════
    //  Edge Cases & Rounding Tests
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_parity_odd_duration_rounding() {
        let (env, creator, recipient, _token) = setup();

        // Duration that doesn't divide evenly
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 1003, // 3 second duration
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // 1 second in (1/3 through)
        env.ledger().with_mut(|li| li.timestamp = 1001);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read, "Rounding must match");
    }

    #[test]
    fn test_parity_large_amounts() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: i128::MAX / 2, // Very large amount
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        env.ledger().with_mut(|li| li.timestamp = 1500);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    #[test]
    fn test_parity_minimum_amount() {
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1, // Minimum amount
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        env.ledger().with_mut(|li| li.timestamp = 1500);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    // ═══════════════════════════════════════════════════════
    //  Regression Fixtures
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_regression_cliff_after_start() {
        // Regression: cliff after start caused confusion
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1300, // Cliff 300s after start
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // At cliff time, 30% should be vested
        env.ledger().with_mut(|li| li.timestamp = 1300);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        let expected = 300_0000000;
        assert_eq!(claimable_read, expected);

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    #[test]
    fn test_regression_zero_duration() {
        // Regression: zero duration edge case
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 1000, // Same as start
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        env.ledger().with_mut(|li| li.timestamp = 1000);

        let claimable_read = get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable_read, 1000_0000000, "All immediately vested");

        let claimed_write = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed_write, claimable_read);
    }

    #[test]
    fn test_regression_timestamp_boundary() {
        // Regression: boundary conditions at exact timestamps
        let (env, creator, recipient, _token) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000_0000000,
            start_time: 1000,
            end_time: 2000,
            cliff_time: 1000,
        };

        let stream_id = create_stream(&env, &creator, &params, None).unwrap();

        // Test at exact start time
        env.ledger().with_mut(|li| li.timestamp = 1000);
        let claimable = get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable, 0, "Nothing at start");

        // Test at exact end time
        env.ledger().with_mut(|li| li.timestamp = 2000);
        let claimable = get_claimable_amount(&env, stream_id).unwrap();
        let claimed = claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed, claimable);
        assert_eq!(claimed, 1000_0000000, "All at end");
    }
}
