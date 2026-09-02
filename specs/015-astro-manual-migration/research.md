# Research: Astro Migration for Player Manual

## Technology Versions (verified 2026-09-01)

| Package | Version | Source | Notes |
|---------|---------|--------|-------|
| `astro` | 7.2.10 | npmjs.com (latest stable) | Requires Node ≥22.12.0; monorepo `engines.node >= 22.0.0` is compatible |
| `@astrojs/mdx` | 7.0.2 | npmjs.com (latest stable) | Official MDX integration for Astro |
| `unist-util-visit` | 5.x | unified ecosystem (latest) | AST traversal for rehype plugins; ships with Astro's unified pipeline |
| `withastro/action` | v6.1.2 | GitHub releases | SHA: `e84f40bd8d2caa9e768ec82ad30dd81f0b280853` |
| `actions/deploy-pages` | v5.0.0 | GitHub releases | SHA: `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128` (same as current workflow) |
| `actions/checkout` | v7.0.1 | GitHub releases | SHA: `3d3c42e5aac5ba805825da76410c181273ba90b1` (same as current workflow) |

## Astro Version Decision

The product owner specified `withastro/action@v6` for deployment. Action v6 is version-agnostic — it works with any Astro version. The spec's Research Notes section (§Technology Versions) noted Astro 7.x as the current stable and recommended using it. **Decision: use Astro 7.x** (latest stable). Astro 7 requires Node 22.12.0+, which satisfies the monorepo's `engines.node >= 22.0.0`.

## Astro Static Site Architecture

Astro's `output: 'static'` mode produces a fully static site — no server runtime, no adapters, no SSR endpoints. This matches the current Jekyll deployment model exactly: all pages are pre-rendered at build time into HTML files.

**Key Astro concepts for this migration:**

- **`astro.config.mjs`**: Project configuration file at `docs/manual/`. Sets `site`, `base`, `output`, integrations, and markdown plugins.
- **`src/pages/`**: MDX files become routes. `index.mdx` → `/europa-neo/`, `pipes.mdx` → `/europa-neo/pipes/`, etc. Astro generates `page-name/index.html` for each page.
- **`src/layouts/`**: `.astro` files for shared HTML shells. Used via frontmatter: `layout: ../layouts/ManualLayout.astro`.
- **`public/`**: Static assets copied verbatim to the output. `design.css` goes here.
- **`<script>` tags in `.astro`**: Vite-bundled automatically. A single `register()` call adds ~2-5 KB.
- **`import.meta.env.PUBLIC_*`**: Build-time environment variables prefixed with `PUBLIC_` are inlined into the client bundle. `PUBLIC_APP_VERSION` can source from a `.env` file or the build environment.

## MDX Integration

Astro's `@astrojs/mdx` integration enables `.mdx` files in `src/pages/`. MDX is a superset of Markdown that supports JSX expressions and HTML/JSX components inline. Key behaviors:

