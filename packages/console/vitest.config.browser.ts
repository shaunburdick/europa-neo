import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode Vitest config (real Chromium via Playwright) for the
 * console's component tests (`vitest-browser-react`), axe-core a11y
 * acceptance tests, and render-perf tests.
 *
 * Vitest 4.1 note: `browser.provider` takes the provider FACTORY from
 * `@vitest/browser-playwright`, not the legacy `'playwright'` string.
 */
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // Vitest 4 requires explicit browser instances (single Chromium
      // project in v1, matching playwright.config.ts).
      instances: [{ browser: 'chromium' }],
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
