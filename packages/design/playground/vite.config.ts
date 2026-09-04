import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    esbuild: {
        jsx: 'automatic',
        jsxImportSource: 'react',
    },
});
