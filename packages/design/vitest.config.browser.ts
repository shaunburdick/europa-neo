import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode Vitest config (real Chromium via Playwright) for the
 * design package's React component integration tests (modal focus-trap,
 * Escape close, focus restore — FR-028). React components are rendered
 * with `vitest-browser-react` (imported in the test files).
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
            instances: [{ browser: 'chromium' }],
        },
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/components/*.integration.test.tsx'],
        passWithNoTests: true,
        coverage: {
            provider: 'v8',
            include: ['src/components/**'],
            exclude: ['**/*.d.ts'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
