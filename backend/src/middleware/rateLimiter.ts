import rateLimit from "express-rate-limit";

const WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS || "900000" // 15 minutes
);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100");

/**
 * Global rate limiter for all API endpoints
 */
export const globalRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for webhook subscription endpoints
 */
export const webhookRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 20, // Lower limit for subscription operations
  message: "Too many webhook operations, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
