# Tasks: React Component Conversion of `@europa/design` (Issue #65)

**Input**: Design documents from `/specs/014-shared-ui-components/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/react-components.contract.md

**Tests**: Component unit tests (FR-027), modal integration tests (FR-028), game-primitive tests (FR-029), conformance test (FR-030) are all required by the spec.

**Organization**: Tasks are grouped into implementation waves suitable for parallel sub-agent dispatch. Each task is a **single-artifact micro-task** (one file or one coherent change) per the repo's subagent-reliability guidance. Tasks marked `[P]` can run in parallel (different files, no dependencies).

**Branch**: `issue-65-react-components` (never commit to `main`).

---

## Wave 0: Foundation (blocking — no component work until complete)

**Purpose**: Package config, peer deps, test tooling, tsconfig/tsup/vitest config, delete web-component infrastructure. These are the prerequisites for every component.

- [x] T-001: Add `peerDependencies` (`react: ">=18"`, `react-dom: ">=18"`) to `packages/design/package.json` (Q3). Single-file change.
- [x] T-002: Add `@testing-library/react` `^16.3.2`, `@testing-library/dom` `^10.0.0`, `@testing-library/jest-dom` `^7.0.1`, `@testing-library/user-event` `^14.6.7` devDependencies to `packages/design/package.json`. Single-file change.
- [x] T-003: Update `packages/design/tsconfig.json` to add React JSX support (`"jsx": "react-jsx"`, `"jsxImportSource": "react"`, `lib` includes `DOM`). Verify `@types/react`/`@types/react-dom` resolve. Single-file change.
- [x] T-004: Update `packages/design/tsup.config.ts` to bundle React components (externalize `react`/`react-dom` as peer deps; entry `src/components/index.ts` preserved). Single-file change.
- [x] T-005: Update `packages/design/vitest.config.ts` to add RTL setup (`@testing-library/jest-dom` matchers); remove `setup-element-internals.ts` reference. Single-file change.
- [x] T-006: Update `packages/design/vitest.config.browser.ts` to use `vitest-browser-react` for React component rendering. Single-file change.
- [x] T-007: Delete web-component infrastructure: `src/components/base.ts`, `src/components/register.ts`, `src/components/registry.ts`, `tests/setup-element-internals.ts`. Multi-file deletion.
- [x] T-008: Remove `build-css.ts --emit-module` path + `catalog-styles.ts` generation (no shadow roots remain); retain full `dist/design.css` pass. Single-file change to `scripts/build-css.ts` + `package.json#build` script.

---

## Wave 1: Generic components (13) — parallel

**Purpose**: Convert each generic web component to a React function component + unit test. Each task is one file pair (`.tsx` + `.test.tsx`). All `[P]` — independent files.

- [ ] T-101 `[P]`: Convert `EuropaButton` → `generic/button.tsx` + `tests/components/generic/button.test.tsx` (native `<button>`, variant/size/disabled/type, FR-013).
- [ ] T-102 `[P]`: Convert `EuropaCard` → `generic/card.tsx` + test (children projection).
- [ ] T-103 `[P]`: Convert `EuropaPlate` → `generic/plate.tsx` + test (children projection).
- [ ] T-104 `[P]`: Convert `EuropaModal` → `generic/modal.tsx` + test (open/title/actions/onClose; focus trap, Escape, focus restore — FR-011; interactive behavior in browser mode, structural in happy-dom).
- [ ] T-105 `[P]`: Convert `EuropaChip` → `generic/chip.tsx` + test (count number prop + optional children).
- [ ] T-106 `[P]`: Convert `EuropaBadge` → `generic/badge.tsx` + test (children label).
- [ ] T-107 `[P]`: Convert `EuropaBanner` → `generic/banner.tsx` + test (variant status/alert, role/aria-live — FR-012).
- [ ] T-108 `[P]`: Convert `EuropaTypography` → `generic/typography.tsx` + test (variant → heading/subheading/body/label/caption).
- [ ] T-109 `[P]`: Convert `EuropaWaiting` → `generic/waiting.tsx` + test (message, reducedMotion, live region, prefers-reduced-motion).
- [ ] T-110 `[P]`: Convert `EuropaGrid` → `generic/grid.tsx` + test (variant sidebar/wrap).
- [ ] T-111 `[P]`: Convert `EuropaStack` → `generic/stack.tsx` + test (children).
- [ ] T-112 `[P]`: Convert `EuropaContainer` → `generic/container.tsx` + test (children).
- [ ] T-113 `[P]`: Convert `EuropaPage` → `generic/page.tsx` + test (children).

