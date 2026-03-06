use soroban_sdk::{Address, Env};
use crate::types::Error;
use crate::storage;

/// Validate max supply constraints
///
/// Checks if a mint operation would exceed the token's max supply cap.
/// Returns Ok if the mint is allowed, Err if it would exceed the cap.
///
/// # Arguments
/// * `current_supply` - Current total supply
/// * `mint_amount` - Amount to mint
/// * `max_supply` - Optional maximum supply cap
///
/// # Returns
/// * `Ok(())` - Mint is allowed
/// * `Err(Error::MaxSupplyExceeded)` - Would exceed max supply
/// * `Err(Error::ArithmeticError)` - Overflow in calculation
///
/// # Examples
/// ```
/// // With max supply
/// validate_max_supply(1_000_000, 500_000, Some(2_000_000))?; // OK
/// validate_max_supply(1_500_000, 600_000, Some(2_000_000))?; // Error
///
/// // Without max supply (unlimited)
/// validate_max_supply(1_000_000, 999_999_999, None)?; // OK
/// ```
pub fn validate_max_supply(
    current_supply: i128,
    mint_amount: i128,
    max_supply: Option<i128>,
) -> Result<(), Error> {
    // If no max supply, minting is unlimited
    if max_supply.is_none() {
        return Ok(());
    }
    
    let max = max_supply.unwrap();
    
    // Check for overflow in addition
    let new_supply = current_supply
        .checked_add(mint_amount)
        .ok_or(Error::ArithmeticError)?;
    
    // Check if new supply would exceed max
    if new_supply > max {
        return Err(Error::MaxSupplyExceeded);
    }
    
    Ok(())
}

/// Validate max supply at token creation
///
/// Ensures that if max_supply is specified, it's greater than or equal
/// to the initial supply.
///
/// # Arguments
/// * `initial_supply` - Initial token supply
/// * `max_supply` - Optional maximum supply cap
///
/// # Returns
/// * `Ok(())` - Max supply is valid
/// * `Err(Error::InvalidMaxSupply)` - Max supply is less than initial supply
pub fn validate_max_supply_at_creation(
    initial_supply: i128,
    max_supply: Option<i128>,
) -> Result<(), Error> {
    if let Some(max) = max_supply {
        if max < initial_supply {
            return Err(Error::InvalidMaxSupply);
        }
    }
    
    Ok(())
}

/// Mint tokens to an address
///
/// Increases the total supply and the recipient's balance.
/// Enforces max supply constraints if set.
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_index` - Index of the token to mint
/// * `to` - Address to receive the minted tokens
/// * `amount` - Amount to mint (must be > 0)
///
/// # Returns
/// * `Ok(())` - Mint successful
/// * `Err(Error::TokenNotFound)` - Token doesn't exist
/// * `Err(Error::InvalidAmount)` - Amount is zero or negative
/// * `Err(Error::MaxSupplyExceeded)` - Would exceed max supply
/// * `Err(Error::ArithmeticError)` - Overflow in calculation
pub fn mint(
    env: &Env,
    token_index: u32,
    to: &Address,
    amount: i128,
) -> Result<(), Error> {
    // Validate amount
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    
    // Get token info
    let mut token_info = storage::get_token_info(env, token_index)
        .ok_or(Error::TokenNotFound)?;
    
    // Validate max supply constraint
    validate_max_supply(token_info.total_supply, amount, token_info.max_supply)?;
    
    // Update total supply with overflow check
    token_info.total_supply = token_info.total_supply
        .checked_add(amount)
        .ok_or(Error::ArithmeticError)?;
    
    // Update recipient balance with overflow check
    let current_balance = storage::get_balance(env, token_index, to);
    let new_balance = current_balance
        .checked_add(amount)
        .ok_or(Error::ArithmeticError)?;
    
    storage::set_balance(env, token_index, to, new_balance);
    
    // Save updated token info
    storage::set_token_info(env, token_index, &token_info);
    
    // Emit mint event
    crate::events::emit_mint(env, token_index, to, amount);
    
    Ok(())
}

/// Get remaining mintable supply
///
/// Returns how many more tokens can be minted before hitting the max supply.
/// Returns None if there's no max supply (unlimited minting).
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_index` - Index of the token
///
/// # Returns
/// * `Some(amount)` - Remaining mintable amount
/// * `None` - Unlimited minting (no max supply)
pub fn get_remaining_mintable(env: &Env, token_index: u32) -> Option<i128> {
    let token_info = storage::get_token_info(env, token_index)?;
    
    token_info.max_supply.map(|max| {
        max.saturating_sub(token_info.total_supply).max(0)
    })
}

