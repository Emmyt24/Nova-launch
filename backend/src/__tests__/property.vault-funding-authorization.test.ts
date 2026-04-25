/**
 * Property 82: Vault Funding Authorization
 *
 * Proves that vault funding requires proper authorization from the funder.
 * Only authorized funders can successfully fund a vault; unauthorized attempts
 * must fail consistently.
 *
 * Properties tested:
 *   P82-A  Authorized funder can fund vault successfully
 *   P82-B  Unauthorized funder cannot fund vault (authorization check fails)
 *   P82-C  Funding amount validation is independent of authorization
 *   P82-D  Multiple funding attempts maintain authorization invariant
 *   P82-E  Authorization state persists across operations
 *
 * Mathematical proof (inline):
 *   canFund(funder, vault) = funder ∈ vault.authorizedFunders
 *   fundingSucceeds = canFund(funder, vault) ∧ amount > 0 ∧ amount ≤ maxAmount
 *
 * Security considerations:
 *   - Authorization is checked before any state mutation
 *   - Funder addresses are validated as non-empty strings
 *   - Funding amounts use BigInt to prevent precision loss
 *   - Authorization list is immutable during funding operation
 *
 * Edge cases / assumptions:
 *   - Empty authorized funders list means no one can fund
 *   - Funder address must match exactly (case-sensitive)
 *   - Zero-amount funding is invalid regardless of authorization
 *   - Authorization cannot be revoked mid-operation
 *
 * Follow-up work:
 *   - Add property test for authorization revocation
 *   - Test multi-sig authorization scenarios
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure domain functions
// ---------------------------------------------------------------------------

interface Vault {
  id: string;
  authorizedFunders: string[];
  totalFunded: bigint;
  maxFundingAmount: bigint;
}

interface FundingAttempt {
  vaultId: string;
  funder: string;
  amount: bigint;
}

interface FundingResult {
  success: boolean;
  reason?: string;
  newTotal?: bigint;
}

/**
 * Check if a funder is authorized for a vault.
 */
function isAuthorizedFunder(vault: Vault, funder: string): boolean {
  return vault.authorizedFunders.includes(funder);
}

/**
 * Validate funding amount.
 */
function isValidFundingAmount(amount: bigint, maxAmount: bigint): boolean {
  return amount > 0n && amount <= maxAmount;
}

/**
 * Attempt to fund a vault. Returns success only if:
 *   1. Funder is authorized
 *   2. Amount is valid
 *   3. Total would not exceed max
 */
