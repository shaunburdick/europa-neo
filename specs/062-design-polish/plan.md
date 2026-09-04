# Implementation Plan: Design Polish

**Branch**: `issue-62-design-polish` (spec-kit feature `062-design-polish`) | **Date**: 2026-09-03 | **Spec**: [`specs/062-design-polish/spec.md`](./spec.md)

**Input**: Feature specification from `/specs/062-design-polish/spec.md` (GitHub issue #62) — 48 FRs (incl. FR-040a), 7 NFRs, 48+ ACs, 6 user stories, Clarifications v1.1 (15 product-owner rulings, zero open questions).

---

## Summary

Deliver the visual-polish layer on top of the existing `@europa/design` design system and `@europa/console` frontend. The feature spans seven phases: (1) foundation tokens (shadow, motion, color, typography, focus-ring additions + `tokens.json` generation), (2) console CSS polish (card elevation, hover lift, button transitions, toast/modal animations, error-boundary/route-notice refinement), (3) new catalog components (`.europa-link`, `.europa-divider`, `.europa-tooltip`, `.europa-badge` status variants, `.europa-empty-state`, typography utility classes, footer + layout utilities), (4) responsive breakpoints (lobby grid, match view, HUD, modal), (5) page-specific layouts (hero lockup, identity-card accent, match-list hierarchy, form polish, board depth, HUD hierarchy, order-bar mode, reserves, feedback positioning, waiting blur, surrender danger), (6) a standalone design-system preview page, and (7) documentation & DX (DESIGN.md token/catalog/a11y updates, CSS comments, machine-readable contrast notes). All work is CSS/token/TSX in `@europa/design` and `@europa/console` — zero backend changes.

---

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) / Node 22 / pnpm 11.22 workspaces — same as every sibling package. React 19.2.0 (console) for the preview page and any TSX changes.

**Primary Dependencies**: **Zero new runtime dependencies** (NFR-006). All work composes existing `@europa/design` tokens and the `europa-*` class catalog. Tooling additions (devDependencies, catalog versions, permissive licenses):
- `tsx` (catalog) — already present; used by `build-css.ts` and the new `--emit-json` mode.
- `vitest` + `@vitest/coverage-v8` (catalog) — already present; used for token/emitter tests.
- `@vitest/browser` + `@vitest/browser-playwright` (catalog) — already present; used for preview-page browser tests.
- Existing `tsup`, `typescript`, `biome` catalog versions.

**Storage**: N/A — no persistence. Token values are deterministic constants in `packages/design/src/tokens.ts`; `dist/design.css`, `dist/tokens.json`, and `dist/contrast-notes.json` are build artifacts (gitignored).

**Testing**: Vitest 4.1 + `@vitest/coverage-v8` (≥80% on every metric for new testable logic, constitution Principle III). Split:
- `packages/design` — token-table tests (new tokens present, values correct), emitter tests (`--emit-json` output shape, byte-identical determinism), contrast-notes generation tests.
- `packages/console` — existing suites (unit, component, a11y, e2e) verify the CSS polish is visually invisible (no regressions) and the new responsive breakpoints behave correctly at 480/768/1200px.
- Preview page — browser tests (Playwright) verifying all sections render and use only `europa-*` tokens.

**Target Platform**: Browser (Vite 8 + React 19 console) and Jekyll static site (manual). Both run on Ubuntu `ubuntu-latest` in CI.

**Project Type**: Monorepo private package enhancement + cross-cutting console CSS/TSX polish.

**Performance Goals**: Spec NFR-001 — all new transitions complete within their durations (fast ≤ 80ms, default ≤ 120ms, slow ≤ 200ms, spring ≤ 300ms). No JS animation loops. `backdrop-filter` is GPU-composited. NFR-002 — new CSS ≤ 5 KB uncompressed combined; console browser-payload gzip < 150 KB preserved.

**Constraints**:
- `private: true` everywhere, never published (AGENTS.md binding decision 6).
- All new additions are **CSS-only classes** — no new `customElements.define` registrations (spec Out of Scope).
- No hex/rgb literals outside `packages/design/src/tokens.ts` (FR-009/FR-010, G-04).
- `prefers-reduced-motion: reduce` suppresses all new animations (existing catalog guard).
- Determinism: token values are constant; `build-css.ts` remains byte-identical for the same token table.
- No backend changes, no WebSocket protocol changes, no engine changes (NFR-006).
- No inline lint suppressions; `strict: true`; no `any` (constitution I).
- DESIGN.md must be updated in the same change set (constitution IV, FR-043/044/045).

