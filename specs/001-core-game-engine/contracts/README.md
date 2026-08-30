# Contracts — issue #30 (Elevation-Gradient Pipe Flow + Terrain Smoothing + Slope Color-Coding)

This directory holds the engine's canonical contract mirrors plus informational mirrors for the new surfaces this change set introduces.

## Canonical engine contracts (updated during implementation)

| File | Status | Notes |
| --- | --- | --- |
| `engine-api.ts` | **UPDATED in the implementation change set** | `EngineConstants` drops `flowDownhillFactor`/`flowUphillFactor`, gains `flowSlopeStep`/`flowSlopeDeltaCap` (spec 001 FR-007, Clarifications v1.1/v1.2). The local copy at `packages/engine/src/contracts/engine-api.ts` changes in the same commit; the engine's `contracts-drift.test.ts` (semantic diff) fails until both are in sync. |
| `engine-types.ts` | unchanged | No type surface change. |

## Informational mirrors (new — this change set)

These document additive internal shapes that the implementation will ship. They are **informational**: they mirror the package sources and must stay semantically identical to them (drift is a bug, caught by the existing semantic-diff conformance tests and the new slope drift test).

| File | Mirrors | Drift pin |
| --- | --- | --- |
| `flow-rate.ts` | `flowRateForDelta(delta, constants)` exported from `@europa/engine` | Engine unit tests + terrain reachable-land suite + console slope drift test all consume the real function |
| `pipe-slope.ts` | Console `src/render/pipe-slope.ts` (`PIPE_SLOPE_CONSTANTS`, `pipeFlowRate`, `classifyPipeSlope`, `PipeSlope`) | Console `tests/unit/render/slope-drift.test.ts` pins the mirror against `ENGINE_CONSTANTS`/`flowRateForDelta` |
| `terrain-smoothing.ts` | `smoothElevation(elev, size, passes)` from `@europa/terrain` + `GenerationSettings.terrainSmoothing` | Terrain unit + integration suites (determinism, symmetry, k=0 byte-identity) |

## Version discipline

No `ENGINE_API_VERSION` / `TERRAIN_API_VERSION` / `CONSOLE_API_VERSION` / wire-version bump. The `EngineConstants` field swap is internal to the engine's own constants type (no downstream package constructs `EngineConstants`); `GenerationSettings.terrainSmoothing` and `CellRenderInfo.pipeSlopes` are additive fields. All changes are enforced by the existing conformance machinery, not by protocol versions.