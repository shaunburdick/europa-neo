# Data Model: Elevation-Gradient Pipe Flow + Terrain Smoothing + Slope Color-Coding (issue #30)

**Branch**: `issue-30-pipe-flow-rate` | **Date**: 2026-08-30 | **Specs**: 001 v1.2 · 003 v1.3 · 005 v1.2 · 006 ImplNotes · 007 v1.3 · 012 companion

> **Delta document** — mirrors the `012-3-4-player-support/data-model.md` convention: only the entities this change set adds or alters are specified here. Unchanged entities (Board, Cell, City, TroopStack, PipeSet, Order, Player, GameState, TickResult, MapSeed, GeneratedMap, ValidationReport, ConsoleState, InputMapping, RenderLayer, QoLSettings, Match, Seat, LobbyEntry, RematchOffer) keep their existing definitions in the original feature data models.
>
> Field types are TypeScript-flavored. All numeric game/generation values are integers (constitution II); the only floats in the system are the terrain generator's `waterRatio`/`roughness` settings and the console's paint-time HSL interpolation, both unchanged.

---

## 1. `EngineConstants` — changed fields (spec 001 FR-007, Clarifications v1.1/v1.2)

The slope model changes from multiplicative factors to a linear gradient. Two fields are **removed**, two are **added**; `flowBase` is retained with a new value.

| Field | Type | Change | Value | Notes |
| --- | --- | --- | --- | --- |
| `flowDownhillFactor` | `number` (int) | **REMOVED** | — | Multiplicative-factor model is gone (001 v1.1 contract change). |
| `flowUphillFactor` | `number` (int) | **REMOVED** | — | ditto |
| `flowBase` | `number` (int) | **VALUE CHANGE** | `7` (was `1`) | Base troops per tick along a flat pipe. Raised 3→7 in v1.2 (re-validated against smoothed terrain). |
| `flowSlopeStep` | `number` (int) | **ADDED** | `1` | Troops added/subtracted per unit of elevation change. |
| `flowSlopeDeltaCap` | `number` (int) | **ADDED** | `5` | Caps the **downhill bonus** at `flowSlopeStep × 5` (working assumption R-1: the cap bounds the downhill bonus only; the uphill handicap is uncapped). |

**Contract mirrors**: `packages/engine/src/contracts/engine-api.ts` and `specs/001-core-game-engine/contracts/engine-api.ts` change together (semantic-diff conformance test enforces). `ENGINE_API_VERSION` does not bump (internal constants type; no downstream package constructs `EngineConstants`).

**Derived rates** (per-tick, at shipped constants): downhill `8/9/10/11/12` (Δ=1/2/3/4/≥5), flat `7`, uphill `6/5/4/3/2/1` (Δ=1..6), `0` (Δ≥7 — stall). A stalled pipe is legal and persistent (US1 AC-5).

## 2. `flowRateForDelta` — new pure function (spec 001 FR-007)

```ts
flowRateForDelta(delta: number, constants: EngineConstants): number
```

- `delta < 0` (downhill): `flowBase + flowSlopeStep × min(|delta|, flowSlopeDeltaCap)`
- `delta === 0` (flat): `flowBase`
- `delta > 0` (uphill): `max(0, flowBase − flowSlopeStep × |delta|)` — uncapped handicap (working assumption R-1)

**Constraints**: pure; integer arithmetic; deterministic (FR-017). Exported additively from `@europa/engine` (single source for engine tick, terrain reachable-land suite, console drift test). Informational mirror: `specs/001-core-game-engine/contracts/flow-rate.ts`.

## 3. `GenerationSettings.terrainSmoothing` — new field (spec 003 FR-010, Clarifications v1.3)

| Field | Type | Default | Safe range | Clamp | Notes |
| --- | --- | --- | --- | --- | --- |
| `terrainSmoothing` | `number` (int) | `4` | `[0, 8]` | `clampTerrainSmoothing` (integer clamp via `clampInt`) | Number of 3×3 box-mean passes applied to the elevation field. `0` = no smoothing (byte-identical to pre-smoothing output). |

**Plumbing** (each gains one line, mirroring the `citiesPerPlayer` pattern):
- `resolveSettings(partial)` — fallback to `DEFAULT_GENERATION_SETTINGS.terrainSmoothing`.
- `validateSettings(s)` — added to `integerFields` (finite + integer check).
- `clampSettings(s)` — via `clampTerrainSmoothing`; `TERRAIN_SMOOTHING_MIN = 0`, `TERRAIN_SMOOTHING_MAX = 8` in `clamp.ts`.
- `normalizeSettingsForPlayerCount` — passes through via the existing spread (no parity rule applies).
- `effectiveSettings` — surfaced automatically in `TerrainGenerationResult` and `MapStats` (the field is part of `GenerationSettings`).

**Contract mirrors**: `packages/terrain/src/contracts/terrain-types.ts` and `specs/003-procedural-terrain-generation/contracts/terrain-types.ts` change together (semantic-diff conformance test enforces). `TERRAIN_API_VERSION` does not bump (additive field).

## 4. `smoothElevation` — new pure function (spec 003 FR-010)

```ts
smoothElevation(elev: Uint8Array, size: number, passes: number): Uint8Array
```

- **Kernel**: 3×3 box mean, divisor 9, coordinates clamped to `[0, size-1]` (edge cells replicate their edge).
- **Rounding**: round-half-up via `Math.floor((sum + 4) / 9)` — integer-safe, deterministic (IEEE-754 correctly rounded division, identical on every engine).
- **Passes**: `passes` applications; `passes === 0` returns the input unchanged (identity).
- **Invariants**: pure (no RNG, no wall-clock); preserves 180° point symmetry exactly (symmetric kernel + symmetric clamping commute with rotation); output stays in `[0, 255]` (mean of uint8s).
- **Placement**: called in `generateBoard` after `generateElevationMap` (symmetry enforced) and before `extractWater`.
- **Observable effect** (empirical, spec 003 v1.3): at k=4, max |Δ| 153→28, flow-viable reachable land 0.1%→53.6%, elevation variance 1054.6→393.7, water pools 27→6 (largest 1.7%→3.7%).

Informational mirror: `specs/001-core-game-engine/contracts/terrain-smoothing.ts`.

## 5. Design tokens — four new color tokens (spec 012 companion, 005 FR-013)

`packages/design/src/tokens.ts` `color` group gains four **names** reusing canonical values:

| Token name | CSS variable | TS constant | Value | Reuses |
| --- | --- | --- | --- | --- |
| `pipeDownhill` | `--europa-color-pipe-downhill` | `TOKENS.color.pipeDownhill` | `#059669` | `color.green` |
| `pipeFlat` | `--europa-color-pipe-flat` | `TOKENS.color.pipeFlat` | `#f59e0b` | `color.accent` |
| `pipeUphill` | `--europa-color-pipe-uphill` | `TOKENS.color.pipeUphill` | `#dc2626` | `color.red` |
| `pipeStalled` | `--europa-color-pipe-stalled` | `TOKENS.color.pipeStalled` | `#9ca3af` | `color.textMuted` |

**Sync obligations** (FR-018): `DESIGN.md` §1.1 rows (token name, CSS variable, TS constant, canonical value, pairing + measured ratio + WCAG target) and §3 pairing rows; companion Clarifications note in `specs/012-design-system/spec.md`. Additive (minor) per `DESIGN.md` §6 — no migration note needed. The console no-literals guard (G-04) passes because the console consumes the tokens via `palette.ts` re-exports.

## 6. `CellRenderInfo.pipeSlopes` — new additive field (spec 005 FR-013)

| Field | Type | Change | Notes |
| --- | --- | --- | --- |
| `pipeSlopes` | `ReadonlyMap<Direction, PipeSlope>` | **ADDED** | Per-direction slope classification for the cell's active pipes. |

```ts
type PipeSlope = 'downhill' | 'flat' | 'uphill' | 'stalled';
```

