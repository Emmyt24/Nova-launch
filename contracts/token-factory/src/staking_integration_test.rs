#[cfg(test)]
mod staking_integration_tests {
    use crate::storage;
    use crate::types::Error;
    use crate::TokenFactory;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};
    use crate::staking;
    
    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let creator = Address::generate(&env);
        let user1 = Address::generate(&env);

        storage::set_admin(&env, &admin);
        storage::set_paused(&env, false);

        // Stake Token
        let stake_token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(&env, "Stake Token"),
            symbol: soroban_sdk::String::from_str(&env, "STK"),
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
        };
        storage::set_token_info(&env, 0, &stake_token_info);

        // Reward Token
        let reward_token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(&env, "Reward Token"),
            symbol: soroban_sdk::String::from_str(&env, "RWD"),
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
        };
        storage::set_token_info(&env, 1, &reward_token_info);

        // Give user1 some stake tokens and the creator some reward tokens to pay out
        storage::set_balance(&env, 0, &user1, 1000);
        storage::set_balance(&env, 1, &creator, 10000);

        (env, admin, creator, user1)
    }

    #[test]
    fn test_create_staking_pool() {
        let (env, admin, _creator, _user1) = setup();

        let reward_rate = 10;
        let pool_id = staking::create_staking_pool(&env, admin.clone(), 0, 1, reward_rate).unwrap();

        assert_eq!(pool_id, 0);

        let pool = storage::get_staking_pool(&env, pool_id).unwrap();
        assert_eq!(pool.token_index, 0);
        assert_eq!(pool.reward_token_index, 1);
        assert_eq!(pool.reward_rate, 10);
        assert_eq!(pool.total_staked, 0);
        assert_eq!(pool.creator, admin);
    }

    #[test]
    fn test_stake_success() {
        let (env, admin, _creator, user1) = setup();

        let pool_id = staking::create_staking_pool(&env, admin, 0, 1, 10).unwrap();

        staking::stake(&env, user1.clone(), pool_id, 500).unwrap();

        let pool = storage::get_staking_pool(&env, pool_id).unwrap();
        assert_eq!(pool.total_staked, 500);

        let user_stake = storage::get_user_stake(&env, pool_id, &user1).unwrap();
        assert_eq!(user_stake.amount, 500);

        let balance = storage::get_balance(&env, 0, &user1);
        assert_eq!(balance, 500); // 1000 - 500
    }

    #[test]
    fn test_stake_insufficient_balance() {
        let (env, admin, _creator, user1) = setup();
        let pool_id = staking::create_staking_pool(&env, admin, 0, 1, 10).unwrap();

        // user1 has 1000 tokens
        let result = staking::stake(&env, user1, pool_id, 1500);
        assert_eq!(result, Err(Error::InsufficientBalance));
    }

    #[test]
    fn test_unstake_success() {
        let (env, admin, _creator, user1) = setup();
        let pool_id = staking::create_staking_pool(&env, admin, 0, 1, 10).unwrap();

        staking::stake(&env, user1.clone(), pool_id, 500).unwrap();

        // Advance time so we get some rewards (though the test mainly checks unstake)
        env.ledger().with_mut(|li| {
            li.timestamp += 100;
        });

        staking::unstake(&env, user1.clone(), pool_id, 200).unwrap();

        let pool = storage::get_staking_pool(&env, pool_id).unwrap();
        assert_eq!(pool.total_staked, 300); // 500 - 200

        let user_stake = storage::get_user_stake(&env, pool_id, &user1).unwrap();
        assert_eq!(user_stake.amount, 300);

        let balance = storage::get_balance(&env, 0, &user1);
        assert_eq!(balance, 700); // 1000 - 500 + 200
    }

    #[test]
    fn test_claim_rewards() {
        let (env, admin, _creator, user1) = setup();
        let pool_id = staking::create_staking_pool(&env, admin, 0, 1, 10).unwrap();

        staking::stake(&env, user1.clone(), pool_id, 500).unwrap();

        env.ledger().with_mut(|li| {
            li.timestamp += 10;
        });

        staking::claim_rewards(&env, user1.clone(), pool_id).unwrap();

        // 10 seconds * 10 reward rate = 100 total rewards.
        // Since user1 has 100% of the pool, they get 100 rewards.
        let reward_balance = storage::get_balance(&env, 1, &user1);
        assert_eq!(reward_balance, 100);
    }

    #[test]
    fn test_pending_rewards() {
        let (env, admin, _creator, user1) = setup();
        let pool_id = staking::create_staking_pool(&env, admin, 0, 1, 10).unwrap();

        staking::stake(&env, user1.clone(), pool_id, 500).unwrap();

        env.ledger().with_mut(|li| {
            li.timestamp += 10;
        });

        let pending = staking::pending_rewards(&env, user1.clone(), pool_id).unwrap();
        assert_eq!(pending, 100);
    }

    #[test]
    fn test_claim_nothing() {
        let (env, admin, _creator, user1) = setup();
        let pool_id = staking::create_staking_pool(&env, admin, 0, 1, 10).unwrap();

        staking::stake(&env, user1.clone(), pool_id, 500).unwrap();

        // 0 time passed
        let result = staking::claim_rewards(&env, user1.clone(), pool_id);
        assert_eq!(result, Err(Error::NothingToClaim));
    }
}
