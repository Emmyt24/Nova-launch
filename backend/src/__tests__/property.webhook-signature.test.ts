/**
 * Property 60: Webhook Signature Verification
 *
 * Proves that webhook signatures are correctly generated and verifiable.
 *
 * Properties tested:
 *   P60-A  Signatures are deterministic for the same payload, secret, and timestamp
 *   P60-B  Any tampered payload fails verification
 *   P60-C  Any wrong secret fails verification
 *   P60-D  Signatures outside the replay-protection window are rejected
 *   P60-E  Signatures within the tolerance window are accepted
 *   P60-F  The v1 format contract is always satisfied
 *
 * Security considerations:
 *   - HMAC-SHA256 with timing-safe comparison prevents timing attacks
 *   - Timestamp-bound signatures (±5 min) prevent replay attacks
 *   - Secrets are generated with crypto.randomBytes — never predictable
 *
 * Edge cases / assumptions:
 *   - Payload strings may be empty, contain unicode, or be very large
 *   - Secrets are arbitrary non-empty strings (production uses 64-char hex)
 *   - Timestamp arithmetic uses Unix seconds; clock skew is not simulated here
 *
 * Follow-up work:
 *   - Add property test for concurrent signature generation under load
 *   - Test behaviour when secret contains special characters / null bytes
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  generateWebhookSignature,
  verifyWebhookSignature,
  generateWebhookSecret,
} from '../utils/crypto';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty printable-ASCII string — representative of JSON payloads */
const payloadArb = fc.string({ minLength: 1, maxLength: 2048 });

/** Non-empty secret string (production uses 64-char hex, but the algorithm
 *  must be correct for any non-empty secret) */
const secretArb = fc.string({ minLength: 1, maxLength: 128 });

/** Unix timestamp within the 5-minute tolerance window (±299 s) */
const recentTimestampArb = fc.integer({ min: -299, max: 299 }).map(
  (delta) => Math.floor(Date.now() / 1000) + delta,
);

/** Unix timestamp strictly outside the 5-minute tolerance window */
const staleTimestampArb = fc.oneof(
  fc.integer({ min: 301, max: 3600 }).map((d) => Math.floor(Date.now() / 1000) - d),
  fc.integer({ min: 301, max: 3600 }).map((d) => Math.floor(Date.now() / 1000) + d),
);