**Scale/Scope**: One package (`@europa/design`) gains ~20 new tokens + 3 emitter modes + ~15 new catalog classes + preview page; one package (`@europa/console`) gains ~15 CSS polish rules + ~5 TSX changes + responsive breakpoints. No new infrastructure.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | This Feature's Compliance | Risk |
|-----------|---------------------------|------|
| **I. Type Safety First** | All TS changes are strict. The `--emit-json` emitter and contrast-notes generator are typed. No `any`, no lint suppressions. | None |
| **II. Server-Authoritative Deterministic Simulation** | No tick logic, no randomness, no wall clock. Token values are deterministic constants; the emitter is byte-identical. | None |
| **III. Tested Game Logic (≥80%)** | Token/emitter tests in `@europa/design`; console suites verify no visual regression; preview-page browser tests. | Low — CSS-only changes have limited testable logic; the emitter and contrast-notes generator carry the coverage surface. |
| **IV. Specs as Documentation** | DESIGN.md updated in the same change set (FR-043/044/045). CSS comments added for void-bg vs page-bg (FR-046). | None |
| **V. Simplicity Over Cleverness** | All additions are simple CSS rules and token constants. No new abstractions, no framework. The preview page is a static HTML file. | None |
| **VI. Accessibility-Minded UI (WCAG 2.2 AA)** | All new interactive states meet AA. Hover states are never the sole identifier. `prefers-reduced-motion` honored. Focus rings visible. | Low — contrast ratios must be re-verified for new pairings (badge variants, text-link). |
| **VII. Self-Hostable by Default** | Zero new runtime deps, no CDN, no external services. Preview page is a static file. | None |
| **Additional: Open-source licensing** | Zero new runtime deps → trivially MIT-compatible. Tooling is permissive. | None |
| **Additional: No vendor lock-in** | No SaaS, no proprietary API. | None |

**Re-check after design**: no new risks introduced by the emitter modes or the preview page.

---

## Project Structure

### Documentation (this feature)

```text
specs/062-design-polish/
├── plan.md              # This file
├── research.md          # Phase 0 — choices investigated
├── data-model.md        # Phase 1 — token data model / CSS custom property map
├── contracts/           # (empty — no API contracts affected; CSS-only feature)
└── tasks.md             # Phase 2 — ordered tasks (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/design/
├── package.json                     # + check:contrast-notes script, + preview dev script
├── src/
│   ├── tokens.ts                    # + ~20 new tokens (shadows, motion, color, typography, focusRing)
│   ├── styles/catalog.css           # + link, divider, tooltip, badge variants, empty-state,
│   │                                #   typography utilities, footer, layout utilities
│   └── styles/catalog-styles.ts     # regenerated (gitignored)
├── scripts/
│   ├── build-css.ts                 # + --emit-json mode (dist/tokens.json)
│   ├── generate-contrast-notes.ts   # NEW — dist/contrast-notes.json
│   └── check-contrast-notes.ts      # NEW — drift guard (G-11)
├── preview/
│   ├── index.html                   # NEW — standalone design-system preview page
│   └── main.ts                      # NEW — preview page logic (token tables, swatches)
├── tests/
│   ├── tokens.test.ts               # + new-token assertions
│   ├── build-css.test.ts            # + --emit-json assertions
│   └── contrast-notes.test.ts       # NEW — contrast-notes generation + drift
└── dist/                            # build artifacts (gitignored)
    ├── design.css                   # regenerated
    ├── tokens.json                  # NEW (gitignored)
    └── contrast-notes.json          # NEW (gitignored)

packages/console/
├── src/
│   ├── styles/index.css             # + ~15 polish rules + responsive breakpoints
│   └── ui/                          # + ~5 TSX changes (hero, identity accent, empty-state,
│                                    #   error-boundary icon/details, route-notice icon)
└── tests/                           # existing suites verify no regression

DESIGN.md                            # § 1 token tables, § 2 catalog (split tables + snippets),
                                     # § 3 a11y pairings, § 4 line-height documentation
```

**Structure Decision**: All new tokens live in the existing `packages/design/src/tokens.ts` (single source of truth). All new catalog classes live in `packages/design/src/styles/catalog.css` (deterministic emitter concatenation). Console polish lives in `packages/console/src/styles/index.css`. The preview page is a static HTML file under `packages/design/preview/` served via the existing Vite dev server. This matches the repo's established structure — no new directories or packages.

---

## Architecture Decisions

### D-1: Token strategy — additive, semantic aliases

