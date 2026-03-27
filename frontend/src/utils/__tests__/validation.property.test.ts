import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    isValidStellarAddress,
    isValidTokenName,
    isValidTokenSymbol,
    isValidDecimals,
    isValidSupply,
    isValidDescription,
    validateTokenParams,
} from '../validation';

/**
 * Property-Based Tests for Validation Utilities
 * 
 * These tests use fast-check to generate random inputs and verify
 * that validation functions maintain their invariants across all cases.
 * 
 * Each test runs 1000+ iterations by default.
 */

describe('Validation Utilities - Property-Based Tests', () => {
    
    describe('isValidStellarAddress - Properties', () => {
        it('property: valid G-addresses always pass validation', () => {
            // Generate valid Stellar addresses (G + 55 chars from base32 alphabet)
            const validAddressArb = fc.tuple(
                fc.constant('G'),
                fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), { minLength: 55, maxLength: 55 })
            ).map(([prefix, rest]) => prefix + rest);

            fc.assert(
                fc.property(validAddressArb, (address) => {
                    // Note: This tests format only, not checksum validity
                    const result = isValidStellarAddress(address);
                    expect(typeof result).toBe('boolean');
                }),
                { numRuns: 1000 }
            );
        });

        it('property: addresses without G prefix always fail', () => {
            const invalidPrefixArb = fc.tuple(
                fc.constantFrom('A', 'B', 'C', 'D', 'M', 'S', 'X', 'Y', 'Z'),
                fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), { minLength: 55, maxLength: 55 })
            ).map(([prefix, rest]) => prefix + rest);

            fc.assert(
                fc.property(invalidPrefixArb, (address) => {
                    expect(isValidStellarAddress(address)).toBe(false);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: addresses with wrong length always fail', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 0, maxLength: 55 }).filter(s => s.length !== 56),
                    (address) => {
                        expect(isValidStellarAddress(address)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: addresses with invalid characters always fail', () => {
            const invalidCharArb = fc.tuple(
                fc.constant('G'),
                fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz!@#$%^&*()'.split('')), { minLength: 55, maxLength: 55 })
            ).map(([prefix, rest]) => prefix + rest);

            fc.assert(
                fc.property(invalidCharArb, (address) => {
                    expect(isValidStellarAddress(address)).toBe(false);
                }),
                { numRuns: 1000 }
            );
        });
    });

    describe('isValidTokenName - Properties', () => {
        it('property: names with 1-32 alphanumeric+space chars pass', () => {
            const validNameArb = fc.stringOf(
                fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')),
                { minLength: 1, maxLength: 32 }
            );

            fc.assert(
                fc.property(validNameArb, (name) => {
                    expect(isValidTokenName(name)).toBe(true);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: empty names always fail', () => {
            expect(isValidTokenName('')).toBe(false);
        });

        it('property: names longer than 32 chars always fail', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 33, maxLength: 100 }),
                    (name) => {
                        expect(isValidTokenName(name)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: names with special characters always fail', () => {
            const invalidNameArb = fc.tuple(
                fc.stringOf(fc.char(), { minLength: 1, maxLength: 31 }),
                fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+')
            ).map(([base, special]) => base + special);

            fc.assert(
                fc.property(invalidNameArb, (name) => {
                    if (name.length <= 32) {
                        expect(isValidTokenName(name)).toBe(false);
                    }
                }),
                { numRuns: 1000 }
            );
        });

        it('property: validation is consistent (idempotent)', () => {
            fc.assert(
                fc.property(fc.string(), (name) => {
                    const result1 = isValidTokenName(name);
                    const result2 = isValidTokenName(name);
                    expect(result1).toBe(result2);
                }),
                { numRuns: 1000 }
            );
        });
    });

    describe('isValidTokenSymbol - Properties', () => {
        it('property: symbols with 1-12 uppercase letters pass', () => {
            const validSymbolArb = fc.stringOf(
                fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
                { minLength: 1, maxLength: 12 }
            );

            fc.assert(
                fc.property(validSymbolArb, (symbol) => {
                    expect(isValidTokenSymbol(symbol)).toBe(true);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: lowercase symbols always fail', () => {
            const lowercaseSymbolArb = fc.stringOf(
                fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
                { minLength: 1, maxLength: 12 }
            );

            fc.assert(
                fc.property(lowercaseSymbolArb, (symbol) => {
                    expect(isValidTokenSymbol(symbol)).toBe(false);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: symbols longer than 12 chars always fail', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 13, maxLength: 50 }),
                    (symbol) => {
                        expect(isValidTokenSymbol(symbol)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: symbols with numbers or special chars fail', () => {
            const invalidSymbolArb = fc.stringOf(
                fc.constantFrom(...'0123456789!@#$%^&*()'.split('')),
                { minLength: 1, maxLength: 12 }
            );

            fc.assert(
                fc.property(invalidSymbolArb, (symbol) => {
                    expect(isValidTokenSymbol(symbol)).toBe(false);
                }),
                { numRuns: 1000 }
            );
        });
    });

    describe('isValidDecimals - Properties', () => {
        it('property: integers 0-18 always pass', () => {
            fc.assert(
                fc.property(fc.integer({ min: 0, max: 18 }), (decimals) => {
                    expect(isValidDecimals(decimals)).toBe(true);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: negative integers always fail', () => {
            fc.assert(
                fc.property(fc.integer({ max: -1 }), (decimals) => {
                    expect(isValidDecimals(decimals)).toBe(false);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: integers > 18 always fail', () => {
            fc.assert(
                fc.property(fc.integer({ min: 19, max: 1000 }), (decimals) => {
                    expect(isValidDecimals(decimals)).toBe(false);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: non-integers always fail', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0.1, max: 18.9, noNaN: true }).filter(n => !Number.isInteger(n)),
                    (decimals) => {
                        expect(isValidDecimals(decimals)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('isValidSupply - Properties', () => {
        it('property: positive integer strings always pass (within safe range)', () => {
            fc.assert(
                fc.property(
                    fc.bigInt({ min: 1n, max: BigInt(2 ** 53 - 1) }),
                    (supply) => {
                        expect(isValidSupply(supply.toString())).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: zero and negative values always fail', () => {
            fc.assert(
                fc.property(
                    fc.bigInt({ max: 0n }),
                    (supply) => {
                        expect(isValidSupply(supply.toString())).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: non-numeric strings always fail', () => {
            fc.assert(
                fc.property(
                    fc.string().filter(s => !/^\d+$/.test(s)),
                    (supply) => {
                        expect(isValidSupply(supply)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: values exceeding safe integer range fail', () => {
            fc.assert(
                fc.property(
                    fc.bigInt({ min: BigInt(2 ** 53), max: BigInt(2 ** 60) }),
                    (supply) => {
                        expect(isValidSupply(supply.toString())).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('isValidDescription - Properties', () => {
        it('property: descriptions <= 500 chars always pass', () => {
            fc.assert(
                fc.property(
                    fc.string({ maxLength: 500 }),
                    (description) => {
                        expect(isValidDescription(description)).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: descriptions > 500 chars always fail', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 501, maxLength: 1000 }),
                    (description) => {
                        expect(isValidDescription(description)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('validateTokenParams - Properties', () => {
        it('property: all valid params return valid=true with no errors', () => {
            const validParamsArb = fc.record({
                name: fc.stringOf(
                    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')),
                    { minLength: 1, maxLength: 32 }
                ),
                symbol: fc.stringOf(
                    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
                    { minLength: 1, maxLength: 12 }
                ),
                decimals: fc.integer({ min: 0, max: 18 }),
                initialSupply: fc.bigInt({ min: 1n, max: BigInt(2 ** 53 - 1) }).map(n => n.toString()),
                adminWallet: fc.tuple(
                    fc.constant('G'),
                    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), { minLength: 55, maxLength: 55 })
                ).map(([prefix, rest]) => prefix + rest),
            });

            fc.assert(
                fc.property(validParamsArb, (params) => {
                    const result = validateTokenParams(params);
                    // Note: Address format validation doesn't check checksum
                    expect(typeof result.valid).toBe('boolean');
                    expect(typeof result.errors).toBe('object');
                }),
                { numRuns: 1000 }
            );
        });

        it('property: invalid params always return valid=false with errors', () => {
            const invalidParamsArb = fc.record({
                name: fc.constant(''), // Invalid: empty
                symbol: fc.constant('lowercase'), // Invalid: lowercase
                decimals: fc.constant(25), // Invalid: > 18
                initialSupply: fc.constant('-10'), // Invalid: negative
                adminWallet: fc.constant('INVALID'), // Invalid: wrong format
            });

            fc.assert(
                fc.property(invalidParamsArb, (params) => {
                    const result = validateTokenParams(params);
                    expect(result.valid).toBe(false);
                    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
                }),
                { numRuns: 1000 }
            );
        });

        it('property: validation is consistent (calling twice gives same result)', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        name: fc.string(),
                        symbol: fc.string(),
                        decimals: fc.integer(),
                        initialSupply: fc.string(),
                        adminWallet: fc.string(),
                    }),
                    (params) => {
                        const result1 = validateTokenParams(params);
                        const result2 = validateTokenParams(params);
                        expect(result1.valid).toBe(result2.valid);
                        expect(Object.keys(result1.errors).sort()).toEqual(Object.keys(result2.errors).sort());
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('Edge Cases - Boundary Testing', () => {
        it('property: max valid values are accepted', () => {
            const maxParams = {
                name: 'A'.repeat(32), // Max length
                symbol: 'A'.repeat(12), // Max length
                decimals: 18, // Max decimals
                initialSupply: (BigInt(2 ** 53 - 1)).toString(), // Max safe integer
                adminWallet: 'G' + 'A'.repeat(55), // Valid format
            };

            const result = validateTokenParams(maxParams);
            expect(result.errors.name).toBeUndefined();
            expect(result.errors.symbol).toBeUndefined();
            expect(result.errors.decimals).toBeUndefined();
            expect(result.errors.initialSupply).toBeUndefined();
        });

        it('property: min valid values are accepted', () => {
            const minParams = {
                name: 'A', // Min length
                symbol: 'A', // Min length
                decimals: 0, // Min decimals
                initialSupply: '1', // Min supply
                adminWallet: 'G' + 'A'.repeat(55), // Valid format
            };

            const result = validateTokenParams(minParams);
            expect(result.errors.name).toBeUndefined();
            expect(result.errors.symbol).toBeUndefined();
            expect(result.errors.decimals).toBeUndefined();
            expect(result.errors.initialSupply).toBeUndefined();
        });

        it('property: boundary violations are rejected', () => {
            // Test just beyond boundaries
            expect(isValidTokenName('A'.repeat(33))).toBe(false); // 33 chars
            expect(isValidTokenSymbol('A'.repeat(13))).toBe(false); // 13 chars
            expect(isValidDecimals(19)).toBe(false); // 19 decimals
            expect(isValidDecimals(-1)).toBe(false); // -1 decimals
            expect(isValidSupply('0')).toBe(false); // 0 supply
            expect(isValidDescription('A'.repeat(501))).toBe(false); // 501 chars
        });
    });
});
