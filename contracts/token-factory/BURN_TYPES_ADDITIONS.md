# Type Additions for Burn Feature

This document outlines the additions needed to `types.rs` to support the burn functionality.

## Error Codes to Add

Add these error variants to the `Error` enum in `src/types.rs`:

```rust
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    InsufficientFee = 1,
    Unauthorized = 2,
    InvalidParameters = 3,
    TokenNotFound = 4,
    MetadataAlreadySet = 5,
    AlreadyInitialized = 6,
    // Add these new error codes:
    BurnAmountExceedsBalance = 7,
    BurnNotEnabled = 8,
    InvalidBurnAmount = 9,
}
```

## Event Structure to Add

Add this event structure to `src/types.rs`:

```rust
/// Event emitted when tokens are burned
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenBurned {
    /// Address of the token contract
    pub token_address: Address,
    /// Address tokens were burned from
    pub from: Address,
    /// Amount of tokens burned
    pub amount: i128,
    /// Address that initiated the burn
    pub burned_by: Address,
    /// Unix timestamp of the burn
    pub timestamp: u64,
    /// Whether this was an admin burn
    pub is_admin_burn: bool,
}
```

## Error Code Documentation

### BurnAmountExceedsBalance (Code 7)

**Description**: The amount of tokens to burn exceeds the balance of the address.

**When it occurs**:
- User attempts to burn more tokens than they own
- Admin attempts to burn more tokens than exist in target address

**Resolution**:
- Check balance before burning: `token_client.balance(&from)`
- Ensure burn amount <= balance

**Example**:
```rust
let balance = token_client.balance(&from);
if amount > balance {
    return Err(Error::BurnAmountExceedsBalance);
}
```

### BurnNotEnabled (Code 8)

**Description**: Burn functionality is not enabled for this token.

**When it occurs**:
- Token was deployed with burn functionality disabled
- Feature flag is not set

**Resolution**:
- Enable burn in token configuration
- Deploy new token with burn enabled

**Note**: This error is reserved for future use if burn becomes an optional feature.

### InvalidBurnAmount (Code 9)

**Description**: The burn amount is zero or negative.

**When it occurs**:
- User provides amount <= 0
- Invalid input validation

**Resolution**:
- Validate amount > 0 before calling burn
- Use positive integers only

**Example**:
```rust
if amount <= 0 {
    return Err(Error::InvalidBurnAmount);
}
```

## Event Usage Examples

### Emitting TokenBurned Event

```rust
use soroban_sdk::symbol_short;

// For regular user burn
env.events().publish(
    (symbol_short!("burned"), token_address.clone()),
    TokenBurned {
        token_address: token_address.clone(),
        from: from.clone(),
        amount,
        burned_by: from.clone(),
        timestamp: env.ledger().timestamp(),
        is_admin_burn: false,
    }
);

// For admin burn
env.events().publish(
    (symbol_short!("burned"), token_address.clone()),
    TokenBurned {
        token_address: token_address.clone(),
        from: from.clone(),
        amount,
        burned_by: admin.clone(),
        timestamp: env.ledger().timestamp(),
        is_admin_burn: true,
    }
);
```

### Listening for TokenBurned Events (Frontend)

```typescript
// Subscribe to burn events
const subscription = stellarServer
  .events()
  .forContract(contractId)
  .cursor('now')
  .stream({
    onmessage: (event) => {
      if (event.topic.includes('burned')) {
        const burnData = parseBurnEvent(event);
        console.log('Tokens burned:', burnData);
        // Update UI
      }
    },
  });
```

## Complete types.rs After Additions

```rust
use soroban_sdk::{contracterror, contracttype, Address, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryState {
    pub admin: Address,
    pub treasury: Address,
    pub base_fee: i128,
    pub metadata_fee: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInfo {
    pub address: Address,
    pub creator: Address,
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub total_supply: i128,
    pub metadata_uri: Option<String>,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    BaseFee,
    MetadataFee,
    TokenCount,
    Token(u32), // Token index -> TokenInfo
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    InsufficientFee = 1,
    Unauthorized = 2,
    InvalidParameters = 3,
    TokenNotFound = 4,
    MetadataAlreadySet = 5,
    AlreadyInitialized = 6,
    BurnAmountExceedsBalance = 7,
    BurnNotEnabled = 8,
    InvalidBurnAmount = 9,
}

/// Event emitted when tokens are burned
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenBurned {
    pub token_address: Address,
    pub from: Address,
    pub amount: i128,
    pub burned_by: Address,
    pub timestamp: u64,
    pub is_admin_burn: bool,
}
```

## Testing Error Codes

```rust
#[test]
fn test_invalid_burn_amount() {
    let env = Env::default();
    let factory = create_factory(&env);
    let token = create_test_token(&env, &factory);
    
    // Test zero amount
    let result = factory.burn(&token, &user, &0);
    assert_eq!(result, Err(Error::InvalidBurnAmount));
    
    // Test negative amount
    let result = factory.burn(&token, &user, &-100);
    assert_eq!(result, Err(Error::InvalidBurnAmount));
}

#[test]
fn test_burn_exceeds_balance() {
    let env = Env::default();
    let factory = create_factory(&env);
    let token = create_test_token(&env, &factory);
    
    let balance = token_client.balance(&user);
    let result = factory.burn(&token, &user, &(balance + 1));
    assert_eq!(result, Err(Error::BurnAmountExceedsBalance));
}

#[test]
fn test_token_burned_event() {
    let env = Env::default();
    let factory = create_factory(&env);
    let token = create_test_token(&env, &factory);
    
    factory.burn(&token, &user, &1000).unwrap();
    
    // Verify event was emitted
    let events = env.events().all();
    assert!(events.iter().any(|e| {
        e.topics.contains(&symbol_short!("burned"))
    }));
}
```

## Migration Checklist

When implementing burn functionality:

- [ ] Add new error codes to `Error` enum
- [ ] Add `TokenBurned` event structure
- [ ] Update error handling in contract functions
- [ ] Emit events in burn functions
- [ ] Add unit tests for new error codes
- [ ] Add integration tests for events
- [ ] Update frontend to handle new errors
- [ ] Update frontend to listen for burn events
- [ ] Update API documentation
- [ ] Update user documentation

---

**Last Updated**: February 22, 2026
