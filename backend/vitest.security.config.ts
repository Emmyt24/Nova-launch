import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'security-tests',
    include: ['src/__tests__/security*.test.ts'],
    exclude: ['node_modules', 'dist'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/auth/**/*.ts',
        'src/services/**/*.ts',
        'src/middleware/**/*.ts',
        'src/lib/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        // Critical security code must have high coverage
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    // Fail fast on security test failures
    bail: 1,
    // Run tests sequentially to avoid race conditions in tests themselves
    sequence: {
      concurrent: false,
    },
    // Retry flaky tests once
    retry: 1,
    // Clear mocks between tests
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },
});
