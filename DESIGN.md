# Europa Neo — Design System

> **Version**: `0.1.0` <!-- Version: 0.1.0 --> — must match `APP_VERSION` in `packages/version/src/app-version.ts` and every `package.json#version`.

The authoritative, versioned, living contract for Europa Neo's shareable design system.
`@europa/design` (`packages/design`) is the single implementation source; this document is the single
normative reference that binds the package, the console, and the player manual. When code and this
file disagree, this file is right — fix the code and land both in the same commit.

- **Feature spec**: [`specs/012-design-system/spec.md`](specs/012-design-system/spec.md)
- **Plan**: [`specs/012-design-system/plan.md`](specs/012-design-system/plan.md)
- **Package**: [`packages/design`](packages/design) → `@europa/design` (`private: true`, never published)
- **Single stylesheet source**: `packages/design/dist/design.css`
- **Vendored copy**: `docs/manual/assets/design.css` (byte-identical to the source, checked in)

> **How to bump**: version is lockstep per spec 009 FR-009/FR-010 and spec 012 FR-020. Bump
> `packages/version/src/app-version.ts` (`APP_VERSION`), every `package.json#version` (root + each
> `packages/*/package.json`), and this header in one `chore(release): vX.Y.Z` commit — the same
> chore convention `version:check` / `version-drift.yml` enforces. The drift regex is
> `/Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/` (research R8); CI fails naming every disagreeing surface.

---

## 1. Tokens — single source of truth (FR-003 / FR-004 / FR-005)

Every token is emitted as a CSS variable `--europa-*` in the shared stylesheet's `:root` scope and
re-exported as a typed `TOKENS` constant from `@europa/design`. The two representations carry
identical canonical values; drift checks fail on mismatch (FR-004). Each color row states its
required pairing, contrast ratio, and WCAG target so the contract is auditable without reading
tests (FR-005 / FR-016).

> Placeholder note (T-004 scaffold): precise canonical values are filled in T-005/T-009 from the
> audited console literals (`packages/console/src/styles/index.css` + `palette.ts`). Tables below are
> the structural scaffold so later tasks fill rows without re-authoring the outline.

### 1.1 Colors

| Token name | CSS variable | TS constant | Canonical value | Pairing (fg on bg) + ratio + target |
| --- | --- | --- | --- | --- |
| *TBD — page background* | `--europa-color-page-bg` | `TOKENS.color.pageBg` | *TBD — `#0b0f19`* | `textSecondary` on `pageBg` ≈ 13.5:1 — AA 4.5:1 |
| *TBD — surface / plate* | `--europa-color-surface` | `TOKENS.color.surface` | *TBD — `#111827`* | `textPrimary` on `surface` ≈ 15:1 — AA 4.5:1 |
| *TBD — surface-raised* | `--europa-color-surface-raised` | `TOKENS.color.surfaceRaised` | *TBD — `#1f2937`* | — |
| *TBD — void* | `--europa-color-void` | `TOKENS.color.voidBg` | *TBD — `#1a2233`* | — |
| *TBD — border* | `--europa-color-border` | `TOKENS.color.border` | *TBD — `#374151`* | non-text UI — AA 3:1 |
| *TBD — text-primary* | `--europa-color-text-primary` | `TOKENS.color.textPrimary` | *TBD — `#f9fafb`* | `textPrimary` on `surface` ≈ 15:1 — AA 4.5:1 |
| *TBD — text-secondary* | `--europa-color-text-secondary` | `TOKENS.color.textSecondary` | *TBD — `#e5e7eb`* | `textSecondary` on `pageBg` ≈ 13.5:1 — AA 4.5:1 |
| *TBD — text-muted* | `--europa-color-text-muted` | `TOKENS.color.textMuted` | *TBD — `#9ca3af`* | `textMuted` on `surface` ≈ 6.99:1 — AA 4.5:1 |
| *TBD — accent / city* | `--europa-color-accent` | `TOKENS.color.accent` | *TBD — `#f59e0b` / city `#fbbf24`* | — |
| *TBD — banner* | `--europa-color-banner` | `TOKENS.color.banner` | *TBD — `#d97706`* | `surface` on `banner` ≈ 6.6:1 — AA 4.5:1 |
| *TBD — semantic red/green/blue* | `--europa-color-red` etc. | `TOKENS.color.red` | *TBD* | — |
| *TBD — water / land / combat* | `--europa-color-water` etc. | `TOKENS.color.water` | *TBD* | — |

