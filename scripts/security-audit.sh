#!/bin/bash

# Security Audit Script for Nova Launch
# Runs comprehensive security checks on frontend and smart contracts

set -e

echo "🔒 Nova Launch Security Audit"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
CRITICAL_ISSUES=0
HIGH_ISSUES=0
MEDIUM_ISSUES=0
LOW_ISSUES=0

# Function to print section headers
print_section() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Function to print results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
    fi
}

# 1. NPM Audit
print_section "1. NPM Dependency Audit"
cd frontend
if npm audit --audit-level=moderate; then
    print_result 0 "No moderate or higher vulnerabilities found"
else
    AUDIT_EXIT=$?
    print_result 1 "Vulnerabilities found in dependencies"
    if [ $AUDIT_EXIT -eq 1 ]; then
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    fi
fi

# 2. Run Security Tests
print_section "2. Security Test Suite"
if npm test -- src/test/security; then
    print_result 0 "All security tests passed"
else
    print_result 1 "Security tests failed"
    HIGH_ISSUES=$((HIGH_ISSUES + 1))
fi

# 3. Check for Sensitive Data
print_section "3. Sensitive Data Check"
echo "Checking for exposed secrets..."

SECRETS_FOUND=0

# Check for common secret patterns
if grep -r "PRIVATE_KEY\|SECRET_KEY\|API_SECRET" src/ --exclude-dir=test --exclude="*.test.ts" 2>/dev/null; then
    echo -e "${RED}⚠ Found potential secrets in code${NC}"
    SECRETS_FOUND=1
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi

# Check for hardcoded credentials
if grep -r "password\s*=\|apiKey\s*=" src/ --exclude-dir=test --exclude="*.test.ts" 2>/dev/null; then
    echo -e "${YELLOW}⚠ Found potential hardcoded credentials${NC}"
    SECRETS_FOUND=1
    HIGH_ISSUES=$((HIGH_ISSUES + 1))
fi

if [ $SECRETS_FOUND -eq 0 ]; then
    print_result 0 "No exposed secrets found"
fi

# 4. Check Environment Variables
print_section "4. Environment Configuration"
if [ -f .env ]; then
    echo -e "${YELLOW}⚠ .env file found (should not be committed)${NC}"
    MEDIUM_ISSUES=$((MEDIUM_ISSUES + 1))
else
    print_result 0 ".env file not present in repository"
fi

if [ -f .env.example ]; then
    print_result 0 ".env.example file present"
else
    echo -e "${YELLOW}⚠ .env.example file missing${NC}"
    LOW_ISSUES=$((LOW_ISSUES + 1))
fi

# 5. TypeScript Strict Mode
print_section "5. TypeScript Configuration"
if grep -q '"strict": true' tsconfig.json; then
    print_result 0 "TypeScript strict mode enabled"
else
    echo -e "${YELLOW}⚠ TypeScript strict mode not enabled${NC}"
    MEDIUM_ISSUES=$((MEDIUM_ISSUES + 1))
fi

# 6. Check for Console Logs
print_section "6. Debug Code Check"
CONSOLE_LOGS=$(grep -r "console.log\|console.debug" src/ --exclude-dir=test --exclude="*.test.ts" | wc -l)
if [ $CONSOLE_LOGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ Found $CONSOLE_LOGS console.log statements${NC}"
    LOW_ISSUES=$((LOW_ISSUES + 1))
else
    print_result 0 "No debug console statements found"
fi

# 7. Check for TODO/FIXME
print_section "7. Code Quality Check"
TODO_COUNT=$(grep -r "TODO\|FIXME" src/ --exclude-dir=test | wc -l)
if [ $TODO_COUNT -gt 0 ]; then
    echo -e "${YELLOW}ℹ Found $TODO_COUNT TODO/FIXME comments${NC}"
fi

# 8. Smart Contract Security
print_section "8. Smart Contract Security"
cd ../contracts/token-factory

echo "Running contract tests..."
if cargo test security_test; then
    print_result 0 "Contract security tests passed"
else
    print_result 1 "Contract security tests failed"
    HIGH_ISSUES=$((HIGH_ISSUES + 1))
fi

# 9. Check for Unsafe Code
print_section "9. Unsafe Code Check"
UNSAFE_COUNT=$(grep -r "unsafe" src/ --exclude-dir=test | wc -l)
if [ $UNSAFE_COUNT -gt 0 ]; then
    echo -e "${YELLOW}⚠ Found $UNSAFE_COUNT unsafe blocks${NC}"
    MEDIUM_ISSUES=$((MEDIUM_ISSUES + 1))
else
    print_result 0 "No unsafe code blocks found"
fi

# 10. Dependency Audit (Cargo)
print_section "10. Cargo Dependency Audit"
if command -v cargo-audit &> /dev/null; then
    if cargo audit; then
        print_result 0 "No vulnerabilities in Rust dependencies"
    else
        print_result 1 "Vulnerabilities found in Rust dependencies"
        HIGH_ISSUES=$((HIGH_ISSUES + 1))
    fi
else
    echo -e "${YELLOW}ℹ cargo-audit not installed (run: cargo install cargo-audit)${NC}"
fi

# Summary
cd ../..
print_section "Security Audit Summary"

echo "Critical Issues: $CRITICAL_ISSUES"
echo "High Issues: $HIGH_ISSUES"
echo "Medium Issues: $MEDIUM_ISSUES"
echo "Low Issues: $LOW_ISSUES"
echo ""

TOTAL_ISSUES=$((CRITICAL_ISSUES + HIGH_ISSUES + MEDIUM_ISSUES + LOW_ISSUES))

if [ $CRITICAL_ISSUES -gt 0 ]; then
    echo -e "${RED}❌ CRITICAL ISSUES FOUND - Must be fixed immediately${NC}"
    exit 1
elif [ $HIGH_ISSUES -gt 0 ]; then
    echo -e "${YELLOW}⚠ HIGH PRIORITY ISSUES - Should be fixed before deployment${NC}"
    exit 1
elif [ $MEDIUM_ISSUES -gt 0 ]; then
    echo -e "${YELLOW}⚠ MEDIUM PRIORITY ISSUES - Should be addressed${NC}"
    exit 0
elif [ $LOW_ISSUES -gt 0 ]; then
    echo -e "${GREEN}✓ Only low priority issues found${NC}"
    exit 0
else
    echo -e "${GREEN}✅ No security issues found!${NC}"
    exit 0
fi
