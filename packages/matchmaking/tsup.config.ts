import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    // Never inline workspace packages into the bundle — the matchmaker
    // consumes them type-only (research.md §9); the host binary wires the
    // real implementations at runtime (plan.md §"Technical Context").
    external: ['@europa/engine', '@europa/terrain', '@europa/networking'],
});
