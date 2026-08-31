import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/components/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    target: 'es2022',
});
