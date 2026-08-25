import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        globals: false,
        passWithNoTests: true,
        // 10 s headroom for the integration suites (tick-determinism runs
        // two servers ≥100 ticks; SC-005 perf tests later need more).
        testTimeout: 10_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts', 'src/**/types.ts', 'src/contracts/**'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
