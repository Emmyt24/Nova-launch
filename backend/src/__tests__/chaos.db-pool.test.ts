/**
 * Chaos Test: Database Connection Pool Exhaustion
 *
 * This spec exercises the low-level pg pool wrapper under concurrent load.
 * We intentionally keep the test self-contained and deterministic so it can
 * run without a live PostgreSQL instance.
 *
 * Scenarios covered:
 *   P1  Pool defaults are wired correctly at module load
 *   P2  Concurrent queries beyond the configured limit are rejected safely
 *   P3  Client acquisition fails cleanly once the pool is saturated
 *   P4  closePool closes the underlying pool and prevents reuse
 *   P5  Pool error events are logged without crashing the process
 *
 * Security considerations:
 *   - Exhaustion errors are normalized to a safe message so callers do not
 *     receive raw driver output that could reveal infrastructure details.
 *   - Console output is asserted to avoid accidental leakage of credentials
 *     or connection strings in the log path under test.
 *
 * Edge cases / assumptions:
 *   - The mock pool simulates the same high-level behavior as pg.Pool:
 *     concurrent connections count against a limit, and release() frees them.
 *   - We keep the maximum small in tests so the saturation path is exercised
 *     quickly without introducing flaky timing windows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PoolConfigSnapshot = Record<string, unknown>;

class MockClient {
  private released = false;

  constructor(private readonly releaseFn: () => void) {}

  release() {
    if (this.released) {
      return;
    }

    this.released = true;
    this.releaseFn();
  }
}

class MockPool {
  private activeConnections = 0;
  private closed = false;
  private errorHandler: ((error: unknown) => void) | null = null;

  constructor(public readonly config: PoolConfigSnapshot) {
    poolState.instances.push(this);
  }

  on(event: string, handler: (error: unknown) => void) {
    if (event === "error") {
      this.errorHandler = handler;
    }

    return this;
  }

  emitError(error: unknown) {
    this.errorHandler?.(error);
  }

  get activeCount() {
    return this.activeConnections;
  }

  async query(text: string, params?: unknown[]) {
    if (poolState.nextQueryFailure !== null) {
      const failure = poolState.nextQueryFailure;
      poolState.nextQueryFailure = null;
      throw failure;
    }

    if (this.closed) {
      throw new Error("Pool has been closed");
    }

    if (this.activeConnections >= poolState.maxConnections) {
      throw new Error("sorry, too many clients already");
    }

    this.activeConnections++;
    try {
      if (poolState.queryDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, poolState.queryDelayMs)
        );
      }

      return {
        rows: [{ text, params }],
        rowCount: 1,
      };
    } finally {
      this.activeConnections--;
    }
  }

  async connect() {
    if (poolState.nextConnectFailure !== null) {
      const failure = poolState.nextConnectFailure;
      poolState.nextConnectFailure = null;
      throw failure;
    }

    if (this.closed) {
      throw new Error("Pool has been closed");
    }

    if (this.activeConnections >= poolState.maxConnections) {
      throw new Error("remaining connection slots are reserved");
    }

    this.activeConnections++;
    return new MockClient(() => {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
    });
  }

  async end() {
    this.closed = true;
    poolState.endCalls++;
  }
}

const poolState = {
  maxConnections: 2,
  queryDelayMs: 25,
  nextQueryFailure: null as unknown,
  nextConnectFailure: null as unknown,
  instances: [] as MockPool[],
  endCalls: 0,
};

vi.mock("pg", () => ({
  Pool: vi.fn((config: PoolConfigSnapshot) => new MockPool(config)),
}));

describe("Chaos: Database Connection Pool Exhaustion", () => {
  let db: typeof import("../database/db");
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  async function loadDbModule() {
    vi.resetModules();
    db = await import("../database/db");
  }

  beforeEach(async () => {
    poolState.maxConnections = 2;
    poolState.queryDelayMs = 25;
    poolState.nextQueryFailure = null;
    poolState.nextConnectFailure = null;
    poolState.instances = [];
    poolState.endCalls = 0;

    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    consoleLogSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    await loadDbModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("P1: wires the pool with the expected defaults", () => {
    expect(poolState.instances).toHaveLength(1);

    const pool = poolState.instances[0];
    expect(pool.config).toMatchObject({
      host: "localhost",
      port: 5432,
      database: "nova_launch",
      user: "user",
      password: "password",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  });

  it("P2: rejects concurrent queries once the pool limit is exhausted", async () => {
    poolState.maxConnections = 2;
    await loadDbModule();

    const requests = [
      db.query("SELECT 1", [1]),
      db.query("SELECT 2", [2]),
      db.query("SELECT 3", [3]),
    ];

    const settled = await Promise.allSettled(requests);
    const fulfilled = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);

    const failure = rejected[0];
    if (failure.status === "rejected") {
      expect(failure.reason).toBeInstanceOf(Error);
      expect((failure.reason as Error).message).toBe(
        "Database connection pool exhausted during query"
      );
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Database query error:",
      expect.objectContaining({
        message: "Database connection pool exhausted during query",
      })
    );

    expect(poolState.instances[0].activeCount).toBe(0);
  });

  it("P3: fails client acquisition cleanly when the pool is saturated", async () => {
    poolState.maxConnections = 1;
    await loadDbModule();

    const client = await db.getClient();

    await expect(db.getClient()).rejects.toThrow(
      "Database connection pool exhausted during getClient"
    );

    client.release();

    const retryClient = await db.getClient();
    expect(retryClient).toBeDefined();
    retryClient.release();
    expect(poolState.instances[0].activeCount).toBe(0);
  });

  it("P4: closes the pool and blocks reuse after shutdown", async () => {
    const client = await db.getClient();
    await db.closePool();

    expect(poolState.endCalls).toBe(1);

    client.release();

    await expect(db.getClient()).rejects.toThrow("Pool has been closed");
  });

  it("P5: logs structured pool errors without crashing the process", () => {
    const pool = poolState.instances[0];
    pool.emitError(Object.assign(new Error("maintenance"), { code: "53300" }));

    expect(consoleErrorSpy).toHaveBeenCalledWith("Unexpected database error:", {
      message: "maintenance",
      code: "53300",
    });
  });

  it("P5b: logs raw pool warnings and ignores empty structured codes", () => {
    const pool = poolState.instances[0];
    pool.emitError("standalone pool warning");
    pool.emitError(Object.assign(new Error("empty code"), { code: "" }));

    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      1,
      "Unexpected database error:",
      { message: "standalone pool warning" }
    );
    expect(consoleErrorSpy).toHaveBeenNthCalledWith(
      2,
      "Unexpected database error:",
      { message: "empty code" }
    );
  });

  it("P6: reduces non-Error query failures to a generic safe message", async () => {
    poolState.nextQueryFailure = "synthetic transport failure";

    await expect(db.query("SELECT 1")).rejects.toThrow("Database query failed");

    expect(consoleErrorSpy).toHaveBeenCalledWith("Database query error:", {
      message: "Database query failed",
    });
  });

  it("P7: reduces non-Error client acquisition failures to a generic safe message", async () => {
    poolState.nextConnectFailure = { reason: "synthetic client failure" };

    await expect(db.getClient()).rejects.toThrow("Database getClient failed");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Database client acquisition failed:",
      { message: "Database getClient failed" }
    );
  });

  it("keeps the safe logger free of raw connection strings", async () => {
    await expect(db.query("SELECT 1 FROM health_check")).resolves.toMatchObject(
      {
        rowCount: 1,
      }
    );

    const logCalls = consoleLogSpy.mock.calls.flat();
    expect(JSON.stringify(logCalls)).not.toContain("postgres://");
    expect(JSON.stringify(logCalls)).not.toContain("password=");
  });
});
