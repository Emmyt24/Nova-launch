/**
 * Chaos Test: Webhook Delivery Under Network Failures
 *
 * Simulates real-world network failure modes during webhook delivery and
 * verifies that the delivery service is resilient: it retries correctly,
 * never disables a subscription prematurely, and recovers once the network
 * is restored.
 *
 * Failure modes covered:
 *   - ECONNREFUSED  (connection refused — port closed / service down)
 *   - ETIMEDOUT     (TCP-level timeout — host unreachable / firewall drop)
 *   - ENOTFOUND     (DNS resolution failure — unknown host)
 *   - ECONNRESET    (connection reset mid-flight — abrupt server close)
 *   - Axios timeout (response takes longer than WEBHOOK_TIMEOUT_MS)
 *
 * Properties tested:
 *   N1  All network error types exhaust MAX_RETRIES and log failure
 *   N2  Subscription active flag is NOT mutated on network failure
 *   N3  Subscription is NOT auto-disabled after exhausting retries
 *   N4  Recovery: success on final attempt after N-1 network errors
 *   N5  Recovery: success on first attempt after prior all-fail run
 *   N6  DNS failure is treated identically to other network errors
 *   N7  Mixed failure sequence: timeout → refused → success
 *   N8  Parallel delivery: one failing endpoint does not affect others
 *
 * Security considerations:
 *   - Subscriptions must not be silently disabled by transient network
 *     conditions; premature disabling could be exploited to suppress
 *     legitimate event notifications.
 *   - Error messages logged must not contain raw secrets or payloads.
 *
 * Edge cases / assumptions:
 *   - WEBHOOK_RETRY_DELAY_MS=0 to keep tests fast.
 *   - WEBHOOK_TIMEOUT_MS=200 so timeout tests complete quickly.
 *   - nock intercepts all outbound HTTP; any un-intercepted request throws.
 *   - updateSubscriptionStatus is NOT called by the current implementation
 *     (auto-disable is commented out); tests assert it stays that way.
 *
 * Follow-up work:
 *   - Add property test for exponential back-off timing once a clock-mock
 *     helper is introduced.
 *   - Test TLS certificate errors (CERT_HAS_EXPIRED, DEPTH_ZERO_SELF_SIGNED).
 */

// Set env vars BEFORE any imports so module-level constants pick them up
process.env.WEBHOOK_MAX_RETRIES = '3'
process.env.WEBHOOK_TIMEOUT_MS = '200'
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
// Constants (mirror module-level values set via env above)
// ---------------------------------------------------------------------------
const BASE_URL = 'http://chaos-network-test.local'
const MAX_RETRIES = 3
const TIMEOUT_MS = 200

// ---------------------------------------------------------------------------
// Network error codes that nock can simulate
// ---------------------------------------------------------------------------
const NETWORK_ERRORS = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'] as const
type NetworkError = (typeof NETWORK_ERRORS)[number]

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSubscription(path = '/hook'): WebhookSubscription {
  return {
    id: 'sub-' + Math.random().toString(36).slice(2),
    url: `${BASE_URL}${path}`,
    events: [WebhookEventType.TOKEN_CREATED],
    secret: 'test-secret',
    active: true,
    createdBy: 'GTEST...',
    createdAt: new Date(),
    lastTriggered: null,
    tokenAddress: null,
  }
}

const eventData: TokenCreatedEventData = {
  tokenAddress: 'GTEST_TOKEN',
  creator: 'GCREATOR',
  name: 'Network Chaos Token',
  symbol: 'NCT',
  decimals: 7,
  initialSupply: '1000000',
  transactionHash: 'chaos-net-tx',
  ledger: 42000,
}

// ---------------------------------------------------------------------------
// Per-test setup / teardown
// ---------------------------------------------------------------------------

let service: import('../services/webhookDeliveryService').WebhookDeliveryService
let webhookService: typeof import('../services/webhookService').default

