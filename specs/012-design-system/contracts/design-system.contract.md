# Contract: Europa Neo Design System (`@europa/design`)

**Feature**: `012-design-system` (issue #25) | **Date**: 2026-08-30 | **Spec**: [`specs/012-design-system/spec.md`](../spec.md)

This contract pins the public surface of `@europa/design` and the `DESIGN.md` contract file that governs it. It is the normative reference for drift checks: byte-identity of mirrors and catalog-vs-code coverage are checked against this document, not proxied through comments.

> **Versioning**: this file lives inside `specs/012-design-system/contracts/` so Biome excludes it via `!specs/*/contracts/**` — the exact values here are formatted for stability and are the drift-test mirrors. Changing a token value/class without updating this contract's equivalent enumeration is itself a drift failure (the spec's "specs stay truthful" rule).

---

## 1. Package surface

### 1.1 Workspace identity

| Field | Requirement | Drift check |
|-------|-------------|-------------|
| `name` | `@europa/design` | `packages/design/package.json#name` |
| `private` | `true` | `package.json` `private === true` |
| `version` | `0.1.0` lockstep (current lockstep value per spec Clarifications v1.0) | `version:check` — must equal root `package.json#version`, `APP_VERSION` in `packages/version/src/app-version.ts`, and the `DESIGN.md` version header (§5). Promotion presumes `pnpm version:check` covers `packages/design/package.json` and `DESIGN.md` (FR-020). |
| `dependencies` | zero own `dependencies` (empty object or absent) | `Object.keys(pkg.dependencies||{}).length === 0` |
| `files` | must expose `dist` (built `dist/design.css` + `dist/index.{js,d.ts}`) | CI asserts `dist/design.css` exists at HEAD |
| `exports` | `"."` exports `dist/index.{js,d.ts}`; optional `"./tokens"` subpath exports the same module | `package.json#exports` shape |
| `engines` / build | `tsup` + `typescript` (catalog versions) per `pnpm-workspace.yaml` catalog | No runtime dep on `react`/`vite`/`ws` etc. |
| TypeScript | `tsconfig.json` extends `tsconfig.base.json` (`strict: true` + friends) | `tsc --noEmit` in `packages/design` |

### 1.2 TypeScript token surface — `src/tokens.ts` / `dist/index.{js,d.ts}`

The package exports one token module. The canonical shape (export names are part of the contract; renaming requires a major-bump discussion per FR-007/FR-019):

```ts
// packages/design/src/tokens.ts — literal-typed, strict, no any
export const TOKENS = {
  color: {
    pageBg: '#0b0f19',            // --europa-color-page-bg
    surface: '#111827',            // --europa-color-surface
    surfaceRaised: '#1f2937',      // --europa-color-surface-raised
    voidBg: '#1a2233',              // --europa-color-void
    border: '#374151',              // --europa-color-border
    textPrimary: '#f9fafb',         // --europa-color-text-primary
    textSecondary: '#e5e7eb',       // --europa-color-text-secondary
    textMuted: '#9ca3af',           // --europa-color-text-muted
    accent: '#f59e0b',              // --europa-color-accent
    city: '#fbbf24',                // --europa-color-city
    banner: '#d97706',              // --europa-color-banner
    red: '#dc2626',                  // --europa-color-red
    green: '#059669',                // --europa-color-green
    blue: '#2563eb',                 // --europa-color-blue
    // water/land/combat/capture tokens — hex + HSL constants per palette heritage
    water: '#1d4ed8',                // --europa-color-water
    landHue: 120,                    // --europa-land-hue (number, not color)
    landSaturationPct: 12,           // --europa-land-saturation
    landMinLightnessPct: 26,         // --europa-land-min-lightness
    landMaxLightnessPct: 62,         // --europa-land-max-lightness
    focusRing: '#ffffff',            // --europa-color-focus-ring
    chipBg: '#111827',               // --europa-color-chip-bg  (mirrors surface; explicit for pairing table)
    chipText: '#f9fafb',             // --europa-color-chip-text
    combatEffect: 'rgba(239, 68, 68, 0.55)',
    captureEffect: 'rgba(16, 185, 129, 0.55)',
    genericEffect: 'rgba(148, 163, 184, 0.45)',
  },
  typography: {
    fontStack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    // scale / line-heights below are illustrative; exact values are codified from the current console's implicit scale
    // and enumerated in DESIGN.md token tables — drift test asserts the enumeration, not the illustrative numbers here
    scaleBase: '1rem',
    scaleSm: '0.85rem',
    scaleXs: '0.75rem',
    lineHeightBase: '1.5',
    // …
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    // … full scale per FR-003 bullet — every value used by HUD/lobby/modal/manual layout
  },
  radii: {
    plate: '8px',      // --europa-radii-plate
    card: '6px',       // --europa-radii-card
    input: '4px',      // --europa-radii-input
    pill: '999px',     // --europa-radii-pill
  },
  borders: {
    width: '1px',
    style: 'solid',
    // color is always via --europa-color-border, not a bare border token
  },
  shadows: {
    // explicitly named even when "none" initially (FR-003) so later addition is additive
    board: 'none',
    plate: 'none',
    modal: 'none',
  },
  focusRing: {
    width: '2px',
    style: 'solid',
    color: '#ffffff',
    offset: '2px',
  },
  motion: {
    durationMs: 120,
    easing: 'ease',
    // decorative transitions only; guarded by prefers-reduced-motion (§4)
  },
} as const;
```

