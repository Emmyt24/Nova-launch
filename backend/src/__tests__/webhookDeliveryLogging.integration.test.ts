// Set env vars BEFORE any imports so module-level constants pick them up
// Integration Tests: Webhook Delivery Logging
//
// Verifies that every delivery attempt — successful, failed, or retried —
// is persisted to webhook_delivery_logs with the correct metadata.
//
// Strategy:
//   - HTTP calls are intercepted by nock (no real network I/O).
//   - Database I/O is replaced by an in-memory store that mirrors the
//     webhook_delivery_logs schema exactly (see InMemoryDeliveryLog).
//   - webhookService.logDelivery is replaced with a real implementation
//     backed by that store so we can assert on persisted rows, not just
//     spy call arguments.
//
// Log format example:
//   { id, subscriptionId, event, payload: { event, timestamp, data, signature },
//     statusCode, success, attempts, lastAttemptAt, errorMessage, createdAt }
//
// Edge cases / assumptions:
//   - 4xx responses are non-retryable; exactly 1 attempt is logged.
//   - 5xx responses exhaust MAX_RETRIES; the final status code is logged.
//   - Network errors (ECONNREFUSED, ETIMEDOUT) are retried like 5xx.
//   - Exactly one log row is written per deliverWebhook() invocation.
//   - lastAttemptAt and createdAt are both valid Date instances.
//   - The payload stored in the log must carry a valid v1 HMAC signature.
//   - updateLastTriggered is called only on success.
//
// Follow-up work:
//   - Add tests for triggerEvent() fan-out once a real DB fixture is wired.
//   - Consider asserting on log row count via getDeliveryLogs() once the
//     route layer is covered by e2e tests.
process.env.WEBHOOK_MAX_RETRIES = "3"
process.env.WEBHOOK_TIMEOUT_MS = "200"
process.env.WEBHOOK_RETRY_DELAY_MS = "0" // keep tests fast

import nock from "nock";
import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  WebhookEventType,
  WebhookSubscription,
  WebhookPayload,
  TokenCreatedEventData,
  BurnEventData,
  MetadataUpdatedEventData,
} from "../types/webhook";
import { verifyWebhookSignature } from "../utils/crypto";

// ── Constants (mirror env vars set above) ────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_URL = "http://delivery-log-test.local";

// ── In-memory delivery log store ─────────────────────────────────────────────
/**
 * Mirrors the webhook_delivery_logs table schema from schema.sql.
 * Used as the backing store for the logDelivery spy so assertions can
 * inspect persisted rows rather than raw spy arguments.
 */
interface InMemoryDeliveryLog {
  id: string;
  subscriptionId: string;
  event: WebhookEventType;
  payload: WebhookPayload;
  statusCode: number | null;
  success: boolean;
  attempts: number;
  lastAttemptAt: Date;
  errorMessage: string | null;
  createdAt: Date;
}

let deliveryLogs: InMemoryDeliveryLog[] = [];
let lastTriggeredCalls: string[] = []; // subscription IDs

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeSubscription(path = "/hook"): WebhookSubscription {
  return {
    id: `sub-${uuidv4()}`,
    url: `${BASE_URL}${path}`,
    events: [WebhookEventType.TOKEN_CREATED],
    secret: "integration-test-secret-32-bytes!",
    active: true,
    createdBy: "GCREATOR_INTEGRATION_TEST_ADDRESS",
    createdAt: new Date(),
    lastTriggered: null,
    tokenAddress: null,
  };
}

const tokenCreatedData: TokenCreatedEventData = {
  tokenAddress: "GTOKEN_INTEGRATION_TEST_ADDRESS_1234",
  creator: "GCREATOR_INTEGRATION_TEST_ADDRESS",
  name: "Integration Token",
  symbol: "INTG",
  decimals: 7,
  initialSupply: "10000000",
  transactionHash: "integration-tx-hash-001",
  ledger: 55555,
};

