# Quickstart: Client Console (Feature 005)

**Date**: 2026-08-21 | **Feature**: 005-client-console | **Spec**: [spec.md](./spec.md)

This document is the **runnable validation scenarios** for the
client console. It targets two audiences:

1. **Contributors** who want to run a working console locally.
2. **CI** which executes a subset of the scenarios automatically.

Every scenario is **runnable** with the tooling described. The
scenarios are not pseudocode; each one lists the exact command
or test that exercises it.

---

## Prerequisites

- Node.js ≥ 20 LTS
- pnpm 11 (locked stack)
- A checkout of this monorepo on branch `001-europa-core`
- (For the E2E scenarios) Playwright browsers:
  `pnpm --filter @europa/console exec playwright install`

---

## 0. Build the workspace

```bash
# From repo root
pnpm install
pnpm --filter @europa/engine build
pnpm --filter @europa/fog build
pnpm --filter @europa/terrain build
pnpm --filter @europa/networking build
pnpm --filter @europa/console build
```

The console's `build` step also runs the asset pipeline
(`scripts/build-assets.ts`) which compiles SVG sprites to PNG
and re-encodes sound clips.

---

## 1. Run the console in dev mode (Vite dev server)

### Scenario Q-C01: Boot the console in dev mode

```bash
pnpm --filter @europa/console dev
```

Expected output: Vite dev server starts on `http://localhost:5173`.
A browser tab opens (or navigate manually) showing a connection
status banner ("Connecting…") and an empty map. The dev server
hot-reloads on source changes.

**Manual verification**:
- [ ] Page loads in <1 s on a modern laptop
- [ ] No console errors in DevTools
- [ ] Network tab shows WebSocket connection attempt to
      `ws://localhost:8080` (configurable)

---

## 2. Run the console against a local match server

### Scenario Q-C02: Boot console + match server together

The console needs a feature 004 match server to talk to. The
fastest way is to use the dev fixture that boots an in-process
server alongside the console.

```bash
# Terminal 1: start the console pointing at a local feature 004 server
pnpm --filter @europa/console dev -- --server fixture
```

The `--server fixture` flag tells the console's dev mode to spin
up an in-process feature 004 server (using the engine's fixture
matchmaker) on port 8080. The console auto-creates a match and
connects to it.

**Expected behavior**:
- A match begins with a randomly-generated 32×32 board.
- The player is player 1 (red by `DEFAULT_PLAYER_COLORS`).
- Player 2 has a starting city on the opposite side.
- The console renders the board, your city, and the cells within
  your visibility horizon.
- A 4 Hz tick loop advances the simulation.