All new tokens are **additive** (no existing token values change except the three shadow tokens `board`/`modal`/`plate` that go from `none` to real values, per FR-001). New color tokens (`textLink`, `accentActive`, `divider`, `cardHoverBorder`) reuse existing hex values with semantic names — zero new hex literals beyond the token table. New typography tokens (`heading`, `subheading`, `trackingTight/Normal/Wide`) are aliases of existing size tokens. New focus-ring tokens (`darkColor`, `lightColor`) provide theme-aware names without changing the existing `color` token.

**Rationale**: The spec 012 design (named tokens that were `none` were always intended to receive values later) means the shadow-token change is expected, not breaking. Semantic aliases keep the token table DRY and avoid literal duplication.

### D-2: CSS approach — catalog classes + console-local rules

New **catalog** classes (`.europa-link`, `.europa-divider`, `.europa-tooltip`, `.europa-badge--*`, `.europa-empty-state`, typography utilities, footer, layout utilities) live in `packages/design/src/styles/catalog.css` and are emitted into `dist/design.css` by the existing deterministic emitter. Console-specific polish (`.europa-lobby__*`, `.europa-hud__*`, `.europa-feedback__*`, etc.) lives in `packages/console/src/styles/index.css` because those selectors are console-local (not shared catalog surface).

**Rationale**: The catalog is the shared design language; console-specific selectors belong in the console. This matches the existing split (catalog.css holds shared classes; index.css holds console chrome).

### D-3: Component patterns — CSS-only, no new web components

All new additions are **CSS-only classes** applied to standard HTML elements (`.europa-link` on `<a>`, `.europa-divider` on `<hr>`, `.europa-tooltip` on `<span data-tooltip>`, etc.). No new `customElements.define` registrations (spec Out of Scope). The tooltip uses the `data-tooltip` attribute + `::after`/`::before` pseudo-elements — no JavaScript.

**Rationale**: The spec explicitly scopes this feature to CSS-only. Web components are additive and belong in a follow-up (spec 014 already covers the component layer).

### D-4: Build pipeline changes — `--emit-json` + contrast-notes generator

`build-css.ts` gains a `--emit-json` mode that writes `dist/tokens.json` (one entry per CSS variable with `name`, `value`, `group`). A new `generate-contrast-notes.ts` script computes WCAG contrast ratios from the token table and writes `dist/contrast-notes.json` (machine-readable pairings for drift tests). A new `check-contrast-notes.ts` guard (G-11) asserts the documented ratios in DESIGN.md § 3 match the computed values.

**Rationale**: `tokens.json` is consumed by the preview page and documentation generators. The contrast-notes file makes the a11y contract machine-auditable (G9 ruling).

### D-5: Preview page — static HTML + Vite dev server

The preview page is a static HTML file (`packages/design/preview/index.html`) + a small `main.ts` that builds token tables and swatches from `TOKENS`. It's served via the existing Vite dev server (`pnpm --filter @europa/design dev`). It imports `../src/styles/catalog.css` directly (dev) and uses only `europa-*` token variables — no hex literals in its own CSS.

**Rationale**: The preview page is documentation, not a production route. Serving it via the design package's dev server keeps it self-contained and avoids adding a console route. The page uses the same `TOKENS` source as the rest of the design system, so it always reflects current values.

### D-6: Responsive breakpoints — mobile-first with explicit desktop

Breakpoints follow the spec: `max-width: 768px` (single-column lobby grid, stacked match view), `min-width: 769px` (two-column grid), `min-width: 1200px` (horizontal HUD), `max-width: 480px` (modal fills viewport). These match the spec's US3 independent test (480/768/1200px).

**Rationale**: The spec's breakpoints are explicit and match the existing `auto-fit` grid behavior. No new breakpoint variables are needed — the media queries are inline in the CSS.

### D-7: Motion tokens — `cubic-bezier(0.16, 1, 0.3, 1)` easing

The `easingOut` token uses the refined `cubic-bezier(0.16, 1, 0.3, 1)` value (D3 ruling), not plain `ease-out`. This is the "ease-out-expo" curve — a smooth, organic deceleration that feels more polished than the default `ease-out`. The `easingInOut` token remains `ease-in-out`.

**Rationale**: The PO explicitly ruled the refined curve. It's a single token value change with no structural impact.

### D-8: Toast direction + position — LEFT per PO ruling

The feedback toast slides in from `translateX(-8px)` (D1) and is anchored bottom-left (D2). This differs from the original spec draft (right) — the PO ruled left. The keyframes and positioning reflect this.

