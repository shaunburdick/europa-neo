# Contracts — Core Game Engine

This directory contains specification documentation for the engine's boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/engine/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

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
