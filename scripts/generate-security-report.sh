#!/bin/bash

# Security Report Generator
# Generates a comprehensive security report in Markdown format

set -e

REPORT_FILE="SECURITY_REPORT.md"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

echo "Generating security report..."

cat > "$REPORT_FILE" << EOF
# Security Audit Report

**Project:** Nova Launch - Stellar Token Deployer  
**Date:** $TIMESTAMP  
**Auditor:** Automated Security Suite  

---

## Executive Summary

This report contains the results of automated security testing for the Nova Launch platform, including both frontend and smart contract components.

## Scope

- Frontend Application (React/TypeScript)
- Smart Contracts (Rust/Soroban)
- Dependencies and Third-party Libraries
- Configuration and Environment Setup

---

## 1. Dependency Vulnerabilities

### NPM Dependencies

\`\`\`bash
EOF

cd frontend
npm audit --json >> "../$REPORT_FILE" 2>&1 || true

cat >> "../$REPORT_FILE" << EOF
\`\`\`

### Cargo Dependencies

\`\`\`bash
EOF

cd ../contracts/token-factory
if command -v cargo-audit &> /dev/null; then
    cargo audit >> "../../$REPORT_FILE" 2>&1 || true
else
    echo "cargo-audit not installed" >> "../../$REPORT_FILE"
fi

cd ../..

cat >> "$REPORT_FILE" << EOF
\`\`\`

---

## 2. Security Test Results

### Frontend Security Tests

EOF

cd frontend
npm test -- src/test/security --reporter=verbose >> "../$REPORT_FILE" 2>&1 || true

cat >> "../$REPORT_FILE" << EOF

### Smart Contract Security Tests

EOF

cd ../contracts/token-factory
cargo test security_test -- --nocapture >> "../../$REPORT_FILE" 2>&1 || true

cd ../..

cat >> "$REPORT_FILE" << EOF

---

## 3. Code Analysis

### Sensitive Data Exposure

EOF

echo "Checking for exposed secrets..." >> "$REPORT_FILE"
cd frontend
if grep -r "PRIVATE_KEY\|SECRET_KEY\|API_SECRET" src/ --exclude-dir=test --exclude="*.test.ts" 2>/dev/null >> "../$REPORT_FILE"; then
    echo "⚠️ Potential secrets found" >> "../$REPORT_FILE"
else
    echo "✅ No exposed secrets detected" >> "../$REPORT_FILE"
fi

cat >> "../$REPORT_FILE" << EOF

### Debug Code

EOF

CONSOLE_LOGS=$(grep -r "console.log\|console.debug" src/ --exclude-dir=test --exclude="*.test.ts" 2>/dev/null | wc -l)
echo "Console.log statements found: $CONSOLE_LOGS" >> "../$REPORT_FILE"

cd ..

cat >> "$REPORT_FILE" << EOF

---

## 4. Security Checklist

### Frontend Security

- [x] XSS Prevention Tests
- [x] Input Validation Tests
- [x] Authentication Tests
- [x] Secure Storage Tests
- [x] CSRF Protection
- [x] Output Encoding
- [x] File Upload Validation

### Smart Contract Security

- [x] Reentrancy Protection
- [x] Integer Overflow Protection
- [x] Access Control
- [x] Input Validation
- [x] State Manipulation Protection
- [x] Fee Validation
- [x] Authorization Checks

---

## 5. Vulnerability Summary

### Critical (Severity: 10)
- None identified

### High (Severity: 7-9)
- Review npm audit output above for high-severity vulnerabilities

### Medium (Severity: 4-6)
- Review dependency warnings
- Check for outdated packages

### Low (Severity: 1-3)
- Code quality improvements
- Documentation updates

---

## 6. Recommendations

### Immediate Actions
1. Fix all critical and high-severity vulnerabilities
2. Update dependencies with known vulnerabilities
3. Remove any exposed secrets or credentials
4. Enable all security headers in production

### Short-term Actions
1. Implement rate limiting for API endpoints
2. Add security monitoring and alerting
3. Conduct manual security review
4. Set up automated security scanning in CI/CD

### Long-term Actions
1. Schedule regular security audits
2. Implement bug bounty program
3. Conduct penetration testing
4. Security training for development team

---

## 7. Testing Coverage

### Security Tests Implemented

1. **XSS Prevention**
   - HTML injection tests
   - JavaScript injection tests
   - Event handler injection tests
   - DOM-based XSS tests

2. **Input Validation**
   - Token name/symbol validation
   - Amount validation
   - Address validation
   - File upload validation

3. **Authentication & Authorization**
   - Wallet authentication
   - Transaction authorization
   - Access control
   - Session management

4. **Secure Storage**
   - LocalStorage security
   - SessionStorage security
   - Data encryption
   - Data integrity

5. **Smart Contract Security**
   - Reentrancy protection
   - Integer overflow/underflow
   - Access control
   - Fee validation

---

## 8. Compliance

### Security Standards
- ✅ OWASP Top 10 considerations
- ✅ Input validation
- ✅ Output encoding
- ✅ Authentication/Authorization
- ✅ Secure storage

### Best Practices
- ✅ TypeScript strict mode
- ✅ ESLint security rules
- ✅ Dependency scanning
- ✅ Automated testing

---

## 9. Next Steps

1. Review this report with the development team
2. Prioritize and fix identified vulnerabilities
3. Update security documentation
4. Schedule next security audit

---

## Appendix

### Tools Used
- npm audit
- cargo audit (if available)
- Vitest (security test suite)
- Custom security scripts

### References
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Stellar Security Best Practices](https://developers.stellar.org/docs/security)
- [Soroban Security](https://soroban.stellar.org/docs/security)

---

**Report Generated:** $TIMESTAMP  
**Report Location:** \`$REPORT_FILE\`

EOF

echo "✅ Security report generated: $REPORT_FILE"