**Computation** (`buildMapView`, second pass over cells with pipes): for each direction in `info.pipes`, look up the destination cell in the visible-cells map; absent (outside the visibility horizon) → `'flat'` (fog fallback, no slope claim); else classify via `classifyPipeSlope(srcElev, dstElev, PIPE_SLOPE_CONSTANTS)`.

**Classification** (`src/render/pipe-slope.ts`):
- `dstElev === null` → `'flat'`
- `dstElev < srcElev` → `'downhill'`
- `dstElev === srcElev` → `'flat'`
- `dstElev > srcElev` → `'uphill'`, and if `pipeFlowRate(dstElev − srcElev, constants) === 0` → `'stalled'`

**Rendering** (`canvas.ts` `drawPipes`): filled triangle in the slope color (`pipeDownhill`/`pipeFlat`/`pipeUphill`); `'stalled'` → outline-only (hollow) triangle in `pipeStalled`. Shape (filled vs hollow) is the primary stalled cue; color is never the only carrier (constitution VI).

**Contract mirrors**: `packages/console/contracts/console-types.ts` and `specs/005-client-console/contracts/console-types.ts` change together (byte-identity conformance test enforces). Additive — `diffCellChanges` does not need the field (derived from `pipes` + static elevation).

**Mirror module** (`src/render/pipe-slope.ts`): `PIPE_SLOPE_CONSTANTS` (plain readonly object mirroring `flowBase`/`flowSlopeStep`/`flowSlopeDeltaCap`), `pipeFlowRate(delta, constants)` (formula mirror), `classifyPipeSlope(srcElev, dstElev | null, constants)`. Drift test pins the mirror against `ENGINE_CONSTANTS`/`flowRateForDelta` from `@europa/engine` (tests may runtime-import; `src/` may not — boundary rule).

## 7. Manual numbers (spec 007 FR-010, v1.2/v1.3)

`docs/manual/numbers.md` flow rows become:

| Value | Shipped value | Constant |
| --- | --- | --- |
| Pipe flow, downhill | 8–12 troops/tick (Δ=1..≥5) | `ENGINE_CONSTANTS.flowBase` + `flowSlopeStep` × `min(|Δ|, flowSlopeDeltaCap)` |
| Pipe flow, flat | 7 troops/tick | `ENGINE_CONSTANTS.flowBase` |
| Pipe flow, uphill | 6→1 troops/tick (Δ=1..6) | `max(0, flowBase − flowSlopeStep × |Δ|)` |
| Pipe flow, stalled uphill | 0 (Δ ≥ 7) | stall threshold `flowBase / flowSlopeStep` |

Terrain rows gain:

| Value | Shipped value | Constant |
| --- | --- | --- |
| Terrain smoothing | 4 passes (range 0–8; 0 = no smoothing) | `DEFAULT_GENERATION_SETTINGS.terrainSmoothing` |

Each row traces to `ENGINE_CONSTANTS` / `DEFAULT_GENERATION_SETTINGS` per SC-002.

## 8. Matchmaking (spec 006 Implementation Notes) — no shape change

`MatchSettings.terrainSettings` is unchanged in shape; it carries `terrainSmoothing` automatically because `matchmaker.ts` builds it as `{ ...DEFAULT_GENERATION_SETTINGS, ...partial?.terrainSettings }`. Rematch reuses `match.settings.terrainSettings` (carries over by construction). Hosts may pass `terrainSettings: { terrainSmoothing: N }` at create; the clamped value surfaces via `TerrainGenerationResult.effectiveSettings` / `MapStats.effectiveSettings`.

## 9. State transitions

No new state machines. The engine tick pipeline (production → flow → combat → capture → decay → …) is unchanged in phase order; only the flow phase's rate computation changes. The terrain generation pipeline (elevation → **smoothing** → water → cities → board) gains one deterministic step. The console render pipeline (view → `buildMapView` → canvas) gains a precomputed per-pipe classification. The match lifecycle machine (`filling → running → finished → collected`) is untouched.