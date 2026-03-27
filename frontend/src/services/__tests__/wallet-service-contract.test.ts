/**
 * Wallet Service Contract Tests
 * 
 * Tests the canonical wallet service contract to ensure consistent behavior
 * across all integration flows (connect, disconnect, network switch, signing)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WalletService } from '../wallet';
import * as freighterApi from '@stellar/freighter-api';

// Mock Freighter API
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  requestAccess: vi.fn(),
  WatchWalletChanges: vi.fn(),
}));

describe('WalletService - Contract Tests', () => {
  const mockAddress = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12';
  const mockXdr = 'AAAAAgAAAAA...';
  const mockSignedXdr = 'AAAAAgAAAAB...';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Installation Detection', () => {
    it('should detect when Freighter is installed', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });

      const installed = await WalletService.isInstalled();

      expect(installed).toBe(true);
      expect(freighterApi.isConnected).toHaveBeenCalled();
    });

    it('should detect when Freighter is not installed', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

      const installed = await WalletService.isInstalled();

      expect(installed).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(freighterApi.isConnected).mockRejectedValue(new Error('API error'));

      const installed = await WalletService.isInstalled();

      expect(installed).toBe(false);
    });
  });

  describe('Connection Flow', () => {
    it('should connect successfully when wallet is installed', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.requestAccess).mockResolvedValue({ address: mockAddress });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: mockAddress });

      const address = await WalletService.connect();

      expect(address).toBe(mockAddress);
      expect(freighterApi.requestAccess).toHaveBeenCalled();
      expect(freighterApi.getAddress).toHaveBeenCalled();
    });

    it('should throw error when wallet is not installed', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

      await expect(WalletService.connect()).rejects.toThrow('Freighter wallet is not installed');
      expect(freighterApi.requestAccess).not.toHaveBeenCalled();
    });

    it('should throw user-friendly error when connection is rejected', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.requestAccess).mockRejectedValue(new Error('User declined access'));

      await expect(WalletService.connect()).rejects.toThrow('Connection request rejected by user');
    });

    it('should throw error when address retrieval fails', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.requestAccess).mockResolvedValue({ address: mockAddress });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: '' });

      await expect(WalletService.connect()).rejects.toThrow('Failed to retrieve wallet address');
    });
  });

  describe('Disconnection', () => {
    it('should disconnect without errors', () => {
      // Freighter doesn't have a disconnect method, so this should just work
      expect(() => WalletService.disconnect()).not.toThrow();
    });
  });

  describe('Public Key Retrieval', () => {
    it('should get public key when wallet is connected', async () => {
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: mockAddress });

      const publicKey = await WalletService.getPublicKey();

      expect(publicKey).toBe(mockAddress);
    });

    it('should return null when address is not available', async () => {
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: '' });

      const publicKey = await WalletService.getPublicKey();

      expect(publicKey).toBeNull();
    });

    it('should return null on error', async () => {
      vi.mocked(freighterApi.getAddress).mockRejectedValue(new Error('API error'));

      const publicKey = await WalletService.getPublicKey();

      expect(publicKey).toBeNull();
    });
  });

  describe('Network Detection', () => {
    it('should detect testnet network', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ 
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015'
      });

      const network = await WalletService.getNetwork();

      expect(network).toBe('testnet');
    });

    it('should detect mainnet network (PUBLIC)', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ 
        network: 'PUBLIC',
        networkPassphrase: 'Public Global Stellar Network ; September 2015'
      });

      const network = await WalletService.getNetwork();

      expect(network).toBe('mainnet');
    });

    it('should default to testnet on error', async () => {
      vi.mocked(freighterApi.getNetwork).mockRejectedValue(new Error('API error'));

      const network = await WalletService.getNetwork();

      expect(network).toBe('testnet');
    });

    it('should handle empty network response', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ 
        network: '',
        networkPassphrase: ''
      });

      const network = await WalletService.getNetwork();

      expect(network).toBe('testnet');
    });
  });

  describe('Balance Checking', () => {
    it('should get balance for valid address', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ 
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015'
      });

      const mockAccountData = {
        balances: [
          { asset_type: 'native', balance: '100.5000000' },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAccountData,
      }) as any;

      const balance = await WalletService.getBalance(mockAddress);

      expect(balance).toBe('100.5000000');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/accounts/${mockAddress}`)
      );
    });

    it('should throw error for invalid address format', async () => {
      await expect(WalletService.getBalance('invalid')).rejects.toThrow('Invalid Stellar address');
      await expect(WalletService.getBalance('CABCD')).rejects.toThrow('Invalid Stellar address');
      await expect(WalletService.getBalance('')).rejects.toThrow('Invalid Stellar address');
    });

    it('should throw user-friendly error for unfunded account', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ 
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015'
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }) as any;

      await expect(WalletService.getBalance(mockAddress)).rejects.toThrow(
        'Account not found. Please fund your account first.'
      );
    });

    it('should handle network errors', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ 
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015'
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

      await expect(WalletService.getBalance(mockAddress)).rejects.toThrow();
    });

    it('should return 0 when no native balance exists', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ 
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015'
      });

      const mockAccountData = {
        balances: [
          { asset_type: 'credit_alphanum4', balance: '50.0000000' },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAccountData,
      }) as any;

      const balance = await WalletService.getBalance(mockAddress);

      expect(balance).toBe('0');
    });
  });

  describe('Transaction Signing', () => {
    it('should sign transaction successfully', async () => {
      vi.mocked(freighterApi.signTransaction).mockResolvedValue({
        signedTxXdr: mockSignedXdr,
        signerAddress: mockAddress,
      });

      const signedXdr = await WalletService.signTransaction(mockXdr, 'Test SDF Network ; September 2015');

      expect(signedXdr).toBe(mockSignedXdr);
      expect(freighterApi.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    it('should return null when signing fails', async () => {
      vi.mocked(freighterApi.signTransaction).mockRejectedValue(new Error('User rejected'));

      const signedXdr = await WalletService.signTransaction(mockXdr);

      expect(signedXdr).toBeNull();
    });

    it('should handle missing signed XDR in response', async () => {
      vi.mocked(freighterApi.signTransaction).mockResolvedValue({
        signedTxXdr: '',
        signerAddress: mockAddress,
      });

      const signedXdr = await WalletService.signTransaction(mockXdr);

      expect(signedXdr).toBeNull();
    });

    it('should work without network passphrase', async () => {
      vi.mocked(freighterApi.signTransaction).mockResolvedValue({
        signedTxXdr: mockSignedXdr,
        signerAddress: mockAddress,
      });

      const signedXdr = await WalletService.signTransaction(mockXdr);

      expect(signedXdr).toBe(mockSignedXdr);
      expect(freighterApi.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: undefined,
      });
    });
  });

  describe('Wallet Change Watching', () => {
    it('should setup wallet change watcher', () => {
      const mockWatch = vi.fn();
      const mockStop = vi.fn();
      const mockWatcher = {
        watch: mockWatch,
        stop: mockStop,
      };

      vi.mocked(freighterApi.WatchWalletChanges).mockReturnValue(mockWatcher as any);

      const callback = vi.fn();
      const cleanup = WalletService.watchChanges(callback);

      expect(freighterApi.WatchWalletChanges).toHaveBeenCalled();
      expect(mockWatch).toHaveBeenCalledWith(expect.any(Function));

      // Test cleanup
      cleanup();
      expect(mockStop).toHaveBeenCalled();
    });

    it('should call callback when wallet changes', () => {
      let watchCallback: any;
      const mockWatch = vi.fn((cb) => {
        watchCallback = cb;
      });
      const mockStop = vi.fn();
      const mockWatcher = {
        watch: mockWatch,
        stop: mockStop,
      };

      vi.mocked(freighterApi.WatchWalletChanges).mockReturnValue(mockWatcher as any);

      const callback = vi.fn();
      WalletService.watchChanges(callback);

      // Simulate wallet change
      const changeParams = {
        address: mockAddress,
        network: 'TESTNET',
      };
      watchCallback(changeParams);

      expect(callback).toHaveBeenCalledWith(changeParams);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing Freighter API gracefully', async () => {
      vi.mocked(freighterApi.isConnected).mockRejectedValue(new Error('Freighter not found'));

      const installed = await WalletService.isInstalled();

      expect(installed).toBe(false);
    });

    it('should provide user-friendly error messages', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.requestAccess).mockRejectedValue(new Error('User declined access'));

      await expect(WalletService.connect()).rejects.toThrow('Connection request rejected by user');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete connect-sign-disconnect flow', async () => {
      // Connect
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.requestAccess).mockResolvedValue({ address: mockAddress });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: mockAddress });

      const address = await WalletService.connect();
      expect(address).toBe(mockAddress);

      // Sign
      vi.mocked(freighterApi.signTransaction).mockResolvedValue({
        signedTxXdr: mockSignedXdr,
        signerAddress: mockAddress,
      });

      const signedXdr = await WalletService.signTransaction(mockXdr);
      expect(signedXdr).toBe(mockSignedXdr);

      // Disconnect
      expect(() => WalletService.disconnect()).not.toThrow();
    });

    it('should handle network switch during active session', async () => {
      let watchCallback: any;
      const mockWatch = vi.fn((cb) => {
        watchCallback = cb;
      });
      const mockWatcher = {
        watch: mockWatch,
        stop: vi.fn(),
      };

      vi.mocked(freighterApi.WatchWalletChanges).mockReturnValue(mockWatcher as any);

      const callback = vi.fn();
      WalletService.watchChanges(callback);

      // Simulate network switch
      watchCallback({
        address: mockAddress,
        network: 'PUBLIC',
      });

      expect(callback).toHaveBeenCalledWith({
        address: mockAddress,
        network: 'PUBLIC',
      });
    });

    it('should handle wallet disconnection during active session', async () => {
      let watchCallback: any;
      const mockWatch = vi.fn((cb) => {
        watchCallback = cb;
      });
      const mockWatcher = {
        watch: mockWatch,
        stop: vi.fn(),
      };

      vi.mocked(freighterApi.WatchWalletChanges).mockReturnValue(mockWatcher as any);

      const callback = vi.fn();
      WalletService.watchChanges(callback);

      // Simulate wallet disconnection
      watchCallback({
        address: '',
        network: 'TESTNET',
      });

      expect(callback).toHaveBeenCalledWith({
        address: '',
        network: 'TESTNET',
      });
    });
  });
});
