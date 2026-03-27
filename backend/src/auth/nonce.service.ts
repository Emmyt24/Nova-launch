import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { AUTH_CONSTANTS } from "../auth.constants";
import { NonceResponseDto } from "./dto/auth.dto";

interface NonceEntry {
  nonce: string;
  publicKey: string;
  expiresAt: number;
  used: boolean;
}

@Injectable()
export class NonceService {
  private readonly logger = new Logger(NonceService.name);
  // In production replace this Map with Redis
  private readonly nonceStore = new Map<string, NonceEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodically clean expired nonces
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  generateNonce(publicKey: string): NonceResponseDto {
    const nonce = uuidv4();
    const expiresAt = Date.now() + AUTH_CONSTANTS.NONCE_EXPIRY_MS;

    this.nonceStore.set(nonce, {
      nonce,
      publicKey,
      expiresAt,
      used: false,
    });

    const message = `${AUTH_CONSTANTS.STELLAR_MESSAGE_PREFIX}${nonce}`;
    return { nonce, expiresAt, message };
  }

  /**
   * Validates and consumes a nonce (one-time use).
   * Returns false if expired, already used, or wrong key.
   */
  consumeNonce(nonce: string, publicKey: string): boolean {
    const entry = this.nonceStore.get(nonce);

    if (!entry) {
      this.logger.warn(`Nonce not found: ${nonce}`);
      return false;
    }

    if (entry.used) {
      this.logger.warn(`Nonce already used: ${nonce}`);
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.nonceStore.delete(nonce);
      this.logger.warn(`Nonce expired: ${nonce}`);
      return false;
    }

    if (entry.publicKey !== publicKey) {
      this.logger.warn(`Nonce public key mismatch for: ${nonce}`);
      return false;
    }

    // Mark as used immediately to prevent race conditions
    entry.used = true;
    this.nonceStore.set(nonce, entry);

    // Schedule deletion
    setTimeout(() => this.nonceStore.delete(nonce), 5000);

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.nonceStore.entries()) {
      if (entry.used || now > entry.expiresAt) {
        this.nonceStore.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired nonces`);
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
