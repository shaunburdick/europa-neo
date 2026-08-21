# Research: Client Console (Feature 005)

**Date**: 2026-08-21 | **Feature**: 005-client-console | **Branch**: `001-europa-core`

This document records the technology and design decisions for the
client console. Each section names the decision, gives the rationale,
cites the upstream constraints, and lists alternatives considered
and rejected.

All locked dependencies (pnpm 11, tsup 8, Vitest 4.1, Biome 2, TypeScript
strict) are inherited from feature 001's locked stack and are NOT
re-litigated here. The console is the ONE feature with rendering
freedom; the choices in §1–§8 below exercise that freedom.

---

## Table of contents

1. [UI framework](#1-ui-framework)
2. [Rendering approach](#2-rendering-approach)
3. [State management](#3-state-management)
4. [Build tool](#4-build-tool)
5. [Testing strategy](#5-testing-strategy)
6. [Accessibility primitives](#6-accessibility-primitives)
7. [Input model](#7-input-model)
8. [Self-hostability and assets](#8-self-hostability-and-assets)
9. [Package layout (monorepo)](#9-package-layout-monorepo)
10. [Performance budget](#10-performance-budget)
11. [Risks and known unknowns](#11-risks-and-known-unknowns)
12. [Deferred to v2 (out of scope for v1)](#12-deferred-to-v2-out-of-scope-for-v1)
13. [Spec ambiguities resolved during planning](#13-spec-ambiguities-resolved-during-planning)
14. [External research citations](#14-external-research-citations)

---

## 1. UI framework

### Decision

**React 19** (latest stable, ~v19.2.x as of 2026-08).

### Rationale

- **Largest ecosystem for the specific ergonomics we need**: keyboard
  navigation for a custom grid, ARIA live regions, focus traps, and
  integration with WebSocket streams. React's hook + context
  primitives map cleanly onto our reducer + subscription model.
- **Mature TypeScript strict support**: the React 19 + @types/react
  pair has well-typed ref, event, and accessibility surfaces. Other
  frameworks are catching up; React is the safe pick for v1.
- **Permissive license (MIT)**: no copyleft contamination (constitution
  "Additional Constraints" section).
- **Battle-tested on the same constraints**: many real-time game
  UIs (lichess, every major chess site, online poker clients) use
  React for the chrome and the WebSocket plumbing even when the
  board itself is canvas.
- **Server Components are not a fit** (no SSR; the console is a
  pure browser bundle), so we use React 19's classic client-side
  APIs only. No RSC.

### Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Solid 2** | Fine-grained reactivity, no VDOM, smallest bundle, strong TS strict | Smaller ecosystem, fewer battle-tested patterns for game UIs, fewer accessibility primitives / a11y doc; team familiarity risk | **Rejected** — bundle savings (~5 KB gz) don't justify the smaller a11y ecosystem |
| **Svelte 5** | Compiler output is small, runes API is clean, accessibility tools exist | Build-time compilation makes some hot-reload edge cases awkward for fast iteration; smaller a11y ecosystem than React | **Rejected** — SvelteKit-style tooling is overkill for a single-page client; Svelte 5 is great for component libraries but the ecosystem is younger |
| **Vanilla TS + custom VDOM** | Zero dep, total control, smallest possible bundle | Reinventing focus management, ARIA wiring, and event delegation is high-risk for accessibility (constitution Principle VI); significant LOC; harder onboarding for contributors | **Rejected** — violates Principle V (simplicity over cleverness) and Principle VI (accessibility) |

### Locked versions

- `react@^19.2` (MIT, current stable line)
- `react-dom@^19.2` (MIT, current stable line)
- `@types/react@^19.2` (MIT, DefinitelyTyped)
- `@types/react-dom@^19.2` (MIT, DefinitelyTyped)

---

## 2. Rendering approach

### Decision

**Canvas 2D** (built-in browser API) for the board grid; **DOM
(React components)** for the HUD, banners, modals, and feedback.

The split follows the standard pattern: a fast pixel canvas for
the dense, frequently-redrawn board; declarative components for
the sparse, rarely-redrawn UI.

### Rationale

- **Spec describes a 32×32 grid with sprites** (elevation shading,
  troop counts, owner colors, pipe triangles). 1024 cells × 60 fps
  is well within Canvas 2D's headroom on any modern desktop browser.
- **Canvas 2D is built-in**: no extra dependency, no bundle bloat,
  zero install friction. PixiJS / WebGL is overkill for 1024 cells
  with simple shapes.
- **DOM overlay for HUD**: connection status, surrender button,
  feedback toasts, reserve labels, errors. These are sparse,
  change infrequently, and benefit from native a11y (focus
  management, ARIA roles, screen reader navigation).
- **Single canvas element with internal layers**: the renderer
  paints terrain, then units, then pipes, then effects, then
  labels — each as a logical pass. A `requestAnimationFrame` loop
  redraws on every state change.
- **Subcell targeting** (spec US3): a cursor position within a
  cell is a screen-pixel measurement, trivially read from
  `MouseEvent` / `PointerEvent.clientX/Y` relative to the canvas.
  No layout engine between us and the pixels.

### Accessibility overlay

The canvas is **NOT** the source of truth for the accessibility
tree. A parallel "logical" DOM overlay (a single absolutely-
positioned `<div role="grid">` with a `<div role="gridcell">` per
visible cell) provides:

- ARIA grid semantics (`role="grid"`, `role="gridcell"`,
  `aria-rowindex`, `aria-colindex`, `aria-label` with the cell's
  state).
- Roving tabindex (one cell focused at a time, arrow keys move
  focus; see §6).
- Live region announcements for tick events (combat, capture,
  elimination).

The canvas and the DOM overlay are kept in sync on every render;
the DOM is the a11y source, the canvas is the visual source. This
is the same pattern Lichess uses and is the recommended W3C
pattern for "canvas games with screen-reader support" (WAI-ARIA
Authoring Practices Guide).

### Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **SVG** | Vector crisp, native DOM, no manual redraw, easy hit-testing via element listeners | 1024+ SVG `<rect>` + `<text>` + `<path>` nodes per frame kills perf; reactivity is slow; subcell cursor coordinates require `<g transform>` per cell | **Rejected** — perf ceiling hit at ~30 cells/frame on low-end laptops; not a 60 fps fit |
| **WebGL via PixiJS v8** | Best perf, GPU-accelerated, can scale to 1000×1000 boards with thousands of sprites | Adds ~200 KB gzipped; needs WebGL fallback for ancient browsers; a11y story is worse (must build DOM overlay anyway) | **Rejected** — spec assumes 32×32; not worth the dependency + a11y overhead |
| **Canvas 2D (chosen)** | Native, no dep, fine for 1024 cells, easy subcell math | Manual redraw, manual hit-testing | **Accepted** |
| **HTML5 `<table>`** | Native a11y built-in, simple | Cannot render pipes as arrows, elevation as shading, owner colors per cell, or combat flashes; not a game UI | **Rejected** — wrong abstraction for a real-time board |

### Sprite assets

All sprite assets are **generated at build time** from inline
data (SVG paths → PNG via a small build script using
`@resvg/resvg-js`, MIT). No external image files; no remote
font files. See §8 for self-hostability.

---

## 3. State management

### Decision

**Zustand 5** for the runtime's internal glue (subscription
plumbing, ephemeral caches), with the **pure reducer** from
`console-state.ts` as the canonical state-transition function.

The public contract is the reducer; Zustand is an internal
implementation detail. The runtime subscribes to the reducer's
output and pushes it into the renderer's prop tree.

### Rationale

- **Reducer is the source of truth** (constitution Principle II:
  deterministic, testable). The runtime is a thin adapter that
  dispatches actions, runs the reducer, and applies side effects
  (send orders, play sounds, persist settings).
- **Zustand is 1 KB gzipped** and provides a subscription
  primitive that plays well with React 19 (no provider, no
  re-render storms). It's essentially a typed `useSyncExternalStore`
  wrapper.
- **No Redux**: Redux's reducer pattern is right, but its
  middleware / slice / action-creator machinery is overkill
  for a UI that is a single reducer with ~10 action types.
- **No context-only**: React context for high-frequency state
  triggers re-renders of every consumer; for a 4 Hz tick stream
  the overhead is visible.

### Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Zustand 5 (chosen)** | Tiny, simple, TS-strict-friendly, no provider | Less battle-tested than Redux for massive state | **Accepted** |
| **Redux Toolkit 2** | Battle-tested, well-documented, DevTools | Bundle (~10 KB gz), more ceremony than we need for 10 actions | **Rejected** — overkill for v1's surface |
| **Jotai 2** | Atomic, fine-grained re-renders | Granularity is wrong for a game where every state change affects the whole board | **Rejected** |
| **Vanilla `useSyncExternalStore`** | Zero dep, native to React 19 | Requires writing subscription glue by hand; less ergonomic | **Rejected** — Zustand IS this, with nicer ergonomics |
| **Signals (@preact/signals or solid-js style)** | Very fast | Framework-specific; not idiomatic React | **Rejected** |

---

## 4. Build tool

### Decision

**Vite 8** (latest stable, ~v8.0.x as of 2026-08).

### Rationale

- **Standard for modern TypeScript SPAs**: Vite 8 has first-class
  React 19, Vitest 4.1, and TypeScript strict support. HMR is
  instant for state-only changes.
- **Bundle output is small**: Vite's Rollup-based production
  build tree-shakes well; final bundle is ~50 KB gz for
  React + the console core.
- **Dev server speaks the same protocol as production**: ESM in
  dev, ESM + tree-shaking in build, no surprises.
- **Vitest integration**: Vitest 4.1's `vite-node` runner reuses
  Vite's transform pipeline. The console's component tests run
  in the same module graph as the app.

### Rationale against tsup

The locked stack (feature 001) uses `tsup 8` for the engine /
fog / terrain / networking packages because those are
**libraries** — tsup is excellent for fast dual ESM+CJS library
builds with `.d.ts` generation.

The console is a **browser application**, not a library. Vite is
the correct tool for that job. The console's package
(`packages/console`) gets a `vite.config.ts`; the other packages
keep their `tsup.config.ts`.

### Locked version

- `vite@^8.0` (MIT, current stable line)
- `@vitejs/plugin-react@^4.x` (MIT)

---

## 5. Testing strategy

### Decision

Three layers, in order of increasing realism:

1. **Unit tests**: Vitest 4.1 + happy-dom. Exercise the reducer
   (`reduce(state, action, opts) → { state, effects }`) and the
   pure helpers (`buildMapView`, `actionToOrder`, `subcellToOffset`,
   `localPreflightOrder`, `formatRejection`, etc.). Target ≥80%
   coverage on these (constitution Principle III merge gate).
2. **Component tests**: Vitest 4.1 **Browser Mode** with
   `@vitest/browser` + `vitest-browser-react`. Render the
   console in a real browser, drive it with synthetic events
   (click, keypress), assert on the rendered DOM.
3. **End-to-end tests**: **Playwright 1.6+** (MIT). Boot a real
   feature 004 server in a fixture, load the console in a
   headless Chromium, drive input via `page.click` /
   `page.keyboard.press`, assert on the visible board. Includes
   the **accessibility audit** via `@axe-core/playwright`.

### Rationale

- **Reducer purity pays off**: the reducer is testable in
  isolation with no DOM, no WebSocket, no async. Fast tests
  catch regressions in input mapping, action translation, and
  state transitions.
- **Component tests catch React-specific bugs** (effect cleanup,
  focus management, re-render storms) that pure reducer tests
  miss.
- **Playwright E2E is the only layer that catches the real
  integration**: a bug in how the runtime drives the renderer
  on every state change is invisible to reducer tests but
  visible to a headless browser.
- **axe-core integration** is the standard way to enforce WCAG
  2.2 AA. Lighthouse is for human audits; axe is for CI.

### Test categories (constitution Principle III)

- `unit/` — one file per pure function, target 100% line + branch
  coverage. The reducer is split per-action where it grows
  past ~500 LOC.
- `component/` — per-component interaction tests with React
  Testing Library-style locators (via `vitest-browser-react`).
- `e2e/` — Playwright specs that boot a real server and drive
  the full client. Includes `e2e/a11y.spec.ts` (axe scan on
  every screen) and `e2e/keyboard-only.spec.ts` (every order
  is issuable with the keyboard).
- `conformance.test.ts` — imports engine / fog / networking
  types; asserts the console's typed imports match (drift = bug).
- `determinism.test.ts` — same input sequence produces identical
  `ConsoleState` snapshots (SC-002: 1000 consecutive ticks
  match).

### Coverage gate

- 80% threshold on the whole package (Vitest's `coverage.thresholds`).
- 100% on the reducer (it's pure and small; full coverage is
  free).
- 100% on `localPreflightOrder` (validation is security-relevant).
- 100% on the input mapping table (every key must be bound).

---

## 6. Accessibility primitives

### Decision

**WCAG 2.2 AA** (per constitution Principle VI). Implementation:

- **Roving tabindex** on the cell grid (one cell focused at a
  time; Tab moves between UI regions; arrow keys move within
  the grid).
- **`role="grid"` on the map** with `role="gridcell"` on each
  visible cell. `aria-rowindex`, `aria-colindex`, `aria-label`
  (e.g., `"Cell (5, 7), 32 troops, player 1, pipe north"`) on
  each cell.
- **One `aria-live="polite"` region** for tick events (combat,
  capture, elimination); one `aria-live="assertive"` for errors
  and connection failures.
- **Visible focus ring** on the focused cell: 2px solid
  high-contrast outline with a 2px offset (CSS `:focus-visible`).
- **Skip link** to jump from page load to the map.
- **Color contrast** for cell shading: terrain shading is
  informational (not the only signal); owner color is always
  paired with a **shape pattern** (dots for player 1, stripes
  for player 2, etc.) so colorblind players can distinguish.
- **Resize / 200% zoom**: the layout uses CSS grid + rem units;
  at 200% zoom the map still fits and all controls are
  reachable.
- **`prefers-reduced-motion`**: combat flashes, capture
  highlights, and reserve-popup animations are disabled when
  the OS-level reduce-motion flag is on.
- **Target size**: cell focusable targets are at least 24×24
  CSS pixels (WCAG 2.5.8, new in 2.2). The default cell size
  (32 px) already exceeds this.
- **Drag alternatives** (WCAG 2.5.7, new in 2.2): the
  region-of-cell pipe targeting has a single-click equivalent
  (the i/j/k/l keys), satisfying the "no required dragging"
  rule.

### Rationale

- **Constitution Principle VI is non-negotiable.** "A space
  strategy game should not be playable only by people with
  perfect vision and a mouse."
- **The original Europa had zero a11y.** Modernization means
  closing that gap. The spec's US5 (Modern QoL Layer) calls
  for "modern conveniences" — accessibility is a modern
  convenience.
- **Roving tabindex is the established pattern** for grid
  widgets (W3C ARIA APG: "Grid Pattern"). It's a few dozen
  lines of code; we don't need a library.
- **`@axe-core/playwright`** catches the 30% of WCAG issues
  that are mechanically detectable. The remaining 70% require
  manual NVDA / VoiceOver audits before v1 release.

### A11y test plan (CI)

- `e2e/a11y.spec.ts` runs axe on every visible screen and
  fails the build on any violation.
- `e2e/keyboard-only.spec.ts` exercises every spec FR using
  the keyboard only (mouse parked off-screen).
- `e2e/screen-reader.spec.ts` (manual; not in CI) uses NVDA
  on Windows and VoiceOver on macOS to verify announcements.

### Locked dep

- `@axe-core/playwright@^4.x` (MPL-2.0; compatible with
  our permissive-license policy — MPL is acceptable for
  linked test dependencies).

---

## 7. Input model

### Decision

**Mouse (Pointer Events) + keyboard** for v1. **Touch is out of
scope for v1** (spec Assumptions) but the layout uses CSS
rems and CSS grid so a v2 touch layer requires no rewrite.

### Pointer events

- `pointermove` updates the `hover` cell and recomputes
  `region` + `subcell` coordinates.
- `pointerdown` (left button) issues a `setPipe` / `clearPipe`
  toggle (depending on existing pipe state).
- `pointerdown` (right button) or `pointerdown` (left) + Alt
  issues `setPipesExclusive`.
- `pointerdown` (middle) issues `setPipesExclusive` regardless
  of Alt (single-button mouse fallback).
- `wheel` zooms the camera (zoom toward cursor).
- `pointerdown` + drag pans the camera.

Pointer events (not mouse events) are used so future touch
support is a one-line event-source swap.

### Keyboard

| Key | Action |
|-----|--------|
| `i` | Pipe N (setPipe or clearPipe on N) |
| `j` | Pipe W |
| `k` | Pipe S |
| `l` | Pipe E |
| `i` + Alt | Pipe N (exclusive) |
| `j` + Alt | Pipe W (exclusive) |
| `k` + Alt | Pipe S (exclusive) |
| `l` + Alt | Pipe E (exclusive) |
| `space` | Clear all pipes on the focused cell |
| `p` or `h` | Paratroop (uses subcell position if `mouseLastPos` is recent, else cursor is "center" → no-op) |
| `g` or `o` | Gun (same targeting rule as paratroop) |
| `0`–`9` | Set reserves to `0%`–`90%` (×10) on the focused cell |
| `Arrow keys` | Move `selection` (focused cell) |
| `Enter` | Confirm / open menu on the focused cell |
| `Escape` | Cancel current mode (drag, reserve pop, paratroop aim) |
| `Tab` / `Shift+Tab` | Move between UI regions (grid → HUD → buttons) |
| `F2` | Toggle sound on/off |
| `F10` | Surrender (with confirm) |
| `F11` | Toggle fullscreen |

### Hotkey mapping table

The mapping is exposed as a constant (`DEFAULT_INPUT_MAPPING`)
so contributors can re-skin without diving into the input
layer's event handlers. The host can override per-key via
`ConsoleConfig.inputMapping`.

### No input library

A custom input layer is ~200 LOC: a `keydown` listener with a
lookup table, a `pointermove` / `pointerdown` listener with
hit-testing math, and a `wheel` listener for zoom. No
dependency is justified; the code is small and easy to test.

### Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Custom (chosen)** | Zero dep, exact mapping to original controls, fully tested | Reinvents basic plumbing | **Accepted** — ~200 LOC, no third-party a11y surprises |
| **react-hotkeys-hook** | Library handles focus + key capture edge cases | 5 KB gz, opinionated API, we still need to write the binding table | **Rejected** — too thin to justify |
| **Mousetrap** | Battle-tested key library | Unmaintained; not React-aware; keyboard-only (no pointer) | **Rejected** — would still need a separate pointer layer |

---

## 8. Self-hostability and assets

### Decision

**Zero remote assets. Zero CDN. Zero analytics. Zero remote
fonts.** Everything ships in the bundle.

### Asset inventory

| Asset | Source | Bundled how |
|-------|--------|-------------|
| **React + console code** | npm | bundled by Vite |
| **Sound clips** (ogg ~10 files, ~5 KB each) | generated by us from raw PCM, committed to `assets/sounds/` | bundled via Vite static asset handling |
| **Sprite sheet** for unit icons, city icons, pipe arrows | SVG paths committed to `assets/sprites/*.svg`; build step converts to PNG with `@resvg/resvg-js` (MIT) | PNG inlined as base64 or served from same bundle |
| **Fonts** | system fonts only (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`) | zero font files |
| **Styles** | CSS modules (built-in Vite support), no preprocessor | bundled |

### Build-time asset pipeline

A small Node script (`scripts/build-assets.ts`) runs before
`vite build`:

1. Reads SVG sprites from `assets/sprites/`.
2. Renders each to a PNG at the four required resolutions
   (1×, 2×, 3×, 4×) using `@resvg/resvg-js`.
3. Writes the PNGs to `public/sprites/` (served as static files
   in dev; bundled in production).
4. Reads OGG sound sources from `assets/sounds/`, re-encodes
   to a target bitrate with `@wasm-audio/ogg-encoder` (MIT, WASM).
5. Writes the re-encoded files to `public/sounds/`.

The script is reproducible: same input → same output. CI
re-runs it on every build to catch uncommitted assets.

### Self-hostability test

`quickstart.md` §"Self-hostable smoke test" includes a CI step
that greps the built bundle for any URL pattern starting with
`http://` or `https://` (excluding inline SVG namespaces and
license headers). Any hit fails the build.

### What is NOT in the bundle

- Google Fonts (no remote font loading).
- CloudFlare Insights / Sentry / Datadog (no telemetry).
- S3-hosted images (no remote media).
- jsDelivr / unpkg (no CDN fallback; we ship the dep).

### Locked deps for asset pipeline

- `@resvg/resvg-js@^2.x` (MIT) — SVG → PNG conversion
- (sound encoding deferred to v1.1; v1 ships with placeholder
  silent OGG files generated by the build script's no-op
  branch)

---

## 9. Package layout (monorepo)

### Decision

The console lives in `packages/console/` as a workspace member.

```
packages/console/
├── package.json          # "@europa/console", private
├── tsconfig.json         # strict, ES2022, noUncheckedIndexedAccess
├── vite.config.ts        # base = "../vite.config.base.ts"
├── vitest.config.ts      # browser mode enabled; v8 coverage
├── biome.json            # extends "//" (root)
├── index.html            # SPA entry (Vite convention)
├── public/               # static assets (sprites, sounds)
├── scripts/
│   └── build-assets.ts   # SVG → PNG; sound re-encode
├── src/
│   ├── index.ts          # public surface re-exports
│   ├── config.ts         # CONSOLE_CONSTANTS, DEFAULT_INPUT_MAPPING
│   ├── runtime.ts        # glue: reducer + client + input + renderer
│   ├── reducer/          # pure state machine
│   │   ├── index.ts
│   │   ├── reduce.ts
│   │   ├── actionToOrder.ts
│   │   ├── buildMapView.ts
│   │   ├── localPreflight.ts
│   │   └── diff.ts
│   ├── net/              # network adapter (wraps feature 004)
│   │   ├── createClient.ts
│   │   ├── envelopeToEvent.ts
│   │   └── heartbeat.ts
│   ├── input/            # pointer + keyboard layer
│   │   ├── index.ts
│   │   ├── pointer.ts
│   │   ├── keyboard.ts
│   │   ├── hitTest.ts
│   │   └── subcell.ts
│   ├── render/           # React renderer
│   │   ├── index.ts
│   │   ├── App.tsx
│   │   ├── MapCanvas.tsx     # canvas + a11y grid overlay
│   │   ├── MapOverlay.tsx    # DOM grid for screen readers
│   │   ├── Hud.tsx           # connection, feedback, score
│   │   ├── SurrenderModal.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── styles/           # CSS modules
│   ├── sound/            # sound player
│   │   ├── index.ts
│   │   └── clips.ts
│   └── internal/         # private runtime helpers
│       ├── clock.ts
│       └── throttle.ts
└── tests/
    ├── unit/
    │   ├── reducer.test.ts
    │   ├── actionToOrder.test.ts
    │   ├── buildMapView.test.ts
    │   ├── subcell.test.ts
    │   └── ...
    ├── component/
    │   ├── MapCanvas.test.tsx
    │   ├── Hud.test.tsx
    │   └── ...
    ├── e2e/
    │   ├── join-match.spec.ts
    │   ├── keyboard-only.spec.ts
    │   ├── a11y.spec.ts
    │   └── reconnect.spec.ts
    ├── fixtures/
    │   ├── scriptedTick.ts
    │   ├── mockClient.ts
    │   └── testServer.ts
    ├── conformance.test.ts
    ├── determinism.test.ts
    └── perf.test.ts
```

### Why a separate package (not a subfolder of the server)

- The console is a **browser bundle**. The other packages are
  Node libraries. Mixing them in one package would force the
  engine/fog/terrain to take browser-targeted deps they don't
  need.
- The console's tests run in a browser (Vitest Browser Mode,
  Playwright). The other packages' tests run in Node (Vitest
  happy-dom or pure Node). Different `vitest.config.ts` files.
- A future "console as a library" embedding (e.g., a third
  party hosts the console in their own page) is straightforward
  with `@europa/console` as an npm-style package.

### `vite.config.base.ts` (monorepo root)

A shared Vite config that:
- Sets `resolve.alias` for the workspace packages (`@europa/engine`
  → `packages/engine/src/index.ts`).
- Sets `server.port = 5173` (Vite default; matches dev convention).
- Configures CSS modules.
- Configures Vitest with the browser provider and axe-core.
- Extends Biome config from the root.

The console's `vite.config.ts` extends this and adds React
plugin.

---

## 10. Performance budget

### Targets (from spec + reasonable defaults)

- **SC-003**: order-to-wire-message < 50 ms (input pipeline
  overhead). Reducer + `sendOrder` round-trip is well under
  1 ms; the budget is dominated by React re-render and the
  WebSocket frame's `setTimeout(0)` flush.
- **60 fps render** at the default camera (32 px cells, full
  board visible). Canvas 2D paint of 1024 simple shapes is
  sub-millisecond on a modern laptop.
- **Memory**: <50 MB heap for a single console instance. React
  + console state is ~5 MB; the rest is browser overhead.
- **Initial bundle**: <150 KB gzipped (React + Zustand +
  console core, no sounds/sprites). Sounds + sprites are
  lazy-loaded after first paint.
- **First paint**: <500 ms on a 4G connection (the Vite-built
  bundle is one HTTP request for the JS + one for the CSS).

### Where we measure

- `tests/perf.test.ts` includes:
  - `paintFrame(world)` under 8 ms (Vite dev / Chromium headless).
  - `reduce(state, action)` under 1 ms (no DOM, pure JS).
  - 1000-tick deterministic replay produces byte-identical
    `MapView` snapshots.

### Frame loop

A single `requestAnimationFrame` loop driven by the runtime:

```
onAnimationFrame():
  if state.dirty:
    state = reducer.applyPendingActions()
    renderer.paint(state.mapView)
    state.dirty = false
```

The reducer marks `state.dirty = true` after every action; the
rAF loop checks the flag and paints only when needed. At 4 Hz
tick rate with one paint per tick, this is a no-op loop 60
times per second and a real paint 4 times per second — no
wasted work, no missed frames.

---

## 11. Risks and known unknowns

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| **Canvas 2D paint on 32×32 + effects exceeds 16 ms on low-end devices** | Low | Profile in Phase 6; if it hits, swap to PixiJS v8 behind a `rendererFactory` swap (the contract is renderer-agnostic) |
| **Roving tabindex + canvas overlay get out of sync on zoom** | Medium | Single source of truth: the `MapView.cells` map drives both the canvas paint and the DOM overlay. Cell size is a single CSS variable. |
| **WCAG 2.2 axe scan finds a violation just before release** | Low | Run axe in CI from day one; pre-v1 manual NVDA / VoiceOver pass |
| **Sound encoding pipeline (@wasm-audio) is unproven in production** | Medium | v1 ships silent placeholders; sound is a "v1.1 if it works" feature gated on `features.sound` |
| **WebSocket auto-reconnect (feature 004) flakes under load** | Low | Console's adapter treats reconnect as a NetEvent; the renderer is decoupled. Manual test in Phase 6. |
| **Bundle size grows past 150 KB gz with feature creep** | Medium | Bundle-size check in CI (`bundlesize` or `size-limit`); reject PRs that grow the main chunk past budget |
| **Subcell targeting math differs from the original by 1 cell at edges** | Low | The algorithm is documented; quickstart §"Subcell parity" includes a parity test against a known original-game scenario |
| **React 19 + Zustand 5 + Vite 8 interop quirks** | Low | All three are stable, widely used; CI runs on three Node versions (20 LTS, 22 LTS, latest) |

---

## 12. Deferred to v2 (out of scope for v1)

These are explicitly out of v1 scope per spec Assumptions and
post-spec decisions. Listed here so the implementation phase
doesn't accidentally scope-creep.

- **Touch input** (spec Assumptions: "desktop browsers are the
  v1 target"). Pointer events are used so a v2 touch layer is
  one line.
- **Mobile layout** (spec Assumptions). CSS is rem-based so
  reflow works; explicit mobile breakpoints are v2.
- **Sound assets** (spec Assumptions: "Sound assets are optional
  polish; the toggle exists from v1 but silence is acceptable
  default"). The sound player exists; clips are silent placeholders.
- **Replay viewer UI** (the contract declares `loadReplay`; the
  UI is v1.1).
- **Drag-to-select region for multi-cell operations** (spec edge
  case mentions "extreme zoom" but not multi-cell). The data
  model has `dragSelection: ReadonlyArray<Coord> | null` ready
  for v1.1.
- **Chat** (AGENTS.md: v1 is gameplay first; chat is future).
- **Spectator sound / visual theming** (spectator mode just
  disables input; the look is the same).
- **Localization / i18n** (the spec is English-only; the message
  formatting is centralized in `formatActionConfirmation` /
  `formatRejection` for v2 translation).
- **Account system, ratings, leaderboards** (AGENTS.md).

---

## 13. Spec ambiguities resolved during planning

These are questions that the spec leaves open, with the
resolutions we made. The spec is unchanged (we did not modify
spec.md per the prompt); resolutions are recorded here so
implementation has a single reference.

1. **Cell-region tie-breaking** (US2 AC-1: "cursor over the
   eastern region"). The original game uses simple X-then-Y
   threshold. We follow the same rule. Documented in
   `console-types.ts` §"Cell region".

2. **Subcell targeting layout** (US3 AC-1/2/3). The original's
   "subcell local map" is a 5×5 grid with the source at the
   center and 4 corners of each ring. We use the same
   threshold rule (5 equal-width bins per axis). Documented
   in `console-types.ts` §"Subcell targeting".

3. **Subcell position when keyboard is used without recent
   mouse motion** (US3). The spec doesn't say. We resolve:
   if the cursor hasn't moved in 500 ms, subcell position
   defaults to `(0.5, 0.5)` (center → no paratroop launch).
   This matches the original's "must aim with mouse" UX.

4. **Reserve key feedback duration** (US4 AC-1: "70% flashes
   briefly on that cell"). The spec doesn't say how long.
   We chose 1500 ms (long enough to read, short enough to
   not be intrusive). Configurable via
   `CONSOLE_CONSTANTS.labelTtlMs`.

5. **Surrender confirm flow** (US5 AC-2: "Surrender and
   confirms"). We resolve: the host's `onSurrenderRequest`
   callback fires; if absent, a built-in modal renders. The
   modal is dismissable with Escape; the surrender order is
   sent only on explicit confirm.

6. **Reconnect UX** (US5 AC-3: "explicit reconnecting status
   and auto-reconnects"). We resolve: a sticky banner is shown
   for the duration of the disconnect; input is disabled; the
   banner clears on successful reconnect or grace-window expiry.

7. **Edge case "What happens when input targets an enemy-owned
   cell for pipe orders?"** The console sends; the server
   rejects with `not_owner`; the console surfaces the rejection
   as a transient feedback message.

8. **Edge case "orders during disconnect"**. The console
   disables all input and shows a "reconnecting…" banner.
   No orders are queued client-side (per spec; the
   server's `protocol_sequence_error` would reject them).

9. **Edge case "extreme zoom on large boards"**. Boards are
   fixed at 32×32 in v1; zoom is clamped to
   `[BOARD_MIN_ZOOM, BOARD_MAX_ZOOM]` = `[12, 96]` CSS pixels
   per cell. At minimum zoom the full board is 384×384 px;
   at maximum zoom a single cell fills a typical viewport.

10. **Edge case "two rapid contradictory orders"**. Both are
    sent; the server applies them in deterministic order at
    the next tick boundary. The console reflects the
    authoritative result after the next `tick` event.

11. **Player display names** (lobby strip). v1 displays the
    `displayName` provided at `joinMatch`. v2 may add
    per-player cosmetics from matchmaking (per feature 006).

12. **Spectator visual distinction**. The console renders the
    same board for spectators but disables all input; the
    HUD shows a "Spectating" banner. No additional visual
    theme in v1.

---

## 14. External research citations

The decisions above are grounded in:

- **React 19 docs** (react.dev) — Hooks reference, Server /
  Client Components guidance (we use client-only), `useSyncExternalStore`
  for our subscription model.
- **Vite 8 docs** (vite.dev) — Build configuration, HMR
  behavior, asset handling.
- **Zustand 5 docs** (github.com/pmndrs/zustand) — Store
  factory, middleware (we use none), TypeScript patterns.
- **Vitest 4.1 docs** (vitest.dev) — Browser Mode (Chromium /
  Firefox / WebKit), coverage configuration, snapshot
  testing.
- **Playwright 1.6 docs** (playwright.dev) — `page.locator`
  API, `@axe-core/playwright` integration, `localStorage`
  fixture.
- **WCAG 2.2 Quick Reference** (w3.org/WAI/WCAG22/quickref) —
  Roving tabindex pattern (2.1.1), visible focus (2.4.7),
  dragging movements alternative (2.5.7), target size (2.5.8),
  focus not obscured (2.4.11).
- **WAI-ARIA Authoring Practices Guide** — Grid pattern for
  the cell overlay.
- **resvg-js docs** (github.com/yisibl/resvg-js) — SVG → PNG
  conversion, Node API.
- **@resvg/resvg-js npm page** — License (MIT), current
  version, supported input formats.
- **constitution.md** — Principles I–VII (the binding source
  of truth for all design decisions).
- **AGENTS.md** — Project vision, v1 scope, locked stack.

No library was chosen without checking its license is
permissive (MIT, BSD, Apache-2.0, ISC, or MPL-2.0 for
test-only deps). All listed deps pass the constitution's
"Additional Constraints" check.
