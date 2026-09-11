import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vite config for the Europa Neo console SPA.
 *
 * Workspace packages (`@europa/engine` etc.) are resolved through pnpm
 * workspace links to their built `dist/` output — no source aliases.
 * Every CI workflow builds workspace deps before building this package,
 * matching the engine/fog/terrain/networking/matchmaking precedent.
 *
 * The dev-server port is read from `EUROPA_E2E_PORT` (default 5173).
 * Playwright's config reads the same env var so both tools bind to the
 * same port — critical for parallel worktrees where 5173 may already
 * be taken. Set the env var per worktree:
 *
 *     EUROPA_E2E_PORT=5174 pnpm test:e2e
 */
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@test-fixtures': resolve(__dirname, 'tests/fixtures'),
        },
    },
    server: {
        port: Number(process.env.EUROPA_E2E_PORT || 5173),
    },
    build: {
        target: 'es2022',
        outDir: 'dist',
        rollupOptions: {
            output: {
                // Split vendor (React + Zustand) from console core so the
                // <150 KB gzipped initial-budget check (plan.md "Performance
                // Goals") can attribute bytes per chunk. Lazy sound chunks are
                // introduced with the audio runtime in a later phase.
                manualChunks: (id: string) => {
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                    return undefined;
                },
            },
        },
    },
});
