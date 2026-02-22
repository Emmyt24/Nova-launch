# Burn Feature Migration Guide

## Overview

This guide helps you migrate your Nova Launch Token Factory to include burn functionality. Follow these steps to add burn capabilities to your smart contract and frontend.

---

## Prerequisites

- Existing Token Factory deployment
- Rust 1.70+ installed
- Soroban CLI installed
- Node.js 18+ for frontend
- Access to admin keys

---

## Migration Steps

### Phase 1: Smart Contract Updates

#### Step 1: Update Error Codes

**File**: `contracts/token-factory/src/types.rs`

Add new error codes to the `Error` enum:

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
    // Add these:
    BurnAmountExceedsBalance = 7,
    BurnNotEnabled = 8,
    InvalidBurnAmount = 9,
}
```

#### Step 2: Add Event Structure

**File**: `contracts/token-factory/src/types.rs`

Add the `TokenBurned` event:

```rust
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

#### Step 3: Implement Burn Functions

**File**: `contracts/token-factory/src/lib.rs`

Add the three burn functions (see `INLINE_DOCS_TEMPLATE.rs` for full documentation):

```rust
/// Burns tokens from the specified address
pub fn burn(
    env: Env,
    token_address: Address,
    from: Address,
    amount: i128,
) -> Result<(), Error> {
    // Validate amount
    if amount <= 0 {
        return Err(Error::InvalidBurnAmount);
    }

    // Verify token exists
    let token_info = storage::get_token_info(&env, &token_address)
        .ok_or(Error::TokenNotFound)?;

    // Require authorization from token holder
    from.require_auth();

    // Get token client
    let token_client = token::Client::new(&env, &token_address);

    // Check balance
    let balance = token_client.balance(&from);
    if amount > balance {
        return Err(Error::BurnAmountExceedsBalance);
    }

    // Burn tokens
    token_client.burn(&from, &amount);

    // Emit event
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

    Ok(())
}

/// Admin burn (clawback)
pub fn admin_burn(
    env: Env,
    token_address: Address,
    admin: Address,
    from: Address,
    amount: i128,
) -> Result<(), Error> {
    // Validate amount
    if amount <= 0 {
        return Err(Error::InvalidBurnAmount);
    }

    // Verify token exists and admin is creator
    let token_info = storage::get_token_info(&env, &token_address)
        .ok_or(Error::TokenNotFound)?;
    
    if admin != token_info.creator {
        return Err(Error::Unauthorized);
    }

    // Require admin authorization
    admin.require_auth();

    // Get token client
    let token_client = token::Client::new(&env, &token_address);

    // Check balance
    let balance = token_client.balance(&from);
    if amount > balance {
        return Err(Error::BurnAmountExceedsBalance);
    }

    // Burn tokens
    token_client.burn(&from, &amount);

    // Emit event
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

    Ok(())
}

/// Batch burn
pub fn burn_batch(
    env: Env,
    token_address: Address,
    burns: Vec<(Address, i128)>,
) -> Result<(), Error> {
    // Verify token exists
    let _token_info = storage::get_token_info(&env, &token_address)
        .ok_or(Error::TokenNotFound)?;

    // Get token client
    let token_client = token::Client::new(&env, &token_address);

    // Process each burn
    for (from, amount) in burns.iter() {
        // Validate amount
        if amount <= 0 {
            return Err(Error::InvalidBurnAmount);
        }

        // Require authorization
        from.require_auth();

        // Check balance
        let balance = token_client.balance(&from);
        if amount > balance {
            return Err(Error::BurnAmountExceedsBalance);
        }

        // Burn tokens
        token_client.burn(&from, &amount);

        // Emit event
        env.events().publish(
            (symbol_short!("burned"), token_address.clone()),
            TokenBurned {
                token_address: token_address.clone(),
                from: from.clone(),
                amount: *amount,
                burned_by: from.clone(),
                timestamp: env.ledger().timestamp(),
                is_admin_burn: false,
            }
        );
    }

    Ok(())
}
```

#### Step 4: Add Tests

**File**: `contracts/token-factory/src/test.rs`

Add comprehensive tests:

