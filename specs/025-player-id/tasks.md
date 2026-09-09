# Tasks: Replace Numeric PlayerId with Stable Server-Generated String Identifier

**Feature**: 025-player-id  
**Plan**: `specs/025-player-id/plan.md`  
**Branch**: `issue-74-player-id`

---

## Wave 1: Core Type Change (Foundation — blocks everything)

- [ ] T-001: Change `PlayerId` type in `packages/core/src/types.ts` from `1 | 2 | 3 | 4` to branded string type
- [ ] T-002: Add `generatePlayerId()` function to `@europa/core` (NanoID 12-char inline implementation)
- [ ] T-003: Bump `ENGINE_API_VERSION` from `'0.1.0'` to `'0.2.0'` in `packages/core/src/types.ts`
- [ ] T-004: Update `@europa/core` tests for new PlayerId type and generation

## Wave 2: Engine Internals (depends on Wave 1)

- [ ] T-005: [P] Create `PlayerRegistry` interface and factory in `packages/engine/src/playerRegistry.ts`
- [ ] T-006: Update `MatchConfig` in `packages/core/src/types.ts`: replace `playerCount` with `playerIds: readonly PlayerId[]`
- [ ] T-007: Update `Player` interface in `packages/engine/src/contracts/engine-types.ts` — `id` field is now string PlayerId
- [ ] T-008: Add `playerRegistry: PlayerRegistry` to `World` interface in `packages/engine/src/contracts/engine-types.ts`
- [ ] T-009: Update `createWorld` in `packages/engine/src/create.ts` — accept `playerIds`, build registry, map city owners to indices
- [ ] T-010: Update `getCell` in `packages/engine/src/read.ts` — resolve `troopOwner`/`cityOwner` from index to string via registry
- [ ] T-011: Update `getPlayer` in `packages/engine/src/read.ts` — lookup by string ID via registry
- [ ] T-012: Update `alivePlayers` in `packages/engine/src/read.ts` — return string PlayerIds
- [ ] T-013: Update `sortOrdersDeterministic` in `packages/engine/src/tick.ts` — use `localeCompare` instead of numeric subtraction
- [ ] T-014: Update `isTerminal` in `packages/engine/src/tick.ts` — `MatchResult.winner` is string PlayerId
- [ ] T-015: [P] Update resolution modules that build `Player` objects — `terminal.ts`, `combat.ts` event types
- [ ] T-016: [P] Update `resolveTerminal` in `packages/engine/src/resolution/terminal.ts` — use registry for player lookup

## Wave 3: Serialization (depends on Wave 2)

- [ ] T-017: Update `encodePayload` in `packages/engine/src/serialize.ts` — player ID table format, length-prefixed string IDs
- [ ] T-018: Update `decodePayload` in `packages/engine/src/serialize.ts` — read ID table, reconstruct PlayerRegistry
- [ ] T-019: Update `importVersion` in `packages/engine/src/serialize.ts` — return `'0.2.0'`
- [ ] T-020: Regenerate golden fixture `tests/fixtures/golden-1000-tick.json` with new format

## Wave 4: Engine Tests + Contracts (depends on Wave 2-3)

- [ ] T-021: Update all engine unit tests — replace `as PlayerId` numeric casts with string assertions
- [ ] T-022: Update engine contract drift test (`tests/contracts-drift.test.ts`) — verify byte-identical contract mirrors
- [ ] T-023: Update engine conformance suite — verify type mutual-assignability with core types
- [ ] T-024: Run 10k-tick determinism test with string PlayerIds (SC-001)

## Wave 5: Fog Package (depends on Wave 2)

- [ ] T-025: Update `computePlayerView` in `packages/fog/src/playerView.ts` — accept string PlayerId, resolve via registry
- [ ] T-026: Update `computeVisibleSet` in `packages/fog/src/visibleSet.ts` — use registry for ownership checks
- [ ] T-027: Update fog tests for string PlayerId

## Wave 6: Matchmaking (depends on Wave 1)

- [ ] T-028: Add `newPlayerId()` to `packages/matchmaking/src/idGen.ts`
- [ ] T-029: Remove `toPlayerId()` from `packages/matchmaking/src/matchLifecycle.ts`
- [ ] T-030: Update `transitionFillingToRunning` — assign string PlayerIds from `newPlayerId()`
- [ ] T-031: Update `matchmaker.ts` `autoStart` — generate PlayerIds, pass to `registerMatch`
- [ ] T-032: Update `matchmaker.ts` `seatAssignmentFor` — return string PlayerId
- [ ] T-033: Update `match-types.ts` contracts — `SeatAssignment.playerId` is string, version bump
- [ ] T-034: Update matchmaking tests — replace `toPlayerId()` calls, update assertions

## Wave 7: Networking (depends on Wave 2 + Wave 6)

- [ ] T-035: Bump `NETWORK_API_VERSION` from `'0.1.0'` to `'0.2.0'` in `packages/networking/src/contracts/network-types.ts`
- [ ] T-036: Update `MatchChannel.seats` — `Map<PlayerId, SeatBinding>` with string keys
- [ ] T-037: Update `MatchChannel.drainOrdersForTick` — `localeCompare` sort
- [ ] T-038: Update `MatchChannel.connections()` — string key sort
- [ ] T-039: Update `server.ts` `handleJoinMatch` — seat lookup with string PlayerId
- [ ] T-040: Update `server.ts` `restoreReconnectedSeat` — string PlayerId for seat lookup
- [ ] T-041: Update `server.ts` `seatBuffer` — keyed by string PlayerId
- [ ] T-042: Update `reconnect.ts` — `ReconnectBinding.playerId` is string
- [ ] T-043: Update `ids.ts` — add `generatePlayerId()` export (NanoID 12-char)
- [ ] T-044: Update networking tests — all PlayerId references become strings

## Wave 8: Console (depends on Wave 5 + Wave 7)

- [ ] T-045: Update `ws-match-client.ts` — `WsClientState.playerId` is string
- [ ] T-046: Update console reducer/store — string PlayerId handling
- [ ] T-047: Update `computePlayerView` calls in console — pass string PlayerId
- [ ] T-048: Update console tests — string PlayerId assertions

## Wave 9: Integration + Polish (depends on all waves)

- [ ] T-049: Update `@europa/version` drift check targets if affected
- [ ] T-050: Run `pnpm verify` — all tests, lint, typecheck, format, build
- [ ] T-051: Update spec 001 `quickstart.md` — version bump documentation
- [ ] T-052: Update spec 004 `quickstart.md` — wire protocol version documentation
- [ ] T-053: Update AGENTS.md `Current state` section — record implementation

## Parallel-Safe Markers

- `[P]` tasks can be executed in parallel within their wave.
- Waves 1→2→3→4 are strictly sequential (foundation → internals → serialization → tests).
- Wave 5 (fog) and Wave 6 (matchmaking) are independent of each other but both depend on Waves 1-2.
- Wave 7 (networking) depends on Waves 2 + 6.
- Wave 8 (console) depends on Waves 5 + 7.
- Wave 9 (integration) depends on everything.
