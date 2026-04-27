/**
 * Health Checker — Blue-Green Deployment
 *
 * Polls the /health endpoint of a target and validates the response.
 * Used both during deployment (waiting for new slot to warm up) and
 * post-deployment (verifying the active slot is still healthy).
 */

export interface HealthCheckConfig {
  /** Full URL to check, e.g. http://10.0.1.5:3001/health */
  url: string;
  /** Expected HTTP status code (default 200) */
  expectedStatus?: number;
  /** Timeout per request in ms (default 5000) */
  timeoutMs?: number;
  /** Number of consecutive successes required (default 2) */
  requiredSuccesses?: number;
  /** Number of consecutive failures before declaring unhealthy (default 3) */
  maxFailures?: number;
  /** Interval between checks in ms (default 5000) */
  intervalMs?: number;
  /** Total time to wait in ms (default 120000) */
  totalTimeoutMs?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  body?: unknown;
  error?: string;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalChecks: number;
}

/**
 * Performs a single health check request.
 */
export async function checkHealth(
  url: string,
  timeoutMs = 5000,
): Promise<{
  ok: boolean;
  status: number;
  body: unknown;
  responseTimeMs: number;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    const responseTimeMs = Date.now() - start;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
      responseTimeMs,
    };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    throw Object.assign(
      new Error(
        err instanceof Error && err.name === "AbortError"
          ? `Health check timed out after ${timeoutMs}ms`
          : `Health check failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
      { responseTimeMs },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polls a health endpoint until it becomes healthy or times out.
 * Returns a HealthCheckResult describing the final state.
 */
export async function waitForHealthy(
  config: HealthCheckConfig,
): Promise<HealthCheckResult> {
  const {
    url,
    expectedStatus = 200,
    timeoutMs = 5000,
    requiredSuccesses = 2,
    maxFailures = 3,
    intervalMs = 5000,
    totalTimeoutMs = 120_000,
  } = config;

  const deadline = Date.now() + totalTimeoutMs;
  let consecutiveSuccesses = 0;
  let consecutiveFailures = 0;
  let totalChecks = 0;

  while (Date.now() < deadline) {
    totalChecks++;

    try {
      const result = await checkHealth(url, timeoutMs);

      if (result.status === expectedStatus) {
        consecutiveSuccesses++;
        consecutiveFailures = 0;

        if (consecutiveSuccesses >= requiredSuccesses) {
          return {
            healthy: true,
            statusCode: result.status,
            responseTimeMs: result.responseTimeMs,
            body: result.body,
            consecutiveSuccesses,
            consecutiveFailures,
            totalChecks,
          };
        }
      } else {
        consecutiveSuccesses = 0;
        consecutiveFailures++;
      }
    } catch (err) {
      consecutiveSuccesses = 0;
      consecutiveFailures++;

      if (consecutiveFailures >= maxFailures) {
        return {
          healthy: false,
          error: err instanceof Error ? err.message : String(err),
          consecutiveSuccesses,
          consecutiveFailures,
          totalChecks,
        };
      }
    }

    // Wait before next poll (unless we're about to time out)
    if (Date.now() + intervalMs < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return {
    healthy: false,
    error: `Health check timed out after ${totalTimeoutMs}ms (${totalChecks} checks)`,
    consecutiveSuccesses,
    consecutiveFailures,
    totalChecks,
  };
}

/**
 * Validates the health check response body matches the expected Nova Launch
 * health response schema.
 */
export function validateHealthResponse(body: unknown): {
  valid: boolean;
  status?: string;
  errors: string[];
} {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Response body is not an object"] };
  }

  const b = body as Record<string, unknown>;

  // Nova Launch health response wraps in { data: { status, ... } }
  const data = b.data as Record<string, unknown> | undefined;
  if (!data) {
    errors.push("Missing 'data' field in health response");
    return { valid: false, errors };
  }

  const status = data.status as string | undefined;
  if (!status) {
    errors.push("Missing 'status' field in health response data");
  } else if (!["healthy", "degraded", "unhealthy"].includes(status)) {
    errors.push(`Invalid status value: ${status}`);
  }

  if (typeof data.uptime !== "number") {
    errors.push("Missing or invalid 'uptime' field");
  }

  return {
    valid: errors.length === 0,
    status,
    errors,
  };
}
