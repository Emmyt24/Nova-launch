import { describe, it, expect } from 'vitest';
import {
    isValidStellarAddress,
    isValidTokenName,
    isValidTokenSymbol,
    isValidDecimals,
    isValidSupply,
    isValidImageFile,
    isValidDescription,
    validateTokenParams,
} from '../validation';

describe('Validation Utilities - Comprehensive Tests', () => {
    
    describe('isValidStellarAddress', () => {
        it('should accept valid Stellar G-addresses', () => {
            // Standard valid G-address
            expect(isValidStellarAddress('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ')).toBe(true);
            // Another valid variant
            expect(isValidStellarAddress('GC72R7W76466S5F32M5BOS7U7S6ZHHGZ6N27YV6GHAX7Y6GHAX7Y6GHA')).toBe(true);
        });

        it('should reject invalid Stellar addresses', () => {
            expect(isValidStellarAddress('invalid-string')).toBe(false);
            expect(isValidStellarAddress('AXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')).toBe(false); // Wrong prefix
            expect(isValidStellarAddress('G123')).toBe(false); // Too short
            expect(isValidStellarAddress('')).toBe(false); // Empty
        });

        it('should reject addresses with invalid checksums', () => {
            // Correct length and prefix, but intentionally broken checksum
            expect(isValidStellarAddress('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSG0')).toBe(false);
        });
    });

    describe('isValidTokenName', () => {
        it('should accept valid token names', () => {
            expect(isValidTokenName('Nova Token')).toBe(true);
            expect(isValidTokenName('Project-Launch 123')).toBe(true);
        });

        it('should reject invalid token names', () => {
            expect(isValidTokenName('')).toBe(false); // Empty
            expect(isValidTokenName('a'.repeat(33))).toBe(false); // Too long (assuming 32 char limit)
            expect(isValidTokenName('Token@!#')).toBe(false); // Special characters if restricted
        });
    });

    describe('isValidTokenSymbol', () => {
        it('should accept valid symbols (1-12 uppercase alphanumeric)', () => {
            expect(isValidTokenSymbol('XLM')).toBe(true);
            expect(isValidTokenSymbol('NOVA123')).toBe(true);
            expect(isValidTokenSymbol('A')).toBe(true);
        });

        it('should reject invalid symbols', () => {
            expect(isValidTokenSymbol('')).toBe(false);
            expect(isValidTokenSymbol('nova')).toBe(false); // Lowercase
            expect(isValidTokenSymbol('A'.repeat(13))).toBe(false); // Stellar max is 12 for non-native
            expect(isValidTokenSymbol('SYM$')).toBe(false); // Special chars
        });
    });

    describe('isValidDecimals', () => {
        it('should accept valid decimal ranges (0-18)', () => {
            expect(isValidDecimals(0)).toBe(true);
            expect(isValidDecimals(7)).toBe(true);
            expect(isValidDecimals(18)).toBe(true);
        });

        it('should reject invalid decimal values', () => {
            expect(isValidDecimals(-1)).toBe(false);
            expect(isValidDecimals(19)).toBe(false);
            expect(isValidDecimals(1.5)).toBe(false); // Must be integer
        });
    });

    describe('isValidSupply', () => {
        it('should accept valid positive supply strings', () => {
            expect(isValidSupply('1')).toBe(true);
            expect(isValidSupply('1000000')).toBe(true);
        });

        it('should reject invalid supply values', () => {
            expect(isValidSupply('0')).toBe(false);
            expect(isValidSupply('-500')).toBe(false);
            expect(isValidSupply('abc')).toBe(false);
            expect(isValidSupply('')).toBe(false);
        });
    });

    describe('isValidImageFile', () => {
        it('should accept valid image types under 5MB', () => {
            const pngFile = new File(['test'], 'test.png', { type: 'image/png' });
            expect(isValidImageFile(pngFile).valid).toBe(true);
            
            const svgFile = new File(['test'], 'test.svg', { type: 'image/svg+xml' });
            expect(isValidImageFile(svgFile).valid).toBe(true);
        });

        it('should reject invalid file types', () => {
            const pdfFile = new File([''], 'test.pdf', { type: 'application/pdf' });
            const result = isValidImageFile(pdfFile);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid file type');
        });

        it('should reject files exceeding 5MB', () => {
            const blob = new ArrayBuffer(6 * 1024 * 1024); // 6MB
            const largeFile = new File([blob], 'large.png', { type: 'image/png' });
            const result = isValidImageFile(largeFile);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('5MB');
        });
    });

    describe('isValidDescription', () => {
        it('should accept descriptions within length limits', () => {
            expect(isValidDescription('A great new protocol.')).toBe(true);
            expect(isValidDescription('a'.repeat(500))).toBe(true);
        });

        it('should reject excessively long descriptions', () => {
            expect(isValidDescription('a'.repeat(501))).toBe(false);
        });
    });

    describe('validateTokenParams', () => {
        it('should return valid for correct parameter sets', () => {
            const result = validateTokenParams({
                name: 'Nova Token',
                symbol: 'NOVA',
                decimals: 7,
                initialSupply: '1000000',
                adminWallet: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
            });
            expect(result.valid).toBe(true);
            expect(Object.keys(result.errors)).toHaveLength(0);
        });

        it('should accumulate multiple errors for invalid sets', () => {
            const result = validateTokenParams({
                name: '',
                symbol: 'lowercase',
                decimals: 25,
                initialSupply: '-10',
                adminWallet: 'wrong-address',
            });
            expect(result.valid).toBe(false);
            expect(result.errors.name).toBeDefined();
            expect(result.errors.symbol).toBeDefined();
            expect(result.errors.decimals).toBeDefined();
            expect(result.errors.initialSupply).toBeDefined();
            expect(result.errors.adminWallet).toBeDefined();
        });
    });
});