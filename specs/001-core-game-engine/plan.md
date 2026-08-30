# Implementation Plan: Elevation-Gradient Pipe Flow + Terrain Smoothing + Slope Color-Coding (issue #30)

**Branch**: `issue-30-pipe-flow-rate` | **Date**: 2026-08-30 | **Specs**: [`001`](./spec.md) Clarifications v1.2 · [`003`](../003-procedural-terrain-generation/spec.md) Clarifications v1.3 · [`005`](../005-client-console/spec.md) Clarifications v1.2 · [`006`](../006-match-lifecycle-matchmaking/spec.md) Implementation Notes · [`007`](../007-player-manual/spec.md) v1.3 · [`012-design-system`](../012-design-system/spec.md) companion
**Dependencies**: 001 engine FR-007 (gradient flow) · 003 terrain FR-010 (terrainSmoothing) · 005 console FR-013 (slope color-coding) · 006 matchmaking `terrainSettings` passthrough · 007 manual FR-012 (same-change-set) · 012 design tokens (FR-018 sync)
**Research**: [`research.md`](./research.md) | **Data Model**: [`data-model.md`](./data-model.md) | **Contracts**: [`contracts/`](./contracts/) | **Tasks**: [`tasks.md`](./tasks.md)

**Input**: Spec amendments for issue #30 (commits `3907ee1`, `71d46ad`) — one coordinated change set across six specs: (1) engine pipe flow becomes a linear gradient of the elevation change (`flowBase=7`, `flowSlopeStep=1`, `flowSlopeDeltaCap=5`), replacing the binary multiplicative-factor model; (2) terrain gains a configurable post-process smoothing pass (`terrainSmoothing`, default 4, range 0–8) so maps gain multiple viable cross-map routes; (3) the console color-codes pipe indicators by slope (downhill green / flat amber / uphill red, fixed scheme) with a hollow-triangle stalled treatment; (4) four new `@europa/design` color tokens; (5) the player manual's flow/board/numbers pages ride in the same change set; (6) matchmaking carries `terrainSmoothing` through `terrainSettings` with no shape change.

> Produced via the `/speckit.plan` workflow. This plan supersedes the original feature-001 plan (preserved in git history at `859a4f3`); the spec amendments already updated `spec.md` and `data-model.md` in the planning commits, and this document is the implementation plan for the amended behavior.

---

## Summary

Issue #30 is a **cross-package gameplay rebalance with a rendering companion**, not a new backend. The engine's flow model changes from "downhill/flat = base, uphill = 0" to a linear gradient of the elevation change; terrain smoothing makes the maps gentler so the gradient is actually traversable; the console renders the gradient so players can read it; the design system supplies the four pipe colors; the manual documents the new numbers; matchmaking needs **zero code change** (its `terrainSettings` spread already carries new `GenerationSettings` fields).

The plan delivers, in dependency order:

1. **Engine (001)**: a single pure `flowRateForDelta(delta, constants)` function becomes the one source of the flow formula; `resolveFlow` consumes it; `EngineConstants` replaces `flowDownhillFactor`/`flowUphillFactor` with `flowSlopeStep`/`flowSlopeDeltaCap` in **both** contract mirrors (the engine conformance suite fails until both are in sync); `ENGINE_CONSTANTS` ships `flowBase=7, flowSlopeStep=1, flowSlopeDeltaCap=5`; flow unit tests + quickstart Q-003 + engine README example update in the same change set.
2. **Terrain (003)**: a new `smoothing.ts` module applies a deterministic 3×3 box-mean pass (divisor 9, clamped coordinates, round-half-up integer math) `terrainSmoothing` times, after point-symmetry enforcement and before water classification; `GenerationSettings` gains the additive `terrainSmoothing` field (default 4, range [0,8]) plumbed through `resolveSettings`/`validateSettings`/`clampSettings`/`DEFAULT_GENERATION_SETTINGS` and surfaced via `effectiveSettings`; `terrainSmoothing: 0` is byte-identical to pre-smoothing output.
3. **Design (012 companion)**: four additive color tokens (`pipeDownhill`, `pipeFlat`, `pipeUphill`, `pipeStalled`) reusing canonical values, `DESIGN.md` §1.1/§3 rows with measured pairings (FR-018 same-change-set), and a companion Clarifications note in spec 012.
4. **Console (005)**: a `pipe-slope.ts` module mirrors the engine constants + formula (src-boundary-safe), `CellRenderInfo` gains an additive `pipeSlopes` field computed in `buildMapView`, the canvas painter draws per-slope colors with a hollow triangle for stalled pipes, fog-unknown destinations render flat, and a drift test pins the mirror against `ENGINE_CONSTANTS`/`flowRateForDelta`.
5. **Matchmaking (006)**: no shape change — a verification test proves `terrainSmoothing` flows through `MatchSettings.terrainSettings` via `DEFAULT_GENERATION_SETTINGS` and carries over on rematch.
6. **Manual (007)**: `pipes.md`, `numbers.md`, `index.md`, `the-board.md` rewritten in the same change set (FR-012), numbers traceable to `ENGINE_CONSTANTS`/`DEFAULT_GENERATION_SETTINGS` per SC-002.

