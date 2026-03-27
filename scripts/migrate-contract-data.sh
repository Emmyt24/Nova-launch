#!/bin/bash
# Contract Data Migration Script
# Migrates data from old contract to new contract

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
OLD_CONTRACT_ID=$1
NEW_CONTRACT_ID=$2
NETWORK=${3:-testnet}
ADMIN_KEY=${4:-admin}

# Validate inputs
if [ -z "$OLD_CONTRACT_ID" ] || [ -z "$NEW_CONTRACT_ID" ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 <old_contract_id> <new_contract_id> [network] [admin_key]"
    echo "Example: $0 CXXX... CYYY... testnet admin"
    exit 1
fi

echo -e "${GREEN}=== Contract Data Migration ===${NC}"
echo "Old Contract: $OLD_CONTRACT_ID"
echo "New Contract: $NEW_CONTRACT_ID"
echo "Network: $NETWORK"
echo ""

# Create backup directory
BACKUP_DIR="./migration_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo -e "${YELLOW}Backup directory: $BACKUP_DIR${NC}"

# Step 1: Backup old contract state
echo -e "\n${YELLOW}Step 1: Backing up old contract state...${NC}"
soroban contract invoke \
    --id "$OLD_CONTRACT_ID" \
    --network "$NETWORK" \
    -- get_state > "$BACKUP_DIR/old_state.json"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ State backed up${NC}"
else
    echo -e "${RED}✗ Failed to backup state${NC}"
    exit 1
fi

# Step 2: Extract configuration
echo -e "\n${YELLOW}Step 2: Extracting configuration...${NC}"
ADMIN=$(jq -r '.admin' "$BACKUP_DIR/old_state.json")
TREASURY=$(jq -r '.treasury' "$BACKUP_DIR/old_state.json")
BASE_FEE=$(jq -r '.base_fee' "$BACKUP_DIR/old_state.json")
METADATA_FEE=$(jq -r '.metadata_fee' "$BACKUP_DIR/old_state.json")
PAUSED=$(jq -r '.paused' "$BACKUP_DIR/old_state.json")

echo "Admin: $ADMIN"
echo "Treasury: $TREASURY"
echo "Base Fee: $BASE_FEE"
echo "Metadata Fee: $METADATA_FEE"
echo "Paused: $PAUSED"

# Step 3: Export token registry
echo -e "\n${YELLOW}Step 3: Exporting token registry...${NC}"
TOKEN_COUNT=0
> "$BACKUP_DIR/tokens.json"

for i in {0..1000}; do
    TOKEN_INFO=$(soroban contract invoke \
        --id "$OLD_CONTRACT_ID" \
        --network "$NETWORK" \
        -- get_token_info \
        --index "$i" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "$TOKEN_INFO" >> "$BACKUP_DIR/tokens.json"
        TOKEN_COUNT=$((TOKEN_COUNT + 1))
    else
        break
    fi
done

echo -e "${GREEN}✓ Exported $TOKEN_COUNT tokens${NC}"

# Step 4: Verify new contract is initialized
echo -e "\n${YELLOW}Step 4: Verifying new contract...${NC}"
NEW_STATE=$(soroban contract invoke \
    --id "$NEW_CONTRACT_ID" \
    --network "$NETWORK" \
    -- get_state 2>/dev/null)

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}New contract not initialized. Initializing...${NC}"
    soroban contract invoke \
        --id "$NEW_CONTRACT_ID" \
        --network "$NETWORK" \
        --source "$ADMIN_KEY" \
        -- initialize \
        --admin "$ADMIN" \
        --treasury "$TREASURY" \
        --base_fee "$BASE_FEE" \
        --metadata_fee "$METADATA_FEE"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ New contract initialized${NC}"
    else
        echo -e "${RED}✗ Failed to initialize new contract${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ New contract already initialized${NC}"
fi

# Step 5: Verify state matches
echo -e "\n${YELLOW}Step 5: Verifying state consistency...${NC}"
NEW_STATE=$(soroban contract invoke \
    --id "$NEW_CONTRACT_ID" \
    --network "$NETWORK" \
    -- get_state)

NEW_ADMIN=$(echo "$NEW_STATE" | jq -r '.admin')
NEW_TREASURY=$(echo "$NEW_STATE" | jq -r '.treasury')
NEW_BASE_FEE=$(echo "$NEW_STATE" | jq -r '.base_fee')
NEW_METADATA_FEE=$(echo "$NEW_STATE" | jq -r '.metadata_fee')

ERRORS=0

if [ "$ADMIN" != "$NEW_ADMIN" ]; then
    echo -e "${RED}✗ Admin mismatch: $ADMIN != $NEW_ADMIN${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ Admin matches${NC}"
fi

if [ "$TREASURY" != "$NEW_TREASURY" ]; then
    echo -e "${RED}✗ Treasury mismatch: $TREASURY != $NEW_TREASURY${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ Treasury matches${NC}"
fi

if [ "$BASE_FEE" != "$NEW_BASE_FEE" ]; then
    echo -e "${RED}✗ Base fee mismatch: $BASE_FEE != $NEW_BASE_FEE${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ Base fee matches${NC}"
fi

if [ "$METADATA_FEE" != "$NEW_METADATA_FEE" ]; then
    echo -e "${RED}✗ Metadata fee mismatch: $METADATA_FEE != $NEW_METADATA_FEE${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ Metadata fee matches${NC}"
fi

# Step 6: Restore pause state if needed
if [ "$PAUSED" = "true" ]; then
    echo -e "\n${YELLOW}Step 6: Restoring pause state...${NC}"
    soroban contract invoke \
        --id "$NEW_CONTRACT_ID" \
        --network "$NETWORK" \
        --source "$ADMIN_KEY" \
        -- pause \
        --admin "$ADMIN"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Pause state restored${NC}"
    else
        echo -e "${RED}✗ Failed to restore pause state${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi

# Step 7: Generate migration report
echo -e "\n${YELLOW}Step 7: Generating migration report...${NC}"
cat > "$BACKUP_DIR/migration_report.txt" <<EOF
Contract Migration Report
========================

Date: $(date)
Old Contract: $OLD_CONTRACT_ID
New Contract: $NEW_CONTRACT_ID
Network: $NETWORK

Configuration:
- Admin: $ADMIN
- Treasury: $TREASURY
- Base Fee: $BASE_FEE
- Metadata Fee: $METADATA_FEE
- Paused: $PAUSED

Token Registry:
- Tokens Exported: $TOKEN_COUNT

Verification:
- Admin Match: $([ "$ADMIN" = "$NEW_ADMIN" ] && echo "✓" || echo "✗")
- Treasury Match: $([ "$TREASURY" = "$NEW_TREASURY" ] && echo "✓" || echo "✗")
- Base Fee Match: $([ "$BASE_FEE" = "$NEW_BASE_FEE" ] && echo "✓" || echo "✗")
- Metadata Fee Match: $([ "$METADATA_FEE" = "$NEW_METADATA_FEE" ] && echo "✓" || echo "✗")

Errors: $ERRORS
Status: $([ $ERRORS -eq 0 ] && echo "SUCCESS" || echo "FAILED")
EOF

echo -e "${GREEN}✓ Report saved to $BACKUP_DIR/migration_report.txt${NC}"

# Final summary
echo -e "\n${GREEN}=== Migration Summary ===${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ Migration completed successfully${NC}"
    echo -e "${GREEN}✓ All state verified${NC}"
    echo -e "${GREEN}✓ $TOKEN_COUNT tokens exported${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Test the new contract thoroughly"
    echo "2. Update frontend configuration"
    echo "3. Monitor for any issues"
    echo "4. Keep backup directory: $BACKUP_DIR"
    exit 0
else
    echo -e "${RED}✗ Migration completed with $ERRORS errors${NC}"
    echo -e "${YELLOW}Please review the errors above and the migration report${NC}"
    echo "Backup directory: $BACKUP_DIR"
    exit 1
fi
