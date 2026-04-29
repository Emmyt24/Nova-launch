#!/bin/bash

##
# ABI Snapshot Test Verification Guide
#
# This script provides commands to test each snapshot test scenario:
# 1. Renamed method detection
# 2. Parameter reordering detection
# 3. Method removal detection
# 4. Additive changes approval
#
# Usage: Source this file and run the example commands, OR just read through
#        the examples to understand how to verify the snapshot tests work.
##

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}ABI Snapshot Test Verification Guide${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# ============================================================================
# Test 1: Verify current snapshot passes
# ============================================================================

echo -e "${YELLOW}TEST 1: Verify Current Snapshot Passes${NC}"
echo "Run this to verify the baseline is working:"
echo ""
echo -e "  ${GREEN}cd frontend${NC}"
echo -e "  ${GREEN}npm run test:contracts:abi${NC}"
echo ""
echo "Expected result: ✓ All tests pass"
echo ""

# ============================================================================
# Test 2: Renamed Method Detection
# ============================================================================

echo -e "${YELLOW}TEST 2: Detect Renamed Method${NC}"
echo "This test renames a method and verifies the snapshot catches it."
echo ""
echo "Setup:"
echo -e "  ${BLUE}1. Make a backup:${NC}"
echo "     cp contracts/token-factory/src/lib.rs lib.rs.backup"
echo ""
echo -e "  ${BLUE}2. Edit contracts/token-factory/src/lib.rs${NC}"
echo "     Find: pub fn transfer_admin(env: Env, new_admin: Address)"
echo "     Replace: pub fn transfer_admin_renamed(env: Env, new_admin: Address)"
echo "     (Around line 241)"
echo ""
echo "Run test:"
echo -e "  ${GREEN}node scripts/extract-contract-interface.js${NC}"
echo -e "  ${GREEN}cd frontend${NC}"
echo -e "  ${GREEN}npm run test:contracts:abi${NC}"
echo ""
echo "Expected result:"
echo -e "  ${RED}❌ FAIL${NC} with error:"
echo "  'FACTORY_METHODS.transfer_admin = \"transfer_admin\" — not found'"
echo ""
echo "Cleanup:"
echo "  mv lib.rs.backup contracts/token-factory/src/lib.rs"
echo ""

# ============================================================================
# Test 3: Parameter Reordering Detection
# ============================================================================

echo -e "${YELLOW}TEST 3: Detect Parameter Reordering${NC}"
echo "This test reorders parameters and verifies the snapshot catches it."
echo ""
echo "Setup:"
echo -e "  ${BLUE}1. Make a backup:${NC}"
echo "     cp contracts/token-factory/src/lib.rs lib.rs.backup"
echo ""
echo -e "  ${BLUE}2. Edit contracts/token-factory/src/lib.rs${NC}"
echo "     Find: pub fn burn(env: Env, caller: Address, token_index: u32, amount: i128)"
echo "     Replace: pub fn burn(env: Env, token_index: u32, caller: Address, amount: i128)"
echo "     (Around line 958, swap caller and token_index)"
echo ""
echo "Run test:"
echo -e "  ${GREEN}node scripts/extract-contract-interface.js${NC}"
echo -e "  ${GREEN}cd frontend${NC}"
echo -e "  ${GREEN}npm run test:contracts:abi${NC}"
echo ""
echo "Expected result:"
echo -e "  ${RED}❌ FAIL${NC} with parameter order verification"
echo ""
echo "Cleanup:"
echo "  mv lib.rs.backup contracts/token-factory/src/lib.rs"
echo ""

# ============================================================================
# Test 4: Method Removal Detection
# ============================================================================

echo -e "${YELLOW}TEST 4: Detect Method Removal${NC}"
echo "This test removes a method and verifies the snapshot catches it."
echo ""
echo "Setup:"
echo -e "  ${BLUE}1. Make a backup:${NC}"
echo "     cp contracts/token-factory/src/lib.rs lib.rs.backup"
echo ""
echo -e "  ${BLUE}2. Edit contracts/token-factory/src/lib.rs${NC}"
echo "     Find and comment out: pub fn admin_burn(...) { ... }"
echo "     (Around line 1032, comment the entire function)"
echo ""
echo "Run test:"
echo -e "  ${GREEN}node scripts/extract-contract-interface.js${NC}"
echo -e "  ${GREEN}cd frontend${NC}"
echo -e "  ${GREEN}npm run test:contracts:abi${NC}"
echo ""
echo "Expected result:"
echo -e "  ${RED}❌ FAIL${NC} with error:"
echo "  'BREAKING CHANGE: Methods removed from contract:'"
echo "  '  • admin_burn (referenced in FACTORY_METHODS)'"
echo ""
echo "Cleanup:"
echo "  mv lib.rs.backup contracts/token-factory/src/lib.rs"
echo ""

# ============================================================================
# Test 5: Additive Changes Approval
# ============================================================================

echo -e "${YELLOW}TEST 5: Approve Additive Changes${NC}"
echo "This test adds a new method and verifies the snapshot allows it."
echo ""
echo "Setup:"
echo -e "  ${BLUE}1. Make a backup:${NC}"
echo "     cp contracts/token-factory/src/lib.rs lib.rs.backup"
echo ""
echo -e "  ${BLUE}2. Edit contracts/token-factory/src/lib.rs${NC}"
echo "     Add a new public function to the TokenFactory impl block:"
echo ""
echo "     pub fn my_new_feature(env: Env) -> bool {"
echo "       true"
echo "     }"
echo ""
echo "Run test:"
echo -e "  ${GREEN}node scripts/extract-contract-interface.js${NC}"
echo -e "  ${GREEN}cd frontend${NC}"
echo -e "  ${GREEN}npm run test:contracts:abi${NC}"
echo ""
echo "Expected result:"
echo -e "  ${GREEN}✓ PASS${NC} with informational output:"
echo "  '✅ Additive changes detected (1 new methods):'"
echo "  '   • my_new_feature (1 params) [line XXXX]'"
echo ""
echo "Cleanup:"
echo "  mv lib.rs.backup contracts/token-factory/src/lib.rs"
echo ""

# ============================================================================
# Test 6: Snapshot Update Workflow
# ============================================================================

echo -e "${YELLOW}TEST 6: Snapshot Update Workflow${NC}"
echo "This test demonstrates how to update snapshot after approved changes."
echo ""
echo "Scenario: You've added a new method 'my_new_feature' and want to approve it"
echo ""
echo "Steps:"
echo -e "  ${BLUE}1. Verify change is additive (test passes):${NC}"
echo "     npm run test:contracts:abi"
echo ""
echo -e "  ${BLUE}2. Update snapshot with new method:${NC}"
echo "     npm run test:contracts:abi:update"
echo ""
echo -e "  ${BLUE}3. Review changes:${NC}"
echo "     git diff frontend/src/contracts/__tests__/__snapshots__"
echo ""
echo -e "  ${BLUE}4. Commit snapshot update:${NC}"
echo "     git add frontend/src/contracts/__tests__/__snapshots__"
echo "     git commit -m \"test: update contract ABI snapshot\""
echo ""
echo -e "  ${BLUE}5. Optionally add to FACTORY_METHODS if frontend needs it:${NC}"
echo "     # Edit frontend/src/contracts/factoryAbi.ts"
echo "     my_new_feature: 'my_new_feature',"
echo ""

# ============================================================================
# Test 7: CI Pipeline Integration
# ============================================================================

echo -e "${YELLOW}TEST 7: CI Pipeline Integration${NC}"
echo "The snapshot tests are integrated into the CI pipeline:"
echo ""
echo -e "  ${BLUE}1. Run full CI check:${NC}"
echo "     ./scripts/ci-check.sh"
echo ""
echo "    This will:"
echo "    • Stage 1: Build & Lint (cargo fmt, clippy, build)"
echo "    • Stage 2: ABI Snapshot Tests"
echo "      - Generate snapshot: node scripts/extract-contract-interface.js"
echo "      - Run tests: npm run test:contracts:abi"
echo "    • Stage 3: Security Audit (cargo-audit)"
echo "    • Stage 4: Testing & Coverage (cargo test, tarpaulin)"
echo "    • Stage 5: Deployment Simulation"
echo ""

# ============================================================================
# Test 8: Manual Testing in Watch Mode
# ============================================================================

echo -e "${YELLOW}TEST 8: Manual Testing in Watch Mode${NC}"
echo "For development, you can use watch mode for rapid feedback:"
echo ""
echo -e "  ${GREEN}cd frontend${NC}"
echo -e "  ${GREEN}npm run test:contracts:abi:watch${NC}"
echo ""
echo "This will re-run tests whenever files change, great for:"
echo "• Iterating on contract changes"
echo "• Debugging snapshot issues"
echo "• Verifying fixes before committing"
echo ""

# ============================================================================
# Advanced: Examining Snapshot Files
# ============================================================================

echo -e "${YELLOW}ADVANCED: Examining Snapshot Files${NC}"
echo ""
echo -e "  ${BLUE}1. View contract interface snapshot:${NC}"
echo "     cat build/contract-interface.snapshot.json | head -50"
echo ""
echo -e "  ${BLUE}2. View frontend snapshot directory:${NC}"
echo "     ls -la frontend/src/contracts/__tests__/__snapshots__/"
echo ""
echo -e "  ${BLUE}3. Compare snapshots between branches:${NC}"
echo "     git diff main..feature-branch -- build/contract-interface.snapshot.json"
echo ""
echo -e "  ${BLUE}4. Count exported functions:${NC}"
echo "     cat build/contract-interface.snapshot.json | jq '.functionCount'"
echo ""

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Verification guide complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
