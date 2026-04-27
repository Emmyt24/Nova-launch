import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // Run each file in its own worker to avoid cross-file memory pressure
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--max-old-space-size=512"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["*.ts"],
      exclude: ["vitest.config.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
