import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    esbuild: {
        jsx: 'automatic',
        jsxImportSource: 'react',
    },
    build: {
        outDir: resolve(import.meta.dirname, '../dist'),
        emptyDirOnBuild: false,
    },
});
