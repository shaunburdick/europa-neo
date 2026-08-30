# Implementation Plan: Shareable Design System Between UI and Documentation

**Branch**: `issue-25-design-system` (spec-kit feature `012-design-system`) | **Date**: 2026-08-30 | **Spec**: [`specs/012-design-system/spec.md`](./spec.md)

**Input**: Feature specification from `/specs/012-design-system/spec.md` (GitHub issue #25) — 22 FRs, 8 SCs, 4 user stories, 0 NEEDS CLARIFICATION after v1.0 planner fill.

> **Branch note**: spec-kit resolves the latest feature directory as `012-design-system`; the git branch created for this issue is `issue-25-design-system` per the repo's GitHub-issue branch convention (`issue-NN-*`). They refer to the same feature; all paths below use `specs/012-design-system/` and the branch `issue-25-design-system`.

---

## Summary

Introduce a single private workspace package `@europa/design` (`packages/design`) as the authoritative source of **tokens + reusable component/layout primitives**. The package ships one compiled stylesheet (`dist/design.css`) that defines all `--europa-*` CSS variables and all `europa-*` class-name rules, and a typed TypeScript token export (`src/tokens.ts`) carrying the identical canonical values for JS/Canvas consumers. `packages/console` migrates its ~884-line `styles/index.css` and `render/palette.ts` to consume that package (no duplicated literals), while `docs/manual` adopts the same stylesheet by a **checked-in vendored copy** at `docs/manual/assets/design.css` (byte-identical to the package build, asserted by CI) consumed via a minimal Jekyll layout include — the existing `pages-deploy.yml` artifact scope (`source: ./docs/manual`) is not widened. `DESIGN.md` at the repo root is the versioned living contract binding tokens, component catalog, a11y pairings, single-stylesheet and vendoring rules, extended in the same change set as any token/class change and guarded by drift checks. Biome, `client-ci.yml`, `pages-deploy.yml`, and `version-drift.yml` path filters are updated so the new surfaces are covered.

---

## Scope Note (v0.1.0)

The full drift-guard suite G-01…G-09 described in `DESIGN.md` § 5 was scoped down for the v0.1.0 stabilization release. What ships and is asserted in CI:

- **G-04** console no-literals scan (FR-009/FR-010) — kept.
- **G-05** vendored-asset byte identity (FR-014) — kept.
- **G-06** version-header lockstep (FR-017/FR-020, spec 009 FR-009) — kept.
- Workflow `paths:` filters on `client-ci.yml`, `pages-deploy.yml`, `version-drift.yml` covering `packages/design/**`, `DESIGN.md`, and the vendored asset — kept.

Deferred to a follow-up (not in v0.1.0):

- **G-01** token-variable ↔ TS-leaf identity, **G-02** § 1 token-table coverage vs stylesheet, **G-03** § 2 catalog coverage vs stylesheet — the heavy cross-assertion test factory. `DESIGN.md` is mechanically generated from tokens and verified set-equal at authoring time, so the contract stays truthful without a continuous CI drift test for v0.1.0.
- **G-07** computed-style contrast proofs and the elaborate parity/smoke tests behind **SC-001** / **SC-004** — the existing 260+ console suite (axe + a11y) and the measured ratios in `DESIGN.md` § 3 cover accessibility; the dedicated computed-style parity harness is deferred.
- **G-08** bundle gzip-budget structural test and the build-ordering structural test — `pnpm` workspace topology already guarantees `@europa/design` builds before `@europa/console`.

No FR is removed by this note; deferred items are annotated, not deleted. See `spec.md` Scope Note for the canonical statement.

---

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) / Node 22 (engines field) / pnpm 11.22 workspaces — same as every sibling package.

**Primary Dependencies**: **Zero runtime `dependencies` in `@europa/design`** (FR-001). Tooling only:
- `tsup` (catalog `^8.3.5`) to emit `dist/` — same builder every package uses.
- `tsx` (catalog, already in console) for drift/build scripts if needed; no new runtime dep.
- Existing `typescript`, `vitest`, `biome` catalog versions.
- No external CSS framework, no font, no CDN, no Jekyll theme gem (constitution VII + spec NFR-002).

**Storage**: N/A — no persistence. Vendored file `docs/manual/assets/design.css` is a checked-in tracked file (like any other source asset), not a DB.

