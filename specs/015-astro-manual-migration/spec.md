# Feature 015: Astro Migration for Player Manual

> Version: 1.1
> Last Updated: 2026-09-01
> Status: Draft
> Dependencies: Feature 007 (Player Manual — Implemented), Feature 012 (Design System — Implemented)

## Problem Statement

The Europa Neo player manual currently lives as plain Markdown rendered by Jekyll via GitHub Pages. While functional, this setup cannot leverage the `@europa/design` web components that the console already uses for its UI. The manual's 23 `{: .europa-table }` class hooks, 8 `<span class="europa-chip">` inline elements, and 1 `<div class="europa-card">` wrapper are CSS class approximations of what should be actual `<europa-*>` custom element tags — the same components players see in-game.

Additionally, the current Jekyll workflow (`pages-deploy.yml`) uses a 5-step Jekyll build chain that is heavier than necessary for what is essentially static Markdown-to-HTML conversion. The product owner has decided to migrate to Astro, which provides: (1) native MDX support for embedding web components directly in Markdown, (2) a simpler GitHub Pages deployment via `withastro/action@v6`, (3) Vite-powered `<script>` bundling so web components load without a separate build step, and (4) a rehype plugin ecosystem that can automate the remaining CSS class additions (e.g., auto-tagging all `<table>` elements with `europa-table`).

This migration is a **full rewrite of all 14 pages** (13 content pages + index) with component integration and prose improvements, not a find-and-replace. Each page gains inline `<europa-*>` tags where the content audit identified improvements (e.g., `<europa-pipe-slope>` in flow-rate tables, `<europa-troop-chip>` in combat examples, `<europa-elevation-swatch>` for slope illustrations). The migration also rewrites the manual's prose for clarity, tone consistency, and structural improvement — fixing rough transitions, standardizing terminology, and adding purpose statements where sections feel abrupt.

## User Stories

### US1 — Read the Manual With Live Components (Priority: P1)

As a player reading the manual, I want the same visual components I see in-game (chips, badges, pipe-slope triangles, troop counts, elevation swatches) to appear inline in the documentation, so that the manual feels like a natural extension of the game rather than a separate text.

**Why this priority**: The entire point of the migration is to replace CSS class hooks with real components. If the components don't render, the migration has no value.

**Independent Test**: Open any manual page in a browser; every `<europa-*>` tag renders as a styled, accessible component (not a raw tag or empty element).

---

### US2 — Deploy Automatically on Merge (Priority: P1)

As a project owner, I want the manual published to GitHub Pages by a workflow whenever a merge to `main` touches it, so that players always read the current version without downloading the repo.

**Why this priority**: Publishing is the delivery vehicle; without it, the rewritten manual is invisible.

**Independent Test**: Merge a manual-only edit to `main`; the Pages site updates with rendered HTML within 5 minutes. Merges that don't touch the manual do not redeploy.

---

### US3 — Maintain Content Accuracy (Priority: P1)

As a player, I want every number, rule, and control description in the manual to match the shipped game exactly, so that I can trust what I read.

**Why this priority**: The existing manual is already audited and accurate (SC-001/SC-002 from spec 007). The migration must not introduce regressions.

**Independent Test**: Run the same control-reference and numbers-appendix audits from spec 007 SC-001/SC-002 against the migrated pages; zero drift.

---

### US4 — Build the Manual Locally (Priority: P2)

As a contributor, I want to run a single command to build and preview the manual locally, so that I can verify changes before pushing.

**Why this priority**: Local buildability is essential for contributor workflow, but not blocking a first deployment.

**Independent Test**: Run `pnpm --filter @europa/manual build` (or equivalent); the `dist/` output contains all 14 rendered HTML pages with working component styles.

---

### US5 — Access the Manual Without JavaScript (Priority: P2)

As a player with JavaScript disabled or on a limited browser, I want the manual's text content to remain readable even if the web components don't hydrate, so that the documentation is never fully broken.

**Why this priority**: Constitution VII (self-hostable by default) and accessibility (Constitution VI) imply graceful degradation. The manual is text-first; components are visual enhancements.

**Independent Test**: Load a manual page with JavaScript disabled; all prose, tables, and links are readable. Component tags may be invisible but must not produce error messages or broken layout.

---

### US6 — Rewrite Manual Content (Priority: P1)

