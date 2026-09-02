import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode Vitest config (real Chromium via Playwright) for the
 * design package's browser integration tests (modal focus-trap, button
 * click retargeting / form submission).
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
        include: ['tests/components/*.integration.test.ts'],
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
