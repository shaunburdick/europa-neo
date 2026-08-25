/**
 * Matchmaking → Networking consumer-side conformance declaration.
 *
 * This file mirrors feature 004's
 * `specs/004-multiplayer-networking/contracts/matchmaking-to-networking.ts`
 * (declared by networking — the producer side). The networking contract
 * already declares every shape the matchmaker consumes:
 *
 *   - `MatchmakingToNetworking`  → interface for calls MATCHMAKER → NETWORKING
 *   - `NetworkingToMatchmaking`  → interface for callbacks NETWORKING → MATCHMAKER
 *   - `MatchmakingRegisterMatch` / `MatchmakingAttachPlayer` / `MatchmakingDetach`
 *   - `NetworkingSeatClaimed` / `NetworkingSeatDisconnected` /
 *     `NetworkingSeatReconnected` / `NetworkingSeatExpired` /
 *     `NetworkingMatchTerminal`
 *
 * Feature 006 implements the CONSUMER side of this boundary. This file
 * is a one-stop conformance assertion:
 *
 *   1. Re-exports the canonical types from feature 004 (no duplicates).
 *   2. Documents how the matchmaker uses each method/callback.
 *   3. Asserts the matchmaker's runtime call sites match the declared
 *      signatures (verified by `tests/conformance.test.ts` in Phase 6).
 *
 * =============================================================================
 * PROPOSED ADDITIVE CHANGES TO FEATURE 004
 * =============================================================================
 *
 * **None required.** Feature 004's `matchmaking-to-networking.ts` (committed
 * at `cc5f22d`) declares every method the matchmaker needs:
 *
 *   - `server.registerMatch(req: RegisterMatchRequest): void`
 *   - `server.unregisterMatch(matchId: MatchId): void`
 *   - `server.attachPlayer(req: AttachPlayerRequest): void`
 *   - `server.detachPlayer(req: DetachRequest): void`
 *   - `server.enableSpectators(matchId: MatchId): void`
 *   - `server.disableSpectators(matchId: MatchId): void`
 *
 * And the bridge callbacks the matchmaker subscribes to:
 *
 *   - `bridge.onSeatClaimed(event: NetworkingSeatClaimed)`
 *   - `bridge.onSeatDisconnected(event: NetworkingSeatDisconnected)`
 *   - `bridge.onSeatReconnected(event: NetworkingSeatReconnected)`
 *   - `bridge.onSeatExpired(event: NetworkingSeatExpired)`
 *   - `bridge.onMatchTerminal(event: NetworkingMatchTerminal)`
 *
 * These signatures match feature 006's documented usage exactly.
 *
 * **One implicit requirement** (not a contract change, just a usage
 * pattern the implementer must follow): the matchmaker needs to subscribe
 * to `MatchmakerBridge` callbacks BEFORE `server.listen()` is called,
 * and unsubscribes on `close()`. The host is responsible for passing a
 * `MatchmakerBridge` object to `createMatchServer`'s `ServerDeps.matchmaker`
 * whose callbacks are bound to the matchmaker's internal handlers.
 * Networking's `Server` already supports this pattern (per
 * `network-api.ts` ServerDeps).
 *
 * =============================================================================
 * USAGE NOTES (for the implementer)
 * =============================================================================
 *
 * The matchmaker calls networking's `Server` methods at these lifecycle
 * points (see `data-model.md` §4 for the full state machine):
 *
 * | Matchmaker event                     | Networking call                  |
 * |--------------------------------------|----------------------------------|
 * | `filling → running` (seats filled)   | `server.registerMatch({...})`    |
 * | `filling → running` (per seat)       | `server.attachPlayer({...})`     |
 * | `filling → running` (transition)     | `server.enableSpectators(id)`    |
 * | `running` forfeit (per seat)         | `server.detachPlayer({...})`     |
 * | `running` all-disconnected           | `server.unregisterMatch(id)`     |
 * | `finished → collected`               | `server.unregisterMatch(id)`     |
 *
 * The matchmaker subscribes to networking's `MatchmakerBridge` callbacks
 * at these events:
 *
 * | Networking callback                  | Matchmaker action                |
 * |--------------------------------------|----------------------------------|
 * | `onSeatClaimed`                      | Record connection id             |
 * | `onSeatDisconnected`                 | Start (note) grace timer; already running in networking |
 * | `onSeatReconnected`                  | Cancel any matchmaker-side notes |
 * | `onSeatExpired`                      | Forfeit the seat (submit OrderSurrender) |
 * | `onMatchTerminal`                    | Record MatchResultsRecord; transition to 'finished' |
 *
 * The `expiredAtMs` field on `NetworkingSeatExpired` is the wall-clock
 * timestamp from networking (used for `MatchResultsRecord` consistency
 * — see `data-model.md` §10).
 *
 * =============================================================================
 * WHY THIS BOUNDARY, NOT THE OTHER WAY AROUND
 * =============================================================================
 *
 * The boundary is declared by feature 004 (networking declares what
 * matchmaking passes in and consumes). Feature 006 (matchmaking)
 * implements the consumer side. There is NO parallel declaration in
 * feature 006 — we re-use networking's types verbatim.
 *
 * This is consistent with the engine ↔ terrain boundary (engine
 * declares; terrain implements the consumer side via
 * `engine-to-terrain.ts`). All three packages — engine, terrain,
 * networking — declare the boundary; matchmaking is the consumer for
 * all three.
 *
 * =============================================================================
 */