---

## Wave 2: Game components (7) — parallel

**Purpose**: Convert each game primitive to a React function component + unit test. All `[P]` — independent files.

- [ ] T-201 `[P]`: Convert `EuropaTroopChip` → `game/troop-chip.tsx` + test (count/owner, OWNER_COLORS, `role="img"` + aria-label — FR-014).
- [ ] T-202 `[P]`: Convert `EuropaCityMarker` → `game/city-marker.tsx` + test (owner, `role="img"` + aria-label — FR-014).
- [ ] T-203 `[P]`: Convert `EuropaPipeSlope` → `game/pipe-slope.tsx` + test (direction, `role="img"` + aria-label — FR-014; export `PipeSlopeDirection` type).
- [ ] T-204 `[P]`: Convert `EuropaElevationSwatch` → `game/elevation-swatch.tsx` + test (elevation, `role="img"` + aria-label — FR-014).
- [ ] T-205 `[P]`: Convert `EuropaPlayerBadge` → `game/player-badge.tsx` + test (player/name, `role="img"` + aria-label — FR-014).
- [ ] T-206 `[P]`: Convert `EuropaFogOverlay` → `game/fog-overlay.tsx` + test (visible bool default true, `aria-hidden` — FR-014).
- [ ] T-207 `[P]`: Convert `EuropaReserveIndicator` → `game/reserve-indicator.tsx` + test (percent, `role="img"` + aria-label — FR-014).

---

## Wave 3: Barrel + conformance + modal integration tests

**Purpose**: Wire the barrel, rewrite the conformance test for React props, and finalize the modal browser integration tests.

- [ ] T-301: Rewrite `src/components/index.ts` barrel to export all 20 React components + `PipeSlopeDirection`. Single-file change.
- [ ] T-302: Rewrite `tests/components/conformance.test.ts` (FR-030) to be table-driven over React props → expected classes/roles/aria, reading the token/class contract. Single-file change.
- [ ] T-303: Finalize `tests/components/modal.integration.test.tsx` (FR-028) in `vitest.config.browser.ts` (real Chromium + `vitest-browser-react`): focus trap, Escape close, focus restore.

---

## Wave 4: Guards + DESIGN.md § 2 + contracts

**Purpose**: Rewrite the G-10 guard, bundle budget, DESIGN.md § 2, and contract doc for the React surface.

- [ ] T-401: Rewrite `scripts/check-component-catalog.ts` (G-10) to read `src/components/index.ts` (source of truth replacing `registry.ts`) and assert `DESIGN.md` § 2 entries match. Single-file change.
- [ ] T-402: Rewrite `scripts/check-bundle-size.ts` to target `dist/components/index.js` at `BUNDLE_BUDGET_BYTES = 20_480` (Q5). Single-file change.
- [ ] T-403: Rewrite `DESIGN.md` § 2 "Web components (spec 014)" section → "React components (spec 014)" documenting props/children/events/a11y for all 20 components. Single-file change.
- [ ] T-404: Update `contracts/react-components.contract.md` if any drift from implementation (should match — written from spec). Verify + commit.

---

## Wave 5: Console migration (6 in-scope files) — parallel

**Purpose**: Swap the console's 6 in-scope `ui/` files from inline class-name patterns to the new React components; remove web-component infra. All `[P]` — independent files.

