/**
 * Matchmaker Public API — Feature 006
 *
 * The full surface the host server binary depends on for creating
 * matchmakers, wiring them to networking / engine / terrain, and
 * exposing the lobby / rematch / forfeit lifecycle.
 *
 * Consumers:
 *   - `packages/server` (host binary) — calls `createMatchmaker`,
 *       wires an HTTP lobby API on top of it, registers the WebSocket
 *       transport with networking.
 *   - tests — inject a `FakeServer` (a stub of feature 004's `Server`)
 *       plus a deterministic `randomId` and `rngFactory` to drive the
 *       matchmaker without booting networking or the engine.
 *
 * See `research.md` for design rationale and `data-model.md` for the
 * field-level contracts of every entity this API touches.
 */

import type {
  AcceptRematchRequest,
  AcceptRematchResult,
  CreateMatchRequest,
  CreateMatchResult,
  DeclineRematchRequest,
  DeclineRematchResult,
  JoinMatchRequest,
  JoinMatchResult,
  LeaveMatchRequest,
  LeaveMatchResult,
  ListPublicMatchesResult,
  MatchId,
  MatchmakerStats,
  RequestRematchRequest,
  RequestRematchResult,
} from './match-types';

// ----------------------------------------------------------------------------
// Server dependencies (canonical types from networking)
// ----------------------------------------------------------------------------
//
// `Server` and `Logger` are imported from `@europa/networking` so the
// matchmaker's dependency surface is the real networking declaration.
// The conformance test (`tests/conformance.test.ts`) additionally
// asserts the call-site shapes used by the matchmaker match — any drift
// between what the matchmaker expects and networking's canonical
// declaration fails CI.
//
// NOTE: an earlier draft of this file also imported `NULL_LOGGER` and
// `buildEnvelope` (values) via `import type`, plus a dozen request/
// config types this contract never references. Values cannot be
// imported type-only and unused names invite drift, so the import list
// now names exactly what this file uses.
// ----------------------------------------------------------------------------

import type { Logger, Server } from '@europa/networking';

// ----------------------------------------------------------------------------
// Matchmaker config
// ----------------------------------------------------------------------------

/**
 * Configuration for the matchmaker. Mirrors `MATCHMAKING_CONSTANTS`
 * field-for-field; any omitted field falls back to the default.
 *
 * `publicBaseUrl` is optional: if set, the matchmaker returns a full
 * `joinUrl` alongside the relative `joinPath`. If absent, only `joinPath`
 * is returned (the host HTTP layer composes the full URL).
 */
export interface MatchmakerConfig {
  /** Optional public base URL for composing `joinUrl` (e.g., `https://europa.example.com`). */
  readonly publicBaseUrl?: string;
  /** Override individual constants from `MATCHMAKING_CONSTANTS`. */
  readonly emptyMatchTtlMs?: number;
  readonly resultsTtlMs?: number;
  readonly rematchWindowMs?: number;
  readonly maxConcurrentMatches?: number;
  readonly maxDisplayNameLength?: number;
  readonly minDisplayNameLength?: number;
  readonly sweepIntervalMs?: number;
}

/**
 * Dependencies the matchmaker needs but does NOT own. Injected at
 * `createMatchmaker` time so tests can swap in fakes without booting
 * networking, engine, fog, or terrain.
 *
 * In production, `server` is the real `@europa/networking` `Server`.
 * In tests, `server` is a `FakeServer` that records `registerMatch` /
 * `attachPlayer` / `detachPlayer` / `unregisterMatch` calls and exposes
 * a way to fire `MatchmakerBridge` events on cue.
 */
export interface MatchmakerDeps {
  /** The networking `Server` instance. Required. */
  readonly server: Server;
  /** Logger; default is `NULL_LOGGER`. */
  readonly logger?: Logger;
  /**
   * UUID v4 generator. Default is `crypto.randomUUID` (Node ≥ 14.17).
   * Override for deterministic test IDs.
   */
  readonly randomId?: () => string;
  /**
   * Engine RNG factory. Default constructs an sfc32 instance from a
   * uint32 seed. Override for deterministic PRNG in tests.
   */
  readonly rngFactory?: (seed: number) => import('@europa/engine').Rng;
  /** Wall-clock provider (epoch ms); default is `Date.now`. */
  readonly now?: () => number;
}

// ----------------------------------------------------------------------------
// Matchmaker public surface
// ----------------------------------------------------------------------------

