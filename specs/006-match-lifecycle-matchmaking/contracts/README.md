# Contracts — Match Lifecycle & Matchmaking

This directory contains specification documentation for the matchmaking boundary contracts.

## Source of truth

TypeScript contract definitions live in the package itself. This directory holds the readable documentation describing what those contracts mean, their boundary rules, and versioning policy.

## Contract files (source of truth, verified 2026-10-11)

The matchmaking package's contract surface is fully defined in:

- `packages/matchmaking/contracts/match-types.ts` — core match types, `MatchmakerErrorCode`, request/result shapes, `MATCHMAKING_CONSTANTS`, `BOARD_SIZE_DEFAULTS` (single source; mirrored by `packages/matchmaking/src/constants.ts` and pinned by `tests/unit/board-size-defaults.test.ts` — no standalone `board-size-defaults.ts` file exists anywhere since the issue-#139 hygiene pass #160 deleted the absorbed feature's copy)
- `packages/matchmaking/contracts/matchmaking-api.ts` — `MatchmakerConfig`, `MatchmakerDeps`, `Matchmaker` interface + factory JSDoc
- `packages/networking/src/contracts/matchmaking-to-networking.ts` — matchmaking → networking boundary (declared by feature 004)

Local mirrors for feature-010 lobby types live in `packages/matchmaking/src/contracts/` (`lobby-api.ts`, `lobby-types.ts`) and are pinned mutually assignable to networking's canonical wire copies (spec 010 Clarifications v1.5).

## Amendment status (spec 006 v1.8, issue #147)

No TypeScript type/shape changes are needed for issue #147 — only JSDoc semantic corrections in `packages/matchmaking/contracts/matchmaking-api.ts`:

- `close()` (around lines 241–251): drop the stale "cancels the empty-match sweep timer" clause (sweeps are lazy; no timer exists), state that `unregisterMatch` fires for every match record still in the store, best effort (spec 006 FR-021), and codify `stats()` staying readable after close.
- `joinMatch()` (around lines 142–165): document the reconnect success arm — an existing seat assignment is returned, no session/seat/token minted; forfeited or terminal matches yield `session_expired` (spec 006 FR-019).
- Collection-time `unregisterMatch` (spec 006 FR-024, F-MM-014): no contract change — it drives the already-declared `Server.unregisterMatch` (`@europa/networking`) from the matchmaker's collection sites; only the `src/matchmaker.ts` JSDoc for the new `collectMatch` helper and data-model §4 describe it.
- Session release at terminal collection (spec 006 FR-025, F-MM-015): no contract change — an internal store-level helper (`matchLifecycle.releaseMatchSessions`); `MatchmakerStore`'s existing `deleteSession` surface (`src/store.ts:42`) is unchanged, and `MatchmakerStats.activePlayerSessions` keeps its current definition.

The lobby factory gains one ADDITIVE optional dependency (`LobbyServiceDeps.schedule`, spec 010 Clarifications v1.13; interface at `packages/matchmaking/src/internal/lobbyService.ts:299-324`, default binding near `:339` — same precedent as `LobbyServiceDeps.now?` at `:311`); wire payloads and error-code unions are unchanged.

**Three** stale timer clauses exist in `packages/matchmaking/contracts/matchmaking-api.ts` (grep-verified 2026-10-11 — every `timer` mention in the file), all amended in the same change set per PM ruling 7 (extended 2026-10-11):

- `:122` — the `Matchmaker` interface lifecycle note: "`matchmaker.close()` → graceful shutdown (cancels timers, drops state)" → drop the timer claim, state per-record best-effort `unregisterMatch`.
- `:244` — the `close()` JSDoc: "Cancels the empty-match sweep timer" → deleted (no timers exist); best-effort unregister + `stats()`-after-close codified (FR-021).
- `:259-261` — the factory JSDoc: "timers start lazily on the first `createMatch` or `joinMatch`" → deleted.

## How to update

When the matchmaking contract types change:

1. Update `packages/matchmaking/contracts/` (the implementation)
2. Update this documentation to reflect the change
3. Run `pnpm verify` to confirm no breakage