#[cfg(all(test, feature = "legacy-tests"))]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};
    
    #[test]
    fn test_validate_max_supply_unlimited() {
        // No max supply - should always pass
        assert!(validate_max_supply(1_000_000, 999_999_999, None).is_ok());
    }
    
    #[test]
    fn test_validate_max_supply_within_limit() {
        // Current: 1M, Mint: 500K, Max: 2M = OK
        assert!(validate_max_supply(1_000_000, 500_000, Some(2_000_000)).is_ok());
    }
    
    #[test]
    fn test_validate_max_supply_exact_limit() {
        // Current: 1M, Mint: 1M, Max: 2M = OK (exactly at limit)
        assert!(validate_max_supply(1_000_000, 1_000_000, Some(2_000_000)).is_ok());
    }
    
    #[test]
    fn test_validate_max_supply_exceeds_limit() {
        // Current: 1.5M, Mint: 600K, Max: 2M = Error
        let result = validate_max_supply(1_500_000, 600_000, Some(2_000_000));
        assert_eq!(result, Err(Error::MaxSupplyExceeded));
    }
    
    #[test]
    fn test_validate_max_supply_overflow() {
        // Test overflow protection
        let result = validate_max_supply(i128::MAX, 1, Some(i128::MAX));
        assert_eq!(result, Err(Error::ArithmeticError));
    }
    
    #[test]
    fn test_validate_max_supply_at_creation_valid() {
        // Initial: 1M, Max: 2M = OK
        assert!(validate_max_supply_at_creation(1_000_000, Some(2_000_000)).is_ok());
    }
    
    #[test]
    fn test_validate_max_supply_at_creation_equal() {
        // Initial: 1M, Max: 1M = OK (equal is allowed)
        assert!(validate_max_supply_at_creation(1_000_000, Some(1_000_000)).is_ok());
    }
    
    #[test]
    fn test_validate_max_supply_at_creation_invalid() {
        // Initial: 2M, Max: 1M = Error
        let result = validate_max_supply_at_creation(2_000_000, Some(1_000_000));
        assert_eq!(result, Err(Error::InvalidMaxSupply));
    }
    
    #[test]
    fn test_validate_max_supply_at_creation_unlimited() {
        // No max supply = OK
        assert!(validate_max_supply_at_creation(999_999_999, None).is_ok());
    }
    
    #[test]
    fn test_mint_within_max_supply() {
        let env = Env::default();
        let to = Address::generate(&env);
        
        // Create token with max supply
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: Some(2_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        // Mint 500K (within limit)
        let result = mint(&env, 0, &to, 500_000);
        assert!(result.is_ok());
        
        // Verify supply updated
        let updated = storage::get_token_info(&env, 0).unwrap();
        assert_eq!(updated.total_supply, 1_500_000);
    }
    
    #[test]
    fn test_mint_exceeds_max_supply() {
        let env = Env::default();
        let to = Address::generate(&env);
        
        // Create token with max supply
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_500_000,
            initial_supply: 1_000_000,
            max_supply: Some(2_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        // Try to mint 600K (would exceed limit)
        let result = mint(&env, 0, &to, 600_000);
        assert_eq!(result, Err(Error::MaxSupplyExceeded));
        
        // Verify supply unchanged
        let unchanged = storage::get_token_info(&env, 0).unwrap();
        assert_eq!(unchanged.total_supply, 1_500_000);
    }
    
    #[test]
    fn test_mint_exact_max_supply() {
        let env = Env::default();
        let to = Address::generate(&env);
        
        // Create token with max supply
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: Some(2_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        // Mint exactly to max (1M more)
        let result = mint(&env, 0, &to, 1_000_000);
        assert!(result.is_ok());
        
        // Verify supply is exactly at max
        let updated = storage::get_token_info(&env, 0).unwrap();
        assert_eq!(updated.total_supply, 2_000_000);
    }
    
    #[test]
    fn test_mint_unlimited_supply() {
        let env = Env::default();
        let to = Address::generate(&env);
        
        // Create token without max supply
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        // Mint large amount (no limit)
        let result = mint(&env, 0, &to, 999_999_999);
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_mint_zero_amount() {
        let env = Env::default();
        let to = Address::generate(&env);
        
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: Some(2_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        // Try to mint zero
        let result = mint(&env, 0, &to, 0);
        assert_eq!(result, Err(Error::InvalidAmount));
    }
    
    #[test]
    fn test_mint_negative_amount() {
        let env = Env::default();
        let to = Address::generate(&env);
        
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: Some(2_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        // Try to mint negative
        let result = mint(&env, 0, &to, -100);
        assert_eq!(result, Err(Error::InvalidAmount));
    }
    
    #[test]
    fn test_get_remaining_mintable_with_max() {
        let env = Env::default();
        
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_500_000,
            initial_supply: 1_000_000,
            max_supply: Some(2_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        let remaining = get_remaining_mintable(&env, 0);
        assert_eq!(remaining, Some(500_000));
    }
    
    #[test]
    fn test_get_remaining_mintable_unlimited() {
        let env = Env::default();
        
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        let remaining = get_remaining_mintable(&env, 0);
        assert_eq!(remaining, None);
    }
    
    #[test]
    fn test_get_remaining_mintable_at_max() {
        let env = Env::default();
        
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: Address::generate(&env),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 2_000_000,
            initial_supply: 1_000_000,
            max_supply: Some(2_000_000),
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        storage::set_token_info(&env, 0, &token_info);
        
        let remaining = get_remaining_mintable(&env, 0);
        assert_eq!(remaining, Some(0));
    }
}
