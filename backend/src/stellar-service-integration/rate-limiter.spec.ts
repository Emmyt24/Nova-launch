import { RateLimiter } from "./rate-limiter";
import { StellarRateLimitException } from "./stellar.exceptions";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(5, 1000); // 5 requests per second
  });

  it("allows requests under the limit", () => {
    expect(() => {
      for (let i = 0; i < 5; i++) limiter.checkLimit();
    }).not.toThrow();
  });

  it("throws when limit is exceeded", () => {
    for (let i = 0; i < 5; i++) limiter.checkLimit();
    expect(() => limiter.checkLimit()).toThrow(StellarRateLimitException);
  });

  it("returns correct remaining requests", () => {
    expect(limiter.getRemainingRequests()).toBe(5);
    limiter.checkLimit();
    expect(limiter.getRemainingRequests()).toBe(4);
  });

  it("resets correctly", () => {
    for (let i = 0; i < 5; i++) limiter.checkLimit();
    limiter.reset();
    expect(limiter.getRemainingRequests()).toBe(5);
  });

  it("allows requests after the window expires", async () => {
    const shortLimiter = new RateLimiter(2, 50); // 50ms window
    shortLimiter.checkLimit();
    shortLimiter.checkLimit();
    expect(() => shortLimiter.checkLimit()).toThrow(StellarRateLimitException);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));
    expect(() => shortLimiter.checkLimit()).not.toThrow();
  });
});
