import { describe, it, expect } from "vitest";
import { 
  generateWebhookSignature, 
  verifyWebhookSignature, 
  generateWebhookSecret 
} from "../utils/crypto";
import webhookService from "../services/webhookService";
import { WebhookEventType } from "../types/webhook";

describe("Webhook Signing and Verification (v1)", () => {
  const secret = generateWebhookSecret();
  const payload = JSON.stringify({
    event: "token.created",
    timestamp: new Date().toISOString(),
    data: { id: "123" }
  });

  it("should generate a valid v1 signature", () => {
    const signature = generateWebhookSignature(payload, secret);
    expect(signature).toMatch(/^v1\.\d+\.[a-f0-9]{64}$/);
  });

  it("should verify a valid signature", () => {
    const signature = generateWebhookSignature(payload, secret);
    const isValid = verifyWebhookSignature(payload, signature, secret);
    expect(isValid).toBe(true);
  });

  it("should fail verification with wrong secret", () => {
    const signature = generateWebhookSignature(payload, secret);
    const isValid = verifyWebhookSignature(payload, signature, "wrong-secret");
    expect(isValid).toBe(false);
  });

  it("should fail verification with tampered payload", () => {
    const signature = generateWebhookSignature(payload, secret);
    const tamperedPayload = payload.replace("123", "456");
    const isValid = verifyWebhookSignature(tamperedPayload, signature, secret);
    expect(isValid).toBe(false);
  });

  it("should fail verification if signature is too old (replay protection)", () => {
    // 10 minutes ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = generateWebhookSignature(payload, secret, oldTimestamp);
    
    // Default tolerance is 300s (5 min)
    const isValid = verifyWebhookSignature(payload, signature, secret);
    expect(isValid).toBe(false);
  });

  it("should pass verification within the tolerance window", () => {
    // 2 minutes ago
    const recentTimestamp = Math.floor(Date.now() / 1000) - 120;
    const signature = generateWebhookSignature(payload, secret, recentTimestamp);
    
    const isValid = verifyWebhookSignature(payload, signature, secret);
    expect(isValid).toBe(true);
  });

  it("should work through WebhookService.createPayload", () => {
    const event = WebhookEventType.TOKEN_CREATED;
    const data = { 
      tokenAddress: "G123", 
      creator: "G456", 
      name: "T", 
      symbol: "T", 
      decimals: 7, 
      initialSupply: "1", 
      transactionHash: "h", 
      ledger: 1 
    };
    
    const payloadObj = webhookService.createPayload(event, data, secret);
    
    expect(payloadObj.signature).toBeDefined();
    expect(payloadObj.signature).toMatch(/^v1\.\d+\.[a-f0-9]{64}$/);
    
    // Verify using the signature from the payload object
    const payloadStr = JSON.stringify({
      event: payloadObj.event,
      timestamp: payloadObj.timestamp,
      data: payloadObj.data
    });
    
    const isValid = verifyWebhookSignature(payloadStr, payloadObj.signature, secret);
    expect(isValid).toBe(true);
  });
});
