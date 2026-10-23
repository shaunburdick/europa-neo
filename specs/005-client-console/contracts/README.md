# Contracts — Client Console

This directory contains specification documentation for the client console boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/console/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Contract files (documentation)

This directory contains:

- `reducer-correlation.md` — `ReduceOptions.correlation` and the store-scoped pending-order/`ActionId` state (spec 005 v1.12 FR-045; draft)
- `input-mapping.md` — legacy `InputMapping` adapter, per-runtime `ControlMapping`, and atomic update rules (spec 005 v1.13 FR-048–FR-052)

The console package's contract surface is defined in `packages/console/src/contracts/`:

- `console-types.ts` — core console types
- `console-api.ts` — console API surface
- `console-state.ts` — console state management
- `console-to-networking.ts` — console → networking boundary

## How to update

When the console contract types change:

1. Update `packages/console/src/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
