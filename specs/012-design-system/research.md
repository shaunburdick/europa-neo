# Research: Shareable Design System Between UI and Documentation

**Feature**: `012-design-system` (issue #25) | **Date**: 2026-08-30 | **Status**: Complete — no NEEDS CLARIFICATION remains.

This document records the Phase 0 investigation: which problems needed answers before planning, what alternatives were considered, what was chosen, and why. Every choice traces to a spec FR/NFR and to the constitution or AGENTS.md.

---

## R1. Token tooling — how to keep CSS vars and TS constants in lockstep

**Problem**: FR-004 requires every token to be *both* a CSS variable (`--europa-*` in `dist/design.css`) and a typed TS constant (importable from `@europa/design`), with identical canonical values enforced by a drift check. The naïve shape is two hand-authored lists — but that *is* the drift this feature exists to fix.

**Alternatives considered**

| Approach | How it works | Pros | Cons |
|----------|--------------|------|------|
| **A. Two hand-authored lists + drift test** | Write `src/tokens.ts` and `src/styles/design.css` independently; test asserts equality. | Simple tooling, no emitter. | Still relies on reviewers updating both places; drift is caught but not prevented. Two sources, not one. |
| **B. Style Dictionary / Theo** | Adopt `style-dictionary` (or Theo) with a JSON/YAML token source that emits CSS + JS. | Industry standard, multi-format, future themability. | New build dependency + config (~200KB, license LGPL-ish nuance to audit) for ~30 tokens. Overkill per constitution Principle V. Config is its own surface to keep in sync with `DESIGN.md`. |
| **C. TypeScript table is the single source → deterministic CSS emitter** (chosen) | `src/tokens.ts` (`as const`) is the sole literal site; `scripts/build-css.ts` walks the table and writes `dist/design.css` (`:root { --europa-*: value; }` plus derived blocks). The drift check then becomes an identity hash over the emitter output vs checked-in `DESIGN.md` tables — the drift test mutates into a *generation proof*. | Zero new runtime deps; one literal site (FR-004 by construction); `typeof TOKENS.color.pageBg` is `'#0b0f19'` for free; `DESIGN.md` tables are generated or mechanically mirrored from the same table, so catalog drift is a typed error, not a silent miss. | Requires a tiny emitter. If the emitter has a formatting bug, the CSS is wrong — mitigated by computed-style tests (SC-001). |
| **D. CSS is the source → TS extracted via parsing** | Author `design.css` by hand; a script parses `var(--europa-*: …)` into TS constants. | Designers work in CSS. | TypeScript types become `string` not literal; parsing CSS in tests is the hard direction (values need unquoting, HSL handling). The TS→CSS emitter is deterministic with less parser surface. |

**Decision**: **C — TypeScript table is the single source, CSS is generated deterministically.** Zero-runtime-deps (FR-001 + NFR-006), smallest tooling (Principle V), easiest typed contract. Style Dictionary (B) is explicitly rejected here; the `research.md` addendum notes that if the token count grows past ~100 or a light theme needs runtime switching, the cost/benefit of re-evaluating B can be revisited — but not in this feature. The build emits a stable file (sorted keys, LF, no timestamp) so hashing is reproducible.

**Consequences**: `packages/design/src/tokens.ts` is the only file that may contain hex literals outside tests; any other literal is a `check:no-literals` failure (FR-009/FR-010). `packages/console/src/render/palette.ts` becomes `import { TOKENS } from '@europa/design'` thin wrappers.

---

## R2. Jekyll vendoring — how the manual gets the stylesheet without widening artifact scope

**Problem**: FR-013 mandates that `pages-deploy.yml`'s `source: ./docs/manual` and artifact scope remain exactly the manual tree, and the shared stylesheet reach the Pages deployment by **living inside `docs/manual`** — not by widening `source`/`paths` to `packages/**`.

**Alternatives**

| Approach | Artifact scope | Build requirement | Freshness |
|----------|----------------|-----------------|-----------|
| **A. Widen workflow to checkout packages/design → copy at CI time only** | Breaks FR-013 — `pages-deploy.yml` now copies outside `docs/manual`; local `pnpm build && serve _site` diverges from CI. | CI-only — clean clone + `jekyll build` without pnpm fails. | Always fresh, but scope violation. |
| **B. Checked-in vendored copy `docs/manual/assets/design.css`, byte-identical to `packages/design/dist/design.css`** (chosen) | ✅ Scope intact — artifact is exactly `docs/manual`, because the vendored file is inside it. Local and CI builds are identical. | `pnpm --filter @europa/design build` vendors as its post-build step; the file is tracked. Staleness is a CI failure, not a silent bug (FR-014). | Requires disciplined copy + CI hash check. |
| **C. Jekyll `symlink` or `include` directive pointing outside `docs/manual`** | Jekyll's safe mode ignores symlinks outside `source`; GitHub Pages' `jekyll-build-pages` ignores them. | N/A. | Broken. |
| **D. Publish `@europa/design` to npm and fetch via CDN** | Violates `private:true` (AGENTS.md binding 6) + NFR-002 self-hostable + FR-015 no CDN. | — | Rejected outright. |

**Decision**: **B — checked-in vendored, byte-identical copy.** FR-013 is explicit that this is the correct shape; alternatives A/C/D are rejected as scope violations, Jekyll-safe-mode failures, or privacy/CDN violations. The build determinism requirement (LF, sorted, no timestamp) makes the hash check stable.

**Implementation detail**: the copy step lives inside `packages/design`'s build (not in `pages-deploy.yml`) so a local `pnpm build` from a clean checkout always produces the vendored file, and CI's `actions/jekyll-build-pages` sees it without any extra action. The file path is `docs/manual/assets/design.css` — the conventional Jekyll `assets/` location, predictable for `_layouts/default.html`.

---

## R3. Drift / guard strategies — "specs stay truthful" for `DESIGN.md`

**Problem**: FR-017–FR-019 extend AGENTS.md workflow rule 4 to `DESIGN.md`: every token/class/a11y change updates `DESIGN.md` in the same commit, and CI must fail on drift with an actionable message.

**Checks required (spec Edge Cases + SC-002/003/007)**:

1. CSS-var ↔ TS-constant identity (FR-004).
2. `DESIGN.md` ↔ implementation agreement — missing token, mismatched value, undocumented class (FR-003/FR-006/FR-018).
3. Console no-literals enforcement (FR-009/FR-010) — hex/rgb/literal `color`/`background`/`border`/`spacing` outside imports.
4. Vendored-asset byte identity `dist/design.css` ↔ `docs/manual/assets/design.css` (FR-014).
5. `DESIGN.md` header version = `@europa/design` package version = `APP_VERSION` lockstep (FR-020/FR-017 + spec 009 FR-009).
6. Catalog-vs-stylesheet coverage — every `europa-*` visual class in `dist/design.css` is catalogued and vice versa (SC-007).
7. A11y pairing ratios — every text-on-bg pair in DESIGN.md's a11y table meets AA when measured as computed styles (FR-016).
8. Bundle budget not regressed (< 150 KB gz browser payload).

**Alternatives for enforcement**

| Strategy | Mechanism | Verdict |
|----------|-----------|---------|
| **A. Single `pnpm version:check` already guards FR-009 version lockstep — extend it** | Read `DESIGN.md` header regex + `packages/design/package.json` version inside the existing `scripts/check-version-drift.ts` (or a tiny companion script in `packages/design/scripts/check-design-drift.ts`). | Chosen for checks 1/2/4/5/6 — shares the same `packages/version` helper/CI job, no new workflow. |
| **B. Standalone new GitHub workflow `design-drift.yml`** | New workflow with its own job matrix + path filters. | Adds CI fragmentation for a tiny package. Rejected — extend `version-drift.yml` with paths + an extra script invocation in the same job. |
| **C. Runtime fetch/computed-style grep in Node** | Tests import tokens, render a fixture `<div class="europa-*">`, read `getComputedStyle` via `happy-dom` or Playwright. | Chosen for checks 7/8 — computed-style reads happen in existing Vitest browser-mode tests (console) and a small manual-build integration smoke, not in the version script. |

**Tooling choice**: no new CSS parser lib. The drift helper regex-scans `dist/design.css` for `--europa-` declarations and class selectors — sufficient for a fixed output format (emitter-controlled). If parsing grows complex, `postcss` is the fallback, but YAGNI this cycle.

---

## R4. Palette bridge — how Canvas stays consistent without reading CSS vars

**Problem**: the Canvas 2D painter (`packages/console/src/render/canvas.ts`) and the DOM overlay (`cell-view.tsx`) must stay pixel-consistent (spec 003/005 context). Canvas cannot `getComputedStyle` at paint time per cell (perf + layer coupling); it reads `palette.ts` constants.

**Options**

| Approach | Graph | Verdict |
|----------|-------|---------|
| **A. Palette derives from design tokens (thin re-export)** — `palette.ts: import { TOKENS } from '@europa/design'`, keeps `terrainColor()` here | `design → (none)`, `console → design` — no cycle | **Chosen.** Keeps rendering composition in console while tokens own the literals. Satisfies FR-009. |
| **B. Move `terrainColor()` into `@europa/design`** | Design now knows about `elevation 0..255` terrain semantics — leaks game logic into the design package. | Rejected this cycle; separable later if reuse emerges. |
| **C. Read CSS vars via `getComputedStyle(document.documentElement).getPropertyValue('--europa-…')` at runtime** | Breaks Canvas in headless/test envs; couples paint to DOM lifecycle. | Rejected (research trail from spec 005 already ruled this out). |

**Decision**: **A — thin re-export, helpers stay in console.** FR-009's inverse invariant (`styles/index.css` contains no literals outside `var(--europa-*)`) and the palette import-graph test pin both halves.

---

## R5. Documentation layout — minimal Jekyll integration without a theme

**Problem**: `docs/manual` today ships pure Markdown rendered by `actions/jekyll-build-pages` with defaults and no `_config.yml`. FR-012 requires the manual to render dark-slate via catalog classes while FR-015 forbids an external theme gem or CDN.

**Research findings**

- `actions/jekyll-build-pages` (v1.0.13, used by the repo) runs stock Jekyll. With no `_config.yml`, Jekyll treats `docs/manual` as a docs site with default Markdown → HTML conversion. Adding a minimal `_layouts/default.html` is allowed and does not constitute "adding a theme" per spec Clarifications v1.0 — a local wrapper that pulls `assets/design.css` stays within the scoped source.
- Adding a `theme:` key in `_config.yml` or a `<link>` to a CDN would violate FR-015; neither is proposed.
- Assets under `docs/manual/assets/` are copied through Jekyll verbatim (no `assets` exclusion by default). A `<link rel="stylesheet" href="{{ '/assets/design.css' | relative_url }}">` is the correct Jekyll-liquid path.

**Decision**: add `docs/manual/_layouts/default.html` — a tiny HTML5 shell (head → link → body → `{{ content }}`) using `site` + `page` liquid and `europa-page` / `europa-typography--*` catalog classes — and wire manual pages to `layout: default` (global default via front-matter defaults or per-file frontmatter, whichever needs less file churn). No `_config.yml` theme entry, no CDN.

---

## R6. Biome and workflow path filters — how to keep CI trigger- and formatting-complete

**Problem**: FR-022 requires `biome.jsonc` + workflow `paths:` to cover the new surfaces so changes trigger the right checks without widening Pages scope.

**Findings**

- `biome.jsonc` today layers `biome-config-shaunburdick@1.0.0` with `packages/*/src/**` under `files.includes: ["**"]` minus `!node_modules/!dist/!coverage`. New package files are already covered — no `includes` widening needed — but an explicit override entry for `packages/design/**` (or confirming the default inclusion) must be reviewed so `check:drift` and `format:check` actually lint the token file.
- `client-ci.yml` today watches `packages/console/**`, `specs/005-client-console/**`, plus each upstream package path (`packages/engine/**`, `terrain`, `fog`, `networking`, `matchmaking`, `version`). New design paths (`packages/design/**`, `DESIGN.md`, `docs/manual/assets/design.css`, `docs/manual/_layouts/**`) must join that list; the job's build steps must run `pnpm --filter @europa/design build` before the console build (FR-021).
- `pages-deploy.yml` today watches `docs/manual/**` + self. It gains `docs/manual/assets/design.css`, `docs/manual/_layouts/**`, and `DESIGN.md` (or `packages/design/**` if the vendor copy is derived from it) — but the `actions/jekyll-build-pages` `with: source:./docs/manual` and `upload-pages-artifact: path:./_site` remain exactly scoped.
- `version-drift.yml` today watches `package.json`, `packages/**/package.json`, `packages/version/**`, `README.md`, `docs/manual/index.md`, plus self. It gains `packages/design/package.json`, `packages/design/src/**`, `DESIGN.md`, `docs/manual/assets/design.css`; its job gains an invocation of the new design-drift check alongside `pnpm version:check`.

**Decision**: direct edits to `biome.jsonc` + three workflows — minimal, auditable, and path-gated. No new workflow for design. The Pages employer's `source`/`path` are explicitly untouched (SC-006).

---

## R7. No-literals allow-list scope

**Problem**: spec Edge Cases + FR-009 allow "at most one narrowly-scoped canvas fallback where a CSS variable is not addressable without JS." The no-literals script must enforce color/spacing/radius/border literals are gone while tolerating exactly that.

**Decision**: the allow-list is **line-scoped, not file-scoped**, annotated with a comment of the form `// design-exception: canvas fallback — spec Edge Cases §7` adjacent to the offending line, so the check can grep for the literal + exemption comment on the same line (or the immediately preceding line). A file-scoped exemption would mask regressions; the line scope keeps the promise sharp.

---

## R8. Version header marker — how `DESIGN.md` participates in lockstep

The overall lockstep surface (spec 009 FR-009/FR-010) already includes `package.json` (root + every `packages/*/package.json`) and `packages/version/src/app-version.ts`. `docs/manual/index.md` is already in the `version-drift.yml` paths list (from spec 009's README/index footer drift). `DESIGN.md` joins that surface.

**Marker format** (to be pinned in `contracts/design-system.contract.md`): a top-level heading carrying the version token in the same `0.1.0` shape, e.g.:

```markdown
# Europa Neo — Design System

> **Version**: `0.1.0` — must match `APP_VERSION` in `packages/version/src/app-version.ts` and every `package.json#version`.
```

The drift helper greps `DESIGN.md` for the marked version string (`/Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/`). The exact marker is finalized in implementation but MUST be machine-readable with a single regex — the contract's "version header format" clause is the normative reference.

---

## Summary Table — All Resolutions

| # | Topic | Decision | Traces To |
|---|-------|----------|-----------|
| R1 | Token tooling | TS table is single source → deterministic CSS emitter; Style Dictionary rejected (YAGNI) | FR-003, FR-004, NFR-004 |
| R2 | Jekyll vendoring | Checked-in `docs/manual/assets/design.css` byte-identical to `dist/design.css` | FR-012–FR-015, SC-006 |
| R3 | Drift guards | Extend `version-drift.yml` + sibling `check:drift` + computed-style browser checks | SC-002, SC-003, SC-007, SC-005 |
| R4 | Palette bridge | `palette.ts` thin re-export from `@europa/design`; `terrainColor()` stays in console | FR-009 |
| R5 | Jekyll layout | Minimal `_layouts/default.html`; no `_config.yml` theme, no CDN | FR-012, FR-015, NFR-002 |
| R6 | Biome/CI housekeeping | Direct `biome.jsonc` + 3-workflow `paths:` + build-order updates; no new workflow | FR-021, FR-022, SC-008 |
| R7 | No-literals allow-list | Line-scoped `// design-exception: canvas fallback` only | FR-009 Edge Case |
| R8 | Version header | `> **Version**: `0.1.0`` greppable marker inside `DESIGN.md` | FR-017, FR-020, SC-007 |

No open research items remain. All patterns in use are current stable releases per the repo's catalog in `pnpm-workspace.yaml` (Node 22, TypeScript 5.6, Vitest 4.1, `biome-config-shaunburdick@1.0.0`, Vite 8, actions SHA-pinned in workflows).

