/**
 * Tests for Event Bus Architecture (#843)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus, BusEvent } from "../services/eventBus";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBus() {
  return new EventBus();
}

// ---------------------------------------------------------------------------
// subscribe / publish
// ---------------------------------------------------------------------------

describe("EventBus — subscribe & publish", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it("delivers event to a subscriber", async () => {
    const handler = vi.fn();
    bus.subscribe("token.created", handler);

    await bus.publish("token.created", { symbol: "TKN" });

    expect(handler).toHaveBeenCalledOnce();
    const event: BusEvent = handler.mock.calls[0][0];
    expect(event.type).toBe("token.created");
    expect(event.payload).toEqual({ symbol: "TKN" });
  });

  it("delivers to multiple subscribers for the same event", async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe("token.created", h1);
    bus.subscribe("token.created", h2);

    await bus.publish("token.created", {});

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("does not deliver to subscribers of a different event type", async () => {
    const handler = vi.fn();
    bus.subscribe("token.burned", handler);

    await bus.publish("token.created", {});

    expect(handler).not.toHaveBeenCalled();
  });

  it("returns the published BusEvent", async () => {
    const event = await bus.publish("test.event", { x: 1 });

    expect(event.id).toBeDefined();
    expect(event.type).toBe("test.event");
    expect(event.payload).toEqual({ x: 1 });
    expect(event.timestamp).toBeDefined();
  });

  it("attaches correlationId when provided", async () => {
    const event = await bus.publish("test.event", {}, { correlationId: "abc-123" });
    expect(event.correlationId).toBe("abc-123");
  });

  it("awaits async handlers before resolving", async () => {
    const order: string[] = [];
    bus.subscribe("seq.event", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("handler");
    });

    await bus.publish("seq.event", {});
    order.push("after publish");

    expect(order).toEqual(["handler", "after publish"]);
  });
});

// ---------------------------------------------------------------------------
// Wildcard subscription
// ---------------------------------------------------------------------------

describe("EventBus — wildcard subscription", () => {
  it("wildcard handler receives all events", async () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe("*", handler);

    await bus.publish("token.created", {});
    await bus.publish("webhook.failed", {});

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("wildcard and specific handlers both fire", async () => {
    const bus = makeBus();
    const specific = vi.fn();
    const wildcard = vi.fn();
    bus.subscribe("token.created", specific);
    bus.subscribe("*", wildcard);

    await bus.publish("token.created", {});

    expect(specific).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// once()
// ---------------------------------------------------------------------------

describe("EventBus — once()", () => {
  it("fires only on the first matching event", async () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.once("token.created", handler);

    await bus.publish("token.created", {});
    await bus.publish("token.created", {});

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not affect other subscribers", async () => {
    const bus = makeBus();
    const persistent = vi.fn();
    const oneTime = vi.fn();
    bus.subscribe("ev", persistent);
    bus.once("ev", oneTime);

    await bus.publish("ev", {});
    await bus.publish("ev", {});

    expect(persistent).toHaveBeenCalledTimes(2);
    expect(oneTime).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// unsubscribe()
// ---------------------------------------------------------------------------

describe("EventBus — unsubscribe()", () => {
  it("stops delivering after unsubscribe", async () => {
    const bus = makeBus();
    const handler = vi.fn();
    const sub = bus.subscribe("ev", handler);

    await bus.publish("ev", {});
    sub.unsubscribe();
    await bus.publish("ev", {});

    expect(handler).toHaveBeenCalledOnce();
  });

  it("subscriberCount decreases after unsubscribe", () => {
    const bus = makeBus();
    const sub = bus.subscribe("ev", vi.fn());
    expect(bus.subscriberCount("ev")).toBe(1);
    sub.unsubscribe();
    expect(bus.subscriberCount("ev")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Dead-letter queue
// ---------------------------------------------------------------------------

describe("EventBus — dead-letter queue", () => {
  it("records failed handler in DLQ without throwing", async () => {
    const bus = makeBus();
    bus.subscribe("ev", async () => {
      throw new Error("handler boom");
    });

    await expect(bus.publish("ev", {})).resolves.toBeDefined();

    const dlq = bus.getDeadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].error).toBe("handler boom");
    expect(dlq[0].event.type).toBe("ev");
  });

  it("other handlers still run when one fails", async () => {
    const bus = makeBus();
    const good = vi.fn();
    bus.subscribe("ev", async () => { throw new Error("fail"); });
    bus.subscribe("ev", good);

    await bus.publish("ev", {});

    expect(good).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe("EventBus — history", () => {
  it("records published events", async () => {
    const bus = makeBus();
    await bus.publish("a", { n: 1 });
    await bus.publish("b", { n: 2 });

    expect(bus.getHistory()).toHaveLength(2);
  });

  it("filters history by event type", async () => {
    const bus = makeBus();
    await bus.publish("a", {});
    await bus.publish("b", {});
    await bus.publish("a", {});

    expect(bus.getHistory("a")).toHaveLength(2);
    expect(bus.getHistory("b")).toHaveLength(1);
  });

  it("respects maxHistory cap", async () => {
    const bus = new EventBus({ maxHistory: 3 });
    for (let i = 0; i < 5; i++) await bus.publish("ev", { i });

    expect(bus.getHistory()).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// subscriberCount / reset
// ---------------------------------------------------------------------------

describe("EventBus — subscriberCount & reset", () => {
  it("counts total subscribers across all types", () => {
    const bus = makeBus();
    bus.subscribe("a", vi.fn());
    bus.subscribe("a", vi.fn());
    bus.subscribe("b", vi.fn());

    expect(bus.subscriberCount()).toBe(3);
  });

  it("reset clears everything", async () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe("ev", handler);
    await bus.publish("ev", {});

    bus.reset();

    await bus.publish("ev", {});
    expect(handler).toHaveBeenCalledOnce(); // only the pre-reset call
    expect(bus.getHistory()).toHaveLength(1); // only post-reset event
    expect(bus.subscriberCount()).toBe(0);
  });
});
