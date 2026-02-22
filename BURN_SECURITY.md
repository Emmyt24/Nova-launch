# Burn Feature Security Considerations

## Overview

This document outlines security considerations, best practices, and potential risks associated with the token burn functionality in the Nova Launch Token Factory.

---

## Security Model

### User Burns (`burn`)

**Authorization Model**: Self-custody
- Users can only burn tokens they own
- Requires signature from token holder
- Non-reversible operation

**Security Properties**:
- ✅ No third-party authorization needed
- ✅ Balance validation prevents over-burning
- ✅ Atomic operation (all-or-nothing)
- ✅ Event logging for audit trail

### Admin Burns (`admin_burn`)

**Authorization Model**: Privileged operation
- Only token creator can perform admin burns
- Can burn tokens from any address
- Requires admin signature

**Security Properties**:
- ⚠️ Powerful capability - use responsibly
- ✅ Restricted to token creator only
- ✅ Clearly marked in events (`is_admin_burn: true`)
- ✅ Audit trail for compliance

### Batch Burns (`burn_batch`)

**Authorization Model**: Hybrid
- Each address must authorize their burn
- Atomic batch operation
- Gas-optimized

**Security Properties**:
- ✅ Individual authorization per address
- ✅ All burns succeed or all fail
- ✅ Gas limit protection
- ✅ Event per burn for tracking

---

## Threat Model

### User Burn Threats

#### 1. Accidental Burns

**Risk**: User accidentally burns tokens they didn't intend to burn.

**Mitigation**:
- Frontend confirmation dialogs
- Display burn amount clearly
- Show irreversibility warning
- Implement "undo" grace period (future feature)

**Example Frontend Protection**:
```typescript
const confirmBurn = async (amount: string) => {
  const confirmed = await showConfirmDialog({
    title: 'Confirm Token Burn',
    message: `You are about to permanently burn ${amount} tokens. This action cannot be undone.`,
    confirmText: 'Burn Tokens',
    cancelText: 'Cancel',
    variant: 'danger'
  });
  
  if (!confirmed) return;
  
  await burnTokens(amount);
};
```

#### 2. Front-Running

**Risk**: Malicious actor observes burn transaction and front-runs it.

**Impact**: Low - burning is self-destructive, no value extraction possible.

**Mitigation**: Not applicable - no economic incentive for front-running burns.

#### 3. Replay Attacks

**Risk**: Burn transaction replayed on different network.

**Mitigation**:
- Stellar network passphrase prevents cross-network replay
- Transaction sequence numbers prevent same-network replay
- Built into Stellar protocol

### Admin Burn Threats

#### 1. Unauthorized Admin Burns

**Risk**: Non-admin attempts to perform admin burn.

**Mitigation**:
```rust
// Verify admin is token creator
let token_info = storage::get_token_info(&env, &token_address)?;
if admin != token_info.creator {
    return Err(Error::Unauthorized);
}
admin.require_auth();
```

#### 2. Admin Key Compromise

**Risk**: Admin private key is compromised, attacker burns user tokens.

**Impact**: High - attacker can burn tokens from any address.

**Mitigation**:
- Use hardware wallets for admin keys
- Implement multi-sig for admin operations (future)
- Monitor admin burn events
- Rate limiting on admin burns (future)
- Time-locked admin operations (future)

**Best Practice**:
```rust
// Future: Add multi-sig requirement
pub fn admin_burn_multisig(
    env: Env,
    token_address: Address,
    admins: Vec<Address>,  // Require 2-of-3 signatures
    from: Address,
    amount: i128,
) -> Result<(), Error>
```

#### 3. Malicious Admin

**Risk**: Token creator intentionally burns user tokens without justification.

**Impact**: High - loss of user trust, token value.

**Mitigation**:
- Transparency: Announce admin burn capability during token creation
- Governance: Community oversight of admin actions
- Events: All admin burns logged with `is_admin_burn: true`
- Documentation: Clear admin burn policy
- Reputation: On-chain reputation system (future)

