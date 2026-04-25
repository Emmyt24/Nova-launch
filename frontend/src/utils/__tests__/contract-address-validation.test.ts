import { describe, it, expect } from 'vitest';
import {
    isValidContractId,
    checkNetworkContractMismatch,
    CONTRACT_ID_REGEX,
} from '../validation';

// A syntactically valid 56-char contract ID (C + 55 base32 chars)
const VALID_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('isValidContractId', () => {
    it('accepts a well-formed contract ID', () => {
        expect(isValidContractId(VALID_CONTRACT_ID)).toBe(true);
    });

    it('rejects an empty string', () => {
        expect(isValidContractId('')).toBe(false);
    });

    it('rejects a Stellar account address (starts with G)', () => {
        expect(isValidContractId('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    });

    it('rejects a contract ID that is too short', () => {
        expect(isValidContractId('CSHORT')).toBe(false);
    });

    it('rejects a contract ID with invalid characters', () => {
        // lowercase is not valid base32
        expect(isValidContractId('Caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    });

    it('CONTRACT_ID_REGEX matches the same set', () => {
        expect(CONTRACT_ID_REGEX.test(VALID_CONTRACT_ID)).toBe(true);
        expect(CONTRACT_ID_REGEX.test('GTEST')).toBe(false);
    });
});

describe('checkNetworkContractMismatch', () => {
    it('returns no mismatch when wallet and config networks match', () => {
        const result = checkNetworkContractMismatch(VALID_CONTRACT_ID, 'testnet', 'testnet');
        expect(result.mismatch).toBe(false);
        expect(result.message).toBeUndefined();
    });

    it('returns mismatch when wallet is mainnet but config is testnet', () => {
        const result = checkNetworkContractMismatch(VALID_CONTRACT_ID, 'mainnet', 'testnet');
        expect(result.mismatch).toBe(true);
        expect(result.message).toMatch(/mainnet/i);
        expect(result.message).toMatch(/testnet/i);
    });

    it('returns mismatch when wallet is testnet but config is mainnet', () => {
        const result = checkNetworkContractMismatch(VALID_CONTRACT_ID, 'testnet', 'mainnet');
        expect(result.mismatch).toBe(true);
    });

    it('returns mismatch for a malformed contract ID regardless of network', () => {
        const result = checkNetworkContractMismatch('INVALID', 'testnet', 'testnet');
        expect(result.mismatch).toBe(true);
        expect(result.message).toMatch(/malformed/i);
    });
});