const burnEventData: BurnEventData = {
  tokenAddress: "GTOKEN_INTEGRATION_TEST_ADDRESS_1234",
  from: "GBURNER_ADDRESS",
  amount: "500000",
  burner: "GBURNER_ADDRESS",
  transactionHash: "integration-tx-hash-burn-001",
  ledger: 55556,
};

const metadataEventData: MetadataUpdatedEventData = {
  tokenAddress: "GTOKEN_INTEGRATION_TEST_ADDRESS_1234",
  metadataUri: "ipfs://QmIntegrationTest",
  updatedBy: "GCREATOR_INTEGRATION_TEST_ADDRESS",
  transactionHash: "integration-tx-hash-meta-001",
  ledger: 55557,
};

// ── Per-test setup / teardown ─────────────────────────────────────────────────
let service: import("../services/webhookDeliveryService").WebhookDeliveryService;
let webhookService: typeof import("../services/webhookService").default;

beforeEach(async () => {
  deliveryLogs = [];
  lastTriggeredCalls = [];

  vi.resetModules();

  const wsMod = await import("../services/webhookService");
  webhookService = wsMod.default;

  // Replace logDelivery with an in-memory implementation so we can assert
  // on the full persisted row shape, not just spy call arguments.
  vi.spyOn(webhookService, "logDelivery").mockImplementation(
    async (subscriptionId, event, payload, statusCode, success, attempts, errorMessage = null) => {
      const now = new Date();
      deliveryLogs.push({
        id: uuidv4(),
        subscriptionId,
        event,
        payload,
        statusCode,
        success,
        attempts,
        lastAttemptAt: now,
        errorMessage,
        createdAt: now,
      });
    }
  );

  vi.spyOn(webhookService, "updateLastTriggered").mockImplementation(
    async (id: string) => {
      lastTriggeredCalls.push(id);
    }
  );

  const mod = await import("../services/webhookDeliveryService");
  service = mod.default;
});

afterEach(() => {
  nock.cleanAll();
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLog(index = 0): InMemoryDeliveryLog {
  return deliveryLogs[index];
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe("Webhook Delivery Logging — successful delivery", () => {
  it("logs exactly one row on first-attempt success (HTTP 200)", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(1);
  });

  it("records correct metadata for a 200 response", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.subscriptionId).toBe(sub.id);
    expect(log.event).toBe(WebhookEventType.TOKEN_CREATED);
    expect(log.statusCode).toBe(200);
    expect(log.success).toBe(true);
    expect(log.attempts).toBe(1);
    expect(log.errorMessage).toBeNull();
  });

  it("records correct metadata for a 201 response", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(201);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.statusCode).toBe(201);
    expect(log.success).toBe(true);
    expect(log.attempts).toBe(1);
    expect(log.errorMessage).toBeNull();
  });

  it("calls updateLastTriggered exactly once with the subscription ID on success", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(lastTriggeredCalls).toHaveLength(1);
    expect(lastTriggeredCalls[0]).toBe(sub.id);
  });

  it("does NOT call updateLastTriggered when delivery fails", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).reply(500);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(lastTriggeredCalls).toHaveLength(0);
  });
});

