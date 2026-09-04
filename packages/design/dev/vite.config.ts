import { defineConfig } from 'vite';
import { resolve } from 'path';

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
