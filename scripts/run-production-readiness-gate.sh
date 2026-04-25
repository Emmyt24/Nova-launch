#!/bin/bash
# Production Readiness Gate
# Single command that must pass before any release is cut.
# Usage: ./scripts/run-production-readiness-gate.sh [--network testnet|mainnet] [--backend-url URL]
#
# Exit codes:
#   0  All checks passed — release is safe to proceed
#   1  One or more checks failed — do NOT release

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
NETWORK="${STELLAR_NETWORK:-testnet}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
ENV_FILE="${ENV_FILE:-.env.testnet}"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network) NETWORK="$2"; shift 2 ;;
    --backend-url) BACKEND_URL="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

# ── State ─────────────────────────────────────────────────────────────────────
PASS=0; FAIL=0
FAILURES=()

pass() { echo -e "${GREEN}  ✓ $1${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; FAIL=$((FAIL+1)); FAILURES+=("$1"); }
section() { echo -e "\n${BOLD}── $1 ──${NC}"; }

# ── Load env ──────────────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Nova Launch — Production Readiness Gate    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo "  Network:     $NETWORK"
echo "  Backend URL: $BACKEND_URL"
echo "  Started:     $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# ════════════════════════════════════════════════════════════════════════════
section "1. Contract ID"
# ════════════════════════════════════════════════════════════════════════════

if [[ -z "${FACTORY_CONTRACT_ID:-}" ]]; then
  fail "FACTORY_CONTRACT_ID is not set"
elif ! echo "$FACTORY_CONTRACT_ID" | grep -qE '^C[A-Z2-7]{55}$'; then
  fail "FACTORY_CONTRACT_ID is malformed: \"$FACTORY_CONTRACT_ID\""
else
  pass "FACTORY_CONTRACT_ID is present and well-formed"
fi

# ════════════════════════════════════════════════════════════════════════════
section "2. Frontend Build"
# ════════════════════════════════════════════════════════════════════════════

if [[ ! -d "frontend" ]]; then
  fail "frontend/ directory not found"
elif (cd frontend && npm ci --silent 2>/dev/null && npm run build --silent 2>/dev/null); then
  pass "Frontend builds successfully"
else
  fail "Frontend build failed"
fi

# ════════════════════════════════════════════════════════════════════════════
section "3. Frontend Tests"
# ════════════════════════════════════════════════════════════════════════════

if (cd frontend && npm test -- --run 2>/dev/null); then
  pass "Frontend test suite passes"
else
  fail "Frontend test suite has failures"
fi

# ════════════════════════════════════════════════════════════════════════════
section "4. Contract ABI Compatibility"
# ════════════════════════════════════════════════════════════════════════════

ABI_FILE="frontend/src/contracts/factoryAbi.ts"
if [[ ! -f "$ABI_FILE" ]]; then
  fail "Contract ABI file not found: $ABI_FILE"
else
  REQUIRED_METHODS=("create_token" "burn" "set_metadata" "mint_tokens" "get_state" "get_base_fee" "get_metadata_fee")
  ABI_FAIL=0
  for method in "${REQUIRED_METHODS[@]}"; do
    if ! grep -q "$method" "$ABI_FILE"; then
      fail "ABI missing required method: $method"
      ABI_FAIL=1
    fi
  done
  [[ $ABI_FAIL -eq 0 ]] && pass "Contract ABI contains all required methods"
fi

# ════════════════════════════════════════════════════════════════════════════
section "5. Backend Health"
# ════════════════════════════════════════════════════════════════════════════

HEALTH_RESPONSE=$(curl -sf --max-time 5 "$BACKEND_URL/health" 2>/dev/null || echo "")
if [[ -z "$HEALTH_RESPONSE" ]]; then
  fail "Backend not reachable at $BACKEND_URL/health"
elif echo "$HEALTH_RESPONSE" | grep -qi '"status".*"ok"\|"status".*"healthy"\|"healthy":true'; then
  pass "Backend health check reports healthy"
else
  fail "Backend health check returned unexpected response"
fi

# ════════════════════════════════════════════════════════════════════════════
section "6. Contract Reachability"
# ════════════════════════════════════════════════════════════════════════════

CONTRACT_ID_OK=true
for f in "${FAILURES[@]}"; do
  [[ "$f" == *"FACTORY_CONTRACT_ID"* ]] && CONTRACT_ID_OK=false && break
done

if [[ "$CONTRACT_ID_OK" == "false" ]]; then
  echo "  Skipping — contract ID check failed"
elif command -v soroban &>/dev/null; then
  if soroban contract invoke \
      --id "$FACTORY_CONTRACT_ID" \
      --network "$NETWORK" \
      -- get_state &>/dev/null; then
    pass "Contract responds to get_state on $NETWORK"
  else
    fail "Contract get_state call failed on $NETWORK"
  fi
else
  echo -e "${YELLOW}  ⚠ soroban CLI not found — skipping on-chain reachability check${NC}"
fi

# ════════════════════════════════════════════════════════════════════════════
section "7. Projection / Ingestion Lag"
# ════════════════════════════════════════════════════════════════════════════

METRICS_RESPONSE=$(curl -sf --max-time 5 "$BACKEND_URL/metrics" 2>/dev/null || echo "")
if [[ -n "$METRICS_RESPONSE" ]]; then
  if echo "$METRICS_RESPONSE" | grep -q "nova_launch_event_ingestion_lag_seconds"; then
    pass "Ingestion lag metric is present — event listener is running"
  else
    fail "Ingestion lag metric missing from /metrics — event listener may not be running"
  fi
else
  echo -e "${YELLOW}  ⚠ /metrics not reachable — skipping projection lag check${NC}"
fi

# ════════════════════════════════════════════════════════════════════════════
section "8. Webhook Delivery Reliability"
# ════════════════════════════════════════════════════════════════════════════

if [[ -n "$METRICS_RESPONSE" ]]; then
  if echo "$METRICS_RESPONSE" | grep -q "nova_launch_webhook_delivery_total"; then
    EXHAUSTED=$(echo "$METRICS_RESPONSE" \
      | grep 'nova_launch_webhook_delivery_total{.*outcome="exhausted"' \
      | awk '{print $NF}' | head -1)
    if [[ -n "$EXHAUSTED" && "$EXHAUSTED" != "0" ]]; then
      fail "Webhook exhausted deliveries counter is non-zero ($EXHAUSTED)"
    else
      pass "No exhausted webhook deliveries"
    fi
  else
    echo -e "${YELLOW}  ⚠ Webhook delivery metric not found — skipping${NC}"
  fi
else
  echo -e "${YELLOW}  ⚠ /metrics not reachable — skipping webhook reliability check${NC}"
fi

# ════════════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Gate Summary${NC}"
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo -e "${RED}${BOLD}  GATE FAILED — do not release${NC}"
  echo ""
  echo "  Failing checks:"
  for f in "${FAILURES[@]}"; do
    echo -e "    ${RED}• $f${NC}"
  done
  echo ""
  echo "  See docs/PRODUCTION_READINESS_GATE.md for remediation guidance."
  exit 1
else
  echo ""
  echo -e "${GREEN}${BOLD}  GATE PASSED — release is safe to proceed${NC}"
  echo ""
  exit 0
fi