**Rationale**: PO ruling. The left position keeps toasts clear of the HUD (which sits right of the board on wide screens).

---

## Phase Breakdown

### Phase 1 — Foundation Tokens (FR-001..006)

Add ~20 new tokens to `packages/design/src/tokens.ts`:
- **shadows**: `cardHover`, `cardActive`, `hud` (new); `board`, `modal`, `plate` (updated from `none`)
- **motion**: `duration`, `transitionFast`, `transitionDefault`, `transitionSlow`, `transitionSpring`, `easingOut`, `easingInOut`
- **color**: `textLink`, `accentActive`, `divider`, `cardHoverBorder`
- **typography**: `heading`, `subheading`, `trackingTight`, `trackingNormal`, `trackingWide`
- **focusRing**: `darkColor`, `lightColor`

Add `--emit-json` mode to `build-css.ts` (writes `dist/tokens.json`). Add `generate-contrast-notes.ts` + `check-contrast-notes.ts` (G-11 guard).

**Verification**: `pnpm --filter @europa/design build` produces byte-identical `dist/design.css`; `dist/tokens.json` contains all entries; `dist/contrast-notes.json` matches DESIGN.md § 3.

### Phase 2 — Console CSS Polish (FR-007..016)

All changes in `packages/console/src/styles/index.css`:
- Card elevation + hover lift (FR-007)
- Match row hover + state modifiers (FR-008, G2)
- HUD depth shadow (FR-009)
- Button transitions (FR-010)
- Surrender danger hover (FR-011)
- Order bar active state + mode active (FR-012, G3)
- Feedback toast slide-in + variant borders (FR-013, G4)
- Modal backdrop blur + enter animation (FR-014)
- Error boundary refinement + icon/details (FR-015, G6)
- Route notice panel polish + icon (FR-016, G7)

**Verification**: Existing console suites (unit, component, a11y, e2e) remain green. Computed-style tests verify the new rules.

### Phase 3 — New Design System Components (FR-017..021, FR-040a)

All new classes in `packages/design/src/styles/catalog.css`:
- `.europa-link` (FR-017)
- `.europa-divider` + variants (FR-018)
- `.europa-tooltip` (FR-019)
- `.europa-badge--success/warning/error/info/accent` (FR-020)
- `.europa-empty-state` (FR-021)
- Typography utility classes (FR-040a, G5)

**Verification**: Each class renders correctly using only design tokens. Documented in DESIGN.md § 2.

### Phase 4 — Responsive Breakpoints (FR-022..025)

Media queries in `packages/console/src/styles/index.css`:
- Lobby grid breakpoints (FR-022)
- Match view stacking (FR-023)
- HUD horizontal layout (FR-024)
- Modal responsive width (FR-025)

**Verification**: Browser tests at 480/768/1200px widths.

### Phase 5 — Page-Specific Layouts (FR-026..041)

TSX + CSS changes in `packages/console`:
- Hero lockup (FR-026)
- Identity card accent (FR-027)
- Match list hierarchy (FR-028)
- Empty state usage (FR-029)
- Create form polish (FR-030)
- Board area depth (FR-031)
- HUD information hierarchy (FR-032)
- Order bar mode clarity (FR-033)
- Reserves panel compact (FR-034)
- Feedback positioning (FR-035)
- Waiting overlay blur (FR-036)
- Surrender modal danger (FR-037)
- Branded footer (FR-038)
- Global layout patterns (FR-039)
- Typography scale refinements (FR-040)
- Interactive state patterns (FR-041, documentation only)

**Verification**: Existing console suites + new component tests for the TSX changes.

### Phase 6 — Preview Page (FR-042)

Static HTML + TS in `packages/design/preview/`:
- Sticky navigation, hero, color swatches, typography scale, token tables, component catalog, a11y pairings, layout patterns, footer
- Uses only `europa-*` tokens (no hex literals in its own CSS)

**Verification**: Browser test loads the page and verifies all sections render; no hex literals in the page's own CSS.

### Phase 7 — Documentation & DX (FR-043..047)

- DESIGN.md § 1 token table updates (FR-043)
- DESIGN.md § 2 catalog updates (split tables + snippets, FR-044, G8/G10)
- DESIGN.md § 3 a11y table updates (FR-045, G9)
- CSS comments for void-bg vs page-bg (FR-046)
- Line-height documentation per component (FR-047)

