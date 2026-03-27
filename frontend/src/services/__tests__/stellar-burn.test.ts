import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StellarService } from '../stellar';
import { ErrorCode } from '../../types';
import type { BurnTokenParams } from '../../types';

vi.mock('@stellar/stellar-sdk', () => ({
  Address: {
    fromString: vi.fn((addr: string) => {
      if (!addr.startsWith('G')) throw new Error('Invalid address');
      return { toScAddress: () => ({}) };
    }),
  },
  Contract: vi.fn(),
  TransactionBuilder: vi.fn(() => ({
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn(() => ({ toXDR: () => 'mock-xdr' })),
    fromXDR: vi.fn(() => ({})),
  })),
  nativeToScVal: vi.fn((val: any) => val),
  BASE_FEE: '100',
  SorobanRpc: {
    Server: vi.fn(() => ({
      getAccount: vi.fn(() => Promise.resolve({ sequenceNumber: () => '1' })),
      prepareTransaction: vi.fn((tx) => Promise.resolve(tx)),
      sendTransaction: vi.fn(() => Promise.resolve({ hash: 'mock-hash' })),
      getTransaction: vi.fn(() => Promise.resolve({ status: 'SUCCESS', returnValue: null })),
      getEvents: vi.fn(() => Promise.resolve({ events: [] })),
    })),
  },
  Horizon: {
    Server: vi.fn(),
  },
}));

describe('StellarService - Burn Functionality', () => {
  let service: StellarService;
  const mockTokenAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const mockFromAddress = 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';

  beforeEach(() => {
    service = new StellarService('testnet');
    vi.clearAllMocks();
    
    (global as any).window = {
      freighter: {
        signTransaction: vi.fn(() => Promise.resolve({ signedTxXdr: 'signed-xdr' })),
      },
    };
  });

  describe('burnTokens', () => {
    it('should burn tokens successfully', async () => {
      const params: BurnTokenParams = {
        tokenAddress: mockTokenAddress,
        from: mockFromAddress,
        amount: '100',
      };

      const result = await service.burnTokens(params);

      expect(result).toHaveProperty('txHash');
      expect(result.burnedAmount).toBe('100');
      expect(result).toHaveProperty('newBalance');
      expect(result).toHaveProperty('newSupply');
    });

    it('should reject invalid token address', async () => {
      const params: BurnTokenParams = {
        tokenAddress: 'invalid',
        from: mockFromAddress,
        amount: '100',
      };

      await expect(service.burnTokens(params)).rejects.toMatchObject({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid address format',
      });
    });

    it('should reject zero amount', async () => {
      const params: BurnTokenParams = {
        tokenAddress: mockTokenAddress,
        from: mockFromAddress,
        amount: '0',
      };

      await expect(service.burnTokens(params)).rejects.toMatchObject({
        code: ErrorCode.INVALID_AMOUNT,
      });
    });

    it('should reject negative amount', async () => {
      const params: BurnTokenParams = {
        tokenAddress: mockTokenAddress,
        from: mockFromAddress,
        amount: '-100',
      };

      await expect(service.burnTokens(params)).rejects.toMatchObject({
        code: ErrorCode.INVALID_AMOUNT,
      });
    });

    it('should handle insufficient balance error', async () => {
      (global as any).window.freighter.signTransaction = vi.fn(() =>
        Promise.reject(new Error('BurnAmountExceedsBalance'))
      );

      const params: BurnTokenParams = {
        tokenAddress: mockTokenAddress,
        from: mockFromAddress,
        amount: '100',
      };

      await expect(service.burnTokens(params)).rejects.toMatchObject({
        code: ErrorCode.INSUFFICIENT_BALANCE,
        message: 'Insufficient balance to burn',
      });
    });

    it('should handle unauthorized error', async () => {
      (global as any).window.freighter.signTransaction = vi.fn(() =>
        Promise.reject(new Error('Unauthorized'))
      );

      const params: BurnTokenParams = {
        tokenAddress: mockTokenAddress,
        from: mockFromAddress,
        amount: '100',
      };

      await expect(service.burnTokens(params)).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      });
    });

    it('should handle wallet rejection', async () => {
      (global as any).window.freighter.signTransaction = vi.fn(() =>
        Promise.reject(new Error('User rejected'))
      );

      const params: BurnTokenParams = {
        tokenAddress: mockTokenAddress,
        from: mockFromAddress,
        amount: '100',
      };

      await expect(service.burnTokens(params)).rejects.toMatchObject({
        code: ErrorCode.WALLET_REJECTED,
      });
    });
  });

  describe('getBurnHistory', () => {
    it('should fetch burn history successfully', async () => {
      const history = await service.getBurnHistory(mockTokenAddress);

      expect(Array.isArray(history)).toBe(true);
    });

    it('should reject invalid token address', async () => {
      await expect(service.getBurnHistory('invalid')).rejects.toMatchObject({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid token address',
      });
    });

    it('should return empty array when no events', async () => {
      const history = await service.getBurnHistory(mockTokenAddress);

      expect(history).toEqual([]);
    });
  });
});
