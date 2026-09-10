import { defineConfig } from 'tsup';

/**
 * Production host launcher. Bundle its workspace closure so the final image
 * needs neither workspace source nor a package manager at runtime.
 */
export default defineConfig({
    entry: ['scripts/host.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node24',
    outDir: 'dist/host',
    // Console build has already emitted Vite and declaration artifacts into
    // dist; only add the host subdirectory without removing them.
    clean: false,
    splitting: false,
    sourcemap: false,
    dts: false,
    // ws is CommonJS internally. Provide its dynamic require bridge inside the
    // ESM host artifact rather than shipping node_modules in the runtime image.
    banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    noExternal: [/@europa\//, 'ws'],
});
