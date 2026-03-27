#!/bin/bash

# Contract Upgrade Script for Nova Launch
# Handles safe contract upgrades with state preservation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NETWORK="${1:-testnet}"
CONTRACT_WASM="${2:-target/wasm32-unknown-unknown/release/token_factory.wasm}"
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Nova Launch Contract Upgrade Tool   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Pre-upgrade checks
echo -e "${YELLOW}[1/7] Pre-upgrade Checks${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if contract WASM exists
if [ ! -f "$CONTRACT_WASM" ]; then
    echo -e "${RED}✗ Contract WASM not found: $CONTRACT_WASM${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Contract WASM found${NC}"

# Check network configuration
if [ "$NETWORK" != "testnet" ] && [ "$NETWORK" != "mainnet" ]; then
    echo -e "${RED}✗ Invalid network: $NETWORK${NC}"
    echo "  Usage: $0 [testnet|mainnet] [wasm_path]"
    exit 1
fi
echo -e "${GREEN}✓ Network: $NETWORK${NC}"

# Check Soroban CLI
if ! command -v soroban &> /dev/null; then
    echo -e "${RED}✗ Soroban CLI not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Soroban CLI available${NC}"

# Step 2: Backup current state
echo ""
echo -e "${YELLOW}[2/7] Backing Up Current State${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p "$BACKUP_DIR"

# Read current contract ID
if [ -f "deployment-${NETWORK}.json" ]; then
    CURRENT_CONTRACT=$(jq -r '.contract_id' "deployment-${NETWORK}.json")
    echo -e "${GREEN}✓ Current contract: $CURRENT_CONTRACT${NC}"
    
    # Backup deployment info
    cp "deployment-${NETWORK}.json" "$BACKUP_DIR/"
    echo -e "${GREEN}✓ Deployment info backed up${NC}"
    
    # Get current state
    echo "  Fetching current state..."
    soroban contract invoke \
        --id "$CURRENT_CONTRACT" \
        --network "$NETWORK" \
        -- get_state > "$BACKUP_DIR/state_before.json" 2>&1 || true
    echo -e "${GREEN}✓ State backed up to: $BACKUP_DIR${NC}"
else
    echo -e "${YELLOW}⚠ No existing deployment found${NC}"
fi

# Step 3: Build and optimize contract
echo ""
echo -e "${YELLOW}[3/7] Building Contract${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd contracts/token-factory
cargo build --target wasm32-unknown-unknown --release
echo -e "${GREEN}✓ Contract built${NC}"

soroban contract optimize \
    --wasm ../../$CONTRACT_WASM
echo -e "${GREEN}✓ Contract optimized${NC}"
cd ../..

# Step 4: Run upgrade tests
echo ""
echo -e "${YELLOW}[4/7] Running Upgrade Tests${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd contracts/token-factory
if cargo test upgrade_test --release; then
    echo -e "${GREEN}✓ All upgrade tests passed${NC}"
else
    echo -e "${RED}✗ Upgrade tests failed${NC}"
    echo -e "${YELLOW}  Aborting upgrade${NC}"
    exit 1
fi
cd ../..

# Step 5: Deploy new contract
echo ""
echo -e "${YELLOW}[5/7] Deploying New Contract${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$NETWORK" = "mainnet" ]; then
    echo -e "${RED}⚠ WARNING: Deploying to MAINNET${NC}"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Upgrade cancelled"
        exit 0
    fi
fi

NEW_CONTRACT=$(soroban contract deploy \
    --wasm "$CONTRACT_WASM" \
    --network "$NETWORK" \
    --source admin)

echo -e "${GREEN}✓ New contract deployed: $NEW_CONTRACT${NC}"

# Step 6: Verify new contract
echo ""
echo -e "${YELLOW}[6/7] Verifying New Contract${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test basic function
if soroban contract invoke \
    --id "$NEW_CONTRACT" \
    --network "$NETWORK" \
    -- get_state &> /dev/null; then
    echo -e "${GREEN}✓ New contract is functional${NC}"
else
    echo -e "${YELLOW}⚠ Contract not initialized yet${NC}"
fi

# Step 7: Update deployment info
echo ""
echo -e "${YELLOW}[7/7] Updating Deployment Info${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cat > "deployment-${NETWORK}.json" << EOF
{
  "contract_id": "$NEW_CONTRACT",
  "network": "$NETWORK",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "wasm_hash": "$(sha256sum $CONTRACT_WASM | cut -d' ' -f1)",
  "previous_contract": "${CURRENT_CONTRACT:-none}",
  "backup_location": "$BACKUP_DIR"
}
EOF

echo -e "${GREEN}✓ Deployment info updated${NC}"

# Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Upgrade Complete! ✓            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}New Contract ID:${NC} $NEW_CONTRACT"
echo -e "${GREEN}Network:${NC} $NETWORK"
echo -e "${GREEN}Backup Location:${NC} $BACKUP_DIR"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Initialize the new contract if needed"
echo "2. Update frontend environment variables"
echo "3. Test all functionality"
echo "4. Monitor for issues"
echo ""
echo -e "${YELLOW}Rollback:${NC}"
echo "  If issues occur, use: ./scripts/rollback-upgrade.sh $BACKUP_DIR"
echo ""
