# Tasks: Core Game Engine

**Input**: Design documents from `.specify/features/001-core-game-engine/`
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Branch**: `001-europa-core`
**Spec**: [spec.md](./spec.md) — 5 user stories (P1×2, P2×2, P3×1) and 19 functional requirements

**Tests**: REQUIRED. Constitution Principle III mandates ≥80% coverage on game logic as a merge gate, and `research.md` §10 specifies "each resolution rule in its own module + its own test file". Tests are interleaved with implementation tasks per the spec-kit template (tests first, then impl, then quickstart).

**Organization**: Tasks are grouped by user story (P1 → P2 → P3) so each story can be implemented, tested, and validated independently. Foundation phase contains cross-cutting infrastructure that blocks all stories. Polish phase handles serialization, determinism, perf, and CI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`[US1]`–`[US5]`); REQUIRED for user story phases only
- Include exact file paths in descriptions — every task targets a specific file under the future monorepo

## Path Conventions

Monorepo paths per `plan.md` §"Project Structure". The engine package lives at `packages/engine/`. All file paths below are the actual future locations in the monorepo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the pnpm monorepo skeleton and the `@europa/engine` package scaffolding. No business logic yet.

- [ ] T001 Create `pnpm-workspace.yaml` at repo root with `packages: ["packages/*"]`
- [ ] T002 [P] Create root `package.json` with workspace scripts (`build`, `test`, `lint`, `format`, `typecheck`, `coverage`) and `packageManager: pnpm@11.x` pinned via `packageManager` field
- [ ] T003 [P] Create root `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`
- [ ] T004 [P] Create root `biome.json` with `noExplicitAny: error`, formatter + linter config; extendable via `extends: ["//"]`
- [ ] T005 [P] Create `packages/engine/package.json` with `name: "@europa/engine"`, `type: "module"`, `exports` map, devDependencies on `tsup@^8`, `vitest@^4.1`, `@biomejs/biome@^2`, `typescript@^5.6` (all pinned via pnpm catalog)
- [ ] T006 [P] Create `packages/engine/tsconfig.json` extending `../../tsconfig.base.json` with `outDir: "./dist"`, `rootDir: "./src"`, `noEmit: false`
- [ ] T007 [P] Create `packages/engine/vitest.config.ts` with v8 coverage provider, `thresholds.lines/functions/branches/statements: 80`, include `tests/**/*.test.ts`
- [ ] T008 [P] Create `packages/engine/tsup.config.ts` with `entry: ["src/index.ts"]`, `format: ["esm"]`, `dts: true`, `clean: true`
- [ ] T009 [P] Create `packages/engine/biome.json` with `extends: ["//"]`
- [ ] T010 [P] Create `packages/engine/src/` and `packages/engine/tests/{unit,fixtures,quickstart,perf}/` directories

**Checkpoint**: `pnpm install` runs cleanly; `pnpm --filter @europa/engine build` produces `dist/` (empty); `pnpm --filter @europa/engine test` runs (zero tests, exits 0).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure that EVERY user story depends on — types, constants, PRNG, event builders, fixtures, and the public surface. **No user story work can begin until this phase is complete.**

**⚠️ CRITICAL**: This phase produces the static types, the central tunable-constants location (SC-005), and the deterministic PRNG (FR-017). Every resolution rule imports from `constants.ts`; every consumer package imports types from `@europa/engine`.

- [ ] T011 [P] Create `packages/engine/src/types.ts` re-exporting the full surface of `contracts/engine-types.ts` (every interface, type alias, and `ENGINE_API_VERSION` constant)
- [ ] T012 [P] Create `packages/engine/src/constants.ts` exporting `ENGINE_CONSTANTS` with every numeric rule per `research.md` §9 + `engine-api.ts` `EngineConstants` interface (productionRate, cityCapacity, cellCapacity, decayPerTick, flowDownhillFactor, flowUphillFactor, flowBase, paratroopCost, gunCost, gunDamage, visibilityRadiusDefault, plus `DEFAULT_TICK_INTERVAL_MS = 250`)
- [ ] T013 [P] Create `packages/engine/src/rng.ts` implementing sfc32 (128-bit PRNG, integer-only ops) plus `xmur3` string-seed helper; exports `createRng(seed: number): () => number` and `hashSeed(seed: number): Uint32Array` (length 4)
- [ ] T014 [P] Create `packages/engine/src/events.ts` with pure builder helpers: `emptyTickEvents(): TickEvents`, `pushCombatEvent`, `pushCaptureEvent`, `pushEliminationEvent`, `pushAppliedOrder` — all immutable, returning new arrays (no shared mutation)
- [ ] T015 [P] Create `packages/engine/tests/fixtures/board.ts` exporting `buildSmallBoard(size, cities)` (flat board, elevation 0, all land, cities at given `[x, y, owner]` triples) and `buildBoardWithElevation(size, elevationMap, cities)` for slope-flow tests
- [ ] T016 [P] Create `packages/engine/tests/fixtures/scenarios.ts` exporting `runScenario(cfg, board, orders[])`: creates world, applies each order batch per tick, ticks N times, returns final world; consumed by determinism and combat quickstart tests
- [ ] T017 Create `packages/engine/src/index.ts` re-exporting the full public surface: types from `./types`, constants (`ENGINE_CONSTANTS`, `EngineConstants` type), RNG helpers, event helpers, plus the API functions declared in `contracts/engine-api.ts`

**Checkpoint**: `pnpm --filter @europa/engine build` succeeds and `dist/index.d.ts` matches `contracts/engine-types.ts` shape; `pnpm --filter @europa/engine test` still passes (fixtures don't run as tests yet but typecheck cleanly).

---

## Phase 3: User Story 1 - Tick Simulation Drives Production and Flow (Priority: P1) 🎯 MVP

**Goal**: Deliver the core simulation loop. `createWorld` builds an initial `World` from a `Board`; `applyCommand` validates and stages orders; `tick(world)` advances one tick deterministically with city production adding troops each tick and pipes transferring troops between cells (slope-modified). Includes all public read helpers.

**Independent Test**: Build an 8×8 board with two cities, issue `setPipe` orders, call `tick(world)` N times headlessly, and assert exact troop counts per cell. Same input + same order batch → byte-identical `hashWorld` (SC-001 micro-check at small N; full 10k tick check lives in Polish phase).

### Tests for User Story 1

> Write these FIRST; each should FAIL until its corresponding implementation task lands.

- [ ] T018 [P] [US1] Write failing unit tests for `createWorld` in `packages/engine/tests/unit/create.test.ts` — covers FR-001 (square grid), FR-002 (water rejection on city placement), FR-019 (playerCount 2/3/4), board/cell-length invariants
- [ ] T019 [P] [US1] Write failing unit tests for `production` resolution in `packages/engine/tests/unit/production.test.ts` — covers FR-004 (city adds `productionRate` per tick until `cityCapacity`), edge case: pre-saturated city adds zero
- [ ] T020 [P] [US1] Write failing unit tests for `flow` resolution in `packages/engine/tests/unit/flow.test.ts` — covers FR-007 (slope factors: downhill > flat > uphill), FR-006 (4-way pipe support, exclusive mode), and water-target rejection

### Implementation for User Story 1

- [ ] T021 [US1] Implement `createWorld(config, board)` in `packages/engine/src/create.ts` — validate board invariants (square, dimensions match `config.boardSize`, cities on land), allocate flat `Uint32Array`/`Uint8Array` state per `data-model.md` §9, populate `cityOwners` from `board.cities`, initialize sfc32 with `config.seed`, return `Readonly<World>` (depends on T011, T012, T013)
- [ ] T022 [US1] Implement production phase in `packages/engine/src/resolution/production.ts` — pure `resolveProduction(state, board, constants): WorldState` adding `productionRate` troops per tick to each city cell up to `cityCapacity`, no allocation on the hot path beyond reading (depends on T011, T012)
- [ ] T023 [US1] Implement flow phase in `packages/engine/src/resolution/flow.ts` — pure `resolveFlow(state, board, constants): WorldState`; for each cell iterate its pipe mask, compute elevation delta, apply slope factor (`downhill > base > uphill`), clamp to destination capacity, integer math only (depends on T011, T012, T021)
- [ ] T024 [US1] Implement `validateCommand(world, cmd)` in `packages/engine/src/validate.ts` — exhaustive validation per FR-018; returns `{ ok: true } | { ok: false; reason: ValidationError }`; covers pipe commands (out-of-bounds, water target, not-owner) — additional rule validations land with their owning user stories (depends on T011, T021)
- [ ] T025 [US1] Implement `applyCommand(world, cmd)` in `packages/engine/src/applyCommand.ts` — pure; delegates to `validateCommand`, on success stages the order into an internal `pendingOrders` queue (preserved on the returned `world` clone); on failure returns world unchanged with the rejection reason in `result` (depends on T021, T024)
- [ ] T026 [US1] Implement read helpers in `packages/engine/src/read.ts` — `getCell`, `forEachCell`, `cellsInRange` (Chebyshev), `neighborsOf`, `getPlayer`, `alivePlayers`; decode `WorldState` flat arrays into friendly `CellView` (depends on T021)
- [ ] T027 [US1] Implement `tick(world)` orchestrator in `packages/engine/src/tick.ts` — applies staged orders in deterministic order (sort by `PlayerId` ascending then `kind` alphabetical), runs the phase pipeline (production → flow → …), returns `{ world, events, terminal? }`; for US1 only `production` and `flow` phases are wired (combat/capture/decay/para/gun/terminal phases added in later phases) (depends on T022, T023, T025, T026, T014)
- [ ] T028 [P] [US1] Quickstart Q-001 in `packages/engine/tests/quickstart/tick-to-terminal.test.ts` — proves end-to-end tick loop runs and `hashWorld` is stable across two same-input runs (depends on T027)
- [ ] T029 [P] [US1] Quickstart Q-002 in `packages/engine/tests/quickstart/production.test.ts` — asserts city saturates to `min(N × productionRate, cityCapacity)` after N ticks (depends on T027)
- [ ] T030 [P] [US1] Quickstart Q-003 in `packages/engine/tests/quickstart/slope-flow.test.ts` — three boards (downhill/flat/uphill), identical pipe orders, asserts destination counts satisfy the slope-factor ordering (depends on T027)

**Checkpoint**: User Story 1 is fully functional and independently testable. `pnpm --filter @europa/engine test` runs all Q-001/Q-002/Q-003 + unit tests green; production and flow resolve deterministically.

---

## Phase 4: User Story 2 - Attrition Combat Between Opposing Troops (Priority: P1)

**Goal**: When troops of opposing owners meet in a cell after the flow phase, resolve combat as attrition (1:1 equal losses, majority overwhelms minority). Capture transfers majority-owner forces to the cell and transfers city ownership.

**Independent Test**: Seed two adjacent cells with known opposing troop counts, open pipes in opposing directions, tick once, assert exact loss ratios and post-tick cell ownership. With overwhelming force, assert minority force is eliminated and majority retains the difference.

### Tests for User Story 2

- [ ] T031 [P] [US2] Write failing unit tests for combat resolution in `packages/engine/tests/unit/combat.test.ts` — covers FR-008 (attrition: 100v100 ≈ equal losses; 200v50 overwhelms with attacker retaining majority; symmetric regardless of order-issuing player per Edge Case)
- [ ] T032 [P] [US2] Write failing unit tests for capture in `packages/engine/tests/unit/capture.test.ts` — covers FR-005 (city ownership transfers when enemy troops occupy city cell); new owner inherits saturation state per Edge Case "city captured mid-production"

### Implementation for User Story 2

- [ ] T033 [US2] Implement combat resolution in `packages/engine/src/resolution/combat.ts` — pure `resolveCombat(state, board, constants): { state, events }`; per-cell tally of inflows by owner, deterministic owner-collision order (ascending PlayerId), emit `CombatEvent` per FR-008; majority force eliminates minority, ties resolved symmetrically (depends on T011, T012)
- [ ] T034 [US2] Implement capture in `packages/engine/src/resolution/capture.ts` — pure `resolveCapture(state, board, constants): { state, events }`; after combat settles, transfer city ownership to the now-dominant owner of that cell; emit `CaptureEvent` with `isCity` flag (depends on T033)
- [ ] T035 [US2] Wire combat and capture phases into `tick` in `packages/engine/src/tick.ts` — append them to the phase pipeline after `flow` and before any future decay phase; ensure events are appended in order (depends on T033, T034)
- [ ] T036 [P] [US2] Quickstart Q-006 in `packages/engine/tests/quickstart/combat.test.ts` — `100v100` trade; `200v50` overwhelm; assertion of `CombatEvent` payloads in returned `TickEvents` (depends on T035)

**Checkpoint**: User Stories 1 AND 2 work together. Pipes flow, opposing forces collide, attrition plays out, cells and cities transfer to the surviving owner. `hashWorld` still byte-stable across identical inputs (combat is deterministic).

---

## Phase 5: User Story 3 - Decay, Capacity, and Reserves (Priority: P2)

**Goal**: Unfed troops lose 1 per tick (decay); cells cap at `cellCapacity` (FR-011); `reserves` 0–90% in 10% steps retain that fraction of the stack before any outward flow (FR-012). Two cells piping into each other sustain indefinitely without city supply (FR-010 mutual-feeding exemption).

**Independent Test**: Single cell, no pipes, 50 troops → after 5 ticks the count is exactly 45. Two cells piping into each other, both stacks unchanged after 50 ticks. Reserves 30% on a 100-troop cell piping east → destination receives at most 70 over the tick.

### Tests for User Story 3

- [ ] T037 [P] [US3] Write failing unit tests for decay + capacity + reserves in `packages/engine/tests/unit/decay.test.ts` — covers FR-009 (1 troop/tick loss when no friendly inflow), FR-010 (mutual feeding exempts both cells), FR-011 (cap enforced on transfers), FR-012 (reserves 0–9 in 10% steps; reserves > count holds all troops per Edge Case)

### Implementation for User Story 3

- [ ] T038 [US3] Implement decay phase in `packages/engine/src/resolution/decay.ts` — pure `resolveDecay(state, board, constants): { state, events }`; compute per-cell "has friendly inflow" mask from the flow phase result, then for cells with no friendly inflow AND with troops: subtract `decayPerTick`; respect reserves (never drop below reserves floor); zero-troop cells set owner to `null`; mutual-feeding case exempted via the per-cell inflow mask (depends on T011, T012, T023)
- [ ] T039 [US3] Wire decay phase into `tick` in `packages/engine/src/tick.ts` — append after capture (depends on T038)
- [ ] T040 [P] [US3] Quickstart Q-007 in `packages/engine/tests/quickstart/decay-capacity-reserves.test.ts` — four tests: single-cell decay (-1/tick), mutual-feeding sustain, reserves 30% hold, capacity cap (depends on T039)

**Checkpoint**: User Stories 1, 2, and 3 work together. Cities produce, pipes flow with slope, combat resolves, cells cap, decay drains unfed stacks, reserves hold. Determinism preserved (all phases are pure + integer).

---

## Phase 6: User Story 4 - Paratroopers and Guns (Priority: P2)

**Goal**: Paratroopers (`2:1` cost ratio, range ≤ 2 Chebyshev, clears destination pipes on landing) and guns (cost troops, damage target occupants at tick time regardless of owner) extend tactical options beyond pipes.

**Independent Test**: Script a board with a paratrooper source 2 cells away from an enemy city with active pipes; issue a paratroop order; assert source loses `2 × N`, destination gains `N`, destination's `pipeMasks` is zero, and the `AppliedOrderRecord` reflects a successful command. Separately, fire a gun into a friendly-occupied cell and assert the friendly stack loses `gunDamage`.

### Tests for User Story 4

- [ ] T041 [P] [US4] Write failing unit tests for paratroop resolution in `packages/engine/tests/unit/paratroop.test.ts` — covers FR-013 (2:1 cost, range ≤ 2 Chebyshev, clears destination pipes), Edge Case "paratroop into water fails validation", Edge Case "reserves > count holds all" stays invariant
- [ ] T042 [P] [US4] Write failing unit tests for gun resolution in `packages/engine/tests/unit/gun.test.ts` — covers FR-014 (cost troops, damages target occupants at tick time regardless of owner, no troop movement to destination), Edge Case "gun at empty cell only spends source troops"

### Implementation for User Story 4

- [ ] T043 [US4] Implement paratroop resolution in `packages/engine/src/resolution/paratroop.ts` — pure `resolveParatroop(state, board, constants, orders): { state, events, errors }`; for each paratroop order: validate range ≤ 2 + non-water target (delegate to `validateCommand` extensions in `validate.ts`); on resolution, subtract `2 × N` from source, add `N` to target, zero the destination's `pipeMasks`, emit events (depends on T011, T012, T024)
- [ ] T044 [US4] Implement gun resolution in `packages/engine/src/resolution/gun.ts` — pure `resolveGun(state, board, constants, orders): { state, events, errors }`; for each gun order: subtract `gunCost` from source (error if insufficient); damage `gunDamage` from target occupants at tick time (regardless of owner); no troops move (depends on T011, T012, T024)
- [ ] T045 [US4] Wire paratroop and gun phases into `tick` in `packages/engine/src/tick.ts` — append after production (so source has the troops to spend) and before flow/combat (so paratroopers can clear pipes before flow reads them); gun damage applied to current-tick occupants (depends on T043, T044)
- [ ] T046 [P] [US4] Quickstart Q-008 in `packages/engine/tests/quickstart/paratroop-gun.test.ts` — paratroop 2:1 + pipe clear; out-of-range rejection; into-water rejection; gun friendly-fire; gun at empty cell (depends on T045)

**Checkpoint**: User Stories 1–4 work together. Production, flow, combat, decay, reserves, paratroops, guns all resolve deterministically. Order validation rejects the FR-018 cases (out-of-range, into-water, not-owner).

---

## Phase 7: User Story 5 - Victory and Surrender (Priority: P3)

**Goal**: Detect terminal conditions (FR-015) — a player is eliminated when they hold zero troops AND zero cities; the match ends when fewer than two players remain with status `'alive'`. Surrender (FR-016) immediately marks a player eliminated; subsequent `tick()` calls declare the survivor the winner.

**Independent Test**: Script a board where one player has no cities and a small troop stack; have the opposing player pipe into it; tick until the stack is gone; assert `isTerminal(world)` returns `{ kind: 'win', winner: <opponent>, reason: 'last_standing' }`. Separately: apply `surrender` to player 1, tick once, assert player 2 wins.

### Tests for User Story 5

- [ ] T047 [P] [US5] Write failing unit tests for terminal resolution in `packages/engine/tests/unit/terminal.test.ts` — covers FR-015 (elimination when `troopsHeld === 0 && citiesOwned === 0`), FR-016 (surrender sets status immediately, forces inert thereafter), `isTerminal` returns `undefined` for non-terminal states, returns `MatchResult` once applicable, terminal-once-frozen (further `tick()` is a no-op returning same result)

### Implementation for User Story 5

- [ ] T048 [US5] Implement terminal resolution in `packages/engine/src/resolution/terminal.ts` — pure `resolveTerminal(state, players, constants): { players, events, terminal? }`; per FR-015 detect eliminated players (zero troops AND zero cities), emit `EliminationEvent` with `reason: 'no_troops_no_cities'`; if `<2` alive remain, emit `MatchResult` (depends on T011, T012)
- [ ] T049 [US5] Implement `isTerminal(world)` in `packages/engine/src/tick.ts` — cheap pre-tick check returning `MatchResult | undefined` (does NOT advance time); surrender handling in `applyCommand` for the `surrender` order kind: mark player `'eliminated'` immediately and emit `EliminationEvent` with `reason: 'surrendered'`; frozen-once-terminal behavior in `tick` (returns input world with same `terminal` if already terminal) (depends on T048, T025)
- [ ] T050 [P] [US5] Quickstart Q-005 in `packages/engine/tests/quickstart/terminal.test.ts` — last-standing win; surrender immediately marks eliminated and triggers opponent win on next tick; mutual elimination → `draw` (depends on T049)

**Checkpoint**: All five user stories are independently functional. A scripted 2-player match runs from `createWorld` through to a `MatchResult` via deterministic ticks. `hashWorld` remains stable; byte-identical re-runs of the entire scripted scenario produce the same final state.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting deliverables that don't belong to a single user story: serialization, the SC-001 10k-tick determinism test, multi-player supplementary coverage, the SC-004 perf benchmark, CI, and final integration.

- [ ] T051 [P] Implement `serializeWorld`, `deserializeWorld`, `hashWorld` in `packages/engine/src/serialize.ts` — versioned binary format with `ENGINE_API_VERSION` header (1 byte ASCII length + bytes), reject mismatches in `deserializeWorld` with a typed error; `hashWorld` produces a stable hex string (e.g., FNV-1a over the serialized bytes) for byte-identical assertions (depends on T011, T017)
- [ ] T052 [P] Write SC-001 determinism test in `packages/engine/tests/determinism.test.ts` — runs the same scripted scenario twice for ≥10,000 ticks and asserts `serializeWorld(a)` deep-equals `serializeWorld(b)` byte-for-byte (per Q-004 acceptance scenario; depends on T051)
- [ ] T053 [P] Write 3/4-player supplementary test in `packages/engine/tests/quickstart/multi-player.test.ts` — covers FR-019 (engine API supports 2–4 players); minimal smoke test that `createWorld` + `tick` succeeds for `playerCount: 3` and `4` (v1 ships 2-player end-to-end per AGENTS.md; 3/4-player paths get lighter coverage here) (depends on T050)
- [ ] T054 [P] Write SC-004 perf benchmark in `packages/engine/tests/perf/tick-perf.bench.ts` — measures wall-clock time for `tick()` over 1000 iterations on a default 32×32 board, 2 players; asserts median < 10 ms per tick; reports numbers in the test summary so CI trends are visible (depends on T049)
- [ ] T055 [P] Add root `.github/workflows/engine-ci.yml` — runs `pnpm install`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r format:check`, `pnpm --filter @europa/engine test`, `pnpm --filter @europa/engine test --coverage`; coverage threshold 80 enforced; SHA-pinned `actions/checkout@v4` and `pnpm/action-setup@v4` per `github-actions` skill; minimal permissions (`contents: read`)
- [ ] T056 [P] Write `packages/engine/README.md` documenting install, build, test, usage example (mirrors the manual smoke from `quickstart.md` §3), public API surface link to `dist/index.d.ts`
- [ ] T057 Run full quickstart validation against `.specify/features/001-core-game-engine/quickstart.md` (execute Q-001 through Q-010 per §3 smoke REPL); confirm the acceptance criteria table in §4 maps green-to-green; flip spec status from `Draft` → `Planned` → `Implemented` in `.specify/features/001-core-game-engine/spec.md` per AGENTS.md; update `AGENTS.md` Current state section to reflect feature 001 phase 6 done
- [ ] T058 Run final pre-merge verification per `code-quality` skill checklist — full test suite, lint, typecheck, build, coverage ≥80% on `packages/engine/src/`, determinism test passes, no `any` types, no lint suppressions, no debug `console.log` left behind, all FR-001..FR-019 acceptance tests green

**Checkpoint**: Engine package is production-ready as a published library. CI is green, coverage gate enforced, determinism proven over ≥10k ticks, perf budget met, all five user stories deliver their independent test criteria.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**. The types, constants, PRNG, and event builders are imported by every downstream task.
- **User Stories (Phase 3–7)**: All depend on Foundational completion.
  - User stories can proceed in parallel once Foundational is done (different files, minimal cross-story coupling beyond `tick.ts` wiring).
  - The canonical sequential order matches spec priority (P1 → P2 → P3).
- **Polish (Phase 8)**: Depends on all five user stories being complete (serialization and determinism test exercise every resolution rule).

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories. Brings up the simulation skeleton: `createWorld`, `applyCommand`, `tick`, production, flow.
- **User Story 2 (P1)**: Can start after US1's `tick` orchestrator lands (T027). Adds combat + capture phases that run after flow. Tightly coupled to US1's flow phase (combat reads post-flow state).
- **User Story 3 (P2)**: Can start after US1's flow phase (T023) — decay reads the post-flow inflow mask. Independent of US2's combat, but US3's quickstart asserts mutual-feeding which requires US1 flow working.
- **User Story 4 (P2)**: Can start after US1's `applyCommand` (T025) — paratroop/gun are order types validated by the same machinery. Independent of US2/US3; para + gun phases run before flow in the tick pipeline.
- **User Story 5 (P3)**: Can start after US1's `applyCommand` (T025) for the surrender order, but its full quickstart (Q-005 elimination-by-combat) requires US2's combat phase. Implementation can land independently; full quickstart waits for US2.

### Within Each User Story

- Tests are written first (must FAIL before implementation), per the spec-kit template.
- Resolution rule modules before the tick wiring task that uses them.
- Tick-wiring tasks before quickstart tests that exercise end-to-end flows.
- Story completes (all its tasks green) before moving to the next priority.

### Parallel Opportunities

- **Setup**: All tasks touch distinct config files → most are `[P]`-safe.
- **Foundational**: Types, constants, RNG, events, fixtures, and `index.ts` touch different files → most `[P]`.
- **Within each user story**: All test tasks `[P]` (different files, no impl deps yet). All quickstart tests `[P]` after the story's tick-wiring task lands.
- **Across user stories (with multiple dispatchers)**: Once Foundational completes, US2/US3/US4/US5 implementations can run in parallel — each adds its own resolution module + its own tick-wiring edit. The single shared `tick.ts` file means the wiring tasks must serialize, but resolution-module impl + tests can fan out.
- **Polish**: `serialize.ts`, `determinism.test.ts`, `multi-player.test.ts`, `tick-perf.bench.ts`, `engine-ci.yml`, and `README.md` all touch different files → most `[P]`.

---

## Parallel Examples

### Parallel Example: User Story 1

```bash
# Launch all US1 failing tests first (independent files, must fail before impl):
Task: "Write failing tests for createWorld in packages/engine/tests/unit/create.test.ts"
Task: "Write failing tests for production in packages/engine/tests/unit/production.test.ts"
Task: "Write failing tests for flow in packages/engine/tests/unit/flow.test.ts"

# Then launch the three resolution+impl modules in parallel (each depends only on T011-T014):
Task: "Implement createWorld in packages/engine/src/create.ts"
Task: "Implement production in packages/engine/src/resolution/production.ts"
Task: "Implement flow in packages/engine/src/resolution/flow.ts"

# Finally, after tick wiring (T027) lands, run all three quickstart tests in parallel:
Task: "Quickstart Q-001 in packages/engine/tests/quickstart/tick-to-terminal.test.ts"
Task: "Quickstart Q-002 in packages/engine/tests/quickstart/production.test.ts"
Task: "Quickstart Q-003 in packages/engine/tests/quickstart/slope-flow.test.ts"
```

### Parallel Example: User Story 4

```bash
# Tests for paratroop and gun in parallel (independent files):
Task: "Write failing tests for paratroop in packages/engine/tests/unit/paratroop.test.ts"
Task: "Write failing tests for gun in packages/engine/tests/unit/gun.test.ts"

# Implementations in parallel (different files):
Task: "Implement paratroop in packages/engine/src/resolution/paratroop.ts"
Task: "Implement gun in packages/engine/src/resolution/gun.ts"
```

### Parallel Example: Polish Phase

```bash
# Most Polish tasks touch different files:
Task: "Implement serializeWorld/deserializeWorld/hashWorld in packages/engine/src/serialize.ts"
Task: "Write SC-001 determinism test in packages/engine/tests/determinism.test.ts"
Task: "Write 3/4-player supplementary test in packages/engine/tests/quickstart/multi-player.test.ts"
Task: "Write SC-004 perf benchmark in packages/engine/tests/perf/tick-perf.bench.ts"
Task: "Add CI workflow in .github/workflows/engine-ci.yml"
Task: "Write engine package README in packages/engine/README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

The MVP for feature 001 is **just User Story 1**. It delivers the deterministic simulation skeleton (`createWorld` → `applyCommand` → `tick` → production → flow) without which no other feature can build. The MVP proves:

1. Monorepo scaffolding is sound.
2. Deterministic tick loop works headlessly.
3. The engine's public surface (types + functions) is importable from `@europa/engine`.
4. SC-001 (determinism) is satisfied at the micro-scale (Q-001), with the macro-scale 10k-tick proof deferred to Polish.

**MVP delivery sequence:**

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: `pnpm --filter @europa/engine test` runs Q-001/Q-002/Q-003 green; coverage ≥80% on `create.ts` + `production.ts` + `flow.ts` + `tick.ts`; `hashWorld` stable across two identical runs.
5. Do NOT proceed to US2/US3/US4/US5 until US1 is merged and the smoke REPL from `quickstart.md` §3 prints expected output.

### Incremental Delivery

1. **Foundation** (Setup + Foundational) → `pnpm install` clean, `pnpm build` produces `dist/`, types and constants importable.
2. **+ User Story 1** → MVP! Engine runs headlessly; production + flow work.
3. **+ User Story 2** → Combat plays out; cities capturable. Most tactical options unlocked.
4. **+ User Story 3** → Decay + capacity + reserves add strategic depth.
5. **+ User Story 4** → Paratroopers + guns add raid tactics.
6. **+ User Story 5** → Matches conclude with `MatchResult`.
7. **+ Polish** → Serialization, 10k-tick determinism proof, CI, perf benchmark, README.

Each story adds value without breaking the previous story's acceptance tests (the strict phase ordering in `tick.ts` means each new phase slots in without disturbing earlier phases).

### Parallel Team Strategy

With multiple dispatchers:

1. **Phase 1 + 2** together (foundational setup is sequential by nature).
2. **Phase 3 onward** can fan out:
   - Dispatcher A: User Story 1 (`create.ts` + `production.ts` + `flow.ts` + `tick.ts` skeleton)
   - Once US1 lands, Dispatchers B/C/D can take US2/US3/US4 in parallel — each adds its own `resolution/*.ts` module + edits `tick.ts` to wire it.
   - Dispatcher E handles US5 once US2's combat phase lands (for Q-005's last-standing scenario).
   - Dispatcher F takes Polish (serialization, determinism, perf, CI, README).

The single shared `tick.ts` file is the synchronization point: resolution-module implementations can land in parallel, but the tick-wiring task in each story must wait for the previous story's wiring to merge cleanly. This is the one serialization constraint across the otherwise-parallel story implementations.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks. Verify before marking `[P]`.
- `[Story]` label maps task to user story for traceability. Setup / Foundational / Polish tasks MUST NOT carry a story label.
- Each user story is independently completable and testable via its quickstart tests (Q-001..Q-008).
- Tests are written first and must FAIL before implementation lands — this is TDD per constitution Principle III and the spec-kit template's "Tests first" rule.
- Commit after each task or logical group; conventional-commit messages per AGENTS.md (e.g., `feat(engine): implement production resolution (US1)`).
- Stop at any checkpoint to validate the story independently before moving on.
- **Avoid**: vague tasks, same-file conflicts (multiple tasks writing to `tick.ts` simultaneously), cross-story dependencies that break the independent-testability guarantee.
- **Subagent reliability** (AGENTS.md note): tasks target one file each wherever possible; large files like `tick.ts` are split per-phase so a single dispatch edits only its phase's wiring.
- File paths are derived from `plan.md` §"Project Structure" and `research.md` §10 — they are the actual future monorepo paths. Do not invent paths not supported by the plan.
