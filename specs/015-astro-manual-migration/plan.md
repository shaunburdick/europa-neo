# Plan: Astro Migration for Player Manual

## Architecture Overview

The manual migrates from Jekyll (plain Markdown + `_config.yml` + `_layouts/default.html`) to Astro (MDX + `.astro` layout + rehype plugin). The output remains a static HTML site deployed to GitHub Pages — no server runtime, no SSR.

```
docs/manual/
├── astro.config.mjs          # NEW — Astro configuration
├── package.json               # NEW — workspace package with astro + @astrojs/mdx deps
├── tsconfig.json              # NEW — Astro TypeScript config
├── rehype-europa-tables.mjs   # NEW — custom rehype plugin
├── public/
│   └── design.css             # MOVED from assets/design.css (byte-identical)
├── src/
│   ├── layouts/
│   │   └── ManualLayout.astro # NEW — shared HTML shell
│   └── pages/
│       ├── index.mdx          # MOVED from index.md (content rewritten)
│       ├── quick-start.mdx    # MOVED from quick-start.md
│       ├── objective.mdx      # MOVED from objective.md
│       ├── the-board.mdx      # MOVED from the-board.md
│       ├── cities-and-troops.mdx
│       ├── pipes.mdx
│       ├── combat.mdx
│       ├── special-weapons.mdx
│       ├── reserves.mdx
│       ├── fog-of-war.mdx
│       ├── controls.mdx
│       ├── reading-the-screen.mdx
│       ├── numbers.mdx
│       └── lobby.mdx
├── _config.yml                # DELETED (Jekyll config)
├── _layouts/
│   └── default.html           # DELETED (replaced by ManualLayout.astro)
└── assets/
    └── design.css             # DELETED (moved to public/design.css)
```

**Files deleted**: `_config.yml`, `_layouts/default.html`, `assets/design.css` (moved, not duplicated)
**Files created**: `astro.config.mjs`, `package.json`, `tsconfig.json`, `rehype-europa-tables.mjs`, `src/layouts/ManualLayout.astro`, 14 `.mdx` files in `src/pages/`, `public/design.css`
**Files moved**: 14 `.md` → `src/pages/*.mdx`, `assets/design.css` → `public/design.css`

## ManualLayout.astro Design

The layout replaces `_layouts/default.html`. It renders the same HTML structure:

```astro
---
interface Props {
    title: string;
}
const { title } = Astro.props;
---
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title}</title>
    <link rel="stylesheet" href="/europa-neo/design.css">
</head>
<body class="europa-page europa-stack">
    <slot />
    <footer style="margin-top: var(--europa-spacing-lg); padding: var(--europa-spacing-md) var(--europa-spacing-lg); border-top: var(--europa-borders-width) var(--europa-borders-style) var(--europa-color-border); background-color: var(--europa-color-surface); color: var(--europa-color-text-muted); font-family: var(--europa-typography-font-stack); font-size: var(--europa-typography-size-xs); display: flex; flex-wrap: wrap; gap: var(--europa-spacing-sm); align-items: center;">
        <span>Europa Neo</span>
        <span>v0.1.0</span>
        <a href="https://github.com/shaunburdick/europa-neo" style="color: var(--europa-color-accent); text-decoration: underline;">GitHub</a>
    </footer>
    <script>
        import { register } from '@europa/design/components';
        register();
    </script>
</body>
</html>
```

**Key decisions**:
- Footer version is hardcoded as `v0.1.0` (same pattern as current `_config.yml` — the drift checker scans the footer line)
- The `<script>` tag imports `register()` from the workspace package; Vite bundles it
- CSS link uses `/europa-neo/design.css` (matching `base` path)
- Body classes `europa-page europa-stack` preserved from current layout

## Component Integration Strategy

Each page gains inline `<europa-*>` tags where the spec identifies improvements. The components are registered globally by the layout script, so no per-page imports are needed.

### Per-page component mapping

| Page | Component(s) | Attribute values | Source |
|------|-------------|-----------------|--------|
| `index.mdx` | `<europa-card>` (replace `<div class="europa-card">`) | slot content | FR-009 |
| `index.mdx` | `<europa-typography variant="caption">` (replace `{: .europa-typography--meta }`) | slot text | FR-011 |
| `reading-the-screen.mdx` | `<europa-badge>` ×8 (replace `<span class="europa-chip">`) | slot text per status | FR-010, FR-017 |
| `numbers.mdx` | `<europa-troop-chip>` | `count="N" owner="1"` | FR-012 |
| `numbers.mdx` | `<europa-pipe-slope>` | `direction="downhill\|flat\|uphill\|stalled"` | FR-012 |
| `numbers.mdx` | `<europa-reserve-indicator>` | `percent="N"` | FR-012 |
| `numbers.mdx` | `<europa-player-badge>` | `player="1\|2\|3\|4"` | FR-012 |
| `numbers.mdx` | `<europa-chip>` | `count="N"` | FR-012 |
| `pipes.mdx` | `<europa-pipe-slope>` ×4 | `direction="downhill\|flat\|uphill\|stalled"` | FR-013 |
| `combat.mdx` | `<europa-troop-chip>` ×6 | `count="N" owner="1\|2"` | FR-014 |
| `special-weapons.mdx` | `<europa-troop-chip>` ×4 | `count="N" owner="1"` | FR-015 |
| `special-weapons.mdx` | `<europa-banner variant="alert">` | wrap friendly-fire section | FR-015 |
| `reserves.mdx` | `<europa-reserve-indicator>` ×4 | `percent="0\|10\|50\|90"` | FR-016 |
| `quick-start.mdx` | `<europa-plate>` ×4 | wrap each step section | FR-019 |
| `fog-of-war.mdx` | `<europa-fog-overlay>` | `aria-hidden="true"` | FR-020 |
| `the-board.mdx` | `<europa-elevation-swatch>` ×5 | `elevation="0\|25\|50\|75\|100"` | FR-021 |
| `objective.mdx` | `<europa-badge>` ×4 | slot text per outcome | FR-022 |
| `controls.mdx` | `<europa-badge>` ×12 | slot text per key name | FR-023 |
| `cities-and-troops.mdx` | `<europa-chip>` | `count="30"` | FR-024 |

