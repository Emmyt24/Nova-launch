/**
 * Input Sanitization Middleware for XSS Prevention
 *
 * Recursively strips HTML tags and dangerous characters from all string
 * values in req.body, req.query, and req.params before they reach route
 * handlers.
 *
 * OWASP references:
 *  - XSS Prevention Cheat Sheet
 *  - Input Validation Cheat Sheet
 *
 * Issue: #846
 */

import { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Core sanitization logic
// ---------------------------------------------------------------------------

/**
 * Characters / patterns that are dangerous in HTML context.
 * We strip HTML tags entirely and encode the five XML special characters.
 */
const HTML_TAG_RE = /<[^>]*>/g;

const CHAR_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const DANGEROUS_CHARS_RE = /[&<>"']/g;

/**
 * Sanitize a single string value.
 *
 * 1. Strip HTML tags (e.g. `<script>alert(1)</script>` → `alert(1)`)
 * 2. Encode remaining special characters
 * 3. Trim leading/trailing whitespace
 */
export function sanitizeString(value: string): string {
  return value
    .replace(HTML_TAG_RE, "")
    .replace(DANGEROUS_CHARS_RE, (ch) => CHAR_MAP[ch] ?? ch)
    .trim();
}

/**
 * Recursively sanitize all string leaves of an object or array.
 * Non-string primitives and null/undefined are returned as-is.
 */
export function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeValue(v);
    }
    return result;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Sanitize `req.body`, `req.query`, and `req.params` in-place.
 *
 * Usage:
 * ```ts
 * import { sanitizationMiddleware } from "./middleware/sanitization";
 * app.use(sanitizationMiddleware);
 * ```
 */
export function sanitizationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === "object") {
    req.query = sanitizeValue(req.query) as typeof req.query;
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params) as typeof req.params;
  }

  next();
}

export default sanitizationMiddleware;
