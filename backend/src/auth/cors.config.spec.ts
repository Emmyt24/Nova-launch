import { buildCorsOptions } from "../cors.config";

describe("buildCorsOptions", () => {
  it("should allow requests with no origin (server-to-server)", () => {
    const options = buildCorsOptions(["https://example.com"]);
    const callback = jest.fn();
    (options.origin as Function)(undefined, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("should allow requests from listed origins", () => {
    const options = buildCorsOptions([
      "https://example.com",
      "https://app.example.com",
    ]);
    const callback = jest.fn();
    (options.origin as Function)("https://example.com", callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("should reject requests from unlisted origins", () => {
    const options = buildCorsOptions(["https://example.com"]);
    const callback = jest.fn();
    (options.origin as Function)("https://evil.com", callback);
    expect(callback).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should allow all origins when wildcard is set", () => {
    const options = buildCorsOptions(["*"]);
    const callback = jest.fn();
    (options.origin as Function)("https://any-origin.com", callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("should expose rate limit headers", () => {
    const options = buildCorsOptions([]);
    expect(options.exposedHeaders).toContain("X-RateLimit-Limit");
    expect(options.exposedHeaders).toContain("X-RateLimit-Remaining");
    expect(options.exposedHeaders).toContain("X-Request-Id");
  });

  it("should include required allowed headers", () => {
    const options = buildCorsOptions([]);
    expect(options.allowedHeaders).toContain("Authorization");
    expect(options.allowedHeaders).toContain("X-Api-Key");
  });
});
