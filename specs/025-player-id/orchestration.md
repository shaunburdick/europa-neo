# Orchestration Log: Issue #74 — Branded String PlayerId

## Status
- **Current Wave**: Complete — PR Ready
- **Branch**: `issue-74-player-id`
- **Last Updated**: 2026-09-10

## Plan Summary

Replace `PlayerId = 1 | 2 | 3 | 4` with branded string type via NanoID 12-char. Internal-index / external-ID dual representation: `WorldState` stays `Uint8Array` (performance), `PlayerRegistry` maps string ↔ index. No backward compatibility required (pre-1.0).

## Task Wave Progress

### Wave 1 — Core Types — ✅ Complete (9b58dfe)
- T-001: Change PlayerId type to branded string — ✅
- T-002: Add generatePlayerId() (NanoID 12-char) — ✅
- T-003: Bump ENGINE_API_VERSION 0.1.0 → 0.2.0 — ✅
- T-004: Update @europa/core tests (28/28 pass) — ✅

### Wave 2 — Engine Internals — ✅ Complete (46 files, 298 pass / 56 fail expected)
- T-005: PlayerRegistry — ✅
- T-006: MatchConfig.playerIds — ✅
- T-007: Player.id string — ✅
- T-008: World.playerRegistry — ✅
- T-009: createWorld — ✅
- T-010: getCell — ✅
- T-011: getPlayer — ✅
- T-012: alivePlayers — ✅
- T-013: localeCompare sort — ✅
- T-014: isTerminal winner — ✅
- T-015: Resolution modules — ✅
- T-016: resolveTerminal — ✅

### Wave 3 — Serialization — ✅ Complete (357 pass / 0 fail)
- T-017: encodePayload — player ID table format — ✅
- T-018: decodePayload — read ID table, reconstruct PlayerRegistry — ✅
- T-019: importVersion returns '0.2.0' — ✅
- T-020: Golden fixture N/A (no pre-existing fixture) — ✅

### Wave 4 — Engine Tests — ✅ Complete (56 failing tests fixed as part of Wave 3)
- T-021: Update engine unit tests (combat, terminal, tick, serialize, validate, replay, cli, quickstart) — ✅

### Wave 5 — Fog (parallel with Wave 6) — ✅ Complete (84/84 pass)
- T-025: computePlayerView signature — ✅
- T-026: computeVisibleSet registry — ✅
- T-027: Fog tests — ✅

### Wave 6 — Matchmaking (parallel with Wave 5) — ✅ Complete (no new failures)
- T-028: newPlayerId() — ✅
- T-029: Remove toPlayerId() — ✅
- T-030: transitionFillingToRunning — ✅
- T-031: autoStart — ✅
- T-032: seatAssignmentFor — ✅
- T-033: Contracts — ✅
- T-034: Matchmaking tests — ✅

### Wave 7 — Networking — ✅ Complete (250/250 pass)
- T-035: NETWORK_API_VERSION 0.2.0 — ✅
- T-036: MatchChannel.seats string keys — ✅
- T-037: drainOrdersForTick localeCompare — ✅
- T-038: connections() string sort — ✅
- T-039: handleJoinMatch — ✅
- T-040: restoreReconnectedSeat — ✅
- T-041: seatBuffer string keys — ✅
- T-042: reconnect.ts — ✅
- T-043: ids.ts generatePlayerId — ✅
- T-044: Networking tests — ✅

### Wave 8 — Console — ✅ Complete (68/68 pass, pre-existing failures noted)
- T-045: ws-match-client.ts — ✅
- T-046: reducer/store — ✅
- T-047: computePlayerView calls — ✅
- T-048: Console tests — ✅

### Wave 9 — Terrain Adaptation — ✅ Complete
- Adapted terrain package for numeric CityPlacement.owner (not string PlayerId)
- startingCitiesByPlayer from Record<PlayerId,...> to ReadonlyArray<ReadonlyArray<Coord>>
- TERRAIN_API_VERSION bumped to 0.2.0

### Wave 10 — Matchmaking Fixes — ✅ Complete (62aad3c)
- Added getRegisteredPlayerIds to matchmaking test mocks (was causing 88 failures)
- Updated conformance version assertions (0.1.0 → 0.2.0)
- Fixed PlayerRegistry sort-order gotcha in test assertions
- Updated MatchConfig.playerCount → playerIds in tests

### Wave 11 — Post-Wave Test Fixes — ✅ Complete (62aad3c)
- PlayerRegistry indexMap built from sortedIds (critical fog visibility fix)
- Console version strings updated across all test fixtures
- playerColors changed from plain objects to ReadonlyMap in test fixtures
- component test fixtures updated for new types
- Networking spec contract synced

### Wave 12 — Final Verification — ✅ Complete
All non-E2E tests pass across all packages:
- Core: 28/28
- Engine: 357/357
- Terrain: 313/313 (+ 50 skipped)
- Fog: 84/84
- Networking: 250/250
- Matchmaking: 363/363
- Console unit: 840/840
- Console component: 237/237
- Console a11y: 69/69
- Console lobby-integration: 9/9
- Typecheck: clean
- Lint: clean (pre-existing warnings only)
- Format: clean
- Version: clean

E2E: 43/45 pass (2 pre-existing N=3/N=4 failures — timing race in multi-player terminal delivery)

## Decisions & Rationale
- 2026-09-09: NanoID 12-char over UUID — compact, URL-safe, collision-resistant for match-scale
- 2026-09-09: Internal-index pattern — Uint8Array performance preserved, string IDs at API boundary only
- 2026-09-09: No backward compatibility — pre-1.0, clean break
- 2026-09-09: Player ID table prepended to binary format — enables deterministic registry reconstruction on deserialize
- 2026-09-09: applyCommand/replayMatch catch errors from unknown players — orders recorded even if rejected
- 2026-09-10: PlayerRegistry indexMap built from sortedIds — consistent with idAtIndex() sorted order
- 2026-09-10: CityPlacement.owner stays numeric (terrain uses indices, not string IDs)
- 2026-09-10: getRegisteredPlayerIds on Server interface — matchmaking needs to read pre-registered IDs for consistent seat bindings

## Blockers & Escalations
- 2 E2E failures (N=3, N=4 full-stack): pre-existing timing race where survivor console enters "reconnecting" instead of "game_over" after all other players leave via matchmaker.leaveMatch. Not caused by PlayerId changes. Tests verify correctly — issue is in the terminal event delivery path when multiple leaveMatch calls fire synchronously.

## New Tasks Discovered
- None
