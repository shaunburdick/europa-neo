import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import rehypeEuropaTables from './rehype-europa-tables.mjs';

export default defineConfig({
    site: 'https://shaunburdick.github.io',
    base: '/europa-neo',
    output: 'static',
    integrations: [mdx()],
    markdown: {
        rehypePlugins: [rehypeEuropaTables],
    },
});
