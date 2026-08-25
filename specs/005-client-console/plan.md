# Implementation Plan: Client Console (Feature 005)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: [`specs/005-client-console/spec.md`](./spec.md)

**Input**: Feature specification from `specs/005-client-console/spec.md` — the player-facing browser client that renders the fog-filtered satellite view, accepts all original order types (region-based pipes, exclusive pipes, i/j/k/l + space + 0-9 + p/h/g/o), and layers modern QoL (zoom/pan, status, surrender, reconnect, replay).

**Note**: This plan was produced by following the `/speckit.plan` workflow. The branch is `001-europa-core` (the repo's per-delivery branch — AGENTS.md "do not relitigate"; the spec-kit default of `git checkout -b 005-client-console` was deliberately skipped, matching the precedent set by features 001, 002, 003, 004). All artifacts for this feature live under `specs/005-client-console/`.

---

## Summary

The Client Console is the **player-facing UI** for Europa Neo. It is a browser SPA that:

1. **Renders** the per-tick `PlayerView` (fog-filtered) produced by feature 002 on top of the engine's static `Board` (feature 003) for the initial paint.
2. **Accepts input** via mouse (region-based targeting) + keyboard (the original Europa control set: i/j/k/l, space, p/h, g/o, 0-9) and translates gestures into engine `Order`s.
3. **Transports** the orders to the server via feature 004's `MatchClient` and surfaces order-ack feedback (sent / rejected) in the HUD.
4. **Modernizes** the original with zoom/pan, connection status, surrender flow, accessibility (WCAG 2.2 AA), and a self-hostable build with no remote dependencies.

The package is `packages/console` (re-exported as `@europa/console`), built with the **locked stack from feature 001** for everything except the bundler — the console uses **Vite 8** because it is a browser app, not a library. The console depends on `@europa/engine`, `@europa/fog`, `@europa/terrain`, and `@europa/networking` for canonical types and pure functions; no additive changes to those packages are required (the console is a leaf consumer per data-model §16).

The console is the **only feature with rendering freedom** (per AGENTS.md binding decision 3). This plan exercises that freedom to choose **React 19 + Canvas 2D + Zustand 5 + Vite 8** with full rationale in `research.md` §1–§4.

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (matches engine + fog + terrain + networking). Targets browser ES2022 (per the locked stack).

**Primary Dependencies** (console-only direct deps; engine/fog/terrain/networking are workspace deps):

- `react@^19.2` (MIT) — UI framework. See `research.md` §1.
- `react-dom@^19.2` (MIT) — React DOM renderer.
- `zustand@^5.0` (MIT) — internal subscription glue. See `research.md` §3.
- `vite@^8.0` (MIT) — build tool + dev server. See `research.md` §4.
- `@vitejs/plugin-react@^4.x` (MIT) — React Fast Refresh.
- `@types/react@^19.2` (MIT) — TypeScript declarations.
- `@types/react-dom@^19.2` (MIT) — TypeScript declarations.
- `@vitest/browser@^4.1` (MIT) — component tests in a real browser.
- `vitest-browser-react@^4.x` (MIT) — React-specific locators for Vitest Browser Mode.
- `@axe-core/playwright@^4.x` (MPL-2.0; test-only) — automated a11y scans.
- `@playwright/test@^1.6` (Apache-2.0) — E2E framework.
- `happy-dom@^15.x` (MIT) — fast DOM for unit tests.
- `@resvg/resvg-js@^2.x` (MIT) — SVG → PNG conversion in the asset build script.

**No CDN-loaded deps, no analytics, no remote fonts.** Every asset ships in the bundle (constitution Principle VII). See `research.md` §8 for the full asset inventory.

**Workspace deps** (inherited from feature 001's locked stack):

- `@europa/engine` (workspace:*) — `World`, `CellView`, `Coord`, `Direction`, `Order`, `ReservesPct`, `PlayerId`, `TickEvents`, `ValidationError`, `MatchConfig`.
- `@europa/fog` (workspace:*) — `PlayerView`.
- `@europa/terrain` (workspace:*) — `Board`, `Cell` (type-only; used for the initial paint).
- `@europa/networking` (workspace:*) — `ConnectionState`, `SessionToken`, `MatchId`, `ErrorCode`, `SequenceNumber`, `MatchClient`.

**Storage**: None in the console. The host (the page that embeds the console) is responsible for persisting QoL settings (`localStorage` is the default; the host may use any store). Reconnect tokens are surfaced via `console.getSessionToken()` and the host persists them. No cookies; no IndexedDB.

**Testing**: Three layers per `research.md` §5:

- **Unit**: Vitest 4.1 with happy-dom. Reducer + pure helpers. Target 100% on the reducer, 80%+ on the package.
- **Component**: Vitest 4.1 Browser Mode + `vitest-browser-react`. React components in a real Chromium.
- **E2E**: Playwright 1.6+ with `@axe-core/playwright`. Full console + real feature 004 server.

Coverage threshold: 80% lines / 80% functions / 80% branches / 80% statements (Vitest's v8 provider). Higher for security-relevant modules (100% on `localPreflightOrder`, 100% on the input mapping table).

**Target Platform**: Modern desktop browsers (Chrome 120+, Firefox 120+, Safari 17+, Edge 120+). ES2022 features (`?.`, `??`, `Object.hasOwn`, top-level `await`) are baseline. No IE / legacy support. Mobile / touch is v2 (per spec Assumptions); the layout uses CSS rems and CSS grid so v2 is a reflow, not a rewrite.

**Project Type**: Browser SPA within a pnpm-workspaces monorepo. The console is a `private` workspace member that imports the engine / fog / terrain / networking packages. It has its own `vite.config.ts` and `vitest.config.ts` (different from the other packages' `tsup.config.ts` and `vitest.config.ts`).

**Performance Goals**:

- **SC-003**: order-to-wire-message < 50 ms (input pipeline overhead). Reducer + `sendOrder` round-trip is sub-ms; budget covers React re-render and WebSocket flush.
- **60 fps render** at default camera (32 px cells, full board visible). Canvas 2D paint of 1024 simple shapes is sub-millisecond.
- **Memory**: <50 MB heap for a single console instance.
- **Initial bundle**: <150 KB gzipped (React + Zustand + console core). Sounds and sprites are lazy-loaded after first paint.
- **First paint**: <500 ms on a 4G connection.

**Constraints**:

- **Server-authoritative** (spec FR-011; constitution Principle II): the console NEVER simulates. It only renders the server's `PlayerView` and sends orders.
- **≥80% coverage** on game logic (constitution Principle III). Note: the console is mostly UI; "game logic" here means the reducer + the order-translation logic.
- **No `any` types; no lint suppressions** (constitution Principles I + code-quality skill).
- **WCAG 2.2 AA** (constitution Principle VI): keyboard navigable, screen-reader friendly, visible focus, sufficient contrast.
- **Self-hostable by default** (constitution Principle VII): no CDN, no analytics, all assets bundled, no remote fonts.
- **TypeScript strict** (constitution Principle I): no `any`, no `@ts-ignore`, no `@ts-nocheck`.
- **Bundle discipline**: feature 004's `ws`-equivalent (`MatchClient`) is reused; no parallel transport.
- **Hot-module replacement** in dev: Vite HMR is configured for state changes; full reload on contract changes.

**Scale/Scope**:

- New package: `packages/console` (~1500–2500 LOC of code + tests).
- 2-player matches in v1 (AGENTS.md binding decision 5); engine supports 2–4.
- 32×32 board default; terrain generator produces 32×32 in v1.
- One console instance per browser tab; no multi-tab sync.
- A single embedded console per page (no `<iframe>` multi-instance).

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-evaluated after Phase 1 design.*

### Principle I — Type Safety First

| Gate | Status |
|------|--------|
| TS `strict: true` in `packages/console/tsconfig.json` | ✅ Planned (inherits root tsconfig) |
| Zero `any` types in `src/` | ✅ Enforced by Biome `noExplicitAny` + code review |
| No `@ts-ignore` / `@ts-nocheck` / `eslint-disable` | ✅ Enforced by Biome; no suppressions ever |
| Every public function has doc comment (JSDoc) | ✅ Convention enforced in PR review |
| Branded primitives (`MapViewId`, `ActionId`, `CellRegion`) prevent type confusion | ✅ Declared in `console-types.ts` |
| Conformance test catches upstream drift | ✅ Planned (`tests/conformance.test.ts`) |
| `@types/react` and `@types/react-dom` provide types for React 19 | ✅ Direct devDependency |

**Verdict**: ✅ passes. The console extends the engine's type discipline with branded primitives for UI-internal concepts.

### Principle II — Server-Authoritative Deterministic Simulation

| Gate | Status |
|------|--------|
| Server is the source of truth for game state | ✅ Architectural — console receives authoritative `PlayerView`, never computes state |
| Console renders state and submits orders only | ✅ Spec FR-011 enforced; orders validated by the engine before staging |
| Console NEVER simulates | ✅ Reducer has zero physics / game-rule code; `localPreflightOrder` is a static check against the latest `PlayerView` only |
| Tick rendering is pure given the same `PlayerView` | ✅ `buildMapView` is a pure function; the paint loop reads from `MapView` only |
| No `Math.random()` in `src/` | ✅ The reducer uses no randomness; any UX randomness (e.g., sound delay) is opt-in and behind a feature flag |
| Tick monotonicity is enforced | ✅ Reducer drops out-of-order ticks; test covers this |
| Server's `OrderAck` is the tiebreaker for validation | ✅ `localPreflightOrder` is a UX nicety, not a correctness gate (spec FR-006) |
| Reconnect resync = fresh `PlayerView` from the server | ✅ Adapter's `reconnected` NetEvent triggers a full re-paint |

**Verdict**: ✅ passes. The console is a leaf consumer; no game state lives in the console.

### Principle III — Tested Game Logic (≥80% coverage)

| Gate | Status |
|------|--------|
| Reducer (pure) tested with 100% line + branch coverage | ✅ Planned (`tests/unit/reducer.test.ts` + per-action files) |
| Input mapping table tested with 100% coverage | ✅ Planned (`tests/unit/inputMapping.test.ts`) |
| `localPreflightOrder` tested with 100% coverage (security-relevant) | ✅ Planned (`tests/unit/localPreflight.test.ts`) |
| Subcell targeting math tested with 100% coverage + parity vs. original | ✅ Planned (`tests/unit/subcell.test.ts` + `tests/e2e/subcell-parity.test.ts`) |
| Each module = one file + one test file | ✅ Planned (`src/{reducer,net,input,render,sound}/` + matching `tests/`) |
| Coverage gate 80% enforced in CI | ✅ Vitest coverage thresholds in `vitest.config.ts` |
| Determinism test exists | ✅ Planned (`tests/determinism.test.ts` — SC-002 1000-tick zero divergence) |
| Conformance test exists | ✅ Planned (`tests/conformance.test.ts` — engine/fog/networking shape match) |
| Every spec FR has a corresponding acceptance test | ✅ Mapped in `quickstart.md` (Q-E01..Q-E15, Q-A01..Q-A08) |
| Edge cases covered: enemy cell order, disconnect input, subcell beyond range, rapid contradictory orders, surrender, reconnect | ✅ Planned (Q-E09, Q-E10, Q-E08, Q-E15, Q-E12, Q-E11) |
| 1000-tick scripted match (SC-002) | ✅ Planned (`tests/determinism.test.ts` + `quickstart.md` §7) |
| Performance smoke test (SC-003 + paint budget) | ✅ Planned (`tests/perf.test.ts`) |

**Verdict**: ✅ passes. The console is highly testable (pure reducer, pure `MapView` builder, dependency injection via `ConsoleDeps`).

### Principle IV — Specs as Documentation

| Gate | Status |
|------|--------|
| Spec is authoritative for console behavior | ✅ Plan references spec FRs by number |
| Code comments explain "why"; types/docs explain "what" | ✅ JSDoc on every public function |
| Behavior changes ship in same change set as spec updates | ✅ Constitution + AGENTS.md mandate this; CI enforces via PR description |
| `contracts/` folder makes the public surface discoverable | ✅ Four `.ts` files (`console-types.ts`, `console-state.ts`, `console-to-networking.ts`, `console-api.ts`) |
| `data-model.md` documents UI entities | ✅ Written; this plan's data-model section is a one-stop reference |
| `README.md` documents the Console API with a runnable example | ✅ Planned in `packages/console/README.md` |
| `quickstart.md` is runnable | ✅ Written; every scenario has a real command |

**Verdict**: ✅ passes.

### Principle V — Simplicity Over Cleverness

| Gate | Status |
|------|--------|
| Each subsystem = one file, one responsibility | ✅ `reducer/`, `net/`, `input/`, `render/`, `sound/` — each in its own directory |
| Pure functions over classes for hot-path logic | ✅ Reducer is a pure function; `MapView` builder is a pure function; the runtime is a thin glue layer |
| Standard React 19 over Solid/Svelte | ✅ Justified in `research.md` §1 (largest a11y ecosystem) |
| Canvas 2D over WebGL/SVG | ✅ Justified in `research.md` §2 (32×32 is well within Canvas 2D's budget) |
| Zustand 5 over Redux Toolkit 2 | ✅ Justified in `research.md` §3 (1 KB; matches reducer pattern without the ceremony) |
| Vite 8 over Webpack/Rspack | ✅ Justified in `research.md` §4 (standard for modern TS SPAs) |
| Custom input layer over a library | ✅ ~200 LOC; no third-party surprises (`research.md` §7) |
| One rAF-driven paint loop, not a stateful event emitter | ✅ Simpler; debounces naturally |
| No plugin system, no DI container | ✅ `ConsoleDeps` is a plain interface; tests inject fakes directly |
| Single tunable-constants location | ✅ `CONSOLE_CONSTANTS` in `console-api.ts` (mirror of engine's `ENGINE_CONSTANTS` discipline) |
| Demo mode (replay) is opt-in via feature flag, not a default path | ✅ `features.replay: false` by default |

**Verdict**: ✅ passes. We deliberately chose the simpler framework, the simpler renderer, the simpler state library, and the simpler build tool. The only "advanced" choices (Vite 8, Vitest Browser Mode) are industry-standard for TS SPAs.

### Principle VI — Accessibility-Minded UI

| Gate | Status |
|------|--------|
| WCAG 2.2 AA target | ✅ All design choices in `research.md` §6 |
| Keyboard navigable | ✅ Roving tabindex on the cell grid (`research.md` §6); every spec FR is exercisable with the keyboard only (Q-E15) |
| Screen-reader semantics | ✅ `role="grid"` + `role="gridcell"` overlay; `aria-live` regions for tick events; `aria-label` on every cell |
| Visible focus states | ✅ `:focus-visible` styles with 2px outline + 2px offset; ≥3:1 contrast (WCAG 2.4.7) |
| Sufficient contrast | ✅ All text/UI elements meet 4.5:1 / 3:1 minimums (axe enforces; verified in Q-A01..Q-A03) |
| No reliance on color alone | ✅ Owner color is paired with a shape pattern (Q-A01) |
| Skip link to main content | ✅ Implemented in renderer |
| `prefers-reduced-motion` honored | ✅ Combat flashes, capture highlights disabled when reduce-motion is on (Q-A07) |
| Drag alternatives (2.5.7) | ✅ Region-of-cell targeting has a single-click equivalent (i/j/k/l); verified in Q-A05 |
| Target size (2.5.8) | ✅ Cells are ≥24×24 CSS pixels at default zoom; verified in Q-A01 |
| Resize / 200% zoom | ✅ CSS rems; verified in Q-A08 |
| Axe-core in CI | ✅ `@axe-core/playwright` runs on every E2E suite (Q-A01..Q-A03) |
| Manual screen-reader audit before v1 | ⚠️ Not in CI; manual checklist in `quickstart.md` §5 |

**Verdict**: ✅ passes. Accessibility is a non-negotiable per the constitution; we treat it as such from the first line of code.

### Principle VII — Self-Hostable by Default

| Gate | Status |
|------|--------|
| Zero external service dependencies at runtime | ✅ No CDN, no analytics, no remote fonts, no telemetry (`research.md` §8) |
| No remote assets | ✅ All assets bundled; `tests/e2e/selfhost.spec.ts` greps the built bundle for any `http(s)://` URL |
| All deps permissive-licensed | ✅ All listed deps are MIT, Apache-2.0, or MPL-2.0 (test-only) |
| Single process for development | ✅ `pnpm dev` boots the console + a local feature 004 server in one command |
| Single static bundle for production | ✅ `pnpm build` produces a `dist/` directory that's servable by any static host |
| No required cloud services | ✅ The console works against any feature 004 server, including a self-hosted one on `localhost:8080` |
| Reconnect tokens stored locally | ✅ Surface via `console.getSessionToken()`; the host decides where to persist |
| Replay loader works offline | ✅ Replay tapes are static files; no network needed once loaded |

**Verdict**: ✅ passes. A motivated user can clone the repo, `pnpm install && pnpm dev`, and have a working match in under 5 minutes.

### Additional Constraints (Constitution §"Additional Constraints")

| Constraint | Status |
|------------|--------|
| Permissive dependencies only (MIT/BSD/Apache-2.0/ISC/MPL-test-only) | ✅ All listed deps verified (`research.md` §1, §3, §4, §6, §8) |
| No vendor lock-in | ✅ Standard React, standard Vite, standard WebSocket; no proprietary APIs |
| OSI-approved project license | ✅ Project ships under the same license as the rest of Europa Neo; no GPL contamination |

**Verdict**: ✅ passes.

### Constitution Check — Post-Phase-1 Re-evaluation

All gates remain green after `data-model.md`, `contracts/`, and `quickstart.md` were written. Key reinforcing decisions:

- **Reducer purity** (`console-state.ts`) reinforces Principle II (no simulation in the console) and Principle III (testable without a browser).
- **`ConsoleDeps` interface** (`console-api.ts`) reinforces Principle III (test seam) and Principle V (no DI container).
- **`CONSOLE_CONSTANTS` single location** reinforces Principle V (simplicity over cleverness).
- **Roving tabindex + ARIA grid overlay** in the renderer reinforces Principle VI (the canvas is the visual source; the DOM overlay is the a11y source).
- **`selfhost.spec.ts`** in the test suite reinforces Principle VII (the build fails if a remote URL is referenced).

**Final verdict**: ✅ Constitution satisfied. No violations to track.

### Proposed additive changes to feature 001/002/003/004's contracts

**None.** Feature 005 conforms to:

- feature 001's `engine-types.ts` (`World`, `CellView`, `Coord`,
  `Direction`, `Order`, `ReservesPct`, `PlayerId`, `TickEvents`,
  `ValidationError`, `MatchConfig`) — used verbatim.
- feature 002's `fog-types.ts` (`PlayerView`) — used verbatim.
- feature 003's `terrain-types.ts` (`Board`, `Cell` — type-only
  for the initial paint) — used verbatim.
- feature 004's `network-types.ts` (`ConnectionState`,
  `SessionToken`, `MatchId`, `ErrorCode`, `SequenceNumber`,
  `MatchClient`) — used verbatim.

The console-internal additions (`MapViewId`, `ActionId`,
`CellRegion`, `SubcellPosition`, `PlayerAction`, `NetEvent`,
`ReducerEffect`, `ConsoleState`, `MapView`, `ConsoleRenderer`,
etc.) are pure UI concerns with no engine/fog/networking
equivalent. They live in `console-types.ts` /
`console-state.ts` / `console-api.ts` and do not extend any
upstream contract.

If a future feature needs a new UI-only type, the convention
is: declare it in `@europa/console/contracts/console-types.ts`
and add it to the re-exports. This does not require engine,
fog, terrain, or networking amendments.

---

## Project Structure

### Documentation (this feature)

```text
specs/005-client-console/
├── plan.md              # this file (/speckit.plan output)
├── research.md          # Phase 0 output — framework / renderer / state / build / a11y decisions
├── data-model.md        # Phase 1 output — UI entities, fields, relationships, transitions
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — public TypeScript contracts
│   ├── console-types.ts           # UI types (MapView, ConsoleState, PlayerAction, etc.)
│   ├── console-state.ts           # pure reducer + helpers (reduce, buildMapView, ...)
│   ├── console-to-networking.ts   # boundary: wire envelope ↔ NetEvent, MatchClient wrapper
│   └── console-api.ts             # createConsole factory + public surface
└── tasks.md             # NOT created in this dispatch (Phase 5 — separate)
```

### Source Code (monorepo root)

```text
europa-neo/
├── .specify/                       # spec-kit scaffolding + governance
└── packages/
    ├── engine/                     # feature 001
    ├── fog/                        # feature 002
    ├── terrain/                    # feature 003
    ├── networking/                 # feature 004
    ├── server/                     # feature 006 + 004 + 002 + 001 host
    └── console/                    # ← this feature
        ├── package.json            # name: "@europa/console", type: "module", private
        ├── tsconfig.json           # strict, ES2022, noUncheckedIndexedAccess, jsx: react-jsx
        ├── vite.config.ts          # Vite 8 + plugin-react; extends base config
        ├── vitest.config.ts        # browser mode; v8 coverage; 80% threshold
        ├── biome.json              # extends: "//" (root)
        ├── index.html              # SPA entry
        ├── public/                 # static assets (sprites, sounds) — generated by build-assets
        ├── scripts/
        │   └── build-assets.ts     # SVG → PNG (resvg); sound re-encode
        ├── src/
        │   ├── index.ts            # public surface re-exports
        │   ├── config.ts           # CONSOLE_CONSTANTS, DEFAULT_INPUT_MAPPING, DEFAULT_PLAYER_COLORS
        │   ├── runtime.ts          # createConsole implementation (reducer + client + input + renderer)
        │   ├── reducer/            # pure state machine
        │   │   ├── index.ts
        │   │   ├── reduce.ts       # the reducer (state, action, opts) → { state, effects }
        │   │   ├── actionToOrder.ts
        │   │   ├── buildMapView.ts
        │   │   ├── localPreflight.ts
        │   │   ├── diff.ts         # cell-change diffing
        │   │   └── format.ts       # action / rejection formatters
        │   ├── net/                # network adapter (wraps feature 004)
        │   │   ├── createClient.ts
        │   │   ├── envelopeToEvent.ts
        │   │   └── heartbeat.ts
        │   ├── input/              # pointer + keyboard layer
        │   │   ├── index.ts
        │   │   ├── pointer.ts
        │   │   ├── keyboard.ts
        │   │   ├── hitTest.ts
        │   │   └── subcell.ts
        │   ├── render/             # React renderer
        │   │   ├── index.ts
        │   │   ├── App.tsx
        │   │   ├── MapCanvas.tsx       # Canvas 2D + a11y grid overlay
        │   │   ├── MapOverlay.tsx      # ARIA grid for screen readers
        │   │   ├── Hud.tsx             # connection, feedback, score
        │   │   ├── SurrenderModal.tsx
        │   │   ├── ErrorBoundary.tsx
        │   │   └── styles/             # CSS modules
        │   ├── sound/                # sound player
        │   │   ├── index.ts
        │   │   └── clips.ts
        │   └── internal/             # private runtime helpers
        │       ├── clock.ts
        │       └── throttle.ts
        └── tests/
            ├── unit/
            │   ├── reducer.test.ts
            │   ├── actionToOrder.test.ts
            │   ├── buildMapView.test.ts
            │   ├── subcell.test.ts
            │   ├── localPreflight.test.ts
            │   ├── diff.test.ts
            │   ├── formatRejection.test.ts
            │   ├── coord.test.ts
            │   └── inputMapping.test.ts
            ├── component/
            │   ├── MapCanvas.test.tsx
            │   ├── MapOverlay.test.tsx
            │   ├── Hud.test.tsx
            │   ├── SurrenderModal.test.tsx
            │   └── ErrorBoundary.test.tsx
            ├── e2e/
            │   ├── join-match.spec.ts
            │   ├── pipe-orders.spec.ts
            │   ├── keyboard-only.spec.ts
            │   ├── a11y.spec.ts
            │   ├── reconnect.spec.ts
            │   ├── surrender.spec.ts
            │   ├── subcell-parity.spec.ts
            │   └── selfhost.spec.ts
            ├── fixtures/
            │   ├── scriptedTick.ts
            │   ├── mockClient.ts
            │   ├── testServer.ts
            │   └── original-subcell.json
            ├── conformance.test.ts
            ├── determinism.test.ts
            └── perf.test.ts
```

**Structure Decision**: The console lives in its own package, mirroring the engine/fog/terrain/networking precedent. The package uses Vite (browser SPA) instead of tsup (library) — this is the only deviation from the locked stack, and it is justified in `research.md` §4.

---

## Architecture Overview

### Data flow

```
   ┌─────────────────────────┐
   │  Browser                │
   │                         │
   │  ┌──────────────────┐   │
   │  │ @europa/networking│   │ ← feature 004 client adapter (MatchClient)
   │  │  - WebSocket      │   │
   │  │  - heartbeat      │   │
   │  │  - reconnect      │   │
   │  └────────┬─────────┘   │
   │           │ ProtocolEnvelope<NetworkPayload>
   │           ▼                │
   │  ┌──────────────────┐   │
   │  │  net/            │   │ ← console's network adapter
   │  │  (envelope ↔     │   │    translates wire ↔ NetEvent
   │  │   NetEvent)      │   │
   │  └────────┬─────────┘   │
   │           │ NetEvent    │
   │           ▼                │
   │  ┌──────────────────┐   │
   │  │  reducer/         │   │ ← pure state machine
   │  │  reduce(state,    │   │    (state, action, opts) → { state, effects }
   │  │         action)   │   │
   │  └────────┬─────────┘   │
   │           │ ConsoleState│
   │           ▼                │
   │  ┌──────────────────┐   │
   │  │  render/          │   │ ← React 19 components
   │  │  - MapCanvas      │   │    Canvas 2D + ARIA overlay
   │  │  - Hud            │   │
   │  │  - Modals         │   │
   │  └────────▲─────────┘   │
   │           │ MapView      │
   │           │              │
   │  ┌────────┴─────────┐   │
   │  │  input/          │   │ ← pointer + keyboard
   │  │  - pointer       │   │    synthesizes PlayerAction
   │  │  - keyboard      │   │    dispatches to reducer
   │  │  - hitTest       │   │
   │  │  - subcell       │   │
   │  └────────▲─────────┘   │
   │           │ PlayerAction│
   │           │              │
   │  ┌────────┴─────────┐   │
   │  │  user gestures   │   │
   │  └──────────────────┘   │
   │                         │
   └─────────────────────────┘
```

The runtime is the glue: it dispatches `PlayerAction` and `NetEvent`
to the reducer, applies the resulting `ReducerEffect`s (send orders,
play sounds, persist settings), and pushes the new `ConsoleState` to
the renderer's subscription.

### Per-tick loop

```
  WebSocket.onmessage(env)
    │
    ▼
  envelopeToEvent(env, ctx)  →  NetEvent
    │
    ▼
  reduce(state, netEvent, { nowMs })
    │
    ├─ state = next State
    └─ effects = [{ kind: 'sendOrder', ... }, ...]
    │
    ▼
  runtime.applyEffects(effects):
    for each effect:
      if sendOrder: client.sendOrder(actionId, order)
      if playSound: soundPlayer.play(clip)
      if persistQol: config.persist(qol)
      if announce: ariaLiveRegion.setText(text)
      ...
    │
    ▼
  renderer.onStateChange(state):
    mapView = buildMapView(state)
    canvas.paint(mapView)
    overlay.update(mapView)
    hud.update(state.feedback, state.status, ...)
```

### Input → action flow

```
  user clicks at screen point (sx, sy)
    │
    ▼
  pointer.ts: hitTest(sx, sy, camera) → { cell, region, subcell }
    │
    ▼
  if primary button + cell in friendly territory:
    action = { kind: 'setPipe', cell, direction: directionFromRegion(region) }
    dispatch(action)
    │
    ▼
  reduce(state, action, { nowMs })
    │
    ├─ order = actionToOrder(action, playerId, session) → Order
    ├─ effects = [{ kind: 'sendOrder', order }, { kind: 'playSound', clip: 'pipe_toggle' }]
    └─ state = next State
    │
    ▼
  runtime.applyEffects(effects)
  renderer.onStateChange(state)
```

### Key design decisions (see `research.md` for full rationale + citations)

| Decision | Choice | Rationale (brief) |
|----------|--------|-------------------|
| UI framework | React 19 | Largest a11y ecosystem; mature TS strict; permissive license (`research.md` §1) |
| Renderer | Canvas 2D + React DOM overlay | 32×32 = 1024 cells; Canvas 2D is sub-ms per paint; DOM overlay is the a11y source (`research.md` §2) |
| State management | Reducer (pure) + Zustand 5 (glue) | Reducer is testable + deterministic; Zustand is 1 KB; the contract is the reducer, not the store (`research.md` §3) |
| Build tool | Vite 8 | Standard for modern TS SPAs; Vitest integration; HMR; tsup is for libraries (`research.md` §4) |
| Testing | Vitest 4.1 (unit + browser) + Playwright 1.6 (E2E + a11y) | Three layers match the three layers of bugs (`research.md` §5) |
| Accessibility | WCAG 2.2 AA: roving tabindex + ARIA grid + live regions + axe-core in CI | Constitution Principle VI is non-negotiable (`research.md` §6) |
| Input model | Mouse (Pointer Events) + keyboard (original control set) | Spec US2–US4 mandate the original; touch is v2 (`research.md` §7) |
| Self-hostability | All assets bundled; no CDN; no analytics; system fonts | Constitution Principle VII (`research.md` §8) |
| Sound | Bundled OGG clips, lazy-loaded; opt-in via `features.sound` | Spec Assumptions: silence is the v1 default |
| Replay loader | Built-in (gated by `features.replay`); static JSON tapes | QA + newcomer onboarding |
| Network adapter | Feature 004's `MatchClient` | Already designed for browser use; no parallel transport |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **WCAG 2.2 AA parity vs. original** | axe-core catches ~30% mechanically; manual NVDA / VoiceOver audit pre-v1 (in `quickstart.md` §5) |
| **Canvas 2D perf on low-end devices** | Profile in Phase 6; `rendererFactory` swap to PixiJS v8 is a one-file change (the contract is renderer-agnostic). Paint budget tested in `perf.test.ts`. |
| **Roving tabindex + canvas overlay drift on zoom** | Both are derived from the single `MapView`; cell size is a CSS variable; verified in component tests |
| **Bundle size creeps past 150 KB gz** | CI bundle-size check; reject PRs that grow the main chunk past budget |
| **Subcell math drifts from original** | Parity test against hand-curated fixture in `tests/fixtures/original-subcell.json` |
| **Sound asset pipeline unproven in production** | v1 ships silent placeholders; sound is a "v1.1 if it works" feature gated on `features.sound` |
| **React 19 + Zustand 5 + Vite 8 interop** | All three are stable, widely used; CI runs on Node 20 LTS, 22 LTS, latest |
| **WebSocket auto-reconnect flakes** | The adapter's reconnect is a NetEvent; the renderer is decoupled; tested in `e2e/reconnect.spec.ts` |
| **Server's `OrderAck` arrives out of order** | The adapter tracks `seq ↔ actionId`; out-of-order acks are queued and applied in order. Tested in `unit/envelopeToEvent.test.ts`. |

---

## Out of scope (deferred to v2)

These are explicitly excluded from v1 per spec Assumptions and
post-spec decisions. Listed here so Phase 6 doesn't accidentally
scope-creep:

- Touch input (spec Assumptions). Pointer Events are used; touch is one line.
- Mobile layout (spec Assumptions). CSS is rem-based; reflow is v2.
- Sound assets in production (spec Assumptions: silence is the v1 default).
- Multi-cell drag selection (data model has `dragSelection` ready for v1.1).
- Chat, accounts, ratings, leaderboards (AGENTS.md: gameplay first).
- Localization / i18n (English-only in v1; `formatActionConfirmation` and `formatRejection` are centralized for v2).
- WebGL renderer (no 1000×1000 board in v1; `rendererFactory` allows future swap).
- Theme builder / per-player cosmetic themes (v2).
- Tournament / spectator tournament viewer (v2; basic spectator mode is in v1).

---

## Phase 6 handoff notes

When this plan is approved and `tasks.md` is created, Phase 6
implementation will:

1. Run `pnpm install` (no new top-level deps; all are in the locked stack + the additions listed above).
2. Create the `packages/console/` skeleton (package.json, tsconfig, vite.config, vitest.config, biome.json).
3. Build bottom-up: types → reducer → net adapter → input → render → runtime → quickstart validation.
4. Verify with: `pnpm test:unit && pnpm test:component && pnpm test:e2e && pnpm test:perf && pnpm test:determinism && pnpm test:selfhost`.
5. Update `AGENTS.md` "Current state" section to mark phase 5 → phase 6 for feature 005.

**Size estimate**: ~1500–2500 LOC of code + tests. Medium-size feature
by AGENTS.md routing rules ("medium → architect solo"). The architect
implements solo, with self-review against the spec and the constitution.

If Phase 6 grows past 60 hours of architect time, the orchestrator
may be invoked per AGENTS.md "large → orchestration skill" — but
the current estimate is medium.
