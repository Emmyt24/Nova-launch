/**
 * Tests for WebSocketService – live event streaming.
 *
 * Uses a real http.Server + WebSocketServer so we exercise the actual
 * upgrade / message / close lifecycle without mocking ws internals.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import WebSocket from "ws";
import { WebSocketService, LiveEvent, LiveEventType } from "../services/websocket";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves with the next parsed JSON message from ws.
 * Must be called BEFORE the message is sent so the listener is registered first.
 */
function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("nextMessage timeout")), 4000);
    ws.once("message", (data) => {
      clearTimeout(timer);
      try { resolve(JSON.parse(data.toString())); }
      catch { resolve(data.toString()); }
    });
    ws.once("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Creates a WebSocket client and waits for the connection to open.
 * The `message` listener is registered BEFORE `open` fires so we never
 * miss the server's immediate welcome message.
 */
function createClient(port: number): { ws: WebSocket; connected: Promise<void>; firstMessage: Promise<unknown> } {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  // Register message listener immediately (before open)
  const firstMessage = new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("firstMessage timeout")), 4000);
    ws.once("message", (data) => {
      clearTimeout(timer);
      try { resolve(JSON.parse(data.toString())); }
      catch { resolve(data.toString()); }
    });
  });

  const connected = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timeout")), 4000);
    ws.once("open", () => { clearTimeout(timer); resolve(); });
    ws.once("error", (e) => { clearTimeout(timer); reject(e); });
  });

  return { ws, connected, firstMessage };
}

function listenOnFreePort(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else reject(new Error("Could not get port"));
    });
  });
}

function closeClient(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once("close", () => resolve());
    ws.close();
  });
}

function forceCloseServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (typeof (server as any).closeAllConnections === "function") {
      (server as any).closeAllConnections();
    }
    server.close(() => resolve());
    setTimeout(resolve, 300);
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("WebSocketService", () => {
  let service: WebSocketService;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    service = new WebSocketService();
    server = http.createServer();
    port = await listenOnFreePort(server);
    service.attach(server);
  }, 10_000);

  afterEach(async () => {
    service.close();
    await forceCloseServer(server);
  }, 10_000);

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  describe("connection lifecycle", () => {
    it("sends a connected ack on open", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      const msg = await firstMessage as any;

      expect(msg.type).toBe("connected");
      expect(msg.timestamp).toBeDefined();

      await closeClient(ws);
    }, 10_000);

    it("tracks connection count", async () => {
      const c1 = createClient(port);
      const c2 = createClient(port);
      await Promise.all([c1.connected, c2.connected]);
      await Promise.all([c1.firstMessage, c2.firstMessage]);

      expect(service.connectionCount).toBe(2);

      await closeClient(c1.ws);
      await closeClient(c2.ws);
    }, 10_000);

    it("decrements connection count on close", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      await closeClient(ws);
      await new Promise((r) => setTimeout(r, 50));

      expect(service.connectionCount).toBe(0);
    }, 10_000);
  });

  // -------------------------------------------------------------------------
  // Subscription messages
  // -------------------------------------------------------------------------

  describe("subscribe / unsubscribe", () => {
    it("acknowledges a subscribe message", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage; // consume ack

      const reply = nextMessage(ws);
      ws.send(JSON.stringify({ type: "subscribe", events: ["token.created" as LiveEventType] }));
      const msg = await reply as any;

      expect(msg.type).toBe("subscribed");
      expect(msg.events).toContain("token.created");

      await closeClient(ws);
    }, 10_000);

    it("acknowledges an unsubscribe message", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      const reply = nextMessage(ws);
      ws.send(JSON.stringify({ type: "unsubscribe" }));
      const msg = await reply as any;

      expect(msg.type).toBe("unsubscribed");

      await closeClient(ws);
    }, 10_000);

    it("returns error for unknown message type", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      const reply = nextMessage(ws);
      ws.send(JSON.stringify({ type: "ping_custom" }));
      const msg = await reply as any;

      expect(msg.type).toBe("error");

      await closeClient(ws);
    }, 10_000);

    it("returns error for invalid JSON", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      const reply = nextMessage(ws);
      ws.send("not-json");
      const msg = await reply as any;

      expect(msg.type).toBe("error");
      expect(msg.message).toMatch(/invalid json/i);

      await closeClient(ws);
    }, 10_000);

    it("returns error for oversized message", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      const reply = nextMessage(ws);
      ws.send("x".repeat(5_000));
      const msg = await reply as any;

      expect(msg.type).toBe("error");
      expect(msg.message).toMatch(/too large/i);

      await closeClient(ws);
    }, 10_000);
  });

  // -------------------------------------------------------------------------
  // Broadcast
  // -------------------------------------------------------------------------

  describe("broadcast", () => {
    const makeEvent = (type: LiveEventType, tokenAddress?: string): LiveEvent => ({
      type,
      timestamp: new Date().toISOString(),
      tokenAddress,
      data: { foo: "bar" },
    });

    it("delivers event to a subscriber with matching event type", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      // Subscribe
      const subAck = nextMessage(ws);
      ws.send(JSON.stringify({ type: "subscribe", events: ["token.created"] }));
      await subAck;

      // Broadcast and receive
      const eventMsg = nextMessage(ws);
      service.broadcast(makeEvent("token.created"));
      const received = await eventMsg as any;

      expect(received.type).toBe("token.created");
      expect(received.data).toEqual({ foo: "bar" });

      await closeClient(ws);
    }, 10_000);

    it("does NOT deliver event to subscriber with non-matching event type", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      const subAck = nextMessage(ws);
      ws.send(JSON.stringify({ type: "subscribe", events: ["token.burn.self"] }));
      await subAck;

      let received = false;
      ws.once("message", () => { received = true; });

      service.broadcast(makeEvent("token.created"));
      await new Promise((r) => setTimeout(r, 150));

      expect(received).toBe(false);

      await closeClient(ws);
    }, 10_000);

    it("delivers event to subscriber with matching tokenAddress filter", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      const subAck = nextMessage(ws);
      ws.send(JSON.stringify({ type: "subscribe", events: ["token.burn.self"], tokenAddress: "CTOKEN123" }));
      await subAck;

      const eventMsg = nextMessage(ws);
      service.broadcast(makeEvent("token.burn.self", "CTOKEN123"));
      const received = await eventMsg as any;

      expect(received.tokenAddress).toBe("CTOKEN123");

      await closeClient(ws);
    }, 10_000);

    it("does NOT deliver event when tokenAddress does not match", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;

      const subAck = nextMessage(ws);
      ws.send(JSON.stringify({ type: "subscribe", events: ["token.burn.self"], tokenAddress: "CTOKEN_A" }));
      await subAck;

      let received = false;
      ws.once("message", () => { received = true; });

      service.broadcast(makeEvent("token.burn.self", "CTOKEN_B"));
      await new Promise((r) => setTimeout(r, 150));

      expect(received).toBe(false);

      await closeClient(ws);
    }, 10_000);

    it("delivers all event types when no filter is set (default)", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage; // consume ack only

      const eventTypes: LiveEventType[] = ["token.created", "token.burn.self", "vault.created"];
      const received: string[] = [];

      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        received.push(msg.type);
      });

      for (const t of eventTypes) service.broadcast(makeEvent(t));
      await new Promise((r) => setTimeout(r, 200));

      expect(received).toEqual(expect.arrayContaining(eventTypes));

      await closeClient(ws);
    }, 10_000);

    it("does not throw when broadcasting to closed connections", async () => {
      const { ws, connected, firstMessage } = createClient(port);
      await connected;
      await firstMessage;
      await closeClient(ws);
      await new Promise((r) => setTimeout(r, 50));

      expect(() => service.broadcast(makeEvent("token.created"))).not.toThrow();
    }, 10_000);

    it("broadcasts to multiple clients simultaneously", async () => {
      const c1 = createClient(port);
      const c2 = createClient(port);
      await Promise.all([c1.connected, c2.connected]);
      await Promise.all([c1.firstMessage, c2.firstMessage]);

      const p1 = nextMessage(c1.ws);
      const p2 = nextMessage(c2.ws);

      service.broadcast(makeEvent("governance.vote.cast"));

      const [r1, r2] = await Promise.all([p1, p2]) as any[];
      expect(r1.type).toBe("governance.vote.cast");
      expect(r2.type).toBe("governance.vote.cast");

      await closeClient(c1.ws);
      await closeClient(c2.ws);
    }, 10_000);
  });

  // -------------------------------------------------------------------------
  // attach / close idempotency
  // -------------------------------------------------------------------------

  describe("attach / close", () => {
    it("attach is idempotent (calling twice does not throw)", () => {
      expect(() => service.attach(server)).not.toThrow();
    });

    it("close is safe to call when no server is attached", () => {
      const fresh = new WebSocketService();
      expect(() => fresh.close()).not.toThrow();
    });

    it("broadcast is a no-op before attach", () => {
      const fresh = new WebSocketService();
      const event: LiveEvent = { type: "token.created", timestamp: new Date().toISOString(), data: {} };
      expect(() => fresh.broadcast(event)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Per-IP connection limit
  // -------------------------------------------------------------------------

  describe("per-IP connection limit", () => {
    it("rejects connections beyond MAX_CONNECTIONS_PER_IP (10)", async () => {
      const clients: WebSocket[] = [];

      for (let i = 0; i < 10; i++) {
        const { ws, connected, firstMessage } = createClient(port);
        await connected;
        await firstMessage;
        clients.push(ws);
      }

      const extra = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const closeCode = await new Promise<number>((resolve) => {
        extra.once("close", (code) => resolve(code));
        extra.once("error", () => resolve(-1));
        setTimeout(() => resolve(-1), 3000);
      });

      expect(closeCode).toBe(1008);

      for (const ws of clients) await closeClient(ws);
    }, 30_000);
  });
});