describe("Webhook Delivery Logging — timestamps", () => {
  it("records a valid ISO timestamp in createdAt", async () => {
    const sub = makeSubscription();
    const before = new Date();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const after = new Date();
    const log = getLog();
    expect(log.createdAt).toBeInstanceOf(Date);
    expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(log.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("records a valid ISO timestamp in lastAttemptAt", async () => {
    const sub = makeSubscription();
    const before = new Date();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const after = new Date();
    const log = getLog();
    expect(log.lastAttemptAt).toBeInstanceOf(Date);
    expect(log.lastAttemptAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(log.lastAttemptAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("Webhook Delivery Logging — payload integrity", () => {
  it("stores a non-null payload object in the log", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.payload).not.toBeNull();
    expect(typeof log.payload).toBe("object");
  });

  it("payload event field matches the triggered event type", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(getLog().payload.event).toBe(WebhookEventType.TOKEN_CREATED);
  });

  it("payload carries a valid v1 HMAC signature", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const { payload } = getLog();
    expect(payload.signature).toMatch(/^v1\.\d+\.[a-f0-9]{64}$/);

    // Reconstruct the signed string the same way webhookService.createPayload does
    const payloadStr = JSON.stringify({
      event: payload.event,
      timestamp: payload.timestamp,
      data: payload.data,
    });
    const isValid = verifyWebhookSignature(payloadStr, payload.signature, sub.secret);
    expect(isValid).toBe(true);
  });

  it("payload timestamp is a valid ISO 8601 string", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const { timestamp } = getLog().payload;
    expect(typeof timestamp).toBe("string");
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it("payload data matches the original event data", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(getLog().payload.data).toEqual(tokenCreatedData);
  });
});

describe("Webhook Delivery Logging — failed delivery (4xx)", () => {
  it("logs exactly one row on a 400 response (non-retryable)", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(400);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(1);
  });

  it("records success=false and attempts=1 for a 400 response", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(400);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.statusCode).toBe(400);
    expect(log.success).toBe(false);
    expect(log.attempts).toBe(1);
  });

  it("records a non-null errorMessage for a 400 response", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(400);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(getLog().errorMessage).not.toBeNull();
    expect(typeof getLog().errorMessage).toBe("string");
  });

  it("records success=false and attempts=1 for a 404 response", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(404);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.statusCode).toBe(404);
    expect(log.success).toBe(false);
    expect(log.attempts).toBe(1);
  });

  it("records success=false and attempts=1 for a 422 response", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(422);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.statusCode).toBe(422);
    expect(log.success).toBe(false);
    expect(log.attempts).toBe(1);
  });
});

describe("Webhook Delivery Logging — failed delivery (5xx)", () => {
  it("logs exactly one row after exhausting all retries on 500", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).reply(500);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(1);
  });

  it("records success=false, attempts=MAX_RETRIES, and statusCode for 500", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).reply(500);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.statusCode).toBe(500);
    expect(log.success).toBe(false);
    expect(log.attempts).toBe(MAX_RETRIES);
  });

  it("records a non-null errorMessage after 5xx exhaustion", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).reply(503);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(getLog().errorMessage).not.toBeNull();
  });

  it("records the last status code seen after 5xx retries", async () => {
    const sub = makeSubscription();
    // All retries return 502
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).reply(502);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(getLog().statusCode).toBe(502);
  });
});

describe("Webhook Delivery Logging — retry attempts tracking", () => {
  it("records attempts=2 when first attempt fails (network error) and second succeeds", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").replyWithError("ECONNREFUSED");
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.success).toBe(true);
    expect(log.attempts).toBe(2);
    expect(log.errorMessage).toBeNull();
  });

  it("records attempts=3 when first two fail (5xx) and third succeeds", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(503);
    nock(BASE_URL).post("/hook").reply(503);
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.success).toBe(true);
    expect(log.attempts).toBe(3);
    expect(log.statusCode).toBe(200);
  });

  it("records attempts=MAX_RETRIES when all attempts fail with network errors", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).replyWithError("ETIMEDOUT");

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();
    expect(log.success).toBe(false);
    expect(log.attempts).toBe(MAX_RETRIES);
    expect(log.statusCode).toBeNull(); // no HTTP response for network errors
    expect(log.errorMessage).not.toBeNull();
  });

  it("records statusCode=null when failure is a network error (no HTTP response)", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).replyWithError("ECONNRESET");

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(getLog().statusCode).toBeNull();
  });
});

