/**
 * SECURITY TEST: Authentication & Authorization Bypass
 * 
 * RISK COVERAGE:
 * - AUTH-004: JWT token reuse after revocation
 * - AUTH-005: Refresh token type confusion
 * - AUTH-006: Missing JWT signature validation
 * - AUTH-007: Weak signature verification
 * - AUTH-008: Public key format bypass
 * 
 * SEVERITY: CRITICAL
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { StellarSignatureService } from '../auth/stellar-signature.service';
import { NonceService } from '../auth/nonce.service';
import { ConfigService } from '@nestjs/config';

describe('Security: Authentication Bypass Tests', () => {
  let authService: AuthService;
  let tokenService: TokenService;
  let stellarSig: StellarSignatureService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        TokenService,
        StellarSignatureService,
        NonceService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
              if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    tokenService = module.get(TokenService);
    stellarSig = module.get(StellarSignatureService);
    jwtService = module.get(JwtService);
  });

  describe('[AUTH-004] JWT Token Reuse After Revocation', () => {
    it('should reject revoked access token', () => {
      const jti = 'test-jti-001';
      const token = 'valid.jwt.token';

      // Mock JWT verification to return valid payload
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'GTEST',
        walletAddress: 'GTEST',
        type: 'access',
        jti,
      });

      // Revoke the token
      tokenService.revokeToken(jti);

      // Attempt to verify revoked token
      expect(() => tokenService.verifyAccessToken(token)).toThrow(
        UnauthorizedException
      );
      expect(() => tokenService.verifyAccessToken(token)).toThrow(
        /revoked/i
      );
    });

    it('should reject revoked refresh token', () => {
      const jti = 'test-jti-002';
      const token = 'valid.refresh.token';

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'GTEST',
        walletAddress: 'GTEST',
        type: 'refresh',
        jti,
      });

      tokenService.revokeToken(jti);

      expect(() => tokenService.verifyRefreshToken(token)).toThrow(
        UnauthorizedException
      );
    });

    it('should prevent token reuse after logout', () => {
      const walletAddress = 'GTEST';
      const tokenPair = tokenService.generateTokenPair(walletAddress);

      // Extract JTI from token (in real scenario, this comes from JWT payload)
      const mockJti = 'logout-jti';
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: walletAddress,
        walletAddress,
        type: 'access',
        jti: mockJti,
      });

      // Logout revokes the token
      authService.logout(mockJti);

      // Token should be revoked
      expect(tokenService.isRevoked(mockJti)).toBe(true);
      expect(() =>
        tokenService.verifyAccessToken(tokenPair.accessToken)
      ).toThrow(UnauthorizedException);
    });
  });

  describe('[AUTH-005] Refresh Token Type Confusion', () => {
    it('should reject refresh token used as access token', () => {
      const refreshToken = 'refresh.jwt.token';

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'GTEST',
        walletAddress: 'GTEST',
        type: 'refresh', // Wrong type for access token
        jti: 'test-jti',
      });

      expect(() => tokenService.verifyAccessToken(refreshToken)).toThrow(
        UnauthorizedException
      );
      expect(() => tokenService.verifyAccessToken(refreshToken)).toThrow(
        /Invalid token type/i
      );
    });

    it('should reject access token used as refresh token', () => {
      const accessToken = 'access.jwt.token';

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'GTEST',
        walletAddress: 'GTEST',
        type: 'access', // Wrong type for refresh token
        jti: 'test-jti',
      });

      expect(() => tokenService.verifyRefreshToken(accessToken)).toThrow(
        UnauthorizedException
      );
      expect(() => tokenService.verifyRefreshToken(accessToken)).toThrow(
        /Invalid token type/i
      );
    });

    it('should reject token with missing type field', () => {
      const token = 'malformed.jwt.token';

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'GTEST',
        walletAddress: 'GTEST',
        // Missing 'type' field
        jti: 'test-jti',
      });

      expect(() => tokenService.verifyAccessToken(token)).toThrow(
        UnauthorizedException
      );
    });
  });

  describe('[AUTH-006] Missing JWT Signature Validation', () => {
    it('should reject unsigned JWT token', () => {
      const unsignedToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJHVEVTVCJ9.';

      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('invalid signature');
      });

      expect(() => tokenService.verifyAccessToken(unsignedToken)).toThrow(
        UnauthorizedException
      );
    });

    it('should reject token with invalid signature', () => {
      const tamperedToken = 'valid.header.tampered-signature';

      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('invalid signature');
      });

      expect(() => tokenService.verifyAccessToken(tamperedToken)).toThrow(
        UnauthorizedException
      );
    });

    it('should reject token signed with wrong secret', () => {
      const wrongSecretToken = 'token.signed.with-wrong-secret';

      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('invalid signature');
      });

      expect(() => tokenService.verifyAccessToken(wrongSecretToken)).toThrow(
        UnauthorizedException
      );
    });
  });

  describe('[AUTH-007] Weak Signature Verification', () => {
    it('should reject invalid Stellar signature', async () => {
      const invalidDto = {
        publicKey: 'GTEST',
        signature: 'invalid-base64-signature',
        nonce: 'valid-nonce',
      };

      // Mock nonce service to return valid nonce
      const nonceService = new NonceService();
      jest.spyOn(nonceService, 'consumeNonce').mockReturnValue(true);

      // Stellar signature verification should fail
      const result = stellarSig.verifySignature(
        invalidDto.publicKey,
        invalidDto.signature,
        invalidDto.nonce
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject signature with wrong message', () => {
      const publicKey = 'GTEST';
      const signature = 'valid-signature';
      const wrongNonce = 'wrong-nonce';

      const result = stellarSig.verifySignature(
        publicKey,
        signature,
        wrongNonce
      );

      expect(result.valid).toBe(false);
    });

    it('should reject signature from different keypair', () => {
      const publicKey1 = 'GTEST1';
      const publicKey2 = 'GTEST2';
      const signature = 'signature-from-key1';
      const nonce = 'test-nonce';

      // Signature was created by publicKey1 but verified against publicKey2
      const result = stellarSig.verifySignature(publicKey2, signature, nonce);

      expect(result.valid).toBe(false);
    });
  });

  describe('[AUTH-008] Public Key Format Bypass', () => {
    it('should reject malformed Stellar public key', () => {
      const malformedKeys = [
        'not-a-stellar-key',
        'GINVALID',
        'G' + 'A'.repeat(100), // Too long
        'G', // Too short
        '', // Empty
        'STEST', // Secret key instead of public
        '0x1234567890abcdef', // Ethereum address
      ];

      malformedKeys.forEach((key) => {
        expect(stellarSig.isValidPublicKey(key)).toBe(false);
      });
    });

    it('should reject authentication with invalid public key format', async () => {
      const invalidDto = {
        publicKey: 'invalid-key-format',
        signature: 'some-signature',
        nonce: 'some-nonce',
      };

      await expect(
        authService.authenticateWithWallet(invalidDto)
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject nonce request for invalid public key', () => {
      const invalidKey = 'not-a-valid-stellar-key';

      expect(() => authService.requestNonce(invalidKey)).toThrow(
        BadRequestException
      );
    });

    it('should accept only valid Stellar G-address format', () => {
      // Valid Stellar public keys start with 'G' and are 56 characters
      const validKey =
        'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

      expect(stellarSig.isValidPublicKey(validKey)).toBe(true);
    });
  });

  describe('Combined Attack Scenarios', () => {
    it('should prevent token reuse with type confusion', () => {
      const jti = 'combined-jti';
      const token = 'some.jwt.token';

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'GTEST',
        walletAddress: 'GTEST',
        type: 'refresh', // Wrong type
        jti,
      });

      tokenService.revokeToken(jti);

      // Should fail on both type check AND revocation check
      expect(() => tokenService.verifyAccessToken(token)).toThrow(
        UnauthorizedException
      );
    });

    it('should prevent authentication with revoked nonce and invalid signature', async () => {
      const dto = {
        publicKey: 'GTEST',
        signature: 'invalid-sig',
        nonce: 'used-nonce',
      };

      const nonceService = new NonceService();
      jest.spyOn(nonceService, 'consumeNonce').mockReturnValue(false);

      // Should fail on nonce validation before signature check
      await expect(authService.authenticateWithWallet(dto)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });
});