- **JSX in Markdown**: `<europa-badge>idle</europa-badge>` is valid MDX — it renders as a custom element when registered.
- **Import statements**: MDX files can `import` components from anywhere, but for the manual we prefer direct custom element tags (no import needed — they're registered globally by the layout script).
- **Frontmatter**: MDX files support YAML frontmatter for layout assignment and props.
- **Backward compatibility**: Pages with no components are valid MDX (plain Markdown syntax works).

**Gotcha — MDX and `<` in tables**: Markdown tables containing `<` or `>` characters (e.g., `Δ≥7`) are valid MDX as long as they don't start a JSX tag opening (`<tag>`). All existing manual tables use these in cell content, not as tag openings, so MDX handles them correctly. Verified by reading every table in the 14 pages.

## Rehype Plugin Design

The rehype plugin (`rehype-europa-tables`) adds `class="europa-table"` to every `<table>` element. This replaces the 23 manual `{: .europa-table }` Jekyll annotations.

**Plugin API**: Rehype plugins are functions that return a transformer. The transformer receives an HAST (HTML Abstract Syntax Tree) and mutates it. Using `unist-util-visit` for traversal:

```js
import { visit } from 'unist-util-visit';

export default function rehypeEuropaTables() {
    return (tree) => {
        visit(tree, 'element', (node) => {
            if (node.tagName === 'table') {
                node.properties = node.properties || {};
                node.properties.class = [node.properties.class, 'europa-table']
                    .filter(Boolean)
                    .join(' ');
            }
        });
    };
}
```

**Why a custom plugin instead of `rehype-add-classes`?**: The `rehype-add-classes` package (v1.0.0, last published 2018) provides generic selector-to-class mapping. Our requirement is narrower (only `<table>` → `europa-table`), so a 15-line custom plugin using `unist-util-visit` is simpler, has zero dependencies beyond the unified ecosystem that Astro already ships, and avoids an unmaintained dependency.

**Registration in Astro config**:

```js
import rehypeEuropaTables from './rehype-europa-tables.mjs';

export default defineConfig({
    markdown: {
        rehypePlugins: [rehypeEuropaTables],
    },
});
```

## GitHub Pages Deployment with `withastro/action@v6`

The `withastro/action` GitHub Action handles the entire Astro build-and-deploy pipeline:

1. Detects the package manager (pnpm in our case)
2. Installs dependencies
3. Runs `astro build`
4. Uploads the output as a Pages artifact
5. Deploys to GitHub Pages

**Inputs**:
- `path`: Path to the Astro project root (`docs/manual`)
- `node-version`: Defaults to 22 (matches our requirement)

**Key difference from Jekyll workflow**: The `withastro/action` replaces the 3-step Jekyll chain (configure-pages → jekyll-build-pages → upload-pages-artifact) with a single action that handles build + upload. The deploy step (`actions/deploy-pages`) remains the same.

**Workflow structure**:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: withastro/action@<sha>
        with:
          path: docs/manual
      - name: Documentation privacy check
        run: node specs/010-public-lobby-match-browser/check-documentation-privacy.mjs
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/deploy-pages@<sha>
```

**Note**: The `withastro/action` outputs the build to `docs/manual/dist/` by default. The privacy check step must run against this directory.

## Web Component Registration in Astro Layouts

The `ManualLayout.astro` layout injects a `<script>` tag that imports and calls `register()` from `@europa/design/components`. This registers all 20 web components globally.

**Key consideration**: The script runs in the browser (client-side). In Astro's static output, `<script>` tags in `.astro` files are processed by Vite — they're bundled and deduplicated automatically. The `register()` function is safe to call multiple times (idempotent) and safe in SSR environments (no-ops when `customElements` is undefined).

**Placement**: At the end of `<body>` (before closing tag) to avoid blocking initial render. Web components are registered globally and render on `connectedCallback`, so registration timing doesn't affect content readability — unregistered elements simply render as unknown elements with their text content visible.

**Import path**: `import { register } from '@europa/design/components'` — this resolves via the monorepo workspace to `packages/design/dist/components/index.js`. For the Astro build, `@europa/design` must be available as a dependency. Two approaches:
1. **Add `@europa/design` as a dependency** of the manual's `package.json` (workspace reference)
2. **Vendored CSS only, register via inline script** — the `design.css` is already vendored; the script can import from the workspace package

**Decision**: Use workspace dependency (`"@europa/design": "workspace:*"`) in the manual's `package.json`. This lets Vite resolve and bundle the `register()` call correctly. The vendored `design.css` in `public/` handles the stylesheet.

## Base Path Handling

With `base: '/europa-neo'`, Astro prefixes all output paths:

- HTML files: `dist/pipes/index.html` (not `/europa-neo/pipes/index.html` in the filesystem)
- CSS/JS: referenced as `/europa-neo/design.css` in the HTML
- Links in MDX: relative links like `./pipes` resolve correctly because Astro's link processing accounts for `base`

**Internal links**: The current manual uses `./page.md` format (Jekyll convention). In Astro MDX, links should be `./page` (no `.md` extension). Astro resolves relative links against the current page's URL. With `base`, output files live at `/europa-neo/page/index.html`, so `./pipes` from `index` resolves to `/europa-neo/pipes/` — correct.

**Link migration**: The 23 `{: .europa-table }` annotations are removed by the rehype plugin. Internal links change from `./page.md` to `./page`. This is a straightforward find-and-replace across all 14 MDX files.

## Version Drift Integration

The current version drift check (`pnpm version:check`) scans:
1. `docs/manual/index.md` — footer line `*This manual documents Europa Neo v0.1.0.*`
2. `docs/manual/_config.yml` — `version: 0.1.0`

After migration:
- `docs/manual/index.md` moves to `docs/manual/src/pages/index.mdx` — the drift checker needs to be updated to scan the new path
- `docs/manual/_config.yml` is deleted (Jekyll config no longer needed) — the drift checker's `docs-config` source is removed
- The footer version can be sourced from `import.meta.env.PUBLIC_APP_VERSION` at build time, which Astro inlines into the HTML

**Decision**: The footer in `index.mdx` will use a build-time constant. The drift checker's `manual-index` source path changes to `docs/manual/src/pages/index.mdx`. The `docs-config` source is removed. Alternatively, keep a static version string in the MDX footer (simpler, same drift-check pattern).

## Component Integration — Attribute Reference

| Component | Tag | Attributes | Example |
|-----------|-----|------------|---------|
| Badge | `<europa-badge>` | (slot text) | `<europa-badge>idle</europa-badge>` |
| Banner | `<europa-banner>` | `variant="alert\|status"` | `<europa-banner variant="alert">Warning</europa-banner>` |
| Card | `<europa-card>` | (slot content) | `<europa-card>...</europa-card>` |
| Chip | `<europa-chip>` | `count="N"` | `<europa-chip count="30"></europa-chip>` |
| Typography | `<europa-typography>` | `variant="caption\|heading\|..."` | `<europa-typography variant="caption">v0.1.0</europa-typography>` |
| Plate | `<europa-plate>` | (slot content) | `<europa-plate>Step content</europa-plate>` |
| Troop Chip | `<europa-troop-chip>` | `count="N" owner="1\|2\|3\|4"` | `<europa-troop-chip count="20" owner="1"></europa-troop-chip>` |
| Pipe Slope | `<europa-pipe-slope>` | `direction="downhill\|flat\|uphill\|stalled"` | `<europa-pipe-slope direction="downhill"></europa-pipe-slope>` |
| Reserve Indicator | `<europa-reserve-indicator>` | `percent="N"` | `<europa-reserve-indicator percent="70"></europa-reserve-indicator>` |
| Player Badge | `<europa-player-badge>` | `player="1\|2\|3\|4"` | `<europa-player-badge player="1"></europa-player-badge>` |
| Elevation Swatch | `<europa-elevation-swatch>` | `elevation="0-100"` | `<europa-elevation-swatch elevation="50"></europa-elevation-swatch>` |
| Fog Overlay | `<europa-fog-overlay>` | (decorative) | `<europa-fog-overlay aria-hidden="true"></europa-fog-overlay>` |

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Jekyll + esbuild (custom) | PO chose Astro; esbuild adds complexity without Astro's MDX/component story |
| Eleventy (11ty) | Less mature MDX support; no native Vite integration; component embedding requires more ceremony |
| VitePress | Vue-oriented; our components are framework-agnostic; VitePress's opinionated layout conflicts with the design system |
| Keep Jekyll, add components via `<script>` | Jekyll's Markdown pipeline doesn't support JSX; components would need raw HTML tags in Markdown, which is fragile |
| Plain Vite (no framework) | Loses Astro's content collections, MDX integration, and `withastro/action` — would need a custom build pipeline |
