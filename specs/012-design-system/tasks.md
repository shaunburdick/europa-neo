# Tasks: Unified Design System Dev Page (Issue #68)

**Input**: Design documents from `specs/012-design-system/plan.md` and `spec.md` (FR-028–FR-035)

**Prerequisites**: plan.md, spec.md addendum (FR-028–FR-035, SC-013–SC-017). The `@europa/design` package is already implemented.

**Organization**: Tasks are grouped by phase — extraction, shell, foundations, components, tests, cleanup.

---

## Phase 1: Extract Shared Logic from Preview

**Purpose**: Move pure helper functions from `preview/main.ts` into reusable modules so both the migrated tests and the new React components can import them.

- [ ] T-001 Extract contrast helpers (`parseHex`, `relativeLuminance`, `contrastRatio`, `contrastRatioNumeric`) from `packages/design/preview/main.ts` into `packages/design/dev/lib/contrast.ts` — preserve all JSDoc, export every function
- [ ] T-002 Extract token builders (`buildColorCategories`, `buildTokenGroups`, `buildA11yPairings`, `buildTypeSamples`, `toKebabCase`) from `packages/design/preview/main.ts` into `packages/design/dev/lib/token-utils.ts` — imports `contrast.ts` for ratio computation, imports `TOKENS` from `../../src/tokens.ts`
- [ ] T-003 Update `packages/design/tests/preview.test.ts` imports to point to `../dev/lib/contrast.ts` and `../dev/lib/token-utils.ts` instead of `../preview/main.ts`. Verify all 39 tests pass with `pnpm --filter @europa/design test`

---

## Phase 2: React Shell and Vite Config

**Purpose**: Create the Vite-served React shell with sidebar navigation, hash routing, and theme toggle.

