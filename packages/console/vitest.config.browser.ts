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
        // Host env does not reach browser-mode tests via `process` (there
        // is no process global in Chromium); `test.env` is injected into
        // `import.meta.env` instead. EUROPA_PERF_BUDGET_FACTOR multiplies
        // ONLY the perf suite's paint budget (unset → '' → factor 1, the
        // strict spec budget). See spec 005 Clarifications v1.1.
        env: {
            EUROPA_PERF_BUDGET_FACTOR: process.env.EUROPA_PERF_BUDGET_FACTOR ?? '',
        },
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            // Vitest 4 requires explicit browser instances (single Chromium
            // project in v1, matching playwright.config.ts).
            instances: [{ browser: 'chromium' }],
        },
        include: ['tests/component/**/*.test.tsx', 'tests/a11y/**/*.test.{ts,tsx}', 'tests/integration/perf.test.ts'],
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
