import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NoopSpan,
  NoopTracer,
  ISpan,
  tracer,
  withSpan,
  tracingMiddleware,
  initTracing,
  shutdownTracing,
} from "./tracing";

// ─── NoopSpan ─────────────────────────────────────────────────────────────────

describe("NoopSpan", () => {
  let span: NoopSpan;

  beforeEach(() => {
    span = new NoopSpan();
  });

  it("has stable zero-value traceId and spanId", () => {
    expect(span.traceId).toBe("00000000000000000000000000000000");
    expect(span.spanId).toBe("0000000000000000");
  });

  it("setAttribute returns this for chaining", () => {
    expect(span.setAttribute("key", "value")).toBe(span);
  });

  it("setAttributes returns this for chaining", () => {
    expect(span.setAttributes({ a: 1, b: "x" })).toBe(span);
  });

  it("setStatus returns this for chaining", () => {
    expect(span.setStatus("ok")).toBe(span);
    expect(span.setStatus("error", "boom")).toBe(span);
  });

  it("recordException returns this for chaining", () => {
    expect(span.recordException(new Error("test"))).toBe(span);
  });

  it("end() does not throw", () => {
    expect(() => span.end()).not.toThrow();
  });

  it("supports full method chain without throwing", () => {
    expect(() =>
      span
        .setAttribute("k", 1)
        .setAttributes({ x: true })
        .setStatus("ok")
        .recordException(new Error("e"))
        .end()
    ).not.toThrow();
  });
});

// ─── NoopTracer ───────────────────────────────────────────────────────────────

describe("NoopTracer", () => {
  it("startSpan returns a NoopSpan", () => {
    const t = new NoopTracer();
    const span = t.startSpan("op");
    expect(span).toBeInstanceOf(NoopSpan);
  });

  it("startSpan with attributes still returns a NoopSpan", () => {
    const t = new NoopTracer();
    const span = t.startSpan("op", { attributes: { "db.table": "Token" } });
    expect(span).toBeInstanceOf(NoopSpan);
  });
});

// ─── tracer (module-level proxy) ──────────────────────────────────────────────

describe("tracer", () => {
  it("startSpan returns an ISpan with traceId and spanId", () => {
    const span = tracer.startSpan("test-op");
    expect(typeof span.traceId).toBe("string");
    expect(typeof span.spanId).toBe("string");
    expect(span.traceId.length).toBeGreaterThan(0);
  });
});

// ─── withSpan ─────────────────────────────────────────────────────────────────