// ----------------------------------------------------------------------------
// Canonical boundary types (re-exported from networking)
// ----------------------------------------------------------------------------

/**
 * The matchmaking-to-networking method set. Re-exported from feature
 * 004's contract. The matchmaker's runtime calls each of these at
 * the lifecycle points documented above.
 */
export type {
  // Producer-side interface (networking owns)
  MatchmakingToNetworking,
  MatchmakingRegisterMatch,
  MatchmakingAttachPlayer,
  MatchmakingDetach,
  // Consumer-side callbacks (matchmaking subscribes)
  NetworkingToMatchmaking,
  NetworkingSeatClaimed,
  NetworkingSeatDisconnected,
  NetworkingSeatReconnected,
  NetworkingSeatExpired,
  NetworkingMatchTerminal,
} from '@europa/networking';

// ----------------------------------------------------------------------------
// Documented constraints (from feature 004's boundary rules)
// ----------------------------------------------------------------------------
//
// The matchmaker MUST obey these rules. Each is from
// `feature-004/contracts/matchmaking-to-networking.ts`. The conformance
// test (`tests/conformance.test.ts`) verifies the matchmaker's source
// follows them.
// ----------------------------------------------------------------------------

/**
 * Rule 1: Networking does NOT validate that a session token has been
 * "activated". Tokens are bound to seats at `attachPlayer` time; any
 * `joinMatch` presenting the token will be granted the seat (until
 * `detachPlayer` revokes it). If matchmaking wants one-shot tokens
 * (use once, then invalidated), it must track issuance counts itself
 * and call `detachPlayer` after the first claim.
 *
 * **Matchmaker behavior**: v1 uses one-shot tokens. After the first
 * `onSeatClaimed` for a given `(matchId, sessionToken)`, the matchmaker
 * stores the binding and ignores subsequent claims for the same token.
 * (Implemented in `matchLifecycle.ts::joinMatch`'s reconnect branch.)
 */

/**
 * Rule 2: Networking does NOT enforce max concurrent matches beyond
 * `ServerConfig.maxConcurrentMatches`. The matchmaker is the source of
 * truth for match creation rate; networking only rejects overflow
 * (throws at `registerMatch`).
 *
 * **Matchmaker behavior**: the matchmaker checks
 * `MATCHMAKING_CONSTANTS.maxConcurrentMatches` BEFORE calling
 * `server.registerMatch`. If the limit is reached, `createMatch` /
 * `joinMatch` returns `internal_error` with detail `{ reason:
 * 'server_full' }` (matches the engine's intent without leaking
 * per-match counts).
 */

