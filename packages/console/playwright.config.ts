import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the Europa Neo console.
 *
 * Single Chromium project in v1 (cross-browser is v2). The webServer
 * block boots the Vite dev server so scripted-match scenarios run
 * against the real SPA. Browsers must be installed once via
 * `pnpm exec playwright install chromium` before running `test:e2e`.
 */
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://127.0.0.1:5173',
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
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
