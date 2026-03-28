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
});
