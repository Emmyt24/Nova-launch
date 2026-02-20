# Property-Based Test Generators

Comprehensive, reusable generators for property-based testing using [fast-check](https://github.com/dubzzz/fast-check).

## Overview

This module provides generators for creating test data that covers edge cases, invalid inputs, and valid scenarios for the Stellar Token Deployer application. All generators are configurable, well-documented, and optimized for performance.

## Available Generators

### Stellar Address Generators

#### `validStellarAddress()`
Generates valid Stellar addresses (G followed by 55 base32 characters).

```typescript
import { validStellarAddress } from './generators';
import * as fc from 'fast-check';

fc.assert(
    fc.property(validStellarAddress(), (address) => {
        expect(address).toHaveLength(56);
        expect(address[0]).toBe('G');
    })
);
```

#### `invalidStellarAddress()`
Generates invalid Stellar addresses with various patterns:
- Too short (< 56 characters)
- Too long (> 56 characters)
- Wrong prefix (not 'G')
- Invalid characters (lowercase, special chars, etc.)
- Empty strings
- Whitespace

```typescript
import { invalidStellarAddress } from './generators';

fc.assert(
    fc.property(invalidStellarAddress(), (address) => {
        expect(isValidStellarAddress(address)).toBe(false);
    })
);
```

#### `invalidStellarAddressWithReason()`
Generates invalid addresses with specific reasons for testing error messages.

```typescript
import { invalidStellarAddressWithReason } from './generators';

fc.assert(
    fc.property(invalidStellarAddressWithReason(), ({ address, reason }) => {
        expect(isValidStellarAddress(address)).toBe(false);
        // Test specific error message based on reason
        switch (reason) {
            case 'too_short':
                expect(address.length).toBeLessThan(56);
                break;
            case 'wrong_prefix':
                expect(address[0]).not.toBe('G');
                break;
            // ... etc
        }
    })
);
```

### Token Parameter Generators

#### `validTokenName()`
Generates valid token names (1-32 alphanumeric characters + spaces).

```typescript
import { validTokenName } from './generators';

const name = fc.sample(validTokenName(), 1)[0];
// Example: "My Token 123"
```

#### `validTokenSymbol()`
Generates valid token symbols (1-12 uppercase letters).

```typescript
import { validTokenSymbol } from './generators';

const symbol = fc.sample(validTokenSymbol(), 1)[0];
// Example: "MYTOKEN"
```

#### `validDecimals()`
Generates valid decimal values (0-18).

```typescript
import { validDecimals } from './generators';

const decimals = fc.sample(validDecimals(), 1)[0];
// Example: 7
```

#### `validInitialSupply()`
Generates valid initial supply values (positive BigInt as string).

```typescript
import { validInitialSupply } from './generators';

const supply = fc.sample(validInitialSupply(), 1)[0];
// Example: "1000000"
```

#### `validDescription()`
Generates valid descriptions (0-500 characters).

```typescript
import { validDescription } from './generators';

const description = fc.sample(validDescription(), 1)[0];
```

#### `validTokenParams()`
Generates complete valid token deployment parameters.

```typescript
import { validTokenParams } from './generators';
import type { TokenDeployParams } from '../types';

fc.assert(
    fc.property(validTokenParams(), (params: TokenDeployParams) => {
        const result = validateTokenParams(params);
        expect(result.valid).toBe(true);
    })
);
```

### Fee Generators

#### `feeAmount(min?, max?)`
Configurable fee amount generator.

```typescript
import { feeAmount } from './generators';

// Default: 5-20
const defaultFee = feeAmount();

// Custom range
const customFee = feeAmount(10, 50);
```

#### `validFeeAmount()`
Generates valid fee amounts (5-20 XLM).

```typescript
import { validFeeAmount } from './generators';

const fee = fc.sample(validFeeAmount(), 1)[0];
// Example: 12
```

#### `insufficientFeeAmount()`
Generates insufficient fee amounts (0-4 XLM) for testing error cases.

```typescript
import { insufficientFeeAmount } from './generators';

const fee = fc.sample(insufficientFeeAmount(), 1)[0];
// Example: 2
```

#### `excessiveFeeAmount()`
Generates excessive fee amounts (100-10000) for testing upper bounds.

```typescript
import { excessiveFeeAmount } from './generators';

const fee = fc.sample(excessiveFeeAmount(), 1)[0];
// Example: 5000
```

### Operation Sequence Generators

#### `tokenOperation()`
Generates a single token operation (deploy, transfer, mint, burn, approve).

```typescript
import { tokenOperation } from './generators';
import type { TokenOperation } from './generators';

const operation: TokenOperation = fc.sample(tokenOperation(), 1)[0];
// Example: { type: 'transfer', params: { from: '...', to: '...', amount: '1000' }, timestamp: 1234567890 }
```

#### `tokenOperationSequence(minLength?, maxLength?)`
Generates a sequence of token operations.

```typescript
import { tokenOperationSequence } from './generators';

// Default: 1-10 operations
const sequence = fc.sample(tokenOperationSequence(), 1)[0];

// Custom range: 5-20 operations
const longSequence = fc.sample(tokenOperationSequence(5, 20), 1)[0];
```

### Utility Generators

#### `metadataUri()`
Generates valid metadata URIs (IPFS CIDv0, CIDv1, HTTP URLs).

```typescript
import { metadataUri } from './generators';

const uri = fc.sample(metadataUri(), 1)[0];
// Examples:
// - "ipfs://QmXxxx..."
// - "ipfs://bafyxxx..."
// - "https://example.com/abc123..."
```

#### `transactionHash()`
Generates transaction hashes (64 hex characters).

```typescript
import { transactionHash } from './generators';

const hash = fc.sample(transactionHash(), 1)[0];
// Example: "a1b2c3d4e5f6..."
```

#### `timestamp()`
Generates Unix timestamps (milliseconds from 2021-01-01 to now).

```typescript
import { timestamp } from './generators';

const ts = fc.sample(timestamp(), 1)[0];
// Example: 1640995200000
```

#### `networkType()`
Generates network types ('testnet' or 'mainnet').

```typescript
import { networkType } from './generators';

const network = fc.sample(networkType(), 1)[0];
// Example: "testnet"
```

## Usage Examples

### Basic Property Test

```typescript
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validStellarAddress } from '../test/generators';
import { isValidStellarAddress } from './validation';

describe('Stellar Address Validation', () => {
    it('should accept all valid addresses', () => {
        fc.assert(
            fc.property(validStellarAddress(), (address) => {
                expect(isValidStellarAddress(address)).toBe(true);
            }),
            { numRuns: 1000 } // Run 1000 iterations
        );
    });
});
```

### Testing with Multiple Generators

```typescript
import { validTokenParams, validFeeAmount } from '../test/generators';

it('should calculate fees correctly for any valid params', () => {
    fc.assert(
        fc.property(
            validTokenParams(),
            validFeeAmount(),
            (params, baseFee) => {
                const fee = calculateFee(params, baseFee);
                expect(fee.totalFee).toBeGreaterThanOrEqual(baseFee);
            }
        ),
        { numRuns: 1000 }
    );
});
```

### Testing Error Cases

```typescript
import { invalidStellarAddressWithReason } from '../test/generators';

it('should provide appropriate error messages', () => {
    fc.assert(
        fc.property(
            invalidStellarAddressWithReason(),
            ({ address, reason }) => {
                const error = validateAddress(address);
                
                switch (reason) {
                    case 'too_short':
                        expect(error).toContain('must be 56 characters');
                        break;
                    case 'wrong_prefix':
                        expect(error).toContain('must start with G');
                        break;
                    // ... etc
                }
            }
        )
    );
});
```

## Best Practices

1. **Run Many Iterations**: Use `{ numRuns: 1000 }` or more to catch edge cases
2. **Combine Generators**: Use `fc.tuple()` or `fc.record()` to test multiple inputs
3. **Filter When Needed**: Use `.filter()` to exclude specific cases
4. **Map for Transformations**: Use `.map()` to transform generated values
5. **Test Idempotency**: Verify functions return same result for same input
6. **Test Invariants**: Verify properties that should always hold true

## Performance Considerations

- All generators are optimized for fast execution
- Use `fc.sample()` for debugging (generates examples without running tests)
- Adjust `numRuns` based on test complexity
- Generators are lazy - values are only created when needed

## Contributing

When adding new generators:

1. Follow the existing naming conventions
2. Add comprehensive JSDoc comments
3. Include usage examples in this README
4. Ensure generators are configurable where appropriate
5. Add corresponding property tests

## References

- [fast-check Documentation](https://github.com/dubzzz/fast-check/tree/main/documentation)
- [Property-Based Testing Guide](https://github.com/dubzzz/fast-check/blob/main/documentation/1-Guides/PropertyBasedTesting.md)
- [Stellar Address Format](https://developers.stellar.org/docs/encyclopedia/accounts)
