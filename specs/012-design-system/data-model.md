# Data Model: Shareable Design System Between UI and Documentation

**Feature**: `012-design-system` (issue #25) | **Date**: 2026-08-30 | **Spec**: [`spec.md`](./spec.md)

> This is a **conceptual** data model. The design system has no database; every entity below is a naming/value contract realized as a typed constant + CSS variable, a stylesheet class, or a Markdown document. Tables below enumerate the fields, types, constraints, and relations that tests enforce.

---

## 1. Design Token

A single named visual decision owned by `@europa/design` and realized in two representations — CSS variable + typed TS constant — with identical canonical values.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `name` | `string` (kebab-case slug) | NOT NULL, unique within group, matches `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` | Human-facing token handle, e.g. `page-bg`, `surface-raised`, `focus-ring-color` |
| `group` | `TokenGroup` | NOT NULL | Enum: `color` · `typography` · `spacing` · `radii` · `borders` · `shadows` · `focusRing` · `motion`. Per FR-003. |
| `cssVar` | `string` | NOT NULL, unique repo-wide | Namespaced ` --europa-{group}-{name}` e.g. `--europa-color-page-bg`. Never renamed without a major-bump discussion (FR-007). |
| `tsExport` | `string` | NOT NULL, unique | Constant path, e.g. `TOKENS.color.pageBg`. Exported from `@europa/design` (FR-002). |
| `value` | `string` | NOT NULL, format depends on group | Canonical value — hex/rgb/hsl for colors, CSS length for spacing/radii/borders/motion, keyword for type stack, etc. Initial palette per FR-003 bullet (e.g. pageBg `#0b0f19`). |
| `pairing` | `ContrastPairing \| null` | NULL unless `group === 'color'` and the token participates in a required text pairing | Documents the a11y contract next to the color token (FR-005). |
| `a11yTarget` | `WCAGTarget \| null` | NULL unless `pairing` non-null | `AA-1.4.3` (4.5:1 normal / 3:1 large / 3:1 non-text). Pinned by an automated computed-style test, not a comment (FR-016). |

```ts
// Illustrative shape — authoritative in contracts/design-system.contract.md
type TokenGroup = 'color' | 'typography' | 'spacing' | 'radii' | 'borders' | 'shadows' | 'focusRing' | 'motion';
type WCAGTarget = 'AA-1.4.3-normal' | 'AA-1.4.3-large' | 'AA-2.4.7-focus' | 'AA-2.3.3-motion';
interface ContrastPairing { foregroundCssVar: string; backgroundCssVar: string; ratio: string; note: string; }
```

### Validation Rules

- **V-T1** Each `cssVar` appears exactly once in `dist/design.css`'s `:root` block with value `value` (FR-004).
- **V-T2** Each `tsExport` resolves to `value` as a literal-typed constant (`as const`) under `strict: true`.
- **V-T3** The set of CSS vars in the emitted stylesheet equals the set of `cssVar`s in the TS table — no orphans (SC-007). Drift test fails naming the extra/missing var.
- **V-T4** Color-token values use only hex/rgba/hsl literals inside `@europa/design`; no `var()` indirection inside the token file itself — the indirection lives in consumer CSS (`var(--europa-*)`).
- **V-T5** Token tables in `DESIGN.md` § Tokens enumerate exactly the same tokens — coverage test enforces it.

### State Transitions

Not applicable — tokens are versioned, not stateful. Adding a token is additive (minor); removing/renaming is breaking (major, FR-019).

---

## 2. Catalog Component

A reusable visual primitive defined by a stable `europa-*` class-name family and composed exclusively from Design Tokens.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `className` | `string` | NOT NULL, unique, matches `/^europa(-[a-z0-9]+)+$/` | Primary selector, e.g. `europa-card`, `europa-button`, `europa-banner` |
| `variants` | `string[]` | possibly empty | Modifier classes, e.g. `europa-button--primary`, `europa-button--ghost`, `europa-chip--troops`. Additive (minor). |
| `structure` | `string` | free text, but required | Required DOM skeleton, e.g. "`.europa-modal` wraps `.europa-modal__title + .europa-modal__body + .europa-modal__actions`". |
| `tokensUsed` | `string[]` | every entry must be a `DesignToken.cssVar` | Proves the component is composed from tokens without custom literals (FR-006 last sentence). |
| `a11yObligation` | `string` | NOT NULL | Keyboard target size, focus-visible class/token, "not color alone" encoding — per FR-008. |
| `consumers` | `('console' \| 'manual' \| 'both')` | NOT NULL | `both` for most (FR-006 requires shareable between React + Jekyll). |

### Initial Catalog (FR-006 exhaustive — each row is one row in `DESIGN.md`)

| Class family | Variants | Intended use | A11y note |
|--------------|----------|--------------|-----------|
| `europa-page`, `europa-stack` | gap modifiers | Page column + measure, stack/gap primitives, centered flex-wrap board layout | Layout only — no contrast obligation beyond its children's pairs. |
| `europa-card` / `europa-plate` | — | HUD panels, lobby cards, modal plates, waiting plate, manual callouts | Border + fill both express identity — not color alone. |
| `europa-button` family | `primary`, `secondary`, `ghost` + `:disabled`, `:focus-visible` | Surrender, lobby actions, modal actions, reserves digits | Pressed/hover/disabled states encode via border+weight, not color alone; focus ring uses `--europa-focus-*`. |
| `europa-banner` | — | Reconnecting/status fixed banners | Text `#111827` on `#d97706` banner meets ≥ 4.5:1; role `status`/`alert` where appropriate. |
| `europa-hud` family | — | In-match HUD status display typography/layout | Text pairings (§A11y pair table) pinned; live regions preserved. |
| `europa-lobby*` family | `card`, `grid`, `row`, `badge`, etc. | Lobby page layout, grid/cards/rows/badges | Grid items wrap rather than overflow; focus ring on controls. |
| `europa-chip` / `europa-badge` | `troop`, `reserve`, `row-badge` | Troop-count pill, reserves, row badges | `#f9fafb` on `#111827` ≈ 16.98:1 plus pill border; not color alone. |
| `europa-modal*` | `backdrop`, `dialog`, `title`, `body`, `actions` | Modal backdrop+dialog layout | Focus trapping + `role=dialog`; backdrop is `rgba` veil; actions row foreground meets AA. |
| `europa-grid` / `europa-grid--*` | wrap modifiers | Lobby grid, board-adjacent sidebar stacks | Items wrap rather than overflow hidden. |
| `europa-typography--*` | `heading`, `muted`, `meta`, `mono` | Headings, muted-line, meta, mono match-ID | Muted `#9ca3af` on `#111827` ≈ 6.99:1 checked. |
| — plus any additional families needed to cover the 100 hex literals in the current console stylesheet without a custom-literal fallback — all enumerated in `DESIGN.md`; orphans are a drift failure. |

### Validation Rules

- **V-C1** Every listed `className` and each of its `variants` appears as a selector in `dist/design.css` and nowhere else defines a competing visual (FR-006 last line — "no undocumented visual class.").
- **V-C2** Every `tokensUsed` entry resolves to an existing `DesignToken.cssVar`.
- **V-C3** Every class block in the stylesheet references only `var(--europa-*)` (or at most the single documented `// design-exception` line) — no literals. Proved by the no-literals script.
- **V-C4** Unknown/unlisted class names are a no-op (spec Edge Cases) and are optionally warned by the drift helper scanning repo sources for `europa-*` not in the catalog.

---

## 3. DESIGN.md — The Living Contract

The authoritative, versioned, first-class document that binds the other entities.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `header` | `Markdown heading + blockquote` | NOT NULL, contains version token | `> **Version**: `0.1.0`` — greppable `/Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/` (research R8). Must equal `APP_VERSION` and every `package.json#version`. |
| `tokenTables` | `Markdown tables` | One per `TokenGroup` | Columns: token name \| CSS var \| TS export \| canonical value \| pairing+ratio+target (for colors). Enumerates every Design Token (FR-003+FR-005). |
| `componentCatalog` | `Markdown section` | One entry per Catalog Component | Per FR-006+FR-008 — class name(s), variants, structure, tokens used, a11y obligation. |
| `a11yTable` | `Markdown table` | Every required pairing listed | Maps to NFR-001 / FR-016 — ratio + target, how the automated check measures it (computed styles). |
| `rules` | `Markdown prose` | NOT NULL | Single-stylesheet rule (FR-011), vendoring + byte-identity (FR-013/FR-014), no-CDN scope, sync rule (FR-018), extension guidance + light-theme note (FR-019). |
| `version` | `string` (`MAJOR.MINOR.PATCH`) | NOT NULL, `= APP_VERSION = packages/design/package.json#version` | Guarded by the same lockstep drift check as every other `packages/*/package.json` (FR-020). |

### Validation Rules

- **V-D1** `header.version` equals `packages/design/package.json#version` equals `packages/version/src/app-version.ts#APP_VERSION` — byte identity or the drift check fails (mirrors the `version:check` pattern of spec 009).
- **V-D2** Every `DesignToken` appears as a row in `tokenTables` with matching values; every Catalog Component appears as an entry in `componentCatalog` — coverage asserted by catalog-vs-code tests (SC-007).
- **V-D3** `packages/design/README.md` links to root `DESIGN.md` and carries no competing token/component tables (FR-017 last sentence).

### State Transitions

`DESIGN.md` evolves in lockstep with the code — every change set that alters a token, class, or pairing updates `DESIGN.md` in the *same* commit (FR-018). A stale `DESIGN.md` is a bug on par with a stale spec (constitution Principle IV).

---

## 4. Single Stylesheet Source

The one compiled stylesheet built by `@europa/design` and consumed by both surfaces.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `path` | `string` | fixed | Package: `packages/design/dist/design.css`. Single source (FR-002/FR-011). |
| `vendoredPath` | `string` | fixed | Manual: `docs/manual/assets/design.css`. Byte-identical to `path` (FR-014). |
| `content` | `CSS text` | NOT NULL, deterministic | `:root { --europa-*: value }` + `europa-*` class blocks; sorted keys, LF, no timestamp. Reproducible → hashable. |
| `importers` | `string[]` | exactly one design import for the console | Console imports it exactly once via entry import (FR-011); Jekyll imports the vendored copy via `<link>` in `_layouts/default.html` (FR-012/FR-013). |
| `artifactScope` | `string` | fixed | `pages-deploy.yml` `source: ./docs/manual` — the deployed artifact is exactly the `docs/manual` tree, which already contains `vendoredPath`. |

### Validation Rules

- **V-S1** `content` of `path` and `vendoredPath` are byte-identical at HEAD; hash-equality check in CI (FR-014/SC-003).
- **V-S2** Console build output deduplicates the stylesheet — one copy in the bundle (FR-011) — asserted by asserting the consumer import graph contains exactly one `@europa/design/dist/design.css` import.
- **V-S3** No external theme or CDN `<link>` appears in `docs/manual` head — enforced by a structural check on the layout (FR-015).

---

## 5. Drift Guard

The automated correctness layer that keeps Design truthful. Not an accessor entity — a CI/local check suite.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `checks` | `Check[]` | 8 checks covering SC-002/003/005/006/007/008 | See research R3. Each is a script/test with exit non-zero + actionable `file:line` on failure. |
| `trigger` | `workflows + biome` | path filters | `client-ci.yml`, `pages-deploy.yml`, `version-drift.yml` `on.push.paths` include `packages/design/**`, `DESIGN.md`, `docs/manual/assets/design.css`, `docs/manual/_layouts/**`; `biome.jsonc` includes cover `packages/design` (FR-022). |
| `mode` | `'ci' \| 'local'` | — | Every guard runs both in CI and via a local `pnpm` command (spec quickstart/verification). |

### Checks (traceable to FRs)

| ID | Name | Pins | Failure message |
|----|------|------|-----------------|
| G-01 | CSS-var ↔ TS identity | FR-004 | `missing --europa-color-… in stylesheet` / `mismatch var --europa-… expected #… got #…` |
| G-02 | `DESIGN.md` token-table coverage | FR-003, FR-017 | `orphan token in DESIGN.md: --europa-…` / `orphan CSS var not in DESIGN.md` |
| G-03 | Catalog-vs-stylesheet coverage | FR-006, SC-007 | `undocumented class in stylesheet: .europa-…` / `catalog lists .europa-… but no rule in dist/design.css` |
| G-04 | Console no-literals | FR-009/FR-010 | `literal #374151 at packages/console/src/styles/index.css:142 — use var(--europa-color-border)` |
| G-05 | Vendored asset byte identity | FR-014, SC-003 | `docs/manual/assets/design.css hash … !== packages/design/dist/design.css hash … — run pnpm --filter @europa/design build` |
| G-06 | Version header lockstep | FR-017, FR-020, spec 009 FR-009 | `DESIGN.md header 0.1.0 !== packages/design 0.2.0` |
| G-07 | A11y contrast pairing | FR-016, SC-005, NFR-001 | `pair foreground --europa-text-primary on --europa-surface measured 3.9:1, need ≥4.5:1` |
| G-08 | Bundle budget | NFR-005 | `browser payload …KB gz exceeds 150KB` |
| G-09 | Artifact scope | FR-013, SC-006 | `artifact contains packages/design/** — pages-deploy.yml source/path widened` |

---

## Relationships Diagram (conceptual)

```
DesignToken  ─┬─ 1..* realizes ─┐
              │                  ▼
              │            Single Stylesheet Source (:root vars)
              │                  │ implements
              │                  ▼
              └────── used by ──► CatalogComponent ──► Single Stylesheet (.europa-* rules)
                                      │                      ▲
                                      │ catalogued in        │ byte-identical vendored copy
                                      ▼                      │
                                DESIGN.md (authoritative)   docs/manual/assets/design.css
                                      ▲                      │
                                      │ guarded by           │ consumed by
                                      └────────── DriftGuard ◄┘
                                                        palette.ts (typed derivation)
```

- **DesignToken → SingleStylesheet**: each token contributes exactly one `--europa-*` declaration in `:root` and a typed `TOKENS.*` constant.
- **CatalogComponent → DesignToken**: each component declares which `cssVar`s it composes; every one must exist in the token set.
- **DESIGN.md → {DesignToken, CatalogComponent, SingleStylesheet, DriftGuard}**: authoritative over each — every row/class/guard claim must match the code (FR-017/FR-018).
- **SingleStylesheet → {console, docs/manual}**: one file, two consumers (FR-011/FR-013) — identity pinned by G-05.

---

## Invariants (repo-wide, test-pinned)

| ID | Invariant | Enforced Because |
|----|-----------|------------------|
| INV-D1 | The set of `--europa-*` vars in `dist/design.css` equals the set in `src/tokens.ts` equals the set of rows in `DESIGN.md` token tables. | Single source of truth can't have orphans. |
| INV-D2 | The set of `europa-*` classes in `dist/design.css` equals the set catalogued in `DESIGN.md`. | No undocumented visual class (FR-006). |
| INV-D3 | No hex/rgb literal appears in `packages/console/src/**` or `docs/manual/**` except `@europa/design`'s token file, imports from it, and the single line-scoped `// design-exception` fallback. | Prevents literal rot (FR-009/FR-010). |
| INV-D4 | `docs/manual/assets/design.css` SHA256 == `packages/design/dist/design.css` SHA256 at every commit. | Byte-identity (FR-014) makes local and CI builds agree without recomputing in CI. |
| INV-D5 | `DESIGN.md` header version == `packages/design/package.json#version` == `APP_VERSION` == every `packages/*/package.json#version` == `README.md`/`docs/manual/index.md` drift surfaces. | Lockstep (FR-020) — one bump commits all. |
| INV-D6 | Body/page typography is `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` as the only type stack, no `@font-face`, no CDN fetch. | Self-hostable (NFR-002) — no external dependency. |
| INV-D7 | Every `color` token pairing in `DESIGN.md` states a `ratio ≈ X:1` + `target: AA` and a focused computed-style test asserts that computed pair equals ≥ the target. | AA claims are mechanically audited, not just commented (FR-016). |
