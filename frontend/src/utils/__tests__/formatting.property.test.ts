import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    formatXLM,
    formatNumber,
    truncateAddress,
    formatDate,
    formatRelativeTime,
    stroopsToXLM,
    xlmToStroops,
    formatFileSize,
    getErrorMessage,
} from '../formatting';

/**
 * Property-Based Tests for Formatting Utilities
 * 
 * These tests verify that formatting functions maintain their invariants:
 * - Formatting is consistent
 * - Conversions are reversible (where applicable)
 * - Edge cases are handled gracefully
 * - No crashes on random inputs
 */

describe('Formatting Utilities - Property-Based Tests', () => {
    
    describe('formatXLM - Properties', () => {
        it('property: always returns a string', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 1e15, noNaN: true, noDefaultInfinity: true }),
                    (amount: number) => {
                        const result = formatXLM(amount);
                        expect(typeof result).toBe('string');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatted output contains only valid number characters', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 1e10, noNaN: true, noDefaultInfinity: true }),
                    (amount: number) => {
                        const result = formatXLM(amount);
                        // Should only contain digits, commas, and decimal point
                        expect(/^[\d,.]+$/.test(result)).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatting is consistent (idempotent)', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 1e10, noNaN: true, noDefaultInfinity: true }),
                    (amount: number) => {
                        const result1 = formatXLM(amount);
                        const result2 = formatXLM(amount);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: accepts both string and number inputs', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 1e10, noNaN: true, noDefaultInfinity: true }),
                    (amount: number) => {
                        const fromNumber = formatXLM(amount);
                        const fromString = formatXLM(amount.toString());
                        // Results should be equivalent (allowing for floating point precision)
                        expect(typeof fromNumber).toBe('string');
                        expect(typeof fromString).toBe('string');
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('formatNumber - Properties', () => {
        it('property: always returns a string', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 1e15, noNaN: true, noDefaultInfinity: true }),
                    (value: number) => {
                        const result = formatNumber(value);
                        expect(typeof result).toBe('string');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: large numbers include comma separators', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1000, max: 1e9 }),
                    (value: number) => {
                        const result = formatNumber(value);
                        // Numbers >= 1000 should have commas
                        expect(result).toMatch(/,/);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatting is consistent', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 1e10, noNaN: true, noDefaultInfinity: true }),
                    (value: number) => {
                        const result1 = formatNumber(value);
                        const result2 = formatNumber(value);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('truncateAddress - Properties', () => {
        it('property: short addresses are not truncated', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 10 }),
                    (address: string) => {
                        const result = truncateAddress(address);
                        expect(result).toBe(address);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: long addresses are always truncated', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 50, maxLength: 100 }),
                    (address: string) => {
                        const result = truncateAddress(address);
                        expect(result.length).toBeLessThan(address.length);
                        expect(result).toContain('...');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: truncated addresses preserve start and end', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 50, maxLength: 100 }),
                    fc.integer({ min: 1, max: 10 }),
                    fc.integer({ min: 1, max: 10 }),
                    (address: string, startChars: number, endChars: number) => {
                        const result = truncateAddress(address, startChars, endChars);
                        if (address.length > startChars + endChars) {
                            expect(result.startsWith(address.slice(0, startChars))).toBe(true);
                            expect(result.endsWith(address.slice(-endChars))).toBe(true);
                        }
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: truncation is consistent', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (address: string) => {
                        const result1 = truncateAddress(address);
                        const result2 = truncateAddress(address);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('stroopsToXLM and xlmToStroops - Properties', () => {
        it('property: conversion is reversible for integers', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 1e15 }),
                    (stroops: number) => {
                        const xlm = stroopsToXLM(stroops);
                        const backToStroops = xlmToStroops(xlm);
                        // Should be equal (accounting for integer rounding)
                        expect(Math.abs(backToStroops - stroops)).toBeLessThanOrEqual(1);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: stroopsToXLM always divides by 10_000_000', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 1e15 }),
                    (stroops: number) => {
                        const xlm = stroopsToXLM(stroops);
                        const expected = stroops / 10_000_000;
                        expect(xlm).toBe(expected);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: xlmToStroops always multiplies by 10_000_000', () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0, max: 1e8, noNaN: true, noDefaultInfinity: true }),
                    (xlm: number) => {
                        const stroops = xlmToStroops(xlm);
                        const expected = Math.floor(xlm * 10_000_000);
                        expect(stroops).toBe(expected);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: conversions never overflow', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER / 10_000_000 }),
                    (xlm: number) => {
                        const stroops = xlmToStroops(xlm);
                        expect(Number.isSafeInteger(stroops)).toBe(true);
                        expect(stroops).toBeGreaterThanOrEqual(0);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: accepts both string and number inputs', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 1e12 }),
                    (stroops: number) => {
                        const fromNumber = stroopsToXLM(stroops);
                        const fromString = stroopsToXLM(stroops.toString());
                        expect(fromNumber).toBe(fromString);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('formatFileSize - Properties', () => {
        it('property: always returns a string with unit', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 1e9 }),
                    (bytes: number) => {
                        const result = formatFileSize(bytes);
                        expect(typeof result).toBe('string');
                        expect(result).toMatch(/\s(B|KB|MB)$/);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: bytes < 1024 show as B', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 1023 }),
                    (bytes: number) => {
                        const result = formatFileSize(bytes);
                        expect(result).toMatch(/^\d+ B$/);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: bytes >= 1024 and < 1MB show as KB', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1024, max: 1024 * 1024 - 1 }),
                    (bytes: number) => {
                        const result = formatFileSize(bytes);
                        expect(result).toMatch(/KB$/);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: bytes >= 1MB show as MB', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1024 * 1024, max: 1024 * 1024 * 1024 }),
                    (bytes: number) => {
                        const result = formatFileSize(bytes);
                        expect(result).toMatch(/MB$/);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatting is consistent', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 1e9 }),
                    (bytes: number) => {
                        const result1 = formatFileSize(bytes);
                        const result2 = formatFileSize(bytes);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('formatDate - Properties', () => {
        it('property: always returns a string', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: Date.now() + 1e12 }),
                    (timestamp: number) => {
                        const result = formatDate(timestamp);
                        expect(typeof result).toBe('string');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatted date contains expected components', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: Date.now() + 1e12 }),
                    (timestamp: number) => {
                        const result = formatDate(timestamp);
                        // Should contain month, day, year, time
                        expect(result.length).toBeGreaterThan(0);
                        expect(result).toMatch(/\d/); // Contains digits
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatting is consistent', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: Date.now() + 1e12 }),
                    (timestamp: number) => {
                        const result1 = formatDate(timestamp);
                        const result2 = formatDate(timestamp);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('formatRelativeTime - Properties', () => {
        it('property: always returns a string', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: Date.now() }),
                    (timestamp: number) => {
                        const result = formatRelativeTime(timestamp);
                        expect(typeof result).toBe('string');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: recent timestamps show "Just now"', () => {
            const now = Date.now();
            fc.assert(
                fc.property(
                    fc.integer({ min: now - 59000, max: now }),
                    (timestamp: number) => {
                        const result = formatRelativeTime(timestamp);
                        expect(result).toBe('Just now');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: old timestamps show days/hours/minutes', () => {
            const now = Date.now();
            fc.assert(
                fc.property(
                    fc.integer({ min: now - 86400000 * 30, max: now - 60000 }),
                    (timestamp: number) => {
                        const result = formatRelativeTime(timestamp);
                        expect(result).toMatch(/(day|hour|minute)s? ago/);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatting is consistent', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: Date.now() }),
                    (timestamp: number) => {
                        const result1 = formatRelativeTime(timestamp);
                        const result2 = formatRelativeTime(timestamp);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('getErrorMessage - Properties', () => {
        it('property: always returns a string', () => {
            fc.assert(
                fc.property(
                    fc.anything(),
                    (error: unknown) => {
                        const result = getErrorMessage(error);
                        expect(typeof result).toBe('string');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: Error objects return their message', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (message: string) => {
                        const error = new Error(message);
                        const result = getErrorMessage(error);
                        expect(result).toBe(message);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: string errors return themselves', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (error: string) => {
                        const result = getErrorMessage(error);
                        expect(result).toBe(error);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: unknown errors return default message', () => {
            fc.assert(
                fc.property(
                    fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
                    (error: unknown) => {
                        const result = getErrorMessage(error);
                        expect(result).toBe('An unknown error occurred');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: formatting is consistent', () => {
            fc.assert(
                fc.property(
                    fc.anything(),
                    (error: unknown) => {
                        const result1 = getErrorMessage(error);
                        const result2 = getErrorMessage(error);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('Edge Cases and Invariants', () => {
        it('property: no formatting function throws on valid inputs', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        xlm: fc.double({ min: 0, max: 1e10, noNaN: true, noDefaultInfinity: true }),
                        number: fc.double({ min: 0, max: 1e10, noNaN: true, noDefaultInfinity: true }),
                        address: fc.string({ minLength: 1, maxLength: 100 }),
                        timestamp: fc.integer({ min: 0, max: Date.now() + 1e12 }),
                        stroops: fc.integer({ min: 0, max: 1e15 }),
                        bytes: fc.integer({ min: 0, max: 1e9 }),
                    }),
                    (inputs: {
                        xlm: number;
                        number: number;
                        address: string;
                        timestamp: number;
                        stroops: number;
                        bytes: number;
                    }) => {
                        expect(() => formatXLM(inputs.xlm)).not.toThrow();
                        expect(() => formatNumber(inputs.number)).not.toThrow();
                        expect(() => truncateAddress(inputs.address)).not.toThrow();
                        expect(() => formatDate(inputs.timestamp)).not.toThrow();
                        expect(() => formatRelativeTime(inputs.timestamp)).not.toThrow();
                        expect(() => stroopsToXLM(inputs.stroops)).not.toThrow();
                        expect(() => xlmToStroops(inputs.xlm)).not.toThrow();
                        expect(() => formatFileSize(inputs.bytes)).not.toThrow();
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('property: all formatting functions are deterministic', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        xlm: fc.double({ min: 0, max: 1e10, noNaN: true, noDefaultInfinity: true }),
                        address: fc.string({ minLength: 1, maxLength: 100 }),
                        timestamp: fc.integer({ min: 0, max: Date.now() }),
                    }),
                    (inputs: { xlm: number; address: string; timestamp: number }) => {
                        // Call each function twice and verify same result
                        expect(formatXLM(inputs.xlm)).toBe(formatXLM(inputs.xlm));
                        expect(truncateAddress(inputs.address)).toBe(truncateAddress(inputs.address));
                        expect(formatDate(inputs.timestamp)).toBe(formatDate(inputs.timestamp));
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });
});