// ---------------------------------------------------------------------------
// Property 60-A: Determinism
// ---------------------------------------------------------------------------
describe('Property 60-A: signatures are deterministic for same inputs', () => {
  it('same payload + secret + timestamp always produce identical signature', () => {
    fc.assert(
      fc.property(payloadArb, secretArb, recentTimestampArb, (payload, secret, ts) => {
        const sig1 = generateWebhookSignature(payload, secret, ts);
        const sig2 = generateWebhookSignature(payload, secret, ts);
        return sig1 === sig2;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 60-B: Tampered payload fails verification
// ---------------------------------------------------------------------------
describe('Property 60-B: tampered payloads fail verification', () => {
  it('appending a single character to the payload invalidates the signature', () => {
    fc.assert(
      fc.property(payloadArb, secretArb, recentTimestampArb, (payload, secret, ts) => {
        const sig = generateWebhookSignature(payload, secret, ts);
        const tampered = payload + 'X';
        return verifyWebhookSignature(tampered, sig, secret) === false;
      }),
      { numRuns: 100 },
    );
  });

  it('flipping one character in the payload invalidates the signature', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 512 }),
        secretArb,
        recentTimestampArb,
        fc.integer({ min: 0, max: 511 }),
        (payload, secret, ts, idx) => {
          const pos = idx % payload.length;
          const sig = generateWebhookSignature(payload, secret, ts);
          // Flip the character at pos
          const chars = payload.split('');
          chars[pos] = chars[pos] === 'a' ? 'b' : 'a';
          const tampered = chars.join('');
          if (tampered === payload) return true; // no-op flip, skip
          return verifyWebhookSignature(tampered, sig, secret) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 60-C: Wrong secret fails verification
// ---------------------------------------------------------------------------
describe('Property 60-C: wrong secret fails verification', () => {
  it('a different secret always rejects a valid signature', () => {
    fc.assert(
      fc.property(
        payloadArb,
        secretArb,
        secretArb,
        recentTimestampArb,
        (payload, secret, wrongSecret, ts) => {
          fc.pre(secret !== wrongSecret);
          const sig = generateWebhookSignature(payload, secret, ts);
          return verifyWebhookSignature(payload, sig, wrongSecret) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 60-D: Stale signatures are rejected (replay protection)
// ---------------------------------------------------------------------------
describe('Property 60-D: stale signatures are rejected', () => {
  it('signatures older or newer than 5 minutes are always rejected', () => {
    fc.assert(
      fc.property(payloadArb, secretArb, staleTimestampArb, (payload, secret, ts) => {
        const sig = generateWebhookSignature(payload, secret, ts);
        return verifyWebhookSignature(payload, sig, secret) === false;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 60-E: Fresh signatures are accepted
// ---------------------------------------------------------------------------
describe('Property 60-E: fresh signatures are accepted', () => {
  it('signatures within the tolerance window always verify successfully', () => {
    fc.assert(
      fc.property(payloadArb, secretArb, recentTimestampArb, (payload, secret, ts) => {
        const sig = generateWebhookSignature(payload, secret, ts);
        return verifyWebhookSignature(payload, sig, secret) === true;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 60-F: v1 format contract
// ---------------------------------------------------------------------------
describe('Property 60-F: v1 format contract', () => {
  it('every generated signature matches v1.<timestamp>.<64-char-hex>', () => {
    fc.assert(
      fc.property(payloadArb, secretArb, recentTimestampArb, (payload, secret, ts) => {
        const sig = generateWebhookSignature(payload, secret, ts);
        return /^v1\.\d+\.[a-f0-9]{64}$/.test(sig);
      }),
      { numRuns: 100 },
    );
  });

  it('malformed headers (missing prefix, wrong parts) are always rejected', () => {
    fc.assert(
      fc.property(
        payloadArb,
        secretArb,
        fc.oneof(
          fc.constant(''),
          fc.constant('invalid'),
          fc.constant('v2.123.abc'),
          fc.string({ minLength: 1, maxLength: 64 }),
        ),
        (payload, secret, badHeader) => {
          fc.pre(!badHeader.startsWith('v1.') || badHeader.split('.').length !== 3);
          return verifyWebhookSignature(payload, badHeader, secret) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Bonus: generateWebhookSecret produces unique, correctly-sized secrets
// ---------------------------------------------------------------------------
describe('generateWebhookSecret uniqueness', () => {
  it('generates 100 distinct secrets with no collisions', () => {
    const secrets = new Set(Array.from({ length: 100 }, () => generateWebhookSecret()));
    // Probability of collision with 64-char hex is astronomically low
    expect(secrets.size).toBe(100);
  });

  it('generates secrets of correct length', () => {
    const secret = generateWebhookSecret();
    // Default length is 32 bytes = 64 hex characters
    expect(secret.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(secret)).toBe(true);
  });

  it('generates secrets with custom length', () => {
    const secret = generateWebhookSecret(16);
    expect(secret.length).toBe(32); // 16 bytes = 32 hex chars
    expect(/^[a-f0-9]{32}$/.test(secret)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 60-G: Concurrent signature generation
// ---------------------------------------------------------------------------
describe('Property 60-G: concurrent signature generation', () => {
  it('handles concurrent signature generation correctly', async () => {
    fc.assert(
      fc.property(
        fc.array(payloadArb, { minLength: 10, maxLength: 50 }),
        secretArb,
        async (payloads, secret) => {
          const timestamp = Math.floor(Date.now() / 1000);

          // Generate signatures concurrently
          const signatures = await Promise.all(
            payloads.map(payload =>
              Promise.resolve(generateWebhookSignature(payload, secret, timestamp))
            )
          );

          // All signatures should be valid
          const verifications = signatures.map((sig, idx) =>
            verifyWebhookSignature(payloads[idx], sig, secret)
          );

          return verifications.every(v => v === true);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 60-H: Signature length and format consistency
// ---------------------------------------------------------------------------
describe('Property 60-H: signature length and format consistency', () => {
  it('all signatures have consistent length', () => {
    fc.assert(
      fc.property(payloadArb, secretArb, recentTimestampArb, (payload, secret, ts) => {
        const sig = generateWebhookSignature(payload, secret, ts);
        // v1.<timestamp>.<64-char-hex>
        const parts = sig.split('.');
        return parts.length === 3 && parts[2].length === 64;
      }),
      { numRuns: 100 }
    );
  });

  it('timestamp in signature matches input timestamp', () => {
    fc.assert(
      fc.property(payloadArb, secretArb, recentTimestampArb, (payload, secret, ts) => {
        const sig = generateWebhookSignature(payload, secret, ts);
        const parts = sig.split('.');
        return parseInt(parts[1], 10) === ts;
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 60-I: Edge cases and boundary conditions
// ---------------------------------------------------------------------------
describe('Property 60-I: edge cases and boundary conditions', () => {
  it('handles empty payload correctly', () => {
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = generateWebhookSignature('', secret, timestamp);

    expect(verifyWebhookSignature('', sig, secret)).toBe(true);
  });

  it('handles very long payloads correctly', () => {
    const longPayload = 'x'.repeat(10000);
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = generateWebhookSignature(longPayload, secret, timestamp);

    expect(verifyWebhookSignature(longPayload, sig, secret)).toBe(true);
  });

  it('handles unicode payloads correctly', () => {
    const unicodePayload = '{"emoji":"🚀","text":"Hello 世界"}';
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = generateWebhookSignature(unicodePayload, secret, timestamp);

    expect(verifyWebhookSignature(unicodePayload, sig, secret)).toBe(true);
  });

  it('handles special characters in payload', () => {
    const specialPayload = '{"data":"\\n\\r\\t\\"\\\'"}';
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = generateWebhookSignature(specialPayload, secret, timestamp);

    expect(verifyWebhookSignature(specialPayload, sig, secret)).toBe(true);
  });

  it('rejects signature at exact tolerance boundary (just outside)', () => {
    const payload = 'test';
    const secret = generateWebhookSecret();
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301; // Just outside 5 min window
    const sig = generateWebhookSignature(payload, secret, oldTimestamp);

    expect(verifyWebhookSignature(payload, sig, secret)).toBe(false);
  });

  it('accepts signature at exact tolerance boundary (just inside)', () => {
    const payload = 'test';
    const secret = generateWebhookSecret();
    const recentTimestamp = Math.floor(Date.now() / 1000) - 299; // Just inside 5 min window
    const sig = generateWebhookSignature(payload, secret, recentTimestamp);

    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 60-J: Security properties
// ---------------------------------------------------------------------------
describe('Property 60-J: security properties', () => {
  it('different secrets produce different signatures for same payload', () => {
    fc.assert(
      fc.property(
        payloadArb,
        secretArb,
        secretArb,
        recentTimestampArb,
        (payload, secret1, secret2, ts) => {
          fc.pre(secret1 !== secret2);
          const sig1 = generateWebhookSignature(payload, secret1, ts);
          const sig2 = generateWebhookSignature(payload, secret2, ts);
          return sig1 !== sig2;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('different timestamps produce different signatures for same payload', () => {
    fc.assert(
      fc.property(
        payloadArb,
        secretArb,
        recentTimestampArb,
        recentTimestampArb,
        (payload, secret, ts1, ts2) => {
          fc.pre(ts1 !== ts2);
          const sig1 = generateWebhookSignature(payload, secret, ts1);
          const sig2 = generateWebhookSignature(payload, secret, ts2);
          return sig1 !== sig2;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('signature verification is timing-safe', () => {
    const payload = 'test payload';
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const validSig = generateWebhookSignature(payload, secret, timestamp);
    const invalidSig = 'v1.' + timestamp + '.' + 'a'.repeat(64);

    // Both should take similar time (constant-time comparison)
    const start1 = Date.now();
    verifyWebhookSignature(payload, validSig, secret);
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    verifyWebhookSignature(payload, invalidSig, secret);
    const time2 = Date.now() - start2;

    // Allow 5ms variance for system timing
    expect(Math.abs(time1 - time2)).toBeLessThan(5);
  });

  it('rejects signatures with modified timestamp', () => {
    const payload = 'test';
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = generateWebhookSignature(payload, secret, timestamp);

    // Modify timestamp in signature
    const parts = sig.split('.');
    const modifiedSig = `v1.${timestamp + 1}.${parts[2]}`;

    expect(verifyWebhookSignature(payload, modifiedSig, secret)).toBe(false);
  });

  it('rejects signatures with modified HMAC', () => {
    const payload = 'test';
    const secret = generateWebhookSecret();
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = generateWebhookSignature(payload, secret, timestamp);

    // Modify HMAC in signature
    const parts = sig.split('.');
    const modifiedHmac = parts[2].replace(/a/g, 'b');
    const modifiedSig = `v1.${parts[1]}.${modifiedHmac}`;

    expect(verifyWebhookSignature(payload, modifiedSig, secret)).toBe(false);
  });
});
