import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Merged-coverage config — Feature 005 (T094/T097).
 *
 * The console's logic core is covered by node-mode suites while its
 * DOM surface (render/, ui/, minimap) is only exercised in real
 * Chromium (component/a11y/perf). A single-environment coverage run
 * therefore sees roughly half the picture. This config defines BOTH
 * environments as Vitest projects so one `--coverage` session merges
 * their results into a single thresholded report
 * (constitution Principle III: ≥80% on every metric).
 *
 * `tests/integration/contract-conformance.test.ts` stays OUT of the
 * coverage session entirely: it imports `node:fs` (unavailable in
 * browser contexts) and reads `dist/`; it is a build-artifact gate,
 * not coverage subject matter.
 */
export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            include: ['src/**/*'],
            exclude: [
                'src/main.tsx',
                '**/*.d.ts',
                // Untestable: DOM-bound entry point exercised only by real-socket integration and E2E suites.
                'src/internal/live-runtime.tsx',
                // Untestable: DOM-bound production mount for /lobby, /match/:id routes.
                'src/internal/lobby-runtime.tsx',
                // Untestable: Dev-server demo mount — only exercised by the Vite dev server.
                'src/internal/demo-runtime.tsx',
                // Untestable: TanStack Router layout route — requires real router context + lobby state.
                'src/internal/lobby-layout.tsx',
                // Untestable: TanStack Router match layout — requires real router context + lobby state.
                'src/internal/match-layout.tsx',
                // Untestable: TanStack Router index route — requires real router context + lobby state.
                'src/internal/match-adaptive-route.tsx',
                // Untestable: TanStack Router join route — requires real router context + lobby state.
                'src/internal/match-join-route.tsx',
                // Untestable: TanStack Router spectate route — requires real router context + lobby state.
                'src/internal/match-spectate-route.tsx',
                // Untestable: TanStack Router profile route — requires real router context + lobby state.
                'src/internal/profile-route.tsx',
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
        projects: [
            {
                test: {
                    name: 'node',
                    environment: 'happy-dom',
                    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
                    exclude: [
                        // Browser-only: needs a real canvas 2D context.
                        'tests/integration/perf.test.ts',
                        // Node-builtin + dist-dependent build gate (see header).
                        'tests/integration/contract-conformance.test.ts',
                    ],
                },
            },
            {
                test: {
                    name: 'browser',
                    // Host env does not reach browser-mode tests via `process`
                    // (no process global in Chromium); `test.env` is injected
                    // into `import.meta.env`. EUROPA_PERF_BUDGET_FACTOR
                    // multiplies ONLY the perf suite's paint budget (unset →
                    // '' → factor 1, the strict spec budget). See spec 005
                    // Clarifications v1.1.
                    env: {
                        EUROPA_PERF_BUDGET_FACTOR: process.env.EUROPA_PERF_BUDGET_FACTOR ?? '',
                    },
                    browser: {
                        enabled: true,
                        provider: playwright(),
                        headless: true,
                        instances: [{ browser: 'chromium' }],
                    },
                    include: [
                        'tests/component/**/*.test.tsx',
                        'tests/a11y/**/*.test.{ts,tsx}',
                        // Perf timing tests are excluded from the coverage
                        // session: v8 instrumentation adds per-call overhead
                        // that inflates paint budgets. Q-P01 is already
                        // validated in the dedicated browser test suite
                        // (client-ci.yml "Test suites" job) without coverage.
                    ],
                    setupFiles: ['./tests/setup-web-components.ts'],
                },
            },
        ],
    },
});
