/**
 * Tests for Input Sanitization Middleware (#846)
 */

import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  sanitizeString,
  sanitizeValue,
  sanitizationMiddleware,
} from "../middleware/sanitization";

// ---------------------------------------------------------------------------
// sanitizeString
// ---------------------------------------------------------------------------

describe("sanitizeString", () => {
  it("strips HTML tags", () => {
    expect(sanitizeString("<script>alert(1)</script>")).toBe("alert(1)");
  });

  it("strips nested tags", () => {
    expect(sanitizeString("<b><i>text</i></b>")).toBe("text");
  });

  it("encodes ampersand", () => {
    expect(sanitizeString("a & b")).toBe("a &amp; b");
  });

  it("encodes standalone less-than and greater-than", () => {
    // Bare < and > not forming a complete tag get encoded
    expect(sanitizeString("a<b")).toBe("a&lt;b");
    expect(sanitizeString("a>b")).toBe("a&gt;b");
  });

  it("encodes double quotes", () => {
    expect(sanitizeString('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("encodes single quotes", () => {
    expect(sanitizeString("it's fine")).toBe("it&#x27;s fine");
  });

  it("trims whitespace", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
  });

  it("returns empty string unchanged", () => {
    expect(sanitizeString("")).toBe("");
  });

  it("leaves safe strings unchanged", () => {
    expect(sanitizeString("hello world 123")).toBe("hello world 123");
  });

  it("handles XSS img onerror payload", () => {
    const input = '<img src=x onerror="alert(1)">';
    const result = sanitizeString(input);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  it("handles javascript: URI attempt", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeString(input);
    expect(result).not.toContain("<");
    expect(result).toContain("click");
  });
});

// ---------------------------------------------------------------------------
// sanitizeValue
// ---------------------------------------------------------------------------

describe("sanitizeValue", () => {
  it("sanitizes a plain string", () => {
    expect(sanitizeValue("<b>bold</b>")).toBe("bold");
  });

  it("passes through numbers", () => {
    expect(sanitizeValue(42)).toBe(42);
  });

  it("passes through booleans", () => {
    expect(sanitizeValue(true)).toBe(true);
  });

  it("passes through null", () => {
    expect(sanitizeValue(null)).toBeNull();
  });

  it("sanitizes strings inside an array", () => {
    expect(sanitizeValue(["<b>a</b>", "safe"])).toEqual(["a", "safe"]);
  });

  it("sanitizes strings inside a nested object", () => {
    const input = { name: "<script>x</script>", count: 5 };
    expect(sanitizeValue(input)).toEqual({ name: "x", count: 5 });
  });

  it("sanitizes deeply nested structures", () => {
    const input = { a: { b: { c: "<evil>" } } };
    expect(sanitizeValue(input)).toEqual({ a: { b: { c: "" } } });
  });

  it("sanitizes arrays of objects", () => {
    const input = [{ x: "<b>1</b>" }, { x: "safe" }];
    expect(sanitizeValue(input)).toEqual([{ x: "1" }, { x: "safe" }]);
  });
});

// ---------------------------------------------------------------------------
// sanitizationMiddleware
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

describe("sanitizationMiddleware", () => {
  it("sanitizes req.body strings", () => {
    const req = makeReq({ body: { name: "<script>evil</script>" } });
    const next = vi.fn() as unknown as NextFunction;
    sanitizationMiddleware(req, {} as Response, next);

    expect(req.body.name).toBe("evil");
    expect(next).toHaveBeenCalledOnce();
  });

  it("sanitizes req.query strings", () => {
    const req = makeReq({ query: { q: '<img onerror="x">' } as any });
    const next = vi.fn() as unknown as NextFunction;
    sanitizationMiddleware(req, {} as Response, next);

    expect((req.query as any).q).not.toContain("<");
    expect(next).toHaveBeenCalledOnce();
  });

  it("sanitizes req.params strings", () => {
    const req = makeReq({ params: { id: "<b>123</b>" } as any });
    const next = vi.fn() as unknown as NextFunction;
    sanitizationMiddleware(req, {} as Response, next);

    expect(req.params.id).toBe("123");
    expect(next).toHaveBeenCalledOnce();
  });

  it("leaves non-string body values untouched", () => {
    const req = makeReq({ body: { count: 5, active: true } });
    const next = vi.fn() as unknown as NextFunction;
    sanitizationMiddleware(req, {} as Response, next);

    expect(req.body.count).toBe(5);
    expect(req.body.active).toBe(true);
  });

  it("handles null body gracefully", () => {
    const req = makeReq({ body: null });
    const next = vi.fn() as unknown as NextFunction;
    expect(() =>
      sanitizationMiddleware(req, {} as Response, next)
    ).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it("handles nested body objects", () => {
    const req = makeReq({
      body: { user: { name: "<b>Alice</b>", age: 30 } },
    });
    const next = vi.fn() as unknown as NextFunction;
    sanitizationMiddleware(req, {} as Response, next);

    expect(req.body.user.name).toBe("Alice");
    expect(req.body.user.age).toBe(30);
  });

  it("always calls next()", () => {
    const req = makeReq();
    const next = vi.fn() as unknown as NextFunction;
    sanitizationMiddleware(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
