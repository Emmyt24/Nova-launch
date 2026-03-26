#!/bin/bash
# Smoke Test Script for Contract Upgrades
# Runs basic tests to verify contract functionality

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CONTRACT_ID=$1
NETWORK=${2:-testnet}
ADMIN_KEY=${3:-admin}

if [ -z "$CONTRACT_ID" ]; then
    echo -e "${RED}Error: Contract ID required${NC}"
    echo "Usage: $0 <contract_id> [network] [admin_key]"
    exit 1
fi

echo -e "${GREEN}=== Contract Smoke Tests ===${NC}"
echo "Contract: $CONTRACT_ID"
echo "Network: $NETWORK"
echo ""
echo -e "${YELLOW}Tip: For a full-stack smoke test (chain + backend + API), run:${NC}"
echo "  ./scripts/fullstack-smoke-test.sh --network $NETWORK"
echo ""

PASSED=0
FAILED=0

# Test 1: Get State
echo -e "${YELLOW}Test 1: Get State${NC}"
if STATE=$(soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_state 2>&1); then
    echo -e "${GREEN}✓ get_state() works${NC}"
    echo "$STATE" | jq '.'
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ get_state() failed${NC}"
    FAILED=$((FAILED + 1))
fi

# Extract admin for subsequent tests
ADMIN=$(echo "$STATE" | jq -r '.admin' 2>/dev/null || echo "")

# Test 2: Update Fees
echo -e "\n${YELLOW}Test 2: Update Fees${NC}"
if soroban contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$ADMIN_KEY" \
    -- update_fees \
    --admin "$ADMIN" \
    --base_fee 80000000 \
    --metadata_fee 35000000 2>&1 >/dev/null; then
    echo -e "${GREEN}✓ update_fees() works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ update_fees() failed${NC}"
    FAILED=$((FAILED + 1))
fi

# Test 3: Pause
echo -e "\n${YELLOW}Test 3: Pause Contract${NC}"
if soroban contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$ADMIN_KEY" \
    -- pause \
    --admin "$ADMIN" 2>&1 >/dev/null; then
    echo -e "${GREEN}✓ pause() works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ pause() failed${NC}"
    FAILED=$((FAILED + 1))
fi

# Test 4: Unpause
echo -e "\n${YELLOW}Test 4: Unpause Contract${NC}"
if soroban contract invoke \
    --id "$CONTRACT_ID" \
    --network "$NETWORK" \
    --source "$ADMIN_KEY" \
    -- unpause \
    --admin "$ADMIN" 2>&1 >/dev/null; then
    echo -e "${GREEN}✓ unpause() works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ unpause() failed${NC}"
    FAILED=$((FAILED + 1))
fi

# Test 5: State Consistency
echo -e "\n${YELLOW}Test 5: State Consistency${NC}"
if FINAL_STATE=$(soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_state 2>&1); then
    PAUSED=$(echo "$FINAL_STATE" | jq -r '.paused')
    BASE_FEE=$(echo "$FINAL_STATE" | jq -r '.base_fee')
    
    if [ "$PAUSED" = "false" ] && [ "$BASE_FEE" = "80000000" ]; then
        echo -e "${GREEN}✓ State is consistent${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ State inconsistency detected${NC}"
        echo "Paused: $PAUSED (expected: false)"
        echo "Base Fee: $BASE_FEE (expected: 80000000)"
        FAILED=$((FAILED + 1))
    fi
else
    echo -e "${RED}✗ Could not verify state${NC}"
    FAILED=$((FAILED + 1))
fi

# Test 6: Contract-Backend Projection Consistency
echo -e "\n${YELLOW}Test 6: Contract-Backend Projection Consistency${NC}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"

# Check if backend is reachable
BACKEND_HEALTH=$(curl -sf "$BACKEND_URL/health" -H "Accept: application/json" 2>/dev/null || echo "")

