import crypto from "crypto";

/**
 * Generate a secure random secret for webhook signing
 */
export function generateWebhookSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate HMAC signature for webhook payload with timestamp (v1)
 * Format: v1.<timestamp>.<signature>
 * Message signed: <timestamp>.<payload_string>
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const message = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return `v1.${timestamp}.${signature}`;
}

/**
 * Verify advanced webhook signature with replay protection (5 min window)
 */
export function verifyWebhookSignature(
  payload: string,
  header: string,
  secret: string,
  toleranceSeconds: number = 300 // 5 minutes
): boolean {
  if (!header || !header.startsWith("v1.")) {
    return false;
  }

  const parts = header.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const timestamp = parseInt(parts[1], 10);
  const signature = parts[2];

  if (isNaN(timestamp)) {
    return false;
  }

  // Check for replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // Verify signature
  const expectedHeader = generateWebhookSignature(payload, secret, timestamp);
  const expectedSignature = expectedHeader.split(".")[2];

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate Stellar address format
 */
export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(address);
}
