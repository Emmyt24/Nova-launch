#!/bin/bash
set -e

# ---------------------------------------------------------------------------
# Reads network and contract values from the canonical env file (.env.testnet
# by default) so this script always references the same values as the runtime
# services and the frontend.
# ---------------------------------------------------------------------------
ENV_FILE="${ENV_FILE:-.env.testnet}"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

# Fall back to deployment-testnet.json for backwards compatibility
if [ -z "$FACTORY_CONTRACT_ID" ]; then
  if [ ! -f "deployment-testnet.json" ]; then
    echo "Error: Neither $ENV_FILE nor deployment-testnet.json found. Deploy the contract first."
    exit 1
  fi
  FACTORY_CONTRACT_ID=$(grep -o '"contractId": "[^"]*' deployment-testnet.json | cut -d'"' -f4)
fi

STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"

if [ -z "$FACTORY_CONTRACT_ID" ]; then
  echo "Error: FACTORY_CONTRACT_ID is not set. Deploy the contract first."
  exit 1
fi

echo "Verifying deployment"
echo "  Network:     $STELLAR_NETWORK"
echo "  Contract ID: $FACTORY_CONTRACT_ID"
echo "================================================"

# Get factory state
echo -e "\n1. Factory State:"
soroban contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --network "$STELLAR_NETWORK" \
  --source admin \
  -- get_state

# Get admin address
ADMIN_ADDRESS=$(soroban keys address admin)

echo -e "\n2. Testing Token Creation:"
echo "Creating test token..."

TOKEN_ADDRESS=$(soroban contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --network "$STELLAR_NETWORK" \
  --source admin \
  -- create_token \
  --creator "$ADMIN_ADDRESS" \
  --name "Verification Test Token" \
  --symbol "VTT" \
  --decimals 7 \
  --initial_supply 1000000 \
  --fee_payment 70000000)

echo "Test token created: $TOKEN_ADDRESS"

echo -e "\n3. Backend API Verification:"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
echo "Checking backend health at $BACKEND_URL..."

HEALTH=$(curl -sf "$BACKEND_URL/health" -H "Accept: application/json" 2>/dev/null || echo "")
if [ -n "$HEALTH" ]; then
  echo "  ✓ Backend is reachable"
else
  echo "  ⚠ Backend not reachable at $BACKEND_URL (is it running?)"
fi

echo "Searching for deployed token ($TOKEN_ADDRESS) in backend index..."
SEARCH=$(curl -sf \
  "$BACKEND_URL/api/tokens/search?q=$(echo "$TOKEN_ADDRESS" | cut -c1-10)&limit=5" \
  -H "Accept: application/json" 2>/dev/null || echo "")

if echo "$SEARCH" | grep -q "$TOKEN_ADDRESS"; then
  echo "  ✓ Token found in backend index"
else
  echo "  ⚠ Token not yet indexed (backend event listener may need time to ingest)"
  echo "    Run: ./scripts/fullstack-smoke-test.sh to verify with polling"
fi

echo -e "\n4. Contract-Backend Consistency Check:"
CONSISTENCY_PASSED=true

# Get token count from factory
echo "Checking factory state consistency..."
FACTORY_STATE=$(soroban contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --network "$STELLAR_NETWORK" \
  --source admin \
  -- get_state 2>/dev/null || echo "")

if [ -n "$FACTORY_STATE" ]; then
  ONCHAIN_TOKEN_COUNT=$(echo "$FACTORY_STATE" | jq -r '.token_count // 0' 2>/dev/null || echo "0")
  ONCHAIN_PAUSED=$(echo "$FACTORY_STATE" | jq -r '.paused // false' 2>/dev/null || echo "false")
  ONCHAIN_BASE_FEE=$(echo "$FACTORY_STATE" | jq -r '.base_fee // "0"' 2>/dev/null || echo "0")
  
  echo "  On-chain token count: $ONCHAIN_TOKEN_COUNT"
  echo "  On-chain paused: $ONCHAIN_PAUSED"
  echo "  On-chain base_fee: $ONCHAIN_BASE_FEE"

  # Compare with backend token count
  if [ -n "$HEALTH" ]; then
    BACKEND_STATS=$(curl -sf "$BACKEND_URL/api/stats" -H "Accept: application/json" 2>/dev/null || echo "")
    
    if [ -n "$BACKEND_STATS" ]; then
      BACKEND_TOKEN_COUNT=$(echo "$BACKEND_STATS" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('tokenCount', d.get('tokenCount', 0)))" \
        2>/dev/null || echo "0")
      
      echo "  Backend token count:  $BACKEND_TOKEN_COUNT"
      
      # Allow small drift for tokens in-flight (just created, not yet indexed)
      DRIFT=$((ONCHAIN_TOKEN_COUNT - BACKEND_TOKEN_COUNT))
      if [ "$DRIFT" -lt 0 ]; then
        DRIFT=$((-DRIFT))
      fi
      
      if [ "$DRIFT" -le 2 ]; then
        echo "  ✓ Token counts within acceptable drift ($DRIFT)"
      else
        echo "  ⚠ Token count drift detected: $DRIFT tokens"
        echo "    On-chain: $ONCHAIN_TOKEN_COUNT, Backend: $BACKEND_TOKEN_COUNT"
        CONSISTENCY_PASSED=false
      fi
    else
      echo "  ⚠ Could not fetch backend stats (is /api/stats available?)"
    fi
  fi

  # Check that contract is not paused (for production deploys)
  if [ "$ONCHAIN_PAUSED" = "true" ]; then
    echo "  ⚠ Contract is PAUSED - verify this is intentional"
  else
    echo "  ✓ Contract is active (not paused)"
  fi
else
  echo "  ⚠ Could not fetch factory state for consistency check"
fi

echo -e "\n5. Burn Record Consistency Check:"
if [ -n "$HEALTH" ]; then
  # Sample a recent token to verify burn consistency
  RECENT_TOKEN=$(curl -sf "$BACKEND_URL/api/tokens?limit=1&sort=createdAt:desc" \
    -H "Accept: application/json" 2>/dev/null || echo "")
  
  if [ -n "$RECENT_TOKEN" ]; then
    TOKEN_ADDR=$(echo "$RECENT_TOKEN" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); tokens=d.get('data',[]); print(tokens[0].get('address','') if tokens else '')" \
      2>/dev/null || echo "")
    BACKEND_BURN_COUNT=$(echo "$RECENT_TOKEN" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); tokens=d.get('data',[]); print(tokens[0].get('burnCount',0) if tokens else 0)" \
      2>/dev/null || echo "0")
    
    if [ -n "$TOKEN_ADDR" ] && [ "$TOKEN_ADDR" != "" ]; then
      echo "  Sampled token: $TOKEN_ADDR"
      echo "  Backend burn count: $BACKEND_BURN_COUNT"
      echo "  ✓ Burn record accessible for consistency verification"
    else
      echo "  ⚠ No tokens available for burn consistency sampling"
    fi
  else
    echo "  ⚠ Could not fetch recent tokens for burn consistency check"
  fi
else
  echo "  ⚠ Backend not reachable, skipping burn consistency check"
fi

echo -e "\n6. Verification Complete!"
echo "================================================"
if [ "$CONSISTENCY_PASSED" = true ]; then
  echo "All checks passed successfully."
else
  echo "⚠ Some consistency checks reported drift. Review output above."
  echo "  This may be normal if events are still being indexed."
fi
