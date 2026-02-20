import * as fc from 'fast-check';
import type { TokenDeployParams } from '../types';

/**
 * Property-based testing generators for Stellar Token Deployer
 * Provides reusable, configurable generators for comprehensive testing
 */

// ============================================================================
// Stellar Address Generators
// ============================================================================

/**
 * Generator for valid Stellar addresses
 * Format: G followed by 55 base32 characters (A-Z, 2-7)
 */
export const validStellarAddress = (): fc.Arbitrary<string> =>
    fc
        .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), {
            minLength: 55,
            maxLength: 55,
        })
        .map((chars) => 'G' + chars.join(''));

/**
 * Generator for invalid Stellar addresses with various patterns
 */
export const invalidStellarAddress = (): fc.Arbitrary<string> =>
    fc.oneof(
        // Too short (< 56 characters)
        fc.string({ maxLength: 55 }),
        // Too long (> 56 characters)
        fc.string({ minLength: 57, maxLength: 100 }),
        // Wrong prefix (not 'G')
        fc
            .tuple(
                fc.constantFrom(...'ABCDEFHIJKLMNOPQRSTUVWXYZ234567'.split('')),
                fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), {
                    minLength: 55,
                    maxLength: 55,
                })
            )
            .map(([prefix, rest]) => prefix + rest.join('')),
        // Invalid characters (lowercase, numbers 0,1,8,9, special chars)
        fc
            .tuple(
                fc.constant('G'),
                fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), {
                    minLength: 50,
                    maxLength: 50,
                }),
                fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0189!@#$%^&*()'.split('')), {
                    minLength: 1,
                    maxLength: 5,
                })
            )
            .map(([prefix, valid, invalid]) => prefix + valid.join('') + invalid.join('')),
        // Empty string
        fc.constant(''),
        // Whitespace variations
        fc.constantFrom(' ', '\t', '\n', '   ')
    );

/**
 * Generator for invalid Stellar addresses with reason
 * Useful for testing specific validation error messages
 */
export const invalidStellarAddressWithReason = (): fc.Arbitrary<{
    address: string;
    reason: 'too_short' | 'too_long' | 'wrong_prefix' | 'invalid_chars' | 'empty';
}> =>
    fc.oneof(
        fc.string({ maxLength: 55 }).map((address) => ({ address, reason: 'too_short' as const })),
        fc
            .string({ minLength: 57, maxLength: 100 })
            .map((address) => ({ address, reason: 'too_long' as const })),
        fc
            .tuple(
                fc.constantFrom(...'ABCDEFHIJKLMNOPQRSTUVWXYZ234567'.split('')),
                fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), {
                    minLength: 55,
                    maxLength: 55,
                })
            )
            .map(([prefix, rest]) => ({ address: prefix + rest.join(''), reason: 'wrong_prefix' as const })),
        fc
            .tuple(
                fc.constant('G'),
                fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), {
                    minLength: 50,
                    maxLength: 54,
                }),
                fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0189!@#$%^&*()'.split(''))
            )
            .map(([prefix, valid, invalid]) => ({
                address: prefix + valid.join('') + invalid,
                reason: 'invalid_chars' as const,
            })),
        fc.constant({ address: '', reason: 'empty' as const })
    );

// ============================================================================
// Token Parameter Generators
// ============================================================================

/**
 * Generator for valid token names (1-32 alphanumeric characters + spaces)
 */
export const validTokenName = (): fc.Arbitrary<string> =>
    fc
        .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '.split('')), {
            minLength: 1,
            maxLength: 32,
        })
        .map((chars) => chars.join(''))
        .filter((s) => s.trim().length > 0); // Ensure not just spaces

/**
 * Generator for valid token symbols (1-12 uppercase letters)
 */
export const validTokenSymbol = (): fc.Arbitrary<string> =>
    fc
        .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
            minLength: 1,
            maxLength: 12,
        })
        .map((chars) => chars.join(''));

/**
 * Generator for valid decimals (0-18)
 */
export const validDecimals = (): fc.Arbitrary<number> => fc.integer({ min: 0, max: 18 });

/**
 * Generator for valid initial supply (positive BigInt as string)
 */
export const validInitialSupply = (): fc.Arbitrary<string> =>
    fc.bigInt({ min: 1n, max: BigInt(2 ** 53 - 1) }).map((n) => n.toString());

/**
 * Generator for valid token descriptions (0-500 characters)
 */
export const validDescription = (): fc.Arbitrary<string> =>
    fc.string({ maxLength: 500 });

/**
 * Generator for valid metadata URIs (IPFS format)
 */
