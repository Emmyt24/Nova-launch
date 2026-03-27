import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import * as StellarSdk from "stellar-sdk";
import { AUTH_CONSTANTS } from "../auth.constants";

export interface VerificationResult {
  valid: boolean;
  publicKey: string;
  error?: string;
}

@Injectable()
export class StellarSignatureService {
  private readonly logger = new Logger(StellarSignatureService.name);

  /**
   * Builds the canonical message a user must sign.
   * Includes a prefix + nonce to prevent replay attacks.
   */
  buildSignMessage(nonce: string): string {
    return `${AUTH_CONSTANTS.STELLAR_MESSAGE_PREFIX}${nonce}`;
  }

  /**
   * Verifies a Stellar keypair signature against a nonce.
   * The signature must be base64-encoded Ed25519 over the message bytes.
   */
  verifySignature(
    publicKey: string,
    signature: string,
    nonce: string
  ): VerificationResult {
    try {
      // Validate public key format first
      StellarSdk.Keypair.fromPublicKey(publicKey);

      const message = this.buildSignMessage(nonce);
      const messageBuffer = Buffer.from(message, "utf8");
      const signatureBuffer = Buffer.from(signature, "base64");

      const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
      const isValid = keypair.verify(messageBuffer, signatureBuffer);

      if (!isValid) {
        return { valid: false, publicKey, error: "Invalid signature" };
      }

      return { valid: true, publicKey };
    } catch (error) {
      this.logger.warn(
        `Signature verification failed for key ${publicKey}: ${error.message}`
      );
      return { valid: false, publicKey, error: error.message };
    }
  }

  /**
   * Validates that a Stellar public key is well-formed.
   */
  isValidPublicKey(publicKey: string): boolean {
    try {
      StellarSdk.Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }
}
