#![cfg(test)]

use crate::types::Error;

fn mock_load_vault(vault_id: u64, total: u64) -> Result<(), Error> {
    if vault_id >= total {
        return Err(Error::VaultNotFound);
    }
    Ok(())
}

fn mock_unlock_check(unlock_time: u64, now: u64) -> Result<(), Error> {
    if now < unlock_time {
        return Err(Error::VaultLocked);
    }
    Ok(())
}

fn mock_claim_guard(cancelled: bool, already_claimed: bool, remaining: i128) -> Result<(), Error> {
    if cancelled {
        return Err(Error::VaultCancelled);
    }
    if already_claimed {
        return Err(Error::VaultAlreadyClaimed);
    }
    if remaining <= 0 {
        return Err(Error::NothingToClaim);
    }
    Ok(())
}

fn mock_config_validation(total_amount: i128, milestone_hash_present: bool) -> Result<(), Error> {
    if total_amount <= 0 || !milestone_hash_present {
        return Err(Error::InvalidVaultConfig);
    }
    Ok(())
}

#[test]
fn test_vault_error_code_mapping() {
    assert_eq!(Error::VaultNotFound as u32, 60);
    assert_eq!(Error::VaultLocked as u32, 61);
    assert_eq!(Error::VaultAlreadyClaimed as u32, 62);
    assert_eq!(Error::VaultCancelled as u32, 63);
    assert_eq!(Error::InvalidVaultConfig as u32, 64);
    assert_eq!(Error::NothingToClaim as u32, 65);
}

#[test]
fn test_vault_error_paths() {
    assert_eq!(mock_load_vault(5, 2), Err(Error::VaultNotFound));
    assert_eq!(mock_unlock_check(1_000, 500), Err(Error::VaultLocked));
    assert_eq!(mock_claim_guard(false, true, 10), Err(Error::VaultAlreadyClaimed));
    assert_eq!(mock_claim_guard(true, false, 10), Err(Error::VaultCancelled));
    assert_eq!(mock_claim_guard(false, false, 0), Err(Error::NothingToClaim));
    assert_eq!(mock_config_validation(0, true), Err(Error::InvalidVaultConfig));
}

#[test]
fn test_vault_success_path() {
    assert!(mock_load_vault(1, 5).is_ok());
    assert!(mock_unlock_check(500, 1_000).is_ok());
    assert!(mock_claim_guard(false, false, 50).is_ok());
    assert!(mock_config_validation(1_000, true).is_ok());
}