/**
 * Rule 3: Networking does NOT persist anything. On server restart,
 * every session is gone. Matchmaking must accept that.
 *
 * **Matchmaker behavior**: the matchmaker's in-memory `Map`s are dropped
 * on `close()`. No persistence layer. Matches are ephemeral per spec
 * Assumptions. See `research.md` §3.
 */

/**
 * Rule 4: Networking does NOT decide forfeits. It only reports the
 * `onSeatExpired` event; matchmaking decides whether to surrender
 * the seat to the engine (via an `OrderSurrender` it stages itself)
 * or to declare the remaining player winner.
 *
 * **Matchmaker behavior**: `forfeit.ts::onSeatExpired` submits an
 * `OrderSurrender` via `engineSession.submit({ kind: 'surrender', ... })`
 * AND calls `server.detachPlayer({ reason: 'forfeit_timeout' })`. See
 * `research.md` §6.
 */

/**
 * Rule 5: Networking does NOT decide match results recording. It
 * reports `onMatchTerminal`; matchmaking records (in-memory) and
 * serves results to clients (the `TerminalPayload` networking sends
 * is the engine's `MatchResult` directly, no enrichment).
 *
 * **Matchmaker behavior**: `matchLifecycle.ts::onMatchTerminal` records
 * the `MatchResultsRecord` on the `MatchRecord` and transitions
 * `'running' → 'finished'`. The console's protocol-level results
 * payload is feature 004's `TerminalPayload` (the engine's
 * `MatchResult`); the matchmaker does NOT enrich it.
 */

/**
 * Rule 6: Networking may have its own internal pending-order queue per
 * match. When matchmaking injects an order (e.g., a server-initiated
 * surrender), it calls the engine's `submit` itself rather than going
 * through networking; or it calls a future `Server.injectOrder` if one
 * is added. v1 does not ship `injectOrder`; matchmaker calls engine
 * directly.
 *
 * **Matchmaker behavior**: `forfeit.ts::onSeatExpired` calls
 * `engineSession.submit(...)` directly (NOT `server.injectOrder`).
 * This is the documented v1 path.
 */

// ----------------------------------------------------------------------------
// What matchmaking does NOT need from networking (out of scope)
// ----------------------------------------------------------------------------
//
// The matchmaker does NOT use:
//   - `server.bindMatchmaker(...)` (this is a wiring call the host makes;
//     the matchmaker simply supplies handlers via the `MatchmakerBridge`
//     object passed to `createMatchServer`).
//   - The wire-level protocol envelopes (those are feature 004's concern;
//     the matchmaker's HTTP-facing API returns plain `Result` shapes).
//   - Rate limiting (out of scope for matchmaking in v1; could be added
//     in v1.1 as `MatchmakerErrorCode = 'rate_limited'`).
//   - Tick scheduling (feature 004's scheduler drives the engine; the
//     matchmaker is event-driven, not clock-driven).
//   - Spectator attachment (the matchmaker calls `enableSpectators` at
//     `'filling → running'`; spectator *attach* is a client-side
//     `joinMatch` flow that feature 004 handles — the matchmaker is
//     not in the spectator path).
//   - Stats (the matchmaker has its own `stats()`; feature 004's
//     `ServerStats` is networking-internal and not consumed by
//     matchmaking).
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Versioning (MATCHMAKING_API_VERSION tracks feature 006's contract; the
// matchmaker does NOT version the boundary — that's networking's job via
// NETWORK_API_VERSION).
// ----------------------------------------------------------------------------

export { MATCHMAKING_API_VERSION } from './match-types';
