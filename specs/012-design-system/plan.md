# Implementation Plan: Unified Design System Dev Page (Issue #68)

**Branch**: `issue-68-unified-design-system` | **Date**: 2026-09-04 | **Spec**: [`specs/012-design-system/spec.md`](./spec.md) — addendum FR-028–FR-035

**Input**: Feature specification addendum from spec 012 (FR-028–FR-035, SC-013–SC-017). Merges two disconnected dev surfaces — `packages/design/preview/` (static HTML token docs, 39 tests) and `packages/design/playground/` (React component demos, no tests) — into a single Vite-served page.

---

## Summary (FR-028)

Replace the two separate dev surfaces with one unified page at `packages/design/dev/`. The page uses a React shell (Vite + React, same stack as the existing playground) with hash-based sidebar navigation, migrates token documentation from the preview page, migrates all 20 component demos from the playground, adds a dark/light theme toggle with localStorage persistence, and enforces the no-literals invariant on its own page shell. After migration, `packages/design/preview/` and `packages/design/playground/` are removed.

---

## Technical Context

**Stack**: Vite 8 + React 19 (already available via playground's `vite.config.ts` and workspace `devDependencies`). No new dependencies.

**Language**: TypeScript strict mode. The dev page is dev-only infrastructure — not shipped in production bundles.

**Token import (FR-035)**: `TOKENS` from `../src/tokens.ts` (same path both preview and playground already use). Vite resolves this at dev time; no build step needed.

**CSS approach (FR-032)**: The page shell CSS is authored as a module CSS file (`dev/styles/shell.css`) imported by the React entry. All declarations use `var(--europa-*)` tokens. CSS custom properties for the light theme are defined on `:root[data-theme="light"]` inside the same CSS file. No CSS-in-JS, no Tailwind, no external framework.

**Testing**: Vitest (node-mode + happy-dom) for unit tests. Existing preview tests (`tests/preview.test.ts`) are migrated to test the extracted helper functions. New tests cover sidebar navigation, hash routing, theme toggle, responsive behavior, and token dynamic rendering.

**Build/dev command**: `pnpm dev` in `packages/design` runs `vite dev --config dev/vite.config.ts`. The existing `"dev": "vite playground"` script in `package.json` is updated to point at the new location.

---

## Architecture

### Directory Structure

```
packages/design/
├── dev/                              # NEW — unified dev page
│   ├── index.html                    # Minimal HTML shell (<div id="root">)
│   ├── main.tsx                      # React entry: renders <App />
│   ├── vite.config.ts                # Vite config: root '.', esbuild automatic JSX
│   ├── components/
│   │   ├── App.tsx                   # Root layout: sidebar + content + theme provider
│   │   ├── Sidebar.tsx               # Sticky sidebar with categorized nav links
│   │   ├── SectionRouter.tsx         # Hash-based section visibility
│   │   ├── ThemeToggle.tsx           # Dark/light toggle with localStorage
│   │   ├── foundations/
│   │   │   ├── ColorSwatches.tsx     # Color swatch grid with contrast ratios
│   │   │   ├── TypographyScale.tsx   # Type scale samples
│   │   │   ├── SpacingBorders.tsx    # Spacing, borders, shadows token groups
│   │   │   ├── TokenTable.tsx        # Full token table (all groups)
│   │   │   └── A11yPairings.tsx     # Contrast pairings table
│   │   ├── components/
│   │   │   ├── ButtonDemo.tsx        # Button variants × states
│   │   │   ├── CardDemo.tsx          # Card demo
│   │   │   ├── PlateDemo.tsx         # Plate demo
│   │   │   ├── StackDemo.tsx         # Stack demo
│   │   │   ├── ContainerDemo.tsx     # Container demo
│   │   │   ├── PageDemo.tsx          # Page demo
│   │   │   ├── ChipDemo.tsx          # Chip demo
│   │   │   ├── BadgeDemo.tsx         # Badge demo
│   │   │   ├── BannerDemo.tsx        # Banner demo
│   │   │   ├── TypographyDemo.tsx    # Typography component demo
│   │   │   ├── GridDemo.tsx          # Grid demo
│   │   │   ├── WaitingDemo.tsx       # Waiting demo
│   │   │   ├── ModalDemo.tsx         # Modal demo
│   │   │   └── index.ts             # Barrel: SECTION_DESCRIPTORS array
│   │   └── primitives/
│   │       ├── TroopChipDemo.tsx
│   │       ├── CityMarkerDemo.tsx
│   │       ├── PipeSlopeDemo.tsx
│   │       ├── ElevationSwatchDemo.tsx
│   │       ├── PlayerBadgeDemo.tsx
│   │       ├── FogOverlayDemo.tsx
│   │       ├── ReserveIndicatorDemo.tsx
│   │       └── index.ts             # Barrel: PRIMITIVE_DESCRIPTORS array
│   ├── hooks/
│   │   ├── useHashRoute.ts          # Reads/writes location.hash, subscribes to hashchange
│   │   └── useTheme.ts              # Reads/writes localStorage, sets data-theme attr
│   ├── lib/
│   │   ├── contrast.ts              # WCAG contrast helpers (migrated from preview/main.ts)
│   │   ├── token-utils.ts           # toKebabCase, buildColorCategories, buildTokenGroups, etc.
│   │   └── sections.ts              # Merged section registry (foundations + components + primitives)
│   └── styles/
│       └── shell.css                # Page shell CSS — ALL var(--europa-*) only
├── preview/                          # REMOVE after migration
├── playground/                       # REMOVE after migration
├── tests/
│   ├── preview.test.ts              # UPDATE: tests now import from dev/lib/ instead of preview/main.ts
│   ├── dev-page.test.ts             # NEW: sidebar nav, hash routing, theme toggle, responsive
│   └── ...existing tests...
└── package.json                     # UPDATE: "dev" script points to new location
```

### Component Design (FR-029, FR-031)

#### App.tsx (Root)

```
┌─────────────────────────────────────────┐
│ <App>                                   │
│   ┌──────┬──────────────────────────┐   │
│   │Side- │  <SectionRouter>         │   │
│   │bar   │    <ColorSwatches />     │   │
│   │      │    <TypographyScale />   │   │
│   │      │    <SpacingBorders />    │   │
│   │      │    <A11yPairings />      │   │
│   │      │    <TokenTable />        │   │
│   │      │    <ButtonDemo />        │   │
│   │      │    ...                   │   │
│   │      │    <PrimitiveDemos />    │   │
│   │      └──────────────────────────┘   │
│   └──────┘                              │
│   <ThemeToggle /> (inside sidebar)      │
└─────────────────────────────────────────┘
```

- **Props**: none (reads hash from URL, theme from localStorage).
- **State**: `activeSection` (string, from hash), `theme` ('dark' | 'light').
- **Layout**: CSS Grid — sidebar column (fixed 240px) + content column (1fr). On mobile (<768px), sidebar becomes a slide-out drawer.

#### Sidebar.tsx

- Renders three category groups: **Foundations** (5 items), **Generic Components** (13 items), **Game Primitives** (7 items).
- Each item is an `<a href="#section-id">` link.
- Active item highlighted via `aria-current="true"` + CSS class.
- On mobile: hamburger button toggles visibility. Clicking a link closes the drawer.
- Contains the `<ThemeToggle />` at the bottom.

#### SectionRouter.tsx

- Reads `activeSection` from parent state (derived from hash).
- Renders all section components. Sections that don't match the current hash are still in the DOM (for scroll performance) but have `id` attributes for scroll-to.
- Actually, simpler approach: ALL sections are always rendered (the page is a single scrollable document). The hash triggers `scrollIntoView({ behavior: 'smooth', block: 'start' })`. The sidebar highlights the section closest to the viewport using `IntersectionObserver`.

**Revised approach**: No section hiding. The page is a single scrollable document with `id` anchors. Hash navigation scrolls to the section. `IntersectionObserver` updates the active sidebar item. This is simpler, more performant, and matches both the preview and playground patterns.

#### ThemeToggle.tsx

- Button toggling between dark ☾ and light ☀ icons.
- On click: toggles `data-theme` attribute on `<html>`, persists to `localStorage('europa-dev-theme')`.
- On mount: reads `localStorage`, applies saved theme. If unavailable, defaults to dark.
- Light theme: CSS redefines `--europa-*` values on `:root[data-theme="light"]` in `shell.css`.

#### Foundation Sections (from preview) (FR-030)

Each foundation section is a React component that:
1. Imports `TOKENS` from `../../src/tokens.ts`.
2. Uses the migrated contrast helpers from `lib/contrast.ts`.
3. Renders into `europa-*` styled containers.

The vanilla TS DOM manipulation from `preview/main.ts` is converted to React JSX. The helper functions (`buildColorCategories`, `buildTokenGroups`, `buildA11yPairings`, `buildTypeSamples`, contrast ratio functions) are extracted into `lib/token-utils.ts` and `lib/contrast.ts` as pure functions — these are what the existing 39 tests import.

#### Component Demo Sections (from playground) (FR-031)

Each component section is a standalone React component that renders the component with its variant matrix. The playground's `React.createElement` calls are converted to JSX. The `reactDemo` bridge pattern is replaced with direct React rendering.

The `EuropaModalActions` helper (used only in the playground) moves into the modal demo component.

### Hash-Based Routing (FR-029)

```
// useHashRoute.ts
function useHashRoute(): string {
    const [hash, setHash] = useState(window.location.hash.slice(1));

    useEffect(() => {
        const handler = () => setHash(window.location.hash.slice(1));
        window.addEventListener('hashchange', handler);
        return () => window.removeEventListener('hashchange', handler);
    }, []);

    return hash;
}
```

Hash routes defined in `lib/sections.ts`:
- Foundations: `#colors`, `#typography`, `#spacing`, `#a11y`, `#tokens`
- Generic Components: `#page`, `#card`, `#plate`, `#stack`, `#container`, `#badge`, `#grid`, `#banner`, `#chip`, `#typography-component`, `#waiting`, `#button`, `#modal`
- Game Primitives: `#cell`, `#board`, `#pipe`, `#city`, `#troop`, `#fog`, `#hud`

Note: some playground section IDs conflict with foundation IDs (e.g., `#typography`). The unified page uses `#typography-component` for the component demo to avoid collision. The spec Clarifications v1.3 already lists these route names.

### Theme Toggle Mechanism (FR-033)

The light theme is defined entirely in CSS — no JS-side token manipulation:

```css
/* shell.css */
:root[data-theme="light"] {
    --europa-color-page-bg: #f8fafc;
    --europa-color-surface: #ffffff;
    --europa-color-surface-raised: #f1f5f9;
    --europa-color-text-primary: #0f172a;
    --europa-color-text-secondary: #334155;
    --europa-color-text-muted: #64748b;
    --europa-color-border: #e2e8f0;
    --europa-color-accent: #d97706;
    /* ... override all color tokens for light theme ... */
}
```

This approach:
- Reuses the exact same `--europa-*` variable names — all component demos automatically adapt.
- Requires no React context or CSS-in-JS.
- Is scoped to the dev page only (the CSS file is only loaded by the dev page).
- Validates the token namespace admits a future light variant (FR-033's stated purpose).

### Responsive Layout (FR-034)

```css
/* shell.css */
.dev-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100vh;
}

@media (max-width: 768px) {
    .dev-layout {
        grid-template-columns: 1fr;
    }
    .dev-sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        z-index: 1000;
        transform: translateX(-100%);
        transition: transform var(--europa-motion-transition-default) var(--europa-motion-easing);
    }
    .dev-sidebar--open {
        transform: translateX(0);
    }
    .dev-sidebar-overlay {
        display: block; /* semi-transparent backdrop */
    }
}
```

### Test Migration Strategy

**What to keep** (migrate, don't rewrite):
- `parseHex`, `relativeLuminance`, `contrastRatio`, `contrastRatioNumeric` — move to `dev/lib/contrast.ts`. Tests import from new path.
- `buildColorCategories`, `buildTokenGroups`, `buildA11yPairings`, `buildTypeSamples`, `toKebabCase` — move to `dev/lib/token-utils.ts`. Tests import from new path.
- Token contract tests (values match `TOKENS` object) — keep as-is, update import paths.
- CSS compliance tests — adapt: instead of reading `preview/index.html`'s `<style>` block, read `dev/styles/shell.css` and assert no hex/rgb literals.

**What to rewrite**:
- HTML structure tests — instead of checking for `preview-nav`, `preview-hero`, check for the new sidebar/shell structure.
- The "links to dist/design.css" test — the dev page doesn't link to `dist/design.css`; it injects CSS vars at runtime from `TOKENS` (same as playground). This test becomes a no-op or is replaced by a test that verifies `applyTokenVariables()` is called.

**What to add** (new tests):
- `dev-page.test.ts`:
  - Sidebar renders all 3 category groups with correct items.
  - Hash navigation updates active sidebar item.
  - Theme toggle persists to localStorage and applies `data-theme`.
  - Theme toggle works when localStorage is unavailable (no crash).
  - Invalid hash shows no active sidebar item, no crash.
  - All 20 component sections render (smoke test).
  - Token documentation reads from `TOKENS` source (not static copy).
  - Page shell CSS contains no hex/rgb literals (SC-014).

---

## Migration Strategy

### Phase 1: Extract shared logic
1. Extract contrast helpers from `preview/main.ts` → `dev/lib/contrast.ts`.
2. Extract token builders from `preview/main.ts` → `dev/lib/token-utils.ts`.
3. Update `tests/preview.test.ts` imports to point to new locations. Verify all 39 tests pass.

### Phase 2: Build the React shell
4. Create `dev/index.html`, `dev/main.tsx`, `dev/vite.config.ts`.
5. Implement `App.tsx`, `Sidebar.tsx`, `ThemeToggle.tsx`, `useHashRoute.ts`, `useTheme.ts`.
6. Create `dev/styles/shell.css` with all `var(--europa-*)` declarations.
7. Wire `pnpm dev` to the new location.

### Phase 3: Migrate foundations (from preview)
8. Implement `ColorSwatches.tsx`, `TypographyScale.tsx`, `SpacingBorders.tsx`, `A11yPairings.tsx`, `TokenTable.tsx`.
9. These components import from `lib/token-utils.ts` and `lib/contrast.ts`.

### Phase 4: Migrate component demos (from playground)
10. Implement all 13 generic component demo components.
11. Implement all 7 game primitive demo components.
12. Create barrel files and section registry.

### Phase 5: Tests and cleanup
13. Migrate existing preview tests.
14. Add new dev-page tests.
15. Remove `preview/` and `playground/` directories.
16. Update `package.json` dev script.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Router** | Hash-based, no library | NFR-004 simplicity. `window.location.hash` + `hashchange` event. Avoids adding a router dependency. |
| **Theme toggle** | CSS-only `data-theme` attribute redefinition | No JS token manipulation. All components auto-adapt via CSS variables. Scoped to dev page CSS only. |
| **Section rendering** | All sections always in DOM (scrollable document) | Simpler than conditional rendering. `IntersectionObserver` for active state. Matches both preview and playground patterns. |
| **Token import** | Direct import from `src/tokens.ts` | Same path preview and playground already use. Vite resolves at dev time. No build step needed (FR-035). |
| **CSS file** | Module CSS file (`shell.css`) imported by React | All `var(--europa-*)` only. Light theme overrides in same file. No CSS-in-JS. |
| **Test location** | `tests/preview.test.ts` (updated) + `tests/dev-page.test.ts` (new) | Keeps test count visible. Existing test file path preserved for CI continuity. |
| **Vanilla TS → React** | Extract helpers as pure functions, rewrite DOM manipulation as JSX | Clean separation: pure logic in `lib/`, rendering in React components. Tests exercise the pure functions directly. |

---

## Verification Plan

| Spec SC | How this plan covers it |
|---------|-------------------------|
| **SC-013** Single dev page | `pnpm dev` serves one page. `preview/` and `playground/` removed. All 5 foundation sections + 20 component sections present. |
| **SC-014** Page shell token-verified | Test asserts `shell.css` contains no hex/rgb literals. Grep check runs in CI. |
| **SC-015** Theme toggle end-to-end | Test: toggle → check computed styles change → reload → check localStorage persisted → toggle back. |
| **SC-016** Responsive layout | Test: render at 320px (sidebar collapsed), 768px (sidebar visible), 1200px (full layout). No horizontal overflow on layout chrome. |
| **SC-017** Token dynamic rendering | Test: import TOKENS, verify token doc sections reflect current TOKENS values. Adding/removing tokens in source auto-reflects. |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Playground's `reactDemo` pattern (separate `createRoot` per demo) doesn't map cleanly to React | Low | Low | Replace with direct JSX rendering — the `createRoot` wrappers were a workaround for mixing DOM and React, which the unified React shell doesn't need. |
| Light theme values incomplete → invisible text | Med | Med | Define light overrides for ALL color tokens in `shell.css`. Test computed styles in both themes. |
| `IntersectionObserver` not available in test env | Low | Low | happy-dom doesn't support it; mock or test active state via hash change + scroll instead. |
| Removing `preview/` breaks existing CI paths | Low | Med | Audit `client-ci.yml` and `biome.jsonc` for `preview/` or `playground/` references. Update paths in same change set. |
