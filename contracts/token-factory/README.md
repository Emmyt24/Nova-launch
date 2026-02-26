# Token Factory Contract

Stellar smart contract for token creation and management with comprehensive state validation.

## Features

- Token creation and management
- Admin and treasury management
- Fee configuration
- Burn functionality with clawback support
- **State validation system** ensuring contract consistency

## State Validation System

The contract includes a comprehensive state validation module that enforces four critical invariants:

### Enforced Invariants

1. **Admin Invariant**: Admin address must be set and valid
   - Ensures administrative operations have proper authorization
   - Validated on initialization and admin transfers

2. **Treasury Invariant**: Treasury address must be set and valid
   - Ensures fees are collected to a valid destination
   - Validated on initialization

3. **Fee Non-Negativity Invariant**: Both base_fee and metadata_fee must be >= 0
   - Prevents the contract from losing funds through negative fees
   - Validated on initialization and fee updates

4. **Token Count Consistency Invariant**: Token count must match actual stored tokens
   - Ensures the token registry remains consistent
   - Validated after token operations

### When Validation Occurs

Validation is automatically called at critical state transition points:

- **Initialization**: Full state validation after setting initial parameters
- **Admin Transfer**: Admin address validation after updating admin
- **Fee Updates**: Fee validation after modifying base_fee or metadata_fee
- **Token Operations**: Token count validation after creating or modifying tokens

### Validation Errors

The validation system returns specific errors for each invariant violation:

| Error | Description | When It Occurs |
|-------|-------------|----------------|
| `MissingAdmin` | Admin address not set | Initialization incomplete |
| `InvalidAdmin` | Admin address is invalid | Address format or value issue |
| `MissingTreasury` | Treasury address not set | Initialization incomplete |
| `InvalidTreasury` | Treasury address is invalid | Address format or value issue |
| `InvalidBaseFee` | Base fee is negative | Invalid fee configuration |
| `InvalidMetadataFee` | Metadata fee is negative | Invalid fee configuration |
| `InvalidTokenCount` | Token count is negative | Storage corruption |
| `InconsistentTokenCount` | Token count doesn't match stored tokens | Registry inconsistency |

### Gas Cost Considerations

The validation system is optimized for minimal gas costs:

- **Fail-Fast Ordering**: Cheap validations (admin, treasury) run before expensive ones (token count)
- **Early Returns**: Validation stops at the first error
- **Conditional Validation**: Token count validation only runs when token storage changes
- **No Redundant Reads**: Each storage value is read once per validation call

**Estimated Gas Costs**:
- Admin validation: ~500 CPU instructions
- Treasury validation: ~500 CPU instructions
- Fee validation: ~1,000 CPU instructions
- Token count validation: ~2,000-10,000 CPU instructions (depends on token count)
- Full state validation: ~4,000-12,000 CPU instructions

### Usage Example

```rust
// Validation is automatic - no manual calls needed
let result = client.initialize(&admin, &treasury, &100, &50);
// If validation fails, the operation is reverted

// Manual validation (for testing or verification)
use crate::validation;
validation::validate_state(&env)?; // Validates all invariants
validation::validate_admin(&env)?; // Validates only admin
validation::validate_fees(&env)?;  // Validates only fees
```

## Testing

The validation system includes comprehensive test coverage:

- **Unit Tests**: Specific examples and edge cases for each validation function
- **Integration Tests**: Validation integration with contract operations
- **Property-Based Tests** (optional): Universal properties across all inputs

Run tests:
```bash
cargo test validation
```

## Development

Build the contract:
```bash
cargo build --target wasm32-unknown-unknown --release
```

Run all tests:
```bash
cargo test
```

## Security

The validation system provides critical security guarantees:

- **Atomicity**: Failed validation reverts all state changes
- **Consistency**: State invariants are maintained at all times
- **Authorization**: Admin and treasury addresses are always valid
- **Financial Security**: Fees can never be negative
