import { defineConfig } from 'vitest/config';

/**
 * Node-mode Vitest config (happy-dom) for the design package's web
 * component unit + conformance tests. The modal focus-trap integration
 * tests run in a real browser via `vitest.config.browser.ts` instead.
 */
export default defineConfig({
    test: {
        environment: 'happy-dom',
        setupFiles: ['./tests/setup-element-internals.ts'],
        include: ['tests/{brand,components}/**/*.test.ts'],
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
