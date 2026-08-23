import { defineConfig } from 'vitest/config';

/**
 * Node-mode Vitest config (happy-dom) for the console's unit tests:
 * the pure reducer, pure input math, and cross-module integration
 * tests (determinism, conformance). Component/a11y/perf tests run in
 * a real browser via `vitest.config.browser.ts` instead.
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*'],
      exclude: ['src/main.tsx', 'src/internal/**', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
