import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/components/index.ts', 'src/brand/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    target: 'es2022',
    // React is a peer dependency (Q3) — never bundle it. Consumers
    // (console, manual) provide their own React runtime.
    external: ['react', 'react-dom'],
});