describe("Webhook Delivery Logging — event type coverage", () => {
  const eventCases: [WebhookEventType, typeof tokenCreatedData | typeof burnEventData | typeof metadataEventData][] = [
    [WebhookEventType.TOKEN_CREATED, tokenCreatedData],
    [WebhookEventType.TOKEN_BURN_SELF, burnEventData],
    [WebhookEventType.TOKEN_BURN_ADMIN, burnEventData],
    [WebhookEventType.TOKEN_METADATA_UPDATED, metadataEventData],
  ];

  for (const [eventType, data] of eventCases) {
    it(`logs correct event type for ${eventType}`, async () => {
      const sub = makeSubscription();
      nock(BASE_URL).post("/hook").reply(200);

      await service.deliverWebhook(sub, eventType, data);

      expect(getLog().event).toBe(eventType);
      expect(getLog().payload.event).toBe(eventType);
    });
  }
});

describe("Webhook Delivery Logging — one log per invocation invariant", () => {
  it("writes exactly one log row regardless of outcome (success)", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(1);
  });

  it("writes exactly one log row regardless of outcome (4xx)", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(403);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(1);
  });

  it("writes exactly one log row regardless of outcome (5xx exhaustion)", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).reply(500);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(1);
  });

  it("writes exactly one log row regardless of outcome (network error exhaustion)", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).replyWithError("ECONNREFUSED");

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(1);
  });

  it("writes N log rows for N independent deliverWebhook calls", async () => {
    const sub1 = makeSubscription("/hook-1");
    const sub2 = makeSubscription("/hook-2");
    const sub3 = makeSubscription("/hook-3");

    nock(BASE_URL).post("/hook-1").reply(200);
    nock(BASE_URL).post("/hook-2").reply(404);
    nock(BASE_URL).post("/hook-3").times(MAX_RETRIES).reply(500);

    await service.deliverWebhook(sub1, WebhookEventType.TOKEN_CREATED, tokenCreatedData);
    await service.deliverWebhook(sub2, WebhookEventType.TOKEN_CREATED, tokenCreatedData);
    await service.deliverWebhook(sub3, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    expect(deliveryLogs).toHaveLength(3);
    expect(deliveryLogs[0].subscriptionId).toBe(sub1.id);
    expect(deliveryLogs[1].subscriptionId).toBe(sub2.id);
    expect(deliveryLogs[2].subscriptionId).toBe(sub3.id);
  });
});

describe("Webhook Delivery Logging — log row schema completeness", () => {
  it("every required field is present and typed correctly on a success log", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").reply(200);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();

    // id — UUID format
    expect(log.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    // subscriptionId
    expect(typeof log.subscriptionId).toBe("string");
    expect(log.subscriptionId.length).toBeGreaterThan(0);
    // event
    expect(Object.values(WebhookEventType)).toContain(log.event);
    // payload
    expect(log.payload).toMatchObject({
      event: expect.any(String),
      timestamp: expect.any(String),
      data: expect.any(Object),
      signature: expect.stringMatching(/^v1\.\d+\.[a-f0-9]{64}$/),
    });
    // statusCode
    expect(typeof log.statusCode).toBe("number");
    // success
    expect(typeof log.success).toBe("boolean");
    // attempts
    expect(typeof log.attempts).toBe("number");
    expect(log.attempts).toBeGreaterThanOrEqual(1);
    // lastAttemptAt
    expect(log.lastAttemptAt).toBeInstanceOf(Date);
    // errorMessage
    expect(log.errorMessage).toBeNull();
    // createdAt
    expect(log.createdAt).toBeInstanceOf(Date);
  });

  it("every required field is present and typed correctly on a failure log", async () => {
    const sub = makeSubscription();
    nock(BASE_URL).post("/hook").times(MAX_RETRIES).reply(500);

    await service.deliverWebhook(sub, WebhookEventType.TOKEN_CREATED, tokenCreatedData);

    const log = getLog();

    expect(log.success).toBe(false);
    expect(log.attempts).toBe(MAX_RETRIES);
    expect(typeof log.errorMessage).toBe("string");
    expect(log.errorMessage!.length).toBeGreaterThan(0);
    expect(log.statusCode).toBe(500);
    expect(log.lastAttemptAt).toBeInstanceOf(Date);
    expect(log.createdAt).toBeInstanceOf(Date);
  });
});
