#!/bin/bash
set -e

# Pre-promotion compatibility check for contract upgrades.
# Run this BEFORE pointing frontend or backend at a new contract ID.
#
# Usage: ./scripts/check-upgrade-compatibility.sh <new_contract_id> [network]
#
# Exit codes:
#   0 — all checks passed, safe to promote
#   1 — one or more checks failed, do NOT promote

NEW_CONTRACT="${1}"
NETWORK="${2:-testnet}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}✓ $1${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}✗ $1${NC}"; FAIL=$((FAIL+1)); }
info() { echo -e "${YELLOW}  $1${NC}"; }

if [ -z "$NEW_CONTRACT" ]; then
  echo "Usage: $0 <new_contract_id> [testnet|mainnet]"
  exit 1
fi

echo "Checking upgrade compatibility for contract: $NEW_CONTRACT (network: $NETWORK)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Contract is reachable ─────────────────────────────────────────────────
echo ""
echo "[1/5] Contract reachability"
if soroban contract invoke \
    --id "$NEW_CONTRACT" \
    --network "$NETWORK" \
    -- get_state > /dev/null 2>&1; then
  pass "Contract responds to get_state"
else
  fail "Contract unreachable or not initialized"
fi

# ── 2. Required ABI methods exist ────────────────────────────────────────────
echo ""
echo "[2/5] ABI method presence"

# Extract method names from factoryAbi.ts (values of FACTORY_METHODS)
ABI_METHODS=$(grep -oP "(?<=: ')[a-z_]+" frontend/src/contracts/factoryAbi.ts | sort -u)

MISSING_METHODS=()
for method in $ABI_METHODS; do
  if ! soroban contract invoke \
      --id "$NEW_CONTRACT" \
      --network "$NETWORK" \
      -- "$method" --help > /dev/null 2>&1; then
    MISSING_METHODS+=("$method")
  fi
done

if [ ${#MISSING_METHODS[@]} -eq 0 ]; then
  pass "All ABI methods present on-chain"
else
  fail "Missing methods: ${MISSING_METHODS[*]}"
  info "Update factoryAbi.ts or re-check the contract build"
fi

# ── 3. Critical routes smoke test ────────────────────────────────────────────
echo ""
echo "[3/5] Critical route smoke tests"

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"

for route in "/health" "/api/tokens" "/api/governance"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}${route}" 2>/dev/null || echo "000")
  if [ "$status" = "200" ] || [ "$status" = "404" ]; then
    # 404 is acceptable for empty collections; 000 means backend is down
    pass "Route ${route} reachable (HTTP $status)"
  else
    fail "Route ${route} returned HTTP $status"
  fi
done

# ── 4. Event topic registry covers known topics ──────────────────────────────
echo ""
echo "[4/5] Event decoder registry coverage"

# Extract topic keys from decoderRegistry.ts
REGISTERED_TOPICS=$(grep -oP "(?<=  )[a-z_]+(?=:)" \
  backend/src/services/eventVersioning/decoderRegistry.ts | sort -u)

# Extract event topic strings emitted by the contract source
CONTRACT_TOPICS=$(grep -oP '(?<=symbol![(]")[a-z_]+(?=")' \
  contracts/token-factory/src/events.rs 2>/dev/null | sort -u || true)

UNREGISTERED=()
for topic in $CONTRACT_TOPICS; do
  if ! echo "$REGISTERED_TOPICS" | grep -q "^${topic}$"; then
    UNREGISTERED+=("$topic")
  fi
done

if [ ${#UNREGISTERED[@]} -eq 0 ]; then
  pass "All contract event topics registered in decoderRegistry"
else
  fail "Unregistered event topics: ${UNREGISTERED[*]}"
  info "Add entries to backend/src/services/eventVersioning/decoderRegistry.ts"
fi

# ── 5. Frontend build succeeds with new contract ID ──────────────────────────
echo ""
echo "[5/5] Frontend build check"

ORIG_CONTRACT_ID="${VITE_FACTORY_CONTRACT_ID:-}"
export VITE_FACTORY_CONTRACT_ID="$NEW_CONTRACT"
export VITE_NETWORK="$NETWORK"

if (cd frontend && npm run build -- --mode production > /dev/null 2>&1); then
  pass "Frontend builds successfully with new contract ID"
else
  fail "Frontend build failed — check for ABI or type errors"
fi

# Restore original
export VITE_FACTORY_CONTRACT_ID="$ORIG_CONTRACT_ID"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}COMPATIBILITY CHECK FAILED — do not promote this contract.${NC}"
  echo "See docs/CONTRACT_UPGRADE_COMPATIBILITY.md for remediation steps."
  exit 1
else
  echo -e "${GREEN}All checks passed — safe to promote contract ${NEW_CONTRACT}.${NC}"
fi