No wire, envelope, frame-codec, or version-constant bump. `ENGINE_API_VERSION`/`TERRAIN_API_VERSION`/`CONSOLE_API_VERSION` stay unchanged (the `EngineConstants` field swap is an internal contract change enforced by the existing semantic-diff conformance tests, not a protocol version).

---

## Technical Context

**Language/Version**: TypeScript ≥ 5.6 with `strict: true` (all packages extend `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`). Node.js ≥ 22 LTS. Biome 2 (four-space/120-column, root `biome.jsonc` layered config).

**Primary Dependencies** (no new runtime deps):
- `typescript@^5.6` (via `catalog:`), `vitest@^4` + `v8` coverage, `@biomejs/biome@^2`, `tsup@8` (library packages), `vite@^6` (console), `tsx` (scripts)
- Workspace packages: `@europa/engine` (flow formula + constants), `@europa/terrain` (smoothing + settings), `@europa/design` (tokens), `@europa/matchmaking` (verification only), `packages/console` (rendering)

**Storage**: N/A — pure in-memory; no persistence changes.

**Testing**: Vitest 4 (unit / integration / coverage with 80% gate per constitution III), Playwright (console component/E2E), `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm version:check` / `pnpm --filter @europa/design check:no-literals`. Coverage is merged node+browser for console (existing pattern). Every FR maps to a test file listed in `tasks.md`.

**Target Platform**: Node.js ≥ 22 for engine/terrain/matchmaking; browsers (Chromium via Playwright) for console.

**Project Type**: Library extensions within the pnpm-workspaces monorepo + SPA console. Five touched surfaces: `packages/engine`, `packages/terrain`, `packages/design`, `packages/console`, `docs/manual`; `packages/matchmaking` is **verified, not edited**.

**Performance Goals** (map directly to SCs):
- **001 SC-004**: full tick of a 32×32 board < 10 ms — the gradient formula is a handful of integer ops per pipe; no measurable regression (existing perf suite re-runs).
- **003 SC-003**: default 32×32 map generates < 1 s — the smoothing pass is O(passes × cells) integer work (4 × 1024 cells ≈ 4k ops); well inside budget.
- **005 SC-003**: input→order < 50 ms — slope classification is precomputed in `buildMapView` (pure, O(cells × pipes)), not per-frame in the painter.

**Constraints** (constitution + spec Out of Scope):
- TypeScript strict, zero `any` without documented justification, zero lint suppressions (`eslint-disable` / `@ts-ignore` / etc. forbidden) — code-quality skill.
- Server-authoritative deterministic simulation (constitution II): no wall-clock, no unseeded randomness, no floating-point drift in tick/generation logic. The smoothing pass uses integer-only round-half-up (`Math.floor((sum + 4) / 9)`); the flow formula is integer arithmetic.
- ≥80% coverage on every metric over touched files and overall (constitution III).
- Specs-as-docs (constitution IV): stale spec/manual is a bug; `docs/manual/` rides with behavior changes (007 FR-012); `DESIGN.md` rides with token changes (012 FR-018).
- Simplicity over cleverness (constitution V): one flow formula in one function, one smoothing kernel, four token names reusing canonical values, no new package, no new protocol field.
- WCAG 2.2 AA (constitution VI): pipe colors are non-text indicators with documented pairings; slope is redundantly encoded (color + triangle shape + hollow-vs-filled) so color is never the only carrier.
- Self-hostable (constitution VII): no new services, no CDN, no external assets.
- No `NETWORK_API_VERSION` / `MATCHMAKING_API_VERSION` / `ENGINE_API_VERSION` / `TERRAIN_API_VERSION` / `CONSOLE_API_VERSION` bump (additive or internal-only changes).

