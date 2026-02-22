# Burn Feature Documentation

## Overview

The burn feature allows token holders to permanently remove tokens from circulation. This document provides comprehensive documentation for implementing and using the burn functionality in the Token Factory contract.

## Function Specifications

### 1. `burn` - User Token Burn

Allows token holders to burn their own tokens, permanently removing them from circulation.

#### Signature

```rust
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
) -> Result<(), Error>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `env` | `Env` | Contract environment |
| `token_address` | `Address` | Address of the token contract |
| `from` | `Address` | Address of the token holder burning tokens |
| `amount` | `i128` | Amount of tokens to burn (in smallest unit) |

#### Returns

- `Ok(())` on successful burn
- `Err(Error)` on failure

#### Errors

| Error | Code | Description |
|-------|------|-------------|
| `InvalidBurnAmount` | 9 | Amount is zero or negative |
| `BurnAmountExceedsBalance` | 7 | Insufficient balance to burn |
| `Unauthorized` | 2 | Caller not authorized to burn from this address |
| `TokenNotFound` | 4 | Token doesn't exist in registry |

#### Example Usage

```rust
// Burn 1000 tokens (with 7 decimals)
let result = factory.burn(
    &env,
    &token_address,
    &user_address,
    &1000_0000000  // 1000 tokens with 7 decimals
);

match result {
    Ok(()) => log!(&env, "Tokens burned successfully"),
    Err(e) => log!(&env, "Burn failed: {:?}", e),
}
```

---

### 2. `admin_burn` - Admin Token Burn (Clawback)

Allows token admin to burn tokens from any address. This is a privileged operation that should be used carefully.

#### Signature

```rust
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
) -> Result<(), Error>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `env` | `Env` | Contract environment |
| `token_address` | `Address` | Address of the token contract |
| `admin` | `Address` | Address of the token admin (must be creator) |
| `from` | `Address` | Address to burn tokens from |
| `amount` | `i128` | Amount of tokens to burn |

#### Security Considerations

- **Authorization**: Only the token creator can perform admin burns
- **Audit Trail**: All admin burns are logged with `is_admin_burn: true`
- **Use Cases**: Compliance, fraud prevention, emergency response
- **Transparency**: Consider announcing admin burn capability during token creation

#### Example Usage

```rust
// Admin burns tokens from a user's address
let result = factory.admin_burn(
    &env,
    &token_address,
    &admin_address,
    &user_address,
    &500_0000000  // 500 tokens
);
```

---

### 3. `burn_batch` - Batch Token Burn

Burn tokens from multiple addresses in a single transaction for gas optimization.

#### Signature

```rust
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
) -> Result<(), Error>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `env` | `Env` | Contract environment |
| `token_address` | `Address` | Address of the token contract |
| `burns` | `Vec<(Address, i128)>` | Vector of (address, amount) pairs |

#### Gas Optimization

Batch burning is more efficient than individual burns:
- **Single transaction**: One network call instead of multiple
- **Reduced overhead**: Shared validation and state updates
- **Lower fees**: Amortized transaction costs

#### Example Usage

```rust
use soroban_sdk::vec;

// Burn from multiple addresses
let burns = vec![
    &env,
    (user1_address.clone(), 100_0000000),
    (user2_address.clone(), 200_0000000),
    (user3_address.clone(), 150_0000000),
];

