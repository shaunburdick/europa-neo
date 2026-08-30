# Contracts: 3–4 Player End-to-End Support (012)

**Branch**: `issue-6-3+4-player-matches` | **Spec**: `../spec.md` v1.0 | **Plan**: `../plan.md`

## No versioned wire surface added

This feature **does not bump** `NETWORK_API_VERSION`, `MATCHMAKING_API_VERSION`, or `ENGINE_API_VERSION`.

- No `ProtocolEnvelope` / `NetworkPayload` / `TickPayload` / `SnapshotPayload` / `LobbyFrame` shape change.
- No new WebSocket frame kind, no new error code, no new `NetworkPayload` union member.
- No `PublicLobbyEntry` / `MatchRecord` field added to any versioned contract — `capacity`/`seatsFilled`/`boardSize` already exist on the entry; waiting copy is client-derived.
- Existing `NETWORK_API_VERSION` / `MATCHMAKING_API_VERSION` semantics (backwards compatibility within a minor when pre-1.0 per 004 Clarifications) are re-verified by the conformance suites, which remain byte-identity mirrors.

**Guarantee**: old clients (v1 2p-only console) remain connectable against a server with 012 — they can join a 3/4-player match created through the new lobby/host surfaces; they simply lack the new capacity chrome/wording, which is presentation-only. New clients remain connectable against old lobby payloads (the entry already carried `capacity` — 2p entries continue to read `1/2`).

---

## Additive internal contracts (informational, not versioned wire)

The three files below are **internal additive shapes** mirrored here for review — they live in their packages, not on the wire. Each is small enough to be a single-file implementation with a unit pin; they are not separate versioned contracts and need no bump.

### 1. `board-size-defaults.ts` — source map in `@europa/matchmaking`

See [`board-size-defaults.ts`](./board-size-defaults.ts). Frozen `BOARD_SIZE_DEFAULTS: Record<2|3|4, 32|48|64>` = `{2:32,3:48,4:48}`. Consumers import from `@europa/matchmaking`; this mirror documents the table for reviewers without chasing `constants.ts`.

### 2. `host-config.ts` — extended `NPlayerHostConfig`

See [`host-config.ts`](./host-config.ts). `NPlayerHostConfig extends HostConfig` with `playerCount:2|3|4` + `boardSize:32|48|64`. Parsing rules: `--players`/`--player-count`/`HOST_PLAYER_COUNT` → `playerCount`; `--board-size`/`--boardSize`/`HOST_BOARD_SIZE` → `boardSize`; absent `boardSize` implies `BOARD_SIZE_DEFAULTS[playerCount]`; validated before bind; `HOST_STATIC_PORT`/`--static-port` remain hard failures (FR-012).

### 3. `waiting-copy.ts` — N-aware waiting copy

See [`waiting-copy.ts`](./waiting-copy.ts). Pure `formatWaitingMessage(seatsFilled,capacity): string` with singular/plural rule: `k/N` → `Waiting for N-k more players… (k/N)`, singular when `N-k===1`. Predicate `isAwaitingMatchStart` is unchanged; this file only owns the copy.

---

## Conformance expectations

| Check | What pins it |
|-------|--------------|
| `BOARD_SIZE_DEFAULTS` byte-identical across packages | `packages/matchmaking/tests/unit/board-size-defaults.test.ts` + `packages/console/tests/unit/board-size-defaults.test.ts` mirror |
| Wire envelopes unchanged | `packages/networking/tests/conformance.test.ts` (byte-identity mirrors) + `packages/matchmaking/tests/conformance.test.ts` |
| `NPlayerHostConfig` parsing matrix | `packages/console/scripts/host-config.test.ts` exhaustive `--players`×`--board-size`×env×invalid |
| Waiting copy table | `packages/console/src/state/awaiting-start.test.ts` table over all `(k,N)` |
| No second listener | `check-no-second-listener` grep (or explicit `--static-port` unit) + host smoke `port:0` |

## OpenAPI / GraphQL

None — the lobby uses the existing versioned WebSocket lobby protocol (010). This feature adds no HTTP endpoint and no new lobby frame kind.
