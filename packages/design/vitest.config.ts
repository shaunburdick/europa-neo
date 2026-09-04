import { defineConfig } from 'vitest/config';

/**
 * Node-mode Vitest config (happy-dom) for the design package's React
 * component unit tests. `@testing-library/jest-dom` matchers are loaded
 * via `tests/setup.ts`; the modal focus-trap integration tests run in a
 * real browser via `vitest.config.browser.ts` instead.
 */
export default defineConfig({
    test: {
        environment: 'happy-dom',
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/{brand,components}/**/*.test.{ts,tsx}', 'tests/*.test.{ts,tsx}'],
        passWithNoTests: true,
        coverage: {
            provider: 'v8',
            include: ['src/components/**/*.{ts,tsx}', 'src/brand/**/*.ts'],
            exclude: ['**/*.d.ts', 'src/brand/masters/**', 'src/brand/fonts/**', 'src/brand/preview.html'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
