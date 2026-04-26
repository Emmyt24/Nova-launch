/**
 * JWT authentication middleware for the API Gateway.
 *
 * Verifies Bearer tokens on protected routes.  Public routes (health, docs)
 * are skipped.  On success, the decoded payload is attached to `req.user`.
 *
 * Security: OWASP API2 — Broken Authentication
 *   - Tokens are verified with jsonwebtoken (HS256 by default).
 *   - Expired tokens are rejected with 401.
 *   - Missing tokens on protected routes are rejected with 401.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/** Routes that do not require authentication. */
const PUBLIC_PATHS = new Set(["/health", "/health/live", "/health/ready"]);

export interface JwtPayload {
  userId: string;
  role?: string;
  walletAddress?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Creates JWT authentication middleware.
 *
 * @param jwtSecret  Secret used to verify tokens (from env).
 */
export function createAuthMiddleware(jwtSecret: string) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Skip auth for public paths
    if (PUBLIC_PATHS.has(req.path)) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}
