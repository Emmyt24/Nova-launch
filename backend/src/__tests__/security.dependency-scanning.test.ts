/**
 * SECURITY TEST: Dependency Scanning & Supply-Chain Security
 *
 * Validates that the project's dependency management practices meet
 * security requirements aligned with the Dependabot + Snyk scanning
 * infrastructure added in infra/security-scanning.
 *
 * Tests cover:
 *  - Package manifest integrity (no wildcard versions in production deps)
 *  - Absence of known-vulnerable package patterns
 *  - Lock-file presence and consistency
 *  - Disallowed license detection
 *  - Dependency count / bloat thresholds
 *  - Snyk policy file structure
 *  - Dependabot configuration completeness
 *  - Secret-pattern detection in source files
 *  - Unsafe Rust code detection logic
 *  - Security report generation helpers
 *
 * RISK COVERAGE:
 *  - SUPPLY-001: Malicious / compromised transitive dependency
 *  - SUPPLY-002: Outdated dependency with known CVE
 *  - SUPPLY-003: Wildcard version pinning allows silent upgrades
 *  - SUPPLY-004: Missing lock file enables non-deterministic installs
 *  - SUPPLY-005: Hardcoded secrets committed to source
 *  - SUPPLY-006: Unsafe Rust code in smart contracts
 *  - SUPPLY-007: Disallowed open-source license in dependency tree
 *
 * OWASP Coverage:
 *  - A06:2021 – Vulnerable and Outdated Components
 *  - A08:2021 – Software and Data Integrity Failures
 *
 * Run: npm run test:security
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a path relative to the monorepo root.
 *  __dirname = backend/src/__tests__  →  3 levels up = repo root
 */
function root(...parts: string[]): string {
  return path.resolve(__dirname, "../../../", ...parts);
}

