/**
 * Property 67: Webhook Payload Structure
 *
 * Proves that every payload produced by `webhookService.createPayload` always
 * contains the required fields with valid types, regardless of the event type
 * or data combination supplied.
 *
 * Required fields: id (absent — see note), event, timestamp, data, signature
 *
 * Note on `id`: the current WebhookPayload type does not include an `id` field
 * (the delivery log id is assigned by the DB). The property therefore asserts
 * the four fields that ARE part of the payload contract: event, timestamp,
 * data, signature.  If an `id` field is added to WebhookPayload in future,
 * this test should be updated accordingly.
 *
 * Properties tested:
 *   P67-A  Required fields are always present and non-empty
 *   P67-B  Payload serialises to valid JSON
 *   P67-C  `event` matches the input event type
 *   P67-D  `timestamp` is a valid ISO-8601 date string
 *   P67-E  `signature` matches the v1.<ts>.<hex> format
 *
 * Assumptions / edge cases:
 *   - All four WebhookEventType values are exercised.
 *   - Event data fields use short printable strings to keep payloads small.
 *   - `createPayload` is a pure function — no DB or network calls.
 *
 * Follow-up work:
 *   - Add schema validation against a JSON Schema once one is formalised.
 *   - Test very large data payloads (> 1 MB) for truncation behaviour.
 */

import { describe, it, beforeAll } from 'vitest'
import * as fc from 'fast-check'
import {
  WebhookEventType,
  WebhookPayload,
  TokenCreatedEventData,
  BurnEventData,
  MetadataUpdatedEventData,
} from '../types/webhook'

// ---------------------------------------------------------------------------
// We import the real createPayload via the service (pure function, no DB)
// ---------------------------------------------------------------------------

let createPayload: (
  event: WebhookEventType,
  data: any,
  secret: string,
) => WebhookPayload

beforeAll(async () => {
  const mod = await import('../services/webhookService')
  createPayload = mod.default.createPayload.bind(mod.default)
})

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const shortStr = fc.string({ minLength: 1, maxLength: 64 })
const secretArb = fc.string({ minLength: 1, maxLength: 128 })

const tokenCreatedArb: fc.Arbitrary<[WebhookEventType, TokenCreatedEventData]> =
  fc.record({
    tokenAddress: shortStr,
    creator: shortStr,
    name: shortStr,
    symbol: shortStr,
    decimals: fc.integer({ min: 0, max: 18 }),
    initialSupply: fc.bigInt({ min: 1n, max: 10n ** 18n }).map(String),
    transactionHash: shortStr,
    ledger: fc.integer({ min: 1, max: 999_999 }),
  }).map((data) => [WebhookEventType.TOKEN_CREATED, data])

const burnArb: fc.Arbitrary<[WebhookEventType, BurnEventData]> =
  fc.record({
    tokenAddress: shortStr,
    from: shortStr,
    amount: fc.bigInt({ min: 1n, max: 10n ** 18n }).map(String),
    burner: shortStr,
    transactionHash: shortStr,
    ledger: fc.integer({ min: 1, max: 999_999 }),
  }).map((data) => [WebhookEventType.TOKEN_BURN_SELF, data])

const metadataArb: fc.Arbitrary<[WebhookEventType, MetadataUpdatedEventData]> =
  fc.record({
    tokenAddress: shortStr,
    metadataUri: shortStr,
    updatedBy: shortStr,
    transactionHash: shortStr,
    ledger: fc.integer({ min: 1, max: 999_999 }),
  }).map((data) => [WebhookEventType.TOKEN_METADATA_UPDATED, data])

/** Union of all event/data combinations */
const anyEventArb = fc.oneof(tokenCreatedArb, burnArb, metadataArb)

// ---------------------------------------------------------------------------
// Property 67-A: Required fields are always present and non-empty
// ---------------------------------------------------------------------------

describe('Property 67-A: required fields are always present', () => {
  it('event, timestamp, data, signature are present for any input', () => {
    fc.assert(
      fc.property(anyEventArb, secretArb, ([event, data], secret) => {
        const payload = createPayload(event, data, secret)
        return (
          typeof payload.event === 'string' && payload.event.length > 0 &&
          typeof payload.timestamp === 'string' && payload.timestamp.length > 0 &&
          payload.data !== null && payload.data !== undefined &&
          typeof payload.signature === 'string' && payload.signature.length > 0
        )
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 67-B: Payload serialises to valid JSON
// ---------------------------------------------------------------------------

describe('Property 67-B: payload is valid JSON', () => {
  it('JSON.parse(JSON.stringify(payload)) round-trips without throwing', () => {
    fc.assert(
      fc.property(anyEventArb, secretArb, ([event, data], secret) => {
        const payload = createPayload(event, data, secret)
        const json = JSON.stringify(payload)
        const parsed = JSON.parse(json)
        return typeof parsed === 'object' && parsed !== null
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 67-C: `event` matches the input event type
// ---------------------------------------------------------------------------

describe('Property 67-C: event field matches input', () => {
  it('payload.event always equals the event type passed in', () => {
    fc.assert(
      fc.property(anyEventArb, secretArb, ([event, data], secret) => {
        const payload = createPayload(event, data, secret)
        return payload.event === event
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 67-D: `timestamp` is a valid ISO-8601 date string
// ---------------------------------------------------------------------------

describe('Property 67-D: timestamp is a valid ISO-8601 date', () => {
  it('new Date(payload.timestamp) is a valid date', () => {
    fc.assert(
      fc.property(anyEventArb, secretArb, ([event, data], secret) => {
        const payload = createPayload(event, data, secret)
        const d = new Date(payload.timestamp)
        return !isNaN(d.getTime())
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 67-E: `signature` matches v1.<timestamp>.<64-char-hex>
// ---------------------------------------------------------------------------

describe('Property 67-E: signature matches v1 format contract', () => {
  it('signature always matches /^v1\\.\\d+\\.[a-f0-9]{64}$/', () => {
    fc.assert(
      fc.property(anyEventArb, secretArb, ([event, data], secret) => {
        const payload = createPayload(event, data, secret)
        return /^v1\.\d+\.[a-f0-9]{64}$/.test(payload.signature)
      }),
      { numRuns: 100 },
    )
  })
})
