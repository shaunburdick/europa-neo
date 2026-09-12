# Contracts — Multiplayer Networking

This directory contains specification documentation for the multiplayer networking boundary contracts.

## Source of truth

TypeScript contract definitions live in `packages/networking/src/contracts/`. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Contract files (documentation)

| Path | Describes |
| --- | --- |
| `hardening-perf/wire-contract-update.md` | Wire contract hardening and performance notes |

The networking package's contract surface is fully defined in `packages/networking/src/contracts/`:

- `network-types.ts` — core networking types
- `network-api.ts` — networking API surface
- `matchmaking-to-networking.ts` — matchmaking → networking boundary

## How to update

When the networking contract types change:

1. Update `packages/networking/src/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
