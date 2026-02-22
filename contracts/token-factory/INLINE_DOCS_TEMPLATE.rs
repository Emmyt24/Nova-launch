// Inline Documentation Templates for Burn Functions
// Add these to contracts/token-factory/src/lib.rs when implementing burn functionality

/// Burns tokens from the specified address, permanently removing them from circulation.
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_address` - Address of the token to burn from
/// * `from` - Address of the token holder
/// * `amount` - Amount of tokens to burn (must be > 0 and <= balance)
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(Error)` on failure
///
/// # Errors
/// * `InvalidBurnAmount` - If amount is <= 0
/// * `BurnAmountExceedsBalance` - If amount > balance
/// * `Unauthorized` - If caller is not authorized
/// * `TokenNotFound` - If token doesn't exist
///
/// # Events
/// Emits a `TokenBurned` event on success
///
/// # Example
/// ```rust
/// factory.burn(&token_addr, &user_addr, &1000_0000000)?;
/// ```
pub fn burn(
    env: Env,
    token_address: Address,
    from: Address,
    amount: i128,
) -> Result<(), Error> {
    // Implementation here
}

/// Burns tokens from any address as admin (clawback functionality).
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_address` - Address of the token to burn from
/// * `admin` - Address of the token admin (must be token creator)
/// * `from` - Address to burn tokens from
/// * `amount` - Amount of tokens to burn
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(Error)` on failure
///
/// # Errors
/// * `InvalidBurnAmount` - If amount is <= 0
/// * `BurnAmountExceedsBalance` - If amount > balance
/// * `Unauthorized` - If caller is not the token admin
/// * `TokenNotFound` - If token doesn't exist
///
/// # Security
/// Only the token creator can perform admin burns. This is a powerful
/// operation that should be used responsibly.
///
/// # Events
/// Emits a `TokenBurned` event with `is_admin_burn: true`
///
/// # Example
/// ```rust
/// factory.admin_burn(&token_addr, &admin_addr, &user_addr, &500_0000000)?;
/// ```
pub fn admin_burn(
    env: Env,
    token_address: Address,
    admin: Address,
    from: Address,
    amount: i128,
) -> Result<(), Error> {
    // Implementation here
}

/// Burns tokens from multiple addresses in a single transaction.
///
/// # Arguments
/// * `env` - The contract environment
/// * `token_address` - Address of the token to burn from
/// * `burns` - Vector of (address, amount) tuples to burn
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(Error)` on failure
///
/// # Errors
/// * `InvalidBurnAmount` - If any amount is <= 0
/// * `BurnAmountExceedsBalance` - If any amount > balance
/// * `Unauthorized` - If caller not authorized for any address
/// * `TokenNotFound` - If token doesn't exist
///
/// # Gas Optimization
/// More efficient than multiple individual burn calls. Recommended for
/// burning from 2+ addresses.
///
/// # Events
/// Emits a `TokenBurned` event for each successful burn
///
/// # Example
/// ```rust
/// let burns = vec![
///     &env,
///     (user1_addr.clone(), 100_0000000),
///     (user2_addr.clone(), 200_0000000),
/// ];
/// factory.burn_batch(&token_addr, &burns)?;
/// ```
pub fn burn_batch(
    env: Env,
    token_address: Address,
    burns: Vec<(Address, i128)>,
) -> Result<(), Error> {
    // Implementation here
}
