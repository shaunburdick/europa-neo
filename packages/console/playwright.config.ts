import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the Europa Neo console.
 *
 * Single Chromium project in v1 (cross-browser is v2). The webServer
 * block boots the Vite dev server so scripted-match scenarios run
 * against the real SPA. Browsers must be installed once via
 * `pnpm exec playwright install chromium` before running `test:e2e`.
 *
 * Port coordination: both this config and vite.config.ts read
 * `EUROPA_E2E_PORT` (default 5173). For parallel worktrees, set the
 * env var per worktree to avoid port collisions:
 *
 *     EUROPA_E2E_PORT=5174 pnpm test:e2e
 */

const PORT = Number(process.env.EUROPA_E2E_PORT || 5173);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: BASE,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'pnpm dev --host 127.0.0.1',
        url: BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
