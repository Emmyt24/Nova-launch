/**
 * API Key Management System with Rotation Support.
 *
 * Design:
 *   - Keys are stored as SHA-256 hashes; the raw key is returned only at
 *     creation/rotation time and never persisted.  This follows the same
 *     principle as password hashing: a compromised store does not expose
 *     live credentials.
 *   - Rotation is a two-phase operation: a new key is issued while the old
 *     key remains valid until `commitRotation()` is called (or the grace
 *     period expires).  This prevents downtime during key rollover.
 *   - All comparisons use `crypto.timingSafeEqual` to prevent timing attacks,
 *     matching the pattern in `src/auth/api-key.guard.ts`.
 *   - Keys are prefixed with `nlk_` (nova-launch key) so they are
 *     recognisable and can be detected by secret-scanning tools.
 *
 * Security properties (OWASP API Security Top 10):
 *   - API2: Broken Authentication — keys are 32 random bytes (256-bit entropy)
 *   - API3: Excessive Data Exposure — raw key never stored or logged
 *   - API4: Lack of Resources & Rate Limiting — callers should apply rate
 *     limiting at the route level (see existing `rateLimiter.ts`)
 *   - API8: Injection — no SQL; in-memory Map used (Prisma layer is separate)
 *
 * Assumptions / limitations:
 *   - The in-memory store is process-local.  For multi-instance deployments,
 *     replace `ApiKeyStore` with a Prisma-backed implementation using the
 *     `IntegrationState` or a dedicated `ApiKey` model.
 *   - Grace period defaults to 24 hours; adjust via `rotationGraceMs`.
 */

import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiKeyStatus = "active" | "rotating" | "revoked";

export interface ApiKeyRecord {
  /** Opaque identifier (UUID). */
  id: string;
  /** Human-readable label supplied by the creator. */
  name: string;
  /** SHA-256 hash of the current raw key. */
  keyHash: string;
  /**
   * SHA-256 hash of the previous key during a rotation grace period.
   * Both `keyHash` and `prevKeyHash` are accepted until `commitRotation`.
   */
  prevKeyHash: string | null;
  /** Timestamp when the rotation was initiated (ms since epoch). */
  rotationStartedAt: number | null;
  status: ApiKeyStatus;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreateKeyResult {
  id: string;
  /** Raw key — shown once, never stored. */
  rawKey: string;
}

export interface RotateKeyResult {
  id: string;
  /** New raw key — shown once, never stored. */
  rawKey: string;
  /** Grace period end (ms since epoch). Old key valid until this time. */
  graceEndsAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const KEY_PREFIX = "nlk_";
/** Raw key byte length before hex encoding (256-bit entropy). */
const KEY_BYTES = 32;
/** Default rotation grace period: 24 hours. */
export const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a cryptographically secure raw API key. */
function generateRawKey(): string {
  return KEY_PREFIX + crypto.randomBytes(KEY_BYTES).toString("hex");
}

/** Returns the SHA-256 hex digest of a raw key. */
export function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Constant-time comparison of two hex-encoded hashes.
 * Returns false immediately (without timing leak) if lengths differ.
 */
function safeHashEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// ─── ApiKeyManager ────────────────────────────────────────────────────────────

export class ApiKeyManager {
  private readonly store = new Map<string, ApiKeyRecord>();
  private readonly graceMs: number;

  constructor(options: { rotationGraceMs?: number } = {}) {
    this.graceMs = options.rotationGraceMs ?? DEFAULT_GRACE_MS;
  }

  /**
   * Creates a new API key.
   *
   * @returns `{ id, rawKey }` — store `id`, show `rawKey` once to the user.
   */
  create(name: string): CreateKeyResult {
    if (!name || !name.trim()) {
      throw new Error("API key name is required");
    }

    const rawKey = generateRawKey();
    const id = crypto.randomUUID();

    this.store.set(id, {
      id,
      name: name.trim(),
      keyHash: hashKey(rawKey),
      prevKeyHash: null,
      rotationStartedAt: null,
      status: "active",
      createdAt: Date.now(),
      lastUsedAt: null,
    });

    return { id, rawKey };
  }

  /**
   * Validates a raw key against all active records.
   *
   * Accepts both the current key and the previous key during a grace period.
   * Updates `lastUsedAt` on a successful match.
   *
   * @returns The matching `ApiKeyRecord`, or `null` if invalid/revoked.
   */
  validate(rawKey: string): ApiKeyRecord | null {
    if (!rawKey?.startsWith(KEY_PREFIX)) return null;

    const incomingHash = hashKey(rawKey);

    for (const record of this.store.values()) {
      if (record.status === "revoked") continue;

      // Check current key
      if (safeHashEqual(incomingHash, record.keyHash)) {
        record.lastUsedAt = Date.now();
        return record;
      }

      // Check previous key during grace period
      if (
        record.status === "rotating" &&
        record.prevKeyHash !== null &&
        record.rotationStartedAt !== null
      ) {
        const graceExpired =
          Date.now() - record.rotationStartedAt > this.graceMs;

        if (!graceExpired && safeHashEqual(incomingHash, record.prevKeyHash)) {
          record.lastUsedAt = Date.now();
          return record;
        }

        // Grace period expired — auto-commit rotation
        if (graceExpired) {
          record.prevKeyHash = null;
          record.rotationStartedAt = null;
          record.status = "active";
        }
      }
    }

    return null;
  }

  /**
   * Initiates key rotation.
   *
   * Issues a new key while keeping the old key valid for `rotationGraceMs`.
   * Call `commitRotation(id)` once the new key is deployed everywhere.
   *
   * @returns `{ id, rawKey, graceEndsAt }`
   * @throws If the key does not exist or is already revoked.
   */
  rotate(id: string): RotateKeyResult {
    const record = this.store.get(id);
    if (!record) throw new Error(`API key not found: ${id}`);
    if (record.status === "revoked") throw new Error("Cannot rotate a revoked key");

    const rawKey = generateRawKey();
    const now = Date.now();

    record.prevKeyHash = record.keyHash;
    record.keyHash = hashKey(rawKey);
    record.rotationStartedAt = now;
    record.status = "rotating";

    return { id, rawKey, graceEndsAt: now + this.graceMs };
  }

  /**
   * Commits a rotation, immediately invalidating the previous key.
   *
   * @throws If the key does not exist or is not in `rotating` status.
   */
  commitRotation(id: string): void {
    const record = this.store.get(id);
    if (!record) throw new Error(`API key not found: ${id}`);
    if (record.status !== "rotating") {
      throw new Error("Key is not in rotating status");
    }

    record.prevKeyHash = null;
    record.rotationStartedAt = null;
    record.status = "active";
  }

  /**
   * Revokes a key immediately.  Revoked keys cannot be validated or rotated.
   *
   * @throws If the key does not exist.
   */
  revoke(id: string): void {
    const record = this.store.get(id);
    if (!record) throw new Error(`API key not found: ${id}`);

    record.status = "revoked";
    record.prevKeyHash = null;
    record.rotationStartedAt = null;
  }

  /**
   * Returns a safe view of a key record (no hashes exposed).
   */
  get(id: string): Omit<ApiKeyRecord, "keyHash" | "prevKeyHash"> | null {
    const record = this.store.get(id);
    if (!record) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { keyHash, prevKeyHash, ...safe } = record;
    return safe;
  }

  /** Returns safe views of all records. */
  list(): Omit<ApiKeyRecord, "keyHash" | "prevKeyHash">[] {
    return [...this.store.values()].map(({ keyHash, prevKeyHash, ...safe }) => safe);
  }
}
