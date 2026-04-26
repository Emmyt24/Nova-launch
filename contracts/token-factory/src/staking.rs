use crate::events;
use crate::storage;
use crate::types::{Error, StakeInfo, StakingPool};
use soroban_sdk::{Address, Env};

const PRECISION: i128 = 1_000_000_000_000;

pub fn create_staking_pool(
    env: &Env,
    creator: Address,
    token_index: u32,
    reward_token_index: u32,
    reward_rate: i128,
) -> Result<u64, Error> {
    creator.require_auth();

    if reward_rate < 0 {
        return Err(Error::InvalidRewardRate);
    }

    let admin = storage::get_admin(env);
    if creator != admin {
        return Err(Error::Unauthorized);
    }

    let pool_id = storage::increment_next_staking_pool_id(env);
    let pool = StakingPool {
        id: pool_id,
        token_index,
        reward_token_index,
        reward_rate,
        total_staked: 0,
        acc_reward_per_share: 0,
        last_reward_time: env.ledger().timestamp(),
        active: true,
        creator: creator.clone(),
    };

    storage::set_staking_pool(env, pool_id, &pool);
    storage::increment_staking_pool_count(env)?;

    events::emit_staking_pool_created(
        env,
        pool_id,
        token_index,
        reward_token_index,
        reward_rate,
    );

    Ok(pool_id)
}

fn update_pool(env: &Env, pool: &mut StakingPool) -> Result<(), Error> {
    let current_time = env.ledger().timestamp();
    if current_time <= pool.last_reward_time {
        return Ok(());
    }

    if pool.total_staked == 0 {
        pool.last_reward_time = current_time;
        return Ok(());
    }

    let time_delta = (current_time - pool.last_reward_time) as i128;
    let reward = time_delta
        .checked_mul(pool.reward_rate)
        .ok_or(Error::ArithmeticError)?;

    let reward_per_share_delta = reward
        .checked_mul(PRECISION)
        .ok_or(Error::ArithmeticError)?
        .checked_div(pool.total_staked)
        .ok_or(Error::ArithmeticError)?;

    pool.acc_reward_per_share = pool
        .acc_reward_per_share
        .checked_add(reward_per_share_delta)
        .ok_or(Error::ArithmeticError)?;

    pool.last_reward_time = current_time;
    Ok(())
}

pub fn stake(env: &Env, caller: Address, pool_id: u64, amount: i128) -> Result<(), Error> {
    caller.require_auth();

    if amount <= 0 {
        return Err(Error::InvalidParameters);
    }

    let mut pool = storage::get_staking_pool(env, pool_id).ok_or(Error::StakingPoolNotFound)?;

    if !pool.active {
        return Err(Error::StakingNotActive);
    }

    update_pool(env, &mut pool)?;

    // Update or create user stake
    let mut user_stake = storage::get_user_stake(env, pool_id, &caller).unwrap_or(StakeInfo {
        amount: 0,
        reward_debt: 0,
    });

    // If user already staked, they have pending rewards.
    // They must be claimed or accounted for. For simplicity, we just calculate it and
    // normally it would be transferred, but here we can just update the debt.
    // However, if we do transfer, we need to interact with balances.
    
    // Instead of auto-claiming, let's claim it first if amount > 0
    let mut pending = 0;
    if user_stake.amount > 0 {
        pending = user_stake.amount
            .checked_mul(pool.acc_reward_per_share)
            .ok_or(Error::ArithmeticError)?
            .checked_div(PRECISION)
            .ok_or(Error::ArithmeticError)?
            .checked_sub(user_stake.reward_debt)
            .ok_or(Error::ArithmeticError)?;
    }

    // Process token transfer for the staked token
    let balance = storage::get_balance(env, pool.token_index, &caller);
    if balance < amount {
        return Err(Error::InsufficientBalance);
    }
    let new_balance = balance.checked_sub(amount).ok_or(Error::ArithmeticError)?;
    storage::set_balance(env, pool.token_index, &caller, new_balance);

    user_stake.amount = user_stake
        .amount
        .checked_add(amount)
        .ok_or(Error::ArithmeticError)?;
    user_stake.reward_debt = user_stake.amount
        .checked_mul(pool.acc_reward_per_share)
        .ok_or(Error::ArithmeticError)?
        .checked_div(PRECISION)
        .ok_or(Error::ArithmeticError)?;

    pool.total_staked = pool
        .total_staked
        .checked_add(amount)
        .ok_or(Error::ArithmeticError)?;

    storage::set_staking_pool(env, pool_id, &pool);
    storage::set_user_stake(env, pool_id, &caller, &user_stake);

    events::emit_staked(env, pool_id, &caller, amount);

    // If there is pending reward, we give it to them
    if pending > 0 {
        let reward_bal = storage::get_balance(env, pool.reward_token_index, &caller);
        let new_reward_bal = reward_bal.checked_add(pending).ok_or(Error::ArithmeticError)?;
        storage::set_balance(env, pool.reward_token_index, &caller, new_reward_bal);
        events::emit_reward_claimed(env, pool_id, &caller, pending);
    }

    Ok(())
}

