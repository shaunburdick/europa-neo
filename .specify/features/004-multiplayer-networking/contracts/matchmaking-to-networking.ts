/**
 * Matchmaking → Networking contract — Feature 006 ↔ Feature 004.
 *
 * Matchmaking owns the match lifecycle (lobby, seating, terminal,
 * rematch). Networking owns the transport (WebSocket, sessions, fog
 * filter, tick loop).
 *
 * This file declares the BOUNDARY surface — what matchmaking passes to
 * networking at each lifecycle transition and what networking reports
 * back. The implementations live in each feature's own package:
 *
 *   - matchmaking calls the `Server` methods declared in
 *     `network-api.ts` (`createMatchServer`, `registerMatch`,
 *     `attachPlayer`, etc.) and consumes the `MatchmakerBridge`
 *     callbacks for events.
 *   - networking implements those `Server` methods.
 *
 * Boundary rule (mirrors feature 001's engine-to-networking boundary
 * rule):
 *
 *   - **Matchmaking** is the source of truth for:
 *     - Lobby state (public/private match listing)
 *     - Seat → player id bindings (durable across disconnects)
 *     - Display names
 *     - Forfeit decisions (when the grace window lapses)
 *     - Match results records (persisted within the process lifetime)
 *
 *   - **Networking** is the source of truth for:
 *     - WebSocket handles and connection lifecycle
 *     - Session tokens (issued at join, validated on reconnect)
 *     - Sequence numbers (per-connection monotonic)
 *     - Per-tick fog filtering + delta encoding
 *     - Rate limiting
 *     - Heartbeats
 *
 *   - The two communicate via the `Server` API (matchmaking →
 *     networking) and `MatchmakerBridge` callbacks (networking →
 *     matchmaking), both declared in `network-api.ts`.
 *
 * ----------------------------------------------------------------------------
 * Lifecycle at the boundary
 * ----------------------------------------------------------------------------
 *
 *      matchmaking (feature 006)
 *      ┌────────────────────────────────────────────────┐
 *      │  1. Lobby fills → all seats claimed             │
 *      │  2. createMatchSession(req)  ← engine 001       │
 *      │  3. server.registerMatch({                     │
 *      │        matchId,                                 │
 *      │        engineSession,                           │
 *      │        matchConfig,                             │
 *      │     })                                          │
 *      │  4. for each seated player:                     │
 *      │     server.attachPlayer({                       │
 *      │        matchId,                                 │
 *      │        playerId,                                │
 *      │        sessionToken,  ← issued by matchmaking   │
 *      │     })                                          │
 *      │  5. server.enableSpectators(matchId)  // US3    │
 *      │  6. (await bridge callbacks)                    │
 *      └────────────────────────────────────────────────┘
 *                       │
 *                       ▼
 *      networking (feature 004)
 *      ┌────────────────────────────────────────────────┐
 *      │  - clients joinMatch with their token           │
 *      │  - clients send orders; server applies + acks   │
 *      │  - server ticks, computes fog views, broadcasts │
 *      │  - if a client disconnects:                    │
 *      │      bridge.onSeatDisconnected({...})           │
 *      │  - if grace expires:                            │
 *      │      bridge.onSeatExpired({...})                │
 *      │      matchmaking decides: surrender / forfeit   │
 *      │  - if engine reports terminal:                 │
 *      │      bridge.onMatchTerminal({...})              │
 *      │      matchmaking records results, may rematch   │
 *      └────────────────────────────────────────────────┘
 *
 * ----------------------------------------------------------------------------
 * Why this boundary, not the other way around
 * ----------------------------------------------------------------------------
 *
 * Networking does NOT call into matchmaking to ask "is this token
 * valid?". The token is opaque to networking; it stores it at
 * `attachPlayer` time and validates it on subsequent `joinMatch`s
 * from the same connection. If a token needs revoking (e.g., a player
 * is kicked, a match is force-destroyed), matchmaking calls
 * `detachPlayer` or `unregisterMatch`, and networking closes any
 * active connection for the token.
 *
 * The token itself is a v4 UUID issued by matchmaking. Networking
 * only stores it; it doesn't parse it. This keeps the boundary clean
 * and lets either side evolve its internal record-keeping without
 * coordinating on shape.
 */

import type { MatchId, SessionToken } from './network-types';

// ----------------------------------------------------------------------------
// Lifecycle events from matchmaking to networking
// ----------------------------------------------------------------------------

/**
 * The complete set of matchmaking-originated events. Each maps to a
 * method on the `Server` interface in `network-api.ts`.
 *
 * (This interface is documentation; the actual events flow through
 * the `Server` method calls, not via an event bus.)
 */