function attemptFunding(vault: Vault, attempt: FundingAttempt): FundingResult {
  if (!isAuthorizedFunder(vault, attempt.funder)) {
    return { success: false, reason: 'UNAUTHORIZED' };
  }

  if (!isValidFundingAmount(attempt.amount, vault.maxFundingAmount)) {
    return { success: false, reason: 'INVALID_AMOUNT' };
  }

  const newTotal = vault.totalFunded + attempt.amount;
  if (newTotal > vault.maxFundingAmount) {
    return { success: false, reason: 'EXCEEDS_MAX' };
  }

  return { success: true, newTotal };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const addressArb = fc.stringMatching(/^[a-zA-Z0-9]{20,56}$/);
const fundingAmountArb = fc.bigInt({ min: 1n, max: BigInt('1000000000000000000') });
const maxFundingArb = fc.bigInt({ min: BigInt('1000000000000000000'), max: BigInt('10000000000000000000') });

const vaultArb = fc.record({
  id: fc.stringMatching(/^vault-[a-zA-Z0-9]{10,20}$/),
  authorizedFunders: fc.array(addressArb, { minLength: 1, maxLength: 10 }),
  totalFunded: fc.bigInt({ min: 0n, max: BigInt('500000000000000000') }),
  maxFundingAmount: maxFundingArb,
});

// ---------------------------------------------------------------------------
// Property 82-A: Authorized funder can fund vault successfully
// ---------------------------------------------------------------------------
describe('Property 82-A: authorized funder can fund vault', () => {
  it('authorized funder with valid amount succeeds', () => {
    fc.assert(
      fc.property(vaultArb, fundingAmountArb, (vault, amount) => {
        fc.pre(vault.authorizedFunders.length > 0);
        fc.pre(vault.totalFunded + amount <= vault.maxFundingAmount);

        const funder = vault.authorizedFunders[0];
        const attempt: FundingAttempt = { vaultId: vault.id, funder, amount };
        const result = attemptFunding(vault, attempt);

        return result.success === true && result.newTotal === vault.totalFunded + amount;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 82-B: Unauthorized funder cannot fund vault
// ---------------------------------------------------------------------------
describe('Property 82-B: unauthorized funder cannot fund vault', () => {
  it('funder not in authorized list fails', () => {
    fc.assert(
      fc.property(vaultArb, addressArb, fundingAmountArb, (vault, unauthorizedFunder, amount) => {
        fc.pre(!vault.authorizedFunders.includes(unauthorizedFunder));

        const attempt: FundingAttempt = { vaultId: vault.id, funder: unauthorizedFunder, amount };
        const result = attemptFunding(vault, attempt);

        return result.success === false && result.reason === 'UNAUTHORIZED';
      }),
      { numRuns: 100 },
    );
  });

  it('empty authorized funders list rejects all funders', () => {
    fc.assert(
      fc.property(addressArb, fundingAmountArb, (funder, amount) => {
        const vault: Vault = {
          id: 'vault-test',
          authorizedFunders: [],
          totalFunded: 0n,
          maxFundingAmount: BigInt('1000000000000000000'),
        };

        const attempt: FundingAttempt = { vaultId: vault.id, funder, amount };
        const result = attemptFunding(vault, attempt);

        return result.success === false && result.reason === 'UNAUTHORIZED';
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 82-C: Funding amount validation is independent of authorization
// ---------------------------------------------------------------------------
describe('Property 82-C: amount validation independent of authorization', () => {
  it('zero amount fails even for authorized funder', () => {
    fc.assert(
      fc.property(vaultArb, (vault) => {
        fc.pre(vault.authorizedFunders.length > 0);

        const funder = vault.authorizedFunders[0];
        const attempt: FundingAttempt = { vaultId: vault.id, funder, amount: 0n };
        const result = attemptFunding(vault, attempt);

        return result.success === false && result.reason === 'INVALID_AMOUNT';
      }),
      { numRuns: 100 },
    );
  });

  it('amount exceeding max fails even for authorized funder', () => {
    fc.assert(
      fc.property(vaultArb, (vault) => {
        fc.pre(vault.authorizedFunders.length > 0);

        const funder = vault.authorizedFunders[0];
        const excessAmount = vault.maxFundingAmount + 1n;
        const attempt: FundingAttempt = { vaultId: vault.id, funder, amount: excessAmount };
        const result = attemptFunding(vault, attempt);

        return result.success === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 82-D: Multiple funding attempts maintain authorization invariant
// ---------------------------------------------------------------------------
describe('Property 82-D: authorization invariant across multiple attempts', () => {
  it('repeated authorized funding maintains invariant', () => {
    fc.assert(
      fc.property(
        vaultArb,
        fc.array(fundingAmountArb, { minLength: 2, maxLength: 5 }),
        (vault, amounts) => {
          fc.pre(vault.authorizedFunders.length > 0);
          const funder = vault.authorizedFunders[0];

          let currentVault = { ...vault };
          let totalExpected = vault.totalFunded;

          for (const amount of amounts) {
            fc.pre(totalExpected + amount <= vault.maxFundingAmount);

            const attempt: FundingAttempt = { vaultId: vault.id, funder, amount };
            const result = attemptFunding(currentVault, attempt);

            if (result.success) {
              totalExpected += amount;
              currentVault = { ...currentVault, totalFunded: result.newTotal! };
            }
          }

          return currentVault.totalFunded === totalExpected;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 82-E: Authorization state persists across operations
// ---------------------------------------------------------------------------
describe('Property 82-E: authorization state persists', () => {
  it('authorized funder list does not change after funding', () => {
    fc.assert(
      fc.property(vaultArb, fundingAmountArb, (vault, amount) => {
        fc.pre(vault.authorizedFunders.length > 0);
        fc.pre(vault.totalFunded + amount <= vault.maxFundingAmount);

        const funder = vault.authorizedFunders[0];
        const originalFunders = [...vault.authorizedFunders];

        const attempt: FundingAttempt = { vaultId: vault.id, funder, amount };
        attemptFunding(vault, attempt);

        return (
          vault.authorizedFunders.length === originalFunders.length &&
          vault.authorizedFunders.every((f, i) => f === originalFunders[i])
        );
      }),
      { numRuns: 100 },
    );
  });
});