/**
 * The matchmaker. Created by `createMatchmaker`. One per server.
 *
 * Lifecycle:
 *   1. `createMatchmaker(config, deps)` → returns `Matchmaker`
 *   2. (host wires HTTP API on top; clients call create/join/etc.)
 *   3. `matchmaker.close()` → graceful shutdown (cancels timers, drops state)
 *
 * Threading: single-threaded Node event loop. All public methods are
 * synchronous (no `Promise`); the host calls them inside HTTP request
 * handlers. Lifecycle transitions that may take time (board generation,
 * engine session construction) are synchronous and bounded by SC-002 (2 s).
 */
export interface Matchmaker {
  // -- Lobby operations (HTTP-callable) -------------------------------------

  /**
   * Create a new match and seat the creator in seat 0.
   *
   * On success, the match transitions to `'filling'` (with one seat
   * filled) and, if `visibility === 'public'`, appears in the lobby.
   *
   * @see spec US1 AC-1, FR-002, FR-003, FR-004.
   */
  createMatch(req: CreateMatchRequest): CreateMatchResult;

  /**
   * Join an existing match (new seat or reconnect). Two modes:
   *
   * - **New join** (no `reconnectToken`): server assigns the next
   *   available seat. If all seats are taken, returns `match_full`.
   *   If the match is `'running'`, returns `match_not_joinable`.
   *   If all seats fill on this call, the match transitions to
   *   `'running'` (synchronous; board gen + engine session + register +
   *   attach). The returned `data.joinPath` is valid for the new match.
   *
   * - **Reconnect** (with `reconnectToken`): server looks up the seat
   *   by `(matchId, sessionToken)`. If the token is unknown, returns
   *   `match_not_found` (no existence leak). If the seat was forfeited
   *   (grace window expired), returns `session_expired`.
   *
   * **Private match access**: presence of the `MatchId` IS the auth
   * for private matches. The matchmaker does not differentiate
   * "private and you don't have the token" from "no such ID" — both
   * return `match_not_found` per FR-006.
   *
   * @see spec US1 AC-2, US3 AC-1, FR-006.
   */
  joinMatch(req: JoinMatchRequest): JoinMatchResult;

  /**
   * Leave a match voluntarily. For `'filling'` matches with no other
   * seated players, the match transitions to `'collected'`. For matches
   * with other seated players, the seat is released and another
   * `joinMatch` can fill it.
   *
   * For `'running'` matches, the leaving player is forfeited immediately
   * (no grace window — they explicitly chose to leave). Equivalent to
   * `engineSession.submit({ kind: 'surrender', ... })`.
   *
   * @see spec US1 AC-3.
   */
  leaveMatch(req: LeaveMatchRequest): LeaveMatchResult;

  /**
   * Return the current public lobby. Only matches with
   * `status === 'filling'` AND `visibility === 'public'` are returned.
   * Private matches are NEVER projected (FR-005 + Q1 + Q2).
   *
   * Reads from an in-memory snapshot rebuilt on every mutation; O(N)
   * for N joinable matches. Acceptable at v1 scale (≤64 concurrent).
   *
   * @see spec US2, FR-005.
   */
  listPublicMatches(): ListPublicMatchesResult;

  // -- Rematch (US4 / FR-009) -----------------------------------------------

  /**
   * Open a rematch window on a FINISHED match. Returns the
   * `rematchOfferId` (a new MatchId for the potential new match).
   *
   * All original participants must call `acceptRematch` within
   * `rematchWindowMs` (default 60 s) for the rematch to resolve. Any
   * participant calling `declineRematch` (or the window expiring
   * without all-accept) transitions the original match to `'collected'`.
   *
   * Idempotent: calling twice returns the existing offer (or
   * `rematch_already_voted` if the caller already voted).
   *
   * @see spec US4 AC-2, FR-009.
   */
  requestRematch(req: RequestRematchRequest): RequestRematchResult;

  /**
   * Cast an accept vote on a rematch offer. Returns `allAccepted: true`
   * only on the vote that fills the offer (i.e., the last participant
   * to accept). On the all-accepted vote, a new match is created (in
   * `'filling'` with all original participants auto-seated) and its
   * `matchId` + `seatAssignment` are returned.
   *
   * Idempotent for the same `(matchId, sessionToken)` — second call
   * returns `rematch_already_voted`.
   *
   * @see spec US4 AC-2, FR-009.
   */
  acceptRematch(req: AcceptRematchRequest): AcceptRematchResult;

  /**
   * Cast a decline vote on a rematch offer. Immediately transitions
   * the original match to `'collected'`; no new match is created.
   *
   * Idempotent for the same `(matchId, sessionToken)`.
   */
  declineRematch(req: DeclineRematchRequest): DeclineRematchResult;

  // -- Inspection -----------------------------------------------------------