let result = factory.burn_batch(&env, &token_address, &burns);
```

---

## Events

### `TokenBurned` Event

Emitted whenever tokens are burned (user burn, admin burn, or batch burn).

#### Event Data

```rust
pub struct TokenBurned {
    pub token_address: Address,
    pub from: Address,
    pub amount: i128,
    pub burned_by: Address,
    pub timestamp: u64,
    pub is_admin_burn: bool,
}
```

| Field | Type | Description |
|-------|------|-------------|
| `token_address` | `Address` | Address of the token contract |
| `from` | `Address` | Address tokens were burned from |
| `amount` | `i128` | Amount of tokens burned |
| `burned_by` | `Address` | Address that initiated the burn |
| `timestamp` | `u64` | Unix timestamp of the burn |
| `is_admin_burn` | `bool` | Whether this was an admin burn |

#### Event Usage

```rust
// Listen for burn events
env.events().publish(
    (symbol_short!("burned"), token_address.clone()),
    TokenBurned {
        token_address: token_address.clone(),
        from: from.clone(),
        amount,
        burned_by: caller.clone(),
        timestamp: env.ledger().timestamp(),
        is_admin_burn: false,
    }
);
```

---

## Error Codes

### Burn-Related Errors

| Code | Error | Description | Resolution |
|------|-------|-------------|------------|
| 7 | `BurnAmountExceedsBalance` | Burn amount exceeds token balance | Check balance before burning |
| 8 | `BurnNotEnabled` | Burn functionality not enabled | Enable burn in token config |
| 9 | `InvalidBurnAmount` | Burn amount is zero or negative | Use positive amount |

### General Errors

| Code | Error | Description |
|------|-------|-------------|
| 2 | `Unauthorized` | Caller not authorized for action |
| 4 | `TokenNotFound` | Token not found in registry |

---

## Implementation Guidelines

### Validation Checks

1. **Amount Validation**
   ```rust
   if amount <= 0 {
       return Err(Error::InvalidBurnAmount);
   }
   ```

2. **Balance Check**
   ```rust
   let balance = token_client.balance(&from);
   if amount > balance {
       return Err(Error::BurnAmountExceedsBalance);
   }
   ```

3. **Authorization Check**
   ```rust
   from.require_auth();
   ```

4. **Admin Authorization**
   ```rust
   admin.require_auth();
   let token_info = storage::get_token_info(&env, &token_address)?;
   if admin != token_info.creator {
       return Err(Error::Unauthorized);
   }
   ```

### State Updates

1. **Update Token Supply**
   ```rust
   let current_supply = storage::get_total_supply(&env, &token_address);
   storage::set_total_supply(&env, &token_address, current_supply - amount);
   ```

2. **Update Balance**
   ```rust
   token_client.burn(&from, &amount);
   ```

3. **Emit Event**
   ```rust
   env.events().publish(
       (symbol_short!("burned"), token_address.clone()),
       TokenBurned { /* ... */ }
   );
   ```

---

## Security Considerations

### User Burns

- **Authorization**: Users can only burn their own tokens
- **Balance Validation**: Prevents burning more than owned
- **Irreversible**: Burned tokens cannot be recovered
- **Audit Trail**: All burns are logged via events

### Admin Burns

- **Privileged Operation**: Only token creator can admin burn
- **Transparency**: Clearly marked in events with `is_admin_burn: true`
- **Use Cases**: 
  - Regulatory compliance
  - Fraud prevention
  - Emergency response
  - Token recovery
- **Best Practices**:
  - Document admin burn policy
  - Announce capability during token creation
  - Use sparingly and transparently
  - Consider multi-sig for admin operations

### Batch Burns

- **Atomic Operations**: All burns succeed or all fail
- **Gas Limits**: Be mindful of transaction size limits
- **Authorization**: Each address must authorize the burn
- **Validation**: All amounts validated before any burns

---

## Testing Guidelines

### Unit Tests

```rust
#[test]
fn test_burn_success() {
    let env = Env::default();
    let factory = create_factory(&env);
    let token = create_test_token(&env, &factory);
    
    // Burn tokens
    let result = factory.burn(&token, &user, &1000_0000000);
    assert!(result.is_ok());
    
    // Verify balance decreased
    let balance = token_client.balance(&user);
    assert_eq!(balance, initial_balance - 1000_0000000);
}

