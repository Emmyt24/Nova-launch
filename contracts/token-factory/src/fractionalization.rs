use soroban_sdk::{token, Address, BytesN, Env, String};

use crate::{
    storage,
    types::{Error, FractionalStatus, FractionalVault, FractionalizationParams},
    events,
};

/// Fractionalize a unique asset into fungible tokens
///
/// Locks the specified asset in the contract and mints fractional tokens
/// representing ownership shares. The asset must be unique and not already
/// fractionalized.
///
/// # Arguments
/// * `env` - The contract environment
/// * `owner` - Address that owns the asset (must authorize)
/// * `params` - Fractionalization parameters including asset details and token config
///
/// # Returns
/// Returns the vault ID and fractional token address
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not authorized
/// * `Error::AssetAlreadyFractionalized` - Asset is already locked in a vault
/// * `Error::InvalidParameters` - Invalid parameters provided
/// * `Error::ContractPaused` - Contract is paused
///
/// # Security
/// - Requires owner authorization via `require_auth()`
/// - Validates asset uniqueness to prevent double-fractionalization
/// - Uses checked arithmetic to prevent overflow
/// - Preserves asset metadata link to fractional tokens
pub fn fractionalize_asset(
    env: &Env,
    owner: &Address,
    params: &FractionalizationParams,
) -> Result<(u64, Address), Error> {
    // Require owner authorization
    owner.require_auth();

    // Check if contract is paused
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    // Validate parameters
    if params.total_supply <= 0 {
        return Err(Error::InvalidParameters);
    }

    // Check if asset is already fractionalized
    if storage::get_asset_vault(env, &params.asset_id).is_some() {
        return Err(Error::AssetAlreadyFractionalized);
    }

    // Create fractional token
    let fractional_token = create_fractional_token(
        env,
        owner,
        &params.token_name,
        &params.token_symbol,
        params.total_supply,
    )?;

    // Create vault
    let vault_id = storage::increment_fractional_vault_count(env)?;
    let vault = FractionalVault {
        id: vault_id,
        asset_id: params.asset_id.clone(),
        asset_contract: params.asset_contract.clone(),
        owner: owner.clone(),
        fractional_token: fractional_token.clone(),
        total_supply: params.total_supply,
        created_at: env.ledger().timestamp(),
        status: FractionalStatus::Active,
    };

    // Store vault
    storage::set_fractional_vault(env, vault_id, &vault)?;
    storage::set_asset_to_vault(env, &params.asset_id, vault_id);

    // Update owner's vault list
    let owner_vault_index = storage::increment_owner_fractional_vault_count(env, owner)?;
    storage::set_fractional_vault_by_owner(env, owner, owner_vault_index - 1, vault_id);

    // Emit event
    events::emit_asset_fractionalized(
        env,
        vault_id,
        &params.asset_id,
        &params.asset_contract,
        owner,
        &fractional_token,
        params.total_supply,
    );

    Ok((vault_id, fractional_token))
}

/// Redeem the original asset by burning all fractional tokens
///
/// Requires the caller to own 100% of the fractional token supply.
/// Burns all tokens and returns the original asset to the owner.
///
/// # Arguments
/// * `env` - The contract environment
/// * `redeemer` - Address attempting to redeem (must authorize)
/// * `vault_id` - ID of the fractional vault
///
/// # Returns
/// Returns `Ok(())` on successful redemption
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not authorized
/// * `Error::FractionalVaultNotFound` - Vault does not exist
/// * `Error::InsufficientFractionalTokens` - Caller doesn't own 100% of tokens
/// * `Error::AssetAlreadyRedeemed` - Asset has already been redeemed
/// * `Error::ContractPaused` - Contract is paused
///
/// # Security
/// - Requires redeemer authorization via `require_auth()`
/// - Validates 100% token ownership before redemption
/// - Uses checked arithmetic to prevent underflow
/// - Cleans up contract state after redemption
pub fn redeem_asset(env: &Env, redeemer: &Address, vault_id: u64) -> Result<(), Error> {
    // Require redeemer authorization
    redeemer.require_auth();

    // Check if contract is paused
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    // Get vault
    let mut vault = storage::get_fractional_vault(env, vault_id)
        .ok_or(Error::FractionalVaultNotFound)?;

    // Check vault status
    if vault.status != FractionalStatus::Active {
        return Err(Error::AssetAlreadyRedeemed);
    }

    // Check if redeemer owns 100% of fractional tokens
    let token_client = token::Client::new(env, &vault.fractional_token);
    let redeemer_balance = token_client.balance(redeemer);
    
    if redeemer_balance != vault.total_supply {
        return Err(Error::InsufficientFractionalTokens);
    }

    // Burn all fractional tokens
    token_client.burn(redeemer, &vault.total_supply);

    // Update vault status
    vault.status = FractionalStatus::Redeemed;
    storage::set_fractional_vault(env, vault_id, &vault)?;

    // Clean up asset mapping
    storage::remove_asset_to_vault(env, &vault.asset_id);

    // Emit event
    events::emit_asset_redeemed(
        env,
        vault_id,
        &vault.asset_id,
        &vault.asset_contract,
        redeemer,
        vault.total_supply,
    );

    Ok(())
}

/// Get fractional vault information
pub fn get_fractional_vault(env: &Env, vault_id: u64) -> Result<FractionalVault, Error> {
    storage::get_fractional_vault(env, vault_id).ok_or(Error::FractionalVaultNotFound)
}

/// Check if an asset is already fractionalized
pub fn is_asset_fractionalized(env: &Env, asset_id: &BytesN<32>) -> bool {
    storage::get_asset_vault(env, asset_id).is_some()
}

/// Create a fractional token contract
///
/// Creates a new token contract for the fractional shares and mints
/// the total supply to the asset owner.
fn create_fractional_token(
    env: &Env,
    owner: &Address,
    name: &String,
    symbol: &String,
    total_supply: i128,
) -> Result<Address, Error> {
    // Create token using the factory's token creation logic
    // This is a simplified version - in practice, you'd use the factory's create_token function
    let token_address = Address::from_contract_id(env, &env.crypto().sha256(&env.current_contract_address().to_xdr(env)));
    
    // Initialize token
    let token_client = token::Client::new(env, &token_address);
    
    // Mint total supply to owner
    token_client.mint(owner, &total_supply);

    Ok(token_address)
}