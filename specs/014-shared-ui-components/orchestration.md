# Orchestration Log: Shared UI Web Components (Feature 014)

## Status
- **Current Wave**: Wave 3 (Modal integration + conformance) — Next
- **Branch**: `issue-41-shared-UI-components`
- **Last Updated**: 2026-08-31

## Plan Summary
Extract 20 framework-agnostic web components (`customElements.define`) into `@europa/design` under a new `@europa/design/components` subpath. Light DOM (apply existing `europa-*` classes, no Shadow DOM). `EuropaElement` abstract base class + `REGISTRY` array + idempotent `register()`. 13 generic + 7 game-specific primitives. Console migrates 6 in-scope files (React 19 native custom-element interop, no wrapper). New G-10 guard (every registered tag documented in DESIGN.md §2) + bundle-size guard (dist/components.js gzip ≤ 15 KB). Waiting-family catalog move (console index.css → shared catalog.css). All 20 components in one delivery.

## Task Wave Progress

### Wave 0 — Foundation — ✅ Complete (commit `7dbff06`)
- [x] T-001: happy-dom + @vitest/browser + @vitest/browser-playwright devDeps
- [x] T-002: `./components` export in package.json#exports
- [x] T-003: check:component-catalog + check:bundle-size scripts
- [x] T-004: tsup second entry (src/components/index.ts)
- [x] T-005: vitest.config.ts (node + happy-dom)
- [x] T-006: vitest.config.browser.ts (Playwright)
- [x] T-007: src/components/base.ts (EuropaElement)
- [x] T-008: src/components/registry.ts (REGISTRY, 20 entries)
- [x] T-009: src/components/register.ts (idempotent register())
- [x] T-010: src/components/index.ts (barrel)
- [x] T-011: tests/components/register.test.ts
- [x] T-012: scripts/check-component-catalog.ts (G-10)
- [x] T-013: scripts/check-bundle-size.ts (FR-025)

### Wave 1 — Generic components (13) — ✅ Complete (commit `d1b8c0f`)
- [x] T-014..T-026: 13 generic component source files (button, card, plate, modal, chip, badge, banner, typography, waiting, grid, stack, container, page)
- [x] T-027..T-039: 13 generic component unit test files (55 tests, all passing)
- Systematic issues found & fixed during wave:
  - Wrong import path `./base.js` → `../base.js` in button/card/chip/plate/typography (base.ts is one level up from generic/)
  - FR-004 violation: plate.ts auto-registered on import — removed
  - Button/grid applied catalog classes to host instead of internal element — fixed to internal element
  - Waiting used `setClasses(el, ...)` (wrong — setClasses applies to host only) — fixed to direct className assignments
  - Waiting pulse `aria-hidden` was empty string via setAttributeIf — fixed to explicit `aria-hidden="true"` (component bug)
  - Slot-projection tests asserted `wrapper.contains(child)` — WRONG for light DOM (children stay host children); fixed 8 tests to assert host containment + wrapper has `<slot>`
  - Modal test set innerHTML after `open` attr (wiped rendered backdrop) — reordered

### Wave 2 — Game primitives (7) — ✅ Complete (commit `2566f54`)
- [x] T-040..T-046: 7 game component source files (troop-chip, city-marker, pipe-slope, elevation-swatch, player-badge, fog-overlay, reserve-indicator)
- [x] T-047..T-053: 7 game component unit test files (66 tests, all passing)
- Component-local player-color map (plan D-7): P1→accent, P2→city, P3→green, P4→blue, fallback→textMuted (reuses TOKENS.color.*, no new hex/tokens)
- Elevation swatch interpolates land-band lightness 26→62 (hsl(120,12%,L%))
- Pipe slope maps direction → TOKENS.color.pipe* (downhill/flat/uphill/stalled)
- All primitives: role=img + aria-label (FR-014), light DOM, no auto-register
- Systematic issues found & fixed during wave:
  - **tsconfig DOM lib**: packages/design/tsconfig.json lacked DOM lib (base sets lib:["ES2022"]) — web components need it. Added `"lib": ["ES2022","DOM","DOM.Iterable"]` (scoped to design package only).
  - **override modifiers (17)**: noImplicitOverride required `override` on members overriding EuropaElement (render/observedAttributes/connectedCallback/attributeChangedCallback) across all 14 generic+game components. NOTE: disconnectedCallback does NOT need override (not declared in base — inherited from HTMLElement).
  - **strict null-safety (11)**: noUncheckedIndexedAccess surfaced null-key map lookups (player-badge/troop-chip) + modal focus-trap + waiting internal refs.
  - **absent-owner/player color fallback bug**: `(owner !== null && MAP[owner]) ?? fallback` returned `false` (not fallback) when owner absent — `false ?? x` = false. Fixed to `MAP[owner] ?? fallback`. Found in troop-chip + player-badge.
  - **Biome lint/format (18)**: auto-fixed via biome check --write + manual noUselessTernary in modal.ts (`isOpen ? false : true` → `!isOpen`).
- Gates: typecheck exit 0, lint exit 0, component suite 21 files / 124 tests passing.

### Wave 3 — Modal integration + conformance — ⏳ Pending
### Wave 4 — Waiting-family catalog move — ⏳ Pending
### Wave 5 — Console migration — ⏳ Pending
### Wave 6 — DESIGN.md §2 + G-10 wiring — ⏳ Pending
### Wave 7 — Final gates — ⏳ Pending

## Decisions & Rationale
- 2026-08-31: PO decisions — Light DOM (no Shadow DOM/::part()/adoptedStyleSheets); React 19 (native custom element support, no wrapper); all 20 components in one delivery.
- 2026-08-31 (plan D-6): Waiting-family `.europa-waiting*` classes move from console index.css into shared catalog.css + DESIGN.md §2 (needed for `<europa-waiting>` in manual, SC-004). Computed styles identical.
- 2026-08-31 (plan D-7): Game primitives use component-local player-color map reusing existing `TOKENS.color.*` values — no new token variables, no new hex literals (preserves FR-010 + no-literals guard).

## Blockers & Escalations
- None yet.

## New Tasks Discovered
- None yet.

## Review Findings
- None yet.