#[test]
fn test_burn_exceeds_balance() {
    let env = Env::default();
    let factory = create_factory(&env);
    let token = create_test_token(&env, &factory);
    
    let result = factory.burn(&token, &user, &999999_0000000);
    assert_eq!(result, Err(Error::BurnAmountExceedsBalance));
}

#[test]
fn test_admin_burn_unauthorized() {
    let env = Env::default();
    let factory = create_factory(&env);
    let token = create_test_token(&env, &factory);
    
    let result = factory.admin_burn(&token, &non_admin, &user, &100);
    assert_eq!(result, Err(Error::Unauthorized));
}
```

### Property-Based Tests

```rust
#[cfg(test)]
mod proptests {
    use proptest::prelude::*;
    
    proptest! {
        #[test]
        fn burn_reduces_supply(amount in 1i128..1000000) {
            let env = Env::default();
            let factory = create_factory(&env);
            let token = create_test_token(&env, &factory);
            
            let initial_supply = get_total_supply(&token);
            factory.burn(&token, &user, &amount).unwrap();
            let final_supply = get_total_supply(&token);
            
            assert_eq!(final_supply, initial_supply - amount);
        }
    }
}
```

---

## Migration Guide

### For Existing Tokens

If you have existing tokens deployed without burn functionality:

1. **Deploy New Contract**: Deploy updated contract with burn functions
2. **Migrate Tokens**: No automatic migration needed - burn is opt-in
3. **Update Frontend**: Add burn UI components
4. **Communicate**: Inform users about new burn capability

### For New Tokens

All new tokens deployed will have burn functionality enabled by default.

---

## Frontend Integration

### Example React Hook

```typescript
export function useBurnTokens() {
  const [isBurning, setIsBurning] = useState(false);
  
  const burn = async (
    tokenAddress: string,
    amount: string
  ): Promise<void> => {
    setIsBurning(true);
    try {
      const tx = await stellarService.burnTokens(tokenAddress, amount);
      await tx.send();
      toast.success('Tokens burned successfully');
    } catch (error) {
      toast.error('Failed to burn tokens');
      throw error;
    } finally {
      setIsBurning(false);
    }
  };
  
  return { burn, isBurning };
}
```

### Example UI Component

```typescript
function BurnTokensForm({ tokenAddress }: { tokenAddress: string }) {
  const [amount, setAmount] = useState('');
  const { burn, isBurning } = useBurnTokens();
  
  const handleBurn = async () => {
    await burn(tokenAddress, amount);
    setAmount('');
  };
  
  return (
    <div>
      <Input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount to burn"
      />
      <Button onClick={handleBurn} disabled={isBurning}>
        {isBurning ? 'Burning...' : 'Burn Tokens'}
      </Button>
    </div>
  );
}
```

---

## FAQ

### Q: Are burned tokens recoverable?

No, burned tokens are permanently removed from circulation and cannot be recovered.

### Q: Can I burn tokens from another user's address?

No, unless you are the token admin using `admin_burn`. Regular users can only burn their own tokens.

### Q: What happens to the total supply when tokens are burned?

The total supply decreases by the burned amount, permanently reducing the token's circulating supply.

### Q: Is there a fee for burning tokens?

No, burning tokens does not incur platform fees. You only pay standard Stellar network fees.

### Q: Can I burn tokens in batches?

Yes, use the `burn_batch` function for gas-optimized batch burning.

### Q: What's the difference between `burn` and `admin_burn`?

- `burn`: Users burn their own tokens
- `admin_burn`: Token creator can burn tokens from any address (clawback)

### Q: How do I know if a token has burn capability?

All tokens deployed through the updated Token Factory have burn capability enabled.

---

## Additional Resources

- [Stellar Token Standard](https://soroban.stellar.org/docs/reference/interfaces/token-interface)
- [Soroban SDK Documentation](https://docs.rs/soroban-sdk/)
- [Token Factory Contract Source](../contracts/token-factory/src/lib.rs)

---

**Last Updated**: February 22, 2026  
**Version**: 1.0.0
