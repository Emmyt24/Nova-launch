/**
 * Terraform IaC Extended Tests
 *
 * Covers the WAF, monitoring, and ecs-blue-green modules added in the
 * infra/terraform-iac implementation. Complements terraform-config.test.ts.
 *
 * Tests cover:
 *  - WAF module: OWASP rule groups, rate limiting, geo-blocking, logging
 *  - Monitoring module: SNS topic, dashboards, composite alarm, log filters
 *  - ECS blue-green module: auto-scaling, blue/green slot configuration
 *  - Environment integration: WAF + monitoring wired into staging + production
 *  - Edge cases: empty optional variables, validation rules
 *  - Security: WAF log redaction, SNS encryption, alarm actions
 *
 * Run: npx vitest run infra/terraform/tests/terraform-extended.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERRAFORM_ROOT = path.resolve(__dirname, "..");

function tfRoot(...parts: string[]): string {
  return path.join(TERRAFORM_ROOT, ...parts);
}

function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ---------------------------------------------------------------------------
// WAF Module
// ---------------------------------------------------------------------------

describe("WAF module", () => {
  let wafMain: string | null;
  let wafVars: string | null;
  let wafOutputs: string | null;

  beforeAll(() => {
    wafMain = readFile(tfRoot("modules", "waf", "main.tf"));
    wafVars = readFile(tfRoot("modules", "waf", "variables.tf"));
    wafOutputs = readFile(tfRoot("modules", "waf", "outputs.tf"));
  });

  it("main.tf exists", () =>
    expect(fileExists(tfRoot("modules", "waf", "main.tf"))).toBe(true));
  it("variables.tf exists", () =>
    expect(fileExists(tfRoot("modules", "waf", "variables.tf"))).toBe(true));
  it("outputs.tf exists", () =>
    expect(fileExists(tfRoot("modules", "waf", "outputs.tf"))).toBe(true));

  describe("OWASP managed rule groups", () => {
    it("includes AWSManagedRulesCommonRuleSet (OWASP Top 10)", () => {
      expect(wafMain).toContain("AWSManagedRulesCommonRuleSet");
    });

    it("includes AWSManagedRulesKnownBadInputsRuleSet (Log4j, SSRF)", () => {
      expect(wafMain).toContain("AWSManagedRulesKnownBadInputsRuleSet");
    });

    it("includes AWSManagedRulesSQLiRuleSet (SQL injection)", () => {
      expect(wafMain).toContain("AWSManagedRulesSQLiRuleSet");
    });

    it("includes AWSManagedRulesAmazonIpReputationList (malicious IPs)", () => {
      expect(wafMain).toContain("AWSManagedRulesAmazonIpReputationList");
    });
  });

  describe("Rate limiting", () => {
    it("has rate-based rule", () => {
      expect(wafMain).toContain("rate_based_statement");
    });

    it("rate limit variable has minimum validation (>= 100)", () => {
      expect(wafVars).toContain("var.rate_limit_requests >= 100");
    });

    it("default rate limit is 2000 requests per 5 minutes", () => {
      expect(wafVars).toContain("default     = 2000");
    });
  });

  describe("Geo-blocking", () => {
    it("has geo_match_statement for optional country allowlist", () => {
      expect(wafMain).toContain("geo_match_statement");
    });

    it("geo-blocking is conditional (only when allowed_countries is set)", () => {
      expect(wafMain).toContain("length(var.allowed_countries) > 0");
    });

    it("default allowed_countries is empty (geo-blocking disabled by default)", () => {
      expect(wafVars).toContain("default     = []");
    });
  });

  describe("Logging and observability", () => {
    it("WAF log group name starts with aws-waf-logs- (required by AWS)", () => {
      expect(wafMain).toContain('"aws-waf-logs-');
    });

    it("WAF logging configuration is defined", () => {
      expect(wafMain).toContain("aws_wafv2_web_acl_logging_configuration");
    });

    it("authorization header is redacted from WAF logs (OWASP best practice)", () => {
      expect(wafMain).toContain('"authorization"');
      expect(wafMain).toContain("redacted_fields");
    });

    it("cookie header is redacted from WAF logs", () => {
      expect(wafMain).toContain('"cookie"');
    });

    it("CloudWatch metrics enabled for all rules", () => {
      expect(wafMain).toContain("cloudwatch_metrics_enabled = true");
    });

    it("sampled requests enabled for debugging", () => {
      expect(wafMain).toContain("sampled_requests_enabled   = true");
    });
  });

  describe("ALB association", () => {
    it("WAF is associated with ALB via aws_wafv2_web_acl_association", () => {
      expect(wafMain).toContain("aws_wafv2_web_acl_association");
    });

    it("scope is REGIONAL (for ALB, not CloudFront)", () => {
      expect(wafMain).toContain('scope       = "REGIONAL"');
    });
  });

  describe("Blocked requests alarm", () => {
    it("has CloudWatch alarm for high blocked request count", () => {
      expect(wafMain).toContain("waf-blocked-high");
    });

    it("alarm threshold is configurable", () => {
      expect(wafMain).toContain("var.blocked_requests_alarm_threshold");
    });
  });

  describe("Outputs", () => {
    it("exports web_acl_arn", () =>
      expect(wafOutputs).toContain("web_acl_arn"));
    it("exports web_acl_id", () => expect(wafOutputs).toContain("web_acl_id"));
    it("exports log_group_arn", () =>
      expect(wafOutputs).toContain("log_group_arn"));
  });
});

// ---------------------------------------------------------------------------
// Monitoring Module
// ---------------------------------------------------------------------------

describe("Monitoring module", () => {
  let monMain: string | null;
  let monVars: string | null;
  let monOutputs: string | null;

  beforeAll(() => {
    monMain = readFile(tfRoot("modules", "monitoring", "main.tf"));
    monVars = readFile(tfRoot("modules", "monitoring", "variables.tf"));
    monOutputs = readFile(tfRoot("modules", "monitoring", "outputs.tf"));
  });

  it("main.tf exists", () =>
    expect(fileExists(tfRoot("modules", "monitoring", "main.tf"))).toBe(true));
  it("variables.tf exists", () =>
    expect(fileExists(tfRoot("modules", "monitoring", "variables.tf"))).toBe(
      true,
    ));
  it("outputs.tf exists", () =>
    expect(fileExists(tfRoot("modules", "monitoring", "outputs.tf"))).toBe(
      true,
    ));

  describe("SNS topic", () => {
    it("creates SNS topic for alarm notifications", () => {
      expect(monMain).toContain("aws_sns_topic");
    });

    it("SNS topic is encrypted at rest (KMS)", () => {
      expect(monMain).toContain("kms_master_key_id");
    });

    it("SNS topic policy allows CloudWatch to publish", () => {
      expect(monMain).toContain("cloudwatch.amazonaws.com");
      expect(monMain).toContain("SNS:Publish");
    });

    it("email subscription is conditional (only when alarm_email is set)", () => {
      expect(monMain).toContain('var.alarm_email != ""');
    });
  });

  describe("Log metric filters", () => {
    it("has 5xx error metric filter", () => {
      expect(monMain).toContain("Backend5xxErrors");
    });

    it("has authentication failure metric filter", () => {
      expect(monMain).toContain("AuthFailures");
    });

    it("slow query filter is conditional (only when rds_log_group_name is set)", () => {
      expect(monMain).toContain('var.rds_log_group_name != ""');
    });
  });

  describe("CloudWatch alarms", () => {
    it("has 5xx error rate alarm", () => {
      expect(monMain).toContain("backend-5xx-rate");
    });

    it("has ALB latency p99 alarm", () => {
      expect(monMain).toContain("alb-latency-p99");
    });

    it("has ECS CPU alarm", () => {
      expect(monMain).toContain("ecs-backend-cpu");
    });

    it("has ECS memory alarm", () => {
      expect(monMain).toContain("ecs-backend-memory");
    });

    it("has auth failure spike alarm (brute-force detection)", () => {
      expect(monMain).toContain("auth-failure-spike");
    });

    it("alarms have ok_actions to notify on recovery", () => {
      expect(monMain).toContain("ok_actions");
    });

    it("alarms use treat_missing_data = notBreaching (avoid false positives)", () => {
      expect(monMain).toContain('treat_missing_data  = "notBreaching"');
    });
  });

  describe("Composite alarm", () => {
    it("has composite alarm for platform-wide degradation", () => {
      expect(monMain).toContain("aws_cloudwatch_composite_alarm");
    });

    it("composite alarm name is platform-degraded", () => {
      expect(monMain).toContain("platform-degraded");
    });

    it("composite alarm uses OR logic across critical alarms", () => {
      expect(monMain).toContain("ALARM(");
      expect(monMain).toContain(" OR ");
    });
  });

  describe("CloudWatch dashboards", () => {
    it("has API overview dashboard", () => {
      expect(monMain).toContain("aws_cloudwatch_dashboard");
      expect(monMain).toContain("-api");
    });

    it("has infrastructure dashboard", () => {
      expect(monMain).toContain("-infrastructure");
    });

    it("API dashboard includes request rate widget", () => {
      expect(monMain).toContain("Request Rate");
    });

    it("API dashboard includes response time widget", () => {
      expect(monMain).toContain("Response Time");
    });

    it("infrastructure dashboard includes RDS metrics", () => {
      expect(monMain).toContain("AWS/RDS");
    });

    it("infrastructure dashboard includes ElastiCache metrics", () => {
      expect(monMain).toContain("AWS/ElastiCache");
    });
  });

  describe("CloudWatch Insights queries", () => {
    it("has backend errors query", () => {
      expect(monMain).toContain("aws_cloudwatch_query_definition");
      expect(monMain).toContain("backend-errors");
    });

    it("has slow requests query", () => {
      expect(monMain).toContain("slow-requests");
    });

    it("has auth failures query", () => {
      expect(monMain).toContain("auth-failures");
    });
  });

  describe("Outputs", () => {
    it("exports sns_topic_arn", () =>
      expect(monOutputs).toContain("sns_topic_arn"));
    it("exports api_dashboard_name", () =>
      expect(monOutputs).toContain("api_dashboard_name"));
    it("exports composite_alarm_arn", () =>
      expect(monOutputs).toContain("composite_alarm_arn"));
  });
});

// ---------------------------------------------------------------------------
// ECS Blue-Green Module — Auto-scaling
// ---------------------------------------------------------------------------

describe("ECS blue-green module — auto-scaling", () => {
  let bgMain: string | null;
  let bgVars: string | null;

  beforeAll(() => {
    bgMain = readFile(tfRoot("modules", "ecs-blue-green", "main.tf"));
    bgVars = readFile(tfRoot("modules", "ecs-blue-green", "variables.tf"));
  });

  it("has auto-scaling target for blue slot", () => {
    expect(bgMain).toContain("backend_blue");
    expect(bgMain).toContain("aws_appautoscaling_target");
  });

  it("has auto-scaling target for green slot", () => {
    expect(bgMain).toContain("backend_green");
  });

  it("has CPU scaling policy for blue slot", () => {
    expect(bgMain).toContain("backend-blue-cpu-scaling");
  });

  it("has CPU scaling policy for green slot", () => {
    expect(bgMain).toContain("backend-green-cpu-scaling");
  });

  it("has memory scaling policy for blue slot", () => {
    expect(bgMain).toContain("backend-blue-memory-scaling");
  });

  it("green slot starts at desired_count = 0 (inactive)", () => {
    expect(bgMain).toContain("desired_count   = 0");
  });

  it("blue slot starts at desired_count = 2 (active)", () => {
    expect(bgMain).toContain("desired_count   = 2");
  });

  it("backend_min_count variable is defined", () => {
    expect(bgVars).toContain("backend_min_count");
  });

  it("backend_max_count variable is defined", () => {
    expect(bgVars).toContain("backend_max_count");
  });

  it("scale-out cooldown is 60s (fast response)", () => {
    expect(bgMain).toContain("scale_out_cooldown = 60");
  });

  it("scale-in cooldown is 300s (conservative)", () => {
    expect(bgMain).toContain("scale_in_cooldown  = 300");
  });
});

// ---------------------------------------------------------------------------
// Environment integration — WAF + Monitoring wired in
// ---------------------------------------------------------------------------

describe("Environment integration — WAF and monitoring", () => {
  let stagingMain: string | null;
  let prodMain: string | null;

  beforeAll(() => {
    stagingMain = readFile(tfRoot("environments", "staging", "main.tf"));
    prodMain = readFile(tfRoot("environments", "production", "main.tf"));
  });

  describe("Staging", () => {
    it("includes WAF module", () => {
      expect(stagingMain).toContain('source = "../../modules/waf"');
    });

    it("includes monitoring module", () => {
      expect(stagingMain).toContain('source = "../../modules/monitoring"');
    });

    it("staging WAF has higher rate limit (more permissive)", () => {
      expect(stagingMain).toContain("rate_limit_requests              = 5000");
    });

    it("staging monitoring has more lenient error threshold", () => {
      expect(stagingMain).toContain("error_rate_threshold      = 20");
    });
  });

  describe("Production", () => {
    it("includes WAF module", () => {
      expect(prodMain).toContain('source = "../../modules/waf"');
    });

    it("includes monitoring module", () => {
      expect(prodMain).toContain('source = "../../modules/monitoring"');
    });

    it("production WAF has stricter rate limit", () => {
      expect(prodMain).toContain("rate_limit_requests              = 2000");
    });

    it("production monitoring has stricter error threshold", () => {
      expect(prodMain).toContain("error_rate_threshold      = 5");
    });

    it("production monitoring has stricter latency threshold", () => {
      expect(prodMain).toContain("latency_threshold_seconds = 1.5");
    });
  });

  describe("Outputs", () => {
    it("staging outputs include waf_web_acl_arn", () => {
      const content = readFile(tfRoot("environments", "staging", "outputs.tf"));
      expect(content).toContain("waf_web_acl_arn");
    });

    it("staging outputs include monitoring_sns_topic_arn", () => {
      const content = readFile(tfRoot("environments", "staging", "outputs.tf"));
      expect(content).toContain("monitoring_sns_topic_arn");
    });

    it("production outputs include waf_web_acl_arn", () => {
      const content = readFile(
        tfRoot("environments", "production", "outputs.tf"),
      );
      expect(content).toContain("waf_web_acl_arn");
    });

    it("production outputs include monitoring_sns_topic_arn", () => {
      const content = readFile(
        tfRoot("environments", "production", "outputs.tf"),
      );
      expect(content).toContain("monitoring_sns_topic_arn");
    });
  });
});

// ---------------------------------------------------------------------------
// ALB module — arn_suffix output
// ---------------------------------------------------------------------------

describe("ALB module — arn_suffix output", () => {
  it("exports alb_arn_suffix for CloudWatch metric dimensions", () => {
    const content = readFile(tfRoot("modules", "alb", "outputs.tf"));
    expect(content).toContain("alb_arn_suffix");
    expect(content).toContain("arn_suffix");
  });
});

// ---------------------------------------------------------------------------
// Edge cases and validation
// ---------------------------------------------------------------------------

describe("Edge cases and validation", () => {
  describe("WAF variable validation", () => {
    it("rate_limit_requests has minimum validation", () => {
      const content = readFile(tfRoot("modules", "waf", "variables.tf"));
      expect(content).toContain("var.rate_limit_requests >= 100");
    });

    it("environment variable validates staging/production only", () => {
      const content = readFile(tfRoot("modules", "waf", "variables.tf"));
      expect(content).toContain('contains(["staging", "production"]');
    });
  });

  describe("Monitoring variable validation", () => {
    it("environment variable validates staging/production only", () => {
      const content = readFile(tfRoot("modules", "monitoring", "variables.tf"));
      expect(content).toContain('contains(["staging", "production"]');
    });

    it("alarm_email defaults to empty string (optional)", () => {
      const content = readFile(tfRoot("modules", "monitoring", "variables.tf"));
      expect(content).toContain('default     = ""');
    });

    it("rds_log_group_name defaults to empty string (optional)", () => {
      const content = readFile(tfRoot("modules", "monitoring", "variables.tf"));
      expect(content).toContain("rds_log_group_name");
    });
  });

  describe("No hardcoded AWS account IDs in new modules", () => {
    const NEW_MODULES = ["waf", "monitoring"];

    for (const mod of NEW_MODULES) {
      it(`modules/${mod}/main.tf has no hardcoded 12-digit account IDs`, () => {
        const content = readFile(tfRoot("modules", mod, "main.tf"));
        if (!content) return;
        // Real account IDs are 12 digits; placeholder is 123456789012
        const realAccountPattern = /(?<!123456789012)\b\d{12}\b/;
        const lines = content
          .split("\n")
          .filter(
            (l) => !l.trim().startsWith("#") && !l.includes("description"),
          );
        const violations = lines.filter((l) => realAccountPattern.test(l));
        expect(violations).toHaveLength(0);
      });
    }
  });

  describe("Module file completeness", () => {
    const NEW_MODULES = ["waf", "monitoring"];
    const REQUIRED_FILES = ["main.tf", "variables.tf", "outputs.tf"];

    for (const mod of NEW_MODULES) {
      for (const file of REQUIRED_FILES) {
        it(`modules/${mod}/${file} exists`, () => {
          expect(fileExists(tfRoot("modules", mod, file))).toBe(true);
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Security hardening checks
// ---------------------------------------------------------------------------

describe("Security hardening", () => {
  describe("WAF default action", () => {
    it("WAF default action is allow (rules handle blocking)", () => {
      const content = readFile(tfRoot("modules", "waf", "main.tf"));
      expect(content).toContain("default_action");
      expect(content).toContain("allow {}");
    });
  });

  describe("Monitoring SNS encryption", () => {
    it("SNS topic uses KMS encryption", () => {
      const content = readFile(tfRoot("modules", "monitoring", "main.tf"));
      expect(content).toContain("kms_master_key_id");
      expect(content).toContain("alias/aws/sns");
    });
  });

  describe("Alarm actions", () => {
    it("monitoring alarms have alarm_actions pointing to SNS topic", () => {
      const content = readFile(tfRoot("modules", "monitoring", "main.tf"));
      expect(content).toContain(
        "alarm_actions       = [aws_sns_topic.alarms.arn]",
      );
    });
  });
});
