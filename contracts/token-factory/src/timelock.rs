use soroban_sdk::{Address, Env};
use crate::types::{Error, TimelockConfig, PendingChange, ChangeType};
use crate::storage;
use crate::events;

/// Default timelock delay in seconds (48 hours)
const DEFAULT_TIMELOCK_DELAY: u64 = 172_800;

/// Maximum timelock delay in seconds (30 days)
const MAX_TIMELOCK_DELAY: u64 = 2_592_000;

/// Initialize timelock configuration
///
/// Sets up the timelock delay for sensitive operations.
/// Must be called during contract initialization.
///
/// # Arguments
/// * `env` - The contract environment
/// * `delay_seconds` - Delay in seconds before changes can be executed
///
/// # Errors
/// * `Error::InvalidParameters` - Delay exceeds maximum allowed
pub fn initialize_timelock(env: &Env, delay_seconds: Option<u64>) -> Result<(), Error> {
    let delay = delay_seconds.unwrap_or(DEFAULT_TIMELOCK_DELAY);
    
    if delay > MAX_TIMELOCK_DELAY {
        return Err(Error::InvalidParameters);
    }
    
    let config = TimelockConfig {
        delay_seconds: delay,
        enabled: true,
    };
    
    storage::set_timelock_config(env, &config);
    events::emit_timelock_configured(env, delay);
    
    Ok(())
}

