import { defineConfig } from 'vitest/config';

/**
 * Browser-mode Vitest config (real Chromium via Playwright) for the
 * console's component tests (`vitest-browser-react`), axe-core a11y
 * acceptance tests, and render-perf tests.
 *
 * NOTE: `tests/setup.ts` (the AxeBuilder helper module) is created by
 * Phase 2 task T036; this config references it ahead of that landing.
 * Running `test:component` / `test:a11y` / `test:perf` before T036 will
 * fail on the missing setup file by design.
 */
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
    },
    include: [
      'tests/component/**/*.test.tsx',
      'tests/a11y/**/*.test.ts',
      'tests/integration/perf.test.ts',
    ],
    setupFiles: ['./tests/setup.ts'],
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