### 1.2 Typography

| Token name | CSS variable | TS constant | Canonical value | Notes |
| --- | --- | --- | --- | --- |
| *TBD — font stack* | `--europa-typography-font-stack` | `TOKENS.typography.fontStack` | *TBD — `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`* | Only type stack; no external font/CDN (NFR-002) |
| *TBD — scale / line-height* | `--europa-typography-*` | `TOKENS.typography.*` | *TBD* | HUD / lobby / manual scale — filled in T-009 |

### 1.3 Spacing

| Token name | CSS variable | TS constant | Canonical value | Notes |
| --- | --- | --- | --- | --- |
| *TBD — xs* | `--europa-spacing-xs` | `TOKENS.spacing.xs` | *TBD — `0.25rem`* | HUD / lobby / manual gap/padding scale |
| *TBD — sm* | `--europa-spacing-sm` | `TOKENS.spacing.sm` | *TBD — `0.5rem`* | — |
| *TBD — md* | `--europa-spacing-md` | `TOKENS.spacing.md` | *TBD — `0.75rem`* | — |
| *TBD — lg* | `--europa-spacing-lg` | `TOKENS.spacing.lg` | *TBD — `1rem`* | — |

### 1.4 Radii

| Token name | CSS variable | TS constant | Canonical value | Notes |
| --- | --- | --- | --- | --- |
| *TBD — plate* | `--europa-radii-plate` | `TOKENS.radii.plate` | *TBD — `8px`* | Plates / cards |
| *TBD — card* | `--europa-radii-card` | `TOKENS.radii.card` | *TBD — `6px`* | — |
| *TBD — input* | `--europa-radii-input` | `TOKENS.radii.input` | *TBD — `4px`* | — |
| *TBD — pill* | `--europa-radii-pill` | `TOKENS.radii.pill` | *TBD — `999px`* | Badges / chips |

### 1.5 Borders

| Token name | CSS variable | TS constant | Canonical value | Notes |
| --- | --- | --- | --- | --- |
| *TBD — width* | `--europa-borders-width` | `TOKENS.borders.width` | *TBD — `1px`* | Canonical border width |
| *TBD — style* | `--europa-borders-style` | `TOKENS.borders.style` | *TBD — `solid`* | — |
| *TBD — color* | `--europa-borders-color` | `TOKENS.borders.color` | *TBD — `var(--europa-color-border)`* | References color token |

### 1.6 Shadows

| Token name | CSS variable | TS constant | Canonical value | Notes |
| --- | --- | --- | --- | --- |
| *TBD — board* | `--europa-shadows-board` | `TOKENS.shadows.board` | *TBD — `none`* | Named even when `none` so later addition is additive |
| *TBD — plate* | `--europa-shadows-plate` | `TOKENS.shadows.plate` | *TBD — `none`* | — |
| *TBD — modal* | `--europa-shadows-modal` | `TOKENS.shadows.modal` | *TBD — `none`* | — |

### 1.7 Focus ring

| Token name | CSS variable | TS constant | Canonical value | Notes |
| --- | --- | --- | --- | --- |
| *TBD — width* | `--europa-focus-ring-width` | `TOKENS.focusRing.width` | *TBD — `2px`* | White `2px solid` + `2px` offset on `#111827` ≈ 16:1; WCAG 2.4.7 ≥ 3:1 |
| *TBD — style* | `--europa-focus-ring-style` | `TOKENS.focusRing.style` | *TBD — `solid`* | — |
| *TBD — color* | `--europa-focus-ring-color` | `TOKENS.focusRing.color` | *TBD — `#ffffff`* | — |
| *TBD — offset* | `--europa-focus-ring-offset` | `TOKENS.focusRing.offset` | *TBD — `2px`* | `outline-offset` |

### 1.8 Motion