- [ ] T-501 `[P]`: Migrate `branded-footer.tsx` to `EuropaTypography` + `EuropaContainer`.
- [ ] T-502 `[P]`: Migrate `waiting-overlay.tsx` to `EuropaWaiting` (replaces inline spinner + live region).
- [ ] T-503 `[P]`: Migrate `lobby-landing.tsx` to `EuropaPage`/`EuropaStack`/`EuropaCard`/`EuropaButton`/`EuropaTypography`.
- [ ] T-504 `[P]`: Migrate `lobby-create-form.tsx` to `EuropaCard`/`EuropaButton`/`EuropaTypography`/`EuropaBanner`.
- [ ] T-505 `[P]`: Migrate `lobby-identity-card.tsx` to `EuropaCard`/`EuropaButton`/`EuropaTypography`/`EuropaBadge` (verify actual file path first — not found via glob).
- [ ] T-506 `[P]`: Migrate `lobby-match-list.tsx` to `EuropaCard`/`EuropaButton`/`EuropaTypography`/`EuropaBadge`/`EuropaChip`.
- [ ] T-507: Delete console web-component infra: `src/custom-elements.d.ts`, `src/global.d.ts`, and `import { register }` in `src/main.tsx` line 1. Multi-file change.

---

## Wave 6: Astro manual migration (Q4)

**Purpose**: Full manual migration — add `@astrojs/react`, remove `register()` script, convert MDX usages.

- [ ] T-601: Add `@astrojs/react` `^6.0.5` + `react`/`react-dom`/`@types/react`/`@types/react-dom` (catalog) to `docs/manual/package.json`. Single-file change.
- [ ] T-602: Add `react()` to `docs/manual/astro.config.mjs` `integrations`. Single-file change.
- [ ] T-603: Remove the `register()` `<script>` from `docs/manual/src/layouts/ManualLayout.astro`. Single-file change.
- [ ] T-604 `[P]`: Convert MDX `<europa-*>` usages to imported React components — **group 1** (index, quick-start, objective, the-board).
- [ ] T-605 `[P]`: Convert MDX `<europa-*>` usages to imported React components — **group 2** (fog-of-war, numbers, pipes, lobby).
- [ ] T-606 `[P]`: Convert MDX `<europa-*>` usages to imported React components — **group 3** (reserves, controls, combat, cities-and-troops, special-weapons, reading-the-screen).
- [ ] T-607: Verify `docs/manual` `pnpm build` succeeds (SSR renders React components; no `register()` script). Verify vendored `public/design.css` + `assets/design.css` `<europa-*>` matches are CSS class references (not component usages) and stay as-is.

---

## Wave 7: Final gate verification

**Purpose**: Run the full verification protocol; confirm all acceptance criteria.

- [ ] T-701: Run `pnpm verify` (typecheck, lint, format, all package tests, browser tests, E2E, selfhost, design guards, conformance). Fix any failures.
- [ ] T-702: Verify `@europa/design` coverage ≥80% on every metric (Principle III).
- [ ] T-703: Verify `check:component-catalog` (G-10) green against rewritten `DESIGN.md` § 2.
- [ ] T-704: Verify `check:bundle-size` green at 20 KB on `dist/components/index.js` (Q5).
- [ ] T-705: Verify console suites green (unit, component, a11y, e2e) — migration visually invisible (FR-018, SC-003).
- [ ] T-706: Verify `docs/manual` `pnpm build` succeeds (Q4).
- [ ] T-707: Verify no web-component registration code remains anywhere in `@europa/design` (Q1) — grep for `customElements`, `register()`, `EuropaElement`, `attachShadow`.

---

## Wave 8: Spec + docs sync

**Purpose**: Keep specs and docs truthful (constitution rule 4).

- [ ] T-801: Update `specs/014-shared-ui-components/spec.md` status to `Implemented` (2026-09-03) with Implementation Notes documenting the React conversion (Q1–Q5).
- [ ] T-802: Update `AGENTS.md` "Current state" with the issue #65 completion summary.
- [ ] T-803: Update `docs/manual/` player-facing docs if any gameplay/UI behavior changed (should be none — visual parity).
