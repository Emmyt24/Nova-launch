//! Vault Funding Module
//!
//! This module provides controlled funding of vault balances with strict safety checks.

use crate::{
    storage,
    types::{Error, VaultStatus},
};
use soroban_sdk::{symbol_short, Address, Env};

/// Fund a vault with tokens.
///
/// Safety checks:
/// - `funder` must authorize the call
/// - `amount` must be positive
/// - vault must exist and be `Active`
/// - arithmetic must not overflow
pub fn fund_vault(env: &Env, vault_id: u64, funder: &Address, amount: i128) -> Result<(), Error> {
    funder.require_auth();

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    let mut vault = storage::get_vault(env, vault_id).ok_or(Error::TokenNotFound)?;
    if vault.status != VaultStatus::Active {
        return Err(Error::InvalidParameters);
    }

    vault.total_amount = vault
        .total_amount
        .checked_add(amount)
        .ok_or(Error::ArithmeticError)?;

    storage::set_vault(env, &vault)?;
    emit_vault_funded(env, vault_id, funder, amount);

    Ok(())
}

fn emit_vault_funded(env: &Env, vault_id: u64, funder: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("vlt_fd_v1"), vault_id),
        (funder.clone(), amount),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Vault, VaultStatus};
    use soroban_sdk::{
        testutils::{Address as _, Events},
        Address, BytesN, Env, FromVal, Symbol, Val,
    };

    fn seed_vault(env: &Env, vault_id: u64, status: VaultStatus, total_amount: i128) {
        let vault = Vault {
            id: vault_id,
            token: Address::generate(env),
            owner: Address::generate(env),
            creator: Address::generate(env),
            total_amount,
            claimed_amount: 0,
            unlock_time: 0,
            milestone_hash: BytesN::from_array(env, &[0u8; 32]),
            status,
            created_at: 0,
        };

        storage::set_vault(env, &vault).unwrap();
    }

    #[test]
    #[should_panic]
    fn test_fund_vault_requires_authorization() {
        let env = Env::default();
        let vault_id = 1;
        let funder = Address::generate(&env);

        seed_vault(&env, vault_id, VaultStatus::Active, 1_000_000_000);

        let _ = fund_vault(&env, vault_id, &funder, 100);
    }

    #[test]
    fn test_fund_vault_zero_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let vault_id = 1;
        let funder = Address::generate(&env);
        seed_vault(&env, vault_id, VaultStatus::Active, 1_000_000_000);

        let result = fund_vault(&env, vault_id, &funder, 0);
        assert_eq!(result, Err(Error::InvalidAmount));
    }

    #[test]
    fn test_fund_vault_negative_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let vault_id = 1;
        let funder = Address::generate(&env);
        seed_vault(&env, vault_id, VaultStatus::Active, 1_000_000_000);

        let result = fund_vault(&env, vault_id, &funder, -1);
        assert_eq!(result, Err(Error::InvalidAmount));
    }

    #[test]
    fn test_fund_vault_rejects_non_active_status() {
        let env = Env::default();
        env.mock_all_auths();

        let vault_id = 1;
        let funder = Address::generate(&env);
        seed_vault(&env, vault_id, VaultStatus::Claimed, 1_000_000_000);

        let result = fund_vault(&env, vault_id, &funder, 100);
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_fund_vault_overflow_protection() {
        let env = Env::default();
        env.mock_all_auths();

        let vault_id = 1;
        let funder = Address::generate(&env);
        seed_vault(&env, vault_id, VaultStatus::Active, i128::MAX - 10);

        let result = fund_vault(&env, vault_id, &funder, 11);
        assert_eq!(result, Err(Error::ArithmeticError));
    }

    #[test]
    fn test_fund_vault_max_safe_boundary() {
        let env = Env::default();
        env.mock_all_auths();

        let vault_id = 1;
        let funder = Address::generate(&env);
        seed_vault(&env, vault_id, VaultStatus::Active, i128::MAX - 10);

        fund_vault(&env, vault_id, &funder, 10).unwrap();

        let vault = storage::get_vault(&env, vault_id).unwrap();
        assert_eq!(vault.total_amount, i128::MAX);
    }

    #[test]
    fn test_fund_vault_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let vault_id = 1;
        let funder = Address::generate(&env);
        let amount = 42;
        seed_vault(&env, vault_id, VaultStatus::Active, 100);

        let before = env.events().all().len();
        fund_vault(&env, vault_id, &funder, amount).unwrap();
        let events = env.events().all();

        assert_eq!(events.len(), before + 1);

        let (_contract, topics, data) = events.get(events.len() - 1).unwrap();
        let event_name = Symbol::from_val(&env, &topics.get(0).unwrap());
        assert_eq!(event_name, symbol_short!("vlt_fd_v1"));

        let payload = soroban_sdk::Vec::<Val>::from_val(&env, &data);
        let event_funder = Address::from_val(&env, &payload.get(0).unwrap());
        let event_amount = i128::from_val(&env, &payload.get(1).unwrap());

        assert_eq!(event_funder, funder);
        assert_eq!(event_amount, amount);
    }
}