beforeEach(async () => {
  vi.resetModules()
  const wsMod = await import('../services/webhookService')
  webhookService = wsMod.default

  vi.spyOn(webhookService, 'logDelivery').mockResolvedValue(undefined)
  vi.spyOn(webhookService, 'updateLastTriggered').mockResolvedValue(undefined)
  vi.spyOn(webhookService, 'updateSubscriptionStatus').mockResolvedValue(true)

  const mod = await import('../services/webhookDeliveryService')
  service = mod.default

  nock.disableNetConnect()
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Property N1: All network error types exhaust MAX_RETRIES and log failure
// ---------------------------------------------------------------------------
describe('N1: all network error types exhaust retries and log failure', () => {
  it('retries MAX_RETRIES times for each network error code', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NETWORK_ERRORS),
        async (errorCode: NetworkError) => {
          nock(BASE_URL).post('/hook').times(MAX_RETRIES).replyWithError(errorCode)

          const sub = makeSubscription()
          await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

          const calls = vi.mocked(webhookService.logDelivery).mock.calls
          expect(calls.length).toBe(1)

          const [, , , statusCode, success, attempts, errorMessage] = calls[0]
          expect(success).toBe(false)
          expect(attempts).toBe(MAX_RETRIES)
          expect(statusCode).toBeNull()           // no HTTP response — pure network error
          expect(typeof errorMessage).toBe('string')
          expect((errorMessage as string).length).toBeGreaterThan(0)
          expect(nock.isDone()).toBe(true)

          nock.cleanAll()
          vi.mocked(webhookService.logDelivery).mockClear()
        },
      ),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property N2: Subscription active flag is NOT mutated on network failure
// ---------------------------------------------------------------------------
describe('N2: subscription active flag is not mutated on network failure', () => {
  it('active remains true after all retries are exhausted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NETWORK_ERRORS),
        async (errorCode: NetworkError) => {
          nock(BASE_URL).post('/hook').times(MAX_RETRIES).replyWithError(errorCode)

          const sub = makeSubscription()
          const activeBefore = sub.active

          await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

          // The subscription object itself must not be mutated
          expect(sub.active).toBe(activeBefore)

          nock.cleanAll()
          vi.mocked(webhookService.logDelivery).mockClear()
        },
      ),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property N3: Subscription is NOT auto-disabled after exhausting retries
// ---------------------------------------------------------------------------
describe('N3: subscription is not auto-disabled after network failure exhaustion', () => {
  it('updateSubscriptionStatus is never called after network failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NETWORK_ERRORS),
        async (errorCode: NetworkError) => {
          nock(BASE_URL).post('/hook').times(MAX_RETRIES).replyWithError(errorCode)

          const sub = makeSubscription()
          await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

          // Auto-disable is intentionally not implemented; assert it stays that way
          expect(webhookService.updateSubscriptionStatus).not.toHaveBeenCalled()

          nock.cleanAll()
          vi.mocked(webhookService.logDelivery).mockClear()
          vi.mocked(webhookService.updateSubscriptionStatus).mockClear()
        },
      ),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property N4: Recovery — success on final attempt after N-1 network errors
// ---------------------------------------------------------------------------
describe('N4: recovery — succeeds on final attempt after N-1 network errors', () => {
  it('logs success when last attempt succeeds after prior network failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NETWORK_ERRORS),
        async (errorCode: NetworkError) => {
          // Fail MAX_RETRIES-1 times, then succeed
          for (let i = 0; i < MAX_RETRIES - 1; i++) {
            nock(BASE_URL).post('/hook').replyWithError(errorCode)
          }
          nock(BASE_URL).post('/hook').reply(200)

          const sub = makeSubscription()
          await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

          const calls = vi.mocked(webhookService.logDelivery).mock.calls
          expect(calls.length).toBe(1)

          const [, , , statusCode, success, attempts] = calls[0]
          expect(success).toBe(true)
          expect(attempts).toBe(MAX_RETRIES)
          expect(statusCode).toBe(200)
          expect(nock.isDone()).toBe(true)

          nock.cleanAll()
          vi.mocked(webhookService.logDelivery).mockClear()
          vi.mocked(webhookService.updateLastTriggered).mockClear()
        },
      ),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property N5: Recovery — success on first attempt after prior all-fail run
// ---------------------------------------------------------------------------
describe('N5: recovery after network restoration', () => {
  it('delivers successfully on a fresh attempt after a previous all-fail run', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NETWORK_ERRORS),
        async (errorCode: NetworkError) => {
          // First delivery: all retries fail
          nock(BASE_URL).post('/hook').times(MAX_RETRIES).replyWithError(errorCode)
          const sub = makeSubscription()
          await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

          vi.mocked(webhookService.logDelivery).mockClear()
          vi.mocked(webhookService.updateLastTriggered).mockClear()
          nock.cleanAll()

          // Network restored — second delivery succeeds on first attempt
          nock(BASE_URL).post('/hook').reply(200)
          await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

          const calls = vi.mocked(webhookService.logDelivery).mock.calls
          expect(calls.length).toBe(1)

          const [, , , statusCode, success, attempts] = calls[0]
          expect(success).toBe(true)
          expect(attempts).toBe(1)
          expect(statusCode).toBe(200)
          expect(nock.isDone()).toBe(true)

          nock.cleanAll()
          vi.mocked(webhookService.logDelivery).mockClear()
          vi.mocked(webhookService.updateLastTriggered).mockClear()
        },
      ),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property N6: DNS failure is treated identically to other network errors
// ---------------------------------------------------------------------------
describe('N6: DNS failure (ENOTFOUND) behaves identically to other network errors', () => {
  it('ENOTFOUND exhausts retries, logs failure, does not disable subscription', async () => {
    nock(BASE_URL).post('/hook').times(MAX_RETRIES).replyWithError('ENOTFOUND')

    const sub = makeSubscription()
    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

    const calls = vi.mocked(webhookService.logDelivery).mock.calls
    expect(calls.length).toBe(1)

    const [, , , statusCode, success, attempts] = calls[0]
    expect(success).toBe(false)
    expect(attempts).toBe(MAX_RETRIES)
    expect(statusCode).toBeNull()
    expect(sub.active).toBe(true)
    expect(webhookService.updateSubscriptionStatus).not.toHaveBeenCalled()
    expect(nock.isDone()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Property N7: Mixed failure sequence — timeout → refused → success
// ---------------------------------------------------------------------------
describe('N7: mixed failure sequence resolves correctly', () => {
  it('timeout then ECONNREFUSED then 200 logs success on attempt 3', async () => {
    nock(BASE_URL).post('/hook').delay(TIMEOUT_MS + 300).reply(200)  // attempt 1: timeout
    nock(BASE_URL).post('/hook').replyWithError('ECONNREFUSED')       // attempt 2: refused
    nock(BASE_URL).post('/hook').reply(200)                           // attempt 3: success

    const sub = makeSubscription()
    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

    const calls = vi.mocked(webhookService.logDelivery).mock.calls
    expect(calls.length).toBe(1)

    const [, , , statusCode, success, attempts] = calls[0]
    expect(success).toBe(true)
    expect(attempts).toBe(3)
    expect(statusCode).toBe(200)
    expect(nock.isDone()).toBe(true)
  }, 10_000)
})

// ---------------------------------------------------------------------------
// Property N8: Parallel delivery — one failing endpoint does not affect others
// ---------------------------------------------------------------------------
describe('N8: parallel delivery isolation under network failures', () => {
  it('good endpoints succeed even when one endpoint has persistent network errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        fc.constantFrom(...NETWORK_ERRORS),
        async (n: number, errorCode: NetworkError) => {
          const badSub = makeSubscription('/bad')
          const goodSubs = Array.from({ length: n - 1 }, (_, i) =>
            makeSubscription(`/good-${i}`),
          )
          const allSubs = [badSub, ...goodSubs]

          // Bad endpoint fails all retries
          nock(BASE_URL).post('/bad').times(MAX_RETRIES).replyWithError(errorCode)
          // Good endpoints succeed immediately
          goodSubs.forEach((_, i) => {
            nock(BASE_URL).post(`/good-${i}`).reply(200)
          })

          vi.spyOn(webhookService, 'findMatchingSubscriptions').mockResolvedValue(allSubs)

          await service.triggerEvent(WebhookEventType.TOKEN_CREATED, eventData)

          const allCalls = vi.mocked(webhookService.logDelivery).mock.calls
          expect(allCalls.length).toBe(n)

          const successCalls = allCalls.filter(c => c[4] === true)
          const failCalls = allCalls.filter(c => c[4] === false)
          expect(successCalls.length).toBe(n - 1)
          expect(failCalls.length).toBe(1)
          expect(nock.isDone()).toBe(true)

          nock.cleanAll()
          vi.mocked(webhookService.logDelivery).mockClear()
          vi.mocked(webhookService.updateLastTriggered).mockClear()
          vi.mocked(webhookService.findMatchingSubscriptions).mockRestore()
        },
      ),
      { numRuns: 10 },
    )
  })
})

// ---------------------------------------------------------------------------
// Concrete edge cases
// ---------------------------------------------------------------------------
describe('Concrete edge cases', () => {
  it('single ECONNREFUSED on attempt 1 with success on attempt 2', async () => {
    nock(BASE_URL).post('/hook').replyWithError('ECONNREFUSED')
    nock(BASE_URL).post('/hook').reply(200)

    const sub = makeSubscription()
    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

    const [, , , statusCode, success, attempts, errorMessage] =
      vi.mocked(webhookService.logDelivery).mock.calls[0]

    expect(success).toBe(true)
    expect(attempts).toBe(2)
    expect(statusCode).toBe(200)
    expect(errorMessage).toBeNull()
    expect(webhookService.updateLastTriggered).toHaveBeenCalledWith(sub.id)
  })

  it('all ENOTFOUND — updateLastTriggered is never called', async () => {
    nock(BASE_URL).post('/hook').times(MAX_RETRIES).replyWithError('ENOTFOUND')

    const sub = makeSubscription()
    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

    expect(webhookService.updateLastTriggered).not.toHaveBeenCalled()
  })

  it('axios timeout — error message is non-null and descriptive', async () => {
    nock(BASE_URL).post('/hook').times(MAX_RETRIES).delay(TIMEOUT_MS + 300).reply(200)

    const sub = makeSubscription()
    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, eventData)

    const [, , , , success, , errorMessage] =
      vi.mocked(webhookService.logDelivery).mock.calls[0]

    expect(success).toBe(false)
    expect(typeof errorMessage).toBe('string')
    expect((errorMessage as string).length).toBeGreaterThan(0)
  }, 10_000)
})
