# Contracts — Core Game Engine

This directory contains specification documentation for the engine's boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/engine/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Serialization boundary (spec 001 FR-024..FR-026, Clarifications v1.16 — issue #136)

`serializeWorld(world): Uint8Array` / `deserializeWorld(bytes): World` / `hashWorld(world): string` are declared in `packages/engine/src/contracts/engine-api.ts`; their signatures are unchanged by v1.16. Their boundary rules:

- **Two version guards**: the fixed-length ASCII header carries `ENGINE_API_VERSION` (single source of truth: `@europa/core` → `0.2.0`); mismatch throws `EngineVersionMismatchError`. The first payload byte carries `SERIALIZE_FORMAT_VERSION` (layout version, bumped **1 → 2** by v1.16 to add per-cell terrain); mismatch throws `EngineFormatVersionMismatchError`. Sources contain no hardcoded version literal (conformance-suite scan).
- **Lossless round-trip (FR-026)**: every `World` field round-trips, including per-cell `elevation` (1 byte, 0–255) and `terrain` (1 byte flag, 0 = land, 1 = water). Decode no longer fabricates an all-land board; a deserialized world is tickable and identical to the source. `hashWorld` covers terrain.
- **Strict decode (FR-025)**: `boardSize` (≥ 8), `playerCount` (2–4), coordinates, ID-table canonical order, owner bytes, pipe masks, reserves, terrain flags, and trailing bytes are all validated; malformed input throws `EngineFormatError`, never a coerced default. Encode throws `EngineSerializationError` on any unrepresentable value.
- Wire layout: `data-model.md` §10 and the `packages/engine/src/serialize.ts` module header.

## Contract files (documentation)

This directory currently contains no standalone `.md` contract documents. The engine's contract surface is fully defined in `packages/engine/src/contracts/`:

- `engine-types.ts` — core game types
- `engine-api.ts` — engine API surface and constants
- `engine-to-matchmaking.ts` — engine → matchmaking boundary
- `engine-to-terrain.ts` — engine → terrain boundary
- `engine-to-fog.ts` — engine → fog boundary
- `engine-to-networking.ts` — engine → networking boundary
- `flow-rate.ts` — flow rate computation
- `pipe-slope.ts` — pipe slope classification
- `terrain-smoothing.ts` — terrain smoothing

## How to update

When the engine's contract types change:

1. Update `packages/engine/src/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