- [ ] T-004 Create `packages/design/dev/index.html` — minimal HTML with `<div id="root">`, viewport meta, title, `<script type="module" src="./main.tsx">`. No inline `<style>` blocks with literals
- [ ] T-005 Create `packages/design/dev/vite.config.ts` — `root: '.'`, esbuild automatic JSX (`jsx: 'automatic'`, `jsxImportSource: 'react'`). Same pattern as the existing playground config
- [ ] T-006 Create `packages/design/dev/main.tsx` — React entry: imports `App`, `./styles/shell.css`, calls `applyTokenVariables()` (from playground pattern — iterates `TOKENS` and sets `--europa-*` on `:root`), renders `<App />` into `#root`
- [ ] T-007 Create `packages/design/dev/styles/shell.css` — page shell styles using ONLY `var(--europa-*)` tokens. Includes: reset, body, layout grid (sidebar + content), sidebar styles, section heading styles, divider, responsive media query at 768px, `:root[data-theme="light"]` overrides for ALL color tokens. Zero hex/rgb literals outside `var()`
- [ ] T-008 Create `packages/design/dev/hooks/useHashRoute.ts` — returns current hash (string), subscribes to `hashchange` event, cleans up listener on unmount
- [ ] T-009 Create `packages/design/dev/hooks/useTheme.ts` — reads `localStorage('europa-dev-theme')`, defaults to `'dark'`, returns `[theme, toggleTheme]`. `toggleTheme` sets `data-theme` attribute on `document.documentElement` and persists to localStorage. Handles localStorage unavailable gracefully (try/catch)
- [ ] T-010 Create `packages/design/dev/components/ThemeToggle.tsx` — button that calls `toggleTheme` from `useTheme`. Renders dark/light label. Styled with `var(--europa-*)` tokens only
- [ ] T-011 Create `packages/design/dev/lib/sections.ts` — section registry: array of `{ id, title, category, description }` objects. Categories: `'foundations'`, `'components'`, `'primitives'`. IDs match the hash routes from spec Clarifications v1.3. Exports `SECTIONS` constant and `CATEGORIES` array
- [ ] T-012 Create `packages/design/dev/components/Sidebar.tsx` — sticky sidebar rendering three category groups from `SECTIONS`. Each item is an `<a href="#{id}">` link. Active item highlighted via `aria-current="true"` + CSS class. Contains `<ThemeToggle />` at bottom. On mobile (<768px): hamburger button toggles drawer visibility, clicking a link closes the drawer
- [ ] T-013 Create `packages/design/dev/components/App.tsx` — root layout: CSS Grid with sidebar + content columns. Uses `useHashRoute` to get active section. On hash change, calls `document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. Renders `<Sidebar />` + `<main>` containing all section components (imported dynamically or statically). Invalid hash: no crash, no active sidebar item, content stays at current position
- [ ] T-014 Update `packages/design/package.json` — change `"dev": "vite playground"` to `"dev": "vite dev --config dev/vite.config.ts"`

---

## Phase 3: Foundation Sections (from Preview)

**Purpose**: Migrate the 5 token documentation sections from preview HTML to React components.

- [ ] T-015 Create `packages/design/dev/components/foundations/ColorSwatches.tsx` — imports `buildColorCategories` from `../../lib/token-utils.ts`. Renders category headings + swatch grids (color box, name, hex value, contrast ratio, pass/fail badge). Styled with `var(--europa-*)` only
- [ ] T-016 Create `packages/design/dev/components/foundations/TypographyScale.tsx` — imports `buildTypeSamples` from `../../lib/token-utils.ts`. Renders type samples at their declared sizes with sample text and meta labels. Styled with `var(--europa-*)` only
- [ ] T-017 Create `packages/design/dev/components/foundations/SpacingBorders.tsx` — imports `TOKENS` from `../../src/tokens.ts`. Renders spacing, borders, shadows, motion, radii, controlHeight, focusRing token groups as visual samples (not full table — just the key values with visual demonstration). Styled with `var(--europa-*)` only
- [ ] T-018 Create `packages/design/dev/components/foundations/A11yPairings.tsx` — imports `buildA11yPairings` from `../../lib/token-utils.ts`. Renders contrast pairings table (pairing name, foreground, background, ratio, target, pass/fail). Styled with `var(--europa-*)` only
- [ ] T-019 Create `packages/design/dev/components/foundations/TokenTable.tsx` — imports `buildTokenGroups` from `../../lib/token-utils.ts`. Renders full token table: grouped by category, each row shows token name, CSS variable, value. "New" badge on shadows/motion groups. Styled with `var(--europa-*)` only

---

## Phase 4: Component Demo Sections (from Playground)

**Purpose**: Migrate all 20 component demos from the playground to React components.

- [ ] T-020 Create `packages/design/dev/components/components/ButtonDemo.tsx` — renders EuropaButton with all variants (primary/secondary/ghost/success/warning/error/info), sizes (sm/lg), disabled state. Styled with `var(--europa-*)` only
- [ ] T-021 Create `packages/design/dev/components/components/CardDemo.tsx` — renders EuropaCard with content. Styled with `var(--europa-*)` only
- [ ] T-022 Create `packages/design/dev/components/components/PlateDemo.tsx` — renders EuropaPlate with content. Styled with `var(--europa-*)` only
- [ ] T-023 Create `packages/design/dev/components/components/StackDemo.tsx` — renders EuropaStack with child buttons. Styled with `var(--europa-*)` only
- [ ] T-024 Create `packages/design/dev/components/components/ContainerDemo.tsx` — renders EuropaContainer with content. Styled with `var(--europa-*)` only
- [ ] T-025 Create `packages/design/dev/components/components/PageDemo.tsx` — renders EuropaPage with content. Styled with `var(--europa-*)` only
- [ ] T-026 Create `packages/design/dev/components/components/ChipDemo.tsx` — renders EuropaChip with count and label variants. Styled with `var(--europa-*)` only
- [ ] T-027 Create `packages/design/dev/components/components/BadgeDemo.tsx` — renders EuropaBadge default variant. Styled with `var(--europa-*)` only
- [ ] T-028 Create `packages/design/dev/components/components/BannerDemo.tsx` — renders EuropaBanner with status and alert variants, framed in a positioned container. Styled with `var(--europa-*)` only
- [ ] T-029 Create `packages/design/dev/components/components/TypographyDemo.tsx` — renders EuropaTypography with all variants (heading/subheading/body/label/caption). Styled with `var(--europa-*)` only
- [ ] T-030 Create `packages/design/dev/components/components/GridDemo.tsx` — renders EuropaGrid with sidebar and wrap variants. Styled with `var(--europa-*)` only
- [ ] T-031 Create `packages/design/dev/components/components/WaitingDemo.tsx` — renders EuropaWaiting with message and reduced-motion variants. Styled with `var(--europa-*)` only
- [ ] T-032 Create `packages/design/dev/components/components/ModalDemo.tsx` — renders EuropaModal in a framed container with title, body, and action buttons. Includes local `EuropaModalActions` helper. Styled with `var(--europa-*)` only
- [ ] T-033 Create `packages/design/dev/components/components/index.ts` — barrel exporting all 13 generic demo components + a `GENERIC_DESCRIPTORS` array mapping section IDs to components
- [ ] T-034 Create `packages/design/dev/components/primitives/TroopChipDemo.tsx` — renders EuropaTroopChip with owner variants (1-4 + undefined) and count. Styled with `var(--europa-*)` only
- [ ] T-035 Create `packages/design/dev/components/primitives/CityMarkerDemo.tsx` — renders EuropaCityMarker with owner variants (1-4). Styled with `var(--europa-*)` only
- [ ] T-036 Create `packages/design/dev/components/primitives/PipeSlopeDemo.tsx` — renders EuropaPipeSlope with direction variants (downhill/flat/uphill/stalled). Styled with `var(--europa-*)` only
- [ ] T-037 Create `packages/design/dev/components/primitives/ElevationSwatchDemo.tsx` — renders EuropaElevationSwatch at elevations 0/25/50/75/100. Styled with `var(--europa-*)` only
- [ ] T-038 Create `packages/design/dev/components/primitives/PlayerBadgeDemo.tsx` — renders EuropaPlayerBadge with player variants (1-4). Styled with `var(--europa-*)` only
- [ ] T-039 Create `packages/design/dev/components/primitives/FogOverlayDemo.tsx` — renders EuropaFogOverlay in framed containers (visible and hidden). Styled with `var(--europa-*)` only
- [ ] T-040 Create `packages/design/dev/components/primitives/ReserveIndicatorDemo.tsx` — renders EuropaReserveIndicator at percentages 0/30/60/90. Styled with `var(--europa-*)` only
- [ ] T-041 Create `packages/design/dev/components/primitives/index.ts` — barrel exporting all 7 primitive demo components + a `PRIMITIVE_DESCRIPTORS` array mapping section IDs to components

---

## Phase 5: Tests

**Purpose**: Migrate existing preview tests and add new tests for the unified dev page.

- [ ] T-042 [P] Create `packages/design/tests/dev-page.test.ts` — new tests: sidebar renders all 3 category groups with correct items (25 total sections); invalid hash shows no active item without crash; all 20 component section IDs exist in the DOM; token documentation reads from `TOKENS` source (assert `buildTokenGroups` output length matches `Object.keys(TOKENS).length`)
- [ ] T-043 [P] Create `packages/design/tests/shell-css.test.ts` — reads `dev/styles/shell.css`, asserts no hex literals (`/#[0-9a-fA-F]{3,8}\b/`) and no rgb/rgba literals (`/rgba?\s*\(/`) in property values (excluding `var()` references and the light theme override block which legitimately redefines values). Covers SC-014
- [ ] T-044 [P] Add theme toggle tests to `packages/design/tests/dev-page.test.ts` — toggle sets `data-theme="light"` on `document.documentElement`; toggle persists to `localStorage`; loading reads persisted theme; localStorage unavailable doesn't crash. Covers SC-015
- [ ] T-045 [P] Add responsive layout tests to `packages/design/tests/dev-page.test.ts` — assert sidebar CSS contains media query for 768px; assert layout grid is defined; smoke test that component renders without errors. Covers SC-016
- [ ] T-046 Update `packages/design/tests/preview.test.ts` — remove tests that are no longer applicable (e.g., "links to dist/design.css", "imports main.ts as a module" — these tested the old preview HTML shell). Keep and update: contrast helper tests, token builder tests, CSS compliance tests (now read `shell.css`), token contract tests. Final count should be ~30-35 tests (down from 39 due to removed HTML structure tests)
- [ ] T-047 Run `pnpm --filter @europa/design test` — verify all existing + new tests pass. Coverage should remain ≥80% on every metric

