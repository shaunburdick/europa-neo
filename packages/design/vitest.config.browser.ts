import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode Vitest config (real Chromium via Playwright) for the
 * design package's modal focus-trap integration tests.
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
        include: ['tests/components/modal.integration.test.ts'],
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