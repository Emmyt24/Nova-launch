import { describe, it, expect } from "vitest";
import { openApiSpec } from "../spec";

describe("OpenAPI spec", () => {
  // ---------------------------------------------------------------------------
  // Top-level structure
  // ---------------------------------------------------------------------------

  it("has required OpenAPI 3.0 top-level fields", () => {
    expect(openApiSpec.openapi).toBe("3.0.3");
    expect(openApiSpec.info).toBeDefined();
    expect(openApiSpec.paths).toBeDefined();
    expect(openApiSpec.components).toBeDefined();
  });

  it("has valid info block", () => {
    expect(openApiSpec.info.title).toBeTruthy();
    expect(openApiSpec.info.version).toBeTruthy();
  });

  it("has at least one server defined", () => {
    expect(Array.isArray(openApiSpec.servers)).toBe(true);
    expect(openApiSpec.servers!.length).toBeGreaterThan(0);
    expect(openApiSpec.servers![0].url).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Schemas
  // ---------------------------------------------------------------------------

  it("defines all required component schemas", () => {
    const schemas = openApiSpec.components!.schemas!;
    const required = [
      "ErrorResponse",
      "Pagination",
      "TokenRecord",
      "CampaignRecord",
      "ProposalRecord",
      "GovernanceVoteRecord",
      "StreamRecord",
      "VaultRecord",
      "WebhookSubscription",
      "HealthStatus",
    ];
    for (const name of required) {
      expect(schemas[name], `Missing schema: ${name}`).toBeDefined();
    }
  });

  it("ErrorResponse schema has success and error properties", () => {
    const schema = openApiSpec.components!.schemas!.ErrorResponse as any;
    expect(schema.properties.success).toBeDefined();
    expect(schema.properties.error).toBeDefined();
  });

  it("TokenRecord schema has all expected fields", () => {
    const schema = openApiSpec.components!.schemas!.TokenRecord as any;
    const fields = ["id", "address", "creator", "name", "symbol", "decimals", "totalSupply", "totalBurned", "burnCount"];
    for (const f of fields) {
      expect(schema.properties[f], `TokenRecord missing field: ${f}`).toBeDefined();
    }
  });

  it("ProposalRecord status enum covers all statuses", () => {
    const schema = openApiSpec.components!.schemas!.ProposalRecord as any;
    const statusEnum = schema.properties.status.enum;
    expect(statusEnum).toContain("ACTIVE");
    expect(statusEnum).toContain("PASSED");
    expect(statusEnum).toContain("REJECTED");
    expect(statusEnum).toContain("EXECUTED");
    expect(statusEnum).toContain("CANCELLED");
    expect(statusEnum).toContain("EXPIRED");
  });

  it("WebhookSubscription events enum covers all event types", () => {
    const schema = openApiSpec.components!.schemas!.WebhookSubscription as any;
    const eventEnum = schema.properties.events.items.enum;
    expect(eventEnum).toContain("token.burn.self");
    expect(eventEnum).toContain("token.burn.admin");
    expect(eventEnum).toContain("token.created");
    expect(eventEnum).toContain("token.metadata.updated");
  });

  // ---------------------------------------------------------------------------
  // Parameters
  // ---------------------------------------------------------------------------

  it("defines reusable parameters", () => {
    const params = openApiSpec.components!.parameters!;
    expect(params.PageParam).toBeDefined();
    expect(params.LimitParam).toBeDefined();
    expect(params.PeriodParam).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Paths — presence
  // ---------------------------------------------------------------------------

  const expectedPaths = [
    "/health/live",
    "/health/ready",
    "/api/version",
    "/api/stats",
    "/api/tokens/search",
    "/api/leaderboard/most-burned",
    "/api/leaderboard/most-active",
    "/api/leaderboard/newest",
    "/api/leaderboard/largest-supply",
    "/api/leaderboard/most-burners",
    "/api/governance/proposals",
    "/api/governance/proposals/{id}",
    "/api/governance/proposals/{id}/votes",
    "/api/campaigns/stats/{tokenId}",
    "/api/campaigns/token/{tokenId}",
    "/api/campaigns/creator/{creator}",
    "/api/campaigns/{campaignId}",
    "/api/campaigns/{campaignId}/executions",
    "/api/streams/stats/{address}",
    "/api/streams/creator/{address}",
    "/api/streams/recipient/{address}",
    "/api/streams/{id}",
    "/api/vaults/creator/{address}",
    "/api/vaults/beneficiary/{address}",
    "/api/vaults/{id}",
    "/api/webhooks/subscribe",
    "/api/webhooks/unsubscribe/{id}",
    "/api/webhooks/subscriptions",
    "/api/webhooks/{id}/toggle",
    "/api/webhooks/{id}/logs",
    "/api/webhooks/{id}/test",
  ];

  it("documents all expected API paths", () => {
    for (const path of expectedPaths) {
      expect(openApiSpec.paths![path], `Missing path: ${path}`).toBeDefined();
    }
  });

  it("has no path without at least one HTTP method", () => {
    const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
    for (const [path, item] of Object.entries(openApiSpec.paths!)) {
      const hasMethods = methods.some((m) => (item as any)[m]);
      expect(hasMethods, `Path ${path} has no HTTP methods`).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Paths — HTTP methods
  // ---------------------------------------------------------------------------

  it("health/live uses GET", () => {
    expect((openApiSpec.paths!["/health/live"] as any).get).toBeDefined();
  });

  it("tokens/search uses GET", () => {
    expect((openApiSpec.paths!["/api/tokens/search"] as any).get).toBeDefined();
  });

  it("webhooks/subscribe uses POST", () => {
    expect((openApiSpec.paths!["/api/webhooks/subscribe"] as any).post).toBeDefined();
  });

  it("webhooks/unsubscribe uses DELETE", () => {
    expect((openApiSpec.paths!["/api/webhooks/unsubscribe/{id}"] as any).delete).toBeDefined();
  });

  it("webhooks toggle uses PATCH", () => {
    expect((openApiSpec.paths!["/api/webhooks/{id}/toggle"] as any).patch).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Paths — tags
  // ---------------------------------------------------------------------------

  it("every operation has at least one tag", () => {
    const methods = ["get", "post", "put", "patch", "delete"];
    for (const [path, item] of Object.entries(openApiSpec.paths!)) {
      for (const method of methods) {
        const op = (item as any)[method];
        if (op) {
          expect(Array.isArray(op.tags) && op.tags.length > 0, `${method.toUpperCase()} ${path} has no tags`).toBe(true);
        }
      }
    }
  });

  it("every operation has a summary", () => {
    const methods = ["get", "post", "put", "patch", "delete"];
    for (const [path, item] of Object.entries(openApiSpec.paths!)) {
      for (const method of methods) {
        const op = (item as any)[method];
        if (op) {
          expect(typeof op.summary === "string" && op.summary.length > 0, `${method.toUpperCase()} ${path} has no summary`).toBe(true);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Paths — responses
  // ---------------------------------------------------------------------------

  it("every operation defines at least one response", () => {
    const methods = ["get", "post", "put", "patch", "delete"];
    for (const [path, item] of Object.entries(openApiSpec.paths!)) {
      for (const method of methods) {
        const op = (item as any)[method];
        if (op) {
          expect(op.responses && Object.keys(op.responses).length > 0, `${method.toUpperCase()} ${path} has no responses`).toBe(true);
        }
      }
    }
  });

  it("tokens/search documents a 400 error response", () => {
    const op = (openApiSpec.paths!["/api/tokens/search"] as any).get;
    expect(op.responses["400"]).toBeDefined();
  });

  it("governance proposals/{id} documents a 404 response", () => {
    const op = (openApiSpec.paths!["/api/governance/proposals/{id}"] as any).get;
    expect(op.responses["404"]).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // $ref integrity — all $refs point to defined schemas/parameters
  // ---------------------------------------------------------------------------

  function collectRefs(obj: unknown, refs: Set<string> = new Set()): Set<string> {
    if (typeof obj !== "object" || obj === null) return refs;
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "$ref" && typeof val === "string") {
        refs.add(val);
      } else {
        collectRefs(val, refs);
      }
    }
    return refs;
  }

  it("all $ref values resolve within the spec", () => {
    const refs = collectRefs(openApiSpec.paths);
    for (const ref of refs) {
      // e.g. "#/components/schemas/TokenRecord" → ["components","schemas","TokenRecord"]
      const parts = ref.replace("#/", "").split("/");
      let node: any = openApiSpec;
      for (const part of parts) {
        expect(node, `$ref ${ref} — segment "${part}" not found`).toBeDefined();
        node = node[part];
      }
      expect(node, `$ref ${ref} does not resolve`).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  it("all tags used in operations are declared at the top level", () => {
    const declaredTags = new Set((openApiSpec.tags ?? []).map((t: any) => t.name));
    const methods = ["get", "post", "put", "patch", "delete"];
    for (const [path, item] of Object.entries(openApiSpec.paths!)) {
      for (const method of methods) {
        const op = (item as any)[method];
        if (op?.tags) {
          for (const tag of op.tags) {
            expect(declaredTags.has(tag), `Tag "${tag}" used in ${method.toUpperCase()} ${path} but not declared`).toBe(true);
          }
        }
      }
    }
  });
});
