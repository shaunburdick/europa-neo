# Implementation Plan: Shared UI Web Components in `@europa/design`

**Branch**: `issue-41-shared-UI-components` (spec-kit feature `014-shared-ui-components`) | **Date**: 2026-08-31 | **Spec**: [`specs/014-shared-ui-components/spec.md`](./spec.md)

**Input**: Feature specification from `/specs/014-shared-ui-components/spec.md` (GitHub issue #41) — 30 FRs, 6 NFRs, 7 SCs, 4 user stories, Clarifications v1.0 (planner-resolved, zero open questions).

---

## Summary

Build framework-agnostic web components (`customElements.define`) in `@europa/design` that wrap the existing `europa-*` CSS class catalog. 20 components total: 13 generic (europa-button, europa-card, europa-plate, europa-modal, europa-chip, europa-badge, europa-banner, europa-typography, europa-waiting, europa-grid, europa-stack, europa-container, europa-page) and 7 game-specific primitives (europa-troop-chip, europa-city-marker, europa-pipe-slope, europa-elevation-swatch, europa-player-badge, europa-fog-overlay, europa-reserve-indicator). All components use **light DOM** (no Shadow DOM, no `::part()`, no `adoptedStyleSheets`), apply existing `europa-*` classes directly, and enforce structural accessibility contracts (roles, aria attributes, focus management) that the raw class catalog leaves to the consumer. A new subpath export `@europa/design/components` ships the components (tree-shakeable, side-effect-free import, explicit idempotent `register()`). The console migrates 8 of 15 `ui/` files from inline class-name patterns to web components (React 19 native custom element support, no wrapper). A new drift guard G-10 asserts every registered tag has a `DESIGN.md` § 2 entry. Bundle budgets: `dist/components.js` gzip ≤ 15 KB; console < 153,600 B preserved.

---

## Technical Context

**Language/Version**: TypeScript 5.6 (strict) / Node 22 / pnpm 11.22 workspaces — same as every sibling package. React 19.2.0 (console, catalog) for the migration.

**Primary Dependencies**: **Zero runtime `dependencies` in `@europa/design`** (FR-024, NFR-006). The components depend only on DOM APIs (`customElements`, `HTMLElement`, `MutationObserver` not needed — `observedAttributes` suffices) and the same-package `TOKENS` import. Tooling additions (devDependencies, all catalog versions, permissive licenses):
- `happy-dom` (catalog `^20.11.6`) — DOM environment for the design package's unit/conformance tests.
- `@vitest/browser` (catalog `^4.1.0`) + `@vitest/browser-playwright` (catalog `^4.1.0`) — real-Chromium environment for the modal integration tests (mirrors the console's browser suite).
- Existing `tsup`, `tsx`, `typescript`, `vitest`, `biome` catalog versions.

**Storage**: N/A — no persistence. The component source is tracked TypeScript; `dist/components.{js,d.ts}` are build artifacts.

**Testing**: Vitest 4.1 + `@vitest/coverage-v8` (≥80% on every metric for new testable logic, constitution Principle III). Split:
- `vitest.config.ts` (node + `environment: 'happy-dom'`) — per-component unit tests (FR-027), game-primitive tests (FR-029), conformance test (FR-030).
- `vitest.config.browser.ts` (Playwright Chromium) — modal integration tests (FR-028: focus trap, Escape, focus restore).
- Existing console suites (unit, component, a11y, e2e) verify the migration is visually invisible (FR-018, SC-003).

**Target Platform**: Browser (Vite 8 + React 19 console) and Jekyll static site (manual). Both run on Ubuntu `ubuntu-latest` in CI.

**Project Type**: Monorepo private package enhancement + cross-cutting console migration.

**Performance Goals**: Spec NFR-005 — no layout thrashing (attribute changes batch class updates synchronously); modal focus trap uses `keydown` listeners, not `MutationObserver` polling. FR-025: `dist/components.js` gzip ≤ 15 KB. FR-026: console browser-payload gzip < 153,600 B preserved.

**Constraints**:
- `private: true` everywhere, never published (AGENTS.md binding decision 6).
- Light DOM only (product-owner decision 1); no Shadow DOM, no `::part()`, no `adoptedStyleSheets`.
- React 19 native custom element support, no wrapper layer (product-owner decision 2).
- All 20 components in one delivery (product-owner decision 3).
- Explicit `register()`, idempotent, no auto-register on import (product-owner decision 4).
- New subpath `@europa/design/components`; existing exports unchanged (product-owner decision 5).
- Console migration: 8 of 15 `ui/` files in scope (FR-016); 7 out (FR-017).
- New drift guard G-10 (FR-020); G-01..G-09 unaffected (FR-023).
- Bundle budget: `dist/components.js` gzip ≤ 15 KB (FR-025); console < 153,600 B (FR-026).
- No inline lint suppressions; `strict: true`; no `any` (constitution I).

**Scale/Scope**: One new subpath export in an existing package, 20 component source files + base + registry + register + barrel, 2 test configs, ~30 test files, 6 console files migrated, DESIGN.md § 2 update, G-10 guard, bundle-size guard, CI wiring. No new infrastructure.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | This Feature's Compliance | Risk |
|-----------|---------------------------|------|
| **I. Type Safety First** | All component source is TypeScript strict. Attribute accessors are typed. No `any`, no lint suppressions. | None |
| **II. Server-Authoritative Deterministic Simulation** | No tick logic, no randomness, no wall clock. Components are pure DOM wrappers. | None |
| **III. Tested Game Logic (≥80%)** | Component unit tests (FR-027), modal integration tests (FR-028), game-primitive tests (FR-029), conformance test (FR-030) meet the coverage gate. | Low — enumerating all 20 components for coverage is mechanical. |
| **IV. Specs as Documentation** | `DESIGN.md` § 2 updated in the same change set (FR-022). Component JSDoc (FR-021) is the implementation-level contract. | None |
| **V. Simplicity Over Cleverness** | Thin wrappers (~30–80 LOC each). No framework, no state management, no Shadow DOM. The modal's focus trap is ~50 LOC vanilla JS. | None |
| **VI. Accessibility-Minded UI (WCAG 2.2 AA)** | Components enforce structural a11y (roles, labels, focus management) that the raw class catalog leaves to the consumer. | None — a11y is improved, not regressed. |
| **VII. Self-Hostable by Default** | Zero runtime deps, no CDN, no external services. Pure DOM JavaScript. | None |
| **Additional: Open-source licensing** | Zero runtime deps → trivially MIT-compatible. Tooling (happy-dom, vitest, biome) is permissive. | None |
| **Additional: No vendor lock-in** | No SaaS, no proprietary API. | None |

**Re-check after design**: no new risks introduced by the component shape or the waiting-family catalog move (research R7).

---

## Project Structure

### Documentation (this feature)

```text
specs/014-shared-ui-components/
├── plan.md              # This file
├── research.md          # Phase 0 — choices investigated
├── data-model.md        # Phase 1 — conceptual model
├── contracts/
│   └── web-components.contract.md   # register() + component surface + G-10 contract
└── tasks.md             # Phase 2 — ordered tasks (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/design/
├── package.json                     # + "./components" export, + devDeps, + check scripts
├── tsup.config.ts                   # + second entry src/components/index.ts
├── vitest.config.ts                 # NEW — node + happy-dom (unit/conformance)
├── vitest.config.browser.ts         # NEW — Playwright (modal integration)
├── src/
│   ├── index.ts                     # unchanged (tokens)
│   ├── tokens.ts                    # unchanged (tokens)
│   ├── styles/catalog.css           # + waiting family (research R7)
│   └── components/                  # NEW
│       ├── base.ts                  # EuropaElement base class + helpers
│       ├── registry.ts              # { tag, ctor }[] — single source of truth
│       ├── register.ts              # register() (idempotent)
│       ├── index.ts                 # barrel: re-export all classes + register()
│       ├── generic/
│       │   ├── button.ts            # EuropaButton
│       │   ├── card.ts              # EuropaCard
│       │   ├── plate.ts             # EuropaPlate
│       │   ├── modal.ts             # EuropaModal (focus trap)
│       │   ├── chip.ts              # EuropaChip
│       │   ├── badge.ts             # EuropaBadge
│       │   ├── banner.ts            # EuropaBanner
│       │   ├── typography.ts        # EuropaTypography
│       │   ├── waiting.ts           # EuropaWaiting
│       │   ├── grid.ts              # EuropaGrid
│       │   ├── stack.ts             # EuropaStack
│       │   ├── container.ts         # EuropaContainer
│       │   └── page.ts              # EuropaPage
│       └── game/
│           ├── troop-chip.ts        # EuropaTroopChip
│           ├── city-marker.ts       # EuropaCityMarker
│           ├── pipe-slope.ts        # EuropaPipeSlope
│           ├── elevation-swatch.ts  # EuropaElevationSwatch
│           ├── player-badge.ts      # EuropaPlayerBadge
│           ├── fog-overlay.ts       # EuropaFogOverlay
│           └── reserve-indicator.ts # EuropaReserveIndicator
├── scripts/
│   ├── check-component-catalog.ts   # NEW — G-10 guard (FR-020)
│   └── check-bundle-size.ts         # NEW — FR-025
└── tests/
    ├── components/                  # NEW — unit + conformance tests
    │   ├── generic/                 # one test file per generic component
    │   ├── game/                    # one test file per game primitive
    │   ├── register.test.ts         # register() idempotency (FR-003)
    │   ├── conformance.test.ts      # FR-030
    │   └── modal.integration.test.ts# FR-028 (browser config)
    └── tokens.test.ts               # unchanged

packages/console/src/ui/             # 6 files migrated (FR-016)
├── waiting-overlay.tsx              # → <europa-waiting>
├── lobby-landing.tsx                # → <europa-banner variant="alert"> (×2)
├── lobby-create-form.tsx            # → <europa-button type="submit">
├── lobby-identity-card.tsx          # → <europa-button type="submit">
└── lobby-match-list.tsx             # → <europa-button type="button"> (Join/Spectate)

DESIGN.md                            # § 2 + web-component subsection (FR-022)
```

**Structure Decision**: One source file per component under `packages/design/src/components/`, grouped into `generic/` and `game/` subdirectories (organizational only — the barrel re-exports flat). A shared `base.ts` holds the `EuropaElement` base class. A `registry.ts` holds the `{ tag, ctor }` array that both `register()` and the G-10 guard consume. This keeps each component small and independently testable, matching the repo's subagent-reliability guidance (single-artifact micro-tasks).

---

## Component Architecture

### The `EuropaElement` base class (`base.ts`)

All components extend a shared abstract base class:

```ts
abstract class EuropaElement extends HTMLElement {
    /** Subclasses declare the attributes they observe. */
    static get observedAttributes(): string[];

    /** Called by the base on connectedCallback and attributeChangedCallback. */
    protected abstract render(): void;

    /** Replace this element's class attribute from a list of class names. */
    protected setClasses(...classes: Array<string | false | null | undefined>): void;

    /** Set an attribute on an internal element if the condition holds, else remove it. */
    protected setAttributeIf(el: Element, name: string, condition: boolean): void;
}
```

- `connectedCallback` calls `render()` once (creating the internal DOM if not already present).
- `attributeChangedCallback` calls `render()` to update classes/attributes on the internal DOM.
- `render()` is idempotent — safe to call from both lifecycle hooks.
- `setClasses` and `setAttributeIf` are the class-composition helpers that keep each component's `render()` short and declarative.

### The `register()` function (`register.ts`)

```ts
export function register(): void {
    for (const { tag, ctor } of REGISTRY) {
        if (customElements.get(tag) === undefined) {
            customElements.define(tag, ctor);
        }
    }
}
```

- Idempotent (FR-003): checks `customElements.get(tag)` before defining; duplicates silently no-op.
- No auto-register on import (FR-004): the module has no side effects.
- SSR-safe: if `customElements` is undefined (Node/Jekyll), `register()` no-ops.

### The barrel (`src/components/index.ts`)

Re-exports all 20 component classes + `register()` (FR-005/FR-008). Individual classes are exported for selective registration.

### The registry (`registry.ts`)

```ts
export interface ComponentDefinition {
    readonly tag: string;
    readonly ctor: CustomElementConstructor;
}
export const REGISTRY: readonly ComponentDefinition[] = [ /* 20 entries */ ];
```

The single source of truth for the component inventory — consumed by `register()` and the G-10 guard.

### tsup second entry point

`tsup.config.ts` gains a second entry:

```ts
export default defineConfig({
    entry: ['src/index.ts', 'src/components/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,   // each entry is a standalone bundle
    sourcemap: true,
    target: 'es2022',
});
```

This produces `dist/index.{js,d.ts}` (unchanged) and `dist/components.{js,d.ts}` (new). Because `splitting: false`, `dist/components.js` is self-contained — the 15 KB gzip budget (FR-025) is measurable on a single file.

### `package.json#exports` change

```json
"./components": {
    "types": "./dist/components.d.ts",
    "import": "./dist/components.js"
}
```

Existing `"."` and `"./tokens"` unchanged (FR-006). The stylesheet remains a separate import (FR-007).

---

## Console Migration Mapping (FR-016)

React 19 native custom element support means no wrapper layer (FR-019). The migration replaces inline `europa-*` class-name patterns with web components where a direct component match exists, keeping React for composition/state/events.

| File | Current pattern | Replacement | What stays React |
|------|-----------------|-------------|------------------|
| `waiting-overlay.tsx` | `<div className="europa-waiting …">` + `__plate` + `__pulse` + `__text` | `<europa-waiting message={headline} reduced-motion={reducedMotion}>` | `resolveWaitingMessage`, announcer effect, props derivation |
| `lobby-landing.tsx` | `<div role="alert" className="europa-banner">` (×2) | `<europa-banner variant="alert">` (×2) | lobby layout, superseded notice, headings, announcements |
| `lobby-create-form.tsx` | `<button className="europa-lobby__button europa-focus-ring">` | `<europa-button type="submit" disabled={busy}>` | form/fieldset/select/radio logic, error rendering |
| `lobby-identity-card.tsx` | `<button className="europa-lobby__button europa-focus-ring">` | `<europa-button type="submit" disabled={saving}>` | form/input/validation logic, status lines |
| `lobby-match-list.tsx` | `<button className="europa-lobby__button europa-focus-ring">` (Join/Spectate) | `<europa-button type="button" disabled={busy} aria-label={…}>` | row composition, list logic, empty/loading states |
| `branded-footer.tsx` | `<footer style={{…var(--europa-*)}}>` | **No change** (no component match; FR-016 "keep as-is") | unchanged |

**React 19 interop notes** (research R1):
- Children pass as light-DOM children → render inside the internal element.
- `disabled={bool}` → React 19 sets the boolean attribute on the custom element → the component maps it to the internal `<button>`.
- `onClick` on the custom element → React attaches a listener; the internal element's click bubbles through light DOM → caught. Works because of light DOM (no shadow boundary to retarget events).
- `aria-label`, `type` → React sets the attribute → the component forwards it to the internal element.

**Out of scope (FR-017)**: `order-bar.tsx`, `reserves-panel.tsx`, `targeting-overlay.tsx`, `seat-labels.ts`, `participants.tsx`, `route-notice.tsx`, `lobby-labels.ts`, `lobby-handle.ts` — no change.

---

## DESIGN.md Section 2 Update (FR-022) and G-10 Guard (FR-020)

### DESIGN.md § 2 update

Add a new subsection "Web components (spec 014)" to `DESIGN.md` § 2 with one table row per component: tag, attributes, slots, events, a11y obligations, usage example. Updated in the same change set as the component implementation (FR-022, FR-018 of spec 012).

### G-10 guard (`scripts/check-component-catalog.ts`)

- Imports `REGISTRY` from `src/components/registry.ts` → the set of registered tags.
- Reads `DESIGN.md` § 2, extracts documented custom-element tag names via regex over the web-component table rows.
- Asserts set-equality; fails naming the missing/extra tag.
- Wired as `pnpm --filter @europa/design check:component-catalog` and into CI (client-ci.yml already path-filters `packages/design/**`).

---

## Test Strategy

### Unit tests per component (FR-027) — happy-dom, `tests/components/generic/*.test.ts` + `tests/components/game/*.test.ts`

Each component has a test file asserting:
- (a) correct class composition on rendered elements,
- (b) attribute → DOM mapping (each attribute produces the expected class/attribute on the internal element),
- (c) slot rendering (children appear in the correct position),
- (d) event dispatch (modal close event fires on Escape),
- (e) accessibility attributes (`role`, `aria-*` are set correctly).

### Modal integration tests (FR-028) — Playwright, `tests/components/modal.integration.test.ts`

Assert:
- (a) focus trap cycles Tab/Shift+Tab within the modal,
- (b) Escape closes the modal and restores focus,
- (c) backdrop click closes the modal,
- (d) `open` attribute toggling shows/hides the modal,
- (e) focus cannot escape to elements behind the modal.

### Game-primitive tests (FR-029) — happy-dom, `tests/components/game/*.test.ts`

Assert:
- (a) correct color computation from token values (elevation swatch color matches the land band formula),
- (b) correct `aria-label` generation,
- (c) attribute coercion (string "5" → number 5 for count/elevation).

### Conformance test (FR-030) — happy-dom, `tests/components/conformance.test.ts`

For each class-based component, instantiate with default attributes and no children, and assert the rendered DOM's `europa-*` class names exactly match a manually-constructed equivalent using the catalog classes from `DESIGN.md`. For game primitives, assert the token-derived color matches the token value.

### Coverage ≥ 80%

The design package's coverage config (both node and browser configs) sets thresholds ≥ 80% on every metric (stmts/branches/funcs/lines), matching the constitution and the console's existing config. The component source is the covered surface.

---

## Bundle-Size Verification (FR-025/FR-026)

### FR-025 — `dist/components.js` gzip ≤ 15 KB

`scripts/check-bundle-size.ts` computes `gzipSync(readFile('dist/components.js')).length` and asserts ≤ 15,360 bytes. Wired as `pnpm --filter @europa/design check:bundle-size` and into the build/CI.

### FR-026 — console budget < 153,600 B preserved

The console's existing `build-assets.ts` (G-08) asserts the browser payload < 153,600 B. After the migration, the console build must still pass. A verification task runs the console build post-migration.

---

## Decision Log

| # | Decision | Rationale | Spec FR / PO ruling |
|---|----------|-----------|---------------------|
| D-1 | `EuropaElement` base class with `observedAttributes` + `render()` + class-composition helpers | DRY: all 20 components share attribute observation + class application; keeps each component ~30–80 LOC | FR-021, NFR-005 |
| D-2 | `REGISTRY` array as single source of truth | Both `register()` and G-10 consume it; no drift between registration and documentation | FR-003, FR-020 |
| D-3 | One file per component under `generic/` + `game/` | Small testable units; subagent-friendly micro-tasks | — |
| D-4 | tsup second entry with `splitting: false` | Standalone `dist/components.js`; measurable 15 KB budget | FR-008, FR-025 |
| D-5 | happy-dom for unit/conformance; Playwright for modal integration | Web components need DOM; focus trap needs real browser | FR-027/028/029/030 |
| D-6 | **Move waiting family into shared catalog** | `<europa-waiting>` must work in manual (SC-004); FR-010 requires classes in DESIGN.md §2 | FR-010, SC-004 — **PM/PO-notable** |
| D-7 | **Component-local player-color map reusing TOKENS** | No new token variables (FR-010); no new hex literals | FR-010, FR-024 — **PM/PO-notable** |
| D-8 | G-10 guard as a script importing `REGISTRY` | Single source of truth; actionable failure message | FR-020 |
| D-9 | Bundle-size guard as a script | Direct, comparable to G-08 | FR-025 |
| D-10 | Console migration: only direct component matches; React keeps composition | FR-016/017/019; minimal diff, no visual change | FR-016/017/019 |
| D-11 | `branded-footer.tsx` unchanged | No component match; FR-016 explicitly allows "keep as-is" | FR-016 |
| D-12 | Zero runtime deps; components import only `TOKENS` | Constitution VII, NFR-002/006, FR-024 | FR-024, NFR-006 |

---

## Complexity Tracking

> No constitution violations. All decisions align with the constitution and the product-owner rulings.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | — | — |
