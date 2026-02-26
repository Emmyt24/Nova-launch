# Security Tests

This directory contains comprehensive security tests for the Nova Launch platform.

## Test Suites

### 1. XSS Prevention (`xss.test.ts`)
Tests for Cross-Site Scripting vulnerabilities.

**Coverage:**
- HTML injection
- Script injection
- Event handler injection
- JavaScript protocol URLs
- Data URL handling
- DOM-based XSS
- SVG-based XSS

**Run:** `npm test src/test/security/xss.test.ts`

### 2. Input Validation (`input-validation.test.ts`)
Tests for proper input validation and sanitization.

**Coverage:**
- Token parameter validation
- Amount validation
- Address validation
- File upload validation
- Injection prevention (SQL, command, path traversal)
- Integer overflow protection

**Run:** `npm test src/test/security/input-validation.test.ts`

### 3. Authentication & Authorization (`auth.test.ts`)
Tests for authentication and access control.

**Coverage:**
- Wallet authentication
- Transaction authorization
- Access control
- Session management
- CSRF protection
- Rate limiting

**Run:** `npm test src/test/security/auth.test.ts`

### 4. Secure Storage (`storage.test.ts`)
Tests for secure data storage and handling.

**Coverage:**
- LocalStorage security
- SessionStorage security
- Data encryption
- Data integrity
- Memory security
- Cookie security

**Run:** `npm test src/test/security/storage.test.ts`

## Running Tests

### All Security Tests
```bash
npm run test:security
```

### Watch Mode
```bash
npm run test:security:watch
```

### With Coverage
```bash
npm test src/test/security -- --coverage
```

### Individual Test Suite
```bash
npm test src/test/security/xss.test.ts
npm test src/test/security/input-validation.test.ts
npm test src/test/security/auth.test.ts
npm test src/test/security/storage.test.ts
```

## Test Statistics

- **Total Tests**: 78
- **Test Suites**: 4
- **Pass Rate**: 100%
- **Execution Time**: ~3.5s

## Adding New Tests

When adding new security tests:

1. **Choose the right suite**: Place tests in the appropriate file
2. **Follow patterns**: Use existing tests as templates
3. **Be specific**: Test one vulnerability per test
4. **Document**: Add clear descriptions
5. **Update docs**: Update this README

### Example Test

```typescript
describe('Security Feature', () => {
  it('should prevent specific vulnerability', () => {
    // Arrange
    const maliciousInput = '<script>alert("XSS")</script>';
    
    // Act
    const result = sanitize(maliciousInput);
    
    // Assert
    expect(result).not.toContain('<script>');
  });
});
```

## Security Checklist

Before deployment, ensure:

- [ ] All security tests passing
- [ ] No critical vulnerabilities
- [ ] Dependencies audited
- [ ] No exposed secrets
- [ ] Input validation implemented
- [ ] Output encoding implemented
- [ ] Authentication working
- [ ] Authorization enforced
- [ ] Secure storage used
- [ ] CSRF protection enabled

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Security Testing Guide](../../SECURITY_TESTING.md)
- [Security Policy](../../SECURITY.md)

## Reporting Issues

If you find a security vulnerability:

1. **Do not** create a public issue
2. Email: security@nova-launch.com
3. Include detailed reproduction steps
4. Allow time for fix before disclosure

---

**Last Updated**: 2026-02-26  
**Maintainer**: Security Team