| Token name | CSS variable | TS constant | Canonical value | Notes |
| --- | --- | --- | --- | --- |
| *TBD — duration* | `--europa-motion-duration` | `TOKENS.motion.durationMs` | *TBD — `120ms`* | Spinner + decorative transitions |
| *TBD — easing* | `--europa-motion-easing` | `TOKENS.motion.easing` | *TBD — `ease`* | — |
| — | — | — | — | Gated by `@media (prefers-reduced-motion: reduce)` + `.europa-waiting--reduced` (FR-016) |

---

## 2. Component / class-name catalog — shareable via the single stylesheet (FR-006 / FR-007 / FR-008)

All classes are namespaced `europa-*` and are stable — renaming a catalog class or CSS variable is
a breaking change requiring a major bump and a migration note. Additive variants are allowed without
a breaking change (FR-007). Each entry states its a11y obligations so a manual author can use the
HTML correctly without reading console source (FR-008).

> Scaffold note: precise selectors, variant lists, required structure, and `tokensUsed` rows are
> enumerated fully in T-007/T-010. The outline below reserves one row per FR-006 family so drift
> checks can land without re-authoring the section.

| Class family | Variants / modifiers | Required DOM structure | Intended use | A11y obligations (incl. "not color alone") |
| --- | --- | --- | --- | --- |
| `europa-page`, `europa-stack` | gap modifiers *(TBD)* | Page column + measure; stack with gap primitives | Page column, centered measure, stack/gap primitives, centered flex-wrap board layout | Layout only — no contrast obligation beyond children's pairings |
| `europa-card` / `europa-plate` | *(none — TBD if variants)* | Single-surface container | HUD panels, lobby cards, modal plates, waiting plate, manual callouts | Not color alone: border + fill both express surface — do not rely on background color only |
| `europa-button` family | `europa-button--primary`, `europa-button--secondary`, `europa-button--ghost`, `:disabled`, `:focus-visible` *(TBD)* | `<button class="europa-button europa-button--primary">` | Surrender, lobby actions, modal actions, reserves digits | Keyboard target ≥ 24×24; `:focus-visible` uses focus-ring tokens; pressed/disabled encode via border+weight+label, not color alone |
| `europa-banner` | — | Fixed banner container | Reconnecting / status banners | Text `#111827` on `#d97706` ≥ 4.5:1; `role="status"`/`alert` where appropriate; not color alone: text+position |
| `europa-hud` family | *(TBD)* | HUD status typography/layout wrapper | In-match HUD status display | Pairings pinned in §3; live regions preserved; not color alone: text+icon |
| `europa-lobby*` family | `europa-lobby`, `europa-lobby__grid`, `europa-lobby__card`, `europa-lobby__row`, `europa-lobby__badge` *(TBD)* | Page → grid → card → row → badge | Lobby page layout, grid/cards/rows/badges | Grid wraps rather than overflows; focus ring on controls; not color alone: position+label |
| `europa-chip` / `europa-badge` | `europa-chip--troops` etc. *(TBD)* | Pill container with label | Troop-count pill, reserves, row badges | `#f9fafb` on `#111827` ≈ 15:1 plus pill border; not color alone: border+numeric label |
| `europa-modal*` | `europa-modal-backdrop`, `europa-modal`, `europa-modal__title`, `europa-modal__body`, `europa-modal__actions` *(TBD)* | Backdrop + dialog + title/body/actions | Modal backdrop + dialog + title/body/actions layout | `role="dialog"` + focus trapping; backdrop is rgba veil; actions row foreground meets AA; not color alone: position+label |
| `europa-grid` | `europa-grid--sidebar` etc. *(TBD)* | Grid container | Lobby grid, board-adjacent sidebar stacks | Items wrap rather than `overflow: hidden`; focus ring where interactive |
| `europa-typography--*` | `europa-typography--heading`, `europa-typography--muted`, `europa-typography--meta`, `europa-typography--mono` *(TBD)* | Inline/block typography treatment | Headings, muted-line, meta, mono match-ID — shared between manual and lobby | Muted `#9ca3af` on `#111827` ≈ 6.99:1 AA; mono has sufficient letter-spacing |
| Layout containers | *(covered by `europa-page`/`europa-stack`/`europa-grid`)* | — | Page column with centered measure, stack/gap primitives, board layout | — |

---

## 3. Accessibility pairing table (FR-016 / NFR-001)

Every text-on-background pairing in the token set states its contrast ratio and WCAG target; critical
chrome pairings are ≥ AA at ship and are pinned by an automated computed-style check (not a comment).