---

## Phase 6: Cleanup and Integration

**Purpose**: Remove old directories, update configs, verify end-to-end.

- [ ] T-048 Delete `packages/design/preview/` directory (index.html + main.ts) — all content migrated to `dev/`
- [ ] T-049 Delete `packages/design/playground/` directory (index.html + main.tsx + vite.config.ts) — all content migrated to `dev/`
- [ ] T-050 Update `packages/design/package.json` — remove `"dev:build"` script if it referenced `playground`; verify `"dev"` script points to new location
- [ ] T-051 Audit `biome.jsonc` and CI workflows (`client-ci.yml`, `pages-deploy.yml`, `version-drift.yml`) for any `preview/` or `playground/` path references. Update to `dev/` paths if found
- [ ] T-052 [P] Update `packages/design/README.md` — document the unified dev page: how to run `pnpm dev`, what sections are available, how to add new token/component demos
- [ ] T-053 Run `pnpm --filter @europa/design typecheck` — verify TypeScript strict mode passes for all new files
- [ ] T-054 Run `pnpm --filter @europa/design lint` — verify Biome lint passes
- [ ] T-055 Run `pnpm --filter @europa/design format:check` — verify formatting passes
- [ ] T-056 Run `pnpm verify` (or `bash scripts/verify.sh`) — full repo verification gate. All 10 phases must pass