export interface MatchmakingToNetworking {
  /**
   * Hand a fully-constructed match to networking. After this call,
   * clients can join the match.
   *
   * @see network-api.ts: `Server.registerMatch`
   */
  registerMatch(req: MatchmakingRegisterMatch): void;

  /**
   * Bind a session token to a player seat. The token was issued by
   * matchmaking (it is the opaque value the client presents via
   * `joinMatch.reconnectToken` or the absence thereof for new joins).
   *
   * @see network-api.ts: `Server.attachPlayer`
   */
  attachPlayer(req: MatchmakingAttachPlayer): void;

  /**
   * Remove a player seat binding (surrender, elimination, or
   * matchmaking-driven forfeit). Networking closes any active
   * connection for the token. The match is NOT removed; remaining
   * players continue.
   *
   * @see network-api.ts: `Server.detachPlayer`
   */
  detachPlayer(req: MatchmakingDetach): void;

  /**
   * Allow spectator connections (spec US3). Per the matchmaking
   * spec, spectators are visible to the matchmaker only in the
   * sense that they consume a connection; they don't take seats.
   *
   * @see network-api.ts: `Server.enableSpectators`
   */
  enableSpectators(matchId: MatchId): void;
  disableSpectators(matchId: MatchId): void;

  /**
   * Tear the match down entirely. Networking closes all
   * connections, releases the engine session, cancels grace
   * timers. Called when:
   *   - all players disconnected past grace (matchmaking US5 AC-2)
   *   - results delivery finished + rematch window expired
   *   - server is shutting down
   *
   * @see network-api.ts: `Server.unregisterMatch`
   */
  unregisterMatch(matchId: MatchId): void;
}

// ----------------------------------------------------------------------------
// Event payload shapes
// ----------------------------------------------------------------------------

/**
 * Payload of `MatchmakingToNetworking.registerMatch`. Carries the
 * `EngineSession` (already constructed via `createMatchSession`) and
 * the match config (so networking can version-check tick rate etc.).
 */
export interface MatchmakingRegisterMatch {
  readonly matchId: MatchId;
  readonly engineSession: import('./network-api').EngineSession;
  readonly matchConfig: import('@europa/engine').MatchConfig;
  /**
   * Per-player display names (index = PlayerId - 1). Length MUST
   * equal `matchConfig.playerCount`. Networking forwards these in
   * `JoinAckPayload.players` so the console can render the lobby strip.
   */
  readonly displayNames: ReadonlyArray<string>;
}

/**
 * Payload of `MatchmakingToNetworking.attachPlayer`. The session
 * token is matchmaking-issued (v4 UUID); networking stores it
 * verbatim. Idempotent on `(matchId, playerId, sessionToken)`
 * triple; rebinding with a different token invalidates the old.
 */
export interface MatchmakingAttachPlayer {
  readonly matchId: MatchId;
  readonly playerId: import('@europa/engine').PlayerId;
  readonly sessionToken: SessionToken;
  /** Cosmetic display name for the seat (overrides the engine's default). */
  readonly displayName: string;
}

/**
 * Payload of `MatchmakingToNetworking.detachPlayer`.
 *
 * If `playerId` is provided, networking removes that seat and closes
 * any active connection for the token. If omitted, networking
 * searches by token and removes the first match. (Both forms exist
 * because matchmaking sometimes holds only the token — e.g., when
 * the player surrendered without ever having a stable PlayerId.)
 */
export interface MatchmakingDetach {
  readonly matchId: MatchId;
  readonly sessionToken: SessionToken;
  readonly playerId?: import('@europa/engine').PlayerId;
  /**
   * Reason for detachment. Surfaced to the closed connection's
   * final `ErrorPayload` (if the connection is still open) and to
   * logs.
   */
  readonly reason:
    | 'surrender'
    | 'elimination'
    | 'forfeit_timeout'
    | 'kicked_by_matchmaker'
    | 'match_terminating';
}

// ----------------------------------------------------------------------------
// Lifecycle events from networking to matchmaking (mirror of MatchmakerBridge)
// ----------------------------------------------------------------------------

/**
 * Mirror of `MatchmakerBridge` from `network-api.ts`. Declared here
 * so matchmaking's planner can see the complete shape of events
 * networking will report without reaching across the boundary.
 *
 * Networking implements these callbacks; matchmaking subscribes via
 * the `ServerDeps.matchmaker` field passed to `createMatchServer`.
 */
export interface NetworkingToMatchmaking {
  /**
   * A client successfully claimed a seat (new or reconnect).
   * Matchmaker persists the `connectionId → sessionToken → playerId`
   * triple for the duration of the connection.
   */
  onSeatClaimed?(event: NetworkingSeatClaimed): void;

