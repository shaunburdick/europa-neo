# Tasks: Procedural Terrain Generation

**Input**: Design documents from `.specify/features/003-procedural-terrain-generation/`
**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Branch**: `001-europa-core`
**Spec**: [spec.md](./spec.md) — 3 user stories (US1=P1 Balanced Symmetric Maps, US2=P2 Seed Reproducibility, US3=P3 Characterful Terrain) and 9 functional requirements (FR-001..FR-009)

**Tests**: REQUIRED. Constitution Principle III mandates ≥80% coverage on game logic as a merge gate; `quickstart.md` §4 maps every spec FR to at least one test. Tests are interleaved with implementation per the spec-kit template (failing tests first, then impl, then integration).

**Organization**: Tasks are grouped by user story in a pipeline-friendly execution order. **Phase 3 (US1) = the MVP** — produces a valid symmetric board for any seed. **Phase 4 (US2)** layers in fair city placement (P1 in the prompt's pipeline order, mapped to spec US1 AC-2). **Phase 5 (US3)** layers in tunable balance knobs (P2 in prompt order, mapped to spec US3 + FR-008). The constitution's "Specs as Documentation" principle means each user-story label maps to the spec's user story whose acceptance criteria that phase satisfies; the prompt's `US1/US2/US3` ordering is the execution order, not the spec's P1/P2/P3 priority.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`[US1]`–`[US3]`); REQUIRED for user story phase tasks only
- Include exact file paths in descriptions — every task targets a specific file under `packages/terrain/`

## Path Conventions

Per `plan.md` §"Project Structure" (monorepo root). The terrain package lives at `packages/terrain/`. The package's source tree is one file per algorithm phase, mirroring feature 001's engine package (constitution Principle V: "Each algorithm phase = one file, one function"). All file paths below are the actual future monorepo paths.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the `packages/terrain/` package scaffolding on top of feature 001's already-bootstrapped monorepo (root `pnpm-workspace.yaml`, root `tsconfig.base.json`, root `biome.json`, and root `package.json` `catalog:` were landed in feature 001's Phase 1, commit `dd07635` and earlier). No business logic yet.

**⚠️ NOTE**: Tasks T001–T004 are **verification/audit** tasks only — they confirm feature 001's root configs already expose the pinned versions and workspace registration that terrain will consume. They do NOT rewrite the root files (commit-bound per `git-safety`). Tasks T005–T010 create the new `packages/terrain/` files.

- [ ] T001 Verify `pnpm-workspace.yaml` at repo root already registers `packages: ["packages/*"]` (landed in feature 001, T001); confirm no edit needed; if missing, add the registration in this change set
- [ ] T002 Verify root `package.json` `catalog:` pins `tsup@^8`, `vitest@^4.1`, `@biomejs/biome@^2`, `typescript@^5.6` (landed in feature 001, T002); confirm no edit needed
- [ ] T003 Verify root `tsconfig.base.json` has `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler` (landed in feature 001, T003); confirm no edit needed
- [ ] T004 Verify root `biome.json` exists with `extends: ["//"]` chain support (landed in feature 001, T004); confirm no edit needed
- [ ] T005 [P] Create `packages/terrain/package.json` with `name: "@europa/terrain"`, `type: "module"`, `exports` map pointing to `dist/index.js` and `dist/index.d.ts`, devDependencies on `tsup@^8`, `vitest@^4.1`, `@biomejs/biome@^2`, `typescript@^5.6` (all resolved via root pnpm `catalog:`), `peerDependencies: { "@europa/engine": "workspace:*" }`, scripts (`build`, `test`, `lint`, `format`, `typecheck`, `coverage`)
- [ ] T006 [P] Create `packages/terrain/tsconfig.json` extending `../../tsconfig.base.json` with `outDir: "./dist"`, `rootDir: "./src"`, `noEmit: false`, `composite: false`, `include: ["src/**/*"]`
- [ ] T007 [P] Create `packages/terrain/vitest.config.ts` with v8 coverage provider, `thresholds.lines/functions/branches/statements: 80` (constitution Principle III merge gate), `include: ["tests/**/*.test.ts"]`, `environment: "node"`
- [ ] T008 [P] Create `packages/terrain/tsup.config.ts` with `entry: ["src/index.ts"]`, `format: ["esm"]`, `dts: true`, `clean: true`, `splitting: false`, `sourcemap: true`
- [ ] T009 [P] Create `packages/terrain/biome.json` with `extends: ["//"]` (root) — no package-specific overrides in v1
- [ ] T010 [P] Create the directory tree `packages/terrain/src/`, `packages/terrain/tests/unit/`, `packages/terrain/tests/fixtures/`, `packages/terrain/tests/quickstart/`, `packages/terrain/tests/integration/` (empty `mkdir -p` style, no source files yet)

**Checkpoint**: `pnpm install` runs cleanly; `pnpm --filter @europa/terrain build` produces an empty `dist/`; `pnpm --filter @europa/terrain test` runs with zero tests and exits 0; `pnpm --filter @europa/terrain typecheck` and `pnpm --filter @europa/terrain lint` exit 0.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure that EVERY user story depends on — the public type surface, package constants, the typed `GenerationError`, the RNG adapter that wraps the engine's sfc32 (no separate PRNG instance per the prompt mandate), the settings shape, the symmetry helper, and test fixtures. **No user story work can begin until this phase is complete.**

**⚠️ CRITICAL**: This phase establishes the public surface (`index.ts`), the typed error that every code path returns, and the RNG-adapter that every downstream module will consume. Skipping ahead breaks the import graph for every later phase.

- [ ] T011 [P] Create `packages/terrain/src/types.ts` re-exporting the full surface of `contracts/terrain-types.ts` (every interface, type alias, and `TERRAIN_API_VERSION` constant) plus the engine types `Board`, `Cell`, `CityPlacement`, `Coord`, `PlayerId`, `Rng` via `import type` from `@europa/engine` (no runtime engine import — see `engine-to-terrain.ts` boundary rule)
- [ ] T012 [P] Create `packages/terrain/src/constants.ts` exporting `TERRAIN_CONSTANTS` (per `contracts/terrain-api.ts` `TerrainConstants` interface: `minElevation: 0`, `maxElevation: 255`, `minBoardSize: 8`, `maxBoardSize: 128`, plus `defaultSettings: DEFAULT_GENERATION_SETTINGS` re-exported from `terrain-types.ts`); re-export `TERRAIN_API_VERSION = '0.1.0' as const` from the package barrel for convenience
- [ ] T013 [P] Create `packages/terrain/src/errors.ts` exporting the `GenerationError` class (per `contracts/terrain-types.ts` lines 350–368): extends `Error`, sets `name = 'GenerationError'`, fields `kind: 'attempts_exhausted' | 'invalid_request'`, `attempts: number`, `lastReport: ValidationReport | null`; constructor takes `(message, options)` and forwards to `super(message)`
- [ ] T014 [P] Create `packages/terrain/src/rng-adapter.ts` exporting `deriveSubstream(parent: Rng): Rng` (consumes one uint32 from parent via the engine's sfc32 step, then constructs a new sub-stream Rng instance initialized with that uint32 as the seed) and `mixSeed(seed: number, attempt: number): number` (uint32 mixing helper, e.g., `((seed ^ (attempt * 0x9E3779B1)) * 0x85EBCA6B) >>> 0` for FR-007 retry derivation); NO separate PRNG instance — every RNG originates from the engine's parent (depends on T011)
- [ ] T015 [P] Create `packages/terrain/src/settings.ts` exporting `resolveSettings(partial: Partial<GenerationSettings>): GenerationSettings` (merges partial input with `DEFAULT_GENERATION_SETTINGS`) and `validateSettings(s: GenerationSettings): void` (throws `GenerationError({ kind: 'invalid_request' })` on shape violations like non-integer `octaves`); the range-clamping math itself lives in `clamp.ts` (US3) — this task only handles the type-shape and default-merging
- [ ] T016 [P] Create `packages/terrain/src/symmetry.ts` exporting `rotate180(x: number, y: number, width: number, height: number): { x: number; y: number }` (pure: returns `{ x: width - 1 - x, y: height - 1 - y }`) and `rotate180Index(index: number, width: number, height: number): number` (linear-index form: `((height - 1 - Math.floor(index / width)) * width) + (width - 1 - (index % width))`); reused by elevation fill, water symmetry check, and city mirror (depends on T011)
- [ ] T017 Create `packages/terrain/src/index.ts` re-exporting the full public surface: types from `./types`, constants (`TERRAIN_CONSTANTS`, `TERRAIN_API_VERSION`, `DEFAULT_GENERATION_SETTINGS`), the `GenerationError` class, the `generateBoard` and `assertBoardMatchesConfig` and `validateBoard` and `hashBoard` functions (declared in `contracts/terrain-api.ts`), and the four internal helpers `_*` for testability — barrel export, no logic (depends on T011–T016)
- [ ] T018 [P] Create `packages/terrain/tests/fixtures/board.ts` exporting `buildEmptyBoard(size)` (square flat board, all `land`, elevation 0, no cities), `buildFlatElevation(size, value)` (Uint8Array of given value), `buildCellsFromElevation(elev, waterMask)` (converts the two flat arrays into the engine's `Cell[]` shape), and `buildBoardFromCells(cells, size)` (wraps the `Cell[]` into a `Board` with the given square dimension)
- [ ] T019 [P] Create `packages/terrain/tests/fixtures/seeds.ts` exporting the 1000-trial seed generator `goldenSeeds(trials: number): number[]` (yields `(i * 0x9E3779B1) >>> 0` for `i ∈ [0, trials)` — matches `quickstart.md` Q-T01/Q-T02/Q-T05/Q-T06/Q-T07/Q-T08 seed stride), a few named constant seeds for snapshot tests (`SEED_42 = 42`, `SEED_C0FFEE = 0xC0FFEE`, `SEED_1 = 1`), and `engineSfc32(seed: number): Rng` thin wrapper that constructs an sfc32 instance from the engine's exported factory (or falls back to the state-uint32-array adapter if additive change #1 is not yet merged)

**Checkpoint**: `pnpm --filter @europa/terrain build` succeeds; `dist/index.d.ts` exports every type and function from `contracts/terrain-types.ts` and `contracts/terrain-api.ts`; `pnpm --filter @europa/terrain test` still passes (zero failing tests); `pnpm --filter @europa/terrain typecheck` is clean.

---

## Phase 3: User Story 1 - Generation Pipeline (Priority: P1) 🎯 MVP

**Goal**: Deliver the deterministic, integer-only generation pipeline that produces a valid symmetric `Board` for any seed. `generateBoard(req)` orchestrates: value-noise → fBm → 180° point-symmetric fill → threshold-flood water → (placeholder cities for now) → validate → return `Board` + `effectiveSeed`. After this phase, a 2-player 32×32 map with **no cities** (TBC; see "open ambiguity" in PM handoff) can be generated deterministically and passes all 15 invariants.

**Independent Test**: Generate a 32×32 / 2-player board with `DEFAULT_GENERATION_SETTINGS` and assert: (1) `hashBoard` is byte-stable across two same-seed runs (SC-001 micro-check), (2) elevation and water are 180°-symmetric (FR-004, INV-5/6), (3) water forms ≥ 1 pool of size ≥ 4 (FR-003, INV-15), (4) elevation variance > 0 (INV-14), (5) `validateBoard` returns `valid: true` (all 15 invariants). City placement is verified in Phase 4; this phase produces a zero-city board that's pipeline-valid (the validate step accommodates `playerCount × 0 = 0` cities during the MVP).

**⚠️ MVP scope clarification**: The pipeline in this phase builds a `Board` with `cities: []`. The `citiesPerPlayer` setting is honored in Phase 4 (US2). The MVP demonstrable surface is "given a seed, produce a symmetric, validated terrain heightmap + water map + Board; the engine can `createWorld` from it (with cities added later by feature 006 or US2 follow-up)."

### Tests for User Story 1

> Write these FIRST; each should FAIL until its corresponding implementation task lands.

- [ ] T020 [P] [US1] Write failing unit tests for `value-noise` in `packages/terrain/tests/unit/value-noise.test.ts` — covers FR-006 determinism (same `(x, y)` → same value byte-for-byte across 1000 calls), INV-3 (output integer in `[0, 255]`), spatial smoothness (neighboring lattice points differ by ≤ 50 over 4 steps — the integer-bilinear interpolation contract)
- [ ] T021 [P] [US1] Write failing unit tests for `fbm` in `packages/terrain/tests/unit/fbm.test.ts` — covers FR-002 (fractal character: variance above floor after 4 octaves), `octaves` parameter honored (octaves=1 returns base octave only, octaves=4 returns sum of 4), default octaves=4 from `DEFAULT_GENERATION_SETTINGS` produces non-flat output (INV-14)
- [ ] T022 [P] [US1] Write failing unit tests for `elevation` in `packages/terrain/tests/unit/elevation.test.ts` — covers FR-004 + INV-5/6 (after `_enforcePointSymmetry` on a 32×32 buffer, every cell matches its 180° partner byte-for-byte), `_enforcePointSymmetry` is in-place, output values remain in `[0, 255]`, returns same `Uint8Array` reference
- [ ] T023 [P] [US1] Write failing unit tests for `water` in `packages/terrain/tests/unit/water.test.ts` — covers FR-003 + INV-15 (water cells form ≥ 1 connected pool of size ≥ 4), `_extractWater` returns a parallel `Uint8Array` (1=water, 0=land) of identical shape, water ratio = `Math.floor(waterRatio × totalCells)` exactly on a sorted input, all water cells are the lowest-elevation cells of the input
- [ ] T024 [P] [US1] Write failing unit tests for `board` builder in `packages/terrain/tests/unit/board.test.ts` — covers INV-1 (`width === height === boardSize`), INV-2 (`cells.length === boardSize²`), INV-3/4 (every cell has integer `elevation ∈ [0, 255]` and `terrain ∈ { 'land', 'water' }`), `assertBoardMatchesConfig` throws on mismatched `boardSize`, throws on city-on-water (when cities are added)
- [ ] T025 [P] [US1] Write failing unit tests for `validate` in `packages/terrain/tests/unit/validate.test.ts` — covers all 15 invariants enumerated in `data-model.md` §11; each invariant has a hand-built failing case and a hand-built passing case; `validateBoard` returns `valid: false` with the correct `Violation.kind` for each failing case; returns `valid: true` with empty `violations` and correct `MapStats` on a passing case

### Implementation for User Story 1

- [ ] T026 [US1] Implement `value-noise` in `packages/terrain/src/value-noise.ts` — pure `valueNoise(x: number, y: number, seed: number): number` using a deterministic integer hash (`((x * 0x27D4EB2D) ^ (y * 0x165667B1) ^ seed) >>> 0`) at each lattice point + integer bilinear interpolation on the four corners; output scaled to `[0, 255]` via `| 0` floor; no `Math.sin`/`Math.cos` in the hot path; JSDoc with FR-001/006 references (depends on T011)
- [ ] T027 [US1] Implement `fbm` in `packages/terrain/src/fbm.ts` — pure `fbm(x: number, y: number, seed: number, octaves: number, persistence: number): number` summing `valueNoise` at increasing frequencies with decreasing amplitude (default `lacunarity = 2`, integer step count); output normalized to `[0, 255]`; JSDoc cites research.md §1 (depends on T026)
- [ ] T028 [US1] Implement `elevation` in `packages/terrain/src/elevation.ts` — pure `generateElevationMap(rng, width, height, settings)` that (a) builds the full fBm heightmap via `fbm`, (b) calls `_enforcePointSymmetry` to mirror the right half to the left, (c) returns the symmetric `Uint8Array`; `_enforcePointSymmetry(elev, width)` is the in-place symmetry enforcement helper (loops over the left half, copies each value to its 180° partner; depends on T016, T027, T014)
- [ ] T029 [US1] Implement `water` in `packages/terrain/src/water.ts` — pure `extractWater(elev, width, height, waterRatio): Uint8Array` that (a) creates `[index, elevation]` pairs, (b) sorts by elevation ascending (stable sort — ECMA-262 §23.1.3.30), (c) marks the lowest `Math.floor(waterRatio × totalCells)` cells as water (1) and the rest as land (0); output is a parallel mask `Uint8Array` of identical shape; JSDoc cites FR-003 (depends on T011)
- [ ] T030 [US1] Implement `board` builder in `packages/terrain/src/board.ts` — pure `buildBoard(elev, water, width, height): Board` that converts the two `Uint8Array` intermediates into the engine's `Cell[]` shape (one `Cell` per `(x, y)` with `elevation` from `elev` and `terrain` derived from `water`), wraps into a `Board` with `cities: []` (cities land in Phase 4), and returns `Readonly<Board>`; also `assertBoardMatchesConfig(board, config)` mirroring the engine-side check (square, sized, every cell's `terrain` is `'land' | 'water'`, every `CityPlacement` is on land) — for US1, the city-on-land check is a no-op since `cities` is empty (depends on T029)
- [ ] T031 [US1] Implement `validate` in `packages/terrain/src/validate.ts` — pure `validateBoard(board, settings, playerCount): ValidationReport` that runs all 15 invariants from `data-model.md` §11 (INV-1..INV-15) in a fixed order, collects `Violation`s into a `ReadonlyArray<Violation>`, computes `MapStats` (`waterRatio`, `elevationVariance`, `largestWaterPool`, `numWaterPools`, `numCities`, `minCitySeparation`, `minCityWaterSeparation`), and returns the `ValidationReport`; JSDoc maps each invariant to its data-model ID (depends on T030, T018)
- [ ] T032 [US1] Implement `generate` orchestrator in `packages/terrain/src/generate.ts` — pure `generateBoard(req): TerrainGenerationResult` that (a) validates the request via `validateSettings` (throws `GenerationError({ kind: 'invalid_request' })` on shape violation), (b) derives substream from `req.rng` via `deriveSubstream`, (c) for `attempt ∈ [0, maxRegenAttempts)`: derives attempt seed via `mixSeed`, calls `generateElevationMap` + `extractWater` + `buildBoard` (with empty `cities: []` for US1), calls `validateBoard`, on first valid attempt returns `{ board, effectiveSeed: attemptSeed, startingCitiesByPlayer: emptyRecord }`, on exhaustion throws `GenerationError({ kind: 'attempts_exhausted', attempts: maxRegenAttempts, lastReport })`; JSDoc cites FR-007 + FR-009 (depends on T014, T015, T017, T028, T029, T030, T031)
- [ ] T033 [P] [US1] Write end-to-end unit test for `generateBoard` in `packages/terrain/tests/unit/generate.test.ts` — happy path (32×32, 2 players, `DEFAULT_GENERATION_SETTINGS`, seed=42 → returns valid `Board`, `effectiveSeed === 42`, `board.cities.length === 0` for US1), invalid request (`boardSize: 4` → `GenerationError({ kind: 'invalid_request' })`), request with zero `playerCount` (rejected), snapshot test against `SEED_C0FFEE` golden hash (depends on T032, T019)
- [ ] T034 [P] [US2] Write determinism integration test in `packages/terrain/tests/integration/determinism.test.ts` — 1000 trials using `goldenSeeds(1000)`: for each seed, construct two parallel `Rng` instances, call `generateBoard` on each, assert `hashBoard(board1) === hashBoard(board2)` and `effectiveSeed1 === effectiveSeed2`; covers SC-001 (per `quickstart.md` Q-T01, strengthened from 100 → 1000 trials), FR-006, and US2 acceptance scenarios 1 & 2 (byte-identical + distinct seeds → distinct outputs); explicitly tagged `[US2]` as the one test directly exercising the Reproducibility story (depends on T032, T019)
- [ ] T035 [P] [US1] Write balance integration test in `packages/terrain/tests/integration/balance.test.ts` — 100 trials using `goldenSeeds(100)`: for each seed, call `generateBoard`, assert (a) elevation variance > 100 (INV-14 / US3 AC-2), (b) water ratio within ±10% of `DEFAULT_GENERATION_SETTINGS.waterRatio` (US3 AC-1, FR-008 / INV-13), (c) every cell is 180°-symmetric to its partner for both `elevation` and `terrain` (FR-004 / INV-5/6), (d) `largestWaterPool >= 4` (FR-003 / INV-15) — covers SC-004 (statistical suite, per `quickstart.md` §4); for US1 `cities` is empty so city-specific assertions are deferred to Phase 4 (depends on T032, T019)

**Checkpoint**: User Story 1 is fully functional and independently testable. `pnpm --filter @europa/terrain test` runs all US1 unit + integration tests green; `generateBoard` returns a deterministic, symmetric, validated `Board` (zero cities) for any seed. The MVP is demonstrable via `quickstart.md` §3 (with the `cities: 0` caveat called out). The engine-side `createWorld` will accept this board (it has the right shape; cities can be added later).

---

## Phase 4: User Story 2 - City Placement (Priority: P1)

**Goal**: Layer in fair, per-player, point-symmetric city placement. `_placeCities` is called from `generateBoard` after `buildBoard` and before `validateBoard`. Cities respect the spawn-band + max-Chebyshev-distance-from-center strategy, the min-spacing-from-water and min-spacing-between-cities constraints (FR-005, INV-7/8/10/11), and the 180° rotational symmetry across all players (FR-004, INV-9).

**Independent Test**: After Phase 4 lands, run the Phase 3 `generate.test.ts` happy-path test updated to assert `board.cities.length === playerCount × settings.citiesPerPlayer === 2` and that each city is on a `land` cell. Re-run the `balance.test.ts` (T035) extended to assert (e) every city has Chebyshev distance ≥ 3 to any water cell, (f) every pair of cities has Chebyshev distance ≥ 5, (g) every player-1 city has a player-2 city at its 180°-rotated coord (INV-9, US1 AC-2).

### Tests for User Story 2

> Write these FIRST; each should FAIL until its corresponding implementation task lands.

- [ ] T036 [P] [US1] Write failing unit tests for `city-band` in `packages/terrain/tests/unit/city-band.test.ts` — covers the per-player band geometry: for 2 players, two equal-area horizontal bands; for 4 players, four equal-area quadrants; for 3 players, the center band is its own 180° partner; every cell of the map falls in exactly one band
- [ ] T037 [P] [US1] Write failing unit tests for `city-placement` in `packages/terrain/tests/unit/city-placement.test.ts` — covers FR-005 + INV-7/8/10/11: every city is on a `land` cell (INV-8), every city has Chebyshev distance ≥ `minCityWaterDistance` to any water cell (INV-10), every pair of cities has Chebyshev distance ≥ `minCityCityDistance` (INV-11), city count exactly `playerCount × citiesPerPlayer` (INV-7), within a band the max-distance-from-center strategy is honored (cities are at the periphery of their band, not near the center)
- [ ] T038 [P] [US1] Write failing unit tests for `city-symmetry` in `packages/terrain/tests/unit/city-symmetry.test.ts` — covers FR-004 + INV-9: for 2 players, every player-1 city has a player-2 city at its 180°-rotated coord byte-for-byte; for 4 players, each quadrant's cities map to the diagonally-opposite quadrant's cities; for 3 players, the center band's cities are self-symmetric (player 3's cities are their own 180° partners); the full placement is invariant under the same 180° rotation as the elevation field

### Implementation for User Story 2

- [ ] T039 [US1] Implement `city-band` in `packages/terrain/src/city-band.ts` — pure `getPlayerBand(playerId, playerCount, width, height): { xMin, xMax, yMin, yMax }` returning the rectangular spawn band for a given player; for 2 players, two horizontal bands split at `height/2`; for 4 players, four quadrants at `width/2` and `height/2`; for 3 players, three horizontal bands with the middle band self-symmetric; JSDoc cites research.md §4 (depends on T011, T016)
- [ ] T040 [US1] Implement `city-count` in `packages/terrain/src/city-count.ts` — pure `resolveCityCount(settings): number` returning `clamp(settings.citiesPerPlayer, 1, 4)` × `playerCount`; the actual range-clamping math is in `clamp.ts` (US3 / T046), this is the small adapter that multiplies by `playerCount` and exposes the result (depends on T015)
- [ ] T041 [US1] Implement `city-placement` in `packages/terrain/src/city-placement.ts` — pure `placeCitiesInBand(elev, water, width, height, band, settings, rng): ReadonlyArray<{ cell: Coord; owner: PlayerId }>` that (a) enumerates all `land` cells within the band, (b) computes their Chebyshev distance to the map center, (c) sorts by distance descending, (d) iterates and picks the first K cells (= `citiesPerPlayer`) that satisfy min-spacing-from-water and min-spacing-from-already-picked-cells; uses `rng` only for tie-breaking between equal-distance candidates (the prompt's RNG mandate: terrain advances the engine's PRNG, no separate instance); JSDoc cites FR-005 (depends on T039, T014, T029)
- [ ] T042 [US1] Implement `city-symmetry` in `packages/terrain/src/city-symmetry.ts` — pure `enforceCitySymmetry(placed, width, height, playerCount): ReadonlyArray<{ cell: Coord; owner: PlayerId }>` that (a) for each player-1 city, computes its 180° partner coord, (b) assigns that partner to the opposite player (player 2 for 2p, diagonal-opposite player for 4p, self for the center band in 3p), (c) returns the symmetrized flat list ready for `Board.cities`; the symmetry is mathematical (180° rotation by construction), not a post-hoc check (depends on T041, T016)
- [ ] T043 [US1] Wire `city-*` into `generate.ts` (`packages/terrain/src/generate.ts`) — after `buildBoard` and before `validateBoard`, call `getPlayerBand` for each player, `placeCitiesInBand` for each player's band, then `enforceCitySymmetry` over the full list; pass the resulting `cities` into the `Board` constructor (replacing the US1 `cities: []` placeholder); thread the city count into `ValidationReport.attemptsUsed` and `MapStats`; update the `startingCitiesByPlayer` field of the result to group by owner; JSDoc the updated flow (depends on T032, T039, T040, T041, T042)

**Checkpoint**: User Stories 1 AND 2 work together. `generateBoard` now returns a fully-populated, symmetric, validated `Board` with cities. Re-run T033/T034/T035 — all green. `quickstart.md` Q-T03 (city symmetry) and Q-T04 (city connectivity) are now runnable. The MVP scope from `AGENTS.md` (matchmaking → battle → victory) is fully unblocked: a generated board can drive `createWorld` and the engine's tick loop.

---

## Phase 5: User Story 3 - Tunable Balance (Priority: P2)

**Goal**: Add the range-clamping math for all `GenerationSettings` fields per FR-008. Out-of-range inputs are clamped to safe ranges, NOT rejected. The clamped values are recorded in the `ValidationReport.stats` (and via the future `effectiveSettings` field if the PM approves an additive change) so callers can see what was actually used.

**Independent Test**: Call `generateBoard` with `settings: { waterRatio: 0.99, roughness: 0.0, octaves: 100, citiesPerPlayer: 99, ...DEFAULT_GENERATION_SETTINGS }` — all out-of-range fields are clamped to their safe range; the generated `Board` is valid; `MapStats` shows the clamped values.

### Tests for User Story 3

> Write these FIRST; each should FAIL until its corresponding implementation task lands.

- [ ] T044 [P] [US3] Write failing unit tests for `clamp` in `packages/terrain/tests/unit/clamp.test.ts` — covers every range boundary for every field from `data-model.md` §2: `waterRatio` [0.02, 0.25], `roughness` [0.1, 0.9], `octaves` [1, 6] (integer), `citiesPerPlayer` [1, 4] (integer), `minCityWaterDistance` [1, 6] (integer), `minCityCityDistance` [2, 10] (integer), `maxRegenAttempts` [1, 10] (integer, per `data-model.md` §2); for each field, test the lower-bound, upper-bound, below-lower, above-upper, and mid-range values; both inclusive ends must be valid (i.e., `clamp(0.02, 0.02, 0.25) === 0.02`)

### Implementation for User Story 3

- [ ] T045 [US3] Implement `clamp` in `packages/terrain/src/clamp.ts` — pure `clampSettings(s: GenerationSettings): GenerationSettings` returning a new `GenerationSettings` with every field clamped to its safe range per `data-model.md` §2; uses `Math.max(min, Math.min(max, value))` for floats and integer-truncating variants for the integer fields; exports individual `clampWaterRatio`, `clampRoughness`, `clampOctaves`, `clampCitiesPerPlayer`, `clampMinCityWaterDistance`, `clampMinCityCityDistance`, `clampMaxRegenAttempts` helpers (one per field, each pure) so the unit tests can target them in isolation; JSDoc cites FR-008 (depends on T011)
- [ ] T046 [US3] Integrate `clamp` into `generate.ts` (`packages/terrain/src/generate.ts`) — call `clampSettings` at the top of `generateBoard`, replace the `req.settings` reference with the clamped version for the rest of the pipeline, and surface the clamped values via `ValidationReport.stats` (extend `MapStats` if needed, or add a new `effectiveSettings: GenerationSettings` field — added in this task per FR-008); the `effectiveSettings` field is REQUIRED for callers to verify what was actually used (FR-008 spirit) (depends on T032, T043, T045)
- [ ] T047 [P] [US3] Write clamp integration test in `packages/terrain/tests/integration/clamp-integration.test.ts` — call `generateBoard` with deliberately out-of-range `settings` (e.g., `waterRatio: 0.99`, `octaves: 100`, `citiesPerPlayer: 99`); assert the generated `Board` is valid AND that the reported `effectiveSettings` (or `MapStats` if `effectiveSettings` is not added) shows the clamped values; covers FR-008 end-to-end (depends on T046)

**Checkpoint**: User Stories 1, 2, AND 3 all work together. `generateBoard` accepts any input shape and always returns a valid board (within safe ranges). All out-of-range settings are silently clamped and reported. T044 (unit) and T047 (integration) both green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting deliverables that don't belong to a single user story: error message ergonomics, the engine-conformance integration test, the SC-001/SC-002/SC-003 success-criteria integration tests, a terrain package README, and CI. Also the final pre-merge verification gate.

- [ ] T048 [P] Write `packages/terrain/tests/integration/contract-conformance.test.ts` — 1000 generated Boards all pass the engine's `assertBoardMatchesConfig` (imported from `@europa/engine`); covers Q-T08 from `quickstart.md` and the engine ↔ terrain conformance gate from `engine-to-terrain.ts`; depends on T046, T019
- [ ] T049 [P] Write `packages/terrain/tests/integration/sc-001-determinism.test.ts` — extended determinism test that asserts `hashBoard` byte-identity over 10,000 different seeds (stronger than Q-T01's 1000); re-uses the Phase 3 test logic but at 10× scale; reported numbers feed the constitution Principle II determinism gate (depends on T046, T019)
- [ ] T050 [P] Write `packages/terrain/tests/integration/sc-002-balance.test.ts` — 1000-map balance suite asserting all of: water ratio within ±10% of target, elevation variance > 100, city count exact per `playerCount × citiesPerPlayer`, every pair of cities separated by ≥ `minCityCityDistance`, every city separated from water by ≥ `minCityWaterDistance`, point symmetry preserved across all layers; covers SC-002 (100% valid maps) and SC-004 (statistical suite) (depends on T046, T019)
- [ ] T051 [P] Write `packages/terrain/tests/integration/sc-003-performance.test.ts` — 32×32 / 2-player / `DEFAULT_GENERATION_SETTINGS` generation completes in under **1000 ms** (p99 over 100 trials) per committed `spec.md` SC-003 / `quickstart.md` Q-T07; depends on T046, T019
- [ ] T052 [P] Write `packages/terrain/tests/unit/symmetry.test.ts` — round-trip property test: for every cell `(x, y)` in any generated `Board`, the 180°-rotated partner's `elevation` and `terrain` are byte-identical to the original (covers INV-5/6 at the test level, independent of the `_enforcePointSymmetry` unit test which tests the helper directly); 100 random seeds × full board scan (depends on T046, T019)
- [ ] T053 [P] Write `packages/terrain/README.md` — documents install (`pnpm install` from repo root), build (`pnpm --filter @europa/terrain build`), test (`pnpm --filter @europa/terrain test`), coverage (`pnpm --filter @europa/terrain test --coverage`), a minimal usage example mirroring `quickstart.md` §3 smoke REPL, the public API surface (links to `dist/index.d.ts`), and a "Determinism" note explaining the engine PRNG contract
- [ ] T054 [P] Add root `.github/workflows/terrain-ci.yml` — runs `pnpm install`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r format:check`, `pnpm --filter @europa/terrain test`, `pnpm --filter @europa/terrain test --coverage`; coverage threshold 80% enforced (matches feature 001's CI gate); SHA-pinned `actions/checkout@v4` and `pnpm/action-setup@v4` per the `github-actions` skill; minimal permissions (`contents: read`); depends on T048–T052
- [ ] T055 Run full quickstart validation against `.specify/features/003-procedural-terrain-generation/quickstart.md` — execute Q-T01 through Q-T08 per §3 smoke REPL; confirm the acceptance criteria table in §4 maps green-to-green; flip spec status from `Draft` → `Planned` → `Implemented` in `.specify/features/003-procedural-terrain-generation/spec.md` per AGENTS.md; update `AGENTS.md` Current state section to reflect feature 003 phase 6 done; depends on T046, T053
- [ ] T056 Run final pre-merge verification per `code-quality` skill checklist — full test suite green, lint clean, typecheck clean, build succeeds, coverage ≥80% on `packages/terrain/src/`, all integration tests green (T048, T049, T050, T051), no `any` types, no lint suppressions anywhere, no debug `console.log` left behind, every public function has a JSDoc doc comment, all FR-001..FR-009 acceptance tests green, all SC-001..SC-004 success criteria measurable green (depends on T055)

**Checkpoint**: Terrain package is production-ready as a published library. CI is green, coverage gate enforced, determinism proven at 10× the SC-001 scale, perf budget met, all three user stories (pipeline / cities / clamping) deliver their independent test criteria. Ready to merge `001-europa-core` and unblock feature 006 (matchmaking → battle → victory).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**. The public surface, `GenerationError`, the RNG adapter, the symmetry helper, and the test fixtures are imported by every downstream task.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - User stories can proceed in parallel once Foundational is done (different files, minimal cross-story coupling beyond the `generate.ts` wiring).
  - The canonical sequential order matches the prompt's pipeline order (US1 → US2 → US3).
- **Polish (Phase 6)**: Depends on all three user stories being complete (the conformance and SC tests exercise the full pipeline end-to-end).

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories. Brings up the generation skeleton: `value-noise` → `fbm` → `elevation` → `water` → `board` → `validate` → `generate`. The MVP produces a zero-city `Board` (cities land in US2).
- **User Story 2 (P1)**: Can start after US1's `generate.ts` lands (T032). Adds `city-band` → `city-count` → `city-placement` → `city-symmetry` and wires them into `generate.ts` between `buildBoard` and `validateBoard`. Tightly coupled to US1's `extractWater` output (city placement reads the water mask).
- **User Story 3 (P2)**: Can start after US2's `generate.ts` wiring lands (T043). Adds `clamp.ts` and threads it through `generate.ts` at the top of the pipeline. Independent of US1/US2's algorithm logic; the only coupling is the `generate.ts` integration point (T046).

### Within Each User Story

- Tests are written first (must FAIL before implementation), per the spec-kit template and AGENTS.md "Subagent reliability" note (TDD discipline, tests are the spec).
- Algorithm phase modules before the orchestrator that uses them.
- The orchestrator (`generate.ts`) before the integration tests that exercise end-to-end flows.
- Story completes (all its tasks green) before moving to the next priority.

### Parallel Opportunities

- **Setup**: All new package config files touch distinct paths → all are `[P]`-safe. T001–T004 are verification-only (root configs already present from feature 001).
- **Foundational**: Types, constants, errors, RNG adapter, settings, symmetry, and fixtures touch different files → all are `[P]`. T017 (the barrel `index.ts`) depends on T011–T016, so it serializes after its sources.
- **Within each user story**: All test tasks `[P]` (different files, no impl deps yet). Within US1, the impl modules `value-noise` → `fbm` → `elevation` → `water` → `board` → `validate` → `generate` chain in a fixed order (each consumes the previous). The integration tests in US1 (T033, T034, T035) `[P]` after T032 lands.
- **Across user stories (with multiple dispatchers)**: Once US1's `generate.ts` (T032) lands, US2's `city-*` modules and tests can fan out (different files from US1's hot path). The single shared `generate.ts` is the synchronization point: US2's wiring task (T043) must wait for US1 to merge cleanly; US3's wiring task (T046) must wait for US2.
- **Polish**: `contract-conformance`, `sc-001-determinism`, `sc-002-balance`, `sc-003-performance`, `symmetry` (unit), `README`, and `terrain-ci.yml` all touch different files → most `[P]`. T055 (run quickstart validation) and T056 (final pre-merge gate) serialize.

---

## Parallel Examples

### Parallel Example: User Story 1

```bash
# Launch all US1 failing tests first (independent files, must fail before impl):
Task: "Write failing tests for value-noise in packages/terrain/tests/unit/value-noise.test.ts"
Task: "Write failing tests for fbm in packages/terrain/tests/unit/fbm.test.ts"
Task: "Write failing tests for elevation in packages/terrain/tests/unit/elevation.test.ts"
Task: "Write failing tests for water in packages/terrain/tests/unit/water.test.ts"
Task: "Write failing tests for board in packages/terrain/tests/unit/board.test.ts"
Task: "Write failing tests for validate in packages/terrain/tests/unit/validate.test.ts"

# Then launch the algorithm modules in dependency order
# (value-noise → fbm is the only true ordering; the rest can fan out):
Task: "Implement value-noise in packages/terrain/src/value-noise.ts"
Task: "Implement fbm in packages/terrain/src/fbm.ts"               # depends on T026
Task: "Implement elevation in packages/terrain/src/elevation.ts"   # depends on T027
Task: "Implement water in packages/terrain/src/water.ts"           # independent
Task: "Implement board in packages/terrain/src/board.ts"           # depends on T029
Task: "Implement validate in packages/terrain/src/validate.ts"     # depends on T030
Task: "Implement generate in packages/terrain/src/generate.ts"     # depends on all above

# Finally, after generate lands (T032), run all end-to-end tests in parallel:
Task: "End-to-end unit test for generateBoard in packages/terrain/tests/unit/generate.test.ts"
Task: "Determinism integration test in packages/terrain/tests/integration/determinism.test.ts"
Task: "Balance integration test in packages/terrain/tests/integration/balance.test.ts"
```

### Parallel Example: User Story 2

```bash
# Tests for city-band, city-placement, city-symmetry in parallel (independent files):
Task: "Write failing tests for city-band in packages/terrain/tests/unit/city-band.test.ts"
Task: "Write failing tests for city-placement in packages/terrain/tests/unit/city-placement.test.ts"
Task: "Write failing tests for city-symmetry in packages/terrain/tests/unit/city-symmetry.test.ts"

# Implementation in dependency order (band → placement → symmetry, count is independent):
Task: "Implement city-band in packages/terrain/src/city-band.ts"
Task: "Implement city-count in packages/terrain/src/city-count.ts"           # independent
Task: "Implement city-placement in packages/terrain/src/city-placement.ts"   # depends on T039
Task: "Implement city-symmetry in packages/terrain/src/city-symmetry.ts"     # depends on T041
```

### Parallel Example: Polish Phase

```bash
# Most Polish tasks touch different files:
Task: "Write contract-conformance test in packages/terrain/tests/integration/contract-conformance.test.ts"
Task: "Write SC-001 determinism test in packages/terrain/tests/integration/sc-001-determinism.test.ts"
Task: "Write SC-002 balance test in packages/terrain/tests/integration/sc-002-balance.test.ts"
Task: "Write SC-003 performance test in packages/terrain/tests/integration/sc-003-performance.test.ts"
Task: "Write symmetry unit test in packages/terrain/tests/unit/symmetry.test.ts"
Task: "Write terrain package README in packages/terrain/README.md"
Task: "Add CI workflow in .github/workflows/terrain-ci.yml"
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3)

The MVP for feature 003 is **Phase 1 + Phase 2 + Phase 3 (US1)**. It delivers the deterministic, symmetric, validated terrain pipeline that produces a zero-city `Board` for any seed. The MVP proves:

1. The `packages/terrain` package scaffolding is sound.
2. The deterministic generation pipeline works headlessly.
3. The package's public surface (`generateBoard`, `validateBoard`, `hashBoard`, `assertBoardMatchesConfig`, all types) is importable from `@europa/terrain`.
4. SC-001 (determinism) is satisfied at the Phase 3 scale (1000 trials).
5. INV-1 through INV-6 + INV-13 + INV-14 + INV-15 (the no-city invariants) all pass on every generated board.

**MVP delivery sequence:**

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: `pnpm --filter @europa/terrain test` runs T020–T035 green; coverage ≥80% on `value-noise.ts` + `fbm.ts` + `elevation.ts` + `water.ts` + `board.ts` + `validate.ts` + `generate.ts`; `hashBoard` stable across two identical runs.
5. Do NOT proceed to US2/US3 until US1 is merged. Note: the MVP `Board.cities` is `[]`; the engine-side `createWorld` will accept this (cities can be added later by feature 006 or the US2 follow-up). The MVP is sufficient to unblock feature 006's matchmaking wiring (the engine's `createWorld` works without cities; feature 006 adds them at match start).

### Incremental Delivery

1. **Setup + Foundational** → `pnpm install` clean, `pnpm build` produces `dist/`, types and errors importable.
2. **+ User Story 1** → MVP! `generateBoard` produces a deterministic, symmetric, validated `Board` (zero cities).
3. **+ User Story 2** → `generateBoard` produces a full `Board` with fair, symmetric, connected cities. The engine-side `createWorld` can now start a real match.
4. **+ User Story 3** → `generateBoard` accepts any input shape; out-of-range settings are clamped and reported.
5. **+ Polish** → Conformance test, SC-001/002/003 stress tests, README, CI, final verification.

Each story adds value without breaking the previous story's acceptance tests.

### Parallel Team Strategy

With multiple dispatchers (the recommended approach for a feature this size per the `orchestration` skill):

1. **Phase 1 + 2** together (foundational setup is sequential by nature).
2. **Phase 3** by a single dispatcher (the algorithm chain `value-noise → fbm → elevation → water → board → validate → generate` has tight within-phase ordering; the integration tests at the tail can fan out).
3. **Phase 4** by a single dispatcher (the city modules have a small chain; the wiring into `generate.ts` is the synchronization point).
4. **Phase 5** by a single dispatcher (just `clamp.ts` + integration into `generate.ts`).
5. **Phase 6** by a single dispatcher OR fanned out (most Polish tasks are independent files).

The single shared `generate.ts` is the synchronization point: US1 wires the orchestrator, US2 extends it with cities, US3 extends it with clamping. Each wiring task must wait for the previous one to merge cleanly. This is the one serialization constraint across the otherwise-parallel story implementations.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks. Verify before marking `[P]`.
- `[Story]` label maps task to user story for traceability. Setup / Foundational / Polish tasks MUST NOT carry a story label.
- Each user story is independently completable and testable via its quickstart tests (Q-T01..Q-T08 in `quickstart.md`).
- Tests are written first and must FAIL before implementation lands — this is TDD per constitution Principle III and the spec-kit template's "Tests first" rule.
- Commit after each task or logical group; conventional-commit messages per AGENTS.md (e.g., `feat(terrain): implement fBm value noise (US1)`).
- Stop at any checkpoint to validate the story independently before moving on.
- **Avoid**: vague tasks, same-file conflicts (multiple tasks writing to `generate.ts` simultaneously), cross-story dependencies that break the independent-testability guarantee.
- **Subagent reliability** (AGENTS.md note): tasks target one file each wherever possible; large files like `generate.ts` are split per-phase (US1 wires the orchestrator, US2 adds cities, US3 adds clamping) so a single dispatch edits only its phase's addition.
- File paths are derived from `plan.md` §"Project Structure" (with the prompt's more granular breakdown applied: `value-noise.ts` / `fbm.ts` / `elevation.ts` are separate files per the prompt's Phase 3, vs. plan.md's single `noise.ts`).
- **Licensing hygiene**: the `europa-source/` archive is read-only reference material (AGENTS.md rule 5); no terrain file is derived from its code (per the spec's "GeoMorph algorithm unknown and does not need replicating" assumption).

---

## PM Handoff (Items Requiring Product Decision)

The following items surfaced during tasks drafting that warrant explicit PM attention before phase 6 implementation begins. They are NOT blockers — phase 6 can proceed with the decisions noted in the task descriptions — but the PM should be aware.

1. **`maxRegenAttempts` safe range**: `data-model.md` §2 lists `[1, 10]`; the prompt's Phase 5 description said `[1, 16]`. **PM ruling (committed in `m0099`–`m0100`)**: data-model is authoritative. T044 updated to `[1, 10]`. No further action needed.

2. **`effectiveSettings` field on `ValidationReport`**: FR-008 says "settings are configurable with safe clamping" but the existing `MapStats` interface (in `contracts/terrain-types.ts`) does not carry the clamped settings. T046 proposes adding `effectiveSettings: GenerationSettings`. **PM ruling (committed in `m0102`)**: approved as an additive contract change. Implemented in T046; FR-008 satisfied. No further action needed.

3. **SC-003 perf threshold**: the prompt's Phase 6 said "< 200ms"; the committed `spec.md` / `plan.md` / `quickstart.md` (Q-T07) all say "< 1000 ms". **PM ruling (committed in `m0101`)**: the prompt was a typo. Spec/plan/quickstart are authoritative. T051 uses 1000 ms. No further action needed.

4. **MVP scope — zero cities**: T033's "happy path" asserts `board.cities.length === 0` for US1. The prompt's "MVP scope" implies cities are part of the US1 deliverable, but the phase structure places cities in US2. **PM ruling**: phase split is correct — the MVP demonstrable is "generate a symmetric, validated `Board` with no cities" (US1), with cities added in US2. The engine's `createWorld` accepts a board with `cities: []` and feature 006 can use it as a placeholder. No further action needed.

5. **Story label remapping**: this tasks.md originally used `[US1]`/`[US2]`/`[US3]` to label the prompt's three pipeline phases (Generation Pipeline / City Placement / Tunable Balance), NOT the spec's three user stories. **PM ruling (committed in `m0089`, `m0092`–`m0099`)**: remapped to spec stories:
   - Phase 3 (Generation Pipeline) → `[US1]` for board-level tasks; T034 (determinism integration test) specifically `[US2]`.
   - Phase 4 (City Placement) → `[US1]` (cities are part of Balanced Symmetric Maps).
   - Phase 5 (Clamping) → `[US3]` (Configurable Character).
   - Spec US2 (Reproducibility) is achieved architecturally (sfc32 stream, integer-only math, no Math.random) and verified by T034 + T049. No further action needed.
