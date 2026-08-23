# @europa/matchmaking

Match lifecycle & matchmaking for Europa Neo — feature 006.

Ephemeral player sessions, public/private match creation with atomic seat
assignment, a synchronous public-lobby projection, auto-start into the
deterministic engine when the last seat fills, rematch coordination, and
the disconnect-forfeit policy.

## Status

Phase 2 (Foundational) — constants, error shapes, ID/session-token
generators, in-memory store, server-internal record shapes, and the
public type surface. The `createMatchmaker` runtime lands in Phase 3
(US1 Quick Match).

## Usage (after Phase 3)

```ts
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';

const matchmaker = createMatchmaker(
  { ...MATCHMAKING_CONSTANTS, publicBaseUrl: 'https://europa.example.com' },
  { server },
);
```

## Contracts

The stable public interface lives in [`contracts/`](./contracts/) —
byte-identical mirrors of
`.specify/features/006-match-lifecycle-matchmaking/contracts/`. Drift is
caught by `tests/conformance.test.ts` (Phase 8).

## Commands

| Command            | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `pnpm build`       | tsup ESM bundle + `.d.ts`                |
| `pnpm test`        | full Vitest suite                        |
| `pnpm test:unit`   | unit tests only                          |
| `pnpm test:coverage` | coverage (≥80% every metric — merge gate) |
| `pnpm lint`        | Biome check                              |
| `pnpm typecheck`   | `tsc --noEmit`                           |