### Jekyll annotation removal

All 23 `{: .europa-table }` annotations are removed — the rehype plugin handles table styling automatically (FR-008, AC-007).

The `{: .europa-typography--meta }` annotation in `index.md` is replaced with `<europa-typography variant="caption">` (FR-011, AC-010).

## Rehype Plugin Design

A single custom rehype plugin at `docs/manual/rehype-europa-tables.mjs`:

- **Input**: HAST tree (HTML Abstract Syntax Tree)
- **Action**: Visit every `element` node; if `tagName === 'table'`, add/merge `class="europa-table"` into `properties.class`
- **Dependencies**: `unist-util-visit` (already in Astro's unified pipeline)
- **Registration**: In `astro.config.mjs` under `markdown.rehypePlugins`

This replaces all 23 manual `{: .europa-table }` Jekyll annotations with zero manual intervention.

## Content Rewrite Strategy (FR-033–FR-037)

Content rewriting is done **in the same change set** as the technical migration. Each page is rewritten for:

1. **Clarity** (FR-033): direct, second-person, active voice, minimal jargon
2. **Purpose statements** (FR-034): every page opens with what the reader will learn/do
3. **Logical flow** (FR-035): transitional sentences, no abrupt jumps
4. **Consistent terminology** (FR-036): "troops" not "units"/"soldiers", "pipes" not "conduits"
5. **Code formatting** (FR-037): monospace for commands, consistent prompt style

**Approach**: Rewrite each page as part of its migration task. The content improvements are interleaved with the component integration — not a separate pass. This avoids touching each file twice.

**Specific fixes identified**:
- `quick-start.md` lines 19–24: duplicate paragraph (FR-019) — merge the two paragraphs
- All pages: add opening purpose statement (FR-034)
- Cross-page: ensure consistent terminology (FR-036)

## Version Drift Integration (FR-031–FR-032)

**Current state**: The drift checker scans `docs/manual/index.md` (footer line) and `docs/manual/_config.yml` (version key).

**After migration**:
- `docs/manual/index.md` → `docs/manual/src/pages/index.mdx` — update the drift checker's `manual-index` source path
- `docs/manual/_config.yml` → deleted — remove the `docs-config` source from the drift checker
- The footer in `index.mdx` keeps the static `v0.1.0` string (same pattern — the drift checker validates it matches `APP_VERSION`)

**Files to update in `packages/version/`**:
- `scripts/gather-version-sources.ts`: change `docs/manual/index.md` → `docs/manual/src/pages/index.mdx`; remove `docs/manual/_config.yml` source
- `tests/unit/check-version-drift.test.ts`: update test fixtures for new paths
- `tests/integration/cli.test.ts`: update integration tests for new paths

## CI Workflow Redesign

The workflow (`.github/workflows/pages-deploy.yml`) changes from a 5-step Jekyll chain to a 3-step Astro chain:

**Before (Jekyll)**:
1. Checkout
2. Configure Pages
3. Jekyll build (source: ./docs/manual)
4. Documentation privacy check
5. Upload Pages artifact
→ Deploy

**After (Astro)**:
1. Checkout
2. `withastro/action@v6` (handles install + build + upload)
3. Documentation privacy check (runs against `docs/manual/dist/`)
→ Deploy

**Key changes**:
- Remove `actions/configure-pages` step (withastro/action handles this)
- Remove `actions/jekyll-build-pages` step (replaced by withastro/action)
- Remove `actions/upload-pages-artifact` step (withastro/action handles this)
- Add `withastro/action@<sha>` with `path: docs/manual`
- Update privacy check to run against `docs/manual/dist/` instead of `./_site`
- Remove Jekyll-specific path filter entries (`docs/manual/assets/design.css`, `docs/manual/_layouts/**`)
- Keep `docs/manual/**` and the workflow file itself as path triggers

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | Astro 7.x (latest stable) | Node 22.12.0+ compatible; withastro/action@v6 is version-agnostic |
| D-2 | `@europa/design` as workspace dependency | Lets Vite bundle `register()` correctly; vendored CSS stays in `public/` |
| D-3 | Footer version is static `v0.1.0` in MDX | Same drift-check pattern as current `_config.yml`; simplest approach |
| D-4 | Custom rehype plugin over `rehype-add-classes` | Narrow requirement (only table class); avoids unmaintained dep |
| D-5 | No `src/content/` collections | Manual is 14 pages — content collections add ceremony without value |
| D-6 | `output: 'static'` (SSG) | Matches current Jekyll model; no server runtime needed |
| D-7 | Content rewrite interleaved with migration | Avoids touching each file twice; pages are rewritten as they're migrated |
| D-8 | `<script>` at end of `<body>` | Avoids blocking initial render; web components render on `connectedCallback` regardless |
| D-9 | Relative links `./page` (no `.md`) | Astro resolves relative links against URL; with `base`, output files are at `/europa-neo/page/index.html` |
| D-10 | `base: '/europa-neo'` | Repository is `shaunburdick/europa-neo`; Pages URL is `shaunburdick.github.io/europa-neo/` |
