#!/usr/bin/env bash
##############################################################################
# security-scan.sh — Nova Launch
#
# Runs the full local security scanning suite:
#   1. npm audit (backend)
#   2. npm audit (frontend)
#   3. cargo audit (contracts)
#   4. Snyk CLI (if SNYK_TOKEN is set)
#   5. Gitleaks secret scan (if installed)
#   6. Hardcoded-secret grep
#   7. Unsafe-code grep (Rust)
#
# Usage:
#   ./scripts/security-scan.sh [--fail-on-severity <low|medium|high|critical>]
#
# Exit codes:
#   0 — no issues at or above the threshold
#   1 — issues found at or above the threshold
#   2 — tool not found / setup error
##############################################################################

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
FAIL_ON_SEVERITY="${FAIL_ON_SEVERITY:-high}"
REPORT_DIR="${REPORT_DIR:-security-reports}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
REPORT_FILE="${REPORT_DIR}/security-scan-${TIMESTAMP}.md"

# Parse CLI args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fail-on-severity)
      FAIL_ON_SEVERITY="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1"; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
ISSUES_CRITICAL=0
ISSUES_HIGH=0
ISSUES_MEDIUM=0
ISSUES_LOW=0

section() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
pass()    { echo -e "${GREEN}  ✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail()    { echo -e "${RED}  ✗ $1${NC}"; }

bump_severity() {
  case "$1" in
    critical) ISSUES_CRITICAL=$((ISSUES_CRITICAL + 1)) ;;
    high)     ISSUES_HIGH=$((ISSUES_HIGH + 1)) ;;
    medium)   ISSUES_MEDIUM=$((ISSUES_MEDIUM + 1)) ;;
    low)      ISSUES_LOW=$((ISSUES_LOW + 1)) ;;
  esac
}

should_fail() {
  case "$FAIL_ON_SEVERITY" in
    critical) [[ $ISSUES_CRITICAL -gt 0 ]] ;;
    high)     [[ $((ISSUES_CRITICAL + ISSUES_HIGH)) -gt 0 ]] ;;
    medium)   [[ $((ISSUES_CRITICAL + ISSUES_HIGH + ISSUES_MEDIUM)) -gt 0 ]] ;;
    low)      [[ $((ISSUES_CRITICAL + ISSUES_HIGH + ISSUES_MEDIUM + ISSUES_LOW)) -gt 0 ]] ;;
    *)        false ;;
  esac
}

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mkdir -p "$REPORT_DIR"

echo -e "${BOLD}🔒 Nova Launch Security Scan${NC}"
echo "   Threshold : ${FAIL_ON_SEVERITY}"
echo "   Report    : ${REPORT_FILE}"
echo "   Timestamp : ${TIMESTAMP}"

# Start report
cat > "$REPORT_FILE" <<EOF
# Nova Launch Security Scan Report

**Date:** $(date -u)
**Threshold:** ${FAIL_ON_SEVERITY}
**Commit:** $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
**Branch:** $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

---

EOF

# ---------------------------------------------------------------------------
# 1. npm audit — backend
# ---------------------------------------------------------------------------
section "1. npm audit — backend"
if [[ -f backend/package.json ]]; then
  pushd backend > /dev/null
  if npm audit --audit-level=high 2>&1 | tee -a "../${REPORT_FILE}"; then
    pass "No high/critical vulnerabilities in backend dependencies"
  else
    fail "Vulnerabilities found in backend dependencies"
    bump_severity high
  fi
  popd > /dev/null
else
  warn "backend/package.json not found — skipping"
fi

# ---------------------------------------------------------------------------
# 2. npm audit — frontend
# ---------------------------------------------------------------------------
section "2. npm audit — frontend"
if [[ -f frontend/package.json ]]; then
  pushd frontend > /dev/null
  if npm audit --audit-level=high 2>&1 | tee -a "../${REPORT_FILE}"; then
    pass "No high/critical vulnerabilities in frontend dependencies"
  else
    fail "Vulnerabilities found in frontend dependencies"
    bump_severity high
  fi
  popd > /dev/null
else
  warn "frontend/package.json not found — skipping"
fi

# ---------------------------------------------------------------------------
# 3. cargo audit — contracts
# ---------------------------------------------------------------------------
section "3. cargo audit — contracts"
if command -v cargo-audit &>/dev/null; then
  if [[ -f contracts/token-factory/Cargo.toml ]]; then
    pushd contracts/token-factory > /dev/null
    if cargo audit 2>&1 | tee -a "../../${REPORT_FILE}"; then
      pass "No vulnerabilities in Rust dependencies"
    else
      fail "Vulnerabilities found in Rust dependencies"
      bump_severity high
    fi
    popd > /dev/null
  else
    warn "contracts/token-factory/Cargo.toml not found — skipping"
  fi
else
  warn "cargo-audit not installed. Install with: cargo install cargo-audit"
  echo "  cargo-audit not installed" >> "$REPORT_FILE"
fi