> Scaffold — ratios below are the canonical targets from spec/plan §10; T-009/T-015 replace `TBD`
> with the measured luminance formula's exact values and wire the computed-style assertions.

| Foreground | Background | Ratio (measured) | WCAG target | Where asserted |
| --- | --- | --- | --- | --- |
| `--europa-color-text-primary` (`#f9fafb`) | `--europa-color-surface` (`#111827`) | *TBD — ≈ 15:1* | AA 1.4.3 normal 4.5:1 | `getComputedStyle` fixture (console + manual) |
| `--europa-color-text-secondary` (`#e5e7eb`) | `--europa-color-page-bg` (`#0b0f19`) | *TBD — ≈ 13.5:1* | AA 1.4.3 normal 4.5:1 | — |
| `--europa-color-text-muted` (`#9ca3af`) | `--europa-color-surface` (`#111827`) | *TBD — ≈ 6.99:1* | AA 1.4.3 normal 4.5:1 | — |
| `--europa-color-surface` (`#111827` text) | `--europa-color-banner` (`#d97706` bg) | *TBD — ≈ 6.6:1* | AA 1.4.3 normal 4.5:1 | — |
| `--europa-focus-ring-color` (`#ffffff`) | `--europa-color-surface` (`#111827`) | *TBD — ≈ 16:1* | AA 2.4.7 focus ≥ 3:1 vs adjacent | `*:focus-visible` / `.europa-focus-ring` outline `2px solid` + `2px` offset |
| *TBD — large text pairs* | — | — | AA 1.4.3 large 3:1 | — |
| *TBD — non-text UI (borders/icons)* | — | — | AA 3:1 | — |

Motion: decorative animations are gated by `@media (prefers-reduced-motion: reduce) { animation: none }`
and the existing console `.europa-waiting--reduced` mechanism; a focused test asserts the waiting
spinner is inert when the preference is set (WCAG 2.3.3).

Focus-visible: reusable token/class `europa-focus-ring` / `--europa-focus-ring-*` (`2px solid #ffffff`
with `2px` offset on `#111827`) used consistently by every interactive component — meets WCAG 2.4.7.
Color-alone prohibition: each catalog entry above carries a "not color alone: …" sentence; shared
components encode identity via border/text/icon/position redundantly (constitution Principle VI).

---

## 4. Single-stylesheet, vendoring, and artifact-scope rules

### 4.1 Single stylesheet source (FR-011)

