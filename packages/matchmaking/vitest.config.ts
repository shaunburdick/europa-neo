import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for @europa/matchmaking (feature 006).
 *
 * Coverage thresholds enforce constitution Principle III: ≥80% on every
 * metric (lines / functions / branches / statements) over game logic is
 * a merge gate, not an aspiration. `src/index.ts` is a pure re-export
 * barrel and is excluded per tasks.md T007.
 *
 * Feature 010 R-008 removed the former blanket `src/internal/**`
 * exclusion: that directory now holds feature-010 logic (handle
 * validation, guest identity registry, lobby facade, publication) that
 * must count toward the gate. Its record-shape factories
 * (`matchRecord.ts`, `playerSession.ts`, `seatRecord.ts`,
 * `guestPlayerIdentity.ts`) stay measured too — they are exercised
 * through every service-path test, so no carve-out is warranted.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/quickstart/**/*.test.ts',
            'tests/conformance.test.ts',
            'tests/soak.test.ts',
            'tests/lobby-conformance.test.ts',
        ],
        globals: false,
        passWithNoTests: true,
        // Headroom for later soak/conformance suites (SC-005 runs 50
        // sequential create/play/finish cycles).
        testTimeout: 10_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts', '**/*.d.ts'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