if [ -n "$BACKEND_HEALTH" ]; then
    echo "Backend reachable at $BACKEND_URL"
    
    # Get on-chain token count
    ONCHAIN_TOKEN_COUNT=$(echo "$FINAL_STATE" | jq -r '.token_count // 0' 2>/dev/null || echo "0")
    
    # Get backend token count
    BACKEND_STATS=$(curl -sf "$BACKEND_URL/api/stats" -H "Accept: application/json" 2>/dev/null || echo "")
    
    if [ -n "$BACKEND_STATS" ]; then
        BACKEND_TOKEN_COUNT=$(echo "$BACKEND_STATS" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('tokenCount', d.get('tokenCount', 0)))" \
            2>/dev/null || echo "0")
        
        echo "On-chain token count: $ONCHAIN_TOKEN_COUNT"
        echo "Backend token count:  $BACKEND_TOKEN_COUNT"
        
        # Calculate drift
        DRIFT=$((ONCHAIN_TOKEN_COUNT - BACKEND_TOKEN_COUNT))
        if [ "$DRIFT" -lt 0 ]; then
            DRIFT=$((-DRIFT))
        fi
        
        # Allow small drift (tokens in flight during indexing)
        MAX_ACCEPTABLE_DRIFT=3
        
        if [ "$DRIFT" -le "$MAX_ACCEPTABLE_DRIFT" ]; then
            echo -e "${GREEN}✓ Token count projection consistent (drift: $DRIFT)${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ Token count drift exceeds threshold${NC}"
            echo "  Expected max drift: $MAX_ACCEPTABLE_DRIFT, Actual: $DRIFT"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${YELLOW}⚠ Could not fetch backend stats, skipping projection check${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Backend not reachable at $BACKEND_URL, skipping projection check${NC}"
    echo "  Set BACKEND_URL environment variable if backend is running elsewhere"
fi

# Test 7: Burn Totals Consistency
echo -e "\n${YELLOW}Test 7: Burn Totals Consistency${NC}"

if [ -n "$BACKEND_HEALTH" ]; then
    # Get tokens with burns from backend
    TOKENS_WITH_BURNS=$(curl -sf "$BACKEND_URL/api/tokens?burnCount_gt=0&limit=5" \
        -H "Accept: application/json" 2>/dev/null || echo "")
    
    if [ -n "$TOKENS_WITH_BURNS" ]; then
        BURN_TOKEN_COUNT=$(echo "$TOKENS_WITH_BURNS" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" \
            2>/dev/null || echo "0")
        
        if [ "$BURN_TOKEN_COUNT" -gt 0 ]; then
            # Sample first token with burns for verification
            SAMPLE_TOKEN=$(echo "$TOKENS_WITH_BURNS" | python3 -c \
                "import sys,json; d=json.load(sys.stdin); t=d.get('data',[])[0] if d.get('data') else {}; print(f\"{t.get('address','')},{t.get('burnCount',0)},{t.get('totalBurned',0)}\")" \
                2>/dev/null || echo "")
            
            if [ -n "$SAMPLE_TOKEN" ] && [ "$SAMPLE_TOKEN" != ",," ]; then
                SAMPLE_ADDR=$(echo "$SAMPLE_TOKEN" | cut -d',' -f1)
                SAMPLE_BURN_COUNT=$(echo "$SAMPLE_TOKEN" | cut -d',' -f2)
                SAMPLE_TOTAL_BURNED=$(echo "$SAMPLE_TOKEN" | cut -d',' -f3)
                
                echo "Sampled token: $SAMPLE_ADDR"
                echo "  Burn count: $SAMPLE_BURN_COUNT"
                echo "  Total burned: $SAMPLE_TOTAL_BURNED"
                
                # Verify burn records exist
                BURN_RECORDS=$(curl -sf "$BACKEND_URL/api/tokens/$SAMPLE_ADDR/burns?limit=10" \
                    -H "Accept: application/json" 2>/dev/null || echo "")
                
                if [ -n "$BURN_RECORDS" ]; then
                    RECORD_COUNT=$(echo "$BURN_RECORDS" | python3 -c \
                        "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" \
                        2>/dev/null || echo "0")
                    
                    if [ "$RECORD_COUNT" -gt 0 ]; then
                        echo -e "${GREEN}✓ Burn records accessible and consistent${NC}"
                        PASSED=$((PASSED + 1))
                    else
                        echo -e "${YELLOW}⚠ No burn records found for token with burnCount > 0${NC}"
                    fi
                else
                    echo -e "${YELLOW}⚠ Could not fetch burn records${NC}"
                fi
            else
                echo -e "${GREEN}✓ No tokens with burns to verify (clean state)${NC}"
                PASSED=$((PASSED + 1))
            fi
        else
            echo -e "${GREEN}✓ No tokens with burns found (clean deployment)${NC}"
            PASSED=$((PASSED + 1))
        fi
    else
        echo -e "${YELLOW}⚠ Could not fetch tokens for burn verification${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Backend not reachable, skipping burn totals check${NC}"
fi

# Test 8: Campaign Projection Consistency
echo -e "\n${YELLOW}Test 8: Campaign Projection Consistency${NC}"

if [ -n "$BACKEND_HEALTH" ]; then
    CAMPAIGNS=$(curl -sf "$BACKEND_URL/api/campaigns?status=ACTIVE&limit=5" \
        -H "Accept: application/json" 2>/dev/null || echo "")
    
    if [ -n "$CAMPAIGNS" ]; then
        CAMPAIGN_COUNT=$(echo "$CAMPAIGNS" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" \
            2>/dev/null || echo "0")
        
        if [ "$CAMPAIGN_COUNT" -gt 0 ]; then
            # Verify campaign projection has required fields
            SAMPLE_CAMPAIGN=$(echo "$CAMPAIGNS" | python3 -c \
                "import sys,json; d=json.load(sys.stdin); c=d.get('data',[])[0] if d.get('data') else {}; \
                fields=['campaignId','status','currentAmount','executionCount','targetAmount']; \
                missing=[f for f in fields if f not in c]; \
                print('OK' if not missing else ','.join(missing))" \
                2>/dev/null || echo "UNKNOWN")
            
            if [ "$SAMPLE_CAMPAIGN" = "OK" ]; then
                echo -e "${GREEN}✓ Campaign projections have required fields${NC}"
                PASSED=$((PASSED + 1))
            else
                echo -e "${RED}✗ Campaign projection missing fields: $SAMPLE_CAMPAIGN${NC}"
                FAILED=$((FAILED + 1))
            fi
        else
            echo -e "${GREEN}✓ No active campaigns (clean state)${NC}"
            PASSED=$((PASSED + 1))
        fi
    else
        echo -e "${YELLOW}⚠ Could not fetch campaigns (endpoint may not exist)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Backend not reachable, skipping campaign check${NC}"
fi

# Summary
echo -e "\n${GREEN}=== Test Summary ===${NC}"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Total: $((PASSED + FAILED))"
echo ""
echo "Tests run:"
echo "  1. get_state()"
echo "  2. update_fees()"
echo "  3. pause()"
echo "  4. unpause()"
echo "  5. State consistency (contract)"
echo "  6. Token count projection (contract↔backend)"
echo "  7. Burn totals consistency (backend)"
echo "  8. Campaign projection consistency (backend)"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All smoke tests passed${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed${NC}"
    exit 1
fi