`@europa/design` ships exactly one stylesheet — `packages/design/dist/design.css` — that defines all
`:root { --europa-* }` variables and all `europa-*` class-name rules. The console imports it once
(entry stylesheet, e.g. `import '@europa/design/dist/design.css'` or `@import` from
`src/styles/index.css` — architect's choice) and does not duplicate its rules in a parallel copy.
Build output deduplicates it (Vite dedupes the workspace import; one copy in the bundle). A
structural test asserts every `color`/`background`/`border`/`spacing`/`radius`/`shadow`/`focus`
declaration in the console is a `var(--europa-*)` / catalog-class composition (FR-009/FR-010).

### 4.2 Vendoring — manual consumes the same file inside `docs/manual` (FR-013 / FR-014)

The shared stylesheet reaches the Pages deployment by being **vendored/copied into `docs/manual`**
as `docs/manual/assets/design.css` — a byte-identical, checked-in file produced deterministically by
`pnpm --filter @europa/design build` (emitter sorts keys, LF, UTF-8, no BOM/timestamp). Jekyll
integration preserves the existing Pages artifact scope from `.github/workflows/pages-deploy.yml`:
`actions/jekyll-build-pages` `source` remains `./docs/manual`, and the uploaded artifact remains
exactly the rendered `docs/manual` tree. The shared stylesheet lives *inside* that tree, so no
workflow `source`/`path` widening is needed — the workflow does not gain a new `path` entry outside
`docs/manual`. `docs/manual/_layouts/default.html` loads it with
`<link rel="stylesheet" href="{{ '/assets/design.css' | relative_url }}">`; no Jekyll theme gem and
no CDN `<link>` is permitted (FR-015).

CI asserts byte identity (`sha256(packages/design/dist/design.css) === sha256(docs/manual/assets/design.css)`)
and fails with both hashes and the remediation `run pnpm --filter @europa/design build` when stale.

### 4.3 No external theme / no CDN (FR-015 / NFR-002)

The manual's Markdown-to-HTML path does not introduce an external theme or CDN dependency.
Frontmatter/class wrappers (e.g. a Jekyll `_layouts` include that pulls `assets/design.css`) are
allowed; adding a Jekyll theme gem or a `<link>` to a CDN is not. The design system stays
self-hostable (constitution Principle VII) — the vendored stylesheet is the only new asset and is
self-contained.

---

## 5. Sync rule — `DESIGN.md` stays truthful (FR-018 / constitution Principle IV)

Every change set that alters a token value, adds/renames/removes a catalog component or variable, or
changes an accessibility pairing **must update `DESIGN.md` in the same commit/branch that changes the
implementation**. The "specs stay truthful" rule (AGENTS.md workflow rule 4, constitution Principle IV)
extends to `DESIGN.md`: a stale `DESIGN.md` is a bug on par with a stale spec. CI guards this with
the drift checks below; the checks fail with an actionable message naming the missing/extra variable,
class, or pairing.

Drift guards (traceable to FRs — see `specs/012-design-system/data-model.md` § Drift Guard):

- **G-01** CSS-var ↔ TS leaves identity (FR-004)
- **G-02** `DESIGN.md` token-table coverage (FR-003/FR-017)
- **G-03** catalog-vs-stylesheet coverage (FR-006)
- **G-04** console no-literals (FR-009/FR-010)
- **G-05** vendored-asset byte identity (FR-014)
- **G-06** version header lockstep (FR-017/FR-020/spec 009 FR-009)
- **G-07** a11y contrast pairing assertions (FR-016)
- **G-08** bundle budget &lt; 150 KB gz (NFR-005)
- **G-09** Pages artifact scope (FR-013)

Every guard runs locally (`pnpm` commands under `packages/design`) and in CI.

---

## 6. Extension guidance and light-theme note (FR-019)

This feature ships the **dark-slate theme only**. The token namespace is structured so a later light
variant can be added by redefining variable *values* without renaming components or class names — e.g.

```css
html[data-theme='light'] {
    --europa-color-page-bg: /* light value */;
    --europa-color-surface: /* light value */;
    /* … */
}
```

Proposing a new variant is additive and never renames existing variables. Light-theme note: the shape
admits a light variant; no light stylesheet, toggle, or dual-theme build ships in this feature.

- **Adding a variant** (e.g. `europa-button--danger`, `europa-typography--code`) — **minor** change, no migration note required beyond the catalog row.
- **Adding a required token or renaming a class/variable** — **major** (breaking) change: requires a major-bump discussion and a migration note in this file.

---

## 7. Build, versioning, and house-keeping (FR-020 / FR-021 / FR-022)

- **Version**: this header's `0.1.0` is the current lockstep value (spec 009 chore convention); drift
  check covers `packages/design/package.json` and this header with no special case.
- **Build order**: `pnpm build` (and any reordered workspace build) builds `@europa/design` before
  `@europa/console`, and the design build copies/vendors the stylesheet into `docs/manual/assets/`
  before the Jekyll build can consume it. A local one-command build succeeds from a clean checkout.
- **Biome/CI coverage**: `biome.jsonc` covers `packages/design/**` under the same 4-space/120-col, LF,
  semicolon rules (no formatter suppression); CI workflow path filters (`client-ci.yml`,
  `pages-deploy.yml`, `version-drift.yml`) include `packages/design/**` and the `DESIGN.md` +
  vendored-asset paths.

---

## References

- Spec: [`specs/012-design-system/spec.md`](specs/012-design-system/spec.md)
- Plan: [`specs/012-design-system/plan.md`](specs/012-design-system/plan.md)
- Research: [`specs/012-design-system/research.md`](specs/012-design-system/research.md)
- Data model: [`specs/012-design-system/data-model.md`](specs/012-design-system/data-model.md)
- Contract: [`specs/012-design-system/contracts/design-system.contract.md`](specs/012-design-system/contracts/design-system.contract.md)
- Quickstart: [`specs/012-design-system/quickstart.md`](specs/012-design-system/quickstart.md)
