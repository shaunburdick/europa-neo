# Orchestration Log: Issue #74 — Branded String PlayerId

## Status
- **Current Wave**: Wave 3 (Serialization)
- **Branch**: `issue-74-player-id`
- **Last Updated**: 2026-09-09

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

### Wave 9 — Integration + PR — 🔄 In Progress

## Decisions & Rationale
- 2026-09-09: NanoID 12-char over UUID — compact, URL-safe, collision-resistant for match-scale
- 2026-09-09: Internal-index pattern — Uint8Array performance preserved, string IDs at API boundary only
- 2026-09-09: No backward compatibility — pre-1.0, clean break
- 2026-09-09: Player ID table prepended to binary format — enables deterministic registry reconstruction on deserialize
- 2026-09-09: applyCommand/replayMatch catch errors from unknown players — orders recorded even if rejected

## Blockers & Escalations
- None yet

## New Tasks Discovered
- None yet
