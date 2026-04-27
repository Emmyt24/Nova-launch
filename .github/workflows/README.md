# Nova Launch — GitHub Actions Workflows

## Overview

| Workflow                        | Trigger                   | Purpose                                                     |
| ------------------------------- | ------------------------- | ----------------------------------------------------------- |
| `backend-ci.yml`                | push/PR to `backend/**`   | Lint, type-check, test, build                               |
| `ci-cd-pipeline.yml`            | push/PR to main/develop   | Full Rust contract pipeline + deploy                        |
| `security-scanning.yml`         | push/PR/daily cron        | Vulnerability scanning (npm, Snyk, CodeQL, Trivy, Gitleaks) |
| `dependency-review.yml`         | PR to main/develop        | Block PRs introducing vulnerable/GPL deps                   |
| `security-tests.yml`            | push/PR to `backend/**`   | Application-level security test suite                       |
| `comprehensive-tests.yml`       | push/PR                   | Full test matrix                                            |
| `coverage-gates.yml`            | push/PR                   | Enforce >90% coverage threshold                             |
| `performance.yml`               | push/PR                   | Lighthouse + load tests                                     |
| `fuzz-testing.yml`              | schedule                  | Property-based + fuzz tests                                 |
| `property-tests.yml`            | push/PR                   | Fast-check property tests                                   |
| `campaign-chaos.yml`            | push/PR                   | Chaos engineering for campaigns                             |
| `campaign-consistency.yml`      | push/PR                   | Campaign state consistency                                  |
| `frontend-e2e.yml`              | push/PR to `frontend/**`  | Browser E2E tests                                           |
| `gas-benchmarks.yml`            | push/PR to `contracts/**` | Soroban gas benchmarks                                      |
| `production-readiness-gate.yml` | push to main              | Final production gate                                       |
| `deploy.yml`                    | push to main/develop      | Deployment orchestration                                    |
| `error-code-stability.yml`      | push/PR                   | Error code regression                                       |

---

## Security Scanning (`security-scanning.yml`)

Runs on every push, PR, and daily at 02:00 UTC.

### Jobs

| Job                  | Tool        | What it checks                           |
| -------------------- | ----------- | ---------------------------------------- |
| `npm-audit-backend`  | npm audit   | Node.js CVEs in backend deps             |
| `npm-audit-frontend` | npm audit   | Node.js CVEs in frontend deps            |
| `snyk-backend`       | Snyk        | Deep dep graph + license scan (backend)  |
| `snyk-frontend`      | Snyk        | Deep dep graph + license scan (frontend) |
| `snyk-contracts`     | Snyk        | Rust dep vulnerabilities                 |
| `cargo-audit`        | cargo-audit | Rust CVEs (RustSec advisory DB)          |
| `codeql`             | CodeQL      | SAST — JS/TS source code                 |
| `trivy-backend`      | Trivy       | Docker image CVEs                        |
| `secret-scan`        | Gitleaks    | Hardcoded credentials in git history     |
| `security-summary`   | —           | Aggregates results, posts PR comment     |

### Required Secrets

| Secret       | Where to get it             |
| ------------ | --------------------------- |
| `SNYK_TOKEN` | https://app.snyk.io/account |

Snyk jobs are skipped on forks (token not available).

### Severity Threshold

Default: `high` (fails on high + critical). Override via `workflow_dispatch`:

```
Actions → Security Scanning → Run workflow → fail_on_severity: medium
```

### SARIF Upload

All scanners upload SARIF results to the **Security → Code scanning** tab.
This gives a unified view of all findings across tools.

---

## Dependency Review (`dependency-review.yml`)

Runs on every PR to `main` or `develop`.

- Blocks PRs that introduce dependencies with **high or critical** CVEs
- Blocks dependencies with **GPL-2.0, GPL-3.0, or AGPL-3.0** licenses
- Posts a summary comment on the PR

---

## Dependabot (`dependabot.yml`)

Automated dependency update PRs, opened every Monday at 08:00 UTC.

| Ecosystem      | Directory                  | Schedule           |
| -------------- | -------------------------- | ------------------ |
| npm            | `/backend`                 | Weekly (Monday)    |
| npm            | `/frontend`                | Weekly (Monday)    |
| npm            | `/scripts/deployment`      | Weekly (Monday)    |
| cargo          | `/contracts/token-factory` | Weekly (Tuesday)   |
| github-actions | `/`                        | Weekly (Wednesday) |

Minor + patch updates are **grouped** into a single PR per ecosystem to reduce noise.
Security updates get their own PR immediately.

---

## Local Security Scanning

Run the full scan locally:

```bash
# Basic scan (npm audit + cargo audit + secret grep)
./scripts/security-scan.sh

# With Snyk (requires SNYK_TOKEN)
SNYK_TOKEN=<your-token> ./scripts/security-scan.sh

# Fail only on critical issues
./scripts/security-scan.sh --fail-on-severity critical

# Reports saved to security-reports/
```

Run the security scanning unit tests:

```bash
cd backend
npm run test:security:scanning
```

---

## Snyk Policy (`.snyk`)

The `.snyk` file at the repo root controls which vulnerabilities are ignored.
All ignores require a reason and expiry date. Edit only after security team review.

---

## Adding a New Workflow

1. Create `.github/workflows/<name>.yml`
2. Add an entry to this README
3. If it touches security, add a corresponding test in
   `backend/src/__tests__/security.dependency-scanning.test.ts`
