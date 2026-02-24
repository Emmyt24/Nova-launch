import { Injectable, NestMiddleware, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { AUTH_CONSTANTS } from "../../auth.constants";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  // In production replace with Redis
  private readonly store = new Map<string, RateLimitEntry>();

  use(req: Request, res: Response, next: NextFunction): void {
    const key = this.resolveKey(req);
    const now = Date.now();
    const windowMs = AUTH_CONSTANTS.RATE_LIMIT_WINDOW_MS;
    const max = this.resolveMax(req);

    let entry = this.store.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 1, windowStart: now };
    } else {
      entry.count++;
    }

    this.store.set(key, entry);

    const remaining = Math.max(0, max - entry.count);
    const resetAt = Math.ceil((entry.windowStart + windowMs) / 1000);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetAt);

    if (entry.count > max) {
      this.logger.warn(`Rate limit exceeded for key: ${key}`);
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: "Too many requests, please try again later",
        retryAfter: resetAt - Math.floor(now / 1000),
      });
      return;
    }

    next();
  }

  private resolveKey(req: Request): string {
    // Prefer authenticated wallet address over IP
    const user = (req as any).user;
    if (user?.walletAddress) return `wallet:${user.walletAddress}`;
    return `ip:${req.ip}`;
  }

  private resolveMax(req: Request): number {
    const isAuthEndpoint =
      req.path.includes("/auth/login") || req.path.includes("/auth/nonce");
    return isAuthEndpoint
      ? AUTH_CONSTANTS.RATE_LIMIT_AUTH_MAX
      : AUTH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS;
  }
}