# ---------------------------------------------------------------------------
# 4. Snyk CLI
# ---------------------------------------------------------------------------
section "4. Snyk CLI"
if command -v snyk &>/dev/null && [[ -n "${SNYK_TOKEN:-}" ]]; then
  echo "## Snyk Scan" >> "$REPORT_FILE"

  # Backend
  echo "### Backend" >> "$REPORT_FILE"
  if snyk test --file=backend/package.json \
       --severity-threshold="${FAIL_ON_SEVERITY}" \
       --project-name=nova-launch-backend 2>&1 | tee -a "$REPORT_FILE"; then
    pass "Snyk: no issues in backend"
  else
    fail "Snyk: issues found in backend"
    bump_severity high
  fi

  # Frontend
  echo "### Frontend" >> "$REPORT_FILE"
  if snyk test --file=frontend/package.json \
       --severity-threshold="${FAIL_ON_SEVERITY}" \
       --project-name=nova-launch-frontend 2>&1 | tee -a "$REPORT_FILE"; then
    pass "Snyk: no issues in frontend"
  else
    fail "Snyk: issues found in frontend"
    bump_severity high
  fi
elif ! command -v snyk &>/dev/null; then
  warn "Snyk CLI not installed. Install with: npm install -g snyk"
  echo "  Snyk CLI not installed" >> "$REPORT_FILE"
else
  warn "SNYK_TOKEN not set — skipping Snyk scan"
  echo "  SNYK_TOKEN not set" >> "$REPORT_FILE"
fi

# ---------------------------------------------------------------------------
# 5. Gitleaks — secret scanning
# ---------------------------------------------------------------------------
section "5. Gitleaks — secret scanning"
if command -v gitleaks &>/dev/null; then
  if gitleaks detect --source . --verbose --redact 2>&1 | tee -a "$REPORT_FILE"; then
    pass "No secrets detected by Gitleaks"
  else
    fail "Potential secrets detected by Gitleaks"
    bump_severity critical
  fi
else
  warn "Gitleaks not installed. Install from: https://github.com/gitleaks/gitleaks"
  echo "  Gitleaks not installed" >> "$REPORT_FILE"
fi

# ---------------------------------------------------------------------------
# 6. Hardcoded-secret grep
# ---------------------------------------------------------------------------
section "6. Hardcoded-secret grep"
echo "## Hardcoded Secret Check" >> "$REPORT_FILE"

SECRET_PATTERNS=(
  'PRIVATE_KEY\s*='
  'SECRET_KEY\s*='
  'API_SECRET\s*='
  'password\s*=\s*["\x27][^"\x27]{4,}'
  'apiKey\s*=\s*["\x27][^"\x27]{4,}'
  'Bearer [A-Za-z0-9\-._~+/]+=*'
)

SECRETS_FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  # Exclude test files, .env.example, and this script itself
  if grep -rn --include="*.ts" --include="*.js" --include="*.tsx" \
       --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=__tests__ \
       --exclude="*.test.ts" --exclude="*.spec.ts" \
       -E "$pattern" backend/src frontend/src 2>/dev/null; then
    fail "Potential hardcoded secret matching pattern: ${pattern}"
    SECRETS_FOUND=1
    bump_severity critical
  fi
done

if [[ $SECRETS_FOUND -eq 0 ]]; then
  pass "No hardcoded secrets detected"
  echo "  No hardcoded secrets detected" >> "$REPORT_FILE"
fi

# ---------------------------------------------------------------------------
# 7. Unsafe Rust code check
# ---------------------------------------------------------------------------
section "7. Unsafe Rust code check"
echo "## Unsafe Rust Code" >> "$REPORT_FILE"

if [[ -d contracts/token-factory/src ]]; then
  UNSAFE_COUNT=$(grep -rn "unsafe" contracts/token-factory/src/ 2>/dev/null | wc -l || echo 0)
  if [[ "$UNSAFE_COUNT" -gt 0 ]]; then
    warn "Found ${UNSAFE_COUNT} unsafe block(s) in contracts — review required"
    grep -rn "unsafe" contracts/token-factory/src/ >> "$REPORT_FILE" 2>/dev/null || true
    bump_severity medium
  else
    pass "No unsafe code blocks in contracts"
    echo "  No unsafe code blocks found" >> "$REPORT_FILE"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
section "Summary"

cat >> "$REPORT_FILE" <<EOF

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | ${ISSUES_CRITICAL} |
| High     | ${ISSUES_HIGH} |
| Medium   | ${ISSUES_MEDIUM} |
| Low      | ${ISSUES_LOW} |

**Threshold:** ${FAIL_ON_SEVERITY}
EOF

echo ""
echo -e "${BOLD}Results:${NC}"
echo "  Critical : ${ISSUES_CRITICAL}"
echo "  High     : ${ISSUES_HIGH}"
echo "  Medium   : ${ISSUES_MEDIUM}"
echo "  Low      : ${ISSUES_LOW}"
echo ""
echo "  Report saved to: ${REPORT_FILE}"

if should_fail; then
  echo ""
  fail "Security scan FAILED — issues found at or above '${FAIL_ON_SEVERITY}' threshold"
  exit 1
else
  echo ""
  pass "Security scan PASSED (threshold: ${FAIL_ON_SEVERITY})"
  exit 0
fi