```rust
#[test]
fn test_burn_success() {
    let env = Env::default();
    let factory = create_factory(&env);
    let (token_address, creator) = create_test_token(&env, &factory);
    
    let initial_balance = token_client.balance(&creator);
    let burn_amount = 1000_0000000;
    
    let result = factory.burn(&token_address, &creator, &burn_amount);
    assert!(result.is_ok());
    
    let final_balance = token_client.balance(&creator);
    assert_eq!(final_balance, initial_balance - burn_amount);
}

#[test]
fn test_burn_invalid_amount() {
    let env = Env::default();
    let factory = create_factory(&env);
    let (token_address, creator) = create_test_token(&env, &factory);
    
    let result = factory.burn(&token_address, &creator, &0);
    assert_eq!(result, Err(Error::InvalidBurnAmount));
}

#[test]
fn test_burn_exceeds_balance() {
    let env = Env::default();
    let factory = create_factory(&env);
    let (token_address, creator) = create_test_token(&env, &factory);
    
    let balance = token_client.balance(&creator);
    let result = factory.burn(&token_address, &creator, &(balance + 1));
    assert_eq!(result, Err(Error::BurnAmountExceedsBalance));
}

#[test]
fn test_admin_burn_success() {
    let env = Env::default();
    let factory = create_factory(&env);
    let (token_address, creator) = create_test_token(&env, &factory);
    
    let user = Address::generate(&env);
    let amount = 500_0000000;
    
    // Transfer some tokens to user first
    token_client.transfer(&creator, &user, &amount);
    
    // Admin burns from user
    let result = factory.admin_burn(&token_address, &creator, &user, &amount);
    assert!(result.is_ok());
    
    let balance = token_client.balance(&user);
    assert_eq!(balance, 0);
}

#[test]
fn test_admin_burn_unauthorized() {
    let env = Env::default();
    let factory = create_factory(&env);
    let (token_address, creator) = create_test_token(&env, &factory);
    
    let non_admin = Address::generate(&env);
    let result = factory.admin_burn(&token_address, &non_admin, &creator, &100);
    assert_eq!(result, Err(Error::Unauthorized));
}

#[test]
fn test_burn_batch_success() {
    let env = Env::default();
    let factory = create_factory(&env);
    let (token_address, creator) = create_test_token(&env, &factory);
    
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    
    // Transfer tokens
    token_client.transfer(&creator, &user1, &1000_0000000);
    token_client.transfer(&creator, &user2, &2000_0000000);
    
    // Batch burn
    let burns = vec![
        &env,
        (user1.clone(), 500_0000000),
        (user2.clone(), 1000_0000000),
    ];
    
    let result = factory.burn_batch(&token_address, &burns);
    assert!(result.is_ok());
    
    assert_eq!(token_client.balance(&user1), 500_0000000);
    assert_eq!(token_client.balance(&user2), 1000_0000000);
}
```

#### Step 5: Build and Test

```bash
cd contracts/token-factory

# Build
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test

# Optimize WASM
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/token_factory.wasm
```

#### Step 6: Deploy Updated Contract

```bash
# Deploy to testnet
CONTRACT_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/token_factory.wasm \
  --network testnet \
  --source admin)

echo "New contract deployed: $CONTRACT_ID"

# Initialize (if needed)
soroban contract invoke \
  --id $CONTRACT_ID \
  --network testnet \
  --source admin \
  -- initialize \
  --admin $(soroban keys address admin) \
  --treasury $(soroban keys address treasury) \
  --base_fee 70000000 \
  --metadata_fee 30000000
```

---

### Phase 2: Frontend Updates

#### Step 1: Update Stellar Service

**File**: `frontend/src/services/stellar.ts`

Add burn methods:

```typescript
export class StellarService {
  // ... existing methods ...

  async burnTokens(
    tokenAddress: string,
    amount: string
  ): Promise<string> {
    const wallet = await this.getWallet();
    const account = await this.getAccount(wallet.publicKey);

    const contract = new Contract(this.config.factoryContractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'burn',
          xdr.ScVal.scvAddress(
            Address.fromString(tokenAddress).toScAddress()
          ),
          xdr.ScVal.scvAddress(
            Address.fromString(wallet.publicKey).toScAddress()
          ),
          nativeToScVal(amount, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const signedTx = await wallet.signTransaction(tx.toXDR());
    const result = await this.server.sendTransaction(signedTx);
    
    return result.hash;
  }

  async adminBurnTokens(
    tokenAddress: string,
    fromAddress: string,
    amount: string
  ): Promise<string> {
    const wallet = await this.getWallet();
    const account = await this.getAccount(wallet.publicKey);

    const contract = new Contract(this.config.factoryContractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'admin_burn',
          xdr.ScVal.scvAddress(
            Address.fromString(tokenAddress).toScAddress()
          ),
          xdr.ScVal.scvAddress(
            Address.fromString(wallet.publicKey).toScAddress()
          ),
          xdr.ScVal.scvAddress(
            Address.fromString(fromAddress).toScAddress()
          ),
          nativeToScVal(amount, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const signedTx = await wallet.signTransaction(tx.toXDR());
    const result = await this.server.sendTransaction(signedTx);
    
    return result.hash;
  }
}
```

#### Step 2: Create Burn Hook

**File**: `frontend/src/hooks/useBurnTokens.ts`

```typescript
import { useState } from 'react';
import { stellarService } from '../services/stellar';
import { useToast } from './useToast';

export function useBurnTokens() {
  const [isBurning, setIsBurning] = useState(false);
  const { success, error } = useToast();

  const burn = async (
    tokenAddress: string,
    amount: string
  ): Promise<void> => {
    setIsBurning(true);
    try {
      const txHash = await stellarService.burnTokens(tokenAddress, amount);
      success(`Tokens burned successfully. TX: ${txHash}`);
    } catch (err) {
      error('Failed to burn tokens');
      throw err;
    } finally {
      setIsBurning(false);
    }
  };

  const adminBurn = async (
    tokenAddress: string,
    fromAddress: string,
    amount: string
  ): Promise<void> => {
    setIsBurning(true);
    try {
      const txHash = await stellarService.adminBurnTokens(
        tokenAddress,
        fromAddress,
        amount
      );
      success(`Admin burn successful. TX: ${txHash}`);
    } catch (err) {
      error('Failed to perform admin burn');
      throw err;
    } finally {
      setIsBurning(false);
    }
  };

  return { burn, adminBurn, isBurning };
}
```

#### Step 3: Create Burn UI Component

**File**: `frontend/src/components/BurnTokens/BurnTokensForm.tsx`

```typescript
import { useState } from 'react';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { Card } from '../UI/Card';
import { useBurnTokens } from '../../hooks/useBurnTokens';

interface BurnTokensFormProps {
  tokenAddress: string;
  balance: string;
  decimals: number;
}

export function BurnTokensForm({
  tokenAddress,
  balance,
  decimals,
}: BurnTokensFormProps) {
  const [amount, setAmount] = useState('');
  const { burn, isBurning } = useBurnTokens();

  const handleBurn = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to burn ${amount} tokens? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await burn(tokenAddress, amount);
      setAmount('');
    } catch (error) {
      console.error('Burn failed:', error);
    }
  };

  const isValid = () => {
    const amountNum = parseFloat(amount);
    const balanceNum = parseFloat(balance);
    return amountNum > 0 && amountNum <= balanceNum;
  };

  return (
    <Card title="Burn Tokens">
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            ⚠️ Warning: Burning tokens is permanent and cannot be undone.
            Burned tokens are removed from circulation forever.
          </p>
        </div>

        <Input
          label="Amount to Burn"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          max={balance}
        />

        <div className="text-sm text-gray-600">
          Balance: {balance} tokens
        </div>

        <Button
          onClick={handleBurn}
          disabled={!isValid() || isBurning}
          variant="danger"
          fullWidth
        >
          {isBurning ? 'Burning...' : 'Burn Tokens'}
        </Button>
      </div>
    </Card>
  );
}
```

#### Step 4: Update Environment Variables

**File**: `frontend/.env`

```env
VITE_FACTORY_CONTRACT_ID=<new_contract_id>
VITE_NETWORK=testnet
VITE_IPFS_API_KEY=<your_key>
VITE_IPFS_API_SECRET=<your_secret>
```

#### Step 5: Test Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run tests
npm test

# Start dev server
npm run dev
```

---

### Phase 3: Documentation Updates

#### Step 1: Update README.md

Already completed - burn functions documented in README.md.

#### Step 2: Update API Documentation

Add burn endpoints to API documentation (if applicable).

#### Step 3: Create User Guide

Document how users can burn tokens through the UI.

---

## Verification Checklist

### Smart Contract

- [ ] Error codes added to types.rs
- [ ] TokenBurned event added to types.rs
- [ ] burn() function implemented
- [ ] admin_burn() function implemented
- [ ] burn_batch() function implemented
- [ ] All functions have inline documentation
- [ ] Unit tests added and passing
- [ ] Property-based tests added
- [ ] Contract builds successfully
- [ ] Contract deployed to testnet
- [ ] Contract initialized correctly

### Frontend

- [ ] Stellar service updated with burn methods
- [ ] useBurnTokens hook created
- [ ] BurnTokensForm component created
- [ ] Confirmation dialogs implemented
- [ ] Error handling implemented
- [ ] Environment variables updated
- [ ] Tests added and passing
- [ ] UI tested manually

### Documentation

- [ ] README.md updated
- [ ] Inline documentation added
- [ ] Security considerations documented
- [ ] Migration guide created
- [ ] User guide updated

---

## Rollback Plan

If issues arise during migration:

### Smart Contract Rollback

```bash
# Revert to previous contract
OLD_CONTRACT_ID="<previous_contract_id>"

# Update frontend to use old contract
echo "VITE_FACTORY_CONTRACT_ID=$OLD_CONTRACT_ID" > frontend/.env
```

### Frontend Rollback

```bash
cd frontend

# Revert to previous commit
git revert HEAD

# Rebuild
npm run build
```

---

## Post-Migration Tasks

1. **Monitor Events**
   - Set up monitoring for burn events
   - Alert on unexpected admin burns

2. **User Communication**
   - Announce burn feature availability
   - Publish admin burn policy
   - Update documentation

3. **Performance Monitoring**
   - Monitor gas usage
   - Track burn transaction success rate
   - Optimize if needed

4. **Security Audit**
   - Review burn function security
   - Test edge cases
   - Conduct external audit (recommended)

---

## Support

If you encounter issues during migration:

1. Check the [BURN_FEATURE_DOCS.md](./BURN_FEATURE_DOCS.md) for detailed documentation
2. Review [BURN_SECURITY.md](./BURN_SECURITY.md) for security considerations
3. Open an issue on GitHub
4. Contact the development team

---

**Last Updated**: February 22, 2026  
**Version**: 1.0.0
