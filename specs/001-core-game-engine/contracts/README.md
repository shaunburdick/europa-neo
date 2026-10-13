# Contracts — Core Game Engine

This directory contains specification documentation for the engine's boundary contracts.

## Source of Truth

The owning package's `.ts` file is the sole machine contract per seam (single-sourcing ruling,
spec 001 v1.16 FR-024). This directory holds only documentation — no `.ts` file lives here and
none may be recreated (the referenced-contract-file guard, spec 008 v1.4 FR-033, fails on any
unreferenced `.ts` re-introduced under `specs/*/contracts/**`).

## Contract files (shipped layout, verified 2026-10-13)

- `packages/engine/src/contracts/engine-types.ts` — core game types
- `packages/engine/src/contracts/engine-api.ts` — engine API surface
- `packages/core/src/flow-rate.ts` — the flow/constant seam: `FlowConstants`,
  `DEFAULT_FLOW_CONSTANTS`, `EngineConstants`, `ENGINE_CONSTANTS`, `flowRateForDelta`
  (`@europa/engine` re-exports the constants since issue #96; `@europa/core/tests/unit/flow-rate.test.ts`
  pins the shipped symbol values)
- `packages/fog/src/contracts/engine-to-fog.ts` — engine → fog boundary (owned by fog)

The other five files this README listed before 2026-10-13 do not exist anywhere and MUST NOT be
recreated. Cross-package boundaries are pinned by compiled witnesses (spec 008 v1.4
FR-029…FR-032), not by mirror copies.

## How to update

When the engine's contract types change:

1. Update the owning package's `.ts` file (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