**Scale/Scope**:
- Touched files: `packages/engine/src/{constants.ts, resolution/flow.ts, index.ts, contracts/engine-api.ts}` + 4 test files + README; `packages/terrain/src/{smoothing.ts (new), settings.ts, clamp.ts, generate.ts, index.ts, contracts/terrain-types.ts}` + test files + README; `packages/design/src/tokens.ts` + `DESIGN.md` + spec 012 note; `packages/console/src/render/{pipe-slope.ts (new), build-map-view.ts, canvas.ts, palette.ts}` + `contracts/console-types.ts` (both mirrors) + tests; `docs/manual/{pipes,numbers,index,the-board}.md`; spec mirrors in `specs/001/003/005/012`.
- Unchanged at runtime: `packages/fog`, `packages/networking`, `packages/matchmaking` (verification test only), `packages/version`.

---

## Constitution Check

*Gate: must pass before Phase 0 research; re-checked after Phase 1 design (see last row).*

| Principle | Gate (from `.specify/memory/constitution.md`) | This plan | Status |
|-----------|-----------------------------------------------|-----------|--------|
| **I — Type Safety First** | `strict: true`, no `any` without justification, no suppressions | New types are closed unions (`PipeSlope = 'downhill'\|'flat'\|'uphill'\|'stalled'`), branded-ish readonly shapes (`PIPE_SLOPE_CONSTANTS`), and additive optional fields (`CellRenderInfo.pipeSlopes`). `flowRateForDelta`/`classifyPipeSlope`/`smoothElevation` are pure with fully typed signatures. No `any`, no `eslint-disable`/`@ts-ignore`. | ✅ Pass |
| **II — Server-Authoritative Deterministic Simulation** | Server owns state; fixed ticks; no wall-clock in simulation; deterministic replay | Flow formula is integer arithmetic on `|Δelev|` (no floats). Smoothing is a pure function of the elevation field + setting: integer round-half-up (`Math.floor((sum+4)/9)`), no RNG consumption, no wall-clock; symmetry preserved by the symmetric kernel + symmetric clamping (verified empirically at k=0,1,2,3,4,5,8 per spec 003 v1.3). `terrainSmoothing: 0` is the identity pass → byte-identical to current output. FR-017 determinism unaffected. | ✅ Pass |
| **III — Tested Game Logic ≥80%** | Coverage gate on game logic; behavior tests | New logic (flow gradient, smoothing pass, settings plumbing, slope classification, drift pins) is unit-testable pure code. Engine/terrain/console suites re-run with the 80% gate on every metric; the reachable-land suite (003 US4 AC-1) and the slope drift test (005 FR-013) are behavior tests, not implementation tests. | ✅ Pass |
| **IV — Specs as Documentation** | In-repo specs are source of truth; stale specs are bugs; manual rides with behavior (007 FR-012) | Specs 001/003/005/006/007 already amended in the planning commits; this plan + `research.md` + `data-model.md` + `contracts/` are co-committed. `docs/manual/` updates land in the same change sets as the behavior (FR-012); `DESIGN.md` updates land with the tokens (FR-018); spec 012 gains the companion note. | ✅ Pass |
| **V — Simplicity Over Cleverness** | YAGNI; prefer boring, justified complexity | One flow formula in one exported function (`flowRateForDelta`), one smoothing kernel (3×3 box mean — the spec's own reference kernel), four token names reusing existing canonical values (zero new hex literals), one additive `pipeSlopes` field. No new package, no new runtime dep, no new protocol field, no intensity scaling. | ✅ Pass |
| **VI — Accessibility-Minded UI** | WCAG 2.2 AA: keyboard, screen-reader, contrast, focus | Pipe slope is redundantly encoded: color (green/amber/red/gray) + triangle shape (filled vs hollow) + the DOM overlay's accessible names. The four tokens' pairings are documented with measured ratios in `DESIGN.md` §1.1/§3 (non-text 1.4.11 ≥ 3:1 where claimed). No new interactive surface; keyboard/pointer behavior unchanged. | ✅ Pass |
| **VII — Self-Hostable by Default** | Single process, env/files config, no required cloud | No new services, no CDN, no external assets; the design tokens are bundled constants. | ✅ Pass |
| **Additional: Permissive licenses / no vendor lock-in** | MIT/BSD/Apache-2.0/ISC only; no proprietary API | Zero new deps; existing deps are MIT. | ✅ Pass |

**Post-Phase-1 re-evaluation**: after `data-model.md` + `contracts/` are written, all gates remain green. The only new state shape is the additive `CellRenderInfo.pipeSlopes` (console-internal render model, not wire); the only new settings field is `GenerationSettings.terrainSmoothing` (additive, clamped, surfaced via the existing `effectiveSettings` pattern). No wall-clock enters simulation or generation. No spec amendment required beyond what the planning commits already recorded.

**One blocker requires PM confirmation before implementation** (see Risk & Open Questions R-1): the FR-007 formula as literally written cannot produce uphill stalls at the v1.2 constants; the spec's own rate listing describes an asymmetric cap. The plan's working assumption is the asymmetric reading (matches every number in the specs); the flow tests are written against the PM-confirmed formula.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-core-game-engine/
├── spec.md              # v1.2 source of truth (FR-007 gradient, US1 AC-4/AC-5)
├── plan.md              # this file (issue #30 implementation plan)
├── research.md          # kernel choice, flow-formula analysis, empirical grounding
├── data-model.md        # delta over 001/003/005/012 (6 entities)
├── contracts/           # canonical engine contracts (updated) + informational mirrors
│   ├── engine-api.ts    # UPDATED: EngineConstants field swap (both mirrors in one change set)
│   ├── engine-types.ts  # unchanged
│   ├── flow-rate.ts     # NEW: flowRateForDelta contract (informational mirror)
│   ├── pipe-slope.ts    # NEW: console slope classification contract (informational)
│   └── terrain-smoothing.ts  # NEW: smoothing pass contract (informational)
└── tasks.md             # Phase 5 output
```

### Source Code (repository root — monorepo)

```text
.
├── specs/001-core-game-engine/   # ← this feature's planning artifacts (primary dir)
├── specs/003-procedural-terrain-generation/  # spec amended (v1.3); contracts/terrain-types.ts mirror updated
├── specs/005-client-console/     # spec amended (v1.2); contracts/console-types.ts mirror updated
├── specs/006-match-lifecycle-matchmaking/     # spec amended (Implementation Note); no code change
├── specs/007-player-manual/      # spec amended (v1.3); manual pages ride with behavior
├── specs/012-design-system/      # companion note added (Clarifications v1.1)
├── packages/
│   ├── engine/                   # EXTENDED — flow gradient
│   │   ├── src/
│   │   │   ├── constants.ts      # flowBase=7, flowSlopeStep=1, flowSlopeDeltaCap=5
│   │   │   ├── resolution/flow.ts# consume flowRateForDelta; drop factor model
│   │   │   ├── flow-rate.ts      # NEW: flowRateForDelta(delta, constants) — single source
│   │   │   ├── contracts/engine-api.ts  # EngineConstants field swap (mirror)
│   │   │   └── index.ts          # export flowRateForDelta (additive)
│   │   └── tests/unit/{flow,capture,combat,decay}.test.ts + tests/quickstart/slope-flow.test.ts
│   ├── terrain/                  # EXTENDED — smoothing + settings plumbing
│   │   ├── src/
│   │   │   ├── smoothing.ts      # NEW: smoothElevation(elev, size, passes)
│   │   │   ├── settings.ts       # resolveSettings/validateSettings + terrainSmoothing
│   │   │   ├── clamp.ts          # clampTerrainSmoothing + TERRAIN_SMOOTHING_MIN/MAX
│   │   │   ├── generate.ts       # apply smoothing after elevation, before water
│   │   │   ├── contracts/terrain-types.ts  # GenerationSettings.terrainSmoothing (mirror)
│   │   │   └── index.ts          # export smoothElevation
│   │   └── tests/unit/{smoothing,settings,clamp}.test.ts + tests/integration/{reachable-land,determinism-smoothing}.test.ts
│   ├── design/                   # EXTENDED — 4 additive tokens
│   │   └── src/tokens.ts         # pipeDownhill/pipeFlat/pipeUphill/pipeStalled
│   ├── matchmaking/              # VERIFIED only — terrainSmoothing passthrough test
│   │   └── tests/integration/terrain-smoothing-passthrough.test.ts
│   └── console/                  # EXTENDED — slope color-coding
│       ├── src/render/
│       │   ├── pipe-slope.ts     # NEW: PIPE_SLOPE_CONSTANTS + pipeFlowRate + classifyPipeSlope
│       │   ├── build-map-view.ts # compute pipeSlopes per cell (destination lookup)
│       │   ├── canvas.ts         # per-slope colors + hollow stalled triangle
│       │   └── palette.ts        # 4 re-exports from TOKENS
│       ├── contracts/console-types.ts  # CellRenderInfo.pipeSlopes (mirror, byte-identical)
│       └── tests/unit/render/{pipe-slope,slope-drift}.test.ts + tests/component/render/pipe-slope.spec.tsx
├── docs/manual/                  # EXTENDED — FR-012 same-change-set
│   ├── pipes.md / numbers.md / index.md / the-board.md
└── DESIGN.md                     # §1.1/§3 rows for the 4 pipe tokens (FR-018)
```

**Structure Decision**: The engine owns the flow formula (`flowRateForDelta` exported additively) because three consumers need it — `resolveFlow` (engine), the terrain reachable-land suite (003 US4 AC-1 reads the stall threshold), and the console drift test (005 FR-013). The console's src-boundary rule (no runtime `@europa/engine` import in `src/`) forces a console-side mirror module (`pipe-slope.ts`), pinned by a drift test in `tests/`. The smoothing kernel is the spec's own reference kernel (3×3 box mean, divisor 9, clamped coordinates) so the empirical numbers in spec 003 v1.3 remain valid.

---

## Architecture Overview

### Data flow (engine → terrain → console → manual)

```
Engine (001)                          Terrain (003)                        Console (005)
───────────                           ─────────────                        ─────────────
ENGINE_CONSTANTS                      GenerationSettings                    PlayerView (fog-filtered)
  flowBase=7  ──┐                    terrainSmoothing=4 (default)           visibleCells[].cell.elevation
  flowSlopeStep=1│                   clampSettings → [0,8]                  visibleCells[].pipes
  flowSlopeDeltaCap=5│               generateBoard:                         │
                 │                   fbm → _enforcePointSymmetry           buildMapView
flowRateForDelta(Δ, c) ◄──┐          → smoothElevation(elev, k) ──┐        ├─ cellViewToRenderInfo
  downhill: base+step·min(|Δ|,cap)   → extractWater → cities → board       └─ pipeSlopes: per-direction
  flat:     base                     effectiveSettings.terrainSmoothing       classifyPipeSlope(srcElev,
  uphill:   max(0, base−step·|Δ|)    TerrainGenerationResult.board             dstElev|null, PIPE_SLOPE_CONSTANTS)
  (stall ⟺ uphill ∧ rate=0)          └──► createWorld (engine)              │
resolveFlow uses flowRateForDelta    MatchSettings.terrainSettings          canvas.drawPipes:
  per pipe (integer math)            = {...DEFAULT_GENERATION_SETTINGS,     downhill green / flat amber /
                                     ...partial.terrainSettings} (006)      uphill red / stalled hollow gray
                                     rematch reuses settings (006)          fog-unknown dest → flat
                                                                             │
Design (012)                          Manual (007)                           │
packages/design/src/tokens.ts        docs/manual/{pipes,numbers,index,      │
  pipeDownhill #059669                the-board}.md — FR-012 same change    │
  pipeFlat     #f59e0b                set; numbers traceable to              │
  pipeUphill   #dc2626                ENGINE_CONSTANTS /                     │
  pipeStalled  #9ca3af                DEFAULT_GENERATION_SETTINGS (SC-002)   │
  DESIGN.md §1.1/§3 rows (FR-018)     ───────────────────────────────────────┘
```

### Flow-rate model (the core mechanic)

`flowRateForDelta(delta, constants)` is the single source of the FR-007 formula:

- `delta < 0` (downhill): `flowBase + flowSlopeStep × min(|delta|, flowSlopeDeltaCap)`
- `delta === 0` (flat): `flowBase`
- `delta > 0` (uphill): `max(0, flowBase − flowSlopeStep × |delta|)` — **uncapped handicap** (working assumption, see R-1)

Per-tick rates at the shipped constants: downhill 8/9/10/11/12 (Δ=1/2/3/4/≥5), flat 7, uphill 6/5/4/3/2/1 (Δ=1..6), 0 (Δ≥7 — stall). A stalled pipe is legal and persistent (US1 AC-5); the console renders it hollow (005 FR-013).

### Terrain smoothing pass

`smoothElevation(elev: Uint8Array, size: number, passes: number): Uint8Array` — for each pass, each cell's elevation becomes the round-half-up mean of its 3×3 neighborhood (divisor 9, coordinates clamped to `[0, size-1]` so edge cells replicate their edge). Integer-only: `Math.floor((sum + 4) / 9)` ≡ `Math.round(sum / 9)` for non-negative sums. Pure (no RNG, no wall-clock); symmetry-preserving (symmetric kernel + symmetric clamping commute with 180° rotation); `passes === 0` returns the input unchanged (byte-identical to pre-smoothing output). Applied in `generateBoard` after `generateElevationMap` (which enforces point symmetry) and before `extractWater` (spec 003 FR-010).

### Contract change mechanics (EngineConstants)

`EngineConstants` drops `flowDownhillFactor`/`flowUphillFactor` and gains `flowSlopeStep`/`flowSlopeDeltaCap` (keeping `flowBase`). **Both** mirrors — `packages/engine/src/contracts/engine-api.ts` and `specs/001-core-game-engine/contracts/engine-api.ts` — change in the same commit; the engine's `contracts-drift.test.ts` (semantic diff) fails until both are in sync. The four engine test files constructing `EngineConstants` literals (`flow.test.ts`, `capture.test.ts`, `combat.test.ts`, `decay.test.ts`) update in the same change set. `ENGINE_API_VERSION` does **not** bump: the field swap is internal to the engine's own constants type, enforced by the existing conformance machinery, and no downstream package constructs `EngineConstants` (they consume `ENGINE_CONSTANTS`).

### Console slope classification

`classifyPipeSlope(srcElev: number, dstElev: number | null, constants: PipeSlopeConstants): PipeSlope`:
- `dstElev === null` (destination outside the visibility horizon) → `'flat'` (fog fallback, no slope claim — 005 FR-013).
- `dstElev < srcElev` → `'downhill'`; `===` → `'flat'`; `>` → `'uphill'`, and if `pipeFlowRate(dstElev − srcElev, constants) === 0` → `'stalled'`.

`buildMapView` precomputes `pipeSlopes: ReadonlyMap<Direction, PipeSlope>` per cell with pipes by looking up the destination cell in the visible-cells map (absent → `null` → flat). The canvas painter draws each pipe triangle in its slope color; `'stalled'` triangles are outline-only (stroke, no fill). `CellRenderInfo.pipeSlopes` is an additive field in both `console-types.ts` mirrors (byte-identical per the console conformance suite). The drift test imports `ENGINE_CONSTANTS` + `flowRateForDelta` from `@europa/engine` and pins `PIPE_SLOPE_CONSTANTS` equality and `classifyPipeSlope` agreement over a delta sweep.

### Key design decisions (rationale summarized; full in `research.md`)

| # | Decision | Choice | Why (brief) |
|---|----------|--------|-------------|
| D1 | Flow formula single source | Export `flowRateForDelta(delta, constants)` from `@europa/engine` (additive) | Three consumers need the identical formula (engine tick, terrain reachable-land suite, console drift test); one function prevents the ambiguity from propagating to three copies (research §1). |
| D2 | Uphill handicap cap | **Uncapped** uphill handicap; cap applies to the downhill bonus only (working assumption — R-1) | The spec's own rate listing (uphill 6/5/4/3/2/1, stall Δ≥7) and the empirical 31.5%-stall figure are only consistent with an uncapped handicap; the cap's documented purpose is bounding the downhill bonus (research §2). |
| D3 | Smoothing kernel | 3×3 box mean, divisor 9, clamped coordinates, round-half-up | The spec's reference kernel; the empirical validation (200 seeds, 53.6% reachable) was computed with exactly this kernel — deviating would invalidate the spec's numbers (research §3). |
| D4 | Smoothing placement | Post-process pass after `generateElevationMap` (symmetry enforced), before `extractWater` | FR-010's exact wording; water classification then sees smoothed elevation, so pools coalesce (a documented side benefit); no RNG consumed (research §4). |
| D5 | `terrainSmoothing` plumbing | Additive `GenerationSettings` field, default 4, clamped [0,8], surfaced via `effectiveSettings` | Mirrors the `citiesPerPlayer` normalization pattern; `resolveSettings`/`validateSettings`/`clampSettings` each gain one line; `terrainSmoothing: 0` = identity (research §5). |
| D6 | Pipe token values | Reuse canonical values: `pipeDownhill=#059669` (green), `pipeFlat=#f59e0b` (accent), `pipeUphill=#dc2626` (red), `pipeStalled=#9ca3af` (text-muted) | Zero new hex literals; pairings already measured in `DESIGN.md` §3; additive (minor) per §6; the hollow-vs-filled shape is the primary stalled cue, gray the secondary (research §6). |
| D7 | Slope classification location | Precompute `pipeSlopes` in `buildMapView` (additive `CellRenderInfo` field) | Keeps the canvas painter dumb; classification is unit-testable without canvas; the DOM overlay can reuse it for accessible names; destination lookup is O(1) in the cells map (research §7). |
| D8 | Console mirror + drift pin | `pipe-slope.ts` holds `PIPE_SLOPE_CONSTANTS` + `pipeFlowRate` + `classifyPipeSlope`; drift test pins against `ENGINE_CONSTANTS`/`flowRateForDelta` | Console src cannot runtime-import `@europa/engine` (boundary rule); the mirror is pinned by a test in `tests/` (sanctioned by 005 v1.2) so a future retune fails loudly in the console suite (research §8). |
| D9 | Matchmaking | Zero code change; verification test only | `matchmaker.ts` already spreads `DEFAULT_GENERATION_SETTINGS` into `terrainSettings`; rematch reuses `match.settings.terrainSettings` — the new field flows through by construction (research §9). |
| D10 | No version bumps | No `ENGINE_API_VERSION`/`TERRAIN_API_VERSION`/`CONSOLE_API_VERSION`/wire bump | All changes are additive or internal-to-package; the `EngineConstants` swap is enforced by the existing semantic-diff conformance tests, not a protocol version (research §10). |

---

## Risk & Open Questions

| Item | Mitigation |
|------|------------|
| **R-1 ⚠️ BLOCKER — FR-007 formula vs constants inconsistency**: the formula as literally written (`max(0, flowBase − flowSlopeStep × min(|Δ|, flowSlopeDeltaCap))` with cap=5 < flowBase=7) caps the uphill handicap at 5, so uphill flow is always ≥ 2 and **never stalls** — contradicting US1 AC-5 (stall at Δ ≥ 7), the v1.2 rate listing (uphill 6/5/4/3/2/1, 0 at Δ≥7), spec 003 US4 AC-1 (31.5% of uphill edges stall), spec 005 FR-013 (stalled rendering), and the manual (stall Δ≥7). The spec's own numbers describe an **asymmetric** formula (cap on the downhill bonus only; uncapped uphill handicap). | **Flagged to PM — not silently resolved.** Working assumption: asymmetric cap (matches every number in the specs and the empirical validation). The plan centralizes the formula in `flowRateForDelta` so either resolution is a one-line change; the flow tests are written against the PM-confirmed formula. Alternative (raise cap to ≥7) changes downhill rates to 8..14, contradicting the spec's "downhill 8/9/10/11/12" listing. |
| **R-2 — Empirical numbers depend on the kernel**: spec 003 v1.3's 53.6% reachable / 31.5% stall / variance 393.7 figures were computed with the 3×3 box-mean kernel | Adopt exactly that kernel (D3); the reachable-land suite (US4 AC-1) re-measures at implementation time and asserts the ≥50% floor, so any kernel drift fails loudly. |
| **R-3 — Console src boundary vs drift pin**: console `src/` cannot runtime-import `@europa/engine` | The mirror lives in `src/render/pipe-slope.ts`; the drift test lives in `tests/` (sanctioned by 005 v1.2) and imports the real constants — the boundary rule is about the src graph, not tests. |
| **R-4 — `CellRenderInfo.pipeSlopes` additive field vs conformance**: the console conformance suite requires byte-identical contract mirrors | Both `packages/console/contracts/console-types.ts` and `specs/005-client-console/contracts/console-types.ts` change in the same commit; the diff logic (`diffCellChanges`) does not need the new field (it is derived from pipes + static elevation, already covered by `pipesEqual`). |
| **R-5 — Manual drift (007 FR-012)**: stale manual numbers are bugs | Manual pages land in the same change sets as the behavior; `numbers.md` rows trace to `ENGINE_CONSTANTS`/`DEFAULT_GENERATION_SETTINGS`; `pnpm version:check` + docs-privacy + `check:no-literals` re-run as gates. |
| **R-6 — Terrain determinism across the smoothing range**: a buggy pass could break byte-identity | Unit tests pin determinism (same input × N runs → identical output) and symmetry at k=0,1,2,3,4,5,8; integration suite re-runs the 1k-seed determinism check with the default smoothing; k=0 byte-identity vs pre-smoothing output is pinned by a golden-hash comparison over sampled seeds. |
| **R-7 — Reachable-land suite cost**: 200-map BFS at 32×32 is ~200 × 1024 cells × 4 edges | Trivial (< 1 s); the existing 200-map balance suite already runs in CI; the reachable-land computation is a pure BFS over land cells with flow-viability from `flowRateForDelta`. |
| **R-8 — G-04 no-literals guard**: the console must not introduce hex literals | All four pipe colors flow through `palette.ts` re-exports of `TOKENS`; `check:no-literals` runs in CI and locally; the tokens must land before the console rendering task (task ordering). |

**Unresolved product ambiguities**: **R-1 (flow formula) is the single blocker** — it changes shipped flow rates and must be confirmed by the PM before the flow tests are finalized. All other product decisions (tuning values, smoothing default/range, color scheme, hollow-triangle treatment, fog fallback) are recorded in the spec amendments and taken as given.

---

## Implementation Phase Hand-off

Phase 5 (`tasks.md`) is in this change set. The orchestrator / implementer will receive:

- `plan.md` (this file)
- `research.md` (kernel + formula analysis, alternatives, empirical grounding)
- `data-model.md` (delta over 001/003/005/012)
- `contracts/` (updated canonical engine contracts + informational mirrors)
- `tasks.md` (ordered, dependency-aware, subagent-sized)

When implementation begins, order by dependency (mirrors `tasks.md` waves):

1. **Engine + terrain foundations in parallel** — engine: contract mirrors + constants + `flowRateForDelta` + `resolveFlow` + tests; terrain: settings plumbing + `smoothing.ts` + tests. (Disjoint packages; both block everything downstream.)
2. **Design tokens** — 4 tokens + `DESIGN.md` + spec 012 note (blocks console rendering; G-04 depends on tokens existing).
3. **Console** — `pipe-slope.ts` + `buildMapView` + `canvas.ts` + `palette.ts` + drift/component tests.
4. **Matchmaking verification** — passthrough test (no code change).
5. **Manual** — 4 pages, landing in the same change sets as the behavior (FR-012).
6. **Final gate** — repo-wide typecheck/lint/format/tests + coverage + `version:check` + `check:no-literals`.

Contracts in `contracts/` are **informational mirrors** for the new surfaces (`flow-rate.ts`, `pipe-slope.ts`, `terrain-smoothing.ts`) plus the updated canonical `engine-api.ts`. Drift between the mirrors and the package sources is a bug, caught by the existing semantic-diff conformance tests (engine/terrain/console) and the new slope drift test.