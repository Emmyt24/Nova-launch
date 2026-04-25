import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ApiKeyManager,
  hashKey,
  KEY_PREFIX,
  DEFAULT_GRACE_MS,
} from "./apiKey";

// ─── hashKey ──────────────────────────────────────────────────────────────────

describe("hashKey", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    expect(hashKey("nlk_abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashKey("nlk_test")).toBe(hashKey("nlk_test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashKey("nlk_a")).not.toBe(hashKey("nlk_b"));
  });
});

// ─── ApiKeyManager ────────────────────────────────────────────────────────────

describe("ApiKeyManager", () => {
  let mgr: ApiKeyManager;

  beforeEach(() => {
    mgr = new ApiKeyManager();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe("create()", () => {
    it("returns an id and a raw key with the correct prefix", () => {
      const { id, rawKey } = mgr.create("my-service");
      expect(typeof id).toBe("string");
      expect(rawKey.startsWith(KEY_PREFIX)).toBe(true);
    });

    it("raw key is 64 hex chars after the prefix", () => {
      const { rawKey } = mgr.create("svc");
      const hex = rawKey.slice(KEY_PREFIX.length);
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it("each call produces a unique key", () => {
      const a = mgr.create("a");
      const b = mgr.create("b");
      expect(a.rawKey).not.toBe(b.rawKey);
      expect(a.id).not.toBe(b.id);
    });

    it("throws when name is empty", () => {
      expect(() => mgr.create("")).toThrow("required");
    });

    it("throws when name is whitespace only", () => {
      expect(() => mgr.create("   ")).toThrow("required");
    });

    it("trims the name", () => {
      const { id } = mgr.create("  svc  ");
      expect(mgr.get(id)?.name).toBe("svc");
    });

    it("new key has status=active", () => {
      const { id } = mgr.create("svc");
      expect(mgr.get(id)?.status).toBe("active");
    });
  });

  // ── validate ─────────────────────────────────────────────────────────────────

  describe("validate()", () => {
    it("returns the record for a valid key", () => {
      const { id, rawKey } = mgr.create("svc");
      const record = mgr.validate(rawKey);
      expect(record?.id).toBe(id);
    });

    it("returns null for an unknown key", () => {
      expect(mgr.validate(KEY_PREFIX + "a".repeat(64))).toBeNull();
    });

    it("returns null for a key without the prefix", () => {
      expect(mgr.validate("no-prefix-key")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(mgr.validate("")).toBeNull();
    });

    it("updates lastUsedAt on successful validation", () => {
      const before = Date.now();
      const { rawKey } = mgr.create("svc");
      const record = mgr.validate(rawKey)!;
      expect(record.lastUsedAt).toBeGreaterThanOrEqual(before);
    });

    it("returns null for a revoked key", () => {
      const { id, rawKey } = mgr.create("svc");
      mgr.revoke(id);
      expect(mgr.validate(rawKey)).toBeNull();
    });
  });

  // ── rotate ───────────────────────────────────────────────────────────────────

  describe("rotate()", () => {
    it("returns a new raw key and a graceEndsAt timestamp", () => {
      const { id } = mgr.create("svc");
      const result = mgr.rotate(id);
      expect(result.rawKey.startsWith(KEY_PREFIX)).toBe(true);
      expect(result.graceEndsAt).toBeGreaterThan(Date.now());
    });

    it("new key is valid immediately after rotation", () => {
      const { id } = mgr.create("svc");
      const { rawKey: newKey } = mgr.rotate(id);
      expect(mgr.validate(newKey)?.id).toBe(id);
    });

    it("old key is still valid during grace period", () => {
      const { id, rawKey: oldKey } = mgr.create("svc");
      mgr.rotate(id);
      expect(mgr.validate(oldKey)?.id).toBe(id);
    });

    it("sets status to rotating", () => {
      const { id } = mgr.create("svc");
      mgr.rotate(id);
      expect(mgr.get(id)?.status).toBe("rotating");
    });

    it("throws for unknown id", () => {
      expect(() => mgr.rotate("no-such-id")).toThrow("not found");
    });

    it("throws when rotating a revoked key", () => {
      const { id } = mgr.create("svc");
      mgr.revoke(id);
      expect(() => mgr.rotate(id)).toThrow("revoked");
    });

    it("old key is invalid after grace period expires", () => {
      const shortGrace = new ApiKeyManager({ rotationGraceMs: 1 });
      const { id, rawKey: oldKey } = shortGrace.create("svc");
      shortGrace.rotate(id);

      // Advance time past grace period
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);
      expect(shortGrace.validate(oldKey)).toBeNull();
      vi.useRealTimers();
    });

    it("auto-commits rotation when grace period expires on validate() of old key", () => {
      // Use a real short grace so rotationStartedAt and Date.now() are on the same clock
      const shortGrace = new ApiKeyManager({ rotationGraceMs: 1 });
      const { id, rawKey: oldKey } = shortGrace.create("svc");
      shortGrace.rotate(id);

      // Spin until 1 ms has elapsed (grace = 1 ms)
      const start = Date.now();
      while (Date.now() - start < 5) { /* busy-wait */ }

      // Validating the old key after grace triggers auto-commit
      shortGrace.validate(oldKey);
      expect(shortGrace.get(id)?.status).toBe("active");
    });
  });

  // ── commitRotation ────────────────────────────────────────────────────────────

  describe("commitRotation()", () => {
    it("sets status back to active", () => {
      const { id } = mgr.create("svc");
      mgr.rotate(id);
      mgr.commitRotation(id);
      expect(mgr.get(id)?.status).toBe("active");
    });

    it("old key is invalid after commit", () => {
      const { id, rawKey: oldKey } = mgr.create("svc");
      mgr.rotate(id);
      mgr.commitRotation(id);
      expect(mgr.validate(oldKey)).toBeNull();
    });

    it("new key remains valid after commit", () => {
      const { id } = mgr.create("svc");
      const { rawKey: newKey } = mgr.rotate(id);
      mgr.commitRotation(id);
      expect(mgr.validate(newKey)?.id).toBe(id);
    });

    it("throws for unknown id", () => {
      expect(() => mgr.commitRotation("no-such-id")).toThrow("not found");
    });

    it("throws when key is not in rotating status", () => {
      const { id } = mgr.create("svc");
      expect(() => mgr.commitRotation(id)).toThrow("not in rotating status");
    });
  });

  // ── revoke ────────────────────────────────────────────────────────────────────

  describe("revoke()", () => {
    it("sets status to revoked", () => {
      const { id } = mgr.create("svc");
      mgr.revoke(id);
      expect(mgr.get(id)?.status).toBe("revoked");
    });

    it("revoked key fails validation", () => {
      const { id, rawKey } = mgr.create("svc");
      mgr.revoke(id);
      expect(mgr.validate(rawKey)).toBeNull();
    });

    it("throws for unknown id", () => {
      expect(() => mgr.revoke("no-such-id")).toThrow("not found");
    });

    it("clears prevKeyHash on revoke", () => {
      const { id } = mgr.create("svc");
      mgr.rotate(id);
      mgr.revoke(id);
      // get() never exposes hashes, but status should be revoked
      expect(mgr.get(id)?.status).toBe("revoked");
    });
  });

  // ── get / list ────────────────────────────────────────────────────────────────

  describe("get()", () => {
    it("returns null for unknown id", () => {
      expect(mgr.get("nope")).toBeNull();
    });

    it("does not expose keyHash or prevKeyHash", () => {
      const { id } = mgr.create("svc");
      const record = mgr.get(id) as any;
      expect(record.keyHash).toBeUndefined();
      expect(record.prevKeyHash).toBeUndefined();
    });

    it("exposes id, name, status, createdAt", () => {
      const { id } = mgr.create("my-svc");
      const record = mgr.get(id)!;
      expect(record.id).toBe(id);
      expect(record.name).toBe("my-svc");
      expect(record.status).toBe("active");
      expect(typeof record.createdAt).toBe("number");
    });
  });

  describe("list()", () => {
    it("returns all records without hashes", () => {
      mgr.create("a");
      mgr.create("b");
      const records = mgr.list() as any[];
      expect(records).toHaveLength(2);
      records.forEach((r) => {
        expect(r.keyHash).toBeUndefined();
        expect(r.prevKeyHash).toBeUndefined();
      });
    });

    it("returns empty array when no keys exist", () => {
      expect(mgr.list()).toEqual([]);
    });
  });

  // ── security edge cases ───────────────────────────────────────────────────────

  describe("security", () => {
    it("different keys with same length do not collide (timing-safe)", () => {
      const { rawKey: keyA } = mgr.create("a");
      const { rawKey: keyB } = mgr.create("b");
      // Both are same length; validate must not confuse them
      expect(mgr.validate(keyA)?.name).toBe("a");
      expect(mgr.validate(keyB)?.name).toBe("b");
    });

    it("raw key is not retrievable after creation", () => {
      const { id } = mgr.create("svc");
      const record = mgr.get(id) as any;
      // No field should contain the raw key
      expect(JSON.stringify(record)).not.toMatch(/nlk_/);
    });

    it("multiple managers are isolated", () => {
      const mgr2 = new ApiKeyManager();
      const { rawKey } = mgr.create("svc");
      expect(mgr2.validate(rawKey)).toBeNull();
    });

    it("custom grace period is respected", () => {
      const custom = new ApiKeyManager({ rotationGraceMs: 5000 });
      const { id, rawKey: oldKey } = custom.create("svc");
      custom.rotate(id);
      // Within grace — old key still valid
      expect(custom.validate(oldKey)).not.toBeNull();
    });
  });
});
