use crate::{storage, types::Error};
use soroban_sdk::{symbol_short, Address, Env};

/// Freeze an address for a specific token
///
/// Prevents the frozen address from participating in transfers, burns, or mints.
/// Only the token creator can freeze addresses, and freeze must be enabled for the token.
///
/// Implements #317
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_address` - The token contract address
/// * `admin` - The token admin address (must be token creator)
/// * `address_to_freeze` - The address to freeze
///
/// # Security
/// - Requires admin authorization
/// - Verifies admin is the token creator
/// - Checks freeze is enabled for the token
/// - Prevents freezing already frozen addresses
///
/// # Errors
/// * `ContractPaused` - If contract is paused
/// * `Unauthorized` - If caller is not the token creator
/// * `TokenNotFound` - If token doesn't exist
/// * `FreezeNotEnabled` - If freeze is not enabled for this token
/// * `AddressFrozen` - If address is already frozen
pub fn freeze_address(
    env: &Env,
    token_address: &Address,
    admin: &Address,
    address_to_freeze: &Address,
) -> Result<(), Error> {
    // Check if contract is paused
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    // Require admin authorization
    admin.require_auth();

    // Verify token exists and get info
    let token_info =
        storage::get_token_info_by_address(env, token_address).ok_or(Error::TokenNotFound)?;

    // Verify admin is the token creator
    if token_info.creator != *admin {
        return Err(Error::Unauthorized);
    }

    // Verify freeze is enabled for this token
    if !token_info.freeze_enabled {
        return Err(Error::Unauthorized);
    }

    // Check if address is already frozen
    if storage::is_address_frozen(env, token_address, address_to_freeze) {
        return Err(Error::InvalidParameters);
    }

    // Freeze the address
    storage::set_address_frozen(env, token_address, address_to_freeze, true);

    // Emit freeze event
    env.events().publish(
        (symbol_short!("freeze"), token_address.clone()),
        (
            admin.clone(),
            address_to_freeze.clone(),
            env.ledger().timestamp(),
        ),
    );

    Ok(())
}

/// Unfreeze an address for a specific token
///
/// Restores normal functionality for a previously frozen address.
/// Only the token creator can unfreeze addresses.
///
/// Implements #317
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_address` - The token contract address
/// * `admin` - The token admin address (must be token creator)
/// * `address_to_unfreeze` - The address to unfreeze
///
/// # Security
/// - Requires admin authorization
/// - Verifies admin is the token creator
/// - Checks freeze is enabled for the token
/// - Prevents unfreezing non-frozen addresses
///
/// # Errors
/// * `ContractPaused` - If contract is paused
/// * `Unauthorized` - If caller is not the token creator
/// * `TokenNotFound` - If token doesn't exist
/// * `FreezeNotEnabled` - If freeze is not enabled for this token
/// * `AddressNotFrozen` - If address is not frozen
pub fn unfreeze_address(
    env: &Env,
    token_address: &Address,
    admin: &Address,
    address_to_unfreeze: &Address,
) -> Result<(), Error> {
    // Check if contract is paused
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    // Require admin authorization
    admin.require_auth();

    // Verify token exists and get info
    let token_info =
        storage::get_token_info_by_address(env, token_address).ok_or(Error::TokenNotFound)?;

    // Verify admin is the token creator
    if token_info.creator != *admin {
        return Err(Error::Unauthorized);
    }

    // Verify freeze is enabled for this token
    if !token_info.freeze_enabled {
        return Err(Error::Unauthorized);
    }

    // Check if address is actually frozen
    if !storage::is_address_frozen(env, token_address, address_to_unfreeze) {
        return Err(Error::InvalidParameters);
    }

    // Unfreeze the address
    storage::set_address_frozen(env, token_address, address_to_unfreeze, false);

    // Emit unfreeze event
    env.events().publish(
        (symbol_short!("unfreeze"), token_address.clone()),
        (
            admin.clone(),
            address_to_unfreeze.clone(),
            env.ledger().timestamp(),
        ),
    );

    Ok(())
}

/// Check if an address is frozen for a specific token
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_address` - The token contract address
/// * `address` - The address to check
///
/// # Returns
/// `true` if the address is frozen, `false` otherwise
pub fn is_frozen(env: &Env, token_address: &Address, address: &Address) -> bool {
    storage::is_address_frozen(env, token_address, address)
}

/// Toggle freeze capability for a token (creator only)
///
/// Allows token creator to enable or disable freeze functionality.
/// Once disabled, it can be re-enabled by the creator.
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_address` - The token contract address
/// * `admin` - The token admin address (must be token creator)
/// * `enabled` - Whether to enable or disable freeze
///
/// # Errors
/// * `ContractPaused` - If contract is paused
/// * `Unauthorized` - If caller is not the token creator
/// * `TokenNotFound` - If token doesn't exist
pub fn set_freeze_enabled(
    env: &Env,
    token_address: &Address,
    admin: &Address,
    enabled: bool,
) -> Result<(), Error> {
    // Check if contract is paused
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    // Require admin authorization
    admin.require_auth();

    // Get token info
    let mut token_info =
        storage::get_token_info_by_address(env, token_address).ok_or(Error::TokenNotFound)?;

    // Verify admin is the token creator
    if token_info.creator != *admin {
        return Err(Error::Unauthorized);
    }

    // Update freeze setting
    token_info.freeze_enabled = enabled;
    storage::set_token_info_by_address(env, token_address, &token_info);

    // Emit event
    env.events().publish(
        (symbol_short!("frz_set"), token_address.clone()),
        (admin.clone(), enabled, env.ledger().timestamp()),
    );

    Ok(())
}