> **Authoritative note**: the contract pins the **required groups and required colors** above exactly (pageBg/surface/surfaceRaised/void/border/textPrimary/textSecondary/textMuted/accent/city/banner/red/green/blue/water + land HSL + focusRing/chipBg/chipText). Additional typography/spacing/radii values beyond those shown are additive and are enumerated in `DESIGN.md` token tables — any value present in code must appear there (INV-D1), but this contract does not freeze the full illustrative scale beyond the named required rows. The drift test's assertion is "no orphan in either direction," not "only these rows may exist."

Each leaf carries its CSS variable name as the `cssVar` mapping (the JS key is the TS constant name; the CSS var is `--europa-{group}-{kebab(name)}`). The emitter (`scripts/build-css.ts`) iterates the table in **sorted key order** to make `dist/design.css` deterministic.

**Invariant G-01**: for every token in the table, `getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() === value` after importing `dist/design.css` (tested via a fixture document in browser vitest). No `var()` wrapper in the token table itself — indirection lives in consumer CSS.

---

## 2. Stylesheet surface — `dist/design.css` / `docs/manual/assets/design.css`

### 2.1 Determinism contract

* The file is LF-only, UTF-8, no BOM, no timestamp comment. Keys are emitted in locale-insensitive lexicographic order. Repeated builds from the same `tokens.ts` are byte-identical (SC-003 hash).
* `docs/manual/assets/design.css` is the tracked vendored copy of this file. `sha256(dist/design.css) === sha256(docs/manual/assets/design.css)` at every commit (G-05). The vendor step (`packages/design/scripts/vendor-to-docs.ts`) is idempotent.

### 2.2 CSS variable layer

The first section of `dist/design.css` is exactly one `:root` block declaring every `--europa-*` variable from the token table (FR-004), e.g.:

```css
:root {
  --europa-color-page-bg: #0b0f19;
  --europa-color-surface: #111827;
  /* … every color/typography/spacing/radii/border/shadow/focus/motion var exactly once … */
}
```

* Count = number of leaves in `TOKENS`. No duplicates, no extras, no computed values — canonical literals only.
* Motion tokens that are numbers (duration) are emitted as `ms` lengths.

### 2.3 Class-name catalog — `europa-*`

The remainder of `dist/design.css` defines exactly the component families listed in [`data-model.md §2`](../data-model.md) plus any additives enumerated in `DESIGN.md`. Every declaration references only `var(--europa-*)` (or the single `// design-exception: canvas fallback` line, see §6). Each family is pinned here and in `DESIGN.md`:

| Selector family | Tokens it must compose | Forbidden |
|-----------------|------------------------|-----------|
| `.europa-page`, `.europa-stack` | spacing, typography | no literal color |
| `.europa-card`, `.europa-plate` | color.surface, border, radii.plate, spacing | — |
| `.europa-button`, `.europa-button--primary/secondary/ghost`, `:disabled`, `:focus-visible` | color.* , spacing, radii, focusRing | no `outline: none` without `focus-visible` replacement — fails FR-016 |
| `.europa-banner` | color.banner, color.surface/text, typography, spacing | — |
| `.europa-hud*` | typography, color.text*, spacing | — |
| `.europa-lobby*` (page/grid/card/row/badge/empty/superseded) | spacing, radii, color.*, typography | — |
| `.europa-chip`, `.europa-badge` | color.chipBg/chipText/accent/city, radii.pill | — |
| `.europa-modal*` (backdrop/dialog/title/body/actions/button) | color.surface, border, typography, spacing, shadows.modal | — |
| `.europa-grid`, `.europa-grid--*` | spacing | — |
| `.europa-typography--heading/muted/meta/mono` | typography, color.text* | muted is `--europa-color-text-muted` on `--europa-color-surface`; ratio ≈ 6.99:1, ≥ 4.5:1 |
| `.europa-focus-ring` / `*:focus-visible` rule | focusRing.* | visible white 2px solid + 2px offset on dark (FR-016) |
| `.europa-*` layout containers | spacing, typography | — |

**Naming invariant (FR-007)**: every selector is `europa-*` or a necessary pseudo/element thereof (`:hover`, `:focus-visible`, `:disabled`, `::backdrop`). Renaming any listed class or any `--europa-*` variable is a **breaking change** requiring a major bump + migration note in `DESIGN.md` (FR-019). Additive variants (new `--primary`, new `europa-*-loud`) are non-breaking.

**Existence invariant G-03**: the set of `europa-*` selectors parsed from `dist/design.css` and the set enumerated in `DESIGN.md` component catalog are equal (no undocumented visual class, no catalog entry without a rule). The drift helper regex-parses both and fails naming the orphan.

---

## 3. Derive bridge — `packages/console/src/render/palette.ts`

Not owned by `@europa/design` but **constrained by it**. After migration `palette.ts` must satisfy:

```ts
import { TOKENS } from '@europa/design';
export const VOID_COLOR: string = TOKENS.color.voidBg;
export const PAGE_BACKGROUND_COLOR: string = TOKENS.color.pageBg;
// … every color constant is an alias into TOKENS — no inline hex …
export function terrainColor(terrain: 'land' | 'water', elevation: number): string {
  // land path interpolates TOKENS.color.landMinLightnessPct → landMaxLightnessPct at landHue/landSaturationPct
}
```

* Allowed: computed composition over `TOKENS.*` (e.g. `hsl(${TOKENS.color.landHue} ...)`).
* Forbidden: any `/#[0-9a-fA-F]{3,8}\b/` or `/rgba?\(/` literal inside `palette.ts` or anywhere else in `packages/console/src` except the one line-scoped `// design-exception` fallback (FR-009 + §6). The drift helper's deny-list covers this.
* Invariant G-04 asserts the file contains no bare hex and the import graph has exactly one `@europa/design` import.

---

## 4. Accessibility contract — WCAG 2.2 AA encoding

Every contrast pairing is both tabulated in `DESIGN.md` and asserted by a **computed-style test** that renders a fixture importing `dist/design.css` and measures the contrast via the WCAG relative-luminance formula, not by reading a comment.

| Pairing (foreground on background) | Canonical values | Approx. ratio | Target |
|-----------------------------------|------------------|---------------|--------|
| `textPrimary` on `surface` (chip) | `#f9fafb` on `#111827` | ≈ 16.98:1 | ≥ 4.5:1 (AA normal) |
| `textSecondary` on pageBg | `#e5e7eb` on `#0b0f19` | ≈ 15.47:1 | ≥ 4.5:1 |
| `textMuted` on surface (muted line) | `#9ca3af` on `#111827` | ≈ 6.99:1 | ≥ 4.5:1 |
| `surface` text on banner (`#111827` on `#d97706`) | — | ≈ 5.57:1 | ≥ 4.5:1 |
| Focus ring `#fff` on plate `#111827` (WCAG 2.4.7 non-text) | — | ≈ 17.74:1 | ≥ 3:1 vs adjacent |
| Water tile labelled separately (blue pair) | — | measured | ≥ 3:1 large/AA |

*Ratios above are the **measured** values from `DESIGN.md` § 3 (computed via the WCAG relative-luminance formula), not planning-time estimates. Every critical chrome pairing still clears its AA target. `DESIGN.md` § 3 is authoritative; this table mirrors it.*

