import * as fc from 'fast-check';

/**
 * Property-based testing generators for Stellar Token Deployer
 */

// Generator for valid Stellar addresses (G followed by 55 base32 chars)
export const validStellarAddress = () =>
    fc
        .string({ minLength: 55, maxLength: 55 })
        .map((s) => 'G' + s.toUpperCase().replace(/[^A-Z2-7]/g, 'A'));

// Generator for invalid Stellar addresses
export const invalidStellarAddress = () =>
    fc.oneof(
        fc.string({ maxLength: 55 }), // Too short
        fc.string({ minLength: 57 }), // Too long
        fc.string().filter((s) => !/^G/.test(s)), // Wrong prefix
        fc.constant(''), // Empty
    );

// Generator for valid token names (1-32 chars)
export const validTokenName = () =>
    fc.string({ minLength: 1, maxLength: 32 });

// Generator for valid token symbols (1-12 chars, uppercase)
export const validTokenSymbol = () =>
    fc
        .string({ minLength: 1, maxLength: 12 })
        .map((s) => s.toUpperCase().replace(/[^A-Z]/g, 'A'));

// Generator for valid decimals (0-18)
export const validDecimals = () => fc.integer({ min: 0, max: 18 });

// Generator for valid initial supply
export const validInitialSupply = () =>
    fc.bigInt({ min: 1n, max: BigInt(2 ** 53 - 1) }).map((n) => n.toString());

// Generator for valid token deployment parameters
export const validTokenParams = () =>
    fc.record({
        name: validTokenName(),
        symbol: validTokenSymbol(),
        decimals: validDecimals(),
        initialSupply: validInitialSupply(),
        adminWallet: validStellarAddress(),
        metadata: fc.option(
            fc.record({
                description: fc.string({ maxLength: 500 }),
            }),
            { nil: undefined }
        ),
    });

// Generator for fee amounts (in XLM)
export const validFeeAmount = () => fc.integer({ min: 5, max: 20 });

// Generator for insufficient fee amounts
export const insufficientFeeAmount = () => fc.integer({ min: 0, max: 4 });