export const metadataUri = (): fc.Arbitrary<string> =>
    fc.oneof(
        // IPFS CIDv0 (Qm...)
        fc
            .array(fc.constantFrom(...'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.split('')), {
                minLength: 44,
                maxLength: 46,
            })
            .map((chars) => `ipfs://Qm${chars.join('')}`),
        // IPFS CIDv1 (bafy...)
        fc
            .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz234567'.split('')), {
                minLength: 55,
                maxLength: 59,
            })
            .map((chars) => `ipfs://bafy${chars.join('')}`),
        // HTTP URLs with hex hash
        fc
            .tuple(
                fc.constantFrom('https://example.com', 'https://metadata.stellar.org'),
                fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 32, maxLength: 64 })
            )
            .map(([base, hashChars]) => `${base}/${hashChars.join('')}`)
    );

/**
 * Generator for complete valid token deployment parameters
 */
export const validTokenParams = (): fc.Arbitrary<TokenDeployParams> =>
    fc.record({
        name: validTokenName(),
        symbol: validTokenSymbol(),
        decimals: validDecimals(),
        initialSupply: validInitialSupply(),
        adminWallet: validStellarAddress(),
        metadata: fc.option(
            fc.record({
                image: fc.constant(new File([''], 'test.png', { type: 'image/png' })),
                description: validDescription(),
            }),
            { nil: undefined }
        ),
    });

// ============================================================================
// Fee Generators
// ============================================================================

/**
 * Generator for valid fee amounts (configurable range)
 * @param min Minimum fee in stroops (default: 5)
 * @param max Maximum fee in stroops (default: 20)
 */
export const feeAmount = (min: number = 5, max: number = 20): fc.Arbitrary<number> =>
    fc.integer({ min, max });

/**
 * Generator for valid fee amounts in XLM (5-20 XLM)
 */
export const validFeeAmount = (): fc.Arbitrary<number> => feeAmount(5, 20);

/**
 * Generator for insufficient fee amounts (0-4 XLM)
 */
export const insufficientFeeAmount = (): fc.Arbitrary<number> => fc.integer({ min: 0, max: 4 });

/**
 * Generator for excessive fee amounts (testing upper bounds)
 */
export const excessiveFeeAmount = (): fc.Arbitrary<number> => fc.integer({ min: 100, max: 10000 });

// ============================================================================
// Operation Sequence Generators
// ============================================================================

/**
 * Represents a token operation
 */
export interface TokenOperation {
    type: 'deploy' | 'transfer' | 'mint' | 'burn' | 'approve';
    params: TokenDeployParams | Record<string, unknown>;
    timestamp: number;
}

/**
 * Generator for a single token operation
 */
export const tokenOperation = (): fc.Arbitrary<TokenOperation> =>
    fc.oneof(
        fc.record({
            type: fc.constant('deploy' as const),
            params: validTokenParams(),
            timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
        }),
        fc.record({
            type: fc.constant('transfer' as const),
            params: fc.record({
                from: validStellarAddress(),
                to: validStellarAddress(),
                amount: validInitialSupply(),
            }),
            timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
        }),
        fc.record({
            type: fc.constant('mint' as const),
            params: fc.record({
                to: validStellarAddress(),
                amount: validInitialSupply(),
            }),
            timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
        }),
        fc.record({
            type: fc.constant('burn' as const),
            params: fc.record({
                from: validStellarAddress(),
                amount: validInitialSupply(),
            }),
            timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
        }),
        fc.record({
            type: fc.constant('approve' as const),
            params: fc.record({
                spender: validStellarAddress(),
                amount: validInitialSupply(),
            }),
            timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
        })
    );

/**
 * Generator for a sequence of token operations
 * @param minLength Minimum number of operations (default: 1)
 * @param maxLength Maximum number of operations (default: 10)
 */
export const tokenOperationSequence = (
    minLength: number = 1,
    maxLength: number = 10
): fc.Arbitrary<TokenOperation[]> =>
    fc.array(tokenOperation(), { minLength, maxLength });

// ============================================================================
// Utility Generators
// ============================================================================

/**
 * Generator for transaction hashes (64 hex characters)
 */
export const transactionHash = (): fc.Arbitrary<string> =>
    fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 64, maxLength: 64 })
        .map((chars) => chars.join(''));

/**
 * Generator for timestamps (Unix milliseconds)
 */
export const timestamp = (): fc.Arbitrary<number> =>
    fc.integer({ min: 1609459200000, max: Date.now() }); // From 2021-01-01 to now

/**
 * Generator for network types
 */
export const networkType = (): fc.Arbitrary<'testnet' | 'mainnet'> =>
    fc.constantFrom('testnet', 'mainnet');
