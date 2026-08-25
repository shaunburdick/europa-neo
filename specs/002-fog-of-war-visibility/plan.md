# Implementation Plan: Fog of War & Visibility (Feature 002)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: [`specs/002-fog-of-war-visibility/spec.md`](./spec.md)

**Input**: Feature specification from `specs/002-fog-of-war-visibility/spec.md` — per-player visibility horizon derived from troop positions; no memory of previously seen terrain; unseen areas are unknown; server never reveals hidden information to clients.

**Note**: This plan was produced by following the `/speckit.plan` workflow. The branch is `001-europa-core` (the repo's per-delivery branch — AGENTS.md "do not relitigate"; the spec-kit default of `git checkout -b 002-fog-of-war` was deliberately skipped, matching the precedent set by features 001 and 003). All artifacts for this feature live under `specs/002-fog-of-war-visibility/`. The feature-directory name on disk is `002-fog-of-war-visibility` (the spec's branch slug); the dispatch prompt referred to it as `002-fog-of-war`. **Deviation from prompt §"Set feature context"**: the actual on-disk directory is `002-fog-of-war-visibility`, not `002-fog-of-war`; `SPECIFY_FEATURE_DIRECTORY` was set to the on-disk path so `setup-plan.sh` resolves correctly.

---

## Summary

Fog of War is a **pure filter** that sits between the engine (feature 001, source of truth for `World`) and networking (feature 004, source of truth for what reaches each client). It computes, per player per tick, a `VisibleSet` of cells within a Chebyshev sensor radius of every friendly troop stack; unions all friendly stacks' horizons; redacts everything outside that set; and emits a `PlayerView` payload suitable for direct transmission.

Visibility is **radius-only, no line-of-sight** (matches the original Europa's flat satellite display and the spec Assumptions explicitly), **binary with no memory** (cells revert to unknown the moment no friendly stack is in range — FR-004 / US2), **server-authoritative and deterministic** (computed once per tick on the server from the canonical `World` snapshot; same `World` always produces the same `PlayerView`), and **trivial to compute** (Chebyshev range expansion over a 32×32 board with 2–4 players is well under SC-004's 1 ms/player budget — no caching, no spatial indexing, no clever data structures required).

The package is library-only (`packages/fog`), depends on `@europa/engine` for types and read-helpers only, and ships three pure functions: `computeVisibleSet` (already declared in `engine-to-fog.ts`; implemented here), `computePlayerView` (fog-owned), and a set of small query helpers (`isVisible`, `visibleCellAt`).

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (matches engine). Targets Node.js ≥ 20 LTS.

**Primary Dependencies** (fog-only direct deps):
- `typescript` (^5.6) — shared via pnpm `catalog:`
- `vitest` (^4.1) — test framework + coverage (v8 provider)
- `@biomejs/biome` (^2) — lint + format (extends root config)

**No runtime dependencies**. Fog depends on `@europa/engine` for **types and read-helpers only** (`World`, `Coord`, `CellView`, `cellsInRange`, `getCell`, `forEachCell`, `MatchConfig`, `ENGINE_CONSTANTS`, `Rng`). This preserves the engine ↔ fog boundary rule in `engine-to-fog.ts` ("The fog package depends on `@europa/engine`; the engine does not depend on `@europa/fog`"). The fog package owns no state and no PRNG; visibility is a pure function of the `World` snapshot.

**Storage**: N/A — fog is in-memory only. PlayerView payloads are produced per tick and handed to feature 004 for transport; fog itself does not persist anything.

**Testing**: Vitest 4.1 with v8 coverage provider. Coverage threshold 80% (constitution Principle III merge gate). Test categories:
- `unit/` — per-function tests (`computeVisibleSet`, `computePlayerView`, `isVisible`, event filtering)
- `fixtures/` — scripted worlds (small, edge-of-board, water-only, multiple viewers)
- `quickstart/` — runnable validation scenarios (Q-F01..Q-F08 in `quickstart.md`)
- `determinism.test.ts` — SC-001: same World → byte-identical PlayerView across N runs
- `redaction.test.ts` — SC-001 protocol-level: zero leakage across a scripted 500-tick match
- `conformance.test.ts` — PlayerView satisfies the engine's `engine-to-fog.ts` shape

