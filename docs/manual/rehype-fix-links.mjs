/**
 * rehype-fix-links.mjs
 *
 * Astro does NOT rewrite relative markdown links for the `base` config — what
 * you write is what appears in the HTML.  With `base: '/europa-neo'`, every
 * page except index.mdx is output at depth 2 (e.g. /europa-neo/pipes/index.html),
 * so `./lobby` from pipes resolves to /europa-neo/pipes/lobby — a 404.
 *
 * This plugin walks every <a> element and, for relative links starting with
 * "./", performs two fixes:
 *
 * 1. Depth-rewriting: adjusts the ./ prefix based on the page's output depth
 *    so the link reaches the correct path under /europa-neo/:
 *      index.mdx  → depth 1 → ./foo stays ./foo
 *      pipes.mdx  → depth 2 → ./foo becomes ../foo
 *
 * 2. Trailing-slash: appends a trailing slash to all rewritten relative links
 *    so they match Astro's `trailingSlash: 'always'` config:
 *      ./lobby    → /europa-neo/lobby/  (not /europa-neo/lobby which 404s)
 *      ../pipes/  → /europa-neo/pipes/  (already correct)
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
        console.log('[rehype-fix-links] called for:', filePath);
        const depth = getOutputDepth(filePath);

        // For depth N pages, relative ./foo needs (N - 1) ../ prefixes to
        // reach the site root.  Since we're flat and depth is always 2,
        // that means one ../ prefix.  Depth 1 pages (index) skip this.
        const prefix = depth > 1 ? '../'.repeat(depth - 1) : '';

        visit(tree, 'element', (node) => {
            if (node.tagName !== 'a') return;

            const href = node.properties?.href;
            if (typeof href !== 'string') return;

            // Only rewrite relative links starting with ./
            if (!href.startsWith('./')) return;

            // Strip the ./ prefix to get the target path
            const target = href.slice(2);

            // Special case: ./index → just ../ (the parent directory root)
            // The index page lives at /europa-neo/, not /europa-neo/index/
            if (/^index(?:\.mdx?)?$/i.test(target)) {
                node.properties.href = prefix;
            } else {
                node.properties.href = prefix + target;
            }

            // Add trailing slash if not present — Astro's trailingSlash: 'always'
            // serves pages at /europa-neo/pipes/ (with slash), so links must match
            if (!node.properties.href.endsWith('/')) {
                node.properties.href += '/';
            }
        });
    };
}