  /**
   * WebSocket disconnected. Matchmaker may start (or note the
   * already-running) grace timer. Server will independently fire
   * `onSeatExpired` after `ServerConfig.reconnectGraceMs`.
   */
  onSeatDisconnected?(event: NetworkingSeatDisconnected): void;

  /** Reconnect within the grace window; cancel any forfeit timer. */
  onSeatReconnected?(event: NetworkingSeatReconnected): void;

  /**
   * Grace window expired without reconnect. Matchmaker applies its
   * forfeit policy (matchmaking spec US5 AC-1): surrender the
   * player's seat; if one player remains they win; if none remain
   * the match is destroyed (via `unregisterMatch`).
   */
  onSeatExpired?(event: NetworkingSeatExpired): void;

  /**
   * Engine reported terminal on a tick. Matchmaker records results
   * (feature 006 US4 AC-1), prepares delivery to all participants,
   * may offer rematch window.
   */
  onMatchTerminal?(event: NetworkingMatchTerminal): void;
}

/**
 * Payload of `NetworkingToMatchmaking.onSeatClaimed`.
 */
export interface NetworkingSeatClaimed {
  readonly matchId: MatchId;
  readonly connectionId: import('./network-types').ConnectionId;
  readonly sessionToken: SessionToken;
  readonly playerId: import('@europa/engine').PlayerId | null;
  readonly role: 'player' | 'spectator';
  readonly isReconnect: boolean;
}

/**
 * Payload of `NetworkingToMatchmaking.onSeatDisconnected`.
 */
export interface NetworkingSeatDisconnected {
  readonly matchId: MatchId;
  readonly connectionId: import('./network-types').ConnectionId;
  readonly sessionToken: SessionToken;
  readonly playerId: import('@europa/engine').PlayerId | null;
}

/**
 * Payload of `NetworkingToMatchmaking.onSeatReconnected`.
 */
export interface NetworkingSeatReconnected {
  readonly matchId: MatchId;
  readonly connectionId: import('./network-types').ConnectionId;
  readonly sessionToken: SessionToken;
}

/**
 * Payload of `NetworkingToMatchmaking.onSeatExpired`.
 */
export interface NetworkingSeatExpired {
  readonly matchId: MatchId;
  readonly sessionToken: SessionToken;
  readonly playerId: import('@europa/engine').PlayerId | null;
  /** Epoch ms when the grace window expired. */
  readonly expiredAtMs: number;
}

/**
 * Payload of `NetworkingToMatchmaking.onMatchTerminal`.
 */
export interface NetworkingMatchTerminal {
  readonly matchId: MatchId;
  readonly result: import('@europa/engine').MatchResult;
  readonly tick: number;
}

// ----------------------------------------------------------------------------
// What matchmaking must NOT assume about networking
// ----------------------------------------------------------------------------

/**
 * Documented constraints for the matchmaking implementer:
 *
 * 1. **Networking does NOT validate that a session token has been
 *    "activated".** Tokens are bound to seats at `attachPlayer` time;
 *    any `joinMatch` presenting the token will be granted the seat
 *    (until `detachPlayer` revokes it). If matchmaking wants one-shot
 *    tokens (use once, then invalidated), it must track issuance
 *    counts itself and call `detachPlayer` after the first claim.
 *
 * 2. **Networking does NOT enforce max concurrent matches beyond
 *    `ServerConfig.maxConcurrentMatches`.** The matchmaker is the
 *    source of truth for match creation rate; networking only rejects
 *    overflow (throws at `registerMatch`).
 *
 * 3. **Networking does NOT persist anything.** On server restart,
 *    every session is gone. Matchmaking must accept that.
 *
 * 4. **Networking does NOT decide forfeits.** It only reports the
 *    `onSeatExpired` event; matchmaking decides whether to surrender
 *    the seat to the engine (via an `OrderSurrender` it stages
 *    itself) or to declare the remaining player winner.
 *
 * 5. **Networking does NOT decide match results recording.** It
 *    reports `onMatchTerminal`; matchmaking records (in-memory) and
 *    serves results to clients (the `TerminalPayload` networking
 *    sends is the engine's `MatchResult` directly, no enrichment).
 *
 * 6. **Networking may have its own internal pending-order queue per
 *    match.** When matchmaking injects an order (e.g., a
 *    server-initiated surrender), it calls the engine's
 *    `submit` itself rather than going through networking; or it
 *    calls a future `Server.injectOrder` if one is added. v1 does
 *    not ship `injectOrder`; matchmaker calls engine directly.
 */