**Target Platform**: Node.js ≥ 20 LTS (server-side; fog runs in feature 004's server process where it sits between `tick()` and the network layer). Browser-side execution is not a v1 goal.

**Project Type**: Library (npm package) within a pnpm-workspaces monorepo. Re-exported as `@europa/fog`. Sibling of `@europa/engine` and `@europa/terrain`.

**Performance Goals**:
- Compute `PlayerView` for one player on a 32×32 board in under **1 ms** (spec SC-004).
- Compute `PlayerView` for all players in a 4-player match in under **5 ms** (4 × SC-004 budget).
- Zero per-cell allocation in the hot path (use a single `Uint8Array` of size `width * height` per player as the working mask; row-major iteration).

**Constraints**:
- Determinism (FR-007): pure function `(world, player, options) → PlayerView`; identical input → byte-identical output. No `Set` / `Map` iteration; no `Math.random`; no `Date.now`.
- Integer-only arithmetic (mirrors engine contract); Chebyshev distance is `max(|dx|, |dy|)` over integer coordinates — no float math anywhere.
- ≥80% test coverage (constitution Principle III); every FR has at least one quickstart test.
- No `any` types; no lint suppressions (constitution Principles I + code-quality skill).
- Self-hostable by default — no network, no DB, no native deps (constitution Principle VII).
- **No memory** of previously visible cells (spec FR-004 / US2); the working mask is overwritten each tick.

**Scale/Scope**:
- New package: `packages/fog` (~300–500 LOC of fog logic + tests).
- 2–4 player matches (engine supports 2–4; v1 ships 2-player end-to-end).
- Board sizes: 16×16 (test only) → 32×32 (default) → 64×64 (large).

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-evaluated after Phase 1 design.*

### Principle I — Type Safety First

| Gate | Status |
|------|--------|
| TS `strict: true` in `packages/fog/tsconfig.json` | ✅ Planned |
| Zero `any` types in `src/` | ✅ Enforced by Biome `noExplicitAny` + code review |
| No `@ts-ignore` / `@ts-nocheck` / `eslint-disable` | ✅ Enforced by Biome; no suppressions ever |
| Every public function has doc comment (JSDoc) | ✅ Convention enforced in PR review |
| Re-uses engine's `Readonly<T>` discipline | ✅ All entities are readonly; `World` is never mutated |
| `FogMask` is a `Uint8Array` (no boxed objects) | ✅ Hot-path perf; typed array of integers |

**Verdict**: ✅ passes. The fog layer reuses engine's type discipline; no new "any" surface introduced.

### Principle II — Server-Authoritative Deterministic Simulation

| Gate | Status |
|------|--------|
| Visibility is computed **once per tick on the server** | ✅ Architectural — fog runs server-side, behind `tick()` |
| No `Date.now()` / `performance.now()` / `Math.random()` in `src/` | ✅ Enforced by Biome `no-restricted-globals` |
| Integer-only arithmetic (Chebyshev distance = `max(|dx|, |dy|)`) | ✅ No floats in the hot path |
| Pure function shape: `computePlayerView(world, player, opts) → PlayerView` | ✅ Same input → byte-identical output |
| **No per-client fog** — each client receives its own PlayerView from the server | ✅ Architectural; fog is a server-side filter, not a client-side decoration |
| Row-major iteration; no `Set` / `Map` iteration in output | ✅ Determinism-safe; row-major is the spec's documented iteration order |
| `TickEvents` filtered to horizon only (FR-003) | ✅ Combat/capture events outside horizon are dropped before serialization |
| Replay-friendly: serializing two PlayerViews from the same World yields identical bytes | ✅ Verified by `determinism.test.ts` |

**Verdict**: ✅ passes. Determinism is **structural** — fog is a pure function of the engine's canonical `World`. No iteration-order dependence. No clock. No randomness.

### Principle III — Tested Game Logic (≥80% coverage)

| Gate | Status |
|------|--------|
| Each module = one function + one test file | ✅ Planned (see Project Structure) |
| Coverage gate 80% enforced in CI | ✅ Vitest coverage thresholds in `vitest.config.ts` |
| Determinism test exists (same World → byte-identical PlayerView) | ✅ Planned (`tests/determinism.test.ts`) |
| Redaction test exists (no leakage across 500-tick scripted match) | ✅ Planned (`tests/redaction.test.ts` — SC-001 protocol-level) |
| Every spec FR has a corresponding acceptance test | ✅ Mapped in `quickstart.md` §4 |
| Edge cases covered: 0 troops, 0 cities, viewer at edge, viewer on water, mutual visibility, spectator | ✅ Planned (Q-F02, Q-F03, Q-F06) |

**Verdict**: ✅ passes. Coverage gate is mechanical (Vitest threshold), not aspirational.

### Principle IV — Specs as Documentation

| Gate | Status |
|------|--------|
| Spec is authoritative for fog behavior | ✅ Plan references spec FRs by number |
| Code comments explain "why"; types/docs explain "what" | ✅ JSDoc on every public function |
| Behavior changes ship in same change set as spec updates | ✅ Constitution + AGENTS.md mandate; CI enforces via PR description |
| `contracts/` folder makes the public surface discoverable | ✅ Four `.ts` files (see below) |

**Verdict**: ✅ passes.

### Principle V — Simplicity Over Cleverness

| Gate | Status |
|------|--------|
| Each phase = one file, one function | ✅ `src/{visibleSet,playerView,eventsFilter,utils}.ts` |
| Pure functions over classes | ✅ No `FogOfWar` class; `computeVisibleSet` and `computePlayerView` are free functions |
| Flat `Uint8Array` mask over per-cell objects | ✅ Mirror's engine's flat-array pattern; trivially deterministic |
| Single tunable-constants file | ✅ `src/constants.ts` (mirrors engine's `constants.ts`) |
| Range expansion over quadtree / spatial index | ✅ 32×32 = 1024 cells; quadtree is YAGNI |
| No plugin system, no DI container | ✅ Direct imports |
| Simpler algorithm chosen: range expansion, no LOS raycasting | ✅ Spec Assumptions: "Vision does not require line-of-sight; radius alone determines visibility" |

**Verdict**: ✅ passes. We deliberately chose a less-clever algorithm (Chebyshev range expansion) over more sophisticated approaches (raycasting, line-of-sight blockers) because the spec explicitly mandates radius-only visibility and the original Europa is a flat satellite display.

### Principle VI — Accessibility-Minded UI

Not applicable to fog. Fog produces data only; UI accessibility is feature 005's concern. The PlayerView payload is structured (cells, events, config) so any console can render it accessibly. ✅ N/A for fog.

### Principle VII — Self-Hostable by Default

| Gate | Status |
|------|--------|
| Fog has zero external service dependencies | ✅ No network, no DB, no telemetry |
| Fog is a single npm package installable independently | ✅ pnpm workspace member; pure TypeScript |
| Source available; permissive license | ✅ Fog has no copyleft deps (no deps at all) |
| Runs on plain Node.js | ✅ No native bindings, no GPU required |

**Verdict**: ✅ passes.

### Additional Constraints (Constitution §"Additional Constraints")

| Constraint | Status |
|------------|--------|
| Permissive dependencies only | ✅ No runtime deps; dev deps (vitest, biome, typescript) are MIT |
| No vendor lock-in | ✅ Algorithm is fully self-contained; no cloud APIs |

**Verdict**: ✅ passes.

### Constitution Check — Post-Phase-1 Re-evaluation

All gates remain green after `data-model.md` and `contracts/` were written. The pure-function shape and readonly `World` discipline reinforce Principles I, II, and V. The `FogMask` flat-array pattern reinforces II (determinism) and III (testability). The single-constants file reinforces III.

**Final verdict**: ✅ Constitution satisfied. No violations to track.

### Proposed additive changes to feature 001's contracts

**None.** The engine's existing `engine-to-fog.ts` declares `VisibleSet`, `PlayerView`, `computeVisibleSet`, and a re-declared `cellsInRange` — all of which fog consumes directly. `MatchConfig.visibilityRadius` already exists. `ENGINE_CONSTANTS.visibilityRadiusDefault` already exists. The fog package conforms to feature 001's contracts **without modification**.

If spectator-mode support needs a discriminator on `PlayerView`, fog handles it via the function signature of `computePlayerView` (an `options.spectator` flag), **not** by modifying the `PlayerView` type. The type stays clean; the function dispatches behavior. See `data-model.md` §6 and `contracts/fog-api.ts` §"Spectator mode" for details.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-fog-of-war-visibility/
├── plan.md              # this file (/speckit.plan output)
├── research.md          # Phase 0 output — algorithm + library decisions
├── data-model.md        # Phase 1 output — entities (FogMask, VisibleSet, PlayerView, …)
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — public TypeScript contracts
│   ├── fog-types.ts         # FogMask, RedactedCell, RedactedCity, SpectatorFlag, FOG_CONSTANTS shape
│   ├── fog-api.ts           # computeVisibleSet (impl), computePlayerView, isVisible, visibleCellAt
│   ├── fog-to-networking.ts # output type for feature 004 (just re-exports PlayerView + spectate flag)
│   └── engine-to-fog.ts     # mirror of feature 001's file; documents the conformed boundary
└── tasks.md             # NOT created in this dispatch (Phase 5 — separate)
```

> **Note**: feature 001's `engine-to-fog.ts` is the **authoritative** engine ↔ fog boundary. The mirror under feature 002 is provided so consumers can `import { ... } from '@europa/fog/contracts/engine-to-fog'` for symmetry with the terrain plan's mirror of `engine-to-terrain.ts`. It contains the same types and declarations (verbatim) — drift between the two is a bug.

### Source Code (monorepo root)

```text
europa-neo/
├── .specify/                            # spec-kit scaffolding + governance
│   └── features/002-fog-of-war-visibility/
│       └── (planning artifacts above)
└── packages/
    ├── engine/                          # feature 001 — emits World (unfiltered)
    ├── terrain/                         # feature 003 — produces Board (input to engine)
    ├── fog/                             # ← this feature
    │   ├── package.json                 # name: "@europa/fog", type: "module"
    │   ├── tsconfig.json                # strict, ES2022, noUncheckedIndexedAccess
    │   ├── vitest.config.ts             # v8 coverage, 80% threshold
    │   ├── biome.json                   # extends: "//" (root)
    │   ├── src/
    │   │   ├── index.ts                 # public surface re-exports
    │   │   ├── constants.ts             # FOG_CONSTANTS (single tunable-knobs location)
    │   │   ├── types.ts                 # re-exports contracts/fog-types.ts
    │   │   ├── visibleSet.ts            # computeVisibleSet: union of friendly horizons
    │   │   ├── playerView.ts            # computePlayerView: horizon-filtered payload
    │   │   ├── eventsFilter.ts          # filter TickEvents to horizon only
    │   │   └── utils.ts                 # isVisible, visibleCellAt
    │   └── tests/
    │       ├── unit/
    │       │   ├── visibleSet.test.ts
    │       │   ├── playerView.test.ts
    │       │   ├── eventsFilter.test.ts
    │       │   └── utils.test.ts
    │       ├── fixtures/
    │       │   └── worlds.ts            # scripted worlds (single-viewer, multi-viewer, edge-of-board, water-only, spectator)
    │       ├── quickstart/              # Q-F01..Q-F08
    │       ├── determinism.test.ts      # SC-001: same World → byte-identical PlayerView across 100 runs
    │       ├── redaction.test.ts        # SC-001 protocol-level: zero leakage across 500-tick scripted match
    │       └── conformance.test.ts     # PlayerView satisfies engine-to-fog.ts shape
    ├── server/                          # feature 004 host — calls computePlayerView before broadcast
    └── client/                          # feature 005 console — consumes PlayerView
```

**Structure Decision**: fog lives in its own package, mirroring the engine's and terrain's structure. One file per pipeline phase, one test file per phase. The flat `Uint8Array` pattern is reused for the per-player visibility mask. Fog owns no PRNG and no state; it consumes the engine's `World` and emits `PlayerView` payloads.

**Why a separate package (not `packages/engine/src/fog/`)**:
- The engine's `engine-to-fog.ts` boundary rule explicitly states "The fog package depends on `@europa/engine`". A `packages/engine/src/fog/` subfolder would invert the dependency direction (engine would self-reference fog).
- The engine is a pure simulation primitive that needs to remain testable headless; visibility is a downstream concern that should not be entangled with engine compilation.
- Networking (feature 004) will need to import `computePlayerView`. A separate `@europa/fog` package gives networking a clean dependency edge (`@europa/fog` → `@europa/engine` → engine types), with no risk of importing engine internals by accident.
- Mirrors the precedent set by `@europa/terrain` (feature 003), which is also a separate package consuming engine types.

---

## Architecture Overview

### Data flow

```
                        ┌──────────────────────────┐
                        │  packages/server         │   (feature 006 matchmaking
                        │                          │    + feature 004 networking)
                        │  - holds live matches    │
                        │  - calls tick(world)     │
                        │  - emits TickEvents      │
                        │  - broadcasts per player │
                        └────────────┬─────────────┘
                                     │ tick(world) → TickResult
                                     ▼
                        ┌──────────────────────────┐
                        │  @europa/engine          │   (feature 001 — emits
                        │  - tick(world)           │    full, unfiltered World)
                        │  - serializeWorld        │
                        └────────────┬─────────────┘
                                     │ Readonly<World>
                                     ▼
                        ┌──────────────────────────┐
                        │  @europa/fog             │   ← this feature
                        │  - computeVisibleSet     │    per player per tick
                        │  - computePlayerView     │    pure function; no state
                        │  - filter TickEvents     │
                        └────────────┬─────────────┘
                                     │ PlayerView (horizon-filtered)
                                     ▼
                        ┌──────────────────────────┐
                        │  packages/server (cont)  │
                        │  feature 004 (network):  │
                        │  - serialize PlayerView  │
                        │  - broadcast per client  │
                        └────────────┬─────────────┘
                                     │ PlayerView over wire
                                     ▼
                              packages/client
                              (feature 005 console)
                              renders per-client view
```

The fog package sits **between the engine and networking**. It is a pure filter; it does not call back into the engine and it does not know about the network. The server is the only thing that knows fog exists.

### Visibility pipeline (one `computePlayerView` call)

```
  (world, player, options?)
     │
     ▼
  ┌────────────────────────────────────────────────┐
  │ 1. Resolve viewer set                          │
  │    - iterate world.state.troopOwners in        │
  │      row-major order                           │
  │    - record cells where owner === player AND   │
  │      troopCount > 0  (FR-001 / Edge Cases)     │
  │    - row-major: y outer, x inner; deterministic│
  └────────────────────────────────────────────────┘
     │
     ▼
  ┌────────────────────────────────────────────────┐
  │ 2. Mark horizon (binary mask)                  │
  │    - allocate FogMask (Uint8Array, w*h, 0-init)│
  │    - for each viewer cell:                     │
  │        for each cell in Chebyshev range r:     │
  │          mask[idx] = 1                         │
  │    - reuse engine's cellsInRange for range gen │
  │      (FR: same Chebyshev metric everywhere)    │
  │    - bounds-checked; out-of-board cells omitted│
  └────────────────────────────────────────────────┘
     │
     ▼
  ┌────────────────────────────────────────────────┐
  │ 3. Decode visible cells (PlayerView payload)   │
  │    - if spectator: visibleCells = ALL cells    │
  │    - else: iterate mask row-major; for each 1: │
  │        visibleCells.push(getCell(world, x, y)) │
  │    - row-major order → deterministic payload   │
  │    - no Set/Map iteration (Principle II)       │
  └────────────────────────────────────────────────┘
     │
     ▼
  ┌────────────────────────────────────────────────┐
  │ 4. Filter TickEvents to horizon                │
  │    - for each event in {combat, capture, ...}: │
  │        if event.cell is in mask → keep         │
  │        else → drop                             │
  │    - exception: EliminationEvent (player-level,│
  │      not cell-level) — kept regardless (player │
  │      knows they were eliminated)               │
  │    - exception: AppliedOrderRecord (player-     │
  │      level metadata) — kept regardless         │
  └────────────────────────────────────────────────┘
     │
     ▼
  { player, tick, visibleCells, events (filtered), config }
```

Each phase is a pure function called sequentially from `playerView.ts`. Each is unit-tested in isolation. The order is fixed (row-major everywhere; no iteration-order dependence → constitution Principle II).

### Key design decisions (see `research.md` for full rationale + citations)

| Decision | Choice | Rationale (brief) |
|----------|--------|-------------------|
| Workspace manager | pnpm 11 (inherited) | Same as engine + terrain; monorepo-wide decision |
| Test framework | Vitest 4.1 (inherited) | Same as engine + terrain |
| Lint/format | Biome 2 (inherited) | Same as engine + terrain |
| PRNG | none | Visibility is a pure function of `World`; no randomness needed |
| Numeric representation | Integer-only | Chebyshev distance = `max(\|dx\|, \|dy\|)`; mask = `Uint8Array` |
| Algorithm | Chebyshev range expansion over friendly unit cells | Spec Assumptions: radius-only, no LOS; original Europa = flat satellite display |
| Metric | Chebyshev distance | Engine's `cellsInRange` is Chebyshev; spec Key Entities list "Chebyshev or Euclidean per plan decision" — Chebyshev is consistent with engine |
| Memory model | **Binary mask, no recall** (FR-004 / US2) | Spec mandates "no memory"; previous "previously visible" recall state is explicitly out of scope |
| Viewer definition | Troop stacks ONLY (cells with `troopCount > 0 && troopOwner === player`) | Spec US1 AC + Edge Case: "capturing a city grants no vision without occupying troops" |
| Per-cell redaction | Structural — cells outside horizon simply do not appear in `visibleCells` | Spec FR-002: "transmitted as 'unknown' — no terrain, elevation, pipe, or troop information" |
| Event redaction | Drop events whose `cell` is outside horizon; keep player-level events | Spec FR-003: "no payload sent to a player may contain state about cells outside that player's visible set" |
| Package location | `packages/fog` (`@europa/fog`) | Mirrors `@europa/terrain` precedent; engine ↔ fog boundary rule says "fog package depends on `@europa/engine`" |
| Spectator mode | `computePlayerView(world, player, { spectator: true })` returns full board; function-level dispatch, no type change | Spec FR-006 / US3; avoids modifying engine's `PlayerView` type |
| Library needs | **None** | Algorithm is ~100 LOC; spec's no-LOS rule precludes any spatial-index library |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **Performance SC-004** (32×32, <1 ms/player) | Estimated: ~10 friendly units × `(2r+1)²` cells marked each = ~500 ops per player. Way under 1 ms. Measured by a Vitest benchmark in `tests/determinism.test.ts`. |
| **`Uint8Array` mutation vs readonly discipline** | Fog mutates only its own working mask (per-call allocation); the input `World.state.*` typed arrays are read but never written. Documented in code comments. |
| **TickEvents event-cell redaction — what about events with no `cell`?** | `AppliedOrderRecord` and `EliminationEvent` are player-level (no `cell`). They are always kept. Documented in `eventsFilter.ts` JSDoc. |
| **Replay determinism** | Identical `(world, player, opts)` → identical `PlayerView`. Verified by `tests/determinism.test.ts`. PlayerView has no derived timestamps. |
| **Reveal-on-attack counter-intel** | Spec edge case is explicit: "combat resolution itself reveals nothing extra beyond the horizon rule." Fog implements strict horizon-only — if a defender is attacked from outside their horizon, the defender does NOT learn the attacker's position. Documented in `research.md` §3. |
| **Cross-feature type drift** | `PlayerView` and `VisibleSet` are declared in engine's `engine-to-fog.ts`; fog's `contracts/engine-to-fog.ts` mirror is verbatim. Drift between the two is caught by the conformance test. |
| **3/4-player tests lighter than 2-player** | Per AGENTS.md binding decision + spec assumption. The fog API supports all 2–4 player counts (engine FR-019); the v1 2-player test path is fully exercised. |
| **Engine `Rng` not used by fog** | The engine's `Rng` is in the dependency tree (via the engine types), but fog does not import or call it. No type-level pollution. |

### Unresolved product ambiguities

The prompt asked me to surface any I cannot resolve without a product decision. **None remain for fog.** Every ambiguity has a defensible spec-grounded resolution:

- **Algorithm**: spec Assumptions + FR-001 → range expansion. Chebyshev vs Euclidean is a `plan decision` per spec Key Entities; Chebyshev matches engine's `cellsInRange` and is selected.
- **Viewer definition**: spec US1 AC + Edge Cases → troops only. Cities alone do not project vision.
- **Visibility radius**: engine's `MatchConfig.visibilityRadius` exists; no additive change required.
- **Information hiding**: spec FR-002 + FR-005 + US1 AC-3 → cells outside horizon are structurally absent from `visibleCells`; cells inside horizon include full `CellView` (terrain, elevation, pipes, troop count, owner, reserves, city ownership).
- **Reveal-on-attack**: spec Edge Case is explicit → no counter-attack intel. Combat events for out-of-horizon cells are dropped from the player's `PlayerView`.
- **Determinism**: spec FR-007 → pure function; row-major iteration; no Set/Map; no PRNG; no clock.
- **Performance**: spec SC-004 → 1 ms/player budget is comfortable with range expansion on 32×32; no caching needed.
- **Package location**: engine's `engine-to-fog.ts` boundary rule → separate `packages/fog` package.

---

## Implementation Phase Hand-off

Phase 5 (tasks) is **not** in this dispatch. The PM will receive:
- `plan.md` (this file)
- `research.md`
- `data-model.md`
- `contracts/` (4 files)
- `quickstart.md`

And dispatch Phase 5 to create `tasks.md`, then Phase 6 to implement.

When implementation begins, the implementer should:
1. Scaffold `packages/fog` per the structure above (the monorepo bootstrap is a separate setup task, not part of fog's task list — already established by feature 001's plan §"Implementation Phase Hand-off").
2. Work through the algorithm in dependency order: types → constants → utils → visibleSet → eventsFilter → playerView → index re-exports.
3. Land `quickstart/` tests as the acceptance suite (Q-F01 .. Q-F08 in `quickstart.md`).
4. Run the constitution gates (lint, typecheck, coverage ≥80%, determinism test, redaction test).

The contracts in `contracts/` are the stable interface; they are referenced by features 004 (networking) and 005 (console). Drift between fog's `contracts/engine-to-fog.ts` and feature 001's `engine-to-fog.ts` is a bug — the two **must** remain byte-identical (the conformance test enforces this).
