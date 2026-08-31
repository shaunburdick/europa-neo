# Tasks: Shared UI Web Components in `@europa/design`

**Input**: Design documents from `/specs/014-shared-ui-components/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/web-components.contract.md

**Tests**: Component unit tests (FR-027), modal integration tests (FR-028), game-primitive tests (FR-029), conformance test (FR-030) are all required by the spec.

**Organization**: Tasks are grouped into implementation waves suitable for parallel sub-agent dispatch. Each task is a **single-artifact micro-task** (one file or one coherent change) per the repo's subagent-reliability guidance. Tasks marked `[P]` can run in parallel (different files, no dependencies).

**Branch**: `issue-41-shared-UI-components` (never commit to `main`).

---

## Wave 0: Foundation (blocking — no component work until complete)

**Purpose**: Package config, base class, registry, register(), barrel, test scaffolding. These are the prerequisites for every component.

- [ ] T-001: Add `happy-dom`, `@vitest/browser`, `@vitest/browser-playwright` devDependencies to `packages/design/package.json` (catalog versions). Single-file change.
- [ ] T-002: Add `"./components"` export to `packages/design/package.json#exports` (`types: "./dist/components.d.ts"`, `import: "./dist/components.js"`). Single-file change.
- [ ] T-003: Add `check:component-catalog` and `check:bundle-size` scripts to `packages/design/package.json#scripts`. Single-file change.
- [ ] T-004: Update `packages/design/tsup.config.ts` to add the second entry `src/components/index.ts` (entry array becomes `['src/index.ts', 'src/components/index.ts']`). Single-file change.
- [ ] T-005: Create `packages/design/vitest.config.ts` — node + `environment: 'happy-dom'`, coverage thresholds ≥ 80% on every metric, include `tests/components/**`. Single new file.
- [ ] T-006: Create `packages/design/vitest.config.browser.ts` — Playwright Chromium (mirroring the console's `vitest.config.browser.ts`), include `tests/components/modal.integration.test.ts`. Single new file.
- [ ] T-007: Create `packages/design/src/components/base.ts` — the `EuropaElement` abstract base class (extends `HTMLElement`, `observedAttributes`, `render()` hook, `setClasses`, `setAttributeIf` helpers). Single new file.
- [ ] T-008: Create `packages/design/src/components/registry.ts` — the `ComponentDefinition` interface + `REGISTRY` array (20 entries, one per component, referencing the classes created in later waves). Single new file. **Note**: this file imports the component classes, so it must be created after the component files exist OR the registry is assembled incrementally — see Wave 1 note.
- [ ] T-009: Create `packages/design/src/components/register.ts` — the idempotent `register()` function. Single new file.
- [ ] T-010: Create `packages/design/src/components/index.ts` — the barrel re-exporting all component classes + `register()`. Single new file.
- [ ] T-011: Create `packages/design/tests/components/register.test.ts` — asserts `register()` is idempotent (calling twice does not throw), no auto-register on import, and `REGISTRY.length === 20`. Single new file.
- [ ] T-012: Create `packages/design/scripts/check-component-catalog.ts` — the G-10 guard (imports `REGISTRY`, reads `DESIGN.md` § 2, asserts set-equality). Single new file.
- [ ] T-013: Create `packages/design/scripts/check-bundle-size.ts` — asserts `dist/components.js` gzip ≤ 15,360 bytes. Single new file.

> **Wave 0 note on T-008**: The `REGISTRY` array references the component classes. To keep each task a single artifact, create the registry with the full 20-entry array in T-008, and create the component class files in Wave 1 (they must exist for the typecheck to pass). The registry file and the component files are created in the same overall change set; the typecheck gate runs at the end of Wave 1.

**Checkpoint**: Foundation ready — package config, base class, registry, register(), barrel, test scaffolding, guards. Component implementation can now begin.

---

## Wave 1: Generic components (13) — parallel

**Purpose**: Implement the 13 generic web components (FR-001). Each is a single source file + a single test file. All marked `[P]` (different files, no dependencies).

**Note**: The `EuropaElement` base class (T-007) must exist first. Each component file imports from `./base.js`.

### Implementation (one file per component)

- [ ] T-014: [P] Create `packages/design/src/components/generic/button.ts` — `EuropaButton` (`<europa-button>`): native `<button>`, variant/size/disabled attributes, forwards `disabled`/`aria-label`/`type`. Single new file.
- [ ] T-015: [P] Create `packages/design/src/components/generic/card.ts` — `EuropaCard` (`<europa-card>`): `<div class="europa-card">` wrapping slotted children. Single new file.
- [ ] T-016: [P] Create `packages/design/src/components/generic/plate.ts` — `EuropaPlate` (`<europa-plate>`): `<div class="europa-plate">` wrapping slotted children. Single new file.
- [ ] T-017: [P] Create `packages/design/src/components/generic/modal.ts` — `EuropaModal` (`<europa-modal>`): backdrop + dialog + title + body + actions, `open`/`title` attributes, focus trap, Escape, focus restore, `europa-close` event. Single new file (the most complex component, ~80 LOC).
- [ ] T-018: [P] Create `packages/design/src/components/generic/chip.ts` — `EuropaChip` (`<europa-chip>`): `<span class="europa-chip">` with `count` text. Single new file.
- [ ] T-019: [P] Create `packages/design/src/components/generic/badge.ts` — `EuropaBadge` (`<europa-badge>`): `<span class="europa-badge">` wrapping slotted label. Single new file.
- [ ] T-020: [P] Create `packages/design/src/components/generic/banner.ts` — `EuropaBanner` (`<europa-banner>`): `<div class="europa-banner">`, `variant` status/alert → `role="status"`/`role="alert"` + `aria-live`. Single new file.
- [ ] T-021: [P] Create `packages/design/src/components/generic/typography.ts` — `EuropaTypography` (`<europa-typography>`): semantic element per variant (heading → `h2`, others → `span`/`p`). Single new file.
- [ ] T-022: [P] Create `packages/design/src/components/generic/waiting.ts` — `EuropaWaiting` (`<europa-waiting>`): waiting plate + pulse + text, `message`/`reduced-motion` attributes, spinner `aria-hidden`. Single new file.
- [ ] T-023: [P] Create `packages/design/src/components/generic/grid.ts` — `EuropaGrid` (`<europa-grid>`): `<div class="europa-grid">` + `--sidebar`/`--wrap` variant. Single new file.
- [ ] T-024: [P] Create `packages/design/src/components/generic/stack.ts` — `EuropaStack` (`<europa-stack>`): `<div class="europa-stack">`. Single new file.
- [ ] T-025: [P] Create `packages/design/src/components/generic/container.ts` — `EuropaContainer` (`<europa-container>`): `<div class="europa-container">`. Single new file.
- [ ] T-026: [P] Create `packages/design/src/components/generic/page.ts` — `EuropaPage` (`<europa-page>`): `<div class="europa-page">`. Single new file.

### Tests (one file per component)

- [ ] T-027: [P] Create `packages/design/tests/components/generic/button.test.ts` — class composition, variant/size/disabled mapping, children rendering, `disabled`/`aria-label`/`type` forwarding, `role`/`aria` attributes. Single new file.
- [ ] T-028: [P] Create `packages/design/tests/components/generic/card.test.ts` — class composition, slot rendering. Single new file.
- [ ] T-029: [P] Create `packages/design/tests/components/generic/plate.test.ts` — class composition, slot rendering. Single new file.
- [ ] T-030: [P] Create `packages/design/tests/components/generic/modal.test.ts` — class composition, `open`/`title` mapping, `role="dialog"`/`aria-modal`/`aria-labelledby`, `europa-close` event on Escape. Single new file.
- [ ] T-031: [P] Create `packages/design/tests/components/generic/chip.test.ts` — class composition, `count` text. Single new file.
- [ ] T-032: [P] Create `packages/design/tests/components/generic/badge.test.ts` — class composition, slot rendering. Single new file.
- [ ] T-033: [P] Create `packages/design/tests/components/generic/banner.test.ts` — class composition, `variant` → `role`/`aria-live` mapping. Single new file.
- [ ] T-034: [P] Create `packages/design/tests/components/generic/typography.test.ts` — class composition, variant → semantic element mapping. Single new file.
- [ ] T-035: [P] Create `packages/design/tests/components/generic/waiting.test.ts` — class composition, `message`/`reduced-motion` mapping, spinner `aria-hidden`. Single new file.
- [ ] T-036: [P] Create `packages/design/tests/components/generic/grid.test.ts` — class composition, variant mapping. Single new file.
- [ ] T-037: [P] Create `packages/design/tests/components/generic/stack.test.ts` — class composition. Single new file.
- [ ] T-038: [P] Create `packages/design/tests/components/generic/container.test.ts` — class composition. Single new file.
- [ ] T-039: [P] Create `packages/design/tests/components/generic/page.test.ts` — class composition. Single new file.

**Checkpoint**: All 13 generic components implemented + unit-tested. `register()` can now register them.

---

## Wave 2: Game-specific primitives (7) — parallel

**Purpose**: Implement the 7 game-specific primitives (FR-002). Each is a single source file + a single test file. All marked `[P]`.

**Note**: These import `TOKENS` from `../../tokens.js` for color computation (research R8). The player-color map is component-local, reusing existing `TOKENS.color.*` values.

### Implementation (one file per component)

- [ ] T-040: [P] Create `packages/design/src/components/game/troop-chip.ts` — `EuropaTroopChip` (`<europa-troop-chip>`): `<span class="europa-chip" role="img">` with `count`/`owner` → `aria-label`, player-color border. Single new file.
- [ ] T-041: [P] Create `packages/design/src/components/game/city-marker.ts` — `EuropaCityMarker` (`<europa-city-marker>`): inline-styled marker, `owner` → `aria-label`, player color. Single new file.
- [ ] T-042: [P] Create `packages/design/src/components/game/pipe-slope.ts` — `EuropaPipeSlope` (`<europa-pipe-slope>`): `direction` → `TOKENS.color.pipe*` fill, `aria-label`. Single new file.
- [ ] T-043: [P] Create `packages/design/src/components/game/elevation-swatch.ts` — `EuropaElevationSwatch` (`<europa-elevation-swatch>`): `elevation` → land-band color (`hsl(landHue, landSaturationPct%, lightness%)`), `aria-label`. Single new file.
- [ ] T-044: [P] Create `packages/design/src/components/game/player-badge.ts` — `EuropaPlayerBadge` (`<europa-player-badge>`): `<span class="europa-badge" role="img">`, `player`/`name` → `aria-label`, player color. Single new file.
- [ ] T-045: [P] Create `packages/design/src/components/game/fog-overlay.ts` — `EuropaFogOverlay` (`<europa-fog-overlay>`): `<div aria-hidden="true">` overlay, `visible` boolean. Single new file.
- [ ] T-046: [P] Create `packages/design/src/components/game/reserve-indicator.ts` — `EuropaReserveIndicator` (`<europa-reserve-indicator>`): `<span class="europa-chip" role="img">`, `percent` → `aria-label`. Single new file.

### Tests (one file per component)

- [ ] T-047: [P] Create `packages/design/tests/components/game/troop-chip.test.ts` — `aria-label` generation, `count`/`owner` coercion, player-color. Single new file.
- [ ] T-048: [P] Create `packages/design/tests/components/game/city-marker.test.ts` — `aria-label`, player-color. Single new file.
- [ ] T-049: [P] Create `packages/design/tests/components/game/pipe-slope.test.ts` — `direction` → token color, `aria-label`. Single new file.
- [ ] T-050: [P] Create `packages/design/tests/components/game/elevation-swatch.test.ts` — elevation → land-band color formula, `aria-label`, coercion. Single new file.
- [ ] T-051: [P] Create `packages/design/tests/components/game/player-badge.test.ts` — `aria-label`, player-color, `name`. Single new file.
- [ ] T-052: [P] Create `packages/design/tests/components/game/fog-overlay.test.ts` — `visible` boolean, `aria-hidden`. Single new file.
- [ ] T-053: [P] Create `packages/design/tests/components/game/reserve-indicator.test.ts` — `percent` → `aria-label`, coercion. Single new file.

**Checkpoint**: All 7 game primitives implemented + unit-tested. `register()` can now register all 20.

---

## Wave 3: Modal integration + conformance tests

**Purpose**: The modal focus-trap integration tests (FR-028) in a real browser, and the conformance test (FR-030).

- [ ] T-054: Create `packages/design/tests/components/modal.integration.test.ts` — Playwright browser test asserting focus trap cycles Tab/Shift+Tab, Escape closes + restores focus, backdrop click closes, `open` toggling, focus cannot escape. Single new file.
- [ ] T-055: Create `packages/design/tests/components/conformance.test.ts` — for each class-based component, instantiate with default attributes and no children, assert the rendered DOM's `europa-*` class names exactly match a manually-constructed catalog equivalent; for game primitives, assert token-derived color matches the token value. Single new file.

**Checkpoint**: Component test suite complete (unit + integration + conformance).

---

## Wave 4: Waiting-family catalog move (research R7)

**Purpose**: Move the `.europa-waiting*` classes from the console's `index.css` into the shared catalog so `<europa-waiting>` works in the manual (SC-004) and satisfies FR-010.

- [ ] T-056: Add `.europa-waiting`, `.europa-waiting__plate`, `.europa-waiting__pulse`, `.europa-waiting__text`, and `@keyframes europa-spin` to `packages/design/src/styles/catalog.css` (composing only `var(--europa-*)` tokens). Single-file change.
- [ ] T-057: Remove the duplicate `.europa-waiting*` rules and `@keyframes europa-spin` from `packages/console/src/styles/index.css` (lines ~563–620). Single-file change.
- [ ] T-058: Add the waiting-family rows to `DESIGN.md` § 2 catalog table (`.europa-waiting`, `.europa-waiting__plate`, `.europa-waiting__pulse`, `.europa-waiting__text`). Single-file change.
- [ ] T-059: Rebuild `dist/design.css` and re-vendor to `docs/manual/assets/design.css` (`pnpm --filter @europa/design build`). Verify G-05 (vendor identity) and G-04 (no-literals) remain green.

**Checkpoint**: `<europa-waiting>` is styled by the shared stylesheet; the console's visual output is unchanged (classes moved, computed styles identical).

---

## Wave 5: Console migration (FR-016) — parallel

**Purpose**: Migrate the 6 in-scope console files from inline class-name patterns to web components. Each is a single-file change. All marked `[P]` (different files).

**Note**: The console must import `@europa/design/components` and call `register()` once at application entry (in `main.tsx` or the runtime mount). This is a separate task (T-066).

- [ ] T-060: [P] Migrate `packages/console/src/ui/waiting-overlay.tsx` — replace the inline `.europa-waiting*` DOM with `<europa-waiting message={headline} reduced-motion={reducedMotion}>`. Keep `resolveWaitingMessage` and the announcer effect. Single-file change.
- [ ] T-061: [P] Migrate `packages/console/src/ui/lobby-landing.tsx` — replace the two `<div role="alert" className="europa-banner">` with `<europa-banner variant="alert">`. Keep the lobby layout, superseded notice, headings, announcements. Single-file change.
- [ ] T-062: [P] Migrate `packages/console/src/ui/lobby-create-form.tsx` — replace the submit `<button className="europa-lobby__button europa-focus-ring">` with `<europa-button type="submit" disabled={busy}>`. Keep form/fieldset/select/radio logic. Single-file change.
- [ ] T-063: [P] Migrate `packages/console/src/ui/lobby-identity-card.tsx` — replace the submit `<button className="europa-lobby__button europa-focus-ring">` with `<europa-button type="submit" disabled={saving}>`. Keep form/input/validation logic. Single-file change.
- [ ] T-064: [P] Migrate `packages/console/src/ui/lobby-match-list.tsx` — replace the Join/Spectate `<button className="europa-lobby__button europa-focus-ring">` with `<europa-button type="button" disabled={busy} aria-label={…}>`. Keep row composition, list logic. Single-file change.
- [ ] T-065: [P] Add `@europa/design` (or the `./components` subpath) to `packages/console/package.json#dependencies` (workspace dependency). Single-file change.
- [ ] T-066: Add `import { register } from '@europa/design/components'; register();` at the console application entry (`packages/console/src/main.tsx` or the runtime mount). Single-file change.

**Checkpoint**: Console migrated. Existing console suites (unit, component, a11y, e2e) must remain green (FR-018, SC-003).

---

## Wave 6: DESIGN.md § 2 web-component subsection + G-10 guard wiring

**Purpose**: Document every web component in `DESIGN.md` § 2 (FR-022) and wire the G-10 guard (FR-020).

- [ ] T-067: Add the "Web components (spec 014)" subsection to `DESIGN.md` § 2 — one table row per component (tag, attributes, slots, events, a11y obligations, usage example). Single-file change.
- [ ] T-068: Wire `check:component-catalog` (G-10) and `check:bundle-size` into the design package's CI/build flow (client-ci.yml already path-filters `packages/design/**`; verify the workflow runs the new checks). Single-file change.

**Checkpoint**: G-10 passes (every registered tag documented); bundle-size guard wired.

---

## Wave 7: Final gate verification

**Purpose**: Verify all acceptance criteria, coverage, budgets, and guards.

- [ ] T-069: Run `pnpm --filter @europa/design typecheck` — zero errors, strict mode, no `any`, no suppressions.
- [ ] T-070: Run `pnpm --filter @europa/design lint` and `pnpm --filter @europa/design format:check` — zero errors.
- [ ] T-071: Run `pnpm --filter @europa/design test` (node + happy-dom) and `pnpm --filter @europa/design test:browser` (Playwright) — all green, coverage ≥ 80% on every metric.
- [ ] T-072: Run `pnpm --filter @europa/design build` — produces `dist/index.{js,d.ts}` + `dist/components.{js,d.ts}` + `dist/design.css`; re-vendors to `docs/manual/assets/design.css`.
- [ ] T-073: Run `pnpm --filter @europa/design check:component-catalog` (G-10) — passes.
- [ ] T-074: Run `pnpm --filter @europa/design check:bundle-size` (FR-025) — `dist/components.js` gzip ≤ 15 KB.
- [ ] T-075: Run `pnpm --filter @europa/design check:vendor-identity` (G-05) and `check:no-literals` (G-04) — green (G-01..G-09 unaffected, FR-023).
- [ ] T-076: Run the console suites (`pnpm --filter @europa/console test:unit`, `test:component`, `test:a11y`, `test:e2e`) — all green (FR-018, SC-003).
- [ ] T-077: Run the console build (`pnpm --filter @europa/console build`) — browser-payload gzip < 153,600 B (FR-026, G-08).
- [ ] T-078: Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm version:check` repo-wide — all green.
- [ ] T-079: Manual smoke test — a plain HTML page importing `@europa/design/components` + `dist/design.css` renders `<europa-modal>`, `<europa-button>`, `<europa-banner>`, `<europa-troop-chip>` with correct styling and accessibility (SC-004).

**Checkpoint**: All SC-001..SC-007 verified. Feature complete.

---

## Dependencies & Execution Order

### Wave Dependencies

- **Wave 0 (Foundation)**: No dependencies — can start immediately. BLOCKS all component work.
- **Wave 1 (Generic)**: Depends on Wave 0 (base class T-007, registry T-008). All 13 components parallel.
- **Wave 2 (Game)**: Depends on Wave 0 (base class T-007, registry T-008). All 7 components parallel. Can run in parallel with Wave 1.
- **Wave 3 (Modal integration + conformance)**: Depends on Wave 1 (modal T-017) and Wave 2 (all game primitives).
- **Wave 4 (Waiting-family move)**: Independent of Waves 1–3 (touches catalog.css + console index.css + DESIGN.md). Can run in parallel.
- **Wave 5 (Console migration)**: Depends on Wave 1 (generic components exist) + T-065/T-066 (import + register). All 6 file migrations parallel.
- **Wave 6 (DESIGN.md + G-10 wiring)**: Depends on Wave 0 (G-10 script T-012) + Wave 1/2 (components exist to document).
- **Wave 7 (Final gates)**: Depends on all prior waves.

### Parallel Opportunities

- Wave 1's 13 component files + 13 test files: all `[P]`, fully parallel.
- Wave 2's 7 component files + 7 test files: all `[P]`, fully parallel (and parallel with Wave 1).
- Wave 4 can run in parallel with Waves 1–3.
- Wave 5's 6 file migrations: all `[P]`, fully parallel (after T-065/T-066).
- Wave 7's gate tasks: sequential (each verifies the accumulated state).

### Subagent dispatch guidance

Per the repo's subagent-reliability guidance:
- Dispatch one file per subagent task (each T-0xx is a single artifact).
- Verify each file lands on disk before dispatching the next.
- Pre-create target directories (`packages/design/src/components/generic/`, `packages/design/src/components/game/`, `packages/design/tests/components/generic/`, `packages/design/tests/components/game/`) before dispatching writers.
- Give exact absolute file paths.

---

## Notes

- [P] tasks = different files, no dependencies.
- Each task is a single-artifact micro-task (one file or one coherent change).
- Commit after each task or logical group with conventional commits (e.g. `feat(design): add EuropaButton web component`).
- Verify tests fail before implementing (TDD where practical).
- The `REGISTRY` (T-008) references all 20 component classes; the typecheck gate runs at the end of Wave 1/2 once all classes exist.
- PM/PO-notable decisions to surface: (1) the waiting-family catalog move (research R7), (2) the component-local player-color map (research R8).
