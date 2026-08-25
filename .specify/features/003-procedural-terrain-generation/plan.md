# Implementation Plan: Procedural Terrain Generation (Feature 003)

**Branch**: `001-europa-core` | **Date**: 2026-08-21 | **Spec**: [`.specify/features/003-procedural-terrain-generation/spec.md`](./spec.md)

**Input**: Feature specification from `.specify/features/003-procedural-terrain-generation/spec.md` — GeoMorph-inspired procedural map generation producing balanced, point-symmetric boards with elevation, water pools, and fair city placement; seed-reproducible.

**Note**: This plan was produced by following the `/speckit.plan` workflow. The branch is `001-europa-core` (the repo's per-delivery branch — AGENTS.md "do not relitigate"; the spec-kit default of `git checkout -b 003-feature-name` was deliberately skipped, matching the precedent set by feature 001's plan). All artifacts for this feature live under `.specify/features/003-procedural-terrain-generation/`.

---

## Summary

Feature 003 produces a deterministic, balanced, **point-symmetric** `Board` for the engine. The generator runs **once per match** on the server (feature 006 matchmaking invokes it before `createWorld`), takes the same sfc32 PRNG instance the engine uses for the match, and returns the full terrain definition plus the effective seed (which may differ from the requested one if internal regeneration was needed to satisfy connectivity / balance invariants — FR-007).

The algorithm is a deliberately simple, integer-only pipeline built around a **value-noise heightmap with fractal Brownian motion (fBm) layering** — chosen because it has the same visual character as the original's GeoMorph (smooth rolling hills, not white noise) while being trivially deterministic, dependency-free, and small enough to reason about. Water is carved from elevation by **threshold-flood the lowest basins into contiguous pools** (FR-003), guaranteeing pools rather than scattered cells. **Point symmetry (180° rotational symmetry) across all layers** is enforced by generating one half and rotating the other, which is mathematically perfect (no drift at the seam) and trivially verifiable. Cities are placed by computing a per-player "spawn band" and selecting **land cells with maximum Chebyshev distance from the map center** within that band, with a minimum spacing guard.

The package is **library-only** (`packages/terrain`), depends on no runtime dependencies outside `@europa/engine` types, and ships a single public function (`generateBoard`) plus a set of pure helpers exposed for testing. It does **not** import anything from `@europa/engine` at runtime — it consumes only the published `Board`/`Cell`/`CityPlacement`/`Coord` types, satisfying the engine ↔ terrain boundary rule in `engine-to-terrain.ts`.

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (matches engine). Targets Node.js ≥ 20 LTS.

**Primary Dependencies** (terrain-only direct deps):
- `typescript` (^5.6) — shared via pnpm `catalog:`
- `vitest` (^4.1) — test framework + coverage (v8 provider)
- `@biomejs/biome` (^2) — lint + format (extends root config)

**No runtime dependencies**. Terrain is a leaf package: it depends only on `@europa/engine` for *types* (Board, Cell, CityPlacement, Coord, PlayerId, MatchConfig, ENGINE_API_VERSION), not at runtime. This preserves the engine ↔ terrain boundary ("terrain does not import anything from `@europa/engine` at runtime" — `engine-to-terrain.ts` line 7).

**Storage**: N/A — the generator is pure. The output is an in-memory `Board` value handed to `createWorld` immediately; no on-disk persistence in v1.

**Testing**: Vitest 4.1 with v8 coverage provider. Coverage threshold 80% (constitution Principle III merge gate). Test categories:
- `unit/` — pure algorithm tests (noise, threshold, symmetry, city placement)
- `integration/` — full pipeline tests against scripted PRNG instances
- `quickstart/` — runnable validation scenarios (Q-T01..Q-T08 in `quickstart.md`)
- `determinism.test.ts` — SC-001: same seed → byte-identical Board (1000 trials)
- `conformance.test.ts` — generated Board always passes `assertBoardMatchesConfig`

**Target Platform**: Node.js ≥ 20 LTS (server-side; terrain runs in feature 006's server process). Browser-side execution is not a v1 goal (AGENTS.md: console is client-only and consumes a serialized `Board` from the server, not the generator itself).

**Project Type**: Library (npm package) within a pnpm-workspaces monorepo. Re-exported as `@europa/terrain`. Sibling of `@europa/engine`.

**Performance Goals**:
- 32×32 / 2-player default map: under **1 second** end-to-end including validation + up to 5 regeneration retries (SC-003).
- 64×64 / 4-player stress test: under 5 seconds (target; SC-003 only mandates the default case).
- No per-cell allocation in the hot path (integer `Uint8Array` / `Uint16Array` / `Int32Array` storage, mirrors engine's flat-array pattern).

**Constraints**:
- Deterministic (FR-006): no wall-clock reads, no `Math.random()`, all randomness through the engine-provided sfc32 PRNG instance.
- Integer-only arithmetic (mirrors engine's contract): elevation stored as `Uint8Array`; noise values computed via integer hash + bilinear interpolation on integer lattice values.
- No `any` types; no lint suppressions (constitution Principles I + code-quality skill).
- ≥80% coverage (constitution Principle III).
- Self-hostable by default — no network, no native deps, no GPU (constitution Principle VII).

**Scale/Scope**:
- New package: `packages/terrain` (~400–700 LOC of generator + tests).
- 2–4 player maps; v1 ships 2-player end-to-end (matches AGENTS.md binding decision).
- Board sizes: 16×16 (test only) → 32×32 (default) → 64×64 (large).

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-evaluated after Phase 1 design.*

### Principle I — Type Safety First

| Gate | Status |
|------|--------|
| TS `strict: true` in `packages/terrain/tsconfig.json` | ✅ Planned |
| Zero `any` types in `src/` | ✅ Enforced by Biome `noExplicitAny` + code review |
| No `@ts-ignore` / `@ts-nocheck` / `eslint-disable` | ✅ Enforced by Biome; no suppressions ever |
| Every public function has doc comment (JSDoc) | ✅ Convention enforced in PR review |
| Re-uses engine's `Readonly<T>` discipline | ✅ All entities are readonly; generated Board is built once, frozen, returned |

**Verdict**: ✅ passes. The terrain layer reuses engine's type discipline; no new "any" surface introduced.

### Principle II — Server-Authoritative Deterministic Simulation

| Gate | Status |
|------|--------|
| No `Date.now()` / `performance.now()` / `Math.random()` in `src/` (excluding the `engine/sfc32` import line) | ✅ Enforced by Biome `noGlobalEval` + `no-restricted-globals` |
| PRNG is the engine's sfc32 instance — passed in, not constructed | ✅ `generateBoard(req, rng)` accepts the engine's live PRNG |
| Integer-only arithmetic in generation | ✅ Integer lattice + integer bilinear interpolation; no `Math.sin`/`Math.cos` in the hot path |
| Output is a pure function: same `(req, rng-state)` → same `Board` | ✅ Verified by `tests/determinism.test.ts` (1000 trials) |
| Internal regeneration uses derived seeds (`mix(seed, attempt)`) | ✅ Documented; recorded in `effectiveSeed` (FR-009) |

**Verdict**: ✅ passes. Determinism is *structural*: the algorithm is pure, integer-only, and PRNG-driven. Internal retries (FR-007) are deterministic by construction.

### Principle III — Tested Game Logic (≥80% coverage)

| Gate | Status |
|------|--------|
| Each algorithm phase in its own module + its own test file | ✅ Planned (see `Project Structure` below) |
| Coverage gate 80% enforced in CI | ✅ Vitest coverage thresholds in `vitest.config.ts` |
| Determinism test exists (1000 same-seed re-runs) | ✅ Planned (`tests/determinism.test.ts` — SC-001) |
| Balance test exists (1000 different seeds; invariants all pass) | ✅ Planned (`tests/balance.test.ts` — SC-002 / SC-004) |
| Conformance test (Board passes `assertBoardMatchesConfig`) | ✅ Planned (`tests/conformance.test.ts`) |
| Every spec FR has a corresponding acceptance test | ✅ Mapped in `quickstart.md` §4 |

**Verdict**: ✅ passes. Coverage gate is mechanical (Vitest threshold), not aspirational.

### Principle IV — Specs as Documentation

| Gate | Status |
|------|--------|
| Spec is authoritative for terrain behavior | ✅ Plan references spec FRs by number |
| Code comments explain "why"; types/docs explain "what" | ✅ JSDoc on every public function |
| Behavior changes ship in same change set as spec updates | ✅ Constitution + AGENTS.md mandate; CI enforces via PR description |
| `contracts/` folder makes the public surface discoverable | ✅ Three `.ts` files (see below) |

**Verdict**: ✅ passes.

### Principle V — Simplicity Over Cleverness

| Gate | Status |
|------|--------|
| Each algorithm phase = one file, one function | ✅ `src/{noise,symmetry,water,cities,validate,generate}.ts` |
| Pure functions over classes | ✅ No `TerrainGenerator` class; `generateBoard` is a free function |
| Flat typed arrays over per-cell objects in hot paths | ✅ Mirrors engine's choice; no per-cell allocation |
| Single tunable-constants file | ✅ `src/constants.ts` (mirrors engine's `constants.ts`) |
| No plugin system, no DI container | ✅ Direct imports |
| Simpler algorithm chosen over more sophisticated alternatives | ✅ Value noise + fBm chosen over Voronoi (see `research.md` §1) |

**Verdict**: ✅ passes. We deliberately chose a less-clever algorithm (value noise + symmetry transform) over more sophisticated approaches (Voronoi diagrams, gradient noise, erosion simulation) because the spec calls for "rolling elevation with occasional water pools" — a character achievable with simple noise + threshold + symmetry, and the simplicity is in the spec's spirit (FR-002 says "fractal/midpoint-displacement **family** algorithm" — a permissive hint, not a mandate).

### Principle VI — Accessibility-Minded UI

Not applicable to terrain. The generator produces data only; UI accessibility is feature 005's concern. ✅ N/A for terrain.

### Principle VII — Self-Hostable by Default

| Gate | Status |
|------|--------|
| Terrain has zero external service dependencies | ✅ No network, no DB, no telemetry |
| Terrain is a single npm package installable independently | ✅ pnpm workspace member; pure TypeScript |
| Source available; permissive license | ✅ Terrain has no copyleft deps (no deps at all) |
| Runs on plain Node.js | ✅ No native bindings, no GPU required |

**Verdict**: ✅ passes.

### Additional Constraints (Constitution §"Additional Constraints")

| Constraint | Status |
|------------|--------|
| Permissive dependencies only | ✅ No runtime deps; dev deps (vitest, biome, typescript) are MIT |
| No vendor lock-in | ✅ Algorithm is fully self-contained; no cloud APIs |

**Verdict**: ✅ passes.

### Constitution Check — Post-Phase-1 Re-evaluation

All gates remain green after `data-model.md` and `contracts/` were written. The pure-function shape and PRNG-passing discipline reinforce Principles II and V. The single-constants file reinforces III. The explicit dependency on engine types (and **only** types) preserves the engine ↔ terrain boundary from `engine-to-terrain.ts`.

**Final verdict**: ✅ Constitution satisfied. No violations to track.

### Proposed additive changes to feature 001's contracts

Two changes to `engine-to-terrain.ts` are required to honor the prompt's directive ("engine passes the same PRNG instance used to start the match — do not introduce a separate PRNG"). These are **proposed**, not silently extended; the PM will mediate. See `plan.md` §"Open Questions for PM" and the **Proposed Additive Changes** note at the top of each contract file.

1. **`TerrainGenerationRequest.rng: Sfc32Instance`** — add a `rng` field of the engine's sfc32 type. Today the request has no PRNG parameter; the engine cannot call `generateBoard` without either passing a PRNG or having terrain construct one (which the prompt forbids). See `contracts/terrain-api.ts` §"Proposed additive change #1".

2. **`TerrainGenerationRequest.settings: TerrainSettings`** — add a typed `settings` object (water density, elevation roughness, city count, symmetry strategy) **replacing** the current placeholder `options?: Readonly<Record<string, never>>`. The engine `MatchConfig` should **not** gain these fields (they are terrain-internal balance knobs, not engine concerns). See `contracts/terrain-api.ts` §"Proposed additive change #2".

We do **not** propose changes to `engine-types.ts` (the `Board` / `Cell` / `CityPlacement` / `Coord` types are already sufficient and correctly defined).

---

## Project Structure

### Documentation (this feature)

```text
.specify/features/003-procedural-terrain-generation/
├── plan.md              # this file (/speckit.plan output)
├── research.md          # Phase 0 output — algorithm + library decisions
├── data-model.md        # Phase 1 output — MapSeed, GenerationSettings, Board extensions, etc.
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — public TypeScript contracts
│   ├── terrain-types.ts   # re-exports engine Board/Cell/Coord/PlayerId; defines MapSeed, GenerationSettings, TerrainOptions, ValidationReport
│   ├── terrain-api.ts     # generateBoard, plus internal helpers exposed for testability
│   └── terrain-to-engine.ts # engine ↔ 003 contract (proposed additive to engine-to-terrain.ts)
└── tasks.md             # NOT created in this dispatch (Phase 5 — separate)
```

### Source Code (monorepo root)

```text
europa-neo/
├── .specify/                       # spec-kit scaffolding + governance
│   └── features/003-procedural-terrain-generation/
│       └── (planning artifacts above)
└── packages/
    ├── engine/                     # feature 001 — consumes terrain's output
    ├── server/                     # feature 006 host — calls generateBoard
    ├── client/                     # feature 005 console — only consumes Board
    └── terrain/                    # ← this feature
        ├── package.json            # name: "@europa/terrain", type: "module"
        ├── tsconfig.json           # strict, ES2022, noUncheckedIndexedAccess
        ├── vitest.config.ts        # v8 coverage, 80% threshold
        ├── biome.json              # extends: "//" (root)
        ├── src/
        │   ├── index.ts            # public surface re-exports
        │   ├── constants.ts        # TERRAIN_CONSTANTS (single tunable-knobs location, SC-005)
        │   ├── types.ts            # re-exports contracts/terrain-types.ts
        │   ├── generate.ts         # generateBoard: orchestrator
        │   ├── noise.ts            # integer value noise + fBm (FR-002)
        │   ├── symmetry.ts         # point-symmetric fill helper (FR-004)
        │   ├── water.ts            # threshold-based pool extraction (FR-003)
        │   ├── cities.ts           # fair per-player city placement (FR-005)
        │   ├── validate.ts         # invariants checker (FR-007)
        │   └── prng.ts             # sfc32 helpers consumed by noise (mix of the engine PRNG state)
        └── tests/
            ├── unit/
            │   ├── noise.test.ts
            │   ├── symmetry.test.ts
            │   ├── water.test.ts
            │   ├── cities.test.ts
            │   └── validate.test.ts
            ├── fixtures/
            │   └── boards.ts       # hand-built boards for edge-case tests
            ├── quickstart/         # runnable validation scenarios (Q-T01..Q-T08)
            ├── determinism.test.ts # SC-001: 1000 same-seed byte-identical re-runs
            ├── balance.test.ts     # SC-002/SC-004: 1000-seed statistical suite
            └── conformance.test.ts # Board satisfies assertBoardMatchesConfig (every map)
```

**Structure Decision**: terrain lives in its own package, mirroring engine's structure. One file per algorithm phase, one test file per phase. The flat-array pattern is reused for the elevation intermediate (per-cell integer storage). The PRNG is the engine's sfc32 — terrain owns *no* PRNG state; it consumes the engine's instance and advances it.

---

## Architecture Overview

### Data flow

```
                       ┌──────────────────────────┐
                       │  packages/server         │  (feature 006 matchmaking)
                       │  - holds live matches    │
                       │  - constructs sfc32      │
                       │    from config.seed      │
                       └────────────┬─────────────┘
                                    │ config, rng
                                    ▼
                       ┌──────────────────────────┐
                       │  @europa/terrain         │  ← this feature
                       │  - generateBoard(cfg,    │
                       │      rng, settings)      │
                       │  - validate & retry      │
                       │  - return Board +        │
                       │    effectiveSeed         │
                       └────────────┬─────────────┘
                                    │ { board, effectiveSeed, startingCitiesByPlayer }
                                    ▼
                       ┌──────────────────────────┐
                       │  @europa/engine          │  (feature 001)
                       │  - assertBoardMatches... │
                       │  - createWorld(config,   │
                       │      board)              │
                       │  - the same rng is now   │
                       │    the match's PRNG      │
                       └──────────────────────────┘
```

The terrain package sits **between** the server (which initiates match creation) and the engine (which consumes the Board). It uses the engine's types but not its code at runtime; it advances the engine's PRNG.

### Generation pipeline (one `generateBoard` call)

```
  (req, rng)
     │
     ▼
  ┌──────────────────────────────────────────────┐
  │ 1. SEED DERIVATION                           │
  │    - Split sfc32 into 4 substreams:          │
  │      noiseSeed, waterSeed, citiesSeed, ...   │
  │    - Derive "attempt" seed for retries       │
  └──────────────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────────────┐
  │ 2. NOISE — build elevation map (FR-002)      │
  │    - fBm over integer value noise            │
  │    - 4–6 octaves, persistence 0.5,           │
  │      lacunarity 2 (default constants)        │
  │    - output: Uint8Array (0..255)             │
  └──────────────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────────────┐
  │ 3. SYMMETRY — enforce 180° point symmetry    │
  │    (FR-004)                                   │
  │    - Generate only the "left half"           │
  │    - Fill "right half" by 180° rotation      │
  │    - Result: byte-identical at seam          │
  └──────────────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────────────┐
  │ 4. WATER — extract contiguous pools          │
  │    (FR-003)                                   │
  │    - Sort cells by elevation ascending       │
  │    - Flood cells below waterThreshold       │
  │      (set by settings.waterRatio)            │
  │    - Result: Terrain = 'water' for flooded   │
  │      cells, 'land' otherwise                 │
  │    - Guarantees pools, not single cells      │
  └──────────────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────────────┐
  │ 5. CITIES — fair per-player placement        │
  │    (FR-005)                                   │
  │    - For each player: compute spawn band     │
  │      (1/playerCount of the map)              │
  │    - Within band, find land cells with       │
  │      max distance to map center              │
  │    - Enforce min spacing between cities      │
  │      (≥ 3 cells) and from water              │
  │    - Assign to player, also mirror to        │
  │      opposite player to enforce symmetry     │
  └──────────────────────────────────────────────┘
     │
     ▼
  ┌──────────────────────────────────────────────┐
  │ 6. VALIDATE — check invariants (FR-007)      │
  │    - Point symmetry on elevation, water,     │
  │      cities                                   │
  │    - City count = playerCount ×              │
  │      settings.citiesPerPlayer                │
  │    - Connectivity: every city reaches every   │
  │      other over land (BFS)                    │
  │    - Water ratio within ±10% of target       │
  │    - If invalid → derive new seed, retry     │
  │      (max 5 attempts)                         │
  │    - If still invalid → throw GenerationError│
  └──────────────────────────────────────────────┘
     │
     ▼
  { board, effectiveSeed, startingCitiesByPlayer }
```

Each phase is a pure function called sequentially from `generate.ts`. Each is unit-tested in isolation. The order is fixed (no iteration-order dependence → constitution Principle II).

### Key design decisions (see `research.md` for full rationale + citations)

| Decision | Choice | Rationale (brief) |
|----------|--------|-------------------|
| Workspace manager | pnpm 11 (inherited) | Same as engine; monorepo-wide decision |
| Test framework | Vitest 4.1 (inherited) | Same as engine |
| Lint/format | Biome 2 (inherited) | Same as engine |
| PRNG | engine's sfc32 (inherited, passed in) | Prompt directive: "do not introduce a separate PRNG" |
| Numeric representation | Integer-only | Mirrors engine; FR-006 determinism |
| Algorithm | Value noise + fBm + point symmetry | Simplest algorithm that satisfies the spec's "smooth fractal relief" character; see `research.md` §1 |
| Symmetry strategy | Point symmetry (180° rotational) | The spec explicitly mandates 180° rotation ("terrain is reflected through the board center (180° rotation)" — US1 AC-1); see `research.md` §2 |
| Water model | Threshold-flood lowest basins from shared elevation | Contiguous pools guaranteed by construction; one source of truth; see `research.md` §3 |
| City placement | Per-player spawn band + max-distance-from-center | Trivially fair; trivially symmetric; see `research.md` §4 |
| Library needs | **None** | No TS/JS map-gen library does what we need; see `research.md` §5 |
| Output shape | `Board` (engine's type) + `effectiveSeed` + per-player city list | The `Board` type from `engine-types.ts` already fits |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **Connectivity validation can fail** for small maps with extreme water density. | Bounded retries (max 5) with derived seeds (FR-007). Default waterRatio is 0.10 (10%), well within safe range. Default `boardSize = 32` and `playerCount = 2` give generous land area. |
| **Regeneration may exhaust retries** for adversarial settings. | Default settings are safe; pathological settings are clamped (FR-008). If retries are exhausted, throw `GenerationError` (loud failure, not silent invalid Board). |
| **Float-equality / numerical drift** in noise. | Integer lattice + integer bilinear interpolation (no `Math.sin`/`Math.cos` in the hot path). Documented in `research.md` §6. |
| **PRNG state advancement** during map gen vs. simulation. | Same sfc32 instance is used. After `generateBoard` returns, the engine receives the same PRNG with advanced state. This is well-defined and documented. |
| **Engine sfc32 type not yet exported** in `engine-types.ts` | Flagged as **proposed additive change #1**. Workaround if not adopted: terrain accepts `Uint32Array` (4-element sfc32 state) and uses a small wrapper to call sfc32. Either approach is fine; first is cleaner. |
| **City placement on a near-empty map** (e.g., extreme water) | Min spacing is enforced; if placement can't satisfy, regeneration retry kicks in. |
| **Performance** SC-003: 32×32 / 2p < 1s | Estimated: 4-octave fBm over 1024 cells ≈ 4096 lattice evaluations. Each is ~20 integer ops. Plus sort, BFS, retries. Conservative estimate: < 100ms. Comfortable margin. |

### Unresolved product ambiguities

The prompt asked me to surface any I cannot resolve without a product decision. These remain:

1. **Default `citiesPerPlayer`**: The spec says "equal number of starting cities per player" (US1 AC-2) and "city count MUST be configurable" (FR-008) but does not specify a default. The original Europa had a single starting city per player; the spec calls that "starting cities" (plural) in AC-2. **Decision**: default `citiesPerPlayer = 1` for v1 (matches original); exposed in `TERRAIN_CONSTANTS` for tuning. Surfacing as a confirmation, not a blocker.

2. **Symmetry strategy enum**: The prompt suggests `'mirror' | 'rotational' | 'balanced'`. The spec mandates "point-symmetric (180° rotational symmetry)" (FR-004), which is one specific form. The other two are not specified. **Decision**: support only `'point'` (the 180° rotational) in v1; expose `symmetryStrategy` as a typed field but only accept `'point'`; future rotation schemes (90°, mirror) are explicitly out of scope per FR-004. If the PM wants multiple options, this becomes a spec change.

3. **Water "flood the lowest basins"** — does the threshold pick a single global cutoff, or per-region? **Decision**: single global cutoff (sorted-elevation threshold). Produces one or two large pools (typical for 5–15% water coverage), matching the spec's "contiguous pools". Per-region flooding (e.g., river networks) is out of scope per the prompt's "simple noise + threshold + symmetry" guidance.

4. **Original Europa terrain character**: The rules page describes "rolling elevation" + "pools of water" + "light source to upper left". The light-source is a rendering concern (feature 005), not a generation concern. The generator produces elevation; rendering interprets light. No generator action required.

---

## Implementation Phase Hand-off

Phase 5 (tasks) is **not** in this dispatch. The PM will receive:
- `plan.md` (this file)
- `research.md`
- `data-model.md`
- `contracts/` (3 files)
- `quickstart.md`

And dispatch Phase 5 to create `tasks.md`, then Phase 6 to implement.

When implementation begins, the implementer should:
1. The engine package must expose its sfc32 type (PM decision on additive change #1) — or terrain falls back to a `(state: Uint32Array) => number` adapter.
2. Scaffold `packages/terrain` per the structure above.
3. Work through the algorithm in dependency order: types → constants → prng helpers → noise → symmetry → water → cities → validate → generate.
4. Land `quickstart/` tests as the acceptance suite (Q-T01 .. Q-T08 in `quickstart.md`).
5. Run the constitution gates (lint, typecheck, coverage ≥80%, determinism test, balance test, conformance test).

The contracts in `contracts/` are the stable interface. Drift between the engine's `engine-to-terrain.ts` and this plan's `contracts/terrain-api.ts` is a bug — the two **must** be aligned before Phase 6 begins. The PM coordinates the engine plan amendment if additive changes #1 and #2 are approved.
