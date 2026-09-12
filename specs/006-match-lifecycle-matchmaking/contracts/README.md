# Contracts — Match Lifecycle & Matchmaking

This directory contains specification documentation for the matchmaking boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/matchmaking/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Contract files (documentation)

This directory currently contains no standalone `.md` contract documents. The matchmaking package's contract surface is fully defined in `packages/matchmaking/src/contracts/`:

- `match-types.ts` — core match types
- `matchmaking-api.ts` — matchmaking API surface
- `board-size-defaults.ts` — board size defaults
- `matchmaking-to-networking.ts` — matchmaking → networking boundary

## How to update

When the matchmaking contract types change:

1. Update `packages/matchmaking/src/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
