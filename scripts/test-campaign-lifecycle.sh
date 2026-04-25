#!/bin/bash
# Campaign Lifecycle End-to-End Test Runner
# Runs the full buyback campaign lifecycle integration test suite:
#   - Frontend e2e: creation, execution, dashboard reconciliation
#   - Backend integration: projection ingestion, consistency checks
#
# Usage:
#   ./scripts/test-campaign-lifecycle.sh [--verbose] [--backend-only] [--frontend-only]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VERBOSE=false
BACKEND_ONLY=false
FRONTEND_ONLY=false
FAILED=0

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Run the buyback campaign lifecycle end-to-end test suite.

OPTIONS:
    --verbose         Show full test output
    --backend-only    Run only backend projection tests
    --frontend-only   Run only frontend e2e tests
    -h, --help        Show this help message

WHAT THIS TESTS:
    1. Campaign creation produces a real tx hash
    2. Executing steps updates on-chain state and backend projections
    3. Dashboard reflects completed progress correctly

EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose) VERBOSE=true; shift ;;
    --backend-only) BACKEND_ONLY=true; shift ;;
    --frontend-only) FRONTEND_ONLY=true; shift ;;
    -h|--help) usage ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; usage ;;
  esac
done

print_header() {
  echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

print_section() {
  echo -e "\n${YELLOW}▶ $1${NC}"
}

run_suite() {
  local name="$1"
  local cmd="$2"
  local cwd="$3"

  print_section "$name"

  if [ "$VERBOSE" = true ]; then
    (cd "$cwd" && eval "$cmd")
  else
    (cd "$cwd" && eval "$cmd") 2>&1 | tail -20
  fi

  local exit_code=${PIPESTATUS[0]}
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✓ $name passed${NC}"
  else
    echo -e "${RED}✗ $name failed (exit: $exit_code)${NC}"
    FAILED=$((FAILED + 1))
  fi
}

print_header "Campaign Lifecycle E2E Test Suite"
echo "Started: $(date)"

# ── Frontend e2e ──────────────────────────────────────────────────────────────
if [ "$BACKEND_ONLY" = false ]; then
  print_header "Frontend: Campaign Lifecycle E2E"

  run_suite \
    "Campaign creation — tx hash assertion" \
    "npx vitest run src/test/e2e/campaign-lifecycle.e2e.test.tsx --reporter=verbose" \
    "frontend"
fi

# ── Backend integration ───────────────────────────────────────────────────────
if [ "$FRONTEND_ONLY" = false ]; then
  print_header "Backend: Projection Ingestion Integration"

  run_suite \
    "Campaign projection ingestion" \
    "npx vitest run src/__tests__/campaignProjection.ingestion.integration.test.ts --reporter=verbose" \
    "backend"

  run_suite \
    "Campaign consistency checker" \
    "npx vitest run src/__tests__/campaignConsistencyChecker.test.ts --reporter=verbose" \
    "backend"

  run_suite \
    "Campaign ingestion (event parser)" \
    "npx vitest run src/__tests__/campaignIngestion.test.ts --reporter=verbose" \
    "backend"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
print_header "Summary"
echo "Completed: $(date)"

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}✗ $FAILED suite(s) failed. See output above.${NC}"
  exit 1
else
  echo -e "${GREEN}✓ All lifecycle suites passed.${NC}"
  exit 0
fi
