import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { StellarSignatureService } from "./stellar-signature.service";
import { NonceService } from "./nonce.service";
import { TokenService } from "./token.service";
import {
  WalletAuthDto,
  AuthResponseDto,
  NonceResponseDto,
  RefreshTokenDto,
} from "./dto/auth.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly stellarSig: StellarSignatureService,
    private readonly nonceService: NonceService,
    private readonly tokenService: TokenService
  ) {}

  /**
   * Step 1: Client requests a nonce to sign.
   */
  requestNonce(publicKey: string): NonceResponseDto {
    if (!this.stellarSig.isValidPublicKey(publicKey)) {
      throw new BadRequestException("Invalid Stellar public key");
    }
    return this.nonceService.generateNonce(publicKey);
  }

  /**
   * Step 2: Client signs the nonce and submits here.
   * Returns JWT token pair on success.
   */
  async authenticateWithWallet(dto: WalletAuthDto): Promise<AuthResponseDto> {
    const { publicKey, signature, nonce } = dto;

    if (!this.stellarSig.isValidPublicKey(publicKey)) {
      throw new BadRequestException("Invalid Stellar public key");
    }

    // Verify nonce is valid and not replayed
    const nonceValid = this.nonceService.consumeNonce(nonce, publicKey);
    if (!nonceValid) {
      throw new UnauthorizedException("Invalid or expired nonce");
    }

    // Verify the wallet signature
    const result = this.stellarSig.verifySignature(publicKey, signature, nonce);
    if (!result.valid) {
      this.logger.warn(
        `Failed signature verification for wallet ${publicKey}: ${result.error}`
      );
      throw new UnauthorizedException("Invalid wallet signature");
    }

    this.logger.log(`Wallet authenticated: ${publicKey}`);
    return this.tokenService.generateTokenPair(publicKey);
  }

  /**
   * Step 3: Refresh access token using refresh token.
   */
  refreshTokens(dto: RefreshTokenDto): AuthResponseDto {
    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);

    // Revoke old refresh token (rotation)
    if (payload.jti) {
      this.tokenService.revokeToken(payload.jti);
    }

    return this.tokenService.generateTokenPair(payload.walletAddress);
  }

  /**
   * Revoke a specific token by JTI (e.g., on logout).
   */
  logout(jti: string): void {
    this.tokenService.revokeToken(jti);
    this.logger.log(`Token revoked on logout: ${jti}`);
  }
}
