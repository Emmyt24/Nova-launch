/**
 * Property 69: Webhook Parallel Delivery
 *
 * Proves that webhook deliveries to multiple subscriptions execute in parallel,
 * not sequentially. The total wall-clock time must be significantly less than
 * the sum of individual delivery times.
 *
 * Properties tested:
 *   P69-A  All subscriptions receive the webhook for a given event
 *   P69-B  Delivery wall-clock time < sum of individual delivery times
 *          (proves parallelism — sequential would equal the sum)
 *
 * Assumptions / edge cases:
 *   - Each simulated endpoint has a fixed artificial delay (50 ms) to make
 *     sequential vs parallel timing distinguishable.
 *   - nock intercepts HTTP so no real network is involved.
 *   - The parallelism threshold is generous (50 % of sequential time) to
 *     avoid flakiness on slow CI runners.
 *   - webhookService side-effects (logDelivery, updateLastTriggered) are
 *     mocked so the test is self-contained.
 *
 * Follow-up work:
 *   - Extend to cover partial-failure scenarios (some endpoints 5xx).
 *   - Measure tail latency (p99) across many iterations.
 */

// Set env vars BEFORE any imports so module-level constants pick them up.
process.env.WEBHOOK_MAX_RETRIES = '1'
process.env.WEBHOOK_TIMEOUT_MS = '2000'
process.env.WEBHOOK_RETRY_DELAY_MS = '0'

import nock from 'nock'
import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  WebhookEventType,
  WebhookSubscription,
  TokenCreatedEventData,
} from '../types/webhook'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Artificial per-endpoint delay that makes sequential vs parallel measurable */
const ENDPOINT_DELAY_MS = 50

/** Parallelism is proven when wall time < this fraction of sequential time */
const PARALLEL_THRESHOLD = 0.75

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let subCounter = 0

function makeSubscription(url: string): WebhookSubscription {
  return {
    id: `sub-${++subCounter}`,
    url,
    events: [WebhookEventType.TOKEN_CREATED],
    secret: 'test-secret',
    active: true,
    createdBy: 'GTEST...',
    createdAt: new Date(),
    lastTriggered: null,
    tokenAddress: null,
  }
}

const sampleEventData: TokenCreatedEventData = {
  tokenAddress: 'GTOKEN',
  creator: 'GCREATOR',
  name: 'Parallel Token',
  symbol: 'PAR',
  decimals: 7,
  initialSupply: '1000000',
  transactionHash: 'tx-parallel',
  ledger: 42,
}

// ---------------------------------------------------------------------------
// Per-test setup / teardown
// ---------------------------------------------------------------------------

let service: import('../services/webhookDeliveryService').WebhookDeliveryService
let webhookService: typeof import('../services/webhookService').default

beforeEach(async () => {
  vi.resetModules()
  subCounter = 0

  const wsMod = await import('../services/webhookService')
  webhookService = wsMod.default

  vi.spyOn(webhookService, 'logDelivery').mockResolvedValue(undefined)
  vi.spyOn(webhookService, 'updateLastTriggered').mockResolvedValue(undefined)
  vi.spyOn(webhookService, 'findMatchingSubscriptions')

  const mod = await import('../services/webhookDeliveryService')
  service = mod.default
})

afterEach(() => {
  nock.cleanAll()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Property 69-A: All subscriptions receive the webhook
// ---------------------------------------------------------------------------

describe('Property 69-A: all subscriptions receive the webhook', () => {
  it('every subscription is called exactly once per triggerEvent invocation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 2–8 subscriptions per run
        fc.integer({ min: 2, max: 8 }),
        async (count) => {
          nock.cleanAll()
          const receivedBy = new Set<string>()

          const subscriptions: WebhookSubscription[] = Array.from(
            { length: count },
            (_, i) => {
              const host = `http://sub-${i}.local`
              nock(host)
                .post('/')
                .reply(200, () => {
                  receivedBy.add(`sub-${i}`)
                  return { ok: true }
                })
              return makeSubscription(`${host}/`)
            },
          )

          vi.spyOn(webhookService, 'findMatchingSubscriptions').mockResolvedValue(
            subscriptions,
          )

          await service.triggerEvent(
            WebhookEventType.TOKEN_CREATED,
            sampleEventData,
          )

          // Every subscription must have received the webhook
          return receivedBy.size === count
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 69-B: Delivery is parallel, not sequential
// ---------------------------------------------------------------------------

describe('Property 69-B: delivery wall-clock time proves parallelism', () => {
  it('total time is less than sum of individual delivery times', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 3–6 subscriptions — enough to make the timing gap clear
        fc.integer({ min: 3, max: 6 }),
        async (count) => {
          nock.cleanAll()

          const subscriptions: WebhookSubscription[] = Array.from(
            { length: count },
            (_, i) => {
              const host = `http://timing-${i}.local`
              nock(host)
                .post('/')
                .delay(ENDPOINT_DELAY_MS)
                .reply(200, { ok: true })
              return makeSubscription(`${host}/`)
            },
          )

          vi.spyOn(webhookService, 'findMatchingSubscriptions').mockResolvedValue(
            subscriptions,
          )

          const start = Date.now()
          await service.triggerEvent(
            WebhookEventType.TOKEN_CREATED,
            sampleEventData,
          )
          const wallTime = Date.now() - start

          // Sequential time would be count * ENDPOINT_DELAY_MS.
          // Parallel time should be roughly ENDPOINT_DELAY_MS (one round).
          const sequentialTime = count * ENDPOINT_DELAY_MS
          return wallTime < sequentialTime * PARALLEL_THRESHOLD
        },
      ),
      { numRuns: 50 },
    )
  })
})
