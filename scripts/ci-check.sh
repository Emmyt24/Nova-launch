#!/bin/bash
# Local CI validation script
# Run this before pushing to ensure CI will pass

set -e

echo "🔍 Running local CI checks..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Function to run a check
run_check() {
    local name="$1"
    local command="$2"
    local dir="${3:-.}"
    
    echo -e "${YELLOW}▶ $name${NC}"
    if (cd "$dir" && eval "$command"); then
        echo -e "${GREEN}✓ $name passed${NC}"
        echo ""
    else
        echo -e "${RED}✗ $name failed${NC}"
        echo ""
        FAILED=1
    fi
}

# Rust checks
echo "=== Rust Contract Checks ==="
run_check "Rust formatting" "cargo fmt --check" "contracts/token-factory"
run_check "Rust clippy" "cargo clippy --lib -- -D warnings" "contracts/token-factory"
run_check "Rust tests" "cargo test --lib" "contracts/token-factory"
run_check "Rust build (wasm)" "cargo build --release --target wasm32-unknown-unknown" "contracts/token-factory"

# Frontend checks
echo "=== Frontend Checks ==="
run_check "Frontend dependencies" "npm ci" "frontend"
run_check "Frontend linting" "npm run lint" "frontend"
run_check "Frontend tests" "npm test -- --run" "frontend"
run_check "Frontend build" "npm run build" "frontend"

# Backend migration compatibility checks
echo "=== Backend Migration Compatibility Checks ==="
run_check "Backend dependencies" "npm ci" "backend"
run_check "Backend migration compatibility tests" "npm run test:migration-compatibility" "backend"

# Spec validation
echo "=== Spec Validation ==="
if [ -d ".nova/specs" ]; then
    echo -e "${YELLOW}▶ Validating spec files${NC}"
    SPEC_VALID=1
    for spec_dir in .nova/specs/*/; do
        if [ -d "$spec_dir" ]; then
            spec_name=$(basename "$spec_dir")
            echo "  Checking spec: $spec_name"
            
            if [ ! -f "${spec_dir}requirements.md" ]; then
                echo -e "${RED}  ✗ Missing requirements.md in $spec_name${NC}"
                SPEC_VALID=0
            fi
            
            if [ ! -f "${spec_dir}design.md" ]; then
                echo -e "${RED}  ✗ Missing design.md in $spec_name${NC}"
                SPEC_VALID=0
            fi
            
            if [ ! -f "${spec_dir}tasks.md" ]; then
                echo -e "${RED}  ✗ Missing tasks.md in $spec_name${NC}"
                SPEC_VALID=0
            fi
        fi
    done
    
    if [ $SPEC_VALID -eq 1 ]; then
        echo -e "${GREEN}✓ Spec validation passed${NC}"
    else
        echo -e "${RED}✗ Spec validation failed${NC}"
        FAILED=1
    fi
    echo ""
else
    echo -e "${YELLOW}⚠ No specs directory found, skipping validation${NC}"
    echo ""
fi

# Integration gate (ABI + contract ID format only — no live network needed in CI)
echo "=== Integration Gate (Static Checks) ==="
run_check "Contract ABI completeness" "
  ABI_FILE=src/contracts/factoryAbi.ts
  FAIL=0
  for method in create_token burn set_metadata mint_tokens get_state get_base_fee get_metadata_fee; do
    grep -q \"\$method\" \"\$ABI_FILE\" || { echo \"ABI missing: \$method\"; FAIL=1; }
  done
  exit \$FAIL
" "frontend"

# Summary
echo "=== Summary ==="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready to push.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please fix the issues before pushing.${NC}"
    exit 1
fi