As a player, I want the manual's prose to be clear, well-organized, and consistently toned, so that I can quickly find answers to my questions.

**Why this priority**: The current manual is accurate but was written in a hurry during the MVP. Moving to Astro is the right time to polish the content — delaying means living with rough prose indefinitely.

**Independent Test**: Manual reads smoothly from start to finish; no duplicate paragraphs, no awkward transitions, no inconsistent terminology. A first-time reader can follow the logical progression from index → quick-start → objective → the-board → ... without information gaps or repetitions.

---

## Functional Requirements

### Migration & Structure

- **FR-001**: The manual MUST be restructured as an Astro static site rooted at `docs/manual/`, with `astro.config.mjs` at that root. The Astro `src/` directory MUST contain `pages/` (MDX files), `layouts/` (shared `.astro` layout), and `components/` (any Astro wrapper components if needed). The `public/` directory MUST contain the vendored `design.css`.

- **FR-002**: The Astro configuration MUST use `@astrojs/mdx` integration for MDX support. The config MUST set `site` to the GitHub Pages URL (`https://shaunburdick.github.io`) and `base` to `/europa-neo` (the repository is `shaunburdick/europa-neo`).

- **FR-003**: The `output` mode MUST be `'static'` (SSG). No server-side rendering, no adapters, no SSR endpoints.

- **FR-004**: The Astro `markdown` config MUST register a custom rehype plugin (`rehype-europa-tables`) that automatically adds `class="europa-table"` to every `<table>` element in the rendered HTML. This replaces the 23 manual `{: .europa-table }` Jekyll hook annotations in the source Markdown.

- **FR-005**: The shared layout (`src/layouts/ManualLayout.astro`) MUST:
  - Render a `<html lang="en">` wrapper with `<head>` containing meta charset, viewport, title, and a `<link>` to `/europa-neo/design.css` (the vendored CSS).
  - Render `<body class="europa-page europa-stack">` matching the current Jekyll layout's body classes.
  - Inject a `<script>` tag that imports and calls `register()` from `@europa/design/components` to register all 20 web components with the browser's custom element registry.
  - Render a branded footer with the application version (sourced from `APP_VERSION` or a build-time constant), matching the current footer's structure and token-only styling.
  - Accept a `title` prop for the page `<title>` element.