**Manual verification**:
- [ ] Map is rendered with elevation shading (lighter = higher).
- [ ] Own city is visible and has a starting army.
- [ ] Cells outside your horizon render as void (black).
- [ ] Pressing `i/j/k/l` over a friendly cell toggles pipes
      (visible immediately as a triangle on the cell's edge).
- [ ] Pressing `p` over a friendly cell does nothing (the subcell
      position is centered → no target).

### Scenario Q-C03: Two-browser match (manual smoke test)

```bash
# Terminal 1: start the server
pnpm --filter @europa/server dev

# Terminal 2: start the console for player 1
pnpm --filter @europa/console dev -- --player 1

# Terminal 3: start the console for player 2
pnpm --filter @europa/console dev -- --player 2
```

Open the URLs from terminals 2 and 3 in two browser windows.
Both consoles connect to the same server.

**Manual verification**:
- [ ] Player 1 sees only their own horizon.
- [ ] Player 2 sees only their own horizon.
- [ ] When player 1 sets a pipe that flows into player 2's
      visible cell, player 2 sees the troops arrive on the
      next tick.
- [ ] Closing player 1's tab shows a "Player 1 disconnected"
      banner on player 2's console; opening it again within
      60 s reconnects.

---

## 3. Unit tests (reducer + pure helpers)

```bash
pnpm --filter @europa/console test:unit
```

Vitest 4.1 runs in Node with happy-dom. Coverage is measured
via the v8 provider.

### Scenarios covered

| ID | Test file | What it asserts |
|----|-----------|-----------------|
| Q-U01 | `reducer.test.ts` | Every `PlayerAction` reduces to the expected new state. |
| Q-U02 | `reducer.test.ts` | Every `NetEvent` reduces to the expected new state. |
| Q-U03 | `actionToOrder.test.ts` | Action → Order mapping matches the table in data-model §11. |
| Q-U04 | `subcell.test.ts` | 5×5 binning algorithm matches expected `(dx, dy)` for every input. |
| Q-U05 | `localPreflight.test.ts` | Out-of-range, water, and not-owner orders are rejected locally. |
| Q-U06 | `buildMapView.test.ts` | `MapView` is correctly derived from a `PlayerView` snapshot. |
| Q-U07 | `diff.test.ts` | `changedThisTick` flag set only on cells whose state changed. |
| Q-U08 | `formatRejection.test.ts` | Every `ValidationError` maps to a human-readable string. |
| Q-U09 | `coord.test.ts` | `coordKey` ↔ `keyToCoord` round-trips. |
| Q-U10 | `inputMapping.test.ts` | Every default key is bound; every binding is unique. |

### Coverage threshold

Vitest is configured with:
```ts
coverage: { thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } }
```

The reducer (`src/reducer/`) is targeted at 100% coverage. The
input mapping table is targeted at 100% coverage. The renderer
(`src/render/`) is targeted at ≥60% (DOM is hard to test
fully; component tests fill the gap).

---

## 4. Component tests (Vitest Browser Mode)

```bash
pnpm --filter @europa/console test:component
```

Vitest Browser Mode runs in real Chromium. The console's React
components render in a real DOM; the test harness asserts on
the rendered output.

### Scenarios covered

| ID | Test file | What it asserts |
|----|-----------|-----------------|
| Q-B01 | `MapCanvas.test.tsx` | Canvas is mounted; first paint shows the expected cells. |
| Q-B02 | `MapCanvas.test.tsx` | Camera changes (zoom) trigger a redraw. |
| Q-B03 | `MapOverlay.test.tsx` | ARIA grid is rendered with the correct role + cell count. |
| Q-B04 | `MapOverlay.test.tsx` | `aria-label` on a cell includes coordinates + troops + owner. |
| Q-B05 | `Hud.test.tsx` | Connection banner reflects `status`. |
| Q-B06 | `Hud.test.tsx` | Feedback message appears and disappears on TTL. |
| Q-B07 | `SurrenderModal.test.tsx` | Modal opens, confirm sends the order, cancel closes. |
| Q-B08 | `ErrorBoundary.test.tsx` | An uncaught render error is caught; the user sees a fallback. |

---

## 5. End-to-end tests (Playwright)

```bash
pnpm --filter @europa/console test:e2e
```

Playwright boots a real feature 004 server in a fixture, loads
the console in a headless Chromium, and drives input via
`page.click` / `page.keyboard.press`.

### Scenarios covered

| ID | Spec | What it asserts |
|----|------|-----------------|
| Q-E01 | FR-002, US2 | Clicking a region of a cell issues the correct pipe order. |
| Q-E02 | FR-003, US2 | Right-click or Alt+click issues an exclusive pipe order. |
| Q-E03 | FR-004, US2 | `i/j/k/l` keys issue N/W/S/E pipe orders. |
| Q-E04 | FR-004, US2 | `space` clears all pipes. |
| Q-E05 | FR-004, US4 | Pressing `0..9` over a cell issues a setReserves order. |
| Q-E06 | FR-005, US3 | Subcell cursor position issues a paratroop to the correct target cell. |
| Q-E07 | FR-005, US3 | Subcell cursor position issues a gun to the correct target cell. |
| Q-E08 | FR-005, US3 | A subcell position beyond ring 2 is rejected locally (no wire message sent). |
| Q-E09 | FR-006 | A pipe order on an enemy cell is sent and rejected by the server; the console surfaces the rejection. |
| Q-E10 | FR-008, US5 | Disconnecting the WebSocket shows the "Reconnecting…" banner. |
| Q-E11 | FR-008, US5 | Reconnecting within the grace window restores the live view. |
| Q-E12 | FR-009, US5 | Surrender flow: open confirm → confirm → see spectator mode. |
| Q-E13 | SC-002 | 1000 consecutive ticks produce byte-identical `MapView` snapshots. |
| Q-E14 | SC-004 | Original control repertoire is reproducible (parity checklist). |
| Q-E15 | SC-005 | Every order type is issuable with the keyboard only. |

### Accessibility E2E

| ID | What it asserts |
|----|-----------------|
| Q-A01 | `@axe-core/playwright` finds no WCAG 2.2 A or AA violations on the main board screen. |
| Q-A02 | `@axe-core/playwright` finds no violations on the surrender modal. |
| Q-A03 | `@axe-core/playwright` finds no violations on the connection-error modal. |
| Q-A04 | Keyboard-only Tab order visits every interactive region. |
| Q-A05 | Every spec FR is exercisable with the keyboard alone (no mouse). |
| Q-A06 | The focused cell has a visible focus ring with ≥3:1 contrast. |
| Q-A07 | `prefers-reduced-motion` disables combat flashes. |
| Q-A08 | Page is usable at 200% zoom (Ctrl-+) without horizontal scroll on the map. |

---

## 6. Performance test (SC-003, perf budget)

```bash
pnpm --filter @europa/console test:perf
```

This is a Vitest suite (not Playwright) that runs in headless
Chromium via Vitest Browser Mode. It measures:

- `paintFrame(state)` (full Canvas 2D repaint of 1024 cells +
  HUD overlay) under 8 ms.
- `reduce(state, action)` under 1 ms (no DOM, pure JS).
- Initial bundle (gzipped) under 150 KB.
- 1000-tick deterministic replay produces byte-identical
  `MapView` snapshots (SC-002).

The test FAILS the build if any threshold is breached.

---

## 7. Determinism test (SC-002)

```bash
pnpm --filter @europa/console test:determinism
```

Runs the scripted `tests/fixtures/scriptedTick.ts` fixture
(a 1000-tick scripted match with known seed). Asserts:

- The console's `MapView` snapshots after each tick match the
  fixtures byte-for-byte.
- The console's `ConsoleState` after the full sequence matches
  the fixture's recorded `ConsoleState`.

This is the spec's SC-002 ("Rendered output matches the
authoritative PlayerView for 1,000 consecutive ticks in a
scripted match (zero divergence)").

---

## 8. Self-hostable smoke test (constitution Principle VII)

```bash
pnpm --filter @europa/console test:selfhost
```

A small shell script that:

1. Builds the console for production: `pnpm build`.
2. Greps the built bundle for any URL pattern starting with
   `http://` or `https://` (excluding inline SVG namespaces and
   license headers).
3. Fails the build if any match is found.

The test ensures that no remote assets, no telemetry, and no
CDN fallbacks are referenced.

---

## 9. Demo mode (replay loader) — manual

The console ships with a built-in replay player (gated by
`features.replay: true` in `ConsoleConfig`). To load a recorded
match:

```bash
# 1. Generate a replay (requires a match to have been played)
pnpm --filter @europa/console exec tsx scripts/capture-replay.ts \
    --output ./replays/example.json

# 2. Open the console with the replay loader enabled
pnpm --filter @europa/console dev -- --replay ./replays/example.json
```

**Expected behavior**:
- The console renders the recorded PlayerViews in sequence.
- A scrubber UI lets you jump to any tick.
- The transport is paused (no live WebSocket; the replay drives
  the reducer).

This is a v1 QA feature; the visual UI for the replay loader
is in scope for v1 (per `console-api.ts`'s `loadReplay` method)
but the replay capture script is best-effort.

---

## 10. End-to-end validation: full feature flow

This is the "is the console ready to ship" check. Run all of:

```bash
pnpm --filter @europa/console test:unit
pnpm --filter @europa/console test:component
pnpm --filter @europa/console test:e2e
pnpm --filter @europa/console test:perf
pnpm --filter @europa/console test:determinism
pnpm --filter @europa/console test:selfhost
```

If every suite passes and the Vite build succeeds, the
console conforms to its spec and the constitution.

---

## 11. Subcell parity test (against the original)

```bash
pnpm --filter @europa/console test:subcell-parity
```

Compares the console's subcell-to-target mapping against the
original Europa's documented behavior. The fixture file
`tests/fixtures/original-subcell.json` contains a hand-curated
list of `(cursorPx, expectedTarget)` pairs (transcribed from
the original's `controls.html` examples); the test asserts
each one matches.

This catches accidental drift in the subcell targeting math
(spec US3, AC-1 and AC-2).

---

## 12. Common debugging recipes

### "The map is blank"

- Open DevTools → Network. Is the WebSocket connection
  established?
- Open DevTools → Console. Any errors?
- Check the `status` field in the store (via
  `window.__europa_debug.getState().status`). Should be `'live'`.

### "My orders are rejected"

- Open the HUD's "X rejected" panel.
- The `formatRejection(reason)` output is the human-readable
  string for the rejection.
- Common reasons: `out_of_bounds`, `not_owner`, `water_target`,
  `paratroop_range`, `no_source_troops`.

### "Subcell targeting seems off"

- Open the overlay (press `?` to toggle the a11y debug overlay).
- The overlay shows the subcell position of the cursor as
  `(x, y)` in `[0, 1) × [0, 1)`.
- Compare with the binning table in
  `console-types.ts` §"Subcell targeting".

### "Connection drops constantly"

- Check the dev server logs (`ConsoleConfig.logger` output).
- The token might be invalid; try `localStorage.removeItem('qol')`
  and reload.

---

## 13. Acceptance summary

For the console to be considered "ready":

- [ ] All unit tests pass (Q-U01..Q-U10).
- [ ] All component tests pass (Q-B01..Q-B08).
- [ ] All E2E tests pass (Q-E01..Q-E15).
- [ ] All a11y E2E tests pass (Q-A01..Q-A08).
- [ ] Performance thresholds met (Q-P01..Q-P04).
- [ ] Determinism test passes (SC-002, 1000 ticks).
- [ ] Self-hostable smoke test passes (no remote URLs).
- [ ] Subcell parity test passes (vs. original).
- [ ] Manual smoke: 30 minutes of two-player play with no
      crashes, no console errors, no input glitches.

When all 15 E2E + 8 a11y + 10 unit + 8 component tests pass and
the manual smoke is clean, the console is ready for v1.

---

## 14. Validation results appendix (2026-08-23, Phase 8 Polish)

Every Q-* scenario above, mapped to the suite that actually proves
it. Where the shipped implementation diverged from the original
scenario text (e.g., E2E coverage is 7 consolidated US-level specs,
not 15 per-FR specs), the mapping notes the consolidation.

| ID | Proving suite | Result |
| --- | --- | --- |
| Q-C01..Q-C03 | Manual dev-mode smoke; the `?e2e` harness path is covered by the Playwright specs | manual |
| Q-U01..Q-U10 | `pnpm test:unit` — 192 tests: reducer arms + invariants (Q-U01/U02), action→order table (Q-U03), subcell binning (Q-U04), local preflight (Q-U05), MapView derivation (Q-U06), diff flags (Q-U07), rejection formatting (Q-U08), coord round-trip (Q-U09), input-mapping bindings (Q-U10) | PASS |
| Q-B01..Q-B08 | `pnpm test:component` — 25 tests across canvas, grid overlay, HUD, surrender modal, error boundary, minimap, reserves panel, cell view | PASS |
| Q-E01..Q-E15 | `pnpm test:e2e` — 7 Playwright specs consolidating the 15 scenarios by user story (US1–US5 wire-level acceptance incl. parity fixture) plus the selfhost smoke | PASS |
| Q-A01..Q-A08 | `pnpm test:a11y` — 19 axe-core acceptance tests (WCAG 2.2 AA tags, keyboard-only paths, reduced motion, focus visibility) | PASS |
| Q-P01..Q-P04 | `pnpm test:perf` (paint p50 1.8 ms < 8 ms · reduce ~0.2 µs < 1 ms · preflight ~0.3 µs < 0.1 ms) + bundle budget in `test:selfhost` (76,528 B gz < 150 KB over `dist/assets`) | PASS |
| SC-002 determinism | `pnpm test:determinism` — 1000-tick scripted match vs committed golden fixture (`tests/fixtures/golden-1000-tick.json`); zero divergence | PASS |
| SC-004 parity | `pnpm test:parity` vs `tests/fixtures/original-subcell.json` | PASS |
| Constitution VII | remote-URL scan inside `scripts/test-selfhost.sh` | PASS |

§13 checklist status: every automated row green; the only manual
item remaining is the 30-minute two-player smoke (needs the feature
006 ↔ console integration wave).
