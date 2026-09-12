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
        // Brand integration tests (cross-surface, drift) require the console's
        // dist/ to exist — they verify byte-identity between design and consumer
        // packages. These are integration gates, not design source coverage, and
        // are already covered by the console-coverage CI job.
        exclude: ['tests/brand/cross-surface.test.ts', 'tests/brand/drift.test.ts'],
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