- **FR-006**: The vendored `design.css` MUST be placed at `docs/manual/public/design.css`, copied from the current `docs/manual/assets/design.css`. The CSS file MUST remain unmodified (it is the design system's compiled output, not a manual artifact).

- **FR-007**: Every page MUST be migrated from `.md` to `.mdx` format. The MDX files MAY contain JSX-compatible `<europa-*>` tags inline. Pages that use no components remain valid MDX (backward compatible with plain Markdown syntax).

### Component Integration

- **FR-008**: All 23 `{: .europa-table }` Jekyll class hook annotations MUST be removed from the MDX source. The rehype plugin (FR-004) handles table styling automatically. No manual class annotations for tables remain in any MDX file.

- **FR-009**: The single `<div class="europa-card">` in `index.md` MUST be replaced with `<europa-card>` (or a plain `<div>` with the catalog class if the card component's slot behavior is unsuitable for the current content). The component's light-DOM rendering must produce equivalent visual output.

- **FR-010**: All 8 `<span class="europa-chip">` elements in `reading-the-screen.md` MUST be replaced with `<europa-badge>` tags. The badge component renders a `<span class="europa-badge">` internally, which is the correct visual treatment for status labels in the manual context (the chip component is for counts, the badge is for labels).

- **FR-011**: The `index.md` footer line `{: .europa-typography--meta }` MUST be replaced with `<europa-typography variant="caption">` wrapping the version text. This produces the same visual result via the component's catalog class.

### Per-Page Component Improvements

- **FR-012**: `numbers.md` — All 7 tables MUST gain inline game-specific component replacements:
  - Simulation table: `<europa-troop-chip count="N" owner="1">` for troop counts, `<europa-pipe-slope direction="downhill|flat|uphill|stalled">` for pipe flow rows, `<europa-reserve-indicator percent="N">` for reserve values.
  - Special weapons table: `<europa-troop-chip>` for cost/landed values.
  - Interface table: `<europa-player-badge player="1|2|3|4">` for player color rows, `<europa-chip count="N">` for numeric values.
  - All component attributes MUST use shipped constant values (e.g., `count="30"` for cityCapacity, `percent="90"` for max reserve).

- **FR-013**: `pipes.md` — The flow-rate table and pipe slope color table MUST gain `<europa-pipe-slope direction="downhill|flat|uphill|stalled">` inline components in the "Slope" or "Color" column, providing a visual triangle preview alongside each row's text description.

- **FR-014**: `combat.md` — The attrition table's "Your troops" and "Enemy troops" columns MUST use `<europa-troop-chip count="N" owner="1">` and `<europa-troop-chip count="N" owner="2">` respectively, giving each worked example a visual troop-count chip.

- **FR-015**: `special-weapons.md` — The paratroop and gun property tables MUST use `<europa-troop-chip>` for cost and landed values. The "Friendly fire is real" section MUST be wrapped in `<europa-banner variant="alert">` to give it the alert visual treatment matching the console's reconnecting/warning banners.

- **FR-016**: `reserves.md` — The digit table's "Reserve" column MUST use `<europa-reserve-indicator percent="N">` for each row (0, 10, 50, 90), showing the actual reserve chip visual.

- **FR-017**: `reading-the-screen.md` — The 8 status-chip `<span class="europa-chip">` elements (idle, connecting, live, reconnecting, expired, spectating, game_over, closed) MUST be replaced with `<europa-badge>` tags (per FR-010). The overlays table at the bottom of the page remains as plain Markdown.

- **FR-018**: `index.md` — The "Tip" callout box (currently `<div class="europa-card">`) MUST be replaced with a styled component. The version footer MUST use `<europa-typography variant="caption">` (per FR-011).

- **FR-019**: `quick-start.md` — The 4 step sections (Choose a handle, Create or find a match, Wait for the game to start, Play) MUST be wrapped in `<europa-plate>` components, giving each step a surface-background treatment. The duplicate paragraph at lines 19–24 MUST be deduplicated (the second occurrence adds private-match and guest-ID information that should be merged into the first paragraph).

- **FR-020**: `fog-of-war.md` — A small illustrative `<europa-fog-overlay>` demo MAY be added to the "Your sensor horizon" section to show the fog overlay visual. This is purely decorative (`aria-hidden="true"`) and must not convey information that isn't already in the text.

- **FR-021**: `the-board.md` — The elevation-shading section MUST include `<europa-elevation-swatch elevation="N">` examples at representative values (e.g., 0, 25, 50, 75, 100) to show the color gradient from dark to bright green.

- **FR-022**: `objective.md` — The quick-reference outcome table's "Outcome" column MAY use `<europa-badge>` for each outcome type (You win, You lose, Draw, Surrender).

- **FR-023**: `controls.md` — The keyboard table's "Key" column MUST use `<europa-badge>` for each key name (i, j, k, l, Space, p, h, g, o, 0–9, Escape, arrows), providing a visual pill-shaped key indicator.

- **FR-024**: `cities-and-troops.md` — The saturation section's "30 troops" cap MUST use `<europa-chip count="30">` to show the capacity value as a chip.

### GitHub Pages Deployment

- **FR-025**: The GitHub Actions workflow MUST be replaced. The new workflow (`.github/workflows/pages-deploy.yml`) MUST:
  - Trigger on push to `main` when `docs/manual/**` or the workflow file itself changes (path filter preserved from current workflow).
  - Trigger on `workflow_dispatch` for manual republishing.
  - Use `withastro/action@v6` (SHA-pinned) for the build step, with `path: docs/manual` to point at the Astro project root.
  - Use `actions/deploy-pages@v5` (SHA-pinned) for the deploy step.
  - Maintain the same permissions model: `contents: read` at top level, `pages: write` + `id-token: write` on the deploy job.
  - Maintain the same concurrency group (`pages`, no cancel-in-progress).
  - Include the documentation privacy check step (from spec 010) after the Astro build, running against the Astro output directory.

- **FR-026**: The workflow MUST document (in comments) the one-time repository prerequisite: Settings → Pages → Source = "GitHub Actions".

- **FR-027**: The path filter MUST be updated to reflect the new Astro project structure. The filter MUST include `docs/manual/**` (covers all source, config, and public files) and the workflow file itself. The old Jekyll-specific paths (`docs/manual/assets/design.css`, `docs/manual/_layouts/**`) are no longer needed as separate filter entries since they are subsumed by `docs/manual/**`.

### Content Preservation

- **FR-028**: All existing manual content (prose, tables, links, code blocks) MUST be migrated. The migration MUST also apply content improvements including:
  - (a) Removing Jekyll-specific annotations (`{: .europa-table }`, `{: .europa-typography--meta }`)
  - (b) Replacing CSS class hooks with component tags (FR-009–FR-024)
  - (c) Fixing the duplicate paragraph in `quick-start.md` (FR-019)
  - (d) Adding new component examples (FR-020, FR-021)
  - (e) Rewriting prose for clarity, tone consistency, and flow (FR-033–FR-037)
  - (f) Improving section structure where needed (better ordering, tighter explanations)
  - (g) Ensuring consistent terminology across all pages
  - (h) Adding introductory context where sections feel abrupt

- **FR-029**: The `lobby.md` page (added post-spec-007) MUST be migrated to MDX alongside the other pages. Its content and links MUST remain intact.

- **FR-030**: All internal links between manual pages MUST be updated from the Jekyll relative-link format (`./page.md`) to the Astro format (`./page` or `/europa-neo/page` — depending on Astro's link resolution with `base`). The rehype plugin or a remark plugin SHOULD handle this automatically; if manual intervention is required, every link MUST be verified.

### Version & Drift Checking

- **FR-031**: The manual's version footer MUST continue to display the `APP_VERSION` value, maintaining lockstep with feature 009's drift check. The version string MUST be sourced from a build-time constant (e.g., imported from `@europa/version` or read from an environment variable during the Astro build), NOT hardcoded in the MDX.

- **FR-032**: The `pnpm version:check` script MUST continue to guard the manual's version surface. If the version is sourced from `@europa/version` at build time, the drift check applies automatically. If it is a separate constant, it MUST be added to the drift-check sources.

### Content Quality

- **FR-033**: All manual prose MUST be rewritten for clarity and tone consistency. The writing style MUST be: direct, second-person ("you"), active voice, minimal jargon. Technical terms MUST be defined on first use.

- **FR-034**: Every page MUST have a clear purpose statement in its opening paragraph — what the reader will learn or do after reading it.

- **FR-035**: Sections MUST flow logically with transitional sentences where needed. No abrupt topic jumps.

- **FR-036**: The manual MUST use consistent terminology throughout. A glossary or "Key terms" section MAY be added to `index.md` if terminology is complex.

- **FR-037**: Code examples and command-line snippets MUST use consistent formatting (monospace, same prompt style).

## Non-Functional Requirements

### Performance

- **NFR-001**: The Astro build for the manual MUST complete in under 30 seconds on a standard CI runner (ubuntu-latest, 2 cores). The manual is ~14 pages of Markdown; this is well within Astro's capability.

- **NFR-002**: The rendered HTML output MUST ship zero JavaScript by default (Astro's static output philosophy). The only JavaScript is the web component registration script injected by the layout, which is a single `register()` call — approximately 2–5 KB bundled by Vite.

- **NFR-003**: The total gzipped bundle size of the rendered site (HTML + CSS + JS) MUST be under 200 KB. The current `design.css` is the dominant asset; the HTML pages are lightweight Markdown renders.

### Compatibility

- **NFR-004**: The rendered manual MUST work in all browsers that support custom elements (Chrome 67+, Firefox 63+, Safari 10.1+, Edge 79+). Web components are the foundation of the migration; browsers that don't support them see unstyled custom element tags but readable text content (US5).

- **NFR-005**: The Astro project MUST be buildable with Node.js 22+ (matching the monorepo's engine requirement) and pnpm 11+ (matching the monorepo's packageManager).

### Security

- **NFR-006**: The `withastro/action@v6` and `actions/deploy-pages@v5` actions MUST be SHA-pinned (not tag-pinned) in the workflow, consistent with the repository's supply-chain security posture. The version comment MUST include the tag for readability.

- **NFR-007**: No secrets, tokens, or credentials MUST appear in the rendered manual content, URLs, or workflow logs. The documentation privacy check (from spec 010) MUST run against the Astro output.

### Accessibility

- **NFR-008**: All `<europa-*>` components used in the manual MUST retain their accessibility attributes (roles, aria-labels, aria-hidden) as implemented in `@europa/design`. The migration MUST NOT strip or override these.

- **NFR-009**: The rendered manual MUST pass the same accessibility audit criteria as spec 007 SC-006: one h1 per page, hierarchical headings, header rows on all tables, alt text on all images, descriptive link text.

## Acceptance Criteria

- [ ] **AC-001**: `docs/manual/astro.config.mjs` exists and configures Astro with `@astrojs/mdx`, `site`, `base`, `output: 'static'`, and the rehype table plugin.
- [ ] **AC-002**: `docs/manual/package.json` exists with `astro` and `@astrojs/mdx` as dependencies, and a `build` script that produces `dist/` output.
- [ ] **AC-003**: `docs/manual/src/layouts/ManualLayout.astro` exists and renders the HTML shell with CSS link, body classes, component registration script, and versioned footer.
- [ ] **AC-004**: All 14 MDX files exist under `docs/manual/src/pages/` (index + 13 content pages) and build to valid HTML.
- [ ] **AC-005**: `docs/manual/public/design.css` exists and is identical to the current `docs/manual/assets/design.css`.
- [ ] **AC-006**: The rehype plugin (`rehype-europa-tables`) is implemented and tested: every `<table>` in the rendered output has `class="europa-table"`.
- [ ] **AC-007**: Zero `{: .europa-table }` annotations remain in any MDX source file.
- [ ] **AC-008**: Zero `<span class="europa-chip">` remain in `reading-the-screen.md`; all 8 are replaced with `<europa-badge>`.
- [ ] **AC-009**: The `<div class="europa-card">` in `index.md` is replaced with a component or equivalent.
- [ ] **AC-010**: The `{: .europa-typography--meta }` annotation in `index.md` is replaced with `<europa-typography variant="caption">`.
- [ ] **AC-011**: `numbers.md` contains inline `<europa-troop-chip>`, `<europa-pipe-slope>`, `<europa-reserve-indicator>`, `<europa-player-badge>`, and `<europa-chip>` components with correct attribute values matching `ENGINE_CONSTANTS`.
- [ ] **AC-012**: `pipes.md` contains `<europa-pipe-slope>` components in the flow-rate and slope-color tables.
- [ ] **AC-013**: `combat.md` contains `<europa-troop-chip>` components in the attrition table.
- [ ] **AC-014**: `special-weapons.md` contains `<europa-troop-chip>` components and an `<europa-banner variant="alert">` for the friendly-fire section.
- [ ] **AC-015**: `reserves.md` contains `<europa-reserve-indicator>` components in the digit table.
- [ ] **AC-016**: `quick-start.md` has the duplicate paragraph (lines 19–24) deduplicated and step sections wrapped in `<europa-plate>`.
- [ ] **AC-017**: `fog-of-war.md` contains an illustrative `<europa-fog-overlay>` demo.
- [ ] **AC-018**: `the-board.md` contains `<europa-elevation-swatch>` examples at representative elevations.
- [ ] **AC-019**: `objective.md` contains `<europa-badge>` tags in the outcome table.
- [ ] **AC-020**: `controls.md` contains `<europa-badge>` tags for key names in the keyboard table.
- [ ] **AC-021**: `cities-and-troops.md` contains `<europa-chip count="30">` for the saturation cap.
- [ ] **AC-022**: `.github/workflows/pages-deploy.yml` is updated to use `withastro/action@v6` (SHA-pinned) and `actions/deploy-pages@v5` (SHA-pinned).
- [ ] **AC-023**: The workflow path filter includes `docs/manual/**` and the workflow file.
- [ ] **AC-024**: The documentation privacy check step runs against the Astro output directory.
- [ ] **AC-025**: `pnpm --filter @europa/manual build` (or the equivalent workspace command) completes successfully and produces `docs/manual/dist/` with all 14 HTML pages.
- [ ] **AC-026**: Opening any rendered page in a browser shows all `<europa-*>` components styled correctly (not raw tags).
- [ ] **AC-027**: Loading a rendered page with JavaScript disabled shows readable text content with no errors.
- [ ] **AC-028**: The control-reference audit (spec 007 SC-001) passes with zero drift against the migrated pages.
- [ ] **AC-029**: The numbers-appendix audit (spec 007 SC-002) passes with zero drift against the migrated pages.
- [ ] **AC-030**: All internal links between manual pages resolve correctly in the rendered output.
- [ ] **AC-031**: No duplicate paragraphs remain in any manual page.
- [ ] **AC-032**: Every page has a clear opening paragraph stating its purpose.
- [ ] **AC-033**: Terminology is consistent across all pages (e.g., "troops" not sometimes "units" or "soldiers").
- [ ] **AC-034**: The manual reads smoothly in sequence (index → quick-start → objective → the-board → ...) without information gaps or repetitions.

## Out of Scope

- **New pages**: No new manual pages are added. The 14-page structure (index + 13 content) is preserved.
- **Theme customization**: Astro's default styling is not customized beyond the vendored `design.css`. No Astro theme, no custom SCSS, no Tailwind.
- **Search functionality**: No site search, no Algolia, no Pagefind.
- **Analytics**: No Google Analytics, no Plausible, no tracking of any kind.
- **Interactive examples**: No client-side JavaScript beyond web component registration. No live simulations, no interactive boards.
- **Translations / i18n**: English only, same as spec 007.
- **Custom domain**: Default `github.io` Pages URL, same as spec 007.
- **PR preview deployments**: No Pages preview for pull requests.
- **Sitemap / RSS**: Not applicable for a 14-page manual.
- **Component testing**: The `@europa/design` components are already tested in their own package. This feature does not add component tests for the manual's usage of them — it adds integration verification (AC-026) instead.

## Edge Cases

- **Web components not supported**: If the browser doesn't support custom elements, `<europa-*>` tags are treated as unknown elements with no visual rendering. The text content inside them (e.g., `<europa-badge>idle</europa-badge>`) remains visible as plain text. This satisfies US5.
- **CSS not loaded**: If `design.css` fails to load (CDN issue, wrong path), the page renders with browser defaults. The layout structure (headings, tables, links) remains intact. Components render with their inline styles (pipe-slope, elevation-swatch, troop-chip all use inline styles).
- **Build-time version mismatch**: If `APP_VERSION` changes but the manual's version constant isn't updated, `pnpm version:check` catches the drift. The migration MUST source the version from the same location as the existing drift check (FR-031/FR-032).
- **Astro build failure in CI**: The `withastro/action@v6` step fails visibly in the Actions tab. The workflow's `workflow_dispatch` trigger allows manual retry. The existing one-time Pages setting prerequisite (FR-026) remains unchanged.
- **Component registration timing**: The `register()` call in the layout's `<script>` tag runs synchronously before the DOM is fully parsed (if placed in `<head>`) or after (if placed at end of `<body>`). Since web components are registered globally and render on `connectedCallback`, registration timing doesn't affect content readability. The script SHOULD be placed at the end of `<body>` (before the closing tag) to avoid blocking initial render.
- **MDX syntax conflicts**: Markdown tables containing `<` or `>` characters (e.g., `Δ≥7`) are valid MDX as long as they don't start a JSX tag. All existing manual tables use these characters in table cells, which MDX handles correctly. The migration MUST verify no MDX parse errors occur.
- **`base` path and links**: With `base: '/europa-neo'`, Astro prefixes all output paths. Internal links between pages MUST account for this. Astro's `<a>` tag in MDX resolves relative links relative to the current page; with `base`, the output HTML files are at `/europa-neo/page-name/index.html`. Links like `./pipes` in MDX resolve correctly if the pages are flat (no nested directories).

## Examples

### Example: Before and After — reading-the-screen.md Status Table

**Before (Jekyll Markdown):**
```markdown
| Status | What it means | What to do |
| --- | --- | --- |
| <span class="europa-chip">idle</span> | Not connected to a match | Wait for the lobby or choose a match |
| <span class="europa-chip">connecting</span> | Handshake in progress | Wait a moment |
```

**After (Astro MDX):**
```mdx
| Status | What it means | What to do |
| --- | --- | --- |
| <europa-badge>idle</europa-badge> | Not connected to a match | Wait for the lobby or choose a match |
| <europa-badge>connecting</europa-badge> | Handshake in progress | Wait a moment |
```

### Example: Before and After — numbers.md Pipe Flow Row

**Before:**
```markdown
| Pipe flow, downhill | 8–12 troops/tick per pipe | `ENGINE_CONSTANTS.flowBase + ...` |
{: .europa-table }
```

**After:**
```mdx
| Pipe flow, downhill | <europa-pipe-slope direction="downhill"></europa-pipe-slope> 8–12 troops/tick per pipe | `ENGINE_CONSTANTS.flowBase + ...` |
```
(The `{: .europa-table }` annotation is removed; the rehype plugin adds `class="europa-table"` automatically.)

### Example: Layout Script Tag

```astro
---
// src/layouts/ManualLayout.astro
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
  <footer style="margin-top: var(--europa-spacing-lg); ...">
    <span>Europa Neo</span>
    <span>v{import.meta.env.PUBLIC_APP_VERSION ?? '0.1.0'}</span>
    <a href="https://github.com/shaunburdick/europa-neo">GitHub</a>
  </footer>
  <script>
    import { register } from '@europa/design/components';
    register();
  </script>
</body>
</html>
```

### Example: Rehype Plugin (Conceptual)

```js
// docs/manual/rehype-europa-tables.mjs
import { visit } from 'unist-util-visit';

export default function rehypeEuropaTables() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'table') {
        node.properties = node.properties || {};
        node.properties.class = [
          node.properties.class,
          'europa-table',
        ]
          .filter(Boolean)
          .join(' ');
      }
    });
  };
}
```

### Example: Astro Config

```js
// docs/manual/astro.config.mjs
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
```

## Clarifications Applied

> Populated during Phase 3. Each entry documents a question asked and the requirement it produced.

| # | Question | Answer | Requirement Added |
|---|----------|--------|-------------------|
| 1 | Should content rewriting be in scope or out of scope for this migration? | In scope. Moving to Astro is the right time to polish prose. Content quality requirements FR-033–FR-037 and acceptance criteria AC-031–AC-034 added. | US6, FR-028 (revised), FR-033, FR-034, FR-035, FR-036, FR-037, AC-031, AC-032, AC-033, AC-034 |

## Research Notes

### Technology Versions (verified 2026-09-01)

| Package | Version | Source |
|---------|---------|--------|
| `astro` | 7.2.10 | npmjs.com (latest stable) |
| `@astrojs/mdx` | 7.0.2 | npmjs.com (latest stable) |
| `withastro/action` | v6.1.2 (SHA-pinned) | GitHub marketplace |
| `actions/deploy-pages` | v5.0.0 (SHA-pinned) | GitHub actions (existing pin) |
| `actions/checkout` | v7.0.1 (SHA-pinned) | GitHub actions (existing pin) |
| `rehype-add-classes` | 1.0.0 (reference only) | GitHub — we write our own simpler plugin |
| `unist-util-visit` | 5.x (latest) | unified ecosystem — for the rehype plugin |

**Note on Astro version**: The product owner specified `withastro/action@v6` for deployment. The action v6 is version-agnostic — it works with any Astro version. Astro 5.x was the latest stable when the PO made the decision; Astro 7.x is now current. The implementer SHOULD use the latest stable Astro (7.x) unless there is a compatibility concern with the MDX integration or the monorepo's Node.js 22 requirement. Astro 7 requires Node 22.12.0+, which matches the monorepo's `engines.node >= 22.0.0`.

**Note on rehype plugin**: The `rehype-add-classes` npm package (v1.0.0, last published 2018) provides generic selector-to-class mapping. However, our requirement is narrower (only `<table>` → `europa-table`), so a 15-line custom plugin using `unist-util-visit` is simpler and has zero dependencies beyond the unified ecosystem that Astro already ships. The custom plugin avoids an unmaintained dependency.

### Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Jekyll + esbuild (custom) | PO chose Astro; esbuild adds complexity without Astro's MDX/component story |
| Eleventy (11ty) | Less mature MDX support; no native Vite integration; component embedding requires more ceremony |
| VitePress | Vue-oriented; our components are framework-agnostic; VitePress's opinionated layout conflicts with the design system |
| Keep Jekyll, add components via `<script>` | Jekyll's Markdown pipeline doesn't support JSX; components would need raw HTML tags in Markdown, which is fragile |
| Plain Vite (no framework) | Loses Astro's content collections, MDX integration, and `withastro/action` — would need a custom build pipeline |
