import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.js'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