**Testing**: Vitest 4.1 + `@vitest/coverage-v8` (≥80% on every metric for new testable logic, constitution Principle III), plus existing console `tests/a11y` (axe-core) and Playwright e2e. New checks are unit/integration style: token ↔ CSS-var identity, `DESIGN.md` ↔ implementation agreement, console no-literals grep, vendored-asset byte identity, a11y pairing ratio assertions. No new test runner.

**Target Platform**: Browser (Vite 8 + React 19 console) and Jekyll static site (`actions/jekyll-build-pages@v1.0.13`). Both run on Ubuntu `ubuntu-latest` in CI.

**Project Type**: Monorepo private package + cross-cutting migration (console `packages/console`, docs `docs/manual`, root `DESIGN.md`, CI/biome housekeeping).

**Performance Goals**: Spec NFR-005 — the browser-payload gzip budget stays **< 150 KB** (spec 005's prior budget) after adding the design package; the manual's Pages payload is the vendored CSS plus existing HTML — no regression. Net CSS size should be neutral-to-smaller (deduplication removes copied literals; indirection is comment-free and minifiable). No runtime style computation beyond standard CSS var resolution.

**Constraints**:
- `private: true` everywhere, never published (AGENTS.md binding decision 6).
- CSS variables under `--europa-*` namespace; class names under `europa-*` (FR-007) — renames are breaking.
- Light theme out of scope but the variable shape must admit it additively (spec Assumptions § Future theme).
- Canvas (console) cannot read CSS vars at paint time — `palette.ts` remains the typed bridge, now derived from design tokens.
- No inline lint suppressions; `strict: true`; no `any` (constitution I).

**Scale/Scope**: One new package, one stylesheet, one root contract file, one vendored asset, one console migration (~884 lines + `palette.ts`), ~14 manual pages themed via a single layout include, 3 workflow + biome updates. No new infrastructure.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | This Feature's Compliance | Risk |
|-----------|---------------------------|------|
| **I. Type Safety First** | `@europa/design` `tsconfig` extends `tsconfig.base.json` (`strict: true` + `exactOptionalPropertyTypes` etc.). All token exports are typed `as const` with explicit interfaces; no `any`. No lint suppressions — narrow `biome.jsonc` overrides only where the root already permits (contract mirrors), and this feature adds none beyond documented `packages/design` inclusion. | None |
| **II. Server-Authoritative Deterministic Simulation** | No tick logic, no randomness, no wall clock. Build scripts that emit CSS/TS are fully deterministic (sorted keys, fixed formatting, same output for same input). Token → CSS generation is pure. | None |
| **III. Tested Game Logic (≥80%)** | New testable logic (drift helpers, no-literals guard, asset identity, `DESIGN.md`↔code coverage, a11y pair assertions) is treated as covered logic for this package and meets the ≥80% gate on every metric (stmts/branches/funcs/lines). Visual-assertion coverage is explicit in tasks. | Low — enumerating all token groups for coverage is mechanical. |
| **IV. Specs as Documentation** | `DESIGN.md` extends "stale specs are bugs" to the design contract (FR-018). `packages/design/README.md` links to the root `DESIGN.md`; no competing catalog. Every catalog change lands in the same commit as the code. | None |
| **V. Simplicity Over Cleverness** | One package, one stylesheet, one vendored copy, one contract file. No Storybook, no theme engine, no runtime theming, no CSS-in-JS. Token layer is a thin var + const mapping. | None |
| **VI. Accessibility-Minded UI (WCAG 2.2 AA)** | Every token-table pairing states its ratio + target (FR-005/FR-016). Focus ring is `#fff 2px solid + 2px offset` on `#111827` (≈17.74:1, ≥3:1 vs adjacent). Motion gated by both `@media (prefers-reduced-motion: reduce)` and `.europa-waiting--reduced`. Axe scans remain green. | None — ratios are audited from computed styles, not comments. |
| **VII. Self-Hostable by Default** | No CDN, no external font, no theme gem. Vendored stylesheet is self-contained inside `docs/manual`. `pnpm build` from a clean checkout produces the whole site. | None |
| **Additional: Open-source licensing** | Zero runtime deps → trivially MIT-compatible. Build tooling (`tsup`, `vitest`, `biome`) is permissive. | None |
| **Additional: No vendor lock-in** | No SaaS, no proprietary API. | None |

**Re-check after design**: no new risks introduced by the package shape or vendoring strategy.

---

## Project Structure

### Documentation (this feature)

```text
specs/012-design-system/
├── plan.md              # This file
├── research.md          # Phase 0 — choices investigated
├── data-model.md        # Phase 1 — conceptual model
├── quickstart.md        # Phase 1 — build/verify instructions
├── contracts/
│   └── design-system.contract.md   # Token export + class catalog contract
└── tasks.md             # Phase 2 — ordered tasks (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
.
├── DESIGN.md                                 # NEW — root living contract (versioned)
├── biome.jsonc                               # UPDATE — include packages/design/**
├── pnpm-workspace.yaml                       # no change (packages/* already globbed)
├── tsconfig.base.json                        # no change
├── .github/
│   └── workflows/
│       ├── client-ci.yml                     # UPDATE — paths + build-order for @europa/design
│       ├── pages-deploy.yml                  # UPDATE — paths filter adds vendored asset + DESIGN.md; source/path NOT widened
│       └── version-drift.yml                 # UPDATE — paths + drift surface adds packages/design + DESIGN.md header
├── packages/
│   ├── design/                               # NEW — @europa/design
│   │   ├── package.json                      # private:true, name @europa/design, version 0.1.0 lockstep, zero deps, exports for tokens
│   │   ├── tsconfig.json                     # extends tsconfig.base.json, strict:true, outDir dist
│   │   ├── tsup.config.ts                    # two outputs: JS tokens + CSS copy (or TS-emitted CSS)
│   │   ├── src/
│   │   │   ├── tokens.ts                     # canonical TS token table — the source of truth (JS)
│   │   │   ├── tokens.css.ts                 # (or) CSS emitter that derives from tokens.ts; alternatively src/styles/design.css built from tokens
│   │   │   ├── styles/
│   │   │   │   └── design.css                # if CSS is authored alongside TS, the emitted artifact is dist/design.css
│   │   │   └── index.ts                      # barrel re-exporting tokens (+ helpers like terrainColor if owned here)
│   │   ├── scripts/
│   │   │   ├── build-css.ts                  # optional: generates dist/design.css from tokens.ts deterministically
│   │   │   └── vendor-to-docs.ts             # copies dist/design.css → docs/manual/assets/design.css (also callable from root build)
│   │   ├── tests/
│   │   │   └── *.test.ts                     # token↔CSS drift, DESIGN.md agreement, no-literals sibling checks, coverage
│   │   └── README.md                         # short — links to root DESIGN.md, no competing catalog
│   ├── console/
│   │   ├── src/
│   │   │   ├── styles/
│   │   │   │   └── index.css                 # UPDATE — every declaration uses var(--europa-*) / catalog classes; no literals
│   │   │   └── render/
│   │   │       └── palette.ts                # UPDATE — thin re-export/derivation from @europa/design tokens
│   │   └── ...                               # no new runtime deps except workspace:* on @europa/design
│   └── version/                              # unchanged shape; version:check gains a new drift surface
├── docs/
│   └── manual/
│       ├── assets/
│       │   └── design.css                    # NEW — vendored, byte-identical to packages/design/dist/design.css, tracked
│       ├── _layouts/
│       │   └── default.html                  # NEW — minimal layout that loads assets/design.css; no theme gem
│       └── *.md                              # UPDATE — optional frontmatter/layout wiring to apply catalog classes (no prose rewrite)
└── specs/
    └── 012-design-system/
        └── ...
```

**Structure Decision**: single new workspace package under `packages/design` (pnpm `packages/*` glob already covers it; no `pnpm-workspace.yaml` edit needed beyond documenting the allowed build). This follows the repo's established convention (engine/fog/terrain/networking/matchmaking/console/version) and keeps the import graph `design → (none)`, `console → design` with no cycles. The vendored copy lives **inside** `docs/manual` so `pages-deploy.yml` artifact scope is preserved — verified by the existing `source: ./docs/manual` + artifact-path assertions.

---

## Architecture & Key Decisions

### 1. Package shape — `packages/design` (`@europa/design`)

| Concern | Decision | Why |
|---------|----------|-----|
| **Name / location** | `packages/design` exporting as `@europa/design` | Product-owner emphasis is a "full design system with reusable components", not just tokens. `@europa/tokens` would under-sell the catalog; `@europa/design` communicates it (spec Clarifications v1.0). |
| **private / publish** | `"private": true`, never published, `"files": ["dist"]` only | AGENTS.md binding decision 6 — all workspaces private. |
| **Version** | `0.1.0` lockstep with root + every other `packages/*/package.json` | FR-020 + spec 009 FR-009/FR-010. First value is current lockstep `0.1.0` (spec Clarifications v1.0 — not `0.0.1`). Drift check covers `packages/design/package.json` and `DESIGN.md` header (see §7). |
| **deps** | Zero `dependencies`; only `devDependencies` (tsup/typescript). `react`/`vite` etc. remain in console only. | FR-001 + licensing hygiene (NFR-006). Keeps the package importable from any workspace (including non-React contexts) with no bundle cost. |
| **TS config** | Extends `tsconfig.base.json` (strict + friends). `outDir: ./dist`, `declaration: true`. `include: ["src/**/*"]` (tests excluded, as every other package does). | Constitution I — strict everywhere. |
| **Entry points** | Root entry `@europa/design` re-exports tokens (and helpers). Optional subpath `@europa/design/tokens` is the same module — single implementation, two import spellings. No CSS subpath export (stylesheet is `dist/design.css` consumed by path, not JS import). | FR-002 — one stylesheet + one token entry shape. Keeping the stylesheet out of the JS export avoids bundling CSS into non-browser packages. |
| **Build outputs** | `dist/index.js` + `dist/index.d.ts` (JS) and `dist/design.css` (stylesheet). Generated by `tsup` for TS plus a deterministic CSS emit step. | One shipped stylesheet (FR-002/FR-011). `dist/design.css` is the canonical file that the vendored copy mirrors. |

### 2. Token generation — single TS source → CSS vars + TS constants, drift-free

**Chosen shape**: **TypeScript table is the single source; CSS is generated from it** (not two parallel hand-authored lists).

- `src/tokens.ts` declares the canonical map — e.g.:

  ```ts
  export const TOKENS = {
    color: { pageBg: '#0b0f19', surface: '#111827', /* … */ },
    typography: { fontStack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', /* scale */ },
    spacing: { /* 0.25/0.5/0.75/1 rem scale */ },
    radii: { plate: '8px', pill: '999px', /* … */ },
    borders: { width: '1px', color: 'var(--europa-color-border)' /* etc. */ },
    shadows: { /* named none + future */ },
    focusRing: { width: '2px', style: 'solid', color: '#ffffff', offset: '2px' },
    motion: { durationMs: 120 /* etc. */, easing: 'ease' },
  } as const;
  ```

  Each entry carries its CSS variable name (`--europa-color-page-bg` etc.) as a `const` mapping, and a typed constant value.
- A tiny deterministic emitter (`scripts/build-css.ts` or inline `tokens.css.ts`) walks the table, emits `:root { --europa-*: value; }` plus derived rule blocks for typography/radii/etc., and writes `dist/design.css`. No external tokenizer (Style Dictionary, etc.) — see `research.md` for the rejected alternatives.
- **Drift check**: a unit test imports `TOKENS` and reads `dist/design.css` (or the emitter's string), asserts byte identity or structured equality: every `--europa-*` appears exactly once in `:root` with the same canonical value, and the set of TS keys equals the set of CSS vars. Failure names the missing/mismatched var. This pins FR-004 mechanically.

**Why this shape over CSS-first**: TS-first keeps the TS type (`typeof TOKENS.color.pageBg` is `'#0b0f19'`) precise and avoids parsing CSS at test time. CSS parsing for the drift check is the easy direction (split on `--europa-`).

### 3. Component / class-name catalog — stylesheet implements `europa-*` classes

The stylesheet (`dist/design.css`) beside the `:root` block declares one rule family per catalog entry listed in FR-006. Each class composes only `var(--europa-*)` tokens — no literals — so the catalog is shareable between React and plain HTML.

Rough section outline of `dist/design.css`:

```css
/* 1. :root — all --europa-* variables */

/* 2. Base — body/page, typography treatments, layout containers */
.europa-page { /* centered column + measure */ }
.europa-stack { /* gap primitives */ }
.europa-typography--heading { }

/* 3. Surfaces */
.europa-card, .europa-plate { }

/* 4. Buttons */
.europa-button, .europa-button--primary, .europa-button--secondary, .europa-button--ghost { }
.europa-button:focus-visible { /* uses --europa-focus-ring-* */ }

/* 5. Banners, HUD, lobby, badge/chip, modal, grid … */
.europa-banner { }
.europa-hud { }
.europa-lobby, .europa-lobby__card, .europa-lobby__grid { }
.europa-chip, .europa-badge { }
.europa-modal-backdrop, .europa-modal { }
.europa-grid, .europa-grid--sidebar { }
```

Every class family's existence and spelling is pinned by `DESIGN.md` (the contract) and by the drift test `specs/012-design-system/contracts/design-system.contract.md#classes` — see §7.

### 4. Palette derivation — `packages/console/src/render/palette.ts`

After migration `palette.ts` is a **thin re-export + computed helpers** over `@europa/design` tokens:

```ts
import { TOKENS } from '@europa/design';  // or named imports
export const VOID_COLOR = TOKENS.color.void;
export const PAGE_BACKGROUND_COLOR = TOKENS.color.pageBg;
// … every color …
export function terrainColor(terrain: 'land' | 'water', elevation: number): string {
  // land path uses TOKENS.landHsl.*; exists so Canvas can shade without reading CSS vars
}
```

No inline hex remains (FR-009). `terrainColor` stays here because Canvas needs a JS-computable string per cell. Long-term it could move into `@europa/design`, but keeping it in console avoids pulling rendering concerns into the token package this cycle — the design package owns the HSL constants, console owns the composition.

**Invariant**: both the DOM path (styles/index.css `var(--europa-*)`) and the Canvas path (palette.ts constants) resolve to the same canonical hex for every color (FR-009 second half). A dedicated test asserts the identity.

### 5. Console import shape — single stylesheet source

The console imports the design stylesheet **once** at its entry point and does not duplicate its rules:

- Preferred shape: `src/main.tsx` (or `src/styles/index.css`) does `import '@europa/design/dist/design.css'` — or `src/styles/index.css` starts with `@import '@europa/design/dist/design.css'` — implementation may keep `src/styles/index.css` as the console's entry file that now consists of `@import` + only app-specific layout glue (if any) that also uses `var(--europa-*)`. Exact import statement is finalized in implementation, but the behavioral invariant is sharp:
  - Build output contains exactly one copy of the design rules (Vite dedupes the `@europa/design` import; no parallel copy).
  - A structural test asserts every `color/background/border-color/border-radius/gap/padding/margin/box-shadow/focus` declaration in `packages/console/src` is either a `var(--europa-*)` or an allowed narrowly-scoped canvas fallback documented in spec Edge Cases / FR-009.

### 6. Docs vendoring — `dist/design.css` → `docs/manual/assets/design.css`, Jekyll layout

**Jekyll constraints** (spec context): `docs/manual` has no `_config.yml` and no custom theme; `.github/workflows/pages-deploy.yml` runs `actions/jekyll-build-pages` with `source: ./docs/manual` → `./_site` and uploads `./_site`. The only way to keep artifact scope sat while sharing the stylesheet is to **vendor a byte-identical copy inside `docs/manual`** — no workflow `source`/`path` widening.

Chosen wiring:

1. `@europa/design` build step, after writing `dist/design.css`, runs a tiny copy script (or `pnpm --filter @europa/design vendor` → file copy) that writes `docs/manual/assets/design.css`. That vendored file is **checked in** via `git add docs/manual/assets/design.css` — the build output is deterministic so the file is reproducible and the repo remains buildable from a clean checkout.
2. `docs/manual/_layouts/default.html` (new minimal layout) includes:

   ```html
   <link rel="stylesheet" href="{{ '/assets/design.css' | relative_url }}">
   ```

   and wraps the content in catalog classes (`europa-page`, `europa-typography--body`, etc.). No Jekyll theme gem, no external CDN (spec FR-015).
3. Individual `docs/manual/*.md` pages either set `layout: default` in frontmatter or are retrofitted so the layout's chrome applies to every page; no per-page custom CSS literals (FR-012).

**Why byte-identical copy vs symlink**: GitHub Pages renders Markdown via Jekyll in a fresh checkout; a symlink outside `docs/manual` would not be followed into the artifact scope — a tracked file inside `docs/manual` is the only reliable shape.

**Determinism**: the emitter sorts keys, emits a stable header comment (or no header), and writes LF — the vendored copy and the package's `dist/design.css` hash identically at HEAD. A hash-equality test pins it (FR-014/SC-003).

### 7. DESIGN.md — location, structure, version sync

- **Location**: repo root `DESIGN.md` (FR-017 + spec Clarifications v1.0 — rationale: discoverability alongside `README.md`; `packages/design/README.md` is a short link, not a second catalog).
- **Header**: `# Europa Neo Design System — ${APP_VERSION}` or `<!-- version: 0.1.0 -->` — the exact marker is finalized in implementation, but MUST be greppable by the drift check. The existing `packages/version/src/app-version.ts` (`APP_VERSION = '0.1.0'`) is the single source for that value; `DESIGN.md` mirrors it rather than owning it.
- **Sections** (FR-017 exhaustive):
  1. Version + how to bump (links to spec 009 chore convention).
  2. Token tables — one table per FR-003 group with columns: token name | CSS variable | TS constant | canonical value | (for colors) pairing + ratio + target.
  3. Component/class-name catalog — one entry per FR-006 item with: class name(s) | variants/modifiers | required DOM structure | use | a11y obligations (FR-008).
  4. A11y pairing table — every text-on-bg pair, ratio, AA target, how the automated check measures it (computed styles read).
  5. Rules: single-stylesheet (FR-011), vendoring + byte-identity (FR-013/FR-014), no-CDN scope, sync rule (every token/class/pairing change updates `DESIGN.md` in the same commit — FR-018), and extension guidance (light-theme note + variant vs breaking policy — FR-019).
- **Drift surface**: a focused test (or reused `version:check` helper) reads `DESIGN.md`'s header version and `packages/design/package.json` version and `packages/version/src/app-version.ts` and fails loudly when they diverge. A second test reads every `--europa-*` in `packages/design/dist/design.css` and every token row in `DESIGN.md` and fails on orphans. A third reads every `europa-*` class in the stylesheet and cross-checks the catalog section.

### 8. Biome / CI sync

| File | Change (FR-022) |
|------|-----------------|
| `biome.jsonc` | `files.includes` and `overrides` cover `packages/design/**`. The new package is **not** excluded by `!specs/*/contracts/**`; that exclusion remains scoped to spec contracts only. No new `formatter:off` override — the design package formats normally under the 4-space/120-col rule. |
| `client-ci.yml` | `on.push.paths` / `on.pull_request.paths` gain `packages/design/**`, `DESIGN.md`, `docs/manual/assets/design.css`, `docs/manual/_layouts/**`. The jobs' build steps gain `pnpm --filter @europa/design build` **before** the console build (FR-021 — produced before consumed, so `dist/design.css` exists when the console's Vite resolves `@europa/design/dist/design.css`). |
| `pages-deploy.yml` | `on.push.paths` / `on.pull_request.paths` add `docs/manual/assets/design.css`, `docs/manual/_layouts/**`, and `DESIGN.md` *or* `packages/design/**` under a gated filter — **without** adding `packages/**` to `actions/jekyll-build-pages` `source` or to `upload-pages-artifact` `path`. Artifact-scope assertion remains: the uploaded `./_site` contains only files derived from `./docs/manual`, auditable from that tree. |
| `version-drift.yml` | `on.push/pull_request.paths` add `packages/design/package.json`, `packages/design/src/**`, `DESIGN.md`, `docs/manual/assets/design.css`. The drift job's check (currently `pnpm version:check`) is extended — either that script reads the new surfaces directly, or a companion script `pnpm --filter @europa/design check:drift` is invoked alongside it inside the same job — to include `@europa/design` package version + `DESIGN.md` header. No special-case exemption. |

### 9. Build ordering — pnpm workspaces

- The root `pnpm-workspace.yaml` already globs `packages/*`; `packages/design` is auto-discovered — no edit needed.
- `@europa/console`'s `package.json` gains `"@europa/design": "workspace:*"` in `dependencies`. `pnpm install` wires the symlink.
- Root `pnpm build` today is `pnpm -r --filter './packages/*' build`. pnpm's topological ordering respects `workspace:*` edges, so adding the edge guarantees `design` builds before `console` without reordering the script — still, CI explicitly sequences `pnpm --filter @europa/design build` before the console build for determinism (see above).
- The `design → docs/manual` vendoring copy is triggered by the design build itself (post-build hook or `vendor-to-docs.ts`), so a clean `pnpm install && pnpm build` produces the vendored asset and the console bundle in one command (FR-021). Running `pnpm --filter @europa/design build` alone also vendors, so `pnpm build` need not add a second copy step — but the invocation remains idempotent if run twice.

### 10. A11y contracts — encoded, not aspirational (FR-016)

| Concern | Implementation | Automated check |
|---------|----------------|-----------------|
| Contrast (WCAG 1.4.3) | Every color token pairing table row carries `ratio ≈ X:1` + `target: AA` (FR-005). Canonical pairs: chip `#f9fafb` on `#111827` ≈ 16.98:1, muted `#9ca3af` on `#111827` ≈ 6.99:1, banner text `#111827` on `#d97706` ≈ 5.57:1, page text `#e5e7eb` on `#0b0f19` ≈ 15.47:1. (Ratios are the measured values from `DESIGN.md` § 3, not planning-time estimates.) | A focused test renders a fixture page (console or manual layout) importing the design stylesheet, reads `getComputedStyle` for each pairing, computes the relative-luminance ratio (WCAG formula, not a snapshot), asserts ≥ 4.5:1 (normal) / 3:1 (large) / 3:1 (non-text) per the table. Failure names the pairing + measured ratio. |
| Focus-visible (WCAG 2.4.7) | Token ` --europa-focus-ring` / class `europa-focus-ring` (or `*:focus-visible` rule) — `2px solid #ffffff` + `2px` offset on `#111827` (≈17.74:1 vs plate, ≥3:1 vs any adjacent). Every interactive component family (`button`, `gridcell`, lobby controls, etc.) uses `:focus-visible` rather than `:focus`. | Axe scan stays green + a focused browser test tabbing the console + manual page asserts a visible outline of the token thickness on every interactive surface. |
| Reduced motion (WCAG 2.3.3) | Stylesheet wraps decorative animations in `@media (prefers-reduced-motion: reduce) { animation: none !important }` **and** console honors `.europa-waiting--reduced`. | A browser component test with `prefers-reduced-motion: reduce` asserted (via Playwright emulation or `matchMedia` override) checks the waiting spinner / banner transitions are inert. |
| Color-alone (Principle VI) | Catalog entries name the redundant encoding — e.g., chip has `#111827` plate **plus** pill border + numeric label, "your match" badge has amber edge **plus** text label, rows use position **plus** color. | Manual review of catalog rows + a coverage assertion that every component row includes a "not color alone: …" sentence. |

### 11. No-literals enforcement — FR-002/FR-009/FR-010 via CI + local check

A single check script (sibling to `version:check`) implements the allow-list/deny-list:

- **Deny**: `/#[0-9a-fA-F]{3,8}\b/` and `/rgba?\(/` and `/hsla?\(/` appearing in `packages/console/src/**` and `docs/manual/**` except in `import` from `@europa/design` (the only legal literal surface is inside `packages/design/src/tokens.ts` where literals anchor the source). The check tolerates exactly one documented exception: a canvas-paint fallback where a CSS variable cannot be read synchronously (FR-009 edge case) — scope is a single named function/line with a comment cross-referencing spec Edge Cases and a constants re-import alias, and the check's allow-list is line-scoped, not file-scoped.
- **Allow**: `var(--europa-*)` references and `TOKENS.*` / `@europa/design` imports.
- Failure message prints every offending file + line (FR-009 last sentence's requirement "fail with actionable message") and exits non-zero; it runs both locally (`pnpm lint` or dedicated `pnpm --filter @europa/design check:no-literals`) and in `client-ci.yml`.

### Diagram

```
                    ┌──────────────────────────┐
                    │  specs/012-design-system │
                    │  contracts/*.contract.md │  ← drift contract
                    └────────────┬─────────────┘
                                 │ pins
                                 ▼
  ┌─────────────────────────────────────────────────┐
  │           DESIGN.md (repo root)                 │  version header = APP_VERSION
  │  token tables + class catalog + a11y + rules    │  authoritative over both ↓
  └───────┬─────────────────────────┬───────────────┘
          │ enumerates              │ enumerates
          ▼                         ▼
┌─────────────────────┐   ┌─────────────────────────┐
│ packages/design/src │   │ packages/design/dist/   │
│ tokens.ts           │──►│ design.css              │──► drift checks (TS ↔ CSS ↔ DESIGN.md)
│  TOKENS (source)    │   │  :root{--europa-*}      │    byte-identical copy
└─────────────────────┘   │  .europa-* classes       │       │
          │               └─────────────┬───────────┘       │
          │ typed constants             │ stylesheet         │ copy (checked-in)
          ▼                             │                    ▼
 ┌──────────────────┐          ┌────────────────┐  ┌────────────────────────┐
 │ console palette  │          │ console        │  │ docs/manual            │
 │palette.ts derives│          │ src/styles/    │  │ assets/design.css      │◄── Pages artifact
 │from TOKENS       │          │ index.css      │  │ (vendored, byte-ident) │
 └──────────────────┘          │ var(--europa-*)│  │ _layouts/default.html  │
                               │ europa-* classes│  │  <link href="…">       │
                               └────────────────┘  └────────────────────────┘
         Canvas + DOM                    │                     │
         share TOKENS ──────────────────┴─────────────────────┘
                           single stylesheet source (FR-011)
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missed literal in console migration — visual regression or no-literals check failure | Med | Low | Grep script + computed-style smoke across the canonical surfaces (SC-001). Migration lands as one commit; review diff is literals → `var(--europa-*)` only. |
| Vendored `docs/manual/assets/design.css` goes stale (design changed without re-vendoring) | Med | Med | Byte-identity check runs in `pages-deploy.yml` and `client-ci.yml`; local build auto-vendors so stale check-ins fail fast with the file+hash in the message. |
| Jekyll default HTML wrapper strips design classes | Low | Med | `_layouts/default.html` is minimal and explicit — content + `<link>` only. Manual build is verified by asserting rendered HTML contains the link and DOM classes. |
| `DESIGN.md` diverges from `dist/design.css` | Med | Med | Catalog-vs-code test enumerates every `--europa-*` and `europa-*` in the built CSS and compares to `DESIGN.md` tables; version header vs `package.json` via `version:check` extension. |
| Bundle budget regresses (design CSS is additive) | Low | Low | Gzip bundle budget assertion (< 150 KB) stays in `client-ci.yml`; design package is deduped and literals are net-removed so budget is expected to stay green. Guard test fails on exceed. |
| Light-theme note creates confusion | Low | Low | Spec FR-019 wording is quoted verbatim; no toggles shipped, just the additive-extension shape. |

---

## Verification Plan (acceptance → artifact mapping)

| Spec SC | How this plan covers it |
|---------|-------------------------|
| SC-001 no visual regression | Computed-style assertions for page/HUD/lobby/void/muted/chip/banner/focus ring vs token values + all existing console suites green |
| SC-002 no duplicated literals | No-literals grep script (console) + `palette.ts` re-export invariant test |
| SC-003 single stylesheet, shared | Hash-equality `dist/design.css` ↔ `docs/manual/assets/design.css` + import-graph check console imports exactly one design stylesheet |
| SC-004 manual dark-slate cohesive | Rendered manual page has dark token bg, system-ui type, card/typography — asserted via computed styles + human QA screenshots |
| SC-005 a11y preserved | Contrast ratio tests (computed, not comments) + axe scans green + focus-visible on every interactive component + reduced-motion inert |
| SC-006 Pages artifact scope | Assertion on `pages-deploy.yml`'s `./_site` artifact listing after a manual-changing push (no `packages/**` etc.); workflow `source`/`path` not widened |
| SC-007 living contract truth | `DESIGN.md` header = `@europa/design` version; token tables cover every `--europa-*` + TS export; catalog covers every `europa-*` class — coverage via catalog-vs-code tests |
| SC-008 house-keeping sync | `biome.jsonc` includes + workflow `paths:` checks + drift surface for new package + header, all asserted by scanning the config files themselves |

---

## Out of Scope (from spec — not handled here)

Light-theme variant, Storybook/visual-regression service, rebrand/prose rewrite, spec 011 Docker, publishing any package, general theming engine. Rejected complexity is documented in research.md §Alternatives.