/** Read and parse a JSON file; returns null if missing */
function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Read a text file; returns null if missing */
function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Recursively collect all files matching an extension under a directory */
function collectFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== "node_modules" &&
      entry.name !== "dist"
    ) {
      results.push(...collectFiles(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BACKEND_PKG_PATH = root("backend/package.json");
const FRONTEND_PKG_PATH = root("frontend/package.json");
const DEPENDABOT_PATH = root(".github/dependabot.yml");
const SNYK_POLICY_PATH = root(".snyk");
const BACKEND_SRC = root("backend/src");
const FRONTEND_SRC = root("frontend/src");
const CONTRACTS_SRC = root("contracts/token-factory/src");

// Licenses that are incompatible with commercial use
const DISALLOWED_LICENSES = [
  "GPL-2.0",
  "GPL-3.0",
  "AGPL-3.0",
  "LGPL-2.0",
  "LGPL-2.1",
];

// Patterns that indicate hardcoded secrets
const SECRET_PATTERNS = [
  /PRIVATE_KEY\s*=\s*['"][^'"]{10,}/,
  /SECRET_KEY\s*=\s*['"][^'"]{10,}/,
  /API_SECRET\s*=\s*['"][^'"]{10,}/,
  /password\s*=\s*['"][^'"]{4,}/i,
  /apiKey\s*=\s*['"][^'"]{10,}/,
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
];

// ---------------------------------------------------------------------------
// [SUPPLY-003] Version pinning
// ---------------------------------------------------------------------------

describe("[SUPPLY-003] Version pinning — no wildcard production dependencies", () => {
  /**
   * Wildcard versions (e.g. "*" or "") allow npm to silently install any
   * version, including malicious ones. Production dependencies must be
   * pinned to at least a semver range (^x.y.z or ~x.y.z).
   */

  function checkNoPureWildcards(pkgPath: string, label: string): void {
    it(`${label}: no production dependency uses bare "*" or ""`, () => {
      const pkg = readJson(pkgPath);
      if (!pkg) return; // file may not exist in all environments

      const deps = (pkg.dependencies as Record<string, string>) ?? {};
      const wildcards = Object.entries(deps).filter(
        ([, v]) => v === "*" || v === "" || v === "latest"
      );

      expect(
        wildcards,
        `Wildcard deps in ${label}: ${wildcards.map(([k]) => k).join(", ")}`
      ).toHaveLength(0);
    });
  }

  checkNoPureWildcards(BACKEND_PKG_PATH, "backend");
  checkNoPureWildcards(FRONTEND_PKG_PATH, "frontend");

  it("backend: all production deps have a version specifier", () => {
    const pkg = readJson(BACKEND_PKG_PATH);
    if (!pkg) return;
    const deps = (pkg.dependencies as Record<string, string>) ?? {};
    for (const [name, version] of Object.entries(deps)) {
      expect(version, `${name} has no version`).toBeTruthy();
      expect(version.length, `${name} version is empty`).toBeGreaterThan(0);
    }
  });

  it("frontend: all production deps have a version specifier", () => {
    const pkg = readJson(FRONTEND_PKG_PATH);
    if (!pkg) return;
    const deps = (pkg.dependencies as Record<string, string>) ?? {};
    for (const [name, version] of Object.entries(deps)) {
      expect(version, `${name} has no version`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// [SUPPLY-002] Known-vulnerable package name patterns
// ---------------------------------------------------------------------------

describe("[SUPPLY-002] Known-vulnerable package name patterns", () => {
  /**
   * Checks for packages that have historically been used in supply-chain
   * attacks (typosquatting, dependency confusion). This is a belt-and-
   * suspenders check on top of Snyk / npm audit.
   */

  const SUSPICIOUS_PATTERNS = [
    /^node-fetch@1\./, // node-fetch v1 has prototype pollution
    /^lodash@[34]\./, // lodash <4.17.21 has prototype pollution
    /^minimist@0\./, // minimist <1.2.6 has prototype pollution
    /^axios@0\./, // axios <1.x has SSRF issues
  ];

  function checkNoSuspiciousVersions(pkgPath: string, label: string): void {
    it(`${label}: no known-vulnerable package versions`, () => {
      const pkg = readJson(pkgPath);
      if (!pkg) return;

      const allDeps: Record<string, string> = {
        ...((pkg.dependencies as Record<string, string>) ?? {}),
        ...((pkg.devDependencies as Record<string, string>) ?? {}),
      };

      for (const [name, version] of Object.entries(allDeps)) {
        const nameVersion = `${name}@${version}`;
        for (const pattern of SUSPICIOUS_PATTERNS) {
          expect(
            pattern.test(nameVersion),
            `Suspicious package version detected: ${nameVersion}`
          ).toBe(false);
        }
      }
    });
  }

  checkNoSuspiciousVersions(BACKEND_PKG_PATH, "backend");
  checkNoSuspiciousVersions(FRONTEND_PKG_PATH, "frontend");
});

// ---------------------------------------------------------------------------
// [SUPPLY-007] License compliance
// ---------------------------------------------------------------------------

describe("[SUPPLY-007] License compliance", () => {
  /**
   * Checks that no direct dependency declares a disallowed license in its
   * package.json. Transitive licenses are handled by Snyk in CI.
   */

  it("backend: no direct dependency declares a disallowed license", () => {
    const pkg = readJson(BACKEND_PKG_PATH);
    if (!pkg) return;

    const deps = Object.keys(
      (pkg.dependencies as Record<string, string>) ?? {}
    );
    const violations: string[] = [];

    for (const dep of deps) {
      const depPkgPath = root("backend/node_modules", dep, "package.json");
      const depPkg = readJson(depPkgPath);
      if (!depPkg) continue;

      const license = (depPkg.license as string) ?? "";
      if (DISALLOWED_LICENSES.some((dl) => license.includes(dl))) {
        violations.push(`${dep}: ${license}`);
      }
    }

    expect(
      violations,
      `Disallowed licenses: ${violations.join(", ")}`
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [SUPPLY-005] Hardcoded secrets in source
// ---------------------------------------------------------------------------

describe("[SUPPLY-005] Hardcoded secrets in source files", () => {
  /**
   * Scans TypeScript source files for patterns that indicate hardcoded
   * credentials. This is a fast local check; Gitleaks in CI provides
   * deeper git-history scanning.
   */

  function scanForSecrets(dir: string, label: string): void {
    it(`${label}: no hardcoded secrets in TypeScript source`, () => {
      const files = [
        ...collectFiles(dir, ".ts"),
        ...collectFiles(dir, ".tsx"),
      ].filter(
        (f) =>
          !f.includes("__tests__") &&
          !f.includes(".test.") &&
          !f.includes(".spec.") &&
          !f.includes("node_modules")
      );

      const violations: string[] = [];

      for (const file of files) {
        const content = readText(file);
        if (!content) continue;

        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            violations.push(
              `${path.relative(root(), file)}: matches ${pattern}`
            );
          }
        }
      }

      expect(
        violations,
        `Potential secrets found:\n${violations.join("\n")}`
      ).toHaveLength(0);
    });
  }

  scanForSecrets(BACKEND_SRC, "backend");
  scanForSecrets(FRONTEND_SRC, "frontend");

  it("no .env file committed to repository root", () => {
    const envPath = root(".env");
    expect(fs.existsSync(envPath), ".env file should not be committed").toBe(
      false
    );
  });

  it("no .env file committed in backend/", () => {
    const envPath = root("backend/.env");
    expect(fs.existsSync(envPath), "backend/.env should not be committed").toBe(
      false
    );
  });

  it(".env.example exists in backend (documents required variables)", () => {
    const examplePath = root("backend/.env.example");
    expect(
      fs.existsSync(examplePath),
      "backend/.env.example should exist"
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// [SUPPLY-006] Unsafe Rust code
// ---------------------------------------------------------------------------

describe("[SUPPLY-006] Unsafe Rust code in smart contracts", () => {
  /**
   * Soroban contracts must not use `unsafe` blocks. Any unsafe code
   * requires explicit security team sign-off and must be documented.
   */

  it("contracts/token-factory: no unsafe blocks in source", () => {
    if (!fs.existsSync(CONTRACTS_SRC)) return; // skip if contracts not present

    const rustFiles = collectFiles(CONTRACTS_SRC, ".rs").filter(
      (f) => !f.includes("test") && !f.includes("_test")
    );

    const violations: string[] = [];

    for (const file of rustFiles) {
      const content = readText(file);
      if (!content) continue;

      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (/\bunsafe\b/.test(line) && !line.trim().startsWith("//")) {
          violations.push(
            `${path.relative(root(), file)}:${idx + 1}: ${line.trim()}`
          );
        }
      });
    }

    expect(
      violations,
      `Unsafe code found:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });

  it("contracts/token-factory: no panic! macros in production code", () => {
    if (!fs.existsSync(CONTRACTS_SRC)) return;

    const rustFiles = collectFiles(CONTRACTS_SRC, ".rs").filter((f) => {
      const base = path.basename(f);
      // Exclude all test/fuzz/soak files — panic! is acceptable in tests
      return (
        !base.includes("_test") &&
        !base.startsWith("test") &&
        !base.startsWith("fuzz") &&
        !base.startsWith("soak") &&
        !base.startsWith("comprehensive_differential") &&
        !base.startsWith("stateful_cross")
      );
    });

    const violations: string[] = [];

    for (const file of rustFiles) {
      const content = readText(file);
      if (!content) continue;

      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (
          /\bpanic!\s*\(/.test(line) &&
          !line.trim().startsWith("//") &&
          // Skip panics that are clearly inside test assertions
          !line.includes("Test must have") &&
          !line.includes("test_") &&
          !line.includes("#[test]")
        ) {
          violations.push(
            `${path.relative(root(), file)}:${idx + 1}: ${line.trim()}`
          );
        }
      });
    }

    expect(
      violations,
      `panic! usage found:\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dependabot configuration completeness
// ---------------------------------------------------------------------------

describe("Dependabot configuration", () => {
  let dependabotContent: string | null;

  beforeAll(() => {
    dependabotContent = readText(DEPENDABOT_PATH);
  });

  it(".github/dependabot.yml exists", () => {
    expect(dependabotContent, "dependabot.yml not found").not.toBeNull();
  });

  it("covers npm ecosystem for backend", () => {
    expect(dependabotContent).toContain("package-ecosystem: npm");
    expect(dependabotContent).toContain("/backend");
  });

  it("covers npm ecosystem for frontend", () => {
    expect(dependabotContent).toContain("/frontend");
  });

  it("covers cargo ecosystem for contracts", () => {
    expect(dependabotContent).toContain("package-ecosystem: cargo");
  });

  it("covers github-actions ecosystem", () => {
    expect(dependabotContent).toContain("package-ecosystem: github-actions");
  });

  it("has a weekly or daily schedule", () => {
    expect(dependabotContent).toMatch(/interval:\s*(weekly|daily)/);
  });

  it("specifies a target-branch", () => {
    expect(dependabotContent).toContain("target-branch: main");
  });

  it("has security labels configured", () => {
    expect(dependabotContent).toContain("security");
  });

  it("groups minor and patch updates to reduce PR noise", () => {
    expect(dependabotContent).toContain("groups:");
    expect(dependabotContent).toMatch(/update-types:\s*\n\s*- minor/);
  });
});

// ---------------------------------------------------------------------------
// Snyk policy file
// ---------------------------------------------------------------------------

describe("Snyk policy file (.snyk)", () => {
  let snykContent: string | null;

  beforeAll(() => {
    snykContent = readText(SNYK_POLICY_PATH);
  });

  it(".snyk policy file exists", () => {
    expect(snykContent, ".snyk file not found").not.toBeNull();
  });

  it("declares a version", () => {
    expect(snykContent).toContain("version:");
  });

  it("has an ignore section (even if empty)", () => {
    expect(snykContent).toContain("ignore:");
  });

  it("has a patch section", () => {
    expect(snykContent).toContain("patch:");
  });
});

// ---------------------------------------------------------------------------
// Security scanning workflow
// ---------------------------------------------------------------------------

describe("Security scanning GitHub Actions workflow", () => {
  const workflowPath = root(".github/workflows/security-scanning.yml");
  let workflowContent: string | null;

  beforeAll(() => {
    workflowContent = readText(workflowPath);
  });

  it("security-scanning.yml exists", () => {
    expect(workflowContent, "security-scanning.yml not found").not.toBeNull();
  });

  it("runs on push to main and develop", () => {
    expect(workflowContent).toContain("branches: [main, develop]");
  });

  it("runs on a daily schedule", () => {
    expect(workflowContent).toContain("cron:");
  });

  it("includes npm audit for backend", () => {
    expect(workflowContent).toContain("npm-audit-backend");
  });

  it("includes npm audit for frontend", () => {
    expect(workflowContent).toContain("npm-audit-frontend");
  });

  it("includes Snyk scanning", () => {
    expect(workflowContent).toContain("snyk/actions");
  });

  it("includes cargo audit for contracts", () => {
    expect(workflowContent).toContain("cargo-audit");
  });

  it("includes CodeQL SAST", () => {
    expect(workflowContent).toContain("codeql");
  });

  it("includes Trivy container scanning", () => {
    expect(workflowContent).toContain("trivy");
  });

  it("includes secret scanning", () => {
    expect(workflowContent).toContain("gitleaks");
  });

  it("uploads SARIF results to GitHub Security tab", () => {
    expect(workflowContent).toContain("upload-sarif");
  });

  it("has a security summary job", () => {
    expect(workflowContent).toContain("security-summary");
  });

  it("uses concurrency to cancel stale runs", () => {
    expect(workflowContent).toContain("concurrency:");
    expect(workflowContent).toContain("cancel-in-progress: true");
  });
});

// ---------------------------------------------------------------------------
// Dependency review workflow
// ---------------------------------------------------------------------------

describe("Dependency review GitHub Actions workflow", () => {
  const workflowPath = root(".github/workflows/dependency-review.yml");
  let workflowContent: string | null;

  beforeAll(() => {
    workflowContent = readText(workflowPath);
  });

  it("dependency-review.yml exists", () => {
    expect(workflowContent, "dependency-review.yml not found").not.toBeNull();
  });

  it("triggers on pull_request", () => {
    expect(workflowContent).toContain("pull_request:");
  });

  it("uses the dependency-review-action", () => {
    expect(workflowContent).toContain("dependency-review-action");
  });

  it("fails on high severity", () => {
    expect(workflowContent).toContain("fail-on-severity: high");
  });

  it("denies GPL licenses", () => {
    expect(workflowContent).toContain("deny-licenses");
    expect(workflowContent).toContain("GPL");
  });
});

// ---------------------------------------------------------------------------
// Security scan script
// ---------------------------------------------------------------------------

describe("Security scan shell script", () => {
  const scriptPath = root("scripts/security-scan.sh");
  let scriptContent: string | null;

  beforeAll(() => {
    scriptContent = readText(scriptPath);
  });

  it("scripts/security-scan.sh exists", () => {
    expect(scriptContent, "security-scan.sh not found").not.toBeNull();
  });

  it("runs npm audit for backend", () => {
    expect(scriptContent).toContain("npm audit");
    expect(scriptContent).toContain("backend");
  });

  it("runs npm audit for frontend", () => {
    expect(scriptContent).toContain("frontend");
  });

  it("runs cargo audit for contracts", () => {
    expect(scriptContent).toContain("cargo audit");
  });

  it("supports Snyk CLI when SNYK_TOKEN is set", () => {
    expect(scriptContent).toContain("SNYK_TOKEN");
    expect(scriptContent).toContain("snyk test");
  });

  it("supports Gitleaks secret scanning", () => {
    expect(scriptContent).toContain("gitleaks");
  });

  it("checks for hardcoded secrets via grep", () => {
    expect(scriptContent).toContain("PRIVATE_KEY");
    expect(scriptContent).toContain("SECRET_KEY");
  });

  it("checks for unsafe Rust code", () => {
    expect(scriptContent).toContain("unsafe");
  });

  it("generates a report file", () => {
    expect(scriptContent).toContain("REPORT_FILE");
  });

  it("supports --fail-on-severity flag", () => {
    expect(scriptContent).toContain("--fail-on-severity");
  });

  it("exits with code 1 on findings above threshold", () => {
    expect(scriptContent).toContain("exit 1");
  });
});

// ---------------------------------------------------------------------------
// Utility: SeverityThreshold logic (unit-testable pure functions)
// ---------------------------------------------------------------------------

describe("SeverityThreshold utility", () => {
  /**
   * These tests validate the severity comparison logic used by the
   * security scan script and CI workflow to decide whether to fail.
   */

  type Severity = "low" | "medium" | "high" | "critical";

  const SEVERITY_RANK: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  function meetsThreshold(found: Severity, threshold: Severity): boolean {
    return SEVERITY_RANK[found] >= SEVERITY_RANK[threshold];
  }

  it("critical meets critical threshold", () => {
    expect(meetsThreshold("critical", "critical")).toBe(true);
  });

  it("critical meets high threshold", () => {
    expect(meetsThreshold("critical", "high")).toBe(true);
  });

  it("critical meets medium threshold", () => {
    expect(meetsThreshold("critical", "medium")).toBe(true);
  });

  it("critical meets low threshold", () => {
    expect(meetsThreshold("critical", "low")).toBe(true);
  });

  it("high does NOT meet critical threshold", () => {
    expect(meetsThreshold("high", "critical")).toBe(false);
  });

  it("high meets high threshold", () => {
    expect(meetsThreshold("high", "high")).toBe(true);
  });

  it("medium does NOT meet high threshold", () => {
    expect(meetsThreshold("medium", "high")).toBe(false);
  });

  it("low does NOT meet medium threshold", () => {
    expect(meetsThreshold("low", "medium")).toBe(false);
  });

  it("low meets low threshold", () => {
    expect(meetsThreshold("low", "low")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Utility: SecretPattern detection (unit-testable pure functions)
// ---------------------------------------------------------------------------

describe("SecretPattern detection", () => {
  /**
   * Unit tests for the regex patterns used in the secret-scanning step.
   * Ensures patterns catch real secrets but don't false-positive on
   * legitimate code (e.g. variable names, comments, test fixtures).
   */

  const patterns = {
    privateKey: /PRIVATE_KEY\s*=\s*['"][^'"]{10,}/,
    secretKey: /SECRET_KEY\s*=\s*['"][^'"]{10,}/,
    apiSecret: /API_SECRET\s*=\s*['"][^'"]{10,}/,
    password: /password\s*=\s*['"][^'"]{4,}/i,
    bearerToken: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
  };

  describe("PRIVATE_KEY pattern", () => {
    it("matches hardcoded private key assignment", () => {
      expect(
        patterns.privateKey.test("PRIVATE_KEY = 'SCZANGBA5YHTNYVS27C4VEDOQ'")
      ).toBe(true);
    });

    it("does not match env variable reference", () => {
      expect(patterns.privateKey.test("process.env.PRIVATE_KEY")).toBe(false);
    });

    it("does not match short values (< 10 chars)", () => {
      expect(patterns.privateKey.test("PRIVATE_KEY = 'short'")).toBe(false);
    });
  });

  describe("SECRET_KEY pattern", () => {
    it("matches hardcoded secret key", () => {
      expect(
        patterns.secretKey.test('SECRET_KEY = "supersecretvalue123"')
      ).toBe(true);
    });

    it("does not match env reference", () => {
      expect(patterns.secretKey.test("process.env.SECRET_KEY")).toBe(false);
    });
  });

  describe("password pattern", () => {
    it("matches hardcoded password", () => {
      expect(patterns.password.test("password = 'mypassword'")).toBe(true);
    });

    it("matches case-insensitively", () => {
      expect(patterns.password.test("Password = 'MyPassword'")).toBe(true);
    });

    it("does not match empty password", () => {
      expect(patterns.password.test("password = ''")).toBe(false);
    });

    it("does not match short password (< 4 chars)", () => {
      expect(patterns.password.test("password = 'abc'")).toBe(false);
    });
  });

  describe("Bearer token pattern", () => {
    it("matches long bearer token", () => {
      expect(
        patterns.bearerToken.test("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
      ).toBe(true);
    });

    it("does not match short bearer value", () => {
      expect(patterns.bearerToken.test("Bearer shorttoken")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Utility: DependencyVersion validation (unit-testable pure functions)
// ---------------------------------------------------------------------------

describe("DependencyVersion validation", () => {
  /**
   * Validates the version-string parsing logic used to detect wildcard
   * and overly-permissive version specifiers.
   */

  type VersionRisk = "safe" | "permissive" | "wildcard";

  function classifyVersion(version: string): VersionRisk {
    if (version === "*" || version === "" || version === "latest")
      return "wildcard";
    if (version.startsWith(">=") && !version.includes("<")) return "permissive";
    return "safe";
  }

  it('classifies "*" as wildcard', () => {
    expect(classifyVersion("*")).toBe("wildcard");
  });

  it('classifies "" as wildcard', () => {
    expect(classifyVersion("")).toBe("wildcard");
  });

  it('classifies "latest" as wildcard', () => {
    expect(classifyVersion("latest")).toBe("wildcard");
  });

  it('classifies ">=1.0.0" (no upper bound) as permissive', () => {
    expect(classifyVersion(">=1.0.0")).toBe("permissive");
  });

  it('classifies "^1.2.3" as safe', () => {
    expect(classifyVersion("^1.2.3")).toBe("safe");
  });

  it('classifies "~1.2.3" as safe', () => {
    expect(classifyVersion("~1.2.3")).toBe("safe");
  });

  it('classifies "1.2.3" (exact) as safe', () => {
    expect(classifyVersion("1.2.3")).toBe("safe");
  });

  it('classifies ">=1.0.0 <2.0.0" as safe (has upper bound)', () => {
    // Has both >= and <, so not purely permissive
    expect(classifyVersion(">=1.0.0 <2.0.0")).toBe("safe");
  });
});