describe("withSpan", () => {
  it("returns the value from the wrapped function", async () => {
    const result = await withSpan("op", async () => 42);
    expect(result).toBe(42);
  });

  it("passes a span to the callback", async () => {
    let received: ISpan | null = null;
    await withSpan("op", async (span) => {
      received = span;
    });
    expect(received).not.toBeNull();
    expect(typeof (received as unknown as ISpan).setAttribute).toBe("function");
  });

  it("re-throws errors from the wrapped function", async () => {
    await expect(
      withSpan("op", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("ends the span even when the function throws", async () => {
    const span = new NoopSpan();
    const endSpy = vi.spyOn(span, "end");
    const startSpy = vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    await expect(
      withSpan("op", async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow();

    expect(endSpy).toHaveBeenCalledOnce();
    startSpy.mockRestore();
  });

  it("sets status to error when the function throws", async () => {
    const span = new NoopSpan();
    const statusSpy = vi.spyOn(span, "setStatus");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    await expect(withSpan("op", async () => { throw new Error("x"); })).rejects.toThrow();

    expect(statusSpy).toHaveBeenCalledWith("error", "x");
  });

  it("sets status to ok on success", async () => {
    const span = new NoopSpan();
    const statusSpy = vi.spyOn(span, "setStatus");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    await withSpan("op", async () => "done");

    expect(statusSpy).toHaveBeenCalledWith("ok");
  });

  it("passes initial attributes to the span", async () => {
    const span = new NoopSpan();
    const startSpy = vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    await withSpan("op", async () => {}, { "db.table": "Token" });

    expect(startSpy).toHaveBeenCalledWith("op", {
      attributes: { "db.table": "Token" },
    });
    startSpy.mockRestore();
  });

  it("records the exception on the span when thrown", async () => {
    const span = new NoopSpan();
    const recSpy = vi.spyOn(span, "recordException");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    const err = new Error("oops");
    await expect(withSpan("op", async () => { throw err; })).rejects.toThrow();

    expect(recSpy).toHaveBeenCalledWith(err);
  });

  it("handles non-Error throws gracefully", async () => {
    const span = new NoopSpan();
    const statusSpy = vi.spyOn(span, "setStatus");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    await expect(withSpan("op", async () => { throw "string-error"; })).rejects.toThrow();

    expect(statusSpy).toHaveBeenCalledWith("error", "string-error");
  });
});

// ─── tracingMiddleware ────────────────────────────────────────────────────────

describe("tracingMiddleware", () => {
  function makeReqRes(overrides: Partial<any> = {}) {
    const listeners: Record<string, () => void> = {};
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) { this.headers[k] = v; },
      on(event: string, cb: () => void) { listeners[event] = cb; },
      emit(event: string) { listeners[event]?.(); },
    };
    const req = {
      method: "GET",
      path: "/api/tokens",
      originalUrl: "/api/tokens?page=1",
      ip: "127.0.0.1",
      headers: { "user-agent": "test-agent" },
      route: { path: "/api/tokens" },
      ...overrides,
    };
    return { req, res, listeners };
  }

  it("calls next()", () => {
    const { req, res } = makeReqRes();
    const next = vi.fn();
    tracingMiddleware()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("sets X-Trace-Id and X-Span-Id response headers", () => {
    const { req, res } = makeReqRes();
    tracingMiddleware()(req, res, vi.fn());
    expect(res.headers["X-Trace-Id"]).toBeDefined();
    expect(res.headers["X-Span-Id"]).toBeDefined();
  });

  it("ends the span on response finish", () => {
    const span = new NoopSpan();
    const endSpy = vi.spyOn(span, "end");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    const { req, res } = makeReqRes();
    tracingMiddleware()(req, res, vi.fn());
    res.emit("finish");

    expect(endSpy).toHaveBeenCalledOnce();
  });

  it("sets error status for 5xx responses", () => {
    const span = new NoopSpan();
    const statusSpy = vi.spyOn(span, "setStatus");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    const { req, res } = makeReqRes();
    res.statusCode = 500;
    tracingMiddleware()(req, res, vi.fn());
    res.emit("finish");

    expect(statusSpy).toHaveBeenCalledWith("error");
  });

  it("sets ok status for 2xx responses", () => {
    const span = new NoopSpan();
    const statusSpy = vi.spyOn(span, "setStatus");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    const { req, res } = makeReqRes();
    res.statusCode = 200;
    tracingMiddleware()(req, res, vi.fn());
    res.emit("finish");

    expect(statusSpy).toHaveBeenCalledWith("ok");
  });

  it("does not record authorization header as span attribute", () => {
    const span = new NoopSpan();
    const attrSpy = vi.spyOn(span, "setAttribute");
    vi.spyOn(tracer, "startSpan").mockReturnValueOnce(span);

    const { req, res } = makeReqRes({
      headers: { authorization: "Bearer secret", "user-agent": "ua" },
    });
    tracingMiddleware()(req, res, vi.fn());

    const calls = attrSpy.mock.calls.map(([k]) => k);
    expect(calls).not.toContain("http.authorization");
    expect(calls).not.toContain("authorization");
  });

  it("falls back gracefully when route is undefined", () => {
    const { req, res } = makeReqRes({ route: undefined });
    expect(() => tracingMiddleware()(req, res, vi.fn())).not.toThrow();
  });
});

// ─── initTracing / shutdownTracing ────────────────────────────────────────────

describe("initTracing", () => {
  afterEach(async () => {
    delete process.env.OTEL_ENABLED;
    await shutdownTracing();
  });

  it("returns false when OTEL_ENABLED is not set", () => {
    expect(initTracing()).toBe(false);
  });

  it("returns false when OTEL_ENABLED=false", () => {
    process.env.OTEL_ENABLED = "false";
    expect(initTracing()).toBe(false);
  });

  it("returns false when SDK packages are not installed (graceful fallback)", () => {
    process.env.OTEL_ENABLED = "true";
    // SDK is not installed in this environment — should return false, not throw
    expect(initTracing()).toBe(false);
  });
});

describe("shutdownTracing", () => {
  it("resolves without error when noop is active", async () => {
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });
});
