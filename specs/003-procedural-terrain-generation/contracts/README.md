# Contracts — Procedural Terrain Generation

This directory contains specification documentation for the terrain generation boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/terrain/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Contract files (documentation)

This directory currently contains no standalone `.md` contract documents. The terrain package's contract surface is fully defined in `packages/terrain/src/contracts/`:

- `terrain-types.ts` — core terrain types
- `terrain-api.ts` — terrain API surface
- `terrain-to-engine.ts` — terrain → engine boundary

## How to update

When the terrain contract types change:

1. Update `packages/terrain/src/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
