import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for @europa/matchmaking (feature 006).
 *
 * Coverage thresholds enforce constitution Principle III: ≥80% on every
 * metric (lines / functions / branches / statements) over game logic is
 * a merge gate, not an aspiration. `src/index.ts` is a pure re-export
 * barrel and `src/internal/**` holds server-only record shapes exercised
 * through their factories — both are excluded per tasks.md T007.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/quickstart/**/*.test.ts',
      'tests/conformance.test.ts',
      'tests/soak.test.ts',
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
      exclude: ['src/index.ts', 'src/internal/**', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
