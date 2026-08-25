import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.bench.ts'],
        globals: false,
        passWithNoTests: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            // The gate covers the shipped logic core (src/) AND the drift
            // checker's gather/report modules (scripts/) — SC-006 requires
            // the script's gather/report logic to clear 80% on every metric.
            include: ['src/**/*.ts', 'scripts/**/*.ts'],
            exclude: [
                // Public barrel: pure re-exports, nothing to measure.
                'src/index.ts',
                // CLI entry point: its run() executes only in child processes
                // (spawn tests), which v8 coverage cannot observe — same
                // reasoning as the console config excluding DOM-bound modules.
                // Its behavior is pinned end-to-end by tests/integration/cli.test.ts.
                'scripts/check-version-drift.ts',
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
