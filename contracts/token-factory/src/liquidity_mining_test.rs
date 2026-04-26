
#[cfg(test)]
mod liquidity_mining_tests {
    use crate::liquidity_mining;
    use crate::storage;
    use crate::types::{Error, MiningPoolStatus, TokenInfo};
    use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};

    // ─────────────────────────────────────────────────────────────────────────
    // Test helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// Set up a minimal environment with admin, two tokens, and a running pool.
    ///
    /// Returns (env, admin, provider, pool_id)
    fn setup() -> (Env, Address, Address, u64) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let provider = Address::generate(&env);

        // Bootstrap storage
        storage::set_admin(&env, &admin);
        storage::set_paused(&env, false);

        // Create two tokens (reward + stake)
        let reward_token = make_token(&env, &admin, 0);
        let stake_token = make_token(&env, &admin, 1);
        storage::set_token_info(&env, 0, &reward_token);
        storage::set_token_info(&env, 1, &stake_token);

        // Pool: starts now, ends in 1000 seconds, rate = 10 stroops/s/token
        let now = env.ledger().timestamp();
        let pool_id = liquidity_mining::create_mining_pool(
            &env, &admin,
            0,   // reward token index
            1,   // stake token index
            10,  // reward_rate
            now,
            now + 1_000,
        ).unwrap();

        (env, admin, provider, pool_id)
    }

    fn make_token(env: &Env, creator: &Address, index: u32) -> TokenInfo {
        TokenInfo {
            address: Address::generate(env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(env, "Token"),
            symbol: soroban_sdk::String::from_str(env, "TKN"),
            decimals: 7,
            total_supply: 1_000_000_0000000,
            initial_supply: 1_000_000_0000000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pool creation
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_create_pool_success() {
        let (env, admin, _provider, pool_id) = setup();
        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.id, pool_id);
        assert_eq!(pool.reward_rate, 10);
        assert_eq!(pool.status, MiningPoolStatus::Active);
        assert_eq!(pool.total_staked, 0);
    }

    #[test]
    fn test_create_pool_increments_count() {
        let (env, admin, _provider, _pool_id) = setup();
        assert_eq!(liquidity_mining::get_mining_pool_count(&env), 1);
    }

    #[test]
    fn test_create_pool_invalid_time_window() {
        let (env, admin, _provider, _) = setup();
        let now = env.ledger().timestamp();
        // end_time <= start_time
        let result = liquidity_mining::create_mining_pool(
            &env, &admin, 0, 1, 10, now + 100, now + 50,
        );
        assert_eq!(result, Err(Error::InvalidTimeWindow));
    }

    #[test]
    fn test_create_pool_end_in_past() {
        let (env, admin, _provider, _) = setup();
        env.ledger().with_mut(|l| l.timestamp = 5_000);
        let result = liquidity_mining::create_mining_pool(
            &env, &admin, 0, 1, 10, 1_000, 2_000,
        );
        assert_eq!(result, Err(Error::InvalidTimeWindow));
    }

    #[test]
    fn test_create_pool_zero_reward_rate() {
        let (env, admin, _provider, _) = setup();
        let now = env.ledger().timestamp();
        let result = liquidity_mining::create_mining_pool(
            &env, &admin, 0, 1, 0, now, now + 1_000,
        );
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_create_pool_unauthorized() {
        let (env, _admin, provider, _) = setup();
        let now = env.ledger().timestamp();
        let result = liquidity_mining::create_mining_pool(
            &env, &provider, 0, 1, 10, now, now + 1_000,
        );
        assert_eq!(result, Err(Error::Unauthorized));
    }

    #[test]
    fn test_create_pool_invalid_token() {
        let (env, admin, _provider, _) = setup();
        let now = env.ledger().timestamp();
        // token index 99 does not exist
        let result = liquidity_mining::create_mining_pool(
            &env, &admin, 99, 1, 10, now, now + 1_000,
        );
        assert_eq!(result, Err(Error::TokenNotFound));
    }

    #[test]
    fn test_create_pool_contract_paused() {
        let (env, admin, _provider, _) = setup();
        storage::set_paused(&env, true);
        let now = env.ledger().timestamp();
        let result = liquidity_mining::create_mining_pool(
            &env, &admin, 0, 1, 10, now, now + 1_000,
        );
        assert_eq!(result, Err(Error::ContractPaused));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Staking
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_stake_success() {
        let (env, _admin, provider, pool_id) = setup();
        let result = liquidity_mining::stake(&env, &provider, pool_id, 1_000);
        assert!(result.is_ok());

        let stake = liquidity_mining::get_provider_stake(&env, pool_id, &provider).unwrap();
        assert_eq!(stake.staked_amount, 1_000);

        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.total_staked, 1_000);
    }

    #[test]
    fn test_stake_zero_amount_rejected() {
        let (env, _admin, provider, pool_id) = setup();
        let result = liquidity_mining::stake(&env, &provider, pool_id, 0);
        assert_eq!(result, Err(Error::InvalidAmount));
    }

    #[test]
    fn test_stake_negative_amount_rejected() {
        let (env, _admin, provider, pool_id) = setup();
        let result = liquidity_mining::stake(&env, &provider, pool_id, -1);
        assert_eq!(result, Err(Error::InvalidAmount));
    }

    #[test]
    fn test_stake_pool_not_found() {
        let (env, _admin, provider, _) = setup();
        let result = liquidity_mining::stake(&env, &provider, 999, 1_000);
        assert_eq!(result, Err(Error::CampaignNotFound));
    }

    #[test]
    fn test_stake_before_pool_start() {
        let (env, admin, provider, _) = setup();
        // Create a pool that starts in the future
        let now = env.ledger().timestamp();
        let pool_id = liquidity_mining::create_mining_pool(
            &env, &admin, 0, 1, 10, now + 500, now + 2_000,
        ).unwrap();
        let result = liquidity_mining::stake(&env, &provider, pool_id, 1_000);
        assert_eq!(result, Err(Error::InvalidTimeWindow));
    }

    #[test]
    fn test_stake_after_pool_end() {
        let (env, _admin, provider, pool_id) = setup();
        // Advance past end_time
        env.ledger().with_mut(|l| l.timestamp += 2_000);
        let result = liquidity_mining::stake(&env, &provider, pool_id, 1_000);
        assert_eq!(result, Err(Error::InvalidTimeWindow));
    }

    #[test]
    fn test_stake_paused_pool_rejected() {
        let (env, admin, provider, pool_id) = setup();
        liquidity_mining::pause_mining_pool(&env, &admin, pool_id).unwrap();
        let result = liquidity_mining::stake(&env, &provider, pool_id, 1_000);
        assert_eq!(result, Err(Error::InvalidStateTransition));
    }

    #[test]
    fn test_multiple_stakes_accumulate() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 500).unwrap();
        liquidity_mining::stake(&env, &provider, pool_id, 300).unwrap();

        let stake = liquidity_mining::get_provider_stake(&env, pool_id, &provider).unwrap();
        assert_eq!(stake.staked_amount, 800);

        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.total_staked, 800);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Unstaking
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_unstake_success() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();
        let result = liquidity_mining::unstake(&env, &provider, pool_id, 400);
        assert!(result.is_ok());

        let stake = liquidity_mining::get_provider_stake(&env, pool_id, &provider).unwrap();
        assert_eq!(stake.staked_amount, 600);

        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.total_staked, 600);
    }

    #[test]
    fn test_unstake_full_amount() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();
        liquidity_mining::unstake(&env, &provider, pool_id, 1_000).unwrap();

        let stake = liquidity_mining::get_provider_stake(&env, pool_id, &provider).unwrap();
        assert_eq!(stake.staked_amount, 0);
    }

    #[test]
    fn test_unstake_exceeds_balance_rejected() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 500).unwrap();
        let result = liquidity_mining::unstake(&env, &provider, pool_id, 600);
        assert_eq!(result, Err(Error::InsufficientBalance));
    }

    #[test]
    fn test_unstake_zero_amount_rejected() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 500).unwrap();
        let result = liquidity_mining::unstake(&env, &provider, pool_id, 0);
        assert_eq!(result, Err(Error::InvalidAmount));
    }

    #[test]
    fn test_unstake_no_stake_rejected() {
        let (env, _admin, provider, pool_id) = setup();
        let result = liquidity_mining::unstake(&env, &provider, pool_id, 100);
        assert_eq!(result, Err(Error::InsufficientBalance));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reward accrual and claiming
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_rewards_accrue_over_time() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();

        // Advance 100 seconds
        env.ledger().with_mut(|l| l.timestamp += 100);

        // Expected: 100s * 10 rate * 1000 staked / 1000 staked = 1000 reward tokens
        // (scaled by REWARD_PRECISION = 10_000_000 internally, but result is in tokens)
        let claimable = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();
        assert!(claimable > 0, "rewards should have accrued");
    }

    #[test]
    fn test_claim_rewards_success() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 100);

        let claimed = liquidity_mining::claim_rewards(&env, &provider, pool_id).unwrap();
        assert!(claimed > 0, "should have claimed rewards");

        // After claiming, pending rewards reset to 0
        let claimable = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();
        assert_eq!(claimable, 0);
    }

    #[test]
    fn test_claim_nothing_to_claim() {
        let (env, _admin, provider, pool_id) = setup();
        // No stake, no rewards
        let result = liquidity_mining::claim_rewards(&env, &provider, pool_id);
        assert_eq!(result, Err(Error::NothingToClaim));
    }

    #[test]
    fn test_claim_immediately_after_stake_zero() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();
        // No time has passed
        let result = liquidity_mining::claim_rewards(&env, &provider, pool_id);
        assert_eq!(result, Err(Error::NothingToClaim));
    }

    #[test]
    fn test_rewards_stop_at_end_time() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();

        // Advance well past end_time (pool ends at now + 1000)
        env.ledger().with_mut(|l| l.timestamp += 5_000);

        let claimable_past = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();

        // Advance even further — rewards should not increase
        env.ledger().with_mut(|l| l.timestamp += 5_000);
        let claimable_further = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();

        assert_eq!(claimable_past, claimable_further, "rewards must not accrue past end_time");
    }

    #[test]
    fn test_proportional_rewards_two_providers() {
        let (env, _admin, provider, pool_id) = setup();
        let provider2 = Address::generate(&env);

        // Provider 1 stakes 3000, provider 2 stakes 1000 (75/25 split)
        liquidity_mining::stake(&env, &provider, pool_id, 3_000).unwrap();
        liquidity_mining::stake(&env, &provider2, pool_id, 1_000).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 100);

        let r1 = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();
        let r2 = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider2).unwrap();

        // r1 should be ~3x r2
        assert!(r1 > r2, "larger staker should earn more");
        // Allow ±1 for integer rounding
        let ratio = r1 / r2.max(1);
        assert!(ratio >= 2 && ratio <= 4, "ratio should be ~3x, got {}", ratio);
    }

    #[test]
    fn test_rewards_preserved_after_unstake() {
        let (env, _admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 100);

        // Unstake — rewards should be checkpointed, not lost
        liquidity_mining::unstake(&env, &provider, pool_id, 1_000).unwrap();

        let stake = liquidity_mining::get_provider_stake(&env, pool_id, &provider).unwrap();
        assert!(stake.pending_rewards > 0, "pending rewards must be preserved after unstake");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pool lifecycle: pause / resume / end
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_pause_pool_success() {
        let (env, admin, _provider, pool_id) = setup();
        liquidity_mining::pause_mining_pool(&env, &admin, pool_id).unwrap();
        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.status, MiningPoolStatus::Paused);
    }

    #[test]
    fn test_pause_already_paused_rejected() {
        let (env, admin, _provider, pool_id) = setup();
        liquidity_mining::pause_mining_pool(&env, &admin, pool_id).unwrap();
        let result = liquidity_mining::pause_mining_pool(&env, &admin, pool_id);
        assert_eq!(result, Err(Error::InvalidStateTransition));
    }

    #[test]
    fn test_resume_pool_success() {
        let (env, admin, _provider, pool_id) = setup();
        liquidity_mining::pause_mining_pool(&env, &admin, pool_id).unwrap();
        liquidity_mining::resume_mining_pool(&env, &admin, pool_id).unwrap();
        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.status, MiningPoolStatus::Active);
    }

    #[test]
    fn test_resume_active_pool_rejected() {
        let (env, admin, _provider, pool_id) = setup();
        let result = liquidity_mining::resume_mining_pool(&env, &admin, pool_id);
        assert_eq!(result, Err(Error::InvalidStateTransition));
    }

    #[test]
    fn test_end_pool_success() {
        let (env, admin, _provider, pool_id) = setup();
        liquidity_mining::end_mining_pool(&env, &admin, pool_id).unwrap();
        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.status, MiningPoolStatus::Ended);
    }

    #[test]
    fn test_end_already_ended_rejected() {
        let (env, admin, _provider, pool_id) = setup();
        liquidity_mining::end_mining_pool(&env, &admin, pool_id).unwrap();
        let result = liquidity_mining::end_mining_pool(&env, &admin, pool_id);
        assert_eq!(result, Err(Error::InvalidStateTransition));
    }

    #[test]
    fn test_pause_unauthorized() {
        let (env, _admin, provider, pool_id) = setup();
        let result = liquidity_mining::pause_mining_pool(&env, &provider, pool_id);
        assert_eq!(result, Err(Error::Unauthorized));
    }

    #[test]
    fn test_end_unauthorized() {
        let (env, _admin, provider, pool_id) = setup();
        let result = liquidity_mining::end_mining_pool(&env, &provider, pool_id);
        assert_eq!(result, Err(Error::Unauthorized));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reward rate update
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_update_reward_rate_success() {
        let (env, admin, _provider, pool_id) = setup();
        liquidity_mining::update_reward_rate(&env, &admin, pool_id, 50).unwrap();
        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.reward_rate, 50);
    }

    #[test]
    fn test_update_reward_rate_zero_rejected() {
        let (env, admin, _provider, pool_id) = setup();
        let result = liquidity_mining::update_reward_rate(&env, &admin, pool_id, 0);
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_update_reward_rate_paused_pool_rejected() {
        let (env, admin, _provider, pool_id) = setup();
        liquidity_mining::pause_mining_pool(&env, &admin, pool_id).unwrap();
        let result = liquidity_mining::update_reward_rate(&env, &admin, pool_id, 20);
        assert_eq!(result, Err(Error::InvalidStateTransition));
    }

    #[test]
    fn test_update_reward_rate_unauthorized() {
        let (env, _admin, provider, pool_id) = setup();
        let result = liquidity_mining::update_reward_rate(&env, &provider, pool_id, 20);
        assert_eq!(result, Err(Error::Unauthorized));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reward accrual pauses during pool pause
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_no_rewards_during_pause() {
        let (env, admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();

        // Advance 50s, then pause
        env.ledger().with_mut(|l| l.timestamp += 50);
        liquidity_mining::pause_mining_pool(&env, &admin, pool_id).unwrap();

        let claimable_at_pause = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();

        // Advance another 100s while paused
        env.ledger().with_mut(|l| l.timestamp += 100);
        let claimable_while_paused = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();

        assert_eq!(
            claimable_at_pause, claimable_while_paused,
            "rewards must not accrue while pool is paused"
        );
    }

    #[test]
    fn test_rewards_resume_after_unpause() {
        let (env, admin, provider, pool_id) = setup();
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 50);
        liquidity_mining::pause_mining_pool(&env, &admin, pool_id).unwrap();

        let claimable_at_pause = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 100);
        liquidity_mining::resume_mining_pool(&env, &admin, pool_id).unwrap();

        // Advance 50s after resume
        env.ledger().with_mut(|l| l.timestamp += 50);
        let claimable_after_resume = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();

        assert!(
            claimable_after_resume > claimable_at_pause,
            "rewards should accrue again after resume"
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Arithmetic safety
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_stake_i128_max_rejected() {
        let (env, _admin, provider, pool_id) = setup();
        // First stake a normal amount so total_staked doesn't overflow on second
        liquidity_mining::stake(&env, &provider, pool_id, 1_000).unwrap();
        // Staking i128::MAX should overflow total_staked
        let result = liquidity_mining::stake(&env, &provider, pool_id, i128::MAX);
        assert!(result.is_err());
    }

    #[test]
    fn test_claimable_rewards_no_stake_returns_zero() {
        let (env, _admin, provider, pool_id) = setup();
        let claimable = liquidity_mining::get_claimable_rewards(&env, pool_id, &provider).unwrap();
        assert_eq!(claimable, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Integration: full lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_full_lifecycle() {
        let (env, admin, provider, pool_id) = setup();

        // 1. Stake
        liquidity_mining::stake(&env, &provider, pool_id, 2_000).unwrap();

        // 2. Advance time
        env.ledger().with_mut(|l| l.timestamp += 200);

        // 3. Claim rewards
        let claimed = liquidity_mining::claim_rewards(&env, &provider, pool_id).unwrap();
        assert!(claimed > 0);

        // 4. Advance more time
        env.ledger().with_mut(|l| l.timestamp += 200);

        // 5. Unstake
        liquidity_mining::unstake(&env, &provider, pool_id, 2_000).unwrap();

        // 6. Claim remaining rewards
        let stake = liquidity_mining::get_provider_stake(&env, pool_id, &provider).unwrap();
        assert!(stake.pending_rewards > 0);

        // 7. Admin ends pool
        liquidity_mining::end_mining_pool(&env, &admin, pool_id).unwrap();
        let pool = liquidity_mining::get_mining_pool(&env, pool_id).unwrap();
        assert_eq!(pool.status, MiningPoolStatus::Ended);
    }
}
