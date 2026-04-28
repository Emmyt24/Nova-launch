/**
 * PagerDuty Incident Response Automation
 *
 * Sends alerts to PagerDuty Events API v2 and manages incident lifecycle.
 * Configure via environment variables:
 *   PAGERDUTY_ROUTING_KEY  — integration key from a PagerDuty Events API v2 integration
 *   PAGERDUTY_API_TOKEN    — REST API token for incident management (optional)
 */

import https from "https";

/** Severity levels mapped to PagerDuty event severities */
export type IncidentSeverity = "critical" | "error" | "warning" | "info";

export interface IncidentPayload {
  /** Short human-readable summary (max 1024 chars) */
  summary: string;
  severity: IncidentSeverity;
  /** Stable identifier for deduplication / auto-resolve */
  dedupKey: string;
  /** Source service or component */
  source: string;
  /** Additional context attached to the alert */
  customDetails?: Record<string, unknown>;
  /** Link to runbook or dashboard */
  links?: Array<{ href: string; text: string }>;
}

export interface PagerDutyResponse {
  status: string;
  message: string;
  dedup_key: string;
}

/**
 * Sends a trigger event to PagerDuty Events API v2.
 * Returns the dedup_key so callers can resolve the incident later.
 */
export async function triggerIncident(
  payload: IncidentPayload,
  routingKey: string = process.env.PAGERDUTY_ROUTING_KEY ?? ""
): Promise<PagerDutyResponse> {
  if (!routingKey) {
    throw new Error(
      "PAGERDUTY_ROUTING_KEY is not set. Configure it to enable PagerDuty alerting."
    );
  }

  const body = JSON.stringify({
    routing_key: routingKey,
    event_action: "trigger",
    dedup_key: payload.dedupKey,
    payload: {
      summary: payload.summary,
      severity: payload.severity,
      source: payload.source,
      custom_details: payload.customDetails ?? {},
    },
    links: payload.links ?? [],
  });

  return sendEvent(body);
}

/**
 * Resolves an open PagerDuty incident by dedup key.
 */
export async function resolveIncident(
  dedupKey: string,
  routingKey: string = process.env.PAGERDUTY_ROUTING_KEY ?? ""
): Promise<PagerDutyResponse> {
  if (!routingKey) {
    throw new Error("PAGERDUTY_ROUTING_KEY is not set.");
  }

  const body = JSON.stringify({
    routing_key: routingKey,
    event_action: "resolve",
    dedup_key: dedupKey,
  });

  return sendEvent(body);
}

/**
 * Acknowledges an open PagerDuty incident by dedup key.
 */
export async function acknowledgeIncident(
  dedupKey: string,
  routingKey: string = process.env.PAGERDUTY_ROUTING_KEY ?? ""
): Promise<PagerDutyResponse> {
  if (!routingKey) {
    throw new Error("PAGERDUTY_ROUTING_KEY is not set.");
  }

  const body = JSON.stringify({
    routing_key: routingKey,
    event_action: "acknowledge",
    dedup_key: dedupKey,
  });

  return sendEvent(body);
}

/** Low-level HTTPS POST to PagerDuty Events API v2 */
function sendEvent(body: string): Promise<PagerDutyResponse> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: "events.pagerduty.com",
      path: "/v2/enqueue",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data) as PagerDutyResponse;
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `PagerDuty API error ${res.statusCode}: ${parsed.message ?? data}`
              )
            );
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Failed to parse PagerDuty response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Pre-built incident helpers for common Nova Launch alert scenarios
// ---------------------------------------------------------------------------

/** Alert when the Stellar event listener falls behind or stops processing */
export function alertEventListenerDown(details?: Record<string, unknown>) {
  return triggerIncident({
    summary: "Nova Launch: Stellar event listener is not processing events",
    severity: "critical",
    dedupKey: "nova-event-listener-down",
    source: "stellarEventListener",
    customDetails: details,
    links: [
      {
        href: "https://github.com/Emmyt24/Nova-launch/blob/main/docs/PRODUCTION_INTEGRATION_RUNBOOK.md",
        text: "Runbook",
      },
    ],
  });
}

/** Alert when backend API error rate exceeds threshold */
export function alertHighApiErrorRate(
  errorRate: number,
  details?: Record<string, unknown>
) {
  return triggerIncident({
    summary: `Nova Launch: API error rate is ${errorRate.toFixed(1)}% (threshold: 5%)`,
    severity: errorRate >= 20 ? "critical" : "error",
    dedupKey: "nova-api-high-error-rate",
    source: "backend-api",
    customDetails: { errorRate, ...details },
  });
}

/** Alert when database connection pool is exhausted */
export function alertDatabasePoolExhausted(details?: Record<string, unknown>) {
  return triggerIncident({
    summary: "Nova Launch: Database connection pool exhausted",
    severity: "critical",
    dedupKey: "nova-db-pool-exhausted",
    source: "prisma",
    customDetails: details,
  });
}

/** Resolve the event listener incident once it recovers */
export function resolveEventListenerDown() {
  return resolveIncident("nova-event-listener-down");
}

/** Resolve the API error rate incident once it recovers */
export function resolveHighApiErrorRate() {
  return resolveIncident("nova-api-high-error-rate");
}
