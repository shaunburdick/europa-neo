# Tasks: Elevation-Gradient Pipe Flow + Terrain Smoothing + Slope Color-Coding (issue #30)

**Input**: Design documents from `specs/001-core-game-engine/` — `spec.md` v1.2 (FR-007 gradient, US1 AC-4/AC-5), `plan.md`, `research.md`, `data-model.md`, `contracts/` (updated canonical + informational mirrors), plus the amended specs 003 v1.3 (FR-010, US4), 005 v1.2 (FR-013), 006 (Implementation Notes), 007 v1.3 (FR-006/FR-008/FR-010/FR-012), 012-design-system (companion).

**Branch**: `issue-30-pipe-flow-rate` (stay on this branch; never commit to `main` directly — `git-safety` skill)

**Tests**: Every task with a test artifact must land the test FIRST (or alongside) and the test must FAIL before the implementation. Mark `[P]` only when tasks touch disjoint files with no dependency.

**⚠️ R-1 BLOCKER (PM confirmation required before T007/T009/T031/T032 are finalized)**: the FR-007 formula as literally written (`max(0, flowBase − flowSlopeStep × min(|Δ|, flowSlopeDeltaCap))` with cap=5 < flowBase=7) cannot produce uphill stalls. The working assumption is the **asymmetric cap** (cap bounds the downhill bonus only; uphill handicap uncapped: `max(0, flowBase − flowSlopeStep × |Δ|)`), which matches every rate listed in spec 001 v1.2 and the empirical 31.5%-stall figure. The formula is centralized in `flowRateForDelta` so either resolution is a one-line change. **Do not finalize the flow/slope expected-value tests until the PM confirms the formula.**

**Version bump**: No task in this file may bump `ENGINE_API_VERSION`, `TERRAIN_API_VERSION`, `CONSOLE_API_VERSION`, `NETWORK_API_VERSION`, or `MATCHMAKING_API_VERSION` — all changes are additive or internal-to-package (plan D10). Conformance suites re-run green.

**Organization**: Phase 1 = setup; Phase 2 = engine flow gradient; Phase 3 = terrain smoothing (parallel-safe with Phase 2); Phase 4 = design tokens (blocks console); Phase 5 = console slope color-coding; Phase 6 = matchmaking verification; Phase 7 = manual (lands with behavior per FR-012); Phase 8 = final gates.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify branch/environment, spec amendments, and baseline before any code.

- [ ] T001 Verify branch is `issue-30-pipe-flow-rate` and the spec amendments are present (`git branch --show-current`; `grep -c "v1.2" specs/001-core-game-engine/spec.md` ≥ 1, `grep -c "v1.3" specs/003-procedural-terrain-generation/spec.md` ≥ 1, `grep -c "FR-013" specs/005-client-console/spec.md` ≥ 1) — then run `SPECIFY_FEATURE=001-core-game-engine SPECIFY_FEATURE_DIRECTORY=specs/001-core-game-engine bash .specify/scripts/bash/setup-plan.sh --json` idempotently; confirm `plan.md` / `research.md` / `data-model.md` / `contracts/` / `tasks.md` exist on disk.
- [ ] T002 [P] Baseline audit — `grep -rn "flowDownhillFactor\|flowUphillFactor" --include="*.ts" --include="*.md" .` (excluding `node_modules`, `dist`, `.git`) and record every file that must change: `packages/engine/src/{constants.ts, contracts/engine-api.ts, resolution/flow.ts}`, `packages/engine/tests/unit/{flow,capture,combat,decay}.test.ts`, `packages/engine/tests/quickstart/slope-flow.test.ts`, `packages/engine/README.md`, `specs/001-core-game-engine/{contracts/engine-api.ts, quickstart.md}`, `docs/manual/numbers.md`, `specs/007-player-manual/{plan.md,research.md}` (historical references — leave as-is, note in PR). Evidence is a checklist comment in the PR.

**Checkpoint**: `ls specs/001-core-game-engine/{plan.md,research.md,data-model.md,tasks.md} contracts/*.ts` all exist; spec amendments confirmed; baseline audit recorded.

---

## Phase 2: Engine — Flow Gradient (BLOCKS console drift test + terrain reachable-land suite)

**Purpose**: Replace the multiplicative-factor slope model with the elevation-gradient model (spec 001 FR-007, Clarifications v1.1/v1.2). The formula lives in one exported function; `resolveFlow` consumes it.

