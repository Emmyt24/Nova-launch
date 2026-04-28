//! Comprehensive tests for token burn scheduling with time-locked execution.
//!
//! Covers:
//! - Schedule creation (happy path, validation, auth)
//! - Time-lock enforcement (locked, unlocked)
//! - Execution (happy path, balance deduction, supply update)
//! - Cancellation (by admin, by creator, unauthorized)
//! - Edge cases: already executed, already cancelled, insufficient balance
//! - Token-level pause guard
//! - Multiple schedules per token

#[cfg(test)]
mod burn_schedule_tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, Env, String,
    };

    use crate::{TokenFactory, TokenFactoryClient};

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    const LOCK_DELAY: u64 = 3600; // 1 hour

    /// Set up a factory with one token. Returns (client, admin, creator, token_index).
    fn setup(env: &Env) -> (TokenFactoryClient, Address, Address, u32) {
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(env, &contract_id);

        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        let creator = admin.clone();
        client.create_token(
            &creator,
            &String::from_str(env, "TestToken"),
            &String::from_str(env, "TTK"),
            &7u32,
            &1_000_000_000i128,
            &None,
            &70_000_000i128,
        );

        (client, admin, creator, 0u32)
    }

    fn now(env: &Env) -> u64 {
        env.ledger().timestamp()
    }

    fn advance_time(env: &Env, seconds: u64) {
        env.ledger().with_mut(|l| l.timestamp += seconds);
    }

    /// Give `holder` a balance by minting to them.
    fn give_balance(
        client: &TokenFactoryClient,
        creator: &Address,
        token_index: u32,
        holder: &Address,
        amount: i128,
    ) {
        client.mint(creator, &token_index, holder, &amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // schedule_burn – happy path
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_schedule_burn_happy_path() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        assert_eq!(id, 0);

        let schedule = client.get_burn_schedule(&id).unwrap();
        assert_eq!(schedule.token_index, token_index);
        assert_eq!(schedule.from, holder);
        assert_eq!(schedule.amount, 1000);
        assert_eq!(schedule.unlock_time, unlock);
        assert_eq!(schedule.status, crate::types::BurnScheduleStatus::Pending);
        assert!(schedule.executed_at.is_none());
    }

    #[test]
    fn test_schedule_burn_increments_id() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let id0 = client.schedule_burn(&admin, &token_index, &holder, &100, &unlock);
        let id1 = client.schedule_burn(&admin, &token_index, &holder, &200, &unlock);
        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
        assert_eq!(client.get_burn_schedule_count(), 2);
    }

    #[test]
    fn test_schedule_burn_count_by_token() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        client.schedule_burn(&admin, &token_index, &holder, &100, &unlock);
        client.schedule_burn(&admin, &token_index, &holder, &200, &unlock);
        assert_eq!(client.get_burn_schedule_count_by_token(&token_index), 2);
    }

    #[test]
    fn test_schedule_burn_id_by_token_index() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        let retrieved = client.get_burn_schedule_id_by_token(&token_index, &0u32);
        assert_eq!(retrieved, Some(id));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // schedule_burn – validation errors
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_schedule_burn_unauthorized_fails() {
        let env = Env::default();
        let (client, _, _, token_index) = setup(&env);
        let non_admin = Address::generate(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let result = client.try_schedule_burn(&non_admin, &token_index, &holder, &1000, &unlock);
        assert!(result.is_err());
    }

    #[test]
    fn test_schedule_burn_zero_amount_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let result = client.try_schedule_burn(&admin, &token_index, &holder, &0, &unlock);
        assert!(result.is_err());
    }

    #[test]
    fn test_schedule_burn_negative_amount_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let result = client.try_schedule_burn(&admin, &token_index, &holder, &-1, &unlock);
        assert!(result.is_err());
    }

    #[test]
    fn test_schedule_burn_unlock_not_in_future_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let past_unlock = now(&env); // same as now = not strictly in future

        let result = client.try_schedule_burn(&admin, &token_index, &holder, &1000, &past_unlock);
        assert!(result.is_err());
    }

    #[test]
    fn test_schedule_burn_invalid_token_fails() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let result = client.try_schedule_burn(&admin, &999u32, &holder, &1000, &unlock);
        assert!(result.is_err());
    }

    #[test]
    fn test_schedule_burn_paused_contract_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        client.pause(&admin);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let result = client.try_schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // execute_burn_schedule – time-lock enforcement
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_execute_before_unlock_fails() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);

        let executor = Address::generate(&env);
        let result = client.try_execute_burn_schedule(&executor, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_after_unlock_succeeds() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);

        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id);

        // Schedule marked executed
        let schedule = client.get_burn_schedule(&id).unwrap();
        assert_eq!(schedule.status, crate::types::BurnScheduleStatus::Executed);
        assert!(schedule.executed_at.is_some());
    }

    #[test]
    fn test_execute_updates_token_supply() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let info_before = client.get_token_info(&token_index);

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id);

        let info_after = client.get_token_info(&token_index);
        assert_eq!(info_after.total_supply, info_before.total_supply - 1000);
        assert_eq!(info_after.total_burned, info_before.total_burned + 1000);
        assert_eq!(info_after.burn_count, info_before.burn_count + 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // execute_burn_schedule – guard errors
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_execute_nonexistent_schedule_fails() {
        let env = Env::default();
        let (client, _, _, _) = setup(&env);
        let executor = Address::generate(&env);
        let result = client.try_execute_burn_schedule(&executor, &999);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_already_executed_fails() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id);

        let result = client.try_execute_burn_schedule(&executor, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_cancelled_schedule_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        client.cancel_burn_schedule(&admin, &id);

        advance_time(&env, LOCK_DELAY + 1);
        let executor = Address::generate(&env);
        let result = client.try_execute_burn_schedule(&executor, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_insufficient_balance_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        // Holder has 0 balance
        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        let result = client.try_execute_burn_schedule(&executor, &id);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // cancel_burn_schedule
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_cancel_by_admin() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        client.cancel_burn_schedule(&admin, &id);

        let schedule = client.get_burn_schedule(&id).unwrap();
        assert_eq!(schedule.status, crate::types::BurnScheduleStatus::Cancelled);
    }

    #[test]
    fn test_cancel_by_unauthorized_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        let unauthorized = Address::generate(&env);
        let result = client.try_cancel_burn_schedule(&unauthorized, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_already_cancelled_fails() {
        let env = Env::default();
        let (client, admin, _, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        client.cancel_burn_schedule(&admin, &id);
        let result = client.try_cancel_burn_schedule(&admin, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_executed_schedule_fails() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id);

        let result = client.try_cancel_burn_schedule(&admin, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_nonexistent_schedule_fails() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);
        let result = client.try_cancel_burn_schedule(&admin, &999);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_burn_schedule / counts
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_get_burn_schedule_none_for_unknown_id() {
        let env = Env::default();
        let (client, _, _, _) = setup(&env);
        assert!(client.get_burn_schedule(&42).is_none());
    }

    #[test]
    fn test_get_burn_schedule_count_starts_at_zero() {
        let env = Env::default();
        let (client, _, _, _) = setup(&env);
        assert_eq!(client.get_burn_schedule_count(), 0);
    }

    #[test]
    fn test_get_burn_schedule_count_by_token_starts_at_zero() {
        let env = Env::default();
        let (client, _, _, token_index) = setup(&env);
        assert_eq!(client.get_burn_schedule_count_by_token(&token_index), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Multiple schedules
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_multiple_schedules_independent() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock1 = now(&env) + LOCK_DELAY;
        let unlock2 = now(&env) + LOCK_DELAY * 2;

        give_balance(&client, &creator, token_index, &holder, 10_000);

        let id0 = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock1);
        let id1 = client.schedule_burn(&admin, &token_index, &holder, &2000, &unlock2);

        // Advance past first unlock only
        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id0);

        // Second still locked
        let result = client.try_execute_burn_schedule(&executor, &id1);
        assert!(result.is_err());

        // Advance past second unlock
        advance_time(&env, LOCK_DELAY + 1);
        client.execute_burn_schedule(&executor, &id1);

        // Both executed
        assert_eq!(
            client.get_burn_schedule(&id0).unwrap().status,
            crate::types::BurnScheduleStatus::Executed
        );
        assert_eq!(
            client.get_burn_schedule(&id1).unwrap().status,
            crate::types::BurnScheduleStatus::Executed
        );
    }

    #[test]
    fn test_cancel_one_does_not_affect_other() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);

        let id0 = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        let id1 = client.schedule_burn(&admin, &token_index, &holder, &2000, &unlock);

        client.cancel_burn_schedule(&admin, &id0);

        advance_time(&env, LOCK_DELAY + 1);
        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id1);

        assert_eq!(
            client.get_burn_schedule(&id0).unwrap().status,
            crate::types::BurnScheduleStatus::Cancelled
        );
        assert_eq!(
            client.get_burn_schedule(&id1).unwrap().status,
            crate::types::BurnScheduleStatus::Executed
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Token-level pause guard
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_execute_paused_token_fails() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);

        client.pause_token(&admin, &token_index);

        advance_time(&env, LOCK_DELAY + 1);
        let executor = Address::generate(&env);
        let result = client.try_execute_burn_schedule(&executor, &id);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Supply and burn count integrity
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_supply_decreases_by_exact_amount() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let supply_before = client.get_token_info(&token_index).total_supply;

        let id = client.schedule_burn(&admin, &token_index, &holder, &3000, &unlock);
        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id);

        let supply_after = client.get_token_info(&token_index).total_supply;
        assert_eq!(supply_after, supply_before - 3000);
    }

    #[test]
    fn test_burn_count_increments_on_execution() {
        let env = Env::default();
        let (client, admin, creator, token_index) = setup(&env);
        let holder = Address::generate(&env);
        let unlock = now(&env) + LOCK_DELAY;

        give_balance(&client, &creator, token_index, &holder, 5000);
        let count_before = client.get_token_info(&token_index).burn_count;

        let id = client.schedule_burn(&admin, &token_index, &holder, &1000, &unlock);
        advance_time(&env, LOCK_DELAY + 1);

        let executor = Address::generate(&env);
        client.execute_burn_schedule(&executor, &id);

        let count_after = client.get_token_info(&token_index).burn_count;
        assert_eq!(count_after, count_before + 1);
    }
}