pub fn unstake(env: &Env, caller: Address, pool_id: u64, amount: i128) -> Result<(), Error> {
    caller.require_auth();

    if amount <= 0 {
        return Err(Error::InvalidParameters);
    }

    let mut pool = storage::get_staking_pool(env, pool_id).ok_or(Error::StakingPoolNotFound)?;
    update_pool(env, &mut pool)?;

    let mut user_stake = storage::get_user_stake(env, pool_id, &caller).ok_or(Error::InsufficientStake)?;

    if user_stake.amount < amount {
        return Err(Error::InsufficientStake);
    }

    let pending = user_stake.amount
        .checked_mul(pool.acc_reward_per_share)
        .ok_or(Error::ArithmeticError)?
        .checked_div(PRECISION)
        .ok_or(Error::ArithmeticError)?
        .checked_sub(user_stake.reward_debt)
        .ok_or(Error::ArithmeticError)?;

    user_stake.amount = user_stake
        .amount
        .checked_sub(amount)
        .ok_or(Error::ArithmeticError)?;
        
    user_stake.reward_debt = user_stake.amount
        .checked_mul(pool.acc_reward_per_share)
        .ok_or(Error::ArithmeticError)?
        .checked_div(PRECISION)
        .ok_or(Error::ArithmeticError)?;

    pool.total_staked = pool
        .total_staked
        .checked_sub(amount)
        .ok_or(Error::ArithmeticError)?;

    // Transfer staked tokens back
    let balance = storage::get_balance(env, pool.token_index, &caller);
    let new_balance = balance.checked_add(amount).ok_or(Error::ArithmeticError)?;
    storage::set_balance(env, pool.token_index, &caller, new_balance);

    storage::set_staking_pool(env, pool_id, &pool);
    storage::set_user_stake(env, pool_id, &caller, &user_stake);

    events::emit_unstaked(env, pool_id, &caller, amount);

    // Distribute pending rewards
    if pending > 0 {
        let reward_bal = storage::get_balance(env, pool.reward_token_index, &caller);
        let new_reward_bal = reward_bal.checked_add(pending).ok_or(Error::ArithmeticError)?;
        storage::set_balance(env, pool.reward_token_index, &caller, new_reward_bal);
        events::emit_reward_claimed(env, pool_id, &caller, pending);
    }

    Ok(())
}

pub fn claim_rewards(env: &Env, caller: Address, pool_id: u64) -> Result<(), Error> {
    caller.require_auth();

    let mut pool = storage::get_staking_pool(env, pool_id).ok_or(Error::StakingPoolNotFound)?;
    update_pool(env, &mut pool)?;

    let mut user_stake = storage::get_user_stake(env, pool_id, &caller).ok_or(Error::InsufficientStake)?;

    let pending = user_stake.amount
        .checked_mul(pool.acc_reward_per_share)
        .ok_or(Error::ArithmeticError)?
        .checked_div(PRECISION)
        .ok_or(Error::ArithmeticError)?
        .checked_sub(user_stake.reward_debt)
        .ok_or(Error::ArithmeticError)?;

    if pending > 0 {
        user_stake.reward_debt = user_stake.amount
            .checked_mul(pool.acc_reward_per_share)
            .ok_or(Error::ArithmeticError)?
            .checked_div(PRECISION)
            .ok_or(Error::ArithmeticError)?;

        storage::set_user_stake(env, pool_id, &caller, &user_stake);

        let reward_bal = storage::get_balance(env, pool.reward_token_index, &caller);
        let new_reward_bal = reward_bal.checked_add(pending).ok_or(Error::ArithmeticError)?;
        storage::set_balance(env, pool.reward_token_index, &caller, new_reward_bal);

        events::emit_reward_claimed(env, pool_id, &caller, pending);
    } else {
        return Err(Error::NothingToClaim);
    }

    Ok(())
}

pub fn pending_rewards(env: &Env, caller: Address, pool_id: u64) -> Result<i128, Error> {
    let pool = storage::get_staking_pool(env, pool_id).ok_or(Error::StakingPoolNotFound)?;
    let user_stake = storage::get_user_stake(env, pool_id, &caller).unwrap_or(StakeInfo { amount: 0, reward_debt: 0 });

    if user_stake.amount == 0 {
        return Ok(0);
    }

    let mut acc_reward_per_share = pool.acc_reward_per_share;
    let current_time = env.ledger().timestamp();
    if current_time > pool.last_reward_time && pool.total_staked != 0 {
        let time_delta = (current_time - pool.last_reward_time) as i128;
        let reward = time_delta
            .checked_mul(pool.reward_rate)
            .ok_or(Error::ArithmeticError)?;
        let reward_per_share_delta = reward
            .checked_mul(PRECISION)
            .ok_or(Error::ArithmeticError)?
            .checked_div(pool.total_staked)
            .ok_or(Error::ArithmeticError)?;
        acc_reward_per_share = acc_reward_per_share
            .checked_add(reward_per_share_delta)
            .ok_or(Error::ArithmeticError)?;
    }

    let pending = user_stake.amount
        .checked_mul(acc_reward_per_share)
        .ok_or(Error::ArithmeticError)?
        .checked_div(PRECISION)
        .ok_or(Error::ArithmeticError)?
        .checked_sub(user_stake.reward_debt)
        .ok_or(Error::ArithmeticError)?;

    Ok(pending)
}