**⚠️ R-1**: T007's expected values depend on the PM-confirmed formula (asymmetric cap working assumption). Write the tests against the confirmed formula; if the PM chooses the symmetric-cap alternative, only `flowRateForDelta` + the expected-value tables change.

- [ ] T003 Update BOTH `EngineConstants` contract mirrors in the SAME commit — `packages/engine/src/contracts/engine-api.ts` and `specs/001-core-game-engine/contracts/engine-api.ts`: remove `flowDownhillFactor`/`flowUphillFactor`, add `flowSlopeStep`/`flowSlopeDeltaCap` (JSDoc: "Troops added/subtracted per unit of elevation change" / "Caps the downhill bonus"; FR-007). Keep `flowBase`. The engine's `contracts-drift.test.ts` (semantic diff) fails until both are in sync — run it after this task.
  - Acceptance: `pnpm --filter @europa/engine test -- contracts-drift` green; both files semantically identical.
- [ ] T004 Update `packages/engine/src/constants.ts` `ENGINE_CONSTANTS` — `flowBase: 7`, `flowSlopeStep: 1`, `flowSlopeDeltaCap: 5`; delete the two factor fields; rewrite the FR-007 comment block to describe the gradient model (downhill `base + step×min(|Δ|,cap)`, flat `base`, uphill `max(0, base − step×|Δ|)` — asymmetric cap per R-1; stall at Δ ≥ `flowBase/flowSlopeStep`).
  - Acceptance: `ENGINE_CONSTANTS.flowBase === 7 && flowSlopeStep === 1 && flowSlopeDeltaCap === 5`; no `flowDownhillFactor`/`flowUphillFactor` references remain in `src/`.
- [ ] T005 Add `packages/engine/src/flow-rate.ts` — pure `flowRateForDelta(delta: number, constants: EngineConstants): number` implementing the FR-007 formula (integer arithmetic; doc comment citing FR-007 + R-1 working assumption). Export from `packages/engine/src/index.ts` (alphabetical position in the value-export block).
  - Acceptance: `import { flowRateForDelta } from '@europa/engine'` compiles; `flowRateForDelta(-5, ENGINE_CONSTANTS) === 12`, `(0) === 7`, `(1) === 6`, `(6) === 1`, `(7) === 0` (asymmetric working assumption).
- [ ] T006 Rewrite `packages/engine/src/resolution/flow.ts` — `TransferParams` drops `downFactor`/`upFactor`, gains `step`/`cap`; `transfer` computes `elevDelta = dstCell.elevation − srcCell.elevation` and `moved = flowRateForDelta(elevDelta, constants)` (import from `../flow-rate`); keep the capacity clamp, water rejection, OOB no-op, inflow tally, and N→E→S→W iteration order (FR-017 determinism). Update the file header comment.
  - Acceptance: `pnpm --filter @europa/engine test -- flow` green after T007 lands; determinism test (same input × 1000) still green.
- [ ] T007 [P] Rewrite `packages/engine/tests/unit/flow.test.ts` for the gradient model (write AFTER T003 so it compiles, BEFORE T005/T006 so it FAILS): `TEST_CONSTANTS` uses the new shape (`flowBase: 7, flowSlopeStep: 1, flowSlopeDeltaCap: 5`); slope tests assert exact rates — downhill Δ=1 → 8, Δ=5 → 12, Δ=10 → 12 (cap); flat → 7; uphill Δ=1 → 6, Δ=6 → 1, Δ=7 → 0 (stall, pipe remains laid and legal — US1 AC-5); ordering downhill > flat > uphill; capacity clamp; water rejection; determinism. **Expected values per the PM-confirmed formula (R-1).**
  - Acceptance: tests FAIL before T005/T006 (proven failing), green after; `pnpm --filter @europa/engine test -- flow` green.