---

## Wave 7: Final Verification

**Purpose**: End-to-end validation that the unified page works correctly.

- [ ] T-057 Manual smoke test: run `pnpm dev` in `packages/design`, open in browser, verify: sidebar renders with 3 categories, clicking a link scrolls to the section, all 20 component demos render, token documentation shows current values, theme toggle switches between dark and light, page is responsive at mobile width
- [ ] T-058 Verify SC-013: single dev page replaces both surfaces — `preview/` and `playground/` directories are gone, `pnpm dev` serves one page with all content
- [ ] T-059 Verify SC-014: page shell contains zero hardcoded literals — `shell-css.test.ts` passes
- [ ] T-060 Verify SC-015: theme toggle works end-to-end — `dev-page.test.ts` theme tests pass
- [ ] T-061 Verify SC-016: responsive layout works — `dev-page.test.ts` responsive tests pass
- [ ] T-062 Verify SC-017: token dynamic rendering — `dev-page.test.ts` token source test passes

---

## Dependencies & Execution Order

```
Phase 1 (T-001 → T-003)
    └── Phase 2 (T-004 → T-014) — blocks all content
        ├── Phase 3 (T-015 → T-019) — foundations, can parallelize within phase
        ├── Phase 4 (T-020 → T-041) — components, can parallelize within phase
        └── Phase 5 (T-042 → T-047) — tests, can parallelize within phase
            └── Phase 6 (T-048 → T-056) — cleanup
                └── Wave 7 (T-057 → T-062) — final verification
```

### Parallel Opportunities

- **T-001 + T-002**: contrast.ts and token-utils.ts are independent extractions (token-utils imports contrast, but can be written in parallel since the interface is known)
- **T-004 + T-005 + T-006**: index.html, vite.config.ts, and main.tsx are independent files
- **T-008 + T-009**: useHashRoute and useTheme are independent hooks
- **T-015 through T-019**: all 5 foundation components are independent
- **T-020 through T-041**: all 20 component demos are independent (each imports its own component from `src/components/`)
- **T-042 through T-045**: all test files are independent
- **T-050 + T-051 + T-052**: package.json, CI configs, README are independent
- **T-053 + T-054 + T-055**: typecheck, lint, format:check are independent

---

## Notes

- Every file in `dev/` must use `var(--europa-*)` for ALL visual styling in the page shell (sidebar, layout, section containers, theme toggle). Component demo content (e.g., hardcoded text inside a demo) may use plain text but the demo containers and labels must use tokens.
- The `applyTokenVariables()` function from the playground (`main.tsx` lines 61-78) must be replicated in `dev/main.tsx` — it iterates `TOKENS` and sets CSS custom properties on `:root` so the catalog CSS can consume them at dev time without a build step.
- The playground's `EuropaModalActions` helper (a simple `<div slot="actions">` wrapper) moves into `ModalDemo.tsx` as a local component — it is not exported or shared.
- Hash route IDs must match the spec Clarifications v1.3 list exactly: `#colors`, `#typography`, `#spacing`, `#a11y`, `#tokens`, `#page`, `#card`, `#plate`, `#stack`, `#container`, `#badge`, `#grid`, `#banner`, `#chip`, `#typography-component`, `#waiting`, `#button`, `#modal`, `#cell`, `#board`, `#pipe`, `#city`, `#troop`, `#fog`, `#hud`.
