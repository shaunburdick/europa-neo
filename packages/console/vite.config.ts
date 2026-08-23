import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vite config for the Europa Neo console SPA.
 *
 * Workspace packages (`@europa/engine` etc.) are resolved through pnpm
 * workspace links to their built `dist/` output — no source aliases.
 * Every CI workflow builds workspace deps before building this package,
 * matching the engine/fog/terrain/networking/matchmaking precedent.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
