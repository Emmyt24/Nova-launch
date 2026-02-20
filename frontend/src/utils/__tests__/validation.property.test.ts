import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isValidStellarAddress } from '../validation';
import {
    validStellarAddress,
    invalidStellarAddress,
    invalidStellarAddressWithReason,
} from '../../test/generators';

/**
 * Property-based tests for Stellar address validation
 * Runs 1000+ iterations to verify validation logic
 */
describe('Stellar Address Validation - Property Tests', () => {
    describe('Valid Stellar addresses', () => {
        it('should accept all properly formatted Stellar addresses', () => {
            fc.assert(
                fc.property(validStellarAddress(), (address) => {
                    expect(isValidStellarAddress(address)).toBe(true);
                }),
                { numRuns: 1000 }
            );
        });

        it('should always start with G', () => {
            fc.assert(
                fc.property(validStellarAddress(), (address) => {
                    expect(address[0]).toBe('G');
                }),
                { numRuns: 1000 }
            );
        });

        it('should always be exactly 56 characters', () => {
            fc.assert(
                fc.property(validStellarAddress(), (address) => {
                    expect(address.length).toBe(56);
                }),
                { numRuns: 1000 }
            );
        });

        it('should only contain valid base32 characters (A-Z, 2-7)', () => {
            fc.assert(
                fc.property(validStellarAddress(), (address) => {
                    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
                    for (const char of address) {
                        expect(base32Chars.includes(char)).toBe(true);
                    }
                }),
                { numRuns: 1000 }
            );
        });
    });

    describe('Invalid Stellar addresses', () => {
        it('should reject addresses with wrong length', () => {
            fc.assert(
                fc.property(
                    fc.oneof(
                        fc.string({ maxLength: 55 }), // Too short
                        fc.string({ minLength: 57, maxLength: 100 }) // Too long
                    ),
                    (address) => {
                        if (address.length !== 56) {
                            expect(isValidStellarAddress(address)).toBe(false);
                        }
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should reject addresses not starting with G', () => {
            fc.assert(
                fc.property(
                    fc
                        .tuple(
                            fc.constantFrom(...'ABCDEFHIJKLMNOPQRSTUVWXYZ234567'.split('')),
                            fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), { minLength: 55, maxLength: 55 })
                        )
                        .map(([prefix, rest]) => prefix + rest.join('')),
                    (address) => {
                        expect(isValidStellarAddress(address)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should reject addresses with invalid characters', () => {
            fc.assert(
                fc.property(
                    fc
                        .tuple(
                            fc.constant('G'),
                            fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), { minLength: 54, maxLength: 54 }),
                            fc.constantFrom(...'0189abcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+'.split(''))
                        )
                        .map(([prefix, middle, invalidChar]) => prefix + middle.join('') + invalidChar),
                    (address) => {
                        expect(isValidStellarAddress(address)).toBe(false);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should reject empty strings', () => {
            expect(isValidStellarAddress('')).toBe(false);
        });

        it('should reject all generated invalid addresses', () => {
            fc.assert(
                fc.property(invalidStellarAddress(), (address) => {
                    expect(isValidStellarAddress(address)).toBe(false);
                }),
                { numRuns: 1000 }
            );
        });

        it('should reject invalid addresses with specific reasons', () => {
            fc.assert(
                fc.property(invalidStellarAddressWithReason(), ({ address, reason }) => {
                    expect(isValidStellarAddress(address)).toBe(false);
                    // Verify the reason matches the actual issue
                    switch (reason) {
                        case 'too_short':
                            expect(address.length).toBeLessThan(56);
                            break;
                        case 'too_long':
                            expect(address.length).toBeGreaterThan(56);
                            break;
                        case 'wrong_prefix':
                            expect(address[0]).not.toBe('G');
                            break;
                        case 'invalid_chars':
                            expect(address).toMatch(/[^A-Z2-7]/);
                            break;
                        case 'empty':
                            expect(address).toBe('');
                            break;
                    }
                }),
                { numRuns: 1000 }
            );
        });
    });

    describe('Edge cases', () => {
        it('should handle null and undefined gracefully', () => {
            // @ts-expect-error Testing runtime behavior
            expect(isValidStellarAddress(null)).toBe(false);
            // @ts-expect-error Testing runtime behavior
            expect(isValidStellarAddress(undefined)).toBe(false);
        });

        it('should handle whitespace', () => {
            fc.assert(
                fc.property(
                    validStellarAddress().chain((addr) =>
                        fc.constantFrom(
                            ` ${addr}`,
                            `${addr} `,
                            ` ${addr} `,
                            `\t${addr}`,
                            `${addr}\n`
                        )
                    ),
                    (address) => {
                        expect(isValidStellarAddress(address)).toBe(false);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should be case-sensitive (lowercase should fail)', () => {
            fc.assert(
                fc.property(
                    validStellarAddress().map((addr) => addr.toLowerCase()),
                    (address) => {
                        expect(isValidStellarAddress(address)).toBe(false);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should handle mixed case (should fail)', () => {
            fc.assert(
                fc.property(
                    validStellarAddress().chain((addr) =>
                        fc.integer({ min: 1, max: addr.length - 1 }).map((pos) =>
                            addr.substring(0, pos) + addr.substring(pos).toLowerCase()
                        )
                    ),
                    (address) => {
                        expect(isValidStellarAddress(address)).toBe(false);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Idempotency', () => {
        it('should return same result when called multiple times', () => {
            fc.assert(
                fc.property(fc.string(), (address) => {
                    const result1 = isValidStellarAddress(address);
                    const result2 = isValidStellarAddress(address);
                    const result3 = isValidStellarAddress(address);
                    expect(result1).toBe(result2);
                    expect(result2).toBe(result3);
                }),
                { numRuns: 1000 }
            );
        });
    });
});
