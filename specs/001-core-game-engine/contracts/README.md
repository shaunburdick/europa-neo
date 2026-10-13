# Contracts — Core Game Engine

This directory contains specification documentation for the engine's boundary contracts.

## Source of Truth

The owning package's `.ts` file is the sole machine contract per seam (single-sourcing ruling,
spec 001 v1.17 FR-027). This directory holds only documentation — no `.ts` file lives here and
none may be recreated (the referenced-contract-file guard, spec 008 v1.4 FR-033, fails on any
unreferenced `.ts` re-introduced under `specs/*/contracts/**`).

## Serialization boundary (spec 001 FR-024..FR-026, Clarifications v1.16 — issue #136)

`serializeWorld(world): Uint8Array` / `deserializeWorld(bytes): World` / `hashWorld(world): string` are declared in `packages/engine/src/contracts/engine-api.ts`; their signatures are unchanged by v1.16. Their boundary rules:

- **Two version guards**: the fixed-length ASCII header carries `ENGINE_API_VERSION` (single source of truth: `@europa/core` → `0.2.0`); mismatch throws `EngineVersionMismatchError`. The first payload byte carries `SERIALIZE_FORMAT_VERSION` (layout version, bumped **1 → 2** by v1.16 to add per-cell terrain); mismatch throws `EngineFormatVersionMismatchError`. Sources contain no hardcoded version literal (conformance-suite scan).
- **Lossless round-trip (FR-026)**: every `World` field round-trips, including per-cell `elevation` (1 byte, 0–255) and `terrain` (1 byte flag, 0 = land, 1 = water). Decode no longer fabricates an all-land board; a deserialized world is tickable and identical to the source. `hashWorld` covers terrain.
- **Strict decode (FR-025)**: `boardSize` (≥ 8), `playerCount` (2–4), coordinates, ID-table canonical order, owner bytes, pipe masks, reserves, terrain flags, and trailing bytes are all validated; malformed input throws `EngineFormatError`, never a coerced default. Encode throws `EngineSerializationError` on any unrepresentable value.
- Wire layout: `data-model.md` §10 and the `packages/engine/src/serialize.ts` module header.

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