**Recommended Admin Burn Policy**:
```markdown
## Admin Burn Policy

This token has admin burn capability (clawback). Admin burns will only be performed in the following circumstances:

1. **Regulatory Compliance**: Court order or legal requirement
2. **Fraud Prevention**: Confirmed fraudulent activity
3. **Emergency Response**: Critical security incident
4. **Token Recovery**: User request with proof of ownership

All admin burns will be:
- Announced 48 hours in advance (except emergencies)
- Documented with justification
- Logged on-chain with full transparency
```

### Batch Burn Threats

#### 1. Gas Limit Exhaustion

**Risk**: Batch too large, transaction fails due to gas limit.

**Mitigation**:
```rust
// Limit batch size
const MAX_BATCH_SIZE: usize = 100;

pub fn burn_batch(
    env: Env,
    token_address: Address,
    burns: Vec<(Address, i128)>,
) -> Result<(), Error> {
    if burns.len() > MAX_BATCH_SIZE {
        return Err(Error::InvalidParameters);
    }
    // Process burns
}
```

#### 2. Partial Authorization

**Risk**: Some addresses in batch don't authorize, entire batch fails.

**Mitigation**:
- Frontend validates all authorizations before submission
- Clear error messages on authorization failure
- Option for partial batch execution (future)

---

## Best Practices

### For Token Creators

1. **Announce Admin Burn Capability**
   ```markdown
   ⚠️ This token has admin burn capability. The creator can burn tokens from any address for compliance and security purposes.
   ```

2. **Document Admin Burn Policy**
   - When admin burns will be used
   - Notification process
   - Appeal mechanism

3. **Secure Admin Keys**
   - Use hardware wallets
   - Enable multi-sig (when available)
   - Rotate keys periodically
   - Store backups securely

4. **Monitor Admin Burns**
   - Set up event monitoring
   - Alert on unexpected admin burns
   - Regular audit of admin actions

5. **Transparency**
   - Publish admin burn events
   - Provide justification for burns
   - Maintain public audit log

### For Token Holders

1. **Verify Admin Burn Policy**
   - Check if token has admin burn capability
   - Read admin burn policy before purchasing
   - Understand risks

2. **Secure Your Keys**
   - Use hardware wallets
   - Enable 2FA on wallet
   - Never share private keys

3. **Confirm Before Burning**
   - Double-check burn amount
   - Understand irreversibility
   - Verify recipient address (if applicable)

4. **Monitor Your Balance**
   - Set up balance alerts
   - Check for unexpected burns
   - Report suspicious activity

### For Frontend Developers

1. **Confirmation Dialogs**
   ```typescript
   // Always confirm burns
   const confirmBurn = async (amount: string) => {
     return await showConfirmDialog({
       title: 'Confirm Burn',
       message: `Burn ${amount} tokens? This cannot be undone.`,
       confirmText: 'Burn',
       variant: 'danger'
     });
   };
   ```

2. **Input Validation**
   ```typescript
   // Validate burn amount
   const validateBurnAmount = (amount: string, balance: string) => {
     const amountNum = parseFloat(amount);
     const balanceNum = parseFloat(balance);
     
     if (amountNum <= 0) {
       throw new Error('Amount must be positive');
     }
     
     if (amountNum > balanceNum) {
       throw new Error('Insufficient balance');
     }
   };
   ```

3. **Clear Warnings**
   ```typescript
   <Alert variant="warning">
     ⚠️ Burning tokens is permanent and cannot be undone. 
     Burned tokens are removed from circulation forever.
   </Alert>
   ```

4. **Event Monitoring**
   ```typescript
   // Monitor burn events
   const monitorBurns = (tokenAddress: string) => {
     stellarServer
       .events()
       .forContract(tokenAddress)
       .cursor('now')
       .stream({
         onmessage: (event) => {
           if (event.topic.includes('burned')) {
             const burn = parseBurnEvent(event);
             if (burn.is_admin_burn) {
               showAdminBurnAlert(burn);
             }
           }
         },
       });
   };
   ```

---

## Audit Checklist

### Code Review

- [ ] Authorization checks in all burn functions
- [ ] Balance validation before burning
- [ ] Amount validation (> 0)
- [ ] Token existence check
- [ ] Event emission on success
- [ ] Error handling for all edge cases
- [ ] Gas optimization for batch burns
- [ ] Reentrancy protection (if applicable)