**Verification**: DESIGN.md drift guards (G-01..G-11) pass; `pnpm verify` green.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Shadow-token change breaks existing consumers** (board/modal/plate go from `none` to real values) | Medium | Medium | The spec 012 design anticipated this (named tokens were always intended to receive values). Verify all existing console surfaces still render correctly via the existing suites. |
| **`backdrop-filter` unsupported in older browsers** | Low | Low | Graceful degradation — the modal/waiting overlay still renders with the overlay background. No visual breakage. |
| **Contrast ratios for new pairings fail AA** | Medium | Medium | All new pairings are pre-computed in the spec (FR-017, FR-020). The contrast-notes generator (G-11) verifies them against the token table. |
| **`prefers-reduced-motion` not honored for new animations** | Low | Medium | The existing catalog guard (`animation: none !important; transition-duration: 0.01ms !important`) applies globally. Verify via test (AC-017). |
| **Preview page uses hex literals** | Medium | Low | The page imports `TOKENS` and builds swatches from it. The G-04 no-literals guard covers the design package. |
| **Responsive breakpoints conflict with existing layout** | Medium | Medium | The breakpoints match the existing `auto-fit` grid behavior. Verify via browser tests at 480/768/1200px. |
| **Bundle size exceeds budget** | Low | Medium | New CSS is ~5 KB uncompressed. The console browser-payload gzip budget (< 150 KB) is verified by the existing G-08 guard. |
| **`tokens.json` / `contrast-notes.json` drift from DESIGN.md** | Low | Medium | The G-11 guard asserts the contrast-notes file matches DESIGN.md § 3. The existing G-01/G-02 guards cover token-table drift. |

---

## Testing Strategy

### Token/emitter tests (`packages/design`)

- **tokens.test.ts**: assert all new tokens exist with correct values; assert the three shadow tokens are no longer `none`.
- **build-css.test.ts**: assert `--emit-json` produces `dist/tokens.json` with one entry per CSS variable (`name`, `value`, `group`); assert byte-identical output on repeated runs.
- **contrast-notes.test.ts**: assert the contrast-notes generator computes correct WCAG ratios for the new pairings; assert the G-11 guard passes.

### Console suites (`packages/console`)

- **unit**: computed-style tests for the new CSS rules (card shadow, button transition, toast animation, etc.).
- **component**: TSX changes (hero, identity accent, empty-state, error-boundary, route-notice) render correctly.
- **a11y**: new interactive states meet WCAG 2.2 AA; `prefers-reduced-motion` honored.
- **e2e**: responsive breakpoints verified at 480/768/1200px; preview page loads.

### Preview-page browser tests (`packages/design`)

- Playwright test loads the preview page and verifies all sections render; asserts no hex literals in the page's own CSS.

### Final gates

- `pnpm verify` (or `bash scripts/verify.sh`) — the single source of truth for CI-equivalent local verification.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm version:check` repo-wide.
- DESIGN.md drift guards (G-01..G-11) pass.

---

## Decision Log

| # | Decision | Rationale | Spec FR / PO ruling |
|---|----------|-----------|---------------------|
| D-1 | Additive token strategy with semantic aliases | Keeps the token table DRY; no literal duplication; backward compatible | FR-001..005 |
| D-2 | Catalog classes in catalog.css; console polish in index.css | Matches the existing split; shared vs console-local | FR-007..016, FR-017..021 |
| D-3 | CSS-only components, no new web components | Spec Out of Scope; web components are additive | Out of Scope |
| D-4 | `--emit-json` + contrast-notes generator + G-11 guard | Machine-readable tokens + a11y contract; drift-proof | FR-006, FR-045 (G9) |
| D-5 | Preview page as static HTML + Vite dev server | Self-contained documentation; no console route | FR-042 |
| D-6 | Mobile-first breakpoints (480/768/1200px) | Matches spec US3 independent test | FR-022..025 |
| D-7 | `cubic-bezier(0.16, 1, 0.3, 1)` easing | PO ruling D3; refined ease-out curve | FR-002 (D3) |
| D-8 | Toast slides from LEFT, anchored bottom-left | PO rulings D1/D2 | FR-013, FR-035 (D1/D2) |
| D-9 | DESIGN.md § 2 split into Component Identity + Accessibility Obligations | PO ruling G8; independently auditable a11y contract | FR-044 (G8) |
| D-10 | HTML usage snippets per catalog entry | PO ruling G10; illustrative canonical usage | FR-044 (G10) |
| D-11 | Machine-readable contrast notes (JSON) | PO ruling G9; drift-testable a11y contract | FR-045 (G9) |

---

## Complexity Tracking

> No constitution violations. All decisions align with the constitution and the product-owner rulings.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | — | — |
