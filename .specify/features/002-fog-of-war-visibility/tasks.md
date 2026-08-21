# Tasks: Fog of War & Visibility

**Input**: Design documents from `.specify/features/002-fog-of-war-visibility/`
**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Branch**: `001-europa-core`
**Spec**: [spec.md](./spec.md) — 3 user stories (US1 = P1 Visibility Horizon Around Owned Troops, US2 = P2 No Memory of Previously Seen Terrain, US3 = P3 Spectator Sees Everything) and 8 functional requirements (FR-001..FR-008)

**Tests**: REQUIRED. Constitution Principle III mandates ≥80% coverage on game logic as a merge gate. `quickstart.md` §4 maps every spec FR to at least one test (Q-F01..Q-F08). Tests are interleaved with implementation per the spec-kit template (failing tests first, then impl, then integration).

**Organization**: Tasks are grouped by user story in spec-priority order. **Phase 3 (US1) = the MVP** — produces a valid `PlayerView` for any player given a `World` snapshot, with `computeVisibleSet` matching the engine's declared signature byte-for-byte. The US1 deliverable alone satisfies FR-001/002/003/005/007/008. **Phase 4 (US2)** verifies the no-memory invariant (FR-004) by ticking across many world states and asserting no cells are carried over. **Phase 5 (US3)** extends `computePlayerView` with the spectator branch (FR-006). The prompt's pipeline-phase labels were wrong for this feature; the spec's `US1`/`US2`/`US3` priority labels are used here. The constitution's "Specs as Documentation" principle (Principle IV) makes the spec the source of truth for story labels.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`[US1]`–`[US3]`); REQUIRED for user story phase tasks only — Setup, Foundational, and Polish phases MUST NOT carry a story label
- Include exact file paths in descriptions — every task targets a specific file under `packages/fog/`

## Path Conventions

Per `plan.md` §"Project Structure" (monorepo root). The fog package lives at `packages/fog/` as `@europa/fog`, mirroring `@europa/terrain`. The package's source tree is one file per pipeline phase, matching the engine's structure (constitution Principle V: "Each algorithm phase = one file, one function"). Test files mirror the plan: per-module unit tests, top-level `tests/{determinism,redaction,conformance}.test.ts`, and a `tests/quickstart/` folder for Q-F01..Q-F08. All file paths below are the actual future monorepo paths.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the `packages/fog/` package scaffolding on top of feature 001's already-bootstrapped monorepo (root `pnpm-workspace.yaml`, root `tsconfig.base.json`, root `biome.json`, and root `package.json` `catalog:` were landed in feature 001's Phase 1, commits `dd07635` and earlier). No business logic yet.

**⚠️ NOTE**: Tasks T001–T004 are **verification/audit** tasks only — they confirm feature 001's root configs already expose the pinned versions and workspace registration that fog will consume. They do NOT rewrite the root files (commit-bound per `git-safety`). Tasks T005–T010 create the new `packages/fog/` files. Tasks T011–T017 will mirror the committed `contracts/` directory into the package's source tree so the impl can `import` from it — this is the package's "stable public interface" per the engine ↔ fog boundary rule (`engine-to-fog.ts:21`).

- [ ] T001 Verify `pnpm-workspace.yaml` at repo root already registers `packages: ["packages/*"]` (landed in feature 001, T001); confirm no edit needed; if missing, add the registration in this change set
- [ ] T002 Verify root `package.json` `catalog:` pins `tsup@^8`, `vitest@^4.1`, `@biomejs/biome@^2`, `typescript@^5.6` (landed in feature 001, T002); confirm no edit needed
- [ ] T003 Verify root `tsconfig.base.json` has `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler` (landed in feature 001, T003); confirm no edit needed
- [ ] T004 Verify root `biome.json` exists with `extends: ["//"]` chain support and `noExplicitAny: error` (landed in feature 001, T004); confirm no edit needed
- [ ] T005 [P] Create `packages/fog/package.json` with `name: "@europa/fog"`, `type: "module"`, `exports` map: `.` → `dist/index.js` + `dist/index.d.ts`, `./contracts/*` → `contracts/*.ts` (so feature 004 networking and feature 005 console can `import { ... } from '@europa/fog/contracts/engine-to-fog'`); devDependencies on `tsup@^8`, `vitest@^4.1`, `@biomejs/biome@^2`, `typescript@^5.6` (all via root pnpm `catalog:`); `peerDependencies: { "@europa/engine": "workspace:*" }`; scripts (`build`, `test`, `lint`, `format`, `typecheck`, `coverage`)
- [ ] T006 [P] Create `packages/fog/tsconfig.json` extending `../../tsconfig.base.json` with `outDir: "./dist"`, `rootDir: "./src"`, `noEmit: false`, `composite: false`, `include: ["src/**/*", "contracts/**/*"]`
- [ ] T007 [P] Create `packages/fog/vitest.config.ts` with v8 coverage provider, `thresholds.lines/functions/branches/statements: 80` (constitution Principle III merge gate), `include: ["tests/**/*.test.ts"]`, `environment: "node"`
- [ ] T008 [P] Create `packages/fog/tsup.config.ts` with `entry: ["src/index.ts"]`, `format: ["esm"]`, `dts: true`, `clean: true`, `splitting: false`, `sourcemap: true`
- [ ] T009 [P] Create `packages/fog/biome.json` with `extends: ["//"]` (root) — no package-specific overrides in v1
- [ ] T010 [P] Create the directory tree `packages/fog/src/`, `packages/fog/tests/unit/`, `packages/fog/tests/fixtures/`, `packages/fog/tests/quickstart/`, `packages/fog/contracts/` (empty `mkdir -p` style, no source files yet)

**Checkpoint**: `pnpm install` runs cleanly; `pnpm --filter @europa/fog build` produces an empty `dist/`; `pnpm --filter @europa/fog test` runs with zero tests and exits 0; `pnpm --filter @europa/fog typecheck` and `pnpm --filter @europa/fog lint` exit 0.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure that EVERY user story depends on — the contracts mirror, the public type surface, the package constants, the small query helpers (`isVisible`, `visibleCellAt`, `hashPlayerView`), the event filter (`filterTickEvents`), the test fixtures, and the public barrel `index.ts`. **No user story work can begin until this phase is complete.**

**⚠️ CRITICAL**: This phase establishes the public surface (`index.ts`), the type re-exports (`types.ts`), the constants discipline (SC-005), and the test fixtures that every downstream module and test will consume. Skipping ahead breaks the import graph for every later phase. Note that the engine's `engine-to-fog.ts` (committed in feature 001) and the fog's `contracts/engine-to-fog.ts` mirror MUST remain byte-identical — the conformance test (Polish phase) enforces this.

- [ ] T011 [P] Mirror the four contract files from `.specify/features/002-fog-of-war-visibility/contracts/` into `packages/fog/contracts/` — copy `fog-types.ts`, `fog-api.ts`, `engine-to-fog.ts`, `fog-to-networking.ts` verbatim; the `engine-to-fog.ts` mirror is already byte-identical to feature 001's `engine-to-fog.ts` (per the plan), drift between them is caught by the conformance test (depends on T010)
- [ ] T012 [P] Create `packages/fog/src/types.ts` re-exporting the full surface of `contracts/fog-types.ts` (every interface, type alias, the `FOG_API_VERSION` constant, and the `FOG_MASK_*` sentinels) plus the engine types `World`, `CellView`, `Coord`, `MatchConfig`, `PlayerId`, `TickEvents` via `import type` from `@europa/engine` (no runtime engine import — see `engine-to-fog.ts` boundary rule)
- [ ] T013 [P] Create `packages/fog/src/constants.ts` exporting `FOG_CONSTANTS` (per `contracts/fog-api.ts` `FogConstants` interface: `maskUnknown: 0`, `maskVisible: 1`, `defaultRadiusFallback: number` matching `ENGINE_CONSTANTS.visibilityRadiusDefault`, `testRadius: number` for quickstart scenarios); re-export `FOG_API_VERSION = '0.1.0' as const` from `./types` for convenience
- [ ] T014 [P] Create `packages/fog/src/utils.ts` exporting pure query and hashing helpers: `isVisible(view, coord)` (linear search over `view.visibleCells` returning boolean), `visibleCellAt(view, coord)` (returns the `CellView` for the coord or `undefined`), and `hashPlayerView(view)` (FNV-1a-style integer-only hash over the JSON-serialized view, returns 16-char hex string); no engine runtime import (depends on T012, T013)
- [ ] T015 [P] Create `packages/fog/src/eventsFilter.ts` exporting `filterTickEvents(world, visibleCells, events, spectator)` per the signature in `contracts/fog-api.ts:261`: cell-level events (`CombatEvent`, `CaptureEvent`) dropped if `event.cell` is not in the visible set (use the engine's `forEachCell` for the lookup or a precomputed `Set<number>` of flat-index keys for O(1) membership); player-level events (`EliminationEvent`, `AppliedOrderRecord`, `errors`) always kept; for `spectator === true`, return `events` unchanged; preserves event emission order (row-major flat-index iteration; depends on T012)
- [ ] T016 [P] Create `packages/fog/tests/fixtures/worlds.ts` exporting `flatBoard(size)` (square all-land flat `Board` with `elevation: 0`, no cities), `scriptedWorld({ size?, playerCount?, troops?, cities? })` (uses the engine's `createWorld(config, board)` from `@europa/engine` and mutates `world.state.troopCounts` / `world.state.troopOwners` via fresh `Uint32Array`/`Uint8Array` clones to place scripted troops; defaults `size=16`, `playerCount=2`, `visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault`), and `waterCellWorld({ size, coord })` (flat board with a single water cell at `coord` for the Q-F08 viewer-on-water edge-case test) — uses the engine's proper `createWorld` + `applyCommand` + `tick` mutation paths where possible (consult the engine's quickstart Q-001..Q-003 for the established pattern)
- [ ] T017 [P] Create `packages/fog/tests/fixtures/view.ts` exporting `expectedChebyshevDisk(center, r, width, height)` (returns the row-major `Coord[]` of all cells within Chebyshev range `r` of `center`, bounds-clipped — pure integer math), and `disjointDisks(disk1, disk2)` (asserts two `Coord[]` Chebyshev disks do not overlap — used by the multi-stack test in Q-F01) (depends on T016)
- [ ] T018 [P] Write failing unit tests for `utils` in `packages/fog/tests/unit/utils.test.ts` — covers `isVisible` (cell present → true, absent → false, empty view → false for any coord), `visibleCellAt` (returns the `CellView` for present coords and `undefined` for absent), `hashPlayerView` (determinism: same view → same hash; sensitivity: different `visibleCells.length` → different hash; sensitivity: different `tick` → different hash) (depends on T014)
- [ ] T019 [P] Write failing unit tests for `eventsFilter` in `packages/fog/tests/unit/eventsFilter.test.ts` — covers FR-003 cell-level filtering: `CombatEvent` inside visible set kept, `CombatEvent` outside dropped; `CaptureEvent` inside kept, outside dropped; `EliminationEvent` (no `cell`) always kept; `AppliedOrderRecord` (no `cell`) always kept; `errors` (no `cell`) always kept; `spectator: true` returns events unchanged; emission order preserved (depends on T015)
- [ ] T020 Create `packages/fog/src/index.ts` as a **minimal barrel** — re-export only types from `./types` and constants (`FOG_CONSTANTS`, `FOG_API_VERSION`) from `./constants`. NO function imports yet (those depend on US1 implementation files that don't exist in Phase 2; the populated barrel is added in T045 after US1 lands). This minimal barrel compiles and exports the full type surface plus the version constant, which lets downstream packages type-check `@europa/fog` imports during Phase 2 even before the runtime surface is wired up. (depends on T012, T013)

**Checkpoint**: `pnpm --filter @europa/fog build` succeeds (once T020 lands after US1's impl); `dist/index.d.ts` exports every type and function from `contracts/fog-types.ts` and `contracts/fog-api.ts`; `pnpm --filter @europa/fog test` runs T018/T019 green; `pnpm --filter @europa/fog typecheck` is clean; `dist/contracts/engine-to-fog.ts` is byte-identical to feature 001's `engine-to-fog.ts`.

---

## Phase 3: User Story 1 - Visibility Horizon Around Owned Troops (Priority: P1) 🎯 MVP

**Goal**: Deliver the per-player horizon filter that consumes a `World` snapshot and emits a `VisibleSet` / `PlayerView`. `computeVisibleSet` implements the engine's declared signature byte-for-byte; `computePlayerView` orchestrates the visibility pass + cell decoding + event filtering. After this phase, a player with known troop positions sees exactly the cells within Chebyshev range `r` of every friendly stack — the original Europa's core gameplay loop is unlocked.

**Independent Test**: Build a 16×16 scripted world with a single friendly stack at (8,8); call `computeVisibleSet(world, 1, 3)`; assert the result is exactly the 49 cells of the Chebyshev disk around (8,8) in row-major order. Then call `computePlayerView(world, 1)`; assert the `PlayerView` has 49 decoded `CellView`s and the `events` field is the unfiltered empty `TickEvents`. Move the stack outside the board; assert the result is empty. Per `quickstart.md` Q-F01 AC-1 and AC-2.

**⚠️ MVP scope clarification**: The MVP in this phase handles the **non-spectator** path of `computePlayerView` only. The `options.spectator: true` branch is added in US3 (Phase 5). The function signature already accepts the options bag — the impl in this phase handles `spectator: false` (the default) and the `options` argument may be omitted. US3 only needs to add the early-return branch for the spectator case.

### Tests for User Story 1

> Write these FIRST; each should FAIL until its corresponding implementation task lands.

- [ ] T021 [P] [US1] Write failing unit tests for `computeVisibleSet` in `packages/fog/tests/unit/visibleSet.test.ts` — covers FR-001 + US1 AC-1 + US1 AC-2: lone stack at (8,8) on 16×16 produces exactly the 49-cell Chebyshev disk; two friendly stacks in disjoint regions produce a union whose length equals the sum of individual disks; a stack at (0,0) on 16×16 produces a 4×4=16-cell clipped disk; the result is row-major with no duplicates; `visible.player` echoes the input player; `visible.tick` echoes `world.tick`; viewers with `troopCount === 0` are excluded (per spec US1 Edge Case "destroyed stack"); cities do NOT project vision (per spec US1 Edge Case "city ownership" — the Q-F03 cities-alone assertion lives in US2's phase but the impl is already correct here)
- [ ] T022 [P] [US1] Write failing unit tests for `computePlayerView` in `packages/fog/tests/unit/playerView.test.ts` — covers FR-002 + FR-005: in-horizon cells appear in `visibleCells` as fully-decoded `CellView` (terrain, elevation, troopCount, troopOwner, pipes, reservesPercent, cityOwner all present); out-of-horizon cells are absent (structural redaction, no placeholder); enemy troop inside horizon shows exact `troopCount` and `troopOwner`; the `config` field is a snapshot of `world.config`; `tick` echoes `world.tick`; `player` echoes the input; `events` is the filtered `TickEvents` (this task's `filterTickEvents` from T019 is reused)
- [ ] T023 [P] [US1] Write failing acceptance test for US1 in `packages/fog/tests/acceptance/us1-acceptance.test.ts` — covers the three spec US1 ACs end-to-end: AC-1 (lone stack horizon), AC-2 (multi-stack union), AC-3 (enemy in/out of horizon); reuses `scriptedWorld` + `computePlayerView`; the `accept: true` / `accept: false` assertions use the spec's "Given/When/Then" wording as test names (depends on T016, T017, T021, T022)
- [ ] T024 [P] [US1] Write failing quickstart Q-F01 in `packages/fog/tests/quickstart/q-f01-lone-stack.test.ts` — covers FR-001 + US1 AC-1 + AC-2 per `quickstart.md` §2 Q-F01: lone stack at (8,8) on 16×16 sees exactly 49 cells; two friendly stacks in disjoint regions see exactly `49 × 2 = 98` cells (depends on T027)
- [ ] T025 [P] [US1] Write failing quickstart Q-F02 in `packages/fog/tests/quickstart/q-f02-enemy-visibility.test.ts` — covers FR-005 + US1 AC-3 per `quickstart.md` §2 Q-F02: enemy troop inside the viewer's horizon appears in `visibleCells` with exact `troopOwner` and `troopCount`; enemy troop outside the horizon is absent from `visibleCells` entirely (depends on T027, T028)
- [ ] T026 [P] [US1] Write failing quickstart Q-F04 in `packages/fog/tests/quickstart/q-f04-opponent-city.test.ts` — covers FR-002 + FR-005 per `quickstart.md` §2 Q-F04: opponent city inside the viewer's horizon exposes the full cell data including `cityOwner`; opponent city outside the horizon is absent from `visibleCells` (depends on T027, T028)

### Implementation for User Story 1

- [ ] T027 [US1] Implement `computeVisibleSet` in `packages/fog/src/visibleSet.ts` — pure `computeVisibleSet(world, player, visibilityRadius): VisibleSet` per the signature in `contracts/fog-api.ts:124`; the function body implements the algorithm from `research.md` §1 + `data-model.md` §1 + `plan.md` "Visibility pipeline" §1: (1) iterate `world.state.troopOwners` row-major (y outer, x inner), collect viewers where `troopOwners[i] === player && troopCounts[i] > 0` (excluding cities — per spec US1 Edge Case); (2) allocate a `Uint8Array` mask of length `width * height`, zero-init (allocated fresh each tick — no-memory rule); (3) for each viewer cell, iterate the engine's `cellsInRange(world, viewer.coord, visibilityRadius)` and mark `mask[idx] = 1`; (4) iterate the mask row-major, push each `1` cell's `Coord` to the output; (5) return `{ player, tick: world.tick, visibleCells }`; signature must match the engine's declaration byte-for-byte; JSDoc cites FR-001, FR-007, US1 AC-1, AC-2; no `Math.random`, no `Date.now`, no Set/Map iteration in the output path (depends on T012, T013, T015)
- [ ] T028 [US1] Implement `computePlayerView` in `packages/fog/src/playerView.ts` — pure `computePlayerView(world, player, options?): PlayerView` per the signature in `contracts/fog-api.ts:178`; for v1 (US1) the function handles `options` undefined OR `options.spectator === false` (the default path); the body orchestrates: (1) call `computeVisibleSet(world, player, world.config.visibilityRadius)`; (2) for each coord in `visible.visibleCells` row-major, decode via the engine's `getCell(world, x, y)` and push to a `visibleCells` array; (3) call `filterTickEvents(world, visible.visibleCells, world.events, false)` and use the result as the `events` field; (4) return `{ player, tick: world.tick, visibleCells, events, config: world.config }`; JSDoc cites FR-002, FR-003, FR-005, US1 AC-3; the spectator branch (`options.spectator === true`) is added in US3 (T036) — leaving it as a `throw new Error('spectator mode not yet implemented')` or a TODO is acceptable for US1 (depends on T012, T013, T014, T015, T027)
- [ ] T029 [P] [US1] Write determinism integration test in `packages/fog/tests/determinism.test.ts` — covers FR-007 + SC-001 micro-check per `quickstart.md` §2 Q-F06: 100 trials on a 32×32 world with three friendly stacks; assert `hashPlayerView(computePlayerView(world, 1))` is byte-identical across all 100 runs; also asserts cross-player determinism (the hash for player 1 is stable across runs even though it differs from the hash for player 2); no `console.log` (depends on T028, T014)
- [ ] T030 [P] [US1] Write failing quickstart Q-F06 in `packages/fog/tests/quickstart/q-f06-determinism.test.ts` — covers FR-007 + SC-001 per `quickstart.md` §2 Q-F06: 100 runs produce byte-identical `PlayerView` hashes; cross-player determinism (depends on T028, T014)

**Checkpoint**: User Story 1 is fully functional and independently testable. `pnpm --filter @europa/fog test` runs all US1 unit + acceptance + quickstart tests green (T021–T026, T029–T030); `computeVisibleSet(world, 1, r)` returns a valid `VisibleSet` for any scripted world; `computePlayerView(world, 1)` returns a valid `PlayerView` with structural redaction, exact enemy data, and a filtered `events` field; determinism is proven at 100 trials. The MVP is demonstrable via `quickstart.md` §3 (manual smoke REPL). Spec FR-001, FR-002, FR-003, FR-005, FR-007, FR-008 are satisfied.

---

## Phase 4: User Story 2 - No Memory of Previously Seen Terrain (Priority: P2)

**Goal**: Verify the no-memory invariant (FR-004) by exercising `computePlayerView` across many `World` state transitions and asserting that no `visibleCells` ever carries over from a prior tick. The implementation is already no-memory by construction (the `FogMask` is allocated fresh each call in T027) — this phase is mostly tests, plus the SC-001 protocol-level `redaction.test.ts` (500-tick scripted match with zero leakage).

**Independent Test**: Build a scripted world with a friendly stack at (8,8); call `computePlayerView`; assert the visible cells are non-empty. Then build a second world where the stack is destroyed (`troopCount: 0`); call `computePlayerView` on the second world; assert `visibleCells.length === 0` and that none of the previously-visible cells appear in the new view. Then run a 500-tick scripted match where the player has stacks at varying positions, calling `computePlayerView` each tick; for every pair of consecutive ticks, assert that no cell is in both `view_t.visibleCells` and `view_{t+1}.visibleCells` unless it's a fresh visibility (i.e., the cell is in the new view because of a stack in tick `t+1`, not because of a recall from tick `t`). Per `quickstart.md` Q-F03 + the 500-tick SC-001 protocol-level assertion in `plan.md` "Testing" §"Test categories".

**⚠️ No new code in this phase (other than optional helper extraction)**. The impl is already correct (T027's mask is fresh each call). The bulk is tests. If the implementer wants to extract a small `_assertNoCarryover(prevView, currView, newViewers)` helper for the protocol-level test, that lives in `tests/helpers/audit.ts` — but it is OPTIONAL and not required for US2 to ship.

### Tests for User Story 2

> Write these FIRST; each should FAIL until the no-memory invariant is verified end-to-end.

- [ ] T031 [P] [US2] Write failing quickstart Q-F03 in `packages/fog/tests/quickstart/q-f03-no-memory.test.ts` — covers FR-004 + US2 AC-1 + US2 AC-2 per `quickstart.md` §2 Q-F03: destroying the viewer stack (count → 0) causes the previously-visible cells to be absent from the next `PlayerView`; a friendly stack marching out of range causes the region to revert to unknown; the cities-alone assertion (Q-F03 second `it` block) confirms that player 1 with a city but no troops sees zero cells (re-verifies US1's "cities do not project vision" rule in the US2 context) (depends on T028)
- [ ] T032 [P] [US2] Write failing acceptance test for US2 in `packages/fog/tests/acceptance/us2-acceptance.test.ts` — covers the two spec US2 ACs end-to-end per `quickstart.md` §4 mapping: AC-1 (cell visible at tick t because of friendly stack; stack destroyed; next tick's view contains no data for that cell); AC-2 (friendly stack marches out of range; region reverts to unknown for that player); each AC's "Given/When/Then" wording is the test description (depends on T028, T016)
- [ ] T033 [US2] Write SC-001 protocol-level redaction test in `packages/fog/tests/redaction.test.ts` — covers SC-001's protocol-level assertion per `plan.md` "Testing" §"Test categories": a 500-tick scripted match where friendly stacks appear, move, and are destroyed; for every tick, call `computePlayerView` and audit the returned `PlayerView` against an independently-computed `VisibleSet`; assert (a) no `visibleCell.coord` is in any tick's `PlayerView.visibleCells` if it is not in that tick's expected `VisibleSet` (zero leakage), (b) the `events` field contains no out-of-horizon cell-level events, (c) the `visibleCells` array is row-major with no duplicates, (d) the no-memory rule is upheld across all 500 consecutive ticks (every cell not in the current `VisibleSet` is absent — no `Set<Coord>` of "previously visible" anywhere in the fog package); uses the engine's `tick()` to advance state and `scriptedWorld` for initial conditions; report a summary at the end (`<totalCells observed across 500 ticks> / <totalCells leaked>: 0`); depends on T028, T016, T031, T032

**Checkpoint**: User Story 2 is fully verified. `pnpm --filter @europa/fog test` runs T031 + T032 + T033 green; the 500-tick scripted match produces zero leakage; the no-memory invariant is proven at the protocol level. Spec FR-004 is satisfied. No source-file changes are required — the impl from US1 is already no-memory by construction (fresh `Uint8Array` mask per call).

---

## Phase 5: User Story 3 - Spectator Sees Everything (Priority: P3)

**Goal**: Extend `computePlayerView` with the spectator branch so that `computePlayerView(world, player, { spectator: true })` returns a `PlayerView` containing every cell on the board (decoded) and unfiltered events (FR-006 + US3 AC-1). The branch is function-level (no `PlayerView` type change, no new `SpectatorFlag` type) per the plan's decision in `research.md` §6.

**Independent Test**: Build a scripted world with a player who has no troops; call `computePlayerView(world, 1)` (default) and assert `visibleCells.length === 0`. Then call `computePlayerView(world, 1, { spectator: true })` and assert `visibleCells.length === width * height` (every cell decoded). Per `quickstart.md` Q-F05.

### Tests for User Story 3

> Write these FIRST; each should FAIL until T036 lands.

- [ ] T034 [P] [US3] Write failing quickstart Q-F05 in `packages/fog/tests/quickstart/q-f05-spectator.test.ts` — covers US3 + FR-006 per `quickstart.md` §2 Q-F05: non-spectator view of a player with no troops is empty (`visibleCells.length === 0`); same world with `options.spectator: true` returns a view with every cell on the board (`visibleCells.length === width * height`); spot-check a few specific cells (corners, center) are present and decoded; spectator events are unfiltered (the second `it` block in Q-F05 verifies the unfiltered events pass-through — implemented in T036's branch) (depends on T036)
- [ ] T035 [P] [US3] Write failing acceptance test for US3 in `packages/fog/tests/acceptance/us3-acceptance.test.ts` — covers US3 AC-1: a player who surrenders mid-match (here modeled as `options.spectator: true` for that player) receives unrestricted board state; `visibleCells.length === width * height`; the `events` field equals `world.events` unfiltered; subsequent `Order`s are NOT issued by fog (fog has no opinion on orders — that's feature 004's concern; the test asserts fog's view is the full board, not that orders are rejected); uses the spec's "Given/When/Then" wording as the test description (depends on T036)

### Implementation for User Story 3

- [ ] T036 [US3] Extend `packages/fog/src/playerView.ts` with the spectator branch — at the top of `computePlayerView`, add `if (options?.spectator === true) { /* full-board path */ }`: (1) iterate the engine's `forEachCell(world, ...)` row-major, decode each `CellView` and push to `visibleCells`; (2) set `events` to `world.events` unchanged (call `filterTickEvents` with `spectator: true` returns events unchanged per T015); (3) return `{ player, tick: world.tick, visibleCells, events, config: world.config }`; the function's type signature is unchanged — the spectator branch is a function-level dispatch only; JSDoc cites FR-006, US3 AC-1, and the rationale from `research.md` §6 (no `mode` discriminator on `PlayerView`); the existing US1 non-spectator path is unchanged (depends on T028)

**Checkpoint**: User Story 3 is fully functional. `pnpm --filter @europa/fog test` runs T034 + T035 green; `computePlayerView(world, 1, { spectator: true })` returns a full-board view regardless of which `player` is passed and regardless of that player's troop count; the non-spectator path is unchanged and still satisfies US1's acceptance criteria. Spec FR-006 is satisfied. Networking (feature 004) is unblocked — it can call `computePlayerView` with the spectator flag and forward the full-board payload to spectator sessions.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting deliverables that don't belong to a single user story: the spec-defined edge-case scenarios (Q-F08), the SC-004 performance budget (Q-F07), the engine-conformance integration test, the per-module determinism stress (the 100-trial `determinism.test.ts` was already in US1; the 10×-scale stress lives here), the fog package README, the CI workflow, the spec-status flip, the AGENTS.md update, and the final pre-merge verification gate.

- [ ] T037 [P] Write quickstart Q-F07 in `packages/fog/tests/quickstart/q-f07-performance.test.ts` — covers SC-004 per `quickstart.md` §2 Q-F07: 100 trials of `computePlayerView(world, 1)` on a 32×32 / 2-player world; assert the p99 wall-clock time is under 1.0 ms (per `plan.md` "Performance Goals" §1 — 1 ms budget is comfortable with range expansion; the test reports a summary at the end with min/median/p99); uses `performance.now()` (NOT `Date.now()` — `performance.now()` is acceptable for benchmark measurement in tests per the engine's `quickstart.md` §3 precedent; it does NOT enter the fog hot path) (depends on T028)
- [ ] T038 [P] Write quickstart Q-F08 in `packages/fog/tests/quickstart/q-f08-edge-cases.test.ts` — covers the spec Edge Cases per `quickstart.md` §2 Q-F08: player with 0 troops sees nothing; player with 0 cities and 0 troops sees nothing; viewer at (0,0) on 16×16 — visibility clipped to 4×4 = 16 cells (no out-of-bounds leak); viewer at (31,31) on 32×32 — visibility clipped to 4×4 = 16 cells; viewer on water — visibility is computed (water does NOT block vision per spec Assumptions) (depends on T016 — the `waterCellWorld` fixture, T028)
- [ ] T039 [P] Write engine-conformance test in `packages/fog/tests/conformance.test.ts` — covers the boundary rule per `engine-to-fog.ts:21` and `data-model.md` §14: assert (a) the `contracts/engine-to-fog.ts` mirror in `packages/fog/contracts/` is byte-identical to feature 001's `engine-to-fog.ts` (read both files, compare contents); (b) the fog package's re-declared `VisibleSet` and `PlayerView` types in `contracts/fog-types.ts` are structurally assignable from the engine's originals (compile-time check; if any field drifts, the test fails to typecheck); (c) the `computeVisibleSet` function signature in `packages/fog/src/visibleSet.ts` matches the engine's `engine-to-fog.ts:81` declaration byte-for-byte (same parameter names, same return type); drift between the two is a bug (depends on T011, T012, T027)
- [ ] T040 [P] Write `packages/fog/README.md` — documents install (`pnpm install` from repo root), build (`pnpm --filter @europa/fog build`), test (`pnpm --filter @europa/fog test`), coverage (`pnpm --filter @europa/fog test --coverage`), a minimal usage example mirroring `quickstart.md` §3 smoke REPL, the public API surface (links to `dist/index.d.ts`), a "Determinism" note explaining the no-wall-clock / no-`Math.random` / row-major-iteration discipline, a "Conformance" note explaining the engine ↔ fog boundary rule and the byte-identical `engine-to-fog.ts` mirror, and a "Self-hosting" note confirming zero external service dependencies
- [ ] T041 [P] Add root `.github/workflows/fog-ci.yml` — runs `pnpm install`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r format:check`, `pnpm --filter @europa/fog test`, `pnpm --filter @europa/fog test --coverage`; coverage threshold 80% enforced (matches feature 001's CI gate from `engine-to-fog.ts` and the constitution Principle III merge gate); SHA-pinned `actions/checkout@v4` and `pnpm/action-setup@v4` per the `github-actions` skill; minimal permissions (`contents: read`); depends on T037–T040
- [ ] T042 Run full quickstart validation against `.specify/features/002-fog-of-war-visibility/quickstart.md` — execute Q-F01 through Q-F08 per §3 smoke REPL; confirm the acceptance criteria table in §4 maps green-to-green; flip spec status from `Draft` → `Implemented` in `.specify/features/002-fog-of-war-visibility/spec.md` per AGENTS.md; depends on T027, T028, T036, T037, T038
- [ ] T043 Update `AGENTS.md` "Current state" section — add a one-line entry noting that feature 002 (fog of war & visibility) phase 6 is complete; preserve the existing "001→003→002" dispatch order note (or update to reflect the bottom-up-by-dependency ordering that actually shipped) (depends on T042)
- [ ] T044 Run final pre-merge verification per `code-quality` skill checklist — full test suite green (T021–T038 unit + acceptance + quickstart + integration), lint clean, typecheck clean, build succeeds, coverage ≥80% on `packages/fog/src/` per Vitest v8 threshold, no `any` types in `src/`, no lint suppressions anywhere, no debug `console.log` left behind, every public function has a JSDoc doc comment, all FR-001..FR-008 acceptance tests green, all SC-001..SC-004 success criteria measurable green, conformance test (T039) byte-identity confirmed (depends on T042, T043)
- [ ] T045 Extend `packages/fog/src/index.ts` with the populated function re-exports — add the four runtime exports to the existing minimal barrel from T020: `export { computeVisibleSet } from './visibleSet'`, `export { computePlayerView } from './playerView'`, `export { isVisible, visibleCellAt } from './utils'`. **Execution ordering note**: although T045 has a higher ID than most US1 tests, it logically executes at the end of Phase 3 (after T027 `visibleSet.ts` and T028 `playerView.ts` ship) — the implementer should schedule T045 to land between T029/T030 and T031 (T031's tests reference `computePlayerView` from the barrel, which requires T045 to have landed). ID 45 is for sequencing convenience (added at the end of the file after T044 was already drafted); the `depends on` graph is what matters. The barrel becomes the full public surface; downstream packages (feature 004 networking) can now `import { computePlayerView } from '@europa/fog'` with a complete type + runtime surface. (depends on T020, T027, T028)

**Checkpoint**: Fog package is production-ready as a published library. CI is green, coverage gate enforced, determinism proven at 100 trials (T029), redaction proven at 500 ticks (T033), perf budget met (T037), all three user stories (visibility horizon / no memory / spectator) deliver their independent test criteria. Ready to merge `001-europa-core` and unblock feature 004 (networking) which depends on `@europa/fog`'s `computePlayerView` export.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**. The contracts mirror, public surface, constants, utils, eventsFilter, fixtures, and test scaffolding are imported by every downstream task. The barrel `index.ts` (T020) depends on the US1 impl files — implementers may split T020 across two commits to avoid import-before-impl failures.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 (Phase 3) → no dependencies on US2/US3; ships first.
  - US2 (Phase 4) → no dependencies on US1/US3; tests the no-memory invariant. The impl is already no-memory by construction from US1's `visibleSet.ts`.
  - US3 (Phase 5) → depends on US1's `playerView.ts` (T028) because the spectator branch is added to that file. US3 does NOT depend on US2.
  - The canonical sequential order matches the spec's priority order: US1 (P1) → US2 (P2) → US3 (P3).
- **Polish (Phase 6)**: Depends on all three user stories being complete (the Q-F07 perf test, Q-F08 edge cases, conformance test, and final verification exercise the full pipeline end-to-end).

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories. Brings up the horizon filter skeleton: `computeVisibleSet` → `computePlayerView` (non-spectator path). The MVP ships a `PlayerView` that networking (feature 004) can serialize and broadcast.
- **User Story 2 (P2)**: Can start after US1's `playerView.ts` lands (T028). Adds no source code; adds the Q-F03 quickstart, the US2 acceptance test, and the SC-001 protocol-level `redaction.test.ts` (500-tick scripted match). The no-memory rule is structural (T027 allocates a fresh `Uint8Array` per call), so US2 is a verification phase.
- **User Story 3 (P3)**: Can start after US1's `playerView.ts` lands (T028). Adds the spectator branch to `playerView.ts` (T036) and the Q-F05 quickstart + US3 acceptance test. The branch is small (~10 LOC) and is a function-level dispatch — no type changes, no new files.

### Within Each User Story

- Tests are written first (must FAIL before implementation), per the spec-kit template and AGENTS.md "Subagent reliability" note (TDD discipline, tests are the spec).
- Algorithm phase modules before the orchestrator that uses them. For US1: `utils.ts` (T014, Foundational) → `eventsFilter.ts` (T015, Foundational) → `visibleSet.ts` (T027) → `playerView.ts` (T028, orchestrates everything).
- The orchestrator (`playerView.ts`) before the integration tests that exercise end-to-end flows.
- Story completes (all its tasks green) before moving to the next priority.

### Parallel Opportunities

- **Setup**: All new package config files touch distinct paths → all are `[P]`-safe. T001–T004 are verification-only (root configs already present from feature 001).
- **Foundational**: Contracts mirror, types, constants, utils, eventsFilter, fixtures, and unit tests for utils/eventsFilter all touch different files → most are `[P]`. T020 (the **minimal** barrel `index.ts` — types + constants only) compiles immediately after Foundational lands. The **populated** barrel with function re-exports is T045, scheduled to land at the end of Phase 3 (between T029/T030 and T031). The implementer reads the execution-ordering note in T045's description.
- **Within US1**: All test tasks (T021, T022, T023, T024, T025, T026, T029, T030) `[P]` (different files, no impl deps yet). Within US1's impl, `utils` and `eventsFilter` (Foundational) precede `visibleSet.ts` (T027) which precedes `playerView.ts` (T028). The integration tests at the tail (T029, T030) `[P]` after T028 lands.
- **Across user stories (with multiple dispatchers)**: Once US1's `playerView.ts` (T028) lands, US2's tests (T031, T032, T033) and US3's tests (T034, T035) can fan out (different files from US1's hot path). US3's impl (T036) must wait for T028; US2's impl is already done (T027's mask is no-memory by construction).
- **Polish**: Q-F07, Q-F08, conformance, README, and CI workflow all touch different files → most `[P]`. T042 (run quickstart validation), T043 (AGENTS.md update), and T044 (final pre-merge gate) serialize.

---

## Parallel Examples

### Parallel Example: US1 Tests First

```bash
# Launch all US1 failing tests first (independent files, must fail before impl):
Task: "Write failing tests for computeVisibleSet in packages/fog/tests/unit/visibleSet.test.ts"
Task: "Write failing tests for computePlayerView in packages/fog/tests/unit/playerView.test.ts"
Task: "Write US1 acceptance test in packages/fog/tests/acceptance/us1-acceptance.test.ts"
Task: "Write Q-F01 in packages/fog/tests/quickstart/q-f01-lone-stack.test.ts"
Task: "Write Q-F02 in packages/fog/tests/quickstart/q-f02-enemy-visibility.test.ts"
Task: "Write Q-F04 in packages/fog/tests/quickstart/q-f04-opponent-city.test.ts"

# Then launch the algorithm modules in dependency order
# (Foundational utils/eventsFilter → visibleSet → playerView is the chain):
Task: "Implement computeVisibleSet in packages/fog/src/visibleSet.ts"
Task: "Implement computePlayerView in packages/fog/src/playerView.ts"  # depends on T027

# Finally, after playerView lands (T028), run all end-to-end tests in parallel:
Task: "Determinism integration test in packages/fog/tests/determinism.test.ts"
Task: "Q-F06 determinism in packages/fog/tests/quickstart/q-f06-determinism.test.ts"
```

### Parallel Example: US2 + US3 Tests (after US1 ships)

```bash
# US2 tests (independent files):
Task: "Q-F03 no-memory in packages/fog/tests/quickstart/q-f03-no-memory.test.ts"
Task: "US2 acceptance in packages/fog/tests/acceptance/us2-acceptance.test.ts"
Task: "SC-001 redaction in packages/fog/tests/redaction.test.ts"  # depends on T031, T032

# US3 tests (independent files):
Task: "Q-F05 spectator in packages/fog/tests/quickstart/q-f05-spectator.test.ts"
Task: "US3 acceptance in packages/fog/tests/acceptance/us3-acceptance.test.ts"

# US3 impl (small branch in playerView.ts):
Task: "Extend playerView.ts with spectator branch"
```

### Parallel Example: Polish Phase

```bash
# Most Polish tasks touch different files:
Task: "Q-F07 performance in packages/fog/tests/quickstart/q-f07-performance.test.ts"
Task: "Q-F08 edge cases in packages/fog/tests/quickstart/q-f08-edge-cases.test.ts"
Task: "Conformance in packages/fog/tests/conformance.test.ts"
Task: "Fog package README in packages/fog/README.md"
Task: "CI workflow in .github/workflows/fog-ci.yml"
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3)

The MVP for feature 002 is **Phase 1 + Phase 2 + Phase 3 (US1)**. It delivers the per-player horizon filter that produces a valid `VisibleSet` and `PlayerView` (non-spectator) for any scripted `World`. The MVP proves:

1. The `packages/fog` package scaffolding is sound.
2. The horizon algorithm works headlessly with row-major iteration, no PRNG, no clock.
3. The package's public surface (`computeVisibleSet`, `computePlayerView`, `isVisible`, `visibleCellAt`, `hashPlayerView`, all types) is importable from `@europa/fog`.
4. Determinism is satisfied at the 100-trial scale (T029).
5. Spec FR-001, FR-002, FR-003, FR-005, FR-007, FR-008 are all green.

**MVP delivery sequence:**

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: `pnpm --filter @europa/fog test` runs T018, T019, T021–T026, T029, T030 green; coverage ≥80% on `utils.ts` + `eventsFilter.ts` + `visibleSet.ts` + `playerView.ts`; `hashPlayerView` stable across 100 identical runs.
5. Do NOT proceed to US2/US3 until US1 is merged. The MVP is sufficient to unblock feature 004 (networking can call `computePlayerView` and broadcast the result to active player sessions; spectator mode is a follow-up).

### Incremental Delivery

1. **Setup + Foundational** → `pnpm install` clean, `pnpm build` produces `dist/`, types and constants importable, fixtures usable from tests.
2. **+ User Story 1** → MVP! `computeVisibleSet` + `computePlayerView` (non-spectator) work; networking (feature 004) can start importing fog for active-player broadcasts.
3. **+ User Story 2** → No-memory verified at the protocol level via 500-tick scripted match (T033). US2 ships no new code; the no-memory rule is structural from US1's impl.
4. **+ User Story 3** → Spectator mode live; `computePlayerView(world, player, { spectator: true })` returns a full-board view; networking (feature 004) can now route spectator sessions.
5. **+ Polish** → Conformance test enforces the engine ↔ fog boundary, SC-004 perf budget proven, README published, CI gating merges, spec status flipped to `Implemented`.

Each story adds value without breaking the previous story's acceptance tests.

### Parallel Team Strategy

With multiple dispatchers (the recommended approach for a feature this size per the `orchestration` skill):

1. **Phase 1 + 2** together (foundational setup is sequential by nature).
2. **Phase 3** by a single dispatcher (the algorithm chain `utils` → `eventsFilter` → `visibleSet` → `playerView` has tight within-phase ordering; the integration tests at the tail can fan out).
3. **Phase 4** by a single dispatcher (mostly tests; `redaction.test.ts` is the synchronization point).
4. **Phase 5** by a single dispatcher (one small branch in `playerView.ts` + the Q-F05/US3 acceptance tests).
5. **Phase 6** by a single dispatcher OR fanned out (most Polish tasks are independent files).

The single shared `playerView.ts` is the synchronization point: US1 wires the non-spectator path, US3 extends it with the spectator branch. US2 adds no code; it's a verification phase. Each wiring task must wait for the previous one to merge cleanly.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks. Verify before marking `[P]`.
- `[Story]` label maps task to the **spec's** user story (US1 = Visibility Horizon, US2 = No Memory, US3 = Spectator) for traceability. Setup / Foundational / Polish tasks MUST NOT carry a story label.
- Each user story is independently completable and testable via its quickstart tests (Q-F01–Q-F08 in `quickstart.md`).
- Tests are written first and must FAIL before implementation lands — this is TDD per constitution Principle III and the spec-kit template's "Tests first" rule.
- Commit after each task or logical group; conventional-commit messages per AGENTS.md (e.g., `feat(fog): implement computeVisibleSet Chebyshev horizon (US1)`).
- Stop at any checkpoint to validate the story independently before moving on.
- **Avoid**: vague tasks, same-file conflicts (multiple tasks writing to `playerView.ts` simultaneously — US1's T028 and US3's T036 must serialize; US2's T033 reads but doesn't write to `playerView.ts`), cross-story dependencies that break the independent-testability guarantee.
- **Subagent reliability** (AGENTS.md note): tasks target one file each wherever possible; the only multi-task file is `playerView.ts` (US1's T028 creates the file, US3's T036 adds the spectator branch — these are explicitly serialized).
- File paths are derived from `plan.md` §"Project Structure". The prompt's "mask.ts" and "range.ts" suggestions in Phase 2 are deliberate deviations from the plan and are NOT used here — the plan's one-file-per-pipeline-phase model is the source of truth, and the mask logic lives inline in `visibleSet.ts` (~30 LOC; not worth a separate file). The prompt's `tests/integration/` folder is also not in the plan — the plan puts `determinism.test.ts`, `redaction.test.ts`, and `conformance.test.ts` at the `tests/` root, with `tests/quickstart/` for Q-F01..Q-F08 and `tests/acceptance/` (added in this tasks.md) for the per-US acceptance test files. If the PM prefers the prompt's structure, swap the file paths in T021–T026, T029, T031–T032, T034–T035, T037, T038, T039 accordingly.
- **Licensing hygiene**: the `europa-source/` archive is read-only reference material (AGENTS.md rule 5); no fog file is derived from its code (per AGENTS.md rule 5, reimplement from documented behavior; the visibility horizon is a Chebyshev range expansion, ~30 LOC of pure math, no original code consulted).
- **Engine ↔ fog boundary**: `packages/fog/contracts/engine-to-fog.ts` MUST remain byte-identical to `packages/engine/contracts/engine-to-fog.ts` (mirrored from feature 001's committed file). The conformance test (T039) enforces this. Any drift is a bug per the plan's "Post-Phase-1 Re-evaluation" §"Cross-feature type drift" risk.

---

## PM Handoff (Items Requiring Product Decision)

The following items surfaced during tasks drafting that warrant explicit PM attention before phase 6 implementation begins. They are NOT blockers — phase 6 can proceed with the decisions noted in the task descriptions — but the PM should be aware.

1. **Prompt's `mask.ts` and `range.ts` suggestions**: the dispatch prompt for this task suggested adding `src/mask.ts` (binary mask helpers: `createMask`, `markVisible`, `isVisible`, `unionMasks`) and `src/range.ts` (Chebyshev range expansion wrapping engine's `cellsInRange`). The committed `plan.md` and `research.md` instead use the one-file-per-pipeline-phase model (mask ops inline in `visibleSet.ts`, no separate `mask.ts` or `range.ts`). **Decision in this tasks.md**: follow the plan. The mask is ~30 LOC and is used only by `visibleSet.ts`; splitting it into a separate file adds indirection without benefit (constitution Principle V: simplicity over cleverness). The PM can override by amending the plan to add `mask.ts` + `range.ts` and re-running phase 5, but no functional change is required.

2. **Prompt's `tests/integration/` folder**: the dispatch prompt suggested `tests/integration/{sc-001-determinism,us1-acceptance,us2-acceptance,us3-acceptance,us1-acceptance,perf,contract-conformance,edge-cases}.test.ts`. The committed `plan.md` puts `tests/{determinism,redaction,conformance}.test.ts` at the `tests/` root and `tests/quickstart/` for Q-F01..Q-F08. **Decision in this tasks.md**: follow the plan, with one deviation — add `tests/acceptance/{us1,us2,us3}-acceptance.test.ts` (per the spec's per-US "Given/When/Then" acceptance scenarios that don't fit cleanly into the Q-F quickstart naming). The PM can override by amending the plan to use `tests/integration/` consistently.

3. **`index.ts` import ordering (T020 → T045 split)**: the original T020 imported from the impl files (`visibleSet.ts`, `playerView.ts`), which don't exist until US1's T027 and T028 land. If T020 lands before US1, the build fails. **PM ruling (committed in `m0121` and `m0126`)**: T020 was split — T020 (Phase 2) now creates a **minimal barrel** (types + constants only, no function imports) that compiles immediately after Foundational lands. T045 (added at the end of the file with execution-ordering note in its description) populates the barrel with the four function re-exports at the end of Phase 3. The implementer follows the `depends on` graph. No further action needed.

4. **Spec status flip**: the AGENTS.md rule says flip the spec from `Draft` → `Planned` once `plan.md` lands (already done in commit `fa15d68`) and `Planned` → `Implemented` after phase 6 merge. **Decision in this tasks.md**: T042 flips the spec to `Implemented` after the quickstart validation passes. The spec is currently `**Status**: Draft` per the committed spec.md — the PM should confirm whether the `Draft` → `Planned` flip is owed (plan.md has landed but the spec wasn't updated) and either flip it manually before phase 6 begins or have T042 flip it to `Implemented` directly, skipping `Planned` (the latter is fine if the implementer is doing both in the same change set).

5. **Story label remapping**: this tasks.md uses the spec's `[US1]`/`[US2]`/`[US3]` user story labels (Visibility Horizon / No Memory / Spectator) per the prompt's explicit instruction "USE SPEC STORIES, NOT pipeline phases." The prompt's pipeline-phase labels (which were wrong for this feature) are NOT used. No PM action needed — this is the correct labeling per the prompt's own guidance.
