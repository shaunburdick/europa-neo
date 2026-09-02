/**
 * rehype-fix-links.mjs
 *
 * Astro does NOT rewrite relative markdown links for the `base` config — what
 * you write is what appears in the HTML.  With `base: '/europa-neo'`, every
 * page except index.mdx is output at depth 2 (e.g. /europa-neo/pipes/index.html),
 * so `./lobby` from pipes resolves to /europa-neo/pipes/lobby — a 404.
 *
 * This plugin walks every <a> element and, for relative links starting with
 * "./", rewrites the href based on the current page's output depth:
 *
 *   index.mdx  → /europa-neo/index.html      (depth 1) → ./foo stays ./foo
 *   pipes.mdx  → /europa-neo/pipes/index.html (depth 2) → ./foo becomes ../foo
 *
 * Because the site is flat (no nested page directories), the only two depths
 * that matter are 1 and 2.
 */

import { visit } from 'unist-util-visit';

/**
 * Determine the output depth of a page from its source path.
 *
 * In Astro's flat src/pages/ layout:
 *   index.mdx      → /europa-neo/index.html              (depth 1)
 *   pipes.mdx      → /europa-neo/pipes/index.html         (depth 2)
 *   foo/bar.mdx    → /europa-neo/foo/bar/index.html       (depth 3)
 *
 * Depth is derived from how many path segments the filename contains:
 *   "index.mdx"  → 1 segment → depth 1
 *   "pipes.mdx"  → 1 segment → depth 2 (non-index pages get a subdirectory)
 *   "foo/bar.mdx" → 2 segments → depth 3
 *
 * @param {string | undefined} filePath - VFile path (absolute or relative)
 * @returns {number} output depth from site root
 */
function getOutputDepth(filePath) {
    if (!filePath) return 2;

    // Extract just the filename (last segment)
    const filename = filePath.split('/').pop() ?? '';

    // index.mdx / index.md → depth 1
    if (/^index\.mdx?$/i.test(filename)) return 1;

    // Non-index pages always output at depth 2 in a flat site
    // (pipes.mdx → /europa-neo/pipes/index.html)
    // For nested pages this would be segments.length + 1, but flat = always 2
    return 2;
}

/**
 * @returns {import('unified').Transformer} rehype transform function
 */
export default function rehypeFixLinks() {
    return (tree, file) => {
        const filePath = file?.path ?? file?.history?.[0] ?? '';
        const depth = getOutputDepth(filePath);

        // Depth 1 pages (index) don't need rewriting — ./foo resolves correctly
        if (depth <= 1) return;

        // For depth N pages, relative ./foo needs (N - 1) ../ prefixes to
        // reach the site root.  Since we're flat and depth is always 2,
        // that means one ../ prefix.
        const prefix = '../'.repeat(depth - 1);

        visit(tree, 'element', (node) => {
            if (node.tagName !== 'a') return;

            const href = node.properties?.href;
            if (typeof href !== 'string') return;

            // Only rewrite relative links starting with ./
            if (!href.startsWith('./')) return;

            // Strip the ./ prefix, then prepend the correct number of ../
            // e.g. ./controls → ../controls, ./index → ../index
            node.properties.href = prefix + href.slice(2);
        });
    };
}
