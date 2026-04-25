const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "File size exceeds 5MB limit" };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP",
    };
  }

  return { valid: true };
}

export function validateMetadata(data: any): {
  valid: boolean;
  error?: string;
} {
  if (!data.name || typeof data.name !== "string") {
    return { valid: false, error: "Name is required" };
  }

  if (!data.symbol || typeof data.symbol !== "string") {
    return { valid: false, error: "Symbol is required" };
  }

  if (data.decimals === undefined || typeof data.decimals !== "number") {
    return { valid: false, error: "Decimals is required and must be a number" };
  }

  return { valid: true };
}

/**
 * Maximum byte length for campaign metadata strings.
 * Keeps rows lean and prevents DoS via oversized payloads.
 *
 * Edge cases:
 *  - Multi-byte Unicode characters count toward the byte limit, not the char limit.
 *  - An empty object `{}` is valid (2 bytes).
 *  - Deeply nested objects are allowed as long as they stay within the size limit.
 *
 * Assumptions:
 *  - Callers are responsible for serialising the metadata to a string before
 *    calling this function (i.e. JSON.stringify before storing).
 *  - The DB column is TEXT (unbounded), so enforcement lives here in the service
 *    layer rather than at the DB level.
 *
 * Follow-up work:
 *  - Consider adding a key-allowlist for known campaign types (BUYBACK / AIRDROP /
 *    LIQUIDITY) once the on-chain schema stabilises.
 *  - Consider enforcing a maximum nesting depth to guard against stack-overflow
 *    attacks via deeply recursive JSON.parse calls.
 */
export const CAMPAIGN_METADATA_MAX_BYTES = 64 * 1024; // 64 KB

/**
 * Validates a campaign metadata string before it is persisted.
 *
 * Schema examples:
 *   Valid:   '{"strategy":"laddered-buyback"}'
 *   Valid:   '{"tranche":1,"label":"Q1 airdrop"}'
 *   Valid:   null  (field is optional)
 *   Invalid: '"just a string"'          — root is not an object
 *   Invalid: '[1,2,3]'                  — root is an array
 *   Invalid: 'not json'                 — not parseable
 *   Invalid: '{"x":"' + 'a'.repeat(70000) + '"}' — exceeds size limit
 */
export function validateCampaignMetadata(metadata: unknown): {
  valid: boolean;
  error?: string;
} {
  // null / undefined → field is optional, always accepted
  if (metadata === null || metadata === undefined) {
    return { valid: true };
  }

  if (typeof metadata !== "string") {
    return { valid: false, error: "Metadata must be a string or null" };
  }

  // Size guard — byte length, not character count (multi-byte Unicode matters)
  const byteLength = Buffer.byteLength(metadata, "utf8");
  if (byteLength > CAMPAIGN_METADATA_MAX_BYTES) {
    return {
      valid: false,
      error: `Metadata exceeds maximum size of ${CAMPAIGN_METADATA_MAX_BYTES} bytes`,
    };
  }

  // Must be valid JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return { valid: false, error: "Metadata must be valid JSON" };
  }

  // Root value must be a plain object (not array, not primitive)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      error: "Metadata must be a JSON object at the root level",
    };
  }

  return { valid: true };
}
