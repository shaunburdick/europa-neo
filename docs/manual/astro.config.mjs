import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import rehypeEuropaTables from './rehype-europa-tables.mjs';
import rehypeFixLinks from './rehype-fix-links.mjs';

export default defineConfig({
    site: 'https://shaunburdick.github.io',
    base: '/europa-neo',
    output: 'static',
    compressHTML: true,
    trailingSlash: 'always',
    integrations: [mdx(), react()],
    markdown: {
        processor: unified({
            rehypePlugins: [rehypeEuropaTables, rehypeFixLinks],
        }),
    },
});
