import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    webServer: {
        command: 'pnpm dev',
        port: 4321,
        reuseExistingServer: true,
    },
});