  /**
   * Stats snapshot. Read-only. Useful for `/health`, metrics, and the
   * SC-005 soak test.
   */
  stats(): MatchmakerStats;

  // -- Shutdown -------------------------------------------------------------

  /**
   * Graceful shutdown. Cancels the empty-match sweep timer, fires
   * `unregisterMatch` for every active match (best effort; networking
   * closes connections with code 1001), and clears all in-memory state.
   * After `close()`, the matchmaker is unusable.
   *
   * Idempotent.
   */
  close(): Promise<void>;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

/**
 * Construct a `Matchmaker` instance. Does NOT start any timers until
 * the first state-changing call (timers start lazily on the first
 * `createMatch` or `joinMatch` to keep cold-start cheap).
 *
 * @param config Matchmaker-wide configuration. Use `MATCHMAKING_CONSTANTS`
 *               as the base and override fields as needed.
 * @param deps   Required: `server`. Optional: `logger` (default NULL_LOGGER),
 *               `randomId` (default `crypto.randomUUID`), `rngFactory`
 *               (default engine sfc32), `now` (default `Date.now`).
 *
 * @example
 * ```ts
 * import { createMatchmaker, MATCHMAKING_CONSTANTS } from '@europa/matchmaking';
 * import { createMatchServer, NETWORK_DEFAULT_CONFIG } from '@europa/networking';
 * import { createMatchSession } from '@europa/engine';
 * import { computePlayerView } from '@europa/fog';
 * import { generateBoard } from '@europa/terrain';
 * import { randomUUID } from 'node:crypto';
 *
 * const server = createMatchServer(
 *   { ...NETWORK_DEFAULT_CONFIG, port: 8080 },
 *   {
 *     engine: { createMatchSession: (req) => createMatchSession(req) },
 *     fog:    { computePlayerView: ({ world, playerId, spectator }) =>
 *                computePlayerView(world, playerId, { spectator }) },
 *     matchmaker: matchmakerBridge, // wired below
 *     logger: console,
 *   },
 * );
 *
 * const matchmaker = createMatchmaker(
 *   { publicBaseUrl: 'https://europa.example.com', ...MATCHMAKING_CONSTANTS },
 *   {
 *     server,
 *     logger: console,
 *     randomId: randomUUID,
 *     rngFactory: (seed) => createEngineRng(seed),
 *     now: () => Date.now(),
 *   },
 * );
 *
 * await server.listen();
 * ```
 */
export declare function createMatchmaker(
  config: MatchmakerConfig,
  deps: MatchmakerDeps,
): Matchmaker;

// ----------------------------------------------------------------------------
// Re-exports for convenience
// ----------------------------------------------------------------------------

export type {
  // Request shapes
  AcceptRematchRequest,
  CreateMatchRequest,
  DeclineRematchRequest,
  JoinMatchRequest,
  LeaveMatchRequest,
  RequestRematchRequest,
  // Result shapes
  AcceptRematchResult,
  CreateMatchResult,
  DeclineRematchResult,
  JoinMatchResult,
  LeaveMatchResult,
  ListPublicMatchesResult,
  RequestRematchResult,
  // Entities
  MatchId,
} from './match-types';

// ----------------------------------------------------------------------------
// Implementation note (NOT exported; documented for the implementer)
// ----------------------------------------------------------------------------
//
// The matchmaker's `MatchmakerBridge` callbacks (consumed from networking)
// MUST be wired BEFORE `server.listen()` is called. The host does this
// by passing a `MatchmakerBridge` object to `createMatchServer`'s
// `ServerDeps.matchmaker`. The bridge methods (`onSeatClaimed`,
// `onSeatDisconnected`, `onSeatReconnected`, `onSeatExpired`,
// `onMatchTerminal`) are the inverse calls — networking invokes them;
// the matchmaker subscribes via a private `_bindToServer(server, bridge)`
// step inside `createMatchmaker`.
//
// The exact wiring is:
//
//   createMatchmaker(config, { server, ... }) →
//     1. construct internal Matchmaker instance
//     2. attach private `onSeatClaimed`, `onSeatDisconnected`, ... handlers
//     3. call `server.bindMatchmaker?.({ onSeatClaimed, ... })` if the
//        Server exposes such a method (networking's `Server` exposes
//        this via a separate `bindMatchmaker` call; see the conformance
//        test for the exact shape)
//     4. start the empty-match sweep interval
//
// In v1, networking's `Server` exposes the bridge via its `ServerDeps`
// constructor argument. The matchmaker simply records the handlers it
// needs; the host is responsible for wiring them. (The conformance test
// verifies the wiring shape.)
