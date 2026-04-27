/**
 * Event Bus Architecture for Microservice Communication
 *
 * An in-process, typed event bus that decouples microservice modules:
 *  - Publish/subscribe with wildcard support ("*" catches all events)
 *  - Async handlers with isolated error handling (one bad handler never
 *    blocks others)
 *  - One-time subscriptions via `once()`
 *  - Unsubscribe support
 *  - Dead-letter queue for failed handler invocations
 *  - Event history for replay / debugging
 *
 * Issue: #843
 */

import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BusEvent<T = unknown> {
  /** Unique event identifier */
  id: string;
  /** Event type / topic (e.g. "token.created", "webhook.failed") */
  type: string;
  /** Event payload */
  payload: T;
  /** ISO timestamp of publication */
  timestamp: string;
  /** Optional correlation ID for distributed tracing */
  correlationId?: string;
}

export type EventHandler<T = unknown> = (
  event: BusEvent<T>
) => void | Promise<void>;

export interface Subscription {
  id: string;
  eventType: string;
  /** Remove this subscription */
  unsubscribe: () => void;
}

export interface DeadLetterEntry {
  event: BusEvent;
  handlerSubscriptionId: string;
  error: string;
  failedAt: string;
}

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

export class EventBus {
  private handlers = new Map<string, Map<string, EventHandler>>();
  private history: BusEvent[] = [];
  private deadLetterQueue: DeadLetterEntry[] = [];

  /** Maximum events kept in history. 0 = unlimited. */
  private readonly maxHistory: number;

  constructor(options: { maxHistory?: number } = {}) {
    this.maxHistory = options.maxHistory ?? 1000;
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to an event type.
   *
   * Use `"*"` to receive every event regardless of type.
   *
   * @returns A `Subscription` object with an `unsubscribe()` method.
   */
  subscribe<T = unknown>(
    eventType: string,
    handler: EventHandler<T>
  ): Subscription {
    const subscriptionId = uuidv4();

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Map());
    }

    this.handlers.get(eventType)!.set(subscriptionId, handler as EventHandler);

    return {
      id: subscriptionId,
      eventType,
      unsubscribe: () => this.unsubscribe(eventType, subscriptionId),
    };
  }

  /**
   * Subscribe to an event type for a single invocation.
   * The handler is automatically removed after the first matching event.
   */
  once<T = unknown>(
    eventType: string,
    handler: EventHandler<T>
  ): Subscription {
    let subscription: Subscription;

    const wrappedHandler: EventHandler<T> = async (event) => {
      subscription.unsubscribe();
      await handler(event);
    };

    subscription = this.subscribe(eventType, wrappedHandler);
    return subscription;
  }

  /**
   * Remove a specific subscription.
   */
  unsubscribe(eventType: string, subscriptionId: string): void {
    this.handlers.get(eventType)?.delete(subscriptionId);
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  /**
   * Publish an event to all matching subscribers.
   *
   * Handlers are invoked concurrently. A failing handler is caught and
   * recorded in the dead-letter queue — it does not affect other handlers.
   *
   * @returns The fully constructed `BusEvent` that was dispatched.
   */
  async publish<T = unknown>(
    type: string,
    payload: T,
    options: { correlationId?: string } = {}
  ): Promise<BusEvent<T>> {
    const event: BusEvent<T> = {
      id: uuidv4(),
      type,
      payload,
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId,
    };

    this.recordHistory(event);

    // Collect handlers: exact-match + wildcard
    const exactHandlers = this.handlers.get(type) ?? new Map<string, EventHandler>();
    const wildcardHandlers = this.handlers.get("*") ?? new Map<string, EventHandler>();

    const allHandlers = new Map([...exactHandlers, ...wildcardHandlers]);

    await Promise.all(
      Array.from(allHandlers.entries()).map(([subId, handler]) =>
        this.invokeHandler(handler, event, subId)
      )
    );

    return event;
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  /** Return a copy of the event history (most recent last). */
  getHistory(eventType?: string): BusEvent[] {
    if (!eventType) return [...this.history];
    return this.history.filter((e) => e.type === eventType);
  }

  /** Return a copy of the dead-letter queue. */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /** Number of active subscriptions for a given event type (or total). */
  subscriberCount(eventType?: string): number {
    if (eventType) return this.handlers.get(eventType)?.size ?? 0;
    let total = 0;
    for (const map of this.handlers.values()) total += map.size;
    return total;
  }

  /** Remove all subscriptions and clear history / DLQ. */
  reset(): void {
    this.handlers.clear();
    this.history = [];
    this.deadLetterQueue = [];
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async invokeHandler(
    handler: EventHandler,
    event: BusEvent,
    subscriptionId: string
  ): Promise<void> {
    try {
      await handler(event);
    } catch (err) {
      const entry: DeadLetterEntry = {
        event,
        handlerSubscriptionId: subscriptionId,
        error: err instanceof Error ? err.message : String(err),
        failedAt: new Date().toISOString(),
      };
      this.deadLetterQueue.push(entry);
      console.error(
        `[EventBus] Handler ${subscriptionId} failed for event "${event.type}":`,
        err
      );
    }
  }

  private recordHistory(event: BusEvent): void {
    this.history.push(event);
    if (this.maxHistory > 0 && this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (shared across the application)
// ---------------------------------------------------------------------------

export const eventBus = new EventBus();
export default eventBus;
