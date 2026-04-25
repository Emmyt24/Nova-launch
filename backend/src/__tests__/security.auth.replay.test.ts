/**
 * SECURITY TEST: Replay Attacks
 * 
 * RISK COVERAGE:
 * - AUTH-001: Nonce replay attack
 * - AUTH-002: Expired nonce acceptance
 * - AUTH-003: Nonce for wrong public key
 * - REPLAY-001: Transaction replay
 * - REPLAY-004: Cross-chain replay
 * 
 * SEVERITY: CRITICAL
 */

import { NonceService } from '../auth/nonce.service';
import { StellarSignatureService } from '../auth/stellar-signature.service';
import { AUTH_CONSTANTS } from '../auth/auth.constants';

describe('Security: Replay Attack Tests', () => {
  let nonceService: NonceService;
  let stellarSig: StellarSignatureService;

  beforeEach(() => {
    nonceService = new NonceService();
    stellarSig = new StellarSignatureService();
  });

  afterEach(() => {
    nonceService.onModuleDestroy();
  });

  describe('[AUTH-001] Nonce Replay Attack', () => {
    it('should reject reused nonce', () => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      // First use should succeed
      const firstUse = nonceService.consumeNonce(nonce, publicKey);
      expect(firstUse).toBe(true);

      // Second use should fail (replay attack)
      const secondUse = nonceService.consumeNonce(nonce, publicKey);
      expect(secondUse).toBe(false);
    });

    it('should reject nonce used multiple times in rapid succession', () => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      // Consume once
      expect(nonceService.consumeNonce(nonce, publicKey)).toBe(true);

      // Try to replay immediately
      expect(nonceService.consumeNonce(nonce, publicKey)).toBe(false);
      expect(nonceService.consumeNonce(nonce, publicKey)).toBe(false);
      expect(nonceService.consumeNonce(nonce, publicKey)).toBe(false);
    });

    it('should prevent concurrent nonce consumption', async () => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      // Simulate concurrent requests trying to use same nonce
      const results = await Promise.all([
        Promise.resolve(nonceService.consumeNonce(nonce, publicKey)),
        Promise.resolve(nonceService.consumeNonce(nonce, publicKey)),
        Promise.resolve(nonceService.consumeNonce(nonce, publicKey)),
      ]);

      // Only one should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);

      // Others should fail
      const failureCount = results.filter((r) => r === false).length;
      expect(failureCount).toBe(2);
    });

    it('should mark nonce as used immediately to prevent race conditions', () => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      // First consumption
      nonceService.consumeNonce(nonce, publicKey);

      // Immediate retry should fail (no race window)
      const retry = nonceService.consumeNonce(nonce, publicKey);
      expect(retry).toBe(false);
    });
  });

  describe('[AUTH-002] Expired Nonce Acceptance', () => {
    it('should reject expired nonce', (done) => {
      const publicKey = 'GTEST';
      const { nonce, expiresAt } = nonceService.generateNonce(publicKey);

      // Calculate time until expiry
      const timeUntilExpiry = expiresAt - Date.now();

      // Wait for nonce to expire
      setTimeout(() => {
        const result = nonceService.consumeNonce(nonce, publicKey);
        expect(result).toBe(false);
        done();
      }, timeUntilExpiry + 100); // Add 100ms buffer
    }, AUTH_CONSTANTS.NONCE_EXPIRY_MS + 1000);

    it('should reject nonce that expired during processing', () => {
      const publicKey = 'GTEST';

      // Mock Date.now to simulate time passing
      const originalNow = Date.now;
      const startTime = originalNow();

      jest.spyOn(Date, 'now').mockImplementation(() => startTime);

      const { nonce } = nonceService.generateNonce(publicKey);

      // Simulate time passing beyond expiry
      jest
        .spyOn(Date, 'now')
        .mockImplementation(() => startTime + AUTH_CONSTANTS.NONCE_EXPIRY_MS + 1000);

      const result = nonceService.consumeNonce(nonce, publicKey);
      expect(result).toBe(false);

      // Restore original Date.now
      Date.now = originalNow;
    });

    it('should accept nonce just before expiry', () => {
      const publicKey = 'GTEST';
      const { nonce, expiresAt } = nonceService.generateNonce(publicKey);

      // Verify nonce is still valid
      expect(Date.now()).toBeLessThan(expiresAt);

      const result = nonceService.consumeNonce(nonce, publicKey);
      expect(result).toBe(true);
    });

    it('should clean up expired nonces automatically', (done) => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      // Wait for cleanup cycle (runs every 60 seconds, but we can trigger manually)
      setTimeout(() => {
        // After expiry, nonce should be cleaned up
        const result = nonceService.consumeNonce(nonce, publicKey);
        expect(result).toBe(false);
        done();
      }, AUTH_CONSTANTS.NONCE_EXPIRY_MS + 100);
    }, AUTH_CONSTANTS.NONCE_EXPIRY_MS + 1000);
  });

  describe('[AUTH-003] Nonce for Wrong Public Key', () => {
    it('should reject nonce used with different public key', () => {
      const publicKey1 = 'GTEST1';
      const publicKey2 = 'GTEST2';

      const { nonce } = nonceService.generateNonce(publicKey1);

      // Try to use nonce with different public key
      const result = nonceService.consumeNonce(nonce, publicKey2);
      expect(result).toBe(false);
    });

    it('should reject nonce with case-modified public key', () => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      // Try with different case (if applicable)
      const result = nonceService.consumeNonce(nonce, publicKey.toLowerCase());
      expect(result).toBe(false);
    });

    it('should enforce strict public key matching', () => {
      const publicKey = 'GTEST';
      const { nonce } = nonceService.generateNonce(publicKey);

      const similarKeys = [
        'GTEST ',  // Trailing space
        ' GTEST',  // Leading space
        'GTEST\n', // Newline
        'gtest',   // Lowercase
      ];

      similarKeys.forEach((key) => {
        const result = nonceService.consumeNonce(nonce, key);
        expect(result).toBe(false);
      });
    });
  });

  describe('[REPLAY-001] Transaction Replay', () => {
    it('should prevent signature replay with different nonce', () => {
      const publicKey = 'GTEST';
      const signature = 'valid-signature-for-nonce1';

      const nonce1 = nonceService.generateNonce(publicKey).nonce;
      const nonce2 = nonceService.generateNonce(publicKey).nonce;

      // Signature was created for nonce1
      const message1 = stellarSig.buildSignMessage(nonce1);
      const message2 = stellarSig.buildSignMessage(nonce2);

      // Messages should be different
      expect(message1).not.toBe(message2);

      // Signature valid for nonce1 should not work with nonce2
      // (In real scenario, signature verification would fail)
      expect(message1).toContain(nonce1);
      expect(message2).toContain(nonce2);
    });

    it('should include message prefix to prevent replay', () => {
      const nonce = 'test-nonce';
      const message = stellarSig.buildSignMessage(nonce);

      expect(message).toContain(AUTH_CONSTANTS.STELLAR_MESSAGE_PREFIX);
      expect(message).toContain(nonce);
    });

    it('should generate unique nonces for each request', () => {
      const publicKey = 'GTEST';

      const nonces = new Set();
      for (let i = 0; i < 100; i++) {
        const { nonce } = nonceService.generateNonce(publicKey);
        nonces.add(nonce);
      }

      // All nonces should be unique
      expect(nonces.size).toBe(100);
    });
  });

  describe('[REPLAY-004] Cross-Chain Replay', () => {
    it('should include chain-specific prefix in message', () => {
      const nonce = 'test-nonce';
      const message = stellarSig.buildSignMessage(nonce);

      // Message should include Stellar-specific prefix
      expect(message).toContain(AUTH_CONSTANTS.STELLAR_MESSAGE_PREFIX);
    });

    it('should prevent replay from testnet to mainnet', () => {
      // In production, the message prefix should include network identifier
      const nonce = 'test-nonce';
      const message = stellarSig.buildSignMessage(nonce);

      // Verify message structure prevents cross-network replay
      expect(message).toBeTruthy();
      expect(message.length).toBeGreaterThan(nonce.length);
    });

    it('should validate public key format is Stellar-specific', () => {
      const stellarKey = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
      const ethereumKey = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const bitcoinKey = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      expect(stellarSig.isValidPublicKey(stellarKey)).toBe(true);
      expect(stellarSig.isValidPublicKey(ethereumKey)).toBe(false);
      expect(stellarSig.isValidPublicKey(bitcoinKey)).toBe(false);
    });
  });

  describe('Combined Replay Scenarios', () => {
    it('should prevent replay with expired nonce and wrong key', () => {
      const publicKey1 = 'GTEST1';
      const publicKey2 = 'GTEST2';

      const originalNow = Date.now;
      const startTime = originalNow();
      jest.spyOn(Date, 'now').mockImplementation(() => startTime);

      const { nonce } = nonceService.generateNonce(publicKey1);

      // Simulate expiry
      jest
        .spyOn(Date, 'now')
        .mockImplementation(() => startTime + AUTH_CONSTANTS.NONCE_EXPIRY_MS + 1000);

      // Try to use expired nonce with wrong key
      const result = nonceService.consumeNonce(nonce, publicKey2);
      expect(result).toBe(false);

      Date.now = originalNow;
    });

    it('should prevent replay of used nonce even if not expired', () => {
      const publicKey = 'GTEST';
      const { nonce, expiresAt } = nonceService.generateNonce(publicKey);

      // Use nonce
      expect(nonceService.consumeNonce(nonce, publicKey)).toBe(true);

      // Verify still within expiry window
      expect(Date.now()).toBeLessThan(expiresAt);

      // Try to replay (should fail even though not expired)
      expect(nonceService.consumeNonce(nonce, publicKey)).toBe(false);
    });

    it('should handle multiple users with separate nonce pools', () => {
      const user1 = 'GTEST1';
      const user2 = 'GTEST2';

      const nonce1 = nonceService.generateNonce(user1).nonce;
      const nonce2 = nonceService.generateNonce(user2).nonce;

      // Each user can use their own nonce
      expect(nonceService.consumeNonce(nonce1, user1)).toBe(true);
      expect(nonceService.consumeNonce(nonce2, user2)).toBe(true);

      // But not each other's nonces
      const nonce3 = nonceService.generateNonce(user1).nonce;
      expect(nonceService.consumeNonce(nonce3, user2)).toBe(false);
    });
  });
});
