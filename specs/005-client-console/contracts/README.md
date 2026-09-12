# Contracts — Client Console

This directory contains specification documentation for the client console boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/console/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Contract files (documentation)

This directory currently contains no standalone `.md` contract documents. The console package's contract surface is fully defined in `packages/console/src/contracts/`:

- `console-types.ts` — core console types
- `console-api.ts` — console API surface
- `console-state.ts` — console state management
- `console-to-networking.ts` — console → networking boundary

## How to update

When the console contract types change:

1. Update `packages/console/src/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