- [ ] T008 [P] Mechanical update of `packages/engine/tests/unit/{capture,combat,decay}.test.ts` — replace `flowDownhillFactor: 1, flowUphillFactor: 0, flowBase: 0` with `flowBase: 0, flowSlopeStep: 1, flowSlopeDeltaCap: 5` in each `CONSTANTS`/`TEST_CONSTANTS` literal (these suites don't exercise flow; values are placeholders satisfying the type).
  - Acceptance: all three suites compile and pass unchanged.
- [ ] T009 [P] Rewrite `packages/engine/tests/quickstart/slope-flow.test.ts` (quickstart Q-003) — derive expected values from `ENGINE_CONSTANTS` via `flowRateForDelta` (import from `../../src/flow-rate`): downhill Δ=10 → `flowRateForDelta(-10, ENGINE_CONSTANTS)`, flat → 7, uphill Δ=10 → 0 (stall); keep the strict ordering assertion (downhill > flat > uphill) and the determinism assertion. Update the header comment (drop the "flowUphillFactor = 0" prose). Also update `specs/001-core-game-engine/quickstart.md` Q-003 section (comment `flow{Downhill,Base,Uphill}Factor` → gradient constants + `flowRateForDelta`).
  - Acceptance: `pnpm --filter @europa/engine test -- slope-flow` green; quickstart.md Q-003 text matches the shipped model.
- [ ] T010 [P] Update `packages/engine/README.md` flow example (line ~98: "pipe moves `flowBase × factor` (1 × 1 = 1) troops east") — rewrite for the gradient model (e.g., flat pipe moves `flowBase` = 7 troops; cite `flowRateForDelta`).
  - Acceptance: README example matches shipped behavior; no `flowDownhillFactor`/`flowUphillFactor` references remain in `packages/engine/README.md`.

**Checkpoint**: Engine flow is gradient-based; `flowRateForDelta` exported; both contract mirrors in sync; all engine suites green; quickstart Q-003 updated.

---

## Phase 3: Terrain — Smoothing + Settings Plumbing (parallel-safe with Phase 2)

**Purpose**: Add the deterministic smoothing pass and the `terrainSmoothing` setting (spec 003 FR-010, Clarifications v1.3). Independent of Phase 2 except the reachable-land suite (T019) reads `ENGINE_CONSTANTS`/`flowRateForDelta` — schedule T019 after Phase 2 lands.

- [ ] T011 Update BOTH `GenerationSettings` contract mirrors in the SAME commit — `packages/terrain/src/contracts/terrain-types.ts` and `specs/003-procedural-terrain-generation/contracts/terrain-types.ts`: add `readonly terrainSmoothing: number` (JSDoc: integer, default 4, safe range [0,8], 0 = no smoothing, FR-010) and `DEFAULT_GENERATION_SETTINGS.terrainSmoothing = 4`. The terrain `contracts-drift.test.ts` fails until both are in sync — run it after this task.
  - Acceptance: `pnpm --filter @europa/terrain test -- contracts-drift` green; both files semantically identical.
- [ ] T012 Update `packages/terrain/src/settings.ts` — `resolveSettings` gains `terrainSmoothing: partial.terrainSmoothing ?? DEFAULT_GENERATION_SETTINGS.terrainSmoothing`; `validateSettings` adds `'terrainSmoothing'` to `integerFields`.
  - Acceptance: `pnpm --filter @europa/terrain test -- settings` green (extend `settings.test.ts` in T018).
- [ ] T013 Update `packages/terrain/src/clamp.ts` — add `TERRAIN_SMOOTHING_MIN = 0`, `TERRAIN_SMOOTHING_MAX = 8`, `clampTerrainSmoothing(v)` (via the existing `clampInt`), and one line in `clampSettings`.
  - Acceptance: `clampTerrainSmoothing(-3) === 0`, `(4) === 4`, `(99) === 8`, `(2.7) === 2`; `clampSettings` includes the field.
- [ ] T014 Add `packages/terrain/src/smoothing.ts` — pure `smoothElevation(elev: Uint8Array, size: number, passes: number): Uint8Array`: for each pass, each cell's elevation = `Math.floor((sum + 4) / 9)` over its 3×3 neighborhood with coordinates clamped to `[0, size-1]`; `passes === 0` returns a copy of the input unchanged; never mutates the input; doc comment citing FR-010 + kernel rationale (spec 003 v1.3 reference kernel). Export from `packages/terrain/src/index.ts` (alphabetical).
  - Acceptance: pure function; no RNG/wall-clock; output stays in [0,255]; `smoothElevation(elev, size, 0)` deep-equals `elev`.
- [ ] T015 Wire smoothing into `packages/terrain/src/generate.ts` — after `const elev = generateElevationMap(...)` and before `extractWater(...)`: `const smoothed = smoothElevation(elev, req.boardSize, settings.terrainSmoothing)` and pass `smoothed` to `extractWater`/`buildBoard`. No RNG consumption (the pass is pure). Update the pipeline doc comment.
  - Acceptance: `generateBoard` at default settings produces the smoothed field; `terrainSmoothing: 0` output byte-identical to pre-change output for the same seed (pinned in T020).
- [ ] T016 [P] Unit tests `packages/terrain/tests/unit/smoothing.test.ts` — (a) k=0 identity (deep-equals input); (b) determinism (same input × 100 runs → identical output); (c) symmetry preservation (180°-symmetric input → symmetric output at k=1,2,4,8); (d) value bounds (output ⊆ [0,255]); (e) edge clamping (corner cell mean uses clamped neighborhood — hand-computed expected value); (f) monotone smoothing (max adjacent |Δ| non-increasing with passes on a crafted ridge).
  - Acceptance: all green; tests FAIL before T014 (proven failing).
- [ ] T017 [P] Extend `packages/terrain/tests/unit/settings.test.ts` + `clamp.test.ts` — `resolveSettings` fallback for `terrainSmoothing`; `validateSettings` rejects non-integer `terrainSmoothing` (e.g., 2.5) and accepts 0..8; `clampSettings` clamps out-of-range values and surfaces them.
  - Acceptance: green; FR-008 clamping semantics pinned.
- [ ] T018 [P] Integration suite `packages/terrain/tests/integration/determinism-smoothing.test.ts` (US4 AC-3/AC-4) — for k ∈ {0,1,2,3,4,5,8} × 10 sampled seeds × 32×32: same-seed regen byte-identical (`hashBoard`); k=0 output byte-identical to a pre-smoothing reference (generate with `terrainSmoothing: 0` and compare against the same seed generated with the smoothing pass disabled — assert equality); `effectiveSettings.terrainSmoothing` reports the clamped value.
  - Acceptance: US4 AC-3/AC-4 green; determinism across the range.
- [ ] T019 [P] Integration suite `packages/terrain/tests/integration/reachable-land.test.ts` (US4 AC-1) — over the 200-map balance suite at default settings (reuse the `sc-002-balance.test.ts` harness pattern): for each map, BFS from each starting city over land cells using flow-viable edges (`flowRateForDelta(delta, ENGINE_CONSTANTS) > 0` — import from `@europa/engine`; runtime import is fine in tests), compute the reachable-land fraction, assert the mean over the suite ≥ 0.50 (empirically 53.6%). Also assert the stall threshold is read from `ENGINE_CONSTANTS` (a comment + the import make the coupling explicit).
  - Acceptance: US4 AC-1 green; a future retune of `flowBase`/`flowSlopeStep` fails this suite loudly.
- [ ] T020 [P] Update `packages/terrain/README.md` — add `terrainSmoothing` to the settings documentation (default 4, range [0,8]) and a `smoothElevation` row in the public API table.
  - Acceptance: README matches shipped surface; no stale settings table.

**Checkpoint**: Terrain smoothing + settings plumbing complete; US4 AC-1/AC-3/AC-4 green; k=0 byte-identity pinned.

---

## Phase 4: Design — Four Pipe Tokens (BLOCKS console rendering; G-04 depends on tokens existing)

**Purpose**: Additive color tokens + `DESIGN.md` sync (012 FR-018) + spec 012 companion note (005 v1.2).

- [ ] T021 Add four tokens to `packages/design/src/tokens.ts` `color` group (alphabetical position): `pipeDownhill: '#059669'`, `pipeFlat: '#f59e0b'`, `pipeUphill: '#dc2626'`, `pipeStalled: '#9ca3af'` — each reusing an existing canonical value (green/accent/red/textMuted; zero new hex literals). Doc comment citing 005 FR-013.
  - Acceptance: `TOKENS.color.pipeDownhill === TOKENS.color.green` (and the other three equivalences); `pnpm --filter @europa/design build` regenerates `dist/design.css` with the four `--europa-color-pipe-*` variables.
- [ ] T022 Update `DESIGN.md` in the SAME commit as T021 (FR-018) — §1.1 Colors gains four rows (token name, CSS variable `--europa-color-pipe-*`, TS constant, canonical value, pairing + measured ratio + WCAG target — non-text 1.4.11 ≥ 3:1 against the darkest land tile / void, reusing the §3 measurements for the underlying values); §3 Accessibility pairing table gains the four rows (or a grouped row noting the reuse). Keep the §1.1 "only lines that carry a token-variable identifier" rule intact.
  - Acceptance: `DESIGN.md` token rows match `tokens.ts` exactly; no new hex values beyond the four canonical ones.
- [ ] T023 Add the companion note to `specs/012-design-system/spec.md` — a Clarifications v1.1 entry: "Pipe slope color tokens (issue #30 companion)" recording the four additive tokens, the FR-018 same-change-set obligation, and that the change is additive (minor) per DESIGN.md §6.
  - Acceptance: spec 012 carries the companion note; no FR text altered.
- [ ] T024 [P] Add `packages/design/tests/tokens.test.ts` — assert the four pipe tokens exist and equal their canonical source values (green/accent/red/textMuted); assert the token table is still sorted alphabetically within the color group (the emitter's determinism invariant). Runs under the existing `pnpm --filter @europa/design test` (default vitest node env; add a minimal `vitest.config.ts` only if the default discovery fails).
  - Acceptance: `pnpm --filter @europa/design test` green; tokens pinned.

**Checkpoint**: Tokens exist, `DESIGN.md` truthful, spec 012 noted, G-04 guard can now pass once the console consumes the tokens.

---

## Phase 5: Console — Slope Color-Coding (depends on Phase 2 engine + Phase 4 tokens)

**Purpose**: Pipes render slope color-coded with a hollow stalled treatment (spec 005 FR-013); fog fallback to flat; drift test pins the mirror.

- [ ] T025 Add `packages/console/src/render/pipe-slope.ts` — `PipeSlope` union, `PipeSlopeConstants` interface, `PIPE_SLOPE_CONSTANTS` (mirror of `flowBase: 7, flowSlopeStep: 1, flowSlopeDeltaCap: 5`), `pipeFlowRate(delta, constants)` (formula mirror), `classifyPipeSlope(srcElev, dstElev | null, constants)` (null → 'flat' fog fallback; uphill with `pipeFlowRate === 0` → 'stalled'). Doc comments citing 005 FR-013 + the drift-pin obligation. **Formula per the PM-confirmed resolution (R-1).**
  - Acceptance: pure module; no `@europa/engine` import (src-boundary rule).
- [ ] T026 Update BOTH `CellRenderInfo` contract mirrors in the SAME commit — `packages/console/contracts/console-types.ts` and `specs/005-client-console/contracts/console-types.ts`: add `readonly pipeSlopes: ReadonlyMap<Direction, PipeSlope>` (JSDoc: per-direction slope classification for rendering, 005 FR-013; additive). The console `contract-conformance.test.ts` (byte-identity) fails until both are in sync — run it after this task.
  - Acceptance: `pnpm --filter console test -- contract-conformance` green; both files byte-identical.
- [ ] T027 Update `packages/console/src/state/build-map-view.ts` — after building `rawCells`, compute `pipeSlopes` for every cell with pipes: for each direction, look up the destination cell in `rawCells` (absent → `null` → 'flat'); call `classifyPipeSlope(info.elevation, dstElev, PIPE_SLOPE_CONSTANTS)`; attach via `{ ...info, pipeSlopes }`. `cellViewToRenderInfo` sets `pipeSlopes: new Map()` as the default (filled by buildMapView). `diffCellChanges` unchanged (derived field).
  - Acceptance: `buildMapView` output carries per-pipe slopes; fog-unknown destinations classified 'flat'.
- [ ] T028 Update `packages/console/src/render/palette.ts` — add `PIPE_DOWNHILL_COLOR = TOKENS.color.pipeDownhill`, `PIPE_FLAT_COLOR`, `PIPE_UPHILL_COLOR`, `PIPE_STALLED_COLOR` (thin re-exports per FR-009).
  - Acceptance: no hex literals; `check:no-literals` still green.
- [ ] T029 Update `packages/console/src/render/canvas.ts` `drawPipes` — read `info.pipeSlopes`; per direction: filled triangle in the slope color (downhill/flat/uphill); `'stalled'` → outline-only triangle (stroke in `PIPE_STALLED_COLOR`, no fill — hollow treatment distinct from filled flowing pipes). Keep the existing geometry and pass order.
  - Acceptance: canvas paints slope colors; stalled pipes hollow; no new literals (colors via palette).
- [ ] T030 [P] Unit tests `packages/console/tests/unit/render/pipe-slope.test.ts` — exhaustive classification table: downhill (Δ<0), flat (Δ=0), uphill flowing (Δ=1..6), stalled (Δ≥7), fog fallback (`dstElev: null` → 'flat'); `pipeFlowRate` exact values (8/9/10/11/12, 7, 6/5/4/3/2/1, 0); `PIPE_SLOPE_CONSTANTS` shape. **Expected values per the PM-confirmed formula (R-1).**
  - Acceptance: tests FAIL before T025 (proven failing), green after.
- [ ] T031 [P] Drift test `packages/console/tests/unit/render/slope-drift.test.ts` — import `ENGINE_CONSTANTS` + `flowRateForDelta` from `@europa/engine` (runtime import in tests is sanctioned by 005 v1.2): assert `PIPE_SLOPE_CONSTANTS.flowBase === ENGINE_CONSTANTS.flowBase` (and step/cap); assert `pipeFlowRate(Δ, PIPE_SLOPE_CONSTANTS) === flowRateForDelta(Δ, ENGINE_CONSTANTS)` for Δ ∈ {−10..10} (includes the stall boundary).
  - Acceptance: drift test green; a future engine retune fails this suite loudly.
- [ ] T032 [P] Component test `packages/console/tests/component/render/pipe-slope.spec.tsx` (browser mode, mirroring `map-canvas.test.tsx`) — mount `App` with a scripted view containing downhill/flat/uphill/stalled pipes; assert the canvas paints the four slope colors (pixel readback) and the stalled pipe renders hollow (outline-only — assert stroke present, fill absent at the triangle centroid); a fog-unknown destination pipe renders flat. Include an axe a11y check (no violations).
  - Acceptance: FR-013 rendering green; a11y suite stays green.

**Checkpoint**: Console renders slope color-coding; drift test pins the mirror; fog fallback verified; G-04 no-literals green.

---

## Phase 6: Matchmaking — Verification Only (no code change)

**Purpose**: Prove `terrainSmoothing` flows through `MatchSettings.terrainSettings` (006 Implementation Notes).

- [ ] T033 Add `packages/matchmaking/tests/integration/terrain-smoothing-passthrough.test.ts` — via the real matchmaker: (a) create with `terrainSettings: { terrainSmoothing: 2 }` → match settings carry 2 and the generated board's `effectiveSettings.terrainSmoothing === 2`; (b) create with `terrainSmoothing: 99` → clamped to 8 and surfaced; (c) create with no override → default 4; (d) a rematch reuses the original smoothing value (`MatchRecord.initialSeed` + settings carry-over).
  - Acceptance: 006 Implementation Notes verified; zero `packages/matchmaking/src` changes.

**Checkpoint**: Matchmaking passthrough proven; no shape change.

---

## Phase 7: Manual — Same-Change-Set Updates (007 FR-012)

**Purpose**: The manual rides with the behavior change sets (FR-012) — these pages land in the same commits as the engine/terrain/console behavior, not as a final monolith. Numbers traceable to `ENGINE_CONSTANTS`/`DEFAULT_GENERATION_SETTINGS` per SC-002.

- [ ] T034 Rewrite `docs/manual/pipes.md` — flow table becomes the gradient model: downhill 8–12 (Δ=1..≥5), flat 7, uphill 6→1 (Δ=1..6), stalled 0 (Δ≥7); the "classic new-player trap" section rewritten (uphill pipes are slow, steep uphill stalls — visible as hollow triangles per 005 FR-013); feeding/decay section unchanged except the "even 1 troop per tick" example (now "even a trickle" — the minimum non-zero flow is 1). **Flow rates per the PM-confirmed formula (R-1).**
  - Acceptance: FR-006/FR-010 wording matches shipped behavior; no stale "uphill moves nothing" prose.
- [ ] T035 Rewrite `docs/manual/numbers.md` — Simulation table flow rows: downhill `flowBase + flowSlopeStep × min(|Δ|, flowSlopeDeltaCap)` (8–12), flat `flowBase` (7), uphill `max(0, flowBase − flowSlopeStep × |Δ|)` (6→1), stalled `0` (Δ≥7, threshold `flowBase / flowSlopeStep`); add a Terrain section row: `terrainSmoothing` default 4, range 0–8, traceable to `DEFAULT_GENERATION_SETTINGS`. **Values per the PM-confirmed formula (R-1).**
  - Acceptance: SC-002 audit passes — every row traces to `ENGINE_CONSTANTS`/`DEFAULT_GENERATION_SETTINGS`.
- [ ] T036 Update `docs/manual/index.md` — the 60-second version's "downhill pipes flow while uphill pipes sit idle" → gradient phrasing ("downhill pipes flow fastest, flat pipes flow steadily, and steep uphill pipes stall"); add a terrain-smoothing mention if the board paragraph references roughness.
  - Acceptance: index matches the shipped model; version footer line unchanged (`pnpm version:check` green).
- [ ] T037 Rewrite `docs/manual/the-board.md` — Elevation shading section: downhill bonus / uphill handicap / stall (gradient model, cross-ref pipes.md); add a terrain-smoothing paragraph (what the setting does, default 4, range 0–8, 0 = no smoothing, hosts adjust at match creation, smoother maps have more viable cross-map routes — FR-008).
  - Acceptance: FR-008 wording matches shipped behavior.

**Checkpoint**: Manual truthful; `pnpm version:check` + docs-privacy + `check:no-literals` green after edits.

---

## Phase 8: Final Gates (SC-001..SC-005 across touched packages)

**Purpose**: Repo-wide verification before merge.

- [ ] T038 Repo-wide gates — `pnpm typecheck` && `pnpm lint` && `pnpm format:check` (zero errors, zero suppressions) && `pnpm version:check` (lockstep intact) && `pnpm --filter @europa/design check:no-literals` && `pnpm --filter @europa/design check:vendor-identity` && docs-privacy check (`specs/010-public-lobby-match-browser/check-documentation-privacy.mjs`).
  - Acceptance: all green; zero inline suppressions in all touched trees.
- [ ] T039 Coverage gate — run coverage for every touched package: `pnpm --filter @europa/engine test -- --coverage`, `pnpm --filter @europa/terrain test -- --coverage`, `pnpm --filter @europa/design test -- --coverage`, `pnpm --filter @europa/matchmaking test -- --coverage`, `pnpm --filter console test -- --coverage` (merged node+browser). Assert each retains ≥80% on statements/branches/functions/lines (constitution III); no suppression comments added to meet gating.
  - Acceptance: every touched package ≥80% on every metric; engine/terrain/console suites fully green (including the new flow/smoothing/slope/drift/reachable-land tests).
- [ ] T040 Full-suite regression — run the complete per-package suites (engine, terrain, fog, networking, matchmaking, console node-mode, version) and the console browser suites (component/a11y/e2e/perf/determinism/parity/conformance/keepalive); confirm the determinism fixtures (engine 10k-tick, terrain 1k-seed, console golden) stay green — the flow-rate change alters tick outcomes, so any committed golden fixture that encodes the old multiplicative model must be regenerated in this change set with the new model documented.
  - Acceptance: repo-wide suites green; determinism fixtures regenerated where the flow model changed (documented in the PR).

**Checkpoint**: All SCs green; no regression; manual truthful; tokens synced; zero suppressions; no version bumps.

---

## Dependencies & Execution Order

### Phase Dependencies (sequential where the product demands it; parallel where the code allows it)

```
Phase 1 — Setup (T001–T002) ──────────────────────────────────────────┐
                                                                       │
Phase 2 — Engine flow gradient (T003→T007→T005/T006→T008/T009/T010) ──┤  T003 (contract mirrors) blocks T007 (tests must compile)
Phase 3 — Terrain smoothing (T011→T012/T013→T014→T015→T016/T017/T018) ┤  T011 (contract mirrors) blocks T012/T013/T014
  (Phases 2 and 3 are disjoint packages — parallel-safe)               │  T019 (reachable-land) needs Phase 2 (flowRateForDelta)
                                                                       │
Phase 4 — Design tokens (T021→T022/T023/T024) ─────────────────────────┤  T021 (tokens) blocks T022 (DESIGN.md, FR-018)
                                                                       │
Phase 5 — Console (T025→T026→T027/T028/T029→T030/T031/T032) ───────────┤  needs Phase 2 (drift test) + Phase 4 (tokens)
                                                                       │
Phase 6 — Matchmaking verification (T033) ─────────────────────────────┤  needs Phase 3 (effectiveSettings)
                                                                       │
Phase 7 — Manual (T034–T037) — lands in the SAME change sets as the    │  FR-012: manual rides with behavior
  engine/terrain/console behavior, not as a final monolith             │
                                                                       │
Phase 8 — Final gates (T038–T040) ─────────────────────────────────────┘
```

### Within Each Phase

- Tests FIRST (or alongside) and must FAIL before implementation — especially `flow.test.ts` (T007), `smoothing.test.ts` (T016), `pipe-slope.test.ts` (T030), and the drift test (T031).
- Contract mirrors before consumers (T003 before T007; T011 before T012–T015; T026 before T027).
- Core implementation before integration; unit before component/E2E.

### Parallel Opportunities (marked [P])

- T002 (baseline audit) — standalone.
- Phase 2 (engine) and Phase 3 (terrain) — disjoint packages, fully parallel.
- T007 / T008 / T009 / T010 — disjoint test/README files after T003/T004.
- T016 / T017 / T018 / T019 / T020 — disjoint terrain test/README files after T011–T015.
- T022 / T023 / T024 — disjoint files after T021.
- T030 / T031 / T032 — disjoint console test files after T025–T029.
- T038 / T039 / T040 — disjoint gates (can run in any order; T040 last).

### Subagent Reliability Notes (AGENTS.md environment notes)

- One file per dispatch where possible; verify each landing on disk before proceeding.
- Exact file paths (all paths above verified against the current tree).
- Pre-create target directories before dispatching writers (e.g., `packages/terrain/tests/integration/` exists; `packages/console/tests/unit/render/` exists; `packages/design/tests/` exists with `.keep`).
- The R-1 formula confirmation is a hard gate before T007/T009/T030/T031/T034/T035 — do not dispatch those with unconfirmed expected values.

---

## Notes

- **R-1 formula**: any task that hardcodes flow expected values (T007, T009, T030, T031, T034, T035) must use the PM-confirmed formula. The working assumption (asymmetric cap) matches every number in the specs; the alternative (symmetric cap with cap ≥ 7) changes downhill rates and contradicts the spec's listing — flag to the PM, don't silently pick.
- **No version bumps**: any task proposing to edit `ENGINE_API_VERSION`, `TERRAIN_API_VERSION`, `CONSOLE_API_VERSION`, `NETWORK_API_VERSION`, `MATCHMAKING_API_VERSION`, or a wire envelope is out of scope — reject it.
- **No `any` / suppressions**: `any` is banned without documented justification; `eslint-disable` / `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` are never green — fix the code.
- **No new literals**: the console's pipe colors must flow through `palette.ts` re-exports of `TOKENS`; `check:no-literals` (G-04) fails otherwise.
- **Manual rides with behavior**: T034–T037 land in the same commits as the engine/terrain/console behavior (FR-012); never merge a behavior change with a stale manual.
- Commit after each task or logical group; use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Every commit message must be verifiable by `pnpm typecheck && pnpm lint && pnpm test` on the touched package.

---

## Implementation Strategy

### MVP First (engine + terrain foundations)

1. Complete Phase 1 + Phase 2 (engine gradient + tests) → the flow mechanic ships.
2. Complete Phase 3 (terrain smoothing + tests) → maps become traversable.
3. **STOP and VALIDATE**: run the engine + terrain suites and the reachable-land suite locally; confirm the R-1 formula with the PM before proceeding.

### Incremental Delivery (each phase adds value without breaking previous)

1. Engine gradient (Phase 2) → terrain smoothing (Phase 3) → tokens (Phase 4) → console rendering (Phase 5) → matchmaking verification (Phase 6) → manual (Phase 7, riding with behavior) → gates (Phase 8).
2. The manual pages land with the behavior change sets (not deferred to the end) — at least touch `docs/manual/` in the commits that land Phase 2 and Phase 3 and Phase 5, so no merge to `main` carries a stale manual (FR-012).

### Parallel Team Strategy (if multi-engineer)

1. Engineer A: engine gradient (T003 → T007 → T005/T006 → T008/T009/T010)
2. Engineer B: terrain smoothing (T011 → T012/T013 → T014 → T015 → T016/T017/T018/T019/T020) — T019 waits for Engineer A's `flowRateForDelta`
3. Engineer C: design tokens (T021 → T022/T023/T024) after Phase 2/3 foundations, then console (T025 → T026 → T027/T028/T029 → T030/T031/T032)
4. Join for matchmaking verification (T033), manual (T034–T037), and gates (T038–T040).