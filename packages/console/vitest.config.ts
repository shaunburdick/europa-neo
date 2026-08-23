import { defineConfig } from 'vitest/config';

/**
 * Node-mode Vitest config (happy-dom) for the console's unit tests:
 * the pure reducer, pure input math, and cross-module integration
 * tests (determinism, conformance). Component/a11y/perf tests run in
 * a real browser via `vitest.config.browser.ts` instead.
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Browser-only suites live under the browser config
    // (vitest.config.browser.ts): happy-dom has no real canvas 2D.
    exclude: ['tests/integration/perf.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      // Constitution III gate applies to the LOGIC CORE (quickstart
      // §3: reducer/input mapping ~100%, renderer ≥60% via the
      // browser suites). DOM-bound modules (render/, ui/,
      // qol/minimap) are exercised by test:component / test:a11y /
      // test:e2e in real Chromium and are excluded here — see spec
      // Implementation Notes.
      include: [
        'src/state/**',
        'src/input/**',
        'src/net/**',
        'src/a11y/**',
        'src/qol/hotkeys.ts',
        'src/qol/preferences.ts',
        'src/qol/reduced-motion.ts',
        'src/qol/zoom.ts',
        'src/runtime.ts',
        'src/create-console.ts',
        'src/config.ts',
      ],
      exclude: ['src/main.tsx', 'src/internal/**', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