*Focus-visible (WCAG 2.4.7)*: every interactive component (`button`, `gridcell`/`grid`, lobby controls, modal controls) must expose a `:focus-visible { outline: 2px solid var(--europa-color-focus-ring); outline-offset: var(--europa-focus-ring-offset); }` treatment matching the token table. The fixture test tab-cycles the console + manual page and asserts a visible outline of the token thickness on every interactive surface; axe-core scans remain green.

*Reduced motion (WCAG 2.3.3)*: the stylesheet gates decorative animations behind:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

plus the existing console class `.europa-waiting--reduced`. A browser test with `prefers-reduced-motion: reduce` emulated asserts the waiting spinner's animation is `none`/duration ≤ 0.01ms. No decorative animation may run when the preference is set.

*Color-alone prohibition (Principle VI + FR-008)*: each catalog entry names the redundant encoding — chip = pill + numeric label, badge = amber edge + text, rows = position + label — and the catalog row is required to include a "not color alone: …" sentence; the coverage test asserts the sentence exists.

---

## 5. `DESIGN.md` header — version marker format

The living contract at the repo root `DESIGN.md` carries a machine-readable version header (research R8). The exact marker is:

```markdown
> **Version**: `0.1.0`
```

* The drift helper extracts it with `/Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/` — quoted and unquoted both match, but the canonical formatting above is required to pass `biome format:check`.
* The value must equal `packages/design/package.json#version` equals `packages/version/src/app-version.ts` `APP_VERSION` equals every `packages/*/package.json#version` at HEAD (INV-D5 / G-06). `pnpm version:check` (extended to read `DESIGN.md` + `packages/design/package.json`) fails naming every disagreeing file, per spec 009's existing message convention.
* `packages/design/README.md` is a short prose file that states "The authoritative design contract is `DESIGN.md` at the repo root." and **contains no competing token/component tables** (FR-017 last sentence). Presence of a second table is a drift failure.

---

## 6. Single-exception allow-list

FR-009 and spec Edge Cases allow at most one narrowly-scoped canvas fallback where a CSS variable is "not addressable without JS." If such a line exists after migration it must be:

* Identified by a preceding line comment `// design-exception: canvas fallback — spec Edge Cases § pit` (or the trailing `/* design-exception: canvas fallback */`) **on the same line** or the immediately preceding line — the deny-list scanner is line-scoped.
* A single occurrence; two exemptions fail G-04.
* Documented in `DESIGN.md` § Edge Cases with the exact file:line and the rationale.

Any other hex/rgb literal in `packages/console/src/**` or `docs/manual/**` outside `@europa/design`'s token file and `@europa/design` imports fails G-04 with `file:line — use var(--europa-*)` in the message.

---

## 7. Drift-contract exhaustiveness

This contract is byte-compared by the same invariant suite described in [`data-model.md § Drift Guard`](../data-model.md). The checks that pin this file are:

| Check ID | Mirrored surface |
|----------|------------------|
| G-01 | `tokens.ts` leaves ↔ `:root` `--europa-*` vars in `dist/design.css` |
| G-02 | Token rows in `DESIGN.md` ↔ `TOKENS` leaves |
| G-03 | Component rows in `DESIGN.md` ↔ `.europa-*` selectors in `dist/design.css` |
| G-04 | `packages/console/src/**` + `docs/manual/**` disallow list |
| G-05 | `sha256(dist/design.css) === sha256(docs/manual/assets/design.css)` |
| G-06 | `DESIGN.md` header = `@europa/design` version = `APP_VERSION` = all `package.json`s |
| G-07 | Computed-style contrast assertions for every pairing in `DESIGN.md` a11y table |
| G-08 | `pnpm build:assets` gzip budget < 150 KB (console browser payload) |
| G-09 | `pages-deploy.yml` artifact is exactly `docs/manual` — no `packages/**` leakage |

A missing enumeration here is a drift source — the contract's "no orphan" invariants catch it.

---

## 8. Out-of-scope — what this contract does not promise

* Light-theme variant — variable names are frozen; values are the variable part. A later `html[data-theme="light"] { --europa-color-page-bg: … }` block is additive and does not rename selectors (spec FR-019). No light stylesheet ships in this feature.
* Storybook / visual-regression service — verification is via computed-style assertions + hash checks + human QA (spec Out of Scope).
* Theme engine / CSS-in-JS / runtime theming — `dist/design.css` is static at build/serve time.

