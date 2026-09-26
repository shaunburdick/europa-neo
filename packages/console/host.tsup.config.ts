import { defineConfig } from 'tsup';

/** Build the container's standalone Node host without cleaning Vite's SPA output. */
export default defineConfig({
    entry: ['scripts/host.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    outDir: 'dist/host',
    clean: false,
    dts: false,
    splitting: false,
    sourcemap: false,
    // The final image deliberately has no node_modules. Bundle the complete
    // server closure, including workspace packages and `ws`, into host.js.
    noExternal: [/.*/],
    // `ws` is CommonJS and retains a few dynamic requires when bundled. Give
    // the ESM entry a real Node require so those calls remain supported.
    banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
});
