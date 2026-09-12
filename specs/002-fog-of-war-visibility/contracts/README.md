# Contracts — Fog of War & Visibility

This directory contains specification documentation for the fog-of-war boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/fog/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Contract files (documentation)

This directory currently contains no standalone `.md` contract documents. The fog package's contract surface is fully defined in `packages/fog/src/contracts/`:

- `fog-types.ts` — core fog types
- `fog-api.ts` — fog API surface
- `engine-to-fog.ts` — engine → fog boundary
- `fog-to-networking.ts` — fog → networking boundary

## How to update

When the fog contract types change:

1. Update `packages/fog/src/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
