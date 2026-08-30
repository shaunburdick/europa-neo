# Tasks: Shareable Design System Between UI and Documentation

<!-- Trimmed 2026-08-30: G-01/G-02/G-03 drift suite + T-015/T-018/T-022/T-023/T-024 deferred per product-owner decision. -->

**Feature**: `012-design-system` (issue #25) | **Branch**: `issue-25-design-system` | **Date**: 2026-08-30
**Input**: [`spec.md`](./spec.md) (22 FRs, 8 SCs, 4 user stories), [`plan.md`](./plan.md), [`research.md`](./research.md), [`data-model.md`](./data-model.md), [`contracts/design-system.contract.md`](./contracts/design-system.contract.md), [`quickstart.md`](./quickstart.md)
**Workflow**: spec-driven, Phase 5 — every task traces to an FR/SC and carries its acceptance + file list. Parallel-safe tasks are marked `[P]`.

> **Branch/spec-kit note**: the feature directory is `specs/012-design-system/`; the git branch is `issue-25-design-system`. Tasks reference the latter as the working branch.

---

## Phase 1: Setup — Shared Infrastructure

**Purpose**: scaffold the new package, wire workspace dependencies, and baseline housekeeping so later tasks build.

- [x] **T-001 — Scaffold `packages/design` workspace package**
  - **Description**: Create `packages/design/` with `package.json` (`name: @europa/design`, `private: true`, `version: 0.1.0` lockstep, `type: module`, `files: ["dist"]`, `exports: { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }, "./tokens": "./dist/index.js" }`, zero `dependencies`), `tsconfig.json` extending `../../tsconfig.base.json` (`strict:true`, `outDir:./dist`, `rootDir:.` shape matching sibling packages, `include: ["src/**/*"]`, `exclude: ["tests/**/*","dist"]`), `tsup.config.ts` (entry `src/index.ts` → `dist/index.{js,d.ts}` + supplementary `build-css` hook), `tests/` directory, and `README.md` stub (short, links to root `DESIGN.md`).
  - **Acceptance**: `pnpm install --frozen-lockfile` succeeds; `pnpm --filter @europa/design build` emits `dist/index.js` + `dist/index.d.ts`; `private:true` and zero `dependencies` asserted; TypeScript `tsc --noEmit` inside package is green.
  - **Files**: `packages/design/package.json`, `packages/design/tsconfig.json`, `packages/design/tsup.config.ts`, `packages/design/src/index.ts` (stub), `packages/design/README.md`, `packages/design/tests/.keep`.
  - **Depends on**: — (first task).
  - **Traces**: FR-001, FR-002, NFR-003.

- [x] **T-002 — Wire `@europa/design` into the monorepo graph**
  - **Description**: Add `"@europa/design": "workspace:*"` to `packages/console/package.json#dependencies`. Verify pnpm topological order (`pnpm -r --filter './packages/*' build` orders `design` before `console`). No `pnpm-workspace.yaml` edit required (glob `packages/*` already covers it) — confirm in comment/plan parity so reviewers don't attempt it.
  - **Acceptance**: `pnpm install --frozen-lockfile` symlinks `packages/console/node_modules/@europa/design`; `pnpm --filter @europa/console typecheck` resolves `from '@europa/design'`; graph shows `design → (none)`, `console → design`.
  - **Files**: `packages/console/package.json`.
  - **Depends on**: T-001.
  - **Traces**: FR-001, FR-021.

- [x] **T-003 [P] — Baseline `biome.jsonc` for `packages/design`**
  - **Description**: Update `biome.jsonc` so `packages/design/**` is formatted/linted under the same 4-space/120-col, LF, semicolons rules. No new `formatter:off` override — the design package formats normally. Confirm `!specs/*/contracts/**` still only excludes spec mirrors and does not accidentally exclude `packages/design`. Mirror the pattern used for sibling packages (root false configs remain children).
  - **Acceptance**: `pnpm format:check` covers `packages/design/src/**`; `pnpm lint` over the package is zero-errors; `biome.jsonc` diff is minimal and reviewed.
  - **Files**: `biome.jsonc`.
  - **Depends on**: T-001.
  - **Traces**: FR-022, NFR-003.

- [x] **T-004 — Create `DESIGN.md` skeleton + version marker**
  - **Description**: Author `DESIGN.md` at the repo root with the header marker `> **Version**: `0.1.0`` (research R8 exact value), section scaffold for token tables (one per FR-003 group), component catalog outline, a11y pairing table, single-stylesheet + vendoring + sync + extension-guidance rules (FR-017/FR-019), and a prose pointer to this feature's spec/plan. `packages/design/README.md` links to it and carries no competing catalog. The prose may be placeholder tables at this stage — structured so later tasks fill precise values without re-authoring the outline.
  - **Acceptance**: `DESIGN.md` exists at the repo root; `grep -R 'Version:' DESIGN.md` is greppable by the drift regex `/Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/`; `packages/design/README.md` links to `../../DESIGN.md`; `pnpm format:check` passes over `DESIGN.md`.
  - **Files**: `DESIGN.md`, `packages/design/README.md`.
  - **Depends on**: T-001.
  - **Traces**: FR-017, FR-019, FR-020.

---

## Phase 2: Foundational — Tokens, Stylesheet Source, Build Ordering

**Purpose**: establish the single-source token table, the deterministic CSS emitter, and the build-before-consumer ordering. No console/manual migration begins until this phase is green.

- [x] **T-005 — Define the canonical token table `src/tokens.ts` (single source)**
  - **Description**: Declare `export const TOKENS = { color: { pageBg: '#0b0f19', surface: '#111827', surfaceRaised: '#1f2937', voidBg: '#1a2233', border: '#374151', textPrimary: '#f9fafb', textSecondary: '#e5e7eb', textMuted: '#9ca3af', accent: '#f59e0b', city: '#fbbf24', banner: '#d97706', red: '#dc2626', green: '#059669', blue: '#2563eb', water: '#1d4ed8', landHue: 120, landSaturationPct: 12, landMinLightnessPct: 26, landMaxLightnessPct: 62, focusRing: '#ffffff', chipBg: '#111827', chipText: '#f9fafb', combatEffect: 'rgba(... )', captureEffect: 'rgba(... )', genericEffect: 'rgba(... )' }, typography: { fontStack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', scale*, lineHeight* }, spacing: { xs..lg scale }, radii: { plate: '8px', card: '6px', input: '4px', pill: '999px' }, borders: { width:'1px', style:'solid' }, shadows: { board:'none', plate:'none', modal:'none' }, focusRing: { width:'2px', style:'solid', color:'#ffffff', offset:'2px' }, motion: { durationMs: 120, easing:'ease' } } as const` — values must match the existing console literals enumerated in `packages/console/src/styles/index.css` and `palette.ts` (FR-003 first values). Each leaf's CSS-var name is the derivation `--europa-{group}-{kebab(name)}` maintained alongside the table (or as const mapping). Add a `src/index.ts` barrel re-exporting `TOKENS` (and later helpers).
  - **Acceptance**: `pnpm --filter @europa/design typecheck` is green (`strict:true`, literal types); every required color from FR-003 appears once; typography/spacing/radii values cover every literal in the console stylesheet audit (`grep -c '#[0-9a-f]'` against the old file → every hex has a matching token).
  - **Files**: `packages/design/src/tokens.ts`, `packages/design/src/index.ts`.
  - **Depends on**: T-001, T-004.
  - **Traces**: FR-003, FR-004, FR-005.

- [x] **T-006 — Build the deterministic CSS emitter `dist/design.css`**
  - **Description**: Implement `packages/design/scripts/build-css.ts` (or inline generation in `src/tokens.css.ts`) that walks `TOKENS` in sorted key order, emits a single `:root { --europa-* : value; }` block (LF, UTF-8, no BOM, no timestamp, lexicographic order) and writes `dist/design.css`. The script is invoked as a `tsup` `onSuccess` or as a `postbuild` step (`tsup && tsx scripts/build-css.ts`). Add `scripts/vendor-to-docs.ts` stub here (wiring deferred to T-012) or fold copy into the same script — the key is determinism: repeated builds are byte-identical.
  - **Acceptance**: `pnpm --filter @europa/design build && sha256sum dist/design.css && pnpm --filter @europa/design build && sha256sum dist/design.css` hashes match; `:root` block contains every `--europa-*` exactly once with canonical literal values from `TOKENS`; `pnpm lint` green; test can read the file and parse every `var`.
  - **Files**: `packages/design/scripts/build-css.ts`, `packages/design/tsup.config.ts` (hook), optionally `packages/design/src/tokens.css.ts`.
  - **Depends on**: T-005.
  - **Traces**: FR-002, FR-004, SC-003.

- [x] **T-007 — Implement the component catalog stylesheet (catalog classes)**
  - **Description**: Extend `dist/design.css` (either via the emitter or a second authored `src/styles/design.css` segment concatenated deterministically) with one rule family per FR-006 entry: `.europa-page`/`.europa-stack`, `.europa-card`/`.europa-plate`, `.europa-button` family (`primary`/`secondary`/`ghost` + `:disabled`/`:focus-visible`), `.europa-banner`, `.europa-hud` family, `.europa-lobby*` (page/grid/card/row/badge/empty/superseded), `.europa-chip`/`.europa-badge`, `.europa-modal*` (backdrop/dialog/title/body/actions/button), `.europa-grid`, `.europa-typography--*` (heading/muted/meta/mono), layout containers. Each declaration uses only `var(--europa-*)` (no literals). Compose the rule blocks by section (base → surfaces → buttons → HUD → lobby → badge/chip → modal → grid → typography → focus/motion). Verify every stated "must compose from tokens" in data-model.md § Catalog Component — `tokensUsed` entries all resolve.
  - **Acceptance**: `grep -R 'europa-' dist/design.css` lists every family from plan § Architecture §3 and contracts §2.3; no hex/rgb literal appears in the stylesheet outside `:root` values; each component's declarations are `var(--europa-*)`; `pnpm --filter @europa/design test` can parse every selector.
  - **Files**: `packages/design/src/styles/design.css` or extension to `scripts/build-css.ts` + `packages/design/dist/design.css` output.
  - **Depends on**: T-006.
  - **Traces**: FR-006, FR-007, NFR-004.

- [x] **T-008 — Add a11y gates inside the stylesheet (focus + reduced-motion)**
     - **Description**: Encode FR-016's focus-visible and reduced-motion contracts in `dist/design.css`: reusable `*:focus-visible, .europa-focus-ring { outline: 2px solid var(--europa-color-focus-ring); outline-offset: 2px; }` (white 2px solid + 2px offset on `#111827`, ≈17.74:1, G-07), and `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:0.01ms !important; transition-duration:0.01ms !important; } }` plus `.europa-waiting--reduced` compatibility. Ensure every interactive catalog family uses `:focus-visible` not bare `:focus` for the treatment.
  - **Acceptance**: Rendered fixture importing `dist/design.css` shows a visible outline of token thickness when an `.europa-button` or `.europa-grid` element receives `:focus-visible`; spinner animation's `animation-duration` is `0.01ms` when `prefers-reduced-motion` is emulated; axe scan over a fixture page stays green.
  - **Files**: same stylesheet source as T-007 (or its emitter template).
  - **Depends on**: T-007.
  - **Traces**: FR-016, NFR-001, data-model.md § Drift Guard G-07.

- [x] **T-009 [P] — Fill `DESIGN.md` token tables + pairing table**
  - **Description**: Replace the T-004 placeholder tables with the complete token tables per FR-003 + FR-005: one table per group, columns `token name | CSS variable | TS constant | canonical value | (for colors) pairing + ratio + WCAG target` (e.g. chip `#f9fafb` on `#111827` ≈ 16.98:1 AA, muted `#9ca3af` on `#111827` ≈ 6.99:1 AA, banner `#111827` on `#d97706` ≈ 5.57:1, page `#e5e7eb` on `#0b0f19` ≈ 15.47:1). Also add the § A11y Pairing Table. Every row must match the canonical values in `TOKENS`/`dist/design.css` — mechanical mirror, not a re-typed re-invention.
  - **Acceptance**: Every leaf in `TOKENS` appears as a row; `grep -- '--europa-' DESIGN.md | wc -l` equals the number of `--europa-*` vars in `dist/design.css`; every color pairing states `ratio ≈ X:1` and `target: AA` and is assertable by G-07.
  - **Files**: `DESIGN.md`.
  - **Depends on**: T-005, T-008.
  - **Traces**: FR-003, FR-005, FR-016, SC-007.

- [x] **T-010 [P] — Fill `DESIGN.md` component catalog + house rules**
  - **Description**: Replace the catalog outline with one entry per FR-006 family: `class name(s) | variants/modifiers | required DOM structure | use | a11y obligations (keyboard target size, focus-visible treatment, "not color alone: …" sentence per FR-008)`. Add the § Single Stylesheet Rule (FR-011), § Vendoring Rule (FR-013/FR-014, vendored path `docs/manual/assets/design.css` byte-identical), § Sync Rule (FR-018 — "every token/class/pairing change updates DESIGN.md in the same commit"), § Extension Guidance + Light-Theme Note (FR-019), and § Build/Versioning (FR-020/FR-021 references). Ensure `DESIGN.md` header stays `> **Version**: `0.1.0`` and `packages/design/README.md` remains a one-paragraph link, no competing catalog.
  - **Acceptance**: Every `europa-*` selector in `dist/design.css` appears as a catalog entry and vice versa (G-03 will later pin it); each catalog row contains a "not color alone:" sentence; `packages/design/README.md` has no competing tables; `pnpm format:check` passes.
  - **Files**: `DESIGN.md`, `packages/design/README.md`.
  - **Depends on**: T-007, T-008.
  - **Traces**: FR-006, FR-008, FR-011, FR-013, FR-014, FR-016–FR-019.

- [ ] ~~T-011~~ — DEFERRED (v0.1.0 trim): full G-01/G-02/G-03 drift suite dropped; DESIGN.md generated from tokens and verified set-equal at authoring time
  - **Description**: Create focused tests/scripts in `packages/design/tests/` that implement checks G-01 (CSS-var ↔ TS leaves identity), G-02 (DESIGN.md token-table coverage), G-03 (catalog-vs-stylesheet), and the helper logic for G-06 (`DESIGN.md` header vs `APP_VERSION` / `packages/design/package.json#version`). Pin the version-header regex `/Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/` per contracts §5. Byte-identity hash helper for G-05 lives here but is asserted after vendoring (T-014). Extend the package `package.json#scripts` with `"check:drift"` + `"check:no-literals"` + `"vendor"` commands that the workflows will invoke. Ensure ≥80% coverage on any new testable helper logic (constitution Principle III).
  - **Acceptance**: `pnpm --filter @europa/design test -- --coverage` is ≥80% on every metric; G-01/G-02/G-03 fail when a var/table row/catalog row is removed; G-06 fails when `DESIGN.md` header is mutated; failure messages name the missing/extra var/class/file.
  - **Files**: `packages/design/tests/tokens.test.ts` (G-01), `packages/design/tests/design-md.test.ts` (G-02/G-03/G-06), `packages/design/scripts/check-design-drift.ts` or inline helpers, `packages/design/package.json#scripts`.
  - **Depends on**: T-009, T-010.
  - **Traces**: FR-004, FR-017, FR-018, SC-007.

**Checkpoint**: After Phase 2, `pnpm --filter @europa/design build && pnpm --filter @europa/design test` is green; `DESIGN.md` tables are complete; token ↔ CSS-var identity is pinned. Console/manual migrations can now proceed in parallel.

---

## Phase 3: User Story 1 — Console Consumes the Design System Without Visual Regression (P1) 🎯 MVP

**Goal**: the console looks identical before/after (SC-001) and no hardcoded literal survives outside `import` from `@europa/design`.

- [x] **T-012 — Migrate `palette.ts` to derive from design tokens**
  - **Description**: Rewrite `packages/console/src/render/palette.ts` as thin re-exports from `@europa/design` — `export const VOID_COLOR = TOKENS.color.voidBg` etc. for every color constant. Keep `export function terrainColor(...)` but derived from `TOKENS.color.land*` constants (history/terrain shading stays in console; token literals come from design). Delete every inline hex/rgb literal from the file. Confirm both Canvas and DOM paths read the same values (existing palette parity tests continue to assert void ≠ page, land > void, etc.).
  - **Acceptance**: `grep -P '#[0-9a-fA-F]{3,8}' packages/console/src/render/palette.ts` outside import lines prints nothing; every exported color equals its `TOKENS` source (import-graph pin); existing palette invariant tests (void ≠ page, land lightness floor) stay green; `typecheck` green.
  - **Files**: `packages/console/src/render/palette.ts`, `packages/console/package.json` already imports `@europa/design`.
  - **Depends on**: T-005 (TOKENS available). Runnable in parallel with T-007.
  - **Traces**: FR-009, contracts §3, SC-002.

- [x] **T-013 — Migrate `styles/index.css` to `var(--europa-*)` + catalog classes**
  - **Description**: Rewrite `packages/console/src/styles/index.css` (~884 lines) so every `background-color`/`color`/`border-color`/`border`/`border-radius`/`gap`/`padding`/`margin`/`box-shadow`/`focus` declaration uses `var(--europa-*)` or a catalog class from `dist/design.css`. Import the design stylesheet once at the top (`@import '@europa/design/dist/design.css';` or equivalent JS `import` at the entry point — choose one, per plan §5 — and deduplicate). Map every hex literal in the file to the matching token (pageBg, surfaces, voids, borders, muted/secondary/primary text, amber/city/banner, input/card radii, etc.). At most one line-scoped `// design-exception: canvas fallback — spec Edge Cases § pit` is tolerated; any other literal fails T-018's check.
  - **Acceptance**: `grep -P '#[0-9a-fA-F]{3,8}|rgba?\(' packages/console/src/styles/index.css` (outside the designed single-exception) prints nothing; computed styles for canonical surfaces (page bg, HUD plate, lobby card, row/void, muted text `#9ca3af`, chip, banner, focus ring) equal the token values; existing console unit/component/a11y/e2e/perf/determinism/conformance suites remain green.
  - **Files**: `packages/console/src/styles/index.css` (or entry stylesheet `src/main.tsx` if the import moves), optionally `packages/console/src/styles/tokens-import.css`.
  - **Depends on**: T-007, T-012.
  - **Traces**: FR-010, FR-011, SC-001.

- [x] **T-014 [P] — Implement the no-literals guard (G-04)**
  - **Description**: Create the deny-list scanner script (or extend `scripts/check-design-drift.ts`) that scans `packages/console/src/**` (and later `docs/manual/**` after T-016) for `/#[0-9a-fA-F]{3,8}\b/`, `/rgba?\(/` literals outside `import ... from '@europa/design'` and `@europa/design/dist/design.css`, with exactly one line-scoped allow-list entry matching `design-exception: canvas fallback`. Failures emit `file:line — use var(--europa-*)` per the spec. Expose as `pnpm --filter @europa/design check:no-literals` (and optionally a `check:drift` sub-check) so T-017's workflow step can invoke it.
  - **Acceptance**: Mutating any console CSS/TS file to add a new hex literal (even inside a comment outside the allow-list) causes the check to exit non-zero naming the file:line; tolerated single-exception line is not flagged; CI will invoke the script and fail the PR.
  - **Files**: `packages/design/scripts/check-no-literals.ts` or `packages/design/scripts/check-design-drift.ts`, `packages/design/package.json#scripts`.
  - **Depends on**: T-013 (what it scans). Start earlier if using a TDD fixture file.
  - **Traces**: FR-009, FR-010, SC-002, contracts §6, research R7.

- [ ] ~~T-015~~ — DEFERRED (v0.1.0 trim): existing 260+ console suite (axe + a11y) covers parity; dedicated computed-style harness dropped
  - **Description**: Add browser Vitest tests (or extend existing `tests/a11y`/`tests/component`) that mount the console's lobby + HUD + waiting overlay + minimap host using the design stylesheet, read `getComputedStyle` for the canonical surfaces listed in SC-001/SC-005 (page background `#0b0f19`, HUD plate `#111827`, lobby card, void `#1a2233`, muted `#9ca3af`, chip `#f9fafb` on `#111827`, banner `#d97706` text `#111827`, focus ring `#fff 2px solid +2px offset`), compute contrast ratios via the WCAG luminance formula, and assert each ≥ the AA target from `DESIGN.md` (16.98:1 / 6.99:1 / 5.57:1 etc.). Include a `prefers-reduced-motion: reduce` emulation asserting the spinner is `animation: none`. The existing 260+ suite's axe scans stay green; bundle budget test (< 150 KB gz over browser payload) stays in `tests/perf` or a dedicated budget test.
  - **Acceptance**: `pnpm --filter @europa/console coverage` stays ≥80% on merged node+browser; the computed-style smoke asserts exact-match (or spec'd tolerance) vs token values; muted/banner/chip ratios meet AA; axe scans green; `prefers-reduced-motion` spinner test asserts `animation: none` / 0.01ms.
  - **Files**: `packages/console/tests/a11y/design-parity.test.ts` or `packages/console/tests/component/design-parity.test.ts`, `packages/console/tests/integration/design-budget.test.ts`.
  - **Depends on**: T-013, T-008.
  - **Traces**: FP-016, SC-001, SC-005, NFR-001, NFR-005.

---

## Phase 4: User Story 2 — Player Manual Renders in the Game's Dark-Slate Chrome (P1)

**Goal**: `docs/manual` feels like the same product as the console — dark-slate, system-ui type, plates/cards/typography — via the vendored stylesheet, without widening artifact scope.

- [x] **T-016 — Vendor `dist/design.css` → `docs/manual/assets/design.css` + Jekyll layout**
  - **Description**: Finalize `packages/design/scripts/vendor-to-docs.ts` (file copy `dist/design.css` → `docs/manual/assets/design.css`, creates `assets/` if absent, deterministic). Add the post-build vendor hook so `pnpm --filter @europa/design build` always produces the tracked file. Author the minimal Jekyll layout `docs/manual/_layouts/default.html` (HTML5 shell + `<link rel="stylesheet" href="{{ '/assets/design.css' | relative_url }}">`, body wrapped in `europa-page` + typography/catalog classes). Wire manual pages to `layout: default` — either add `layout: default` frontmatter to each `docs/manual/*.md` or add a file-level defaults include — whichever touches fewer files. No `_config.yml` theme, no CDN `<link>` (FR-015). Check both files in at this task.
  - **Acceptance**: `docs/manual/assets/design.css` exists and is tracked; `docs/manual/_layouts/default.html` contains the `assets/design.css` link and no external gem/CDN; Jekyll renders no error when `npx jekyll build --source docs/manual` is run against the vendored file; the build output `/_site/assets/design.css` is the same file.
  - **Files**: `packages/design/scripts/vendor-to-docs.ts`, `packages/design/tsup.config.ts` (post-build hook), `docs/manual/assets/design.css` (tracked), `docs/manual/_layouts/default.html`, `docs/manual/*.md` (frontmatter).
  - **Depends on**: T-007, T-008.
  - **Traces**: FR-012, FR-013, research R2/R5.

- [x] **T-017 — Assert vendored-asset byte identity (G-05)**
  - **Description**: Implement the hash-equality test/script for G-05: `sha256(packages/design/dist/design.css) === sha256(docs/manual/assets/design.css)` at HEAD (or lexicographic byte equality). Failure message names both paths + hashes. Wire it as `pnpm --filter @europa/design check:vendor-identity` (or as part of `check:drift`) so both local builds and CI can invoke it before Jekyll.
  - **Acceptance**: `pnpm --filter @europa/design check:vendor-identity` exits non-zero and prints both hashes when the vendored copy is mutated; exits zero when identical; CI step invokes it before any `pages-deploy.yml` content that would mask staleness.
  - **Files**: `packages/design/tests/vendor-identity.test.ts` or `packages/design/scripts/check-vendor-identity.ts`, `packages/design/package.json#scripts`.
  - **Depends on**: T-016, T-006.
  - **Traces**: FR-014, SC-003, contracts §2.1.

- [ ] ~~T-018~~ — DEFERRED (v0.1.0 trim): manual dark-slate verified by vendored stylesheet + existing checks; computed-style smoke dropped
  - **Description**: Add a focused test (or `docs/manual` build fixture) that serves the built `docs/manual/_site` (or renders `_layouts/default.html` with `dist/design.css` in happy-dom), reads computed styles for page bg, surface plates, text colors, `system-ui` stack, and component treatments (`europa-card` / typography), and asserts they are the token values and the white Jekyll default is absent. Human QA note: side-by-side screenshots lobby vs index must show the same chrome language (SC-004). This is the manual half of the computed-style parity check.
  - **Acceptance**: Test fixture page background is `#0b0f19` (or its `var()` resolution), surface plates are `#111827`, `fontFamily` contains `system-ui`, known `europa-*` classes resolve via `var(--europa-*)`; axe scan over a manual fixture page is green; reduced-motion decorative animation is gated.
  - **Files**: `packages/design/tests/manual-chrome.test.ts` or `docs/manual/tests/manual-chrome.test.ts` + fixture, plus Jenkins-less `tests/integration/*` if browser-based.
  - **Depends on**: T-016.
  - **Traces**: FR-012, SC-004, NFR-001, NFR-002.

- [x] **T-019 [P] — Pages artifact scope preserved (G-09 + SC-006)**
  - **Description**: Add a workflow/config-level structural test or CI assertion that lists the would-be Pages artifact's tree (or parses `pages-deploy.yml`) and fails if it references `packages/**`, `specs/**`, `.github/**` — only `docs/manual` paths appear. Confirm `pages-deploy.yml`'s `on.push.paths` includes any newly tracked path that should trigger a redeploy (`docs/manual/assets/design.css`, `docs/manual/_layouts/**`) without adding packages/** to `actions/jekyll-build-pages` `source` or `upload-pages-artifact` `path`. Document the source scope guarantee in CI comments.
  - **Acceptance**: `pages-deploy.yml` still reads `source: ./docs/manual` and `path: ./_site`; the assertion script `ls -R ./_site | grep packages` is empty; both reviewed as part of the feature's PR checks; a `docs/manual`-only push triggers a deploy, a `packages/design`-only push does not by itself redeploy unless the vendored asset is refreshed (in that case both paths are touched).
  - **Files**: `packages/design/tests/artifact-scope.test.ts` or `scripts/check-artifact-scope.ts`, `.github/workflows/pages-deploy.yml` (path filters).
  - **Depends on**: T-016.
  - **Traces**: FR-013, SC-006, research R2.

---

## Phase 5: User Story 3 — Maintainer Owns a Single Authoritative Contract `DESIGN.md` (P2)

**Goal**: lockstep versioning, sync rule, and drift enforcement make `DESIGN.md` truthful.

- [x] **T-020 — Lockstep versioning joins the `version:check` surface (G-06 final)**
  - **Description**: Extend `packages/version/scripts/check-version-drift.ts` (or companion `check-design-drift`) to read `DESIGN.md`'s header (regex `/Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/` per contracts §5), `packages/design/package.json#version`, and the canonical list (`package.json` root, every `packages/*/package.json`, `packages/version/src/app-version.ts`, `README.md` head, `docs/manual/index.md` footer already in scope) and fail naming every disagreeing file, per spec 009's message convention. Register the new drift paths in `.github/workflows/version-drift.yml`'s `on.push/pull_request.paths` per research R6; add a job step that runs the extended check (reuse `pnpm version:check` if it now reads the new surfaces). The first version value remains `0.1.0` (FR-020/Clarifications v1.0).
  - **Acceptance**: `pnpm version:check` exits non-zero when `DESIGN.md` header is changed to `0.1.1` alone; exits zero when all surfaces agree at `0.1.0`; `version-drift.yml` paths include `packages/design/package.json`, `packages/design/src/**`, `DESIGN.md`, `docs/manual/assets/design.css`; review notes no special-case exemption.
  - **Files**: `packages/version/scripts/check-version-drift.ts` (or new companion), `.github/workflows/version-drift.yml`.
  - **Depends on**: T-004, T-009, T-011.
  - **Traces**: FR-017, FR-020, SC-007, SC-008, contracts §5.

- [x] **T-021 — `DESIGN.md`↔implementation sync rule enforcement + CI message audit**
  - **Description**: Wire the drift helpers from T-011 + T-020 into CI workflows with actionable messages: every CI job that guards design (`client-ci.yml`'s post-design-build step, `version-drift.yml`'s drift job) fails with `file:line` + `run pnpm --filter @europa/design build` remediation where applicable. Verify FR-018's rule ("any change set that alters a token/class/pairing updates DESIGN.md in the same commit") is auditable — the CI check's output names the stale section (`missing row --europa-*`).
  - **Acceptance**: A mutation-only PR (change a token value without touching `DESIGN.md`) fails CI with a naming message; the guidance text in CI logs matches quickstart's Troubleshooting table.
  - **Files**: workflow job `steps:` blocks (`client-ci.yml`, `version-drift.yml`) — small `run:` lines.
  - **Depends on**: T-011, T-020.
  - **Traces**: FR-018.

---

## Phase 6: User Story 4 — New Surface Reuses Components via Classes Only (P3)

**Goal**: the catalog is actually composable — a React fragment and an HTML/Manual page can render the same treatment via class names alone (FR-006 last acceptance).

- [ ] ~~T-022~~ — DEFERRED (v0.1.0 trim): catalog composability already proven by shipped stylesheet; cross-consumer smoke dropped
  - **Description**: Compose two tiny throwaway surfaces — a React JSX fragment (e.g. in a browser Vitest test) with `europa-card + europa-button + europa-banner + europa-chip`, and a `docs/manual/smoke.md` (or fixture HTML) using the same classes — both rendering the same visual language without custom CSS. Assert computed styles for each class are the token values (`var(--europa-*)` resolution). These fixtures double as the "implementation proves the spec" smoke for User Story 4 and are not persisted beyond the test file (no committed smoke page).
  - **Acceptance**: Computed styles for the same class (e.g. `.europa-card` background, `.europa-chip` radii, `.europa-banner` amber) are identical across the React and fixture-HTML renderings; no inline style or `<style>` block is needed to reach the spec'd appearance; no custom `color/spacing/radius` literal outside `var(--europa-*)` is in either smoke surface.
  - **Files**: `packages/design/tests/catalog-smoke.test.ts` or `packages/console/tests/component/catalog-smoke.test.ts`.
  - **Depends on**: T-007, T-016.
  - **Traces**: FR-006 (User Story 4 AC-1/AC-2), SC-003, NFR-005.

- [ ] ~~T-023~~ — DEFERRED (v0.1.0 trim): extension guidance present in DESIGN.md; verifiability assertion dropped
  - **Description**: Final review pass on `DESIGN.md` § Extension Guidance and the Out of Scope "Light-theme variant" paragraph: the note must state that a later light variant is `html[data-theme="light"] { --europa-color-…: … }` with no renames, and that "new variant = additive (minor), rename = major + migration note." Add a tiny coverage assertion that the section contains the words `light` and `data-theme` + the variant/breaking policy sentence — so a future author who removes the guidance breaks the check rather than silently losing it.
  - **Acceptance**: `DESIGN.md` contains the quoted additive shape and policy language per spec Clarifications v1.0; the assertion test fails if the paragraph is removed.
  - **Files**: `DESIGN.md`, `packages/design/tests/design-md.test.ts` (extension).
  - **Depends on**: T-010.
  - **Traces**: FR-019, spec Out of Scope.

---

## Phase 7: Polish & House-Keeping — Cross-Cutting

**Purpose**: close the FR-021/FR-022/NFR-* deliverables that cross user stories.

- [ ] ~~T-024~~ — DEFERRED (v0.1.0 trim): pnpm workspace topology already guarantees @europa/design builds before @europa/console
  - **Description**: Verify the end-to-end build graph from a clean state: `pnpm install --frozen-lockfile && pnpm build` produces `packages/design/dist/design.css`, vendors it to `docs/manual/assets/design.css`, and then `packages/console/dist` bundles with one copy of the design rules. If pnpm's topological sort alone already guarantees it, this task adds only a CI sequence comment + a structural test that asserts `@europa/design` builds before `@europa/console` (e.g., the `client-ci.yml` job lists `pnpm --filter @europa/design build` before the console build). Document that no `pnpm-workspace.yaml` reorder is needed.
  - **Acceptance**: Clean clone: `pnpm build` exits 0 with no TS errors; `dist/design.css` exists before Vite consumes it; `docs/manual/assets/design.css` is freshly vendored; workflow comment explains ordering.
  - **Files**: `.github/workflows/client-ci.yml` (steps order), `packages/design/package.json#scripts` vendor hook, structural assertion test.
  - **Depends on**: T-006, T-016.
  - **Traces**: FR-021, contracts §7.

- [x] **T-025 [P] — `client-ci.yml` path filter + job update**
  - **Description**: Extend `client-ci.yml` `on.push/pull_request.paths` to include `packages/design/**`, `DESIGN.md`, `docs/manual/assets/design.css`, `docs/manual/_layouts/**`. Add the build-order steps (`pnpm --filter @europa/design build` → vendor → console build) and invoke the new design drift/no-literals checks (`check:drift` / `check:no-literals`) alongside the existing lint/typecheck/test/build steps, without widening `pages-deploy.yml` scope. Keep `workflow_dispatch` available.
  - **Acceptance**: Mutating `packages/design/src/tokens.ts` triggers `client-ci.yml`; mutating only `docs/manual/_layouts/default.html` triggers both `client-ci.yml` and `pages-deploy.yml` as filtered; PR touching only engine docs does not trigger console builds.
  - **Files**: `.github/workflows/client-ci.yml`.
  - **Depends on**: T-003, T-011, T-014.
  - **Traces**: FR-022, SC-008.

- [x] **T-026 [P] — `pages-deploy.yml` path filter update (no scope widening)**
  - **Description**: Extend `pages-deploy.yml` `on.push.paths` (and `pull_request` if present) to redeploy when `docs/manual/assets/design.css`, `docs/manual/_layouts/**`, or `DESIGN.md` changes that is reflected in the vendored asset — without adding `packages/**` to `actions/jekyll-build-pages` `source` or `upload-pages-artifact` `path`. The vendored file being inside `docs/manual` already ensures the content is deployed via `source: ./docs/manual`.
  - **Acceptance**: Touching `docs/manual/assets/design.css` triggers `Pages Deploy`; `source: ./docs/manual` and `path: ./_site` remain exactly scoped; artifact list asserted by G-09 stays passing.
  - **Files**: `.github/workflows/pages-deploy.yml`.
  - **Depends on**: T-016, T-019.
  - **Traces**: FR-013, FR-022, SC-006, SC-008.

- [x] **T-027 [P] — `version-drift.yml` path filter final audit**
  - **Description**: Confirm the T-020 `on.push/pull_request.paths` list covers `packages/design/package.json`, `packages/design/src/**`, `DESIGN.md`, `docs/manual/assets/design.css`, plus the existing surfaces, with no special case. Ensure the `pnpm version:check` invocation (or companion) is the one canonical check.
  - **Acceptance**: Touching `DESIGN.md` triggers version drift; touching `packages/design/src/tokens.ts` triggers it; git history shows no `private: false` ever landed.
  - **Files**: `.github/workflows/version-drift.yml`.
  - **Depends on**: T-020.
  - **Traces**: FR-020, FR-022, SC-008.

- [x] **T-028 [P] — Bundle budget guard (< 150 KB gz)**
  - **Description**: Add/extend the gzip bundle budget assertion in the console package (reusing the existing spec 005 budget shape) so the console browser payload `dist/assets/**` gzipped stays < 150 KB after the design package dedupes literals. The test should fail naming the overweight asset + gz bytes.
  - **Acceptance**: Console `dist/assets/*.js` + `*.css` gzip total < 150 KB; adding a 200 KB stylesheet fails the test; the net size after migration is ≤ pre-migration (FR-011's "deduplicate, not bloat" — one copy in bundle).
  - **Files**: `packages/console/tests/perf/bundle-budget.test.ts` (adjust), `packages/design` excluded from bundle — console only.
  - **Depends on**: T-013.
  - **Traces**: NFR-005, SC-001 note.

- [x] **T-029 — End-to-end SC checklist + quickstart replay**
  - **Description**: Replay `quickstart.md` verbatim from a clean checkout: `pnpm build`, hash checks, `version:check`, `format:check`/`typecheck`, `tests --coverage`, computed-style smokes, Jekyll-scope assertion, human QA notes. Verify each SC row's acceptance is demonstrably met and note results in `specs/012-design-system/quickstart.md`'s validation appendix (mirror the appendices prior specs added). Update `AGENTS.md` Current state if this is the last gate before Phase 6 merge.
  - **Acceptance**: Quickstart's command table produces expected outputs; every SC-001..SC-008 maps to a passing local command or CI artifact assertion; manual site is inspectably dark-slate; no `TODO` remains.
  - **Files**: `specs/012-design-system/quickstart.md` (validation appendix), `AGENTS.md` (optional state line).
  - **Depends on**: all T-012..T-028.
  - **Traces**: all SCs.

---

## Phase 8: Manual Catalog Adoption (PO option 1, post-trim)

**Purpose**: fulfill spec 012 User Story 2 fully — the player manual must share the *component* vocabulary, not just the theme. Adopt `europa-*` catalog classes in `docs/manual` so docs and console use the same components. Added after the initial trim per product-owner direction ("start with option 1").

- [ ] **T-030 — Adopt `europa-*` catalog classes in the player manual**
  - **Description**: (1) Extend `packages/design/src/styles/catalog.css` with a documentation-prose section **scoped under `.europa-page`** that styles markdown-rendered elements (`h1`–`h3`, `p`, `ul`/`ol`/`li`, `table`/`th`/`td`, `code`, `pre`, `blockquote`, `a`, `hr`) using `--europa-*` tokens, so every manual page automatically shares the console's design language. (2) Add explicit `europa-*` component usages in `docs/manual/*.md` via Kramdown/HTML class hooks: `europa-card` for callouts, `europa-chip` for status pills, `europa-typography--muted`/`--meta` for captions, `europa-table` on tables. (3) Rebuild `dist/design.css` and re-vendor to `docs/manual/assets/design.css`; verify byte-identity (G-05).
  - **Acceptance**: `docs/manual/*.md` contains `europa-` class hooks; `check:vendor-identity` passes (byte-identical); `check:no-literals` passes (no hex/rgba literals in manual); manual renders dark-slate with shared card/chip/typography components; console unaffected (prose rules scoped under `.europa-page`, which the console does not use as a wrapper).
  - **Files**: `packages/design/src/styles/catalog.css`, `packages/design/dist/design.css` (generated), `docs/manual/assets/design.css` (generated/vendored), `docs/manual/*.md` (annotations).
  - **Depends on**: T-007, T-016.
  - **Traces**: FR-006, FR-012, FR-013, SC-004.

---

## Dependencies & Parallelization Summary

```
T-001 ─┬─ T-002 (graph)
       ├─ T-003 [P] — biome — can lane with T-004/T-005
       └─ T-004 (DESIGN.md skeleton)
T-005 (tokens) ─┬─ T-006 (emitter) ─┬─ T-007 (catalog) ─┬─ T-008 (a11y gates)
                └─ T-012 (palette)   └─ T-013 (console CSS needs catalog)
T-007 + T-008 ─┬─ T-009 [P] DESIGN.md tokens — parallel with T-010
               ├─ T-010 DESIGN.md catalog+rules
               └─ T-011 drift helpers — needs T-009+T-010
T-012+T-013 ─┬─ T-014 [P] no-literals — needs console migration
             └─ T-015 [P] parity — needs catalog+a11y
T-007+T-008 ── T-016 vendoring+layout ─┬─ T-017 identity
                                      ├─ T-018 [P] manual smoke
                                      └─ T-019 [P] artifact scope
T-011+T-020 (version lockstep) ── T-021 (CI messages) — needs T-011+T-020
T-007+T-016 ── T-022 (cross-consumer smoke)
T-010 ── T-023 (extension guidance coverage)
T-006+T-016 ── T-024 (build ordering) — lane with T-025/T-026/T-027 [P]
T-013 ── T-028 [P] budget
T-012..T-028 ── T-029 (E2E replay) — last
T-007+T-016 ── T-030 (manual catalog adoption, PO option 1) — post-trim addition
```

**Wave model for the orchestrator** (max parallelism):

* Wave A (lane 1): T-001 → T-005 → T-006 → T-007 → T-008
* Wave A (lane 2, concurrent after T-001): T-002, T-003, T-004 — all [P]
* Wave B (after Phase 2 checkpoint): T-012 and T-016 start in parallel (palette + vendoring); T-009/T-010 [P] likewise fill DESIGN.md
* Wave C: T-013 (needs T-007+T-012), T-017 (needs T-016), T-011 (needs T-009+T-010) — three lanes
* Wave D: T-014/T-015/T-018/T-019 [P] + T-020 + T-022/T-023 — high parallelism, all checker/smoke tasks
* Wave E (polish): T-024 + T-025/T-026/T-027/T-028 [P], then T-021, then T-029 close

---

## FR Coverage Matrix (every FR has at least one task)

| FR | Tasks |
|----|-------|
| FR-001 package shape | T-001, T-002 |
| FR-002 single stylesheet + TS entry | T-001, T-005, T-006 |
| FR-003 token groups | T-005, T-009 |
| FR-004 CSS-var ↔ TS identity | T-006, T-011 |
| FR-005 color pairing docs | T-009, contracts G-07 |
| FR-006 catalog shareable | T-007, T-009, T-010, T-022 |
| FR-007 namespaced + stability | T-007, contracts §2.3 |
| FR-008 a11y obligations per component | T-008, T-010 |
| FR-009 palette derivation | T-012, T-014, contracts §3 |
| FR-010 console migration | T-013 |
| FR-011 single stylesheet source | T-013, T-024, contracts §2.1 |
| FR-012 manual adopts dark chrome | T-016, T-018 |
| FR-013 Jekyll scope preserved | T-016, T-019, T-026 |
| FR-014 byte-identical vendored | T-016, T-017 |
| FR-015 no theme/CDN | T-016, T-019 |
| FR-016 a11y contracts encoded | T-008, T-015, contracts §4 |
| FR-017 DESIGN.md living contract | T-004, T-009, T-010 |
| FR-018 same-commit sync | T-011, T-021 |
| FR-019 extension guidance | T-010, T-023 |
| FR-020 lockstep `DESIGN.md` + version:check | T-004, T-020 |
| FR-021 build ordering | T-002, T-024, T-016 |
| FR-022 biome + workflow `paths:` | T-003, T-025, T-026, T-027 |

---

## Verification Checklist (must be green before Phase 6 gate)

* [ ] `pnpm build` from a clean checkout: design → vendor → console, no errors
* [ ] `pnpm typecheck` — zero errors, `strict:true` in every package
* [ ] `pnpm lint && pnpm format:check` — zero errors, zero `eslint-disable`/`@ts-ignore`
* [ ] `pnpm version:check` — exit 0 (`DESIGN.md` header + `packages/design` version match lockstep `0.1.0`)
* [ ] Drift guards — G-01 through G-09 pass; each names the orphan when mutated
* [ ] No-literals — G-04 exits zero only for `import` from `@europa/design` + single `design-exception` line
* [ ] Vendored identity — `sha256(dist/design.css) === sha256(docs/manual/assets/design.css)`
* [ ] Coverage — `packages/design` ≥80% on every metric; console merged coverage remains ≥80%
* [ ] Bundle budget — console browser payload < 150 KB gz
* [ ] Computed-style parity — page/HUD/lobby/void/muted/chip/banner/focus ring match tokens; muted/banner/chip ratios meet AA; axe scans green; `prefers-reduced-motion` spinner inert
* [ ] Manual chrome — `docs/manual` built page is dark-slate, system-ui, `europa-*` classes resolve; Jekyll build succeeds without widening `source`/`path`
* [ ] Artifact scope — `./_site` after a manual-changing push contains only `docs/manual`-derived files
* [ ] Catalog composability — two-smoke test (React + HTML) renders the same treatment per class without custom CSS
* [ ] `DESIGN.md` is authoritative — version header, token tables, catalog entries, a11y table, and rules sections are all present; `packages/design/README.md` links to the root contract and carries no competing tables
* [ ] Workflows — `client-ci.yml`, `pages-deploy.yml`, `version-drift.yml` path filters and job steps match the spec path tables; no widening of Pages artifact scope