/// Schedule a fee update
///
/// Schedules a change to base_fee or metadata_fee with timelock delay.
/// The change cannot be executed until the timelock expires.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize)
/// * `base_fee` - Optional new base fee
/// * `metadata_fee` - Optional new metadata fee
///
/// # Returns
/// Returns the change ID
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::InvalidParameters` - Both fees are None or negative
pub fn schedule_fee_update(
    env: &Env,
    admin: &Address,
    base_fee: Option<i128>,
    metadata_fee: Option<i128>,
) -> Result<u64, Error> {
    admin.require_auth();
    
    let current_admin = storage::get_admin(env);
    if *admin != current_admin {
        return Err(Error::Unauthorized);
    }
    
    if base_fee.is_none() && metadata_fee.is_none() {
        return Err(Error::InvalidParameters);
    }
    
    // Validate fees
    if let Some(fee) = base_fee {
        if fee < 0 {
            return Err(Error::InvalidParameters);
        }
    }
    
    if let Some(fee) = metadata_fee {
        if fee < 0 {
            return Err(Error::InvalidParameters);
        }
    }
    
    let config = storage::get_timelock_config(env);
    let current_time = env.ledger().timestamp();
    let execute_at = current_time
        .checked_add(config.delay_seconds)
        .ok_or(Error::ArithmeticError)?;
    
    let change_id = storage::get_next_change_id(env)?;
    
    let pending_change = PendingChange {
        id: change_id,
        change_type: ChangeType::FeeUpdate,
        scheduled_by: admin.clone(),
        scheduled_at: current_time,
        execute_at,
        executed: false,
        base_fee,
        metadata_fee,
        paused: None,
        treasury: None,
    };
    
    storage::set_pending_change(env, change_id, &pending_change);
    events::emit_change_scheduled(env, change_id, ChangeType::FeeUpdate, execute_at);
    
    Ok(change_id)
}

/// Schedule a pause state change
///
/// Schedules a change to the contract's pause state with timelock delay.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize)
/// * `paused` - New pause state
///
/// # Returns
/// Returns the change ID
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
pub fn schedule_pause_update(
    env: &Env,
    admin: &Address,
    paused: bool,
) -> Result<u64, Error> {
    admin.require_auth();
    
    let current_admin = storage::get_admin(env);
    if *admin != current_admin {
        return Err(Error::Unauthorized);
    }
    
    let config = storage::get_timelock_config(env);
    let current_time = env.ledger().timestamp();
    let execute_at = current_time
        .checked_add(config.delay_seconds)
        .ok_or(Error::ArithmeticError)?;
    
    let change_id = storage::get_next_change_id(env)?;
    
    let pending_change = PendingChange {
        id: change_id,
        change_type: ChangeType::PauseUpdate,
        scheduled_by: admin.clone(),
        scheduled_at: current_time,
        execute_at,
        executed: false,
        base_fee: None,
        metadata_fee: None,
        paused: Some(paused),
        treasury: None,
    };
    
    storage::set_pending_change(env, change_id, &pending_change);
    events::emit_change_scheduled(env, change_id, ChangeType::PauseUpdate, execute_at);
    
    Ok(change_id)
}

/// Schedule a treasury address change
///
/// Schedules a change to the treasury address with timelock delay.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize)
/// * `new_treasury` - New treasury address
///
/// # Returns
/// Returns the change ID
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
pub fn schedule_treasury_update(
    env: &Env,
    admin: &Address,
    new_treasury: &Address,
) -> Result<u64, Error> {
    admin.require_auth();
    
    let current_admin = storage::get_admin(env);
    if *admin != current_admin {
        return Err(Error::Unauthorized);
    }
    
    let config = storage::get_timelock_config(env);
    let current_time = env.ledger().timestamp();
    let execute_at = current_time
        .checked_add(config.delay_seconds)
        .ok_or(Error::ArithmeticError)?;
    
    let change_id = storage::get_next_change_id(env)?;
    
    let pending_change = PendingChange {
        id: change_id,
        change_type: ChangeType::TreasuryUpdate,
        scheduled_by: admin.clone(),
        scheduled_at: current_time,
        execute_at,
        executed: false,
        base_fee: None,
        metadata_fee: None,
        paused: None,
        treasury: Some(new_treasury.clone()),
    };
    
    storage::set_pending_change(env, change_id, &pending_change);
    events::emit_change_scheduled(env, change_id, ChangeType::TreasuryUpdate, execute_at);
    
    Ok(change_id)
}

/// Execute a pending change
///
/// Executes a previously scheduled change after the timelock has expired.
/// Can only be called after the execute_at timestamp has passed.
///
/// # Arguments
/// * `env` - The contract environment
/// * `change_id` - ID of the pending change to execute
///
/// # Errors
/// * `Error::TokenNotFound` - Change ID not found
/// * `Error::TimelockNotExpired` - Timelock period has not elapsed
/// * `Error::ChangeAlreadyExecuted` - Change has already been executed
pub fn execute_change(env: &Env, change_id: u64) -> Result<(), Error> {
    let mut pending_change = storage::get_pending_change(env, change_id)
        .ok_or(Error::TokenNotFound)?;
    
    if pending_change.executed {
        return Err(Error::ChangeAlreadyExecuted);
    }
    
    let current_time = env.ledger().timestamp();
    if current_time < pending_change.execute_at {
        return Err(Error::TimelockNotExpired);
    }
    
    // Execute the change based on type
    match pending_change.change_type {
        ChangeType::FeeUpdate => {
            if let Some(fee) = pending_change.base_fee {
                storage::set_base_fee(env, fee);
            }
            if let Some(fee) = pending_change.metadata_fee {
                storage::set_metadata_fee(env, fee);
            }
            
            let new_base = pending_change.base_fee.unwrap_or_else(|| storage::get_base_fee(env));
            let new_metadata = pending_change.metadata_fee.unwrap_or_else(|| storage::get_metadata_fee(env));
            events::emit_fees_updated(env, new_base, new_metadata);
        }
        ChangeType::PauseUpdate => {
            if let Some(paused) = pending_change.paused {
                storage::set_paused(env, paused);
                if paused {
                    events::emit_pause(env, &pending_change.scheduled_by);
                } else {
                    events::emit_unpause(env, &pending_change.scheduled_by);
                }
            }
        }
        ChangeType::TreasuryUpdate => {
            if let Some(ref treasury) = pending_change.treasury {
                storage::set_treasury(env, treasury);
                events::emit_treasury_updated(env, treasury);
            }
        }
    }
    
    // Mark as executed
    pending_change.executed = true;
    storage::set_pending_change(env, change_id, &pending_change);
    
    events::emit_change_executed(env, change_id, pending_change.change_type);
    
    Ok(())
}

/// Cancel a pending change
///
/// Cancels a scheduled change before it is executed.
/// Only the admin who scheduled it can cancel.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Admin address (must authorize)
/// * `change_id` - ID of the pending change to cancel
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the admin
/// * `Error::TokenNotFound` - Change ID not found
/// * `Error::ChangeAlreadyExecuted` - Change has already been executed
pub fn cancel_change(env: &Env, admin: &Address, change_id: u64) -> Result<(), Error> {
    admin.require_auth();
    
    let current_admin = storage::get_admin(env);
    if *admin != current_admin {
        return Err(Error::Unauthorized);
    }
    
    let pending_change = storage::get_pending_change(env, change_id)
        .ok_or(Error::TokenNotFound)?;
    
    if pending_change.executed {
        return Err(Error::ChangeAlreadyExecuted);
    }
    
    storage::remove_pending_change(env, change_id);
    events::emit_change_cancelled(env, change_id, pending_change.change_type);
    
    Ok(())
}

/// Get pending change details
///
/// Retrieves information about a scheduled change.
///
/// # Arguments
/// * `env` - The contract environment
/// * `change_id` - ID of the pending change
///
/// # Returns
/// Returns the PendingChange if found
pub fn get_pending_change(env: &Env, change_id: u64) -> Option<PendingChange> {
    storage::get_pending_change(env, change_id)
}

/// Get timelock configuration
///
/// Returns the current timelock settings.
///
/// # Arguments
/// * `env` - The contract environment
///
/// # Returns
/// Returns the TimelockConfig
pub fn get_timelock_config(env: &Env) -> TimelockConfig {
    storage::get_timelock_config(env)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};
    use soroban_sdk::testutils::Ledger;
    
    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        
        let admin = Address::generate(&env);
        storage::set_admin(&env, &admin);
        storage::set_treasury(&env, &Address::generate(&env));
        storage::set_base_fee(&env, 1_000_000);
        storage::set_metadata_fee(&env, 500_000);
        
        initialize_timelock(&env, Some(3600)).unwrap(); // 1 hour
        
        (env, admin)
    }
    
    #[test]
    fn test_schedule_fee_update() {
        let (env, admin) = setup();
        
        let change_id = schedule_fee_update(&env, &admin, Some(2_000_000), None).unwrap();
        
        let pending = get_pending_change(&env, change_id).unwrap();
        assert_eq!(pending.base_fee, Some(2_000_000));
        assert!(!pending.executed);
    }
    
    #[test]
    fn test_execute_change_before_timelock_fails() {
        let (env, admin) = setup();
        
        let change_id = schedule_fee_update(&env, &admin, Some(2_000_000), None).unwrap();
        
        let result = execute_change(&env, change_id);
        assert_eq!(result, Err(Error::TimelockNotExpired));
    }
    
    #[test]
    fn test_execute_change_after_timelock_succeeds() {
        let (env, admin) = setup();
        
        let change_id = schedule_fee_update(&env, &admin, Some(2_000_000), None).unwrap();
        
        // Advance time by 1 hour + 1 second
        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 3601;
        });
        
        execute_change(&env, change_id).unwrap();
        
        assert_eq!(storage::get_base_fee(&env), 2_000_000);
        
        let pending = get_pending_change(&env, change_id).unwrap();
        assert!(pending.executed);
    }
    
    #[test]
    fn test_cancel_pending_change() {
        let (env, admin) = setup();
        
        let change_id = schedule_fee_update(&env, &admin, Some(2_000_000), None).unwrap();
        
        cancel_change(&env, &admin, change_id).unwrap();
        
        assert!(get_pending_change(&env, change_id).is_none());
    }
}
