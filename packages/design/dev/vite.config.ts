import { defineConfig } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    esbuild: {
        jsx: 'automatic',
        jsxImportSource: 'react',
    },
});
