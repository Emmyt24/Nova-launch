import { StellarRateLimitException } from "./stellar.exceptions";

export class RateLimiter {
  private readonly requests: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  /**
   * Checks if a request can proceed, throws StellarRateLimitException if not.
   */
  checkLimit(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove requests outside the window
    while (this.requests.length > 0 && this.requests[0] < windowStart) {
      this.requests.shift();
    }

    if (this.requests.length >= this.maxRequests) {
      throw new StellarRateLimitException();
    }

    this.requests.push(now);
  }

  /**
   * Returns remaining requests in the current window.
   */
  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const active = this.requests.filter((ts) => ts >= windowStart);
    return Math.max(0, this.maxRequests - active.length);
  }

  /**
   * Resets the rate limiter state.
   */
  reset(): void {
    this.requests.length = 0;
  }
}