### Testing

- [ ] Unit tests for all burn functions
- [ ] Property-based tests for invariants
- [ ] Integration tests for full flow
- [ ] Fuzz testing for edge cases
- [ ] Gas usage tests for batch burns
- [ ] Event emission tests
- [ ] Error condition tests

### Security

- [ ] Admin authorization verified
- [ ] No privilege escalation possible
- [ ] No reentrancy vulnerabilities
- [ ] No integer overflow/underflow
- [ ] No front-running vulnerabilities
- [ ] Event logging comprehensive
- [ ] Error messages don't leak sensitive info

### Documentation

- [ ] Function signatures documented
- [ ] Error codes documented
- [ ] Events documented
- [ ] Security considerations documented
- [ ] Usage examples provided
- [ ] Admin burn policy documented

---

## Incident Response

### Unauthorized Admin Burn

**Detection**:
- Monitor `TokenBurned` events with `is_admin_burn: true`
- Alert on unexpected admin burns
- User reports

**Response**:
1. Verify burn was unauthorized
2. Identify compromised admin key
3. Rotate admin key (if possible)
4. Notify affected users
5. Document incident
6. Implement additional safeguards

### Accidental User Burn

**Detection**:
- User reports accidental burn
- Transaction history review

**Response**:
1. Verify burn transaction
2. Explain irreversibility
3. Document for future prevention
4. Consider grace period feature (future)

### Mass Admin Burn Attack

**Detection**:
- Multiple admin burns in short time
- Unusual burn patterns
- User reports

**Response**:
1. Pause admin burn capability (if possible)
2. Investigate admin key compromise
3. Notify all users
4. Coordinate with Stellar network
5. Implement emergency recovery (if available)

---

## Future Security Enhancements

### 1. Time-Locked Admin Burns

```rust
pub fn schedule_admin_burn(
    env: Env,
    token_address: Address,
    admin: Address,
    from: Address,
    amount: i128,
    execute_after: u64,  // Timestamp
) -> Result<u64, Error> {
    // Schedule burn for future execution
    // Users can see pending burns and react
}
```

### 2. Multi-Sig Admin Burns

```rust
pub fn admin_burn_multisig(
    env: Env,
    token_address: Address,
    admins: Vec<Address>,  // Require M-of-N signatures
    from: Address,
    amount: i128,
) -> Result<(), Error>
```

### 3. Burn Rate Limiting

```rust
pub fn admin_burn_with_limit(
    env: Env,
    token_address: Address,
    admin: Address,
    from: Address,
    amount: i128,
) -> Result<(), Error> {
    // Limit admin burns to X% of supply per day
}
```

### 4. Burn Reversal Grace Period

```rust
pub fn burn_with_grace_period(
    env: Env,
    token_address: Address,
    from: Address,
    amount: i128,
    grace_period: u64,  // Seconds
) -> Result<u64, Error> {
    // Allow reversal within grace period
}
```

### 5. Governance-Controlled Admin Burns

```rust
pub fn admin_burn_with_governance(
    env: Env,
    token_address: Address,
    admin: Address,
    from: Address,
    amount: i128,
    proposal_id: u64,  // Must pass governance vote
) -> Result<(), Error>
```

---

## Compliance Considerations

### Regulatory Requirements

1. **KYC/AML**: Admin burn may be required for compliance
2. **Court Orders**: Legal requirement to freeze/burn tokens
3. **Sanctions**: Compliance with international sanctions
4. **Tax Reporting**: Burn events may be taxable events

### Audit Trail

All burns must maintain:
- Transaction hash
- Timestamp
- Amount burned
- Address burned from
- Initiator (user or admin)
- Reason (for admin burns)

### Data Retention

- Store burn events permanently on-chain
- Maintain off-chain records for compliance
- Provide burn history API for users

---

## References

- [Stellar Token Standard](https://soroban.stellar.org/docs/reference/interfaces/token-interface)
- [Soroban Security Best Practices](https://soroban.stellar.org/docs/learn/security)
- [Token Burn Economics](https://en.wikipedia.org/wiki/Coin_burning)

---

**Last Updated**: February 22, 2026  
**Version**: 1.0.0
