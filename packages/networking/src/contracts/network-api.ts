/**
 * Network Public API — Feature 004
 *
 * The full surface other packages depend on for creating match servers,
 * wiring WebSocket transports, and feeding the server-side tick loop.
 *
 * Consumers:
 *   - 006 (matchmaking) → calls `createMatchServer`, `registerMatch`,
 *                          `unregisterMatch`, `attachPlayer`,
 *                          `detachPlayer`, `attachSpectator`,
 *                          `detachSpectator`, `markMatchTerminal`.
 *   - 005 (client console) → calls `createMatchClient` (browser side;
 *                            shipped in this same package's client
 *                            adapter, not yet part of v1 contracts).
 *
 * Architecture (server-side):
 *
 *   packages/server (feature 006 + 004 host)
 *   ┌─────────────────────────────────────────────────┐
 *   │  matchmaker (feature 006)                       │
 *   │   - holds lobby state                           │
 *   │   - on seats filled:                            │
 *   │       createEngineSession(req) ← engine 001    │
 *   │       server.registerMatch(matchId, session)    │
 *   │       server.attachPlayer(matchId, pId, token) │
 *   └─────────────────────────────────────────────────┘
 *                    │
 *                    ▼
 *   ┌─────────────────────────────────────────────────┐
 *   │  matchServer (feature 004 — THIS PACKAGE)       │
 *   │   - one per process (singleton)                 │
 *   │   - holds: Map<matchId, MatchTransport>         │
 *   │   - WebSocket listener (one port)               │
 *   │   - scheduler: setInterval(tick, 250)           │
 *   │   - per tick:                                  │
 *   │       for each MatchTransport:                 │
 *   │         apply queued orders (engine 001)       │
 *   │         tick(world) → TickResult               │
 *   │         compute fog view per session (fog 002) │
 *   │         build delta per session                │
 *   │         send (Server.sendFrame)                │
 *   │       if terminal: send TerminalPayload;       │
 *   │                  transition connections;       │
 *   │                  notify matchmaker             │
 *   └─────────────────────────────────────────────────┘
 *
 * Determinism discipline:
 *   - The scheduler is the only thing that calls `tick(world)`.
 *   - Order application order is: per-session FIFO of submitted
 *     orders, then sorted by `(playerId, kind)` per feature 001 FR-017.
 *   - All state transitions flow through pure functions on
 *     `MatchTransport`; no `Date.now()` reads in tick logic — the
 *     scheduler computes `now` once per tick and passes it in.
 */

import type {
  ConnectionId,
  ConnectionRole,
  ConnectionState,
  MatchId,
  MessageKind,
  NetworkPayload,
  ProtocolEnvelope,
  SessionToken,
} from './network-types';

// ----------------------------------------------------------------------------
// Server config (passed to createMatchServer)
// ----------------------------------------------------------------------------

/**
 * Configuration for the network server. All fields are required;
 * defaults live in `NETWORK_DEFAULT_CONFIG` (see below) so callers
 * never have to specify what they don't care about.
 *
 * `tickRateMs` MUST equal the engine's `MatchConfig.tickIntervalMs`
 * for any registered match. Mismatch is rejected at `registerMatch`
 * time (the server compares and throws).
 */
export interface ServerConfig {
  /** Hostname / interface to bind. Default `'0.0.0.0'` for self-hosting. */
  readonly host: string;
  /** TCP port for WebSocket. Default `8080`. */
  readonly port: number;
  /**
   * Tick rate in milliseconds. One tick per registered match per
   * interval. Default `250` (4 Hz; matches engine's default).
   */
  readonly tickRateMs: number;
  /**
   * Heartbeat interval the server expects (ms). Clients that send no
   * message (including ping) within `2 × heartbeatIntervalMs` are
   * marked `disconnected`. Default `5000` (5 s).
   */
  readonly heartbeatIntervalMs: number;
  /**
   * Grace window after disconnect (ms). If the client reconnects
   * within this window, the seat is reclaimed and a fresh snapshot
   * is sent. After expiry, the server notifies matchmaking to apply
   * forfeit policy (per spec US2 AC-2 + matchmaking spec FR-010).
   * Default `60000` (60 s).
   */
  readonly reconnectGraceMs: number;
  /**
   * Per-connection order rate limit (orders/second). Default `10`.
   * Excess orders are dropped with `'rate_limited'` error per FR-010.
   * Heartbeats and snapshots do not consume tokens.
   */
  readonly ordersPerSecond: number;
  /**
   * Burst factor for the token bucket. Bucket capacity =
   * `ordersPerSecond * burstFactor`. Default `2.0` (allows 2-second
   * bursts at default rate).
   */
  readonly rateLimitBurstFactor: number;
  /**
   * Maximum number of concurrent matches on this server. Default
   * `64`. Beyond this, `registerMatch` rejects with a thrown error.
   * Per SC-005, ≥10 concurrent matches must run without degradation;
   * 64 leaves headroom for self-hosting headless boxes.
   */
  readonly maxConcurrentMatches: number;
  /**
   * WebSocket idle timeout (ms). Default `30000` (30 s).
   * Applied as the underlying `ws` server's `clientTracking` /
   * socket-level timeout. Server's heartbeat (above) is the
   * application-layer supplement.
   */
  readonly wsIdleTimeoutMs: number;
  /**
   * Whether to log per-frame info. Default `false`. Set to `true` in
   * development; production deployments typically set `false` to avoid
   * log spam from per-tick frames.
   */
  readonly verboseLogging: boolean;
}

/**
 * Default server config. Single tunable-constants location (mirror of
 * engine's `ENGINE_CONSTANTS` discipline).
 */
export const NETWORK_DEFAULT_CONFIG: ServerConfig = {
  host: '0.0.0.0',
  port: 8080,
  tickRateMs: 250,
  heartbeatIntervalMs: 5000,
  reconnectGraceMs: 60_000,
  ordersPerSecond: 10,
  rateLimitBurstFactor: 2.0,
  maxConcurrentMatches: 64,
  wsIdleTimeoutMs: 30_000,
  verboseLogging: false,
} as const;

// ----------------------------------------------------------------------------
// Server dependencies (test seam)
// ----------------------------------------------------------------------------

/**
 * Dependencies the networking layer needs but does NOT own. These are
 * injected at `createMatchServer` time so tests can swap in fakes
 * without booting the engine/fog/matchmaker.
 *
 * In production, all three are the real packages. In tests:
 *   - `engine.createMatchSession` → a pre-scripted session
 *   - `fog.computePlayerView` → a deterministic mock
 *   - `matchmaker` callbacks → spies that record events
 */
export interface ServerDeps {
  /**
   * Engine factory. Called once per match on `registerMatch`. The
   * returned object is owned by networking for the match's lifetime.
   *
   * Networking calls:
   *   - `session.submit(order)` for each accepted client order
   *   - `session.advance()` on every scheduler tick
   *   - `session.status()` after each tick (cheap terminal check)
   *   - `session.close()` on `unregisterMatch` or terminal teardown
   */
  readonly engine: EngineFactory;
  /**
   * Fog factory. Called once per session per tick. Networking
   * provides the post-`tick` `World` and the `PlayerId` (or
   * `'spectator'` mode flag); fog returns the `PlayerView` to send.
   */
  readonly fog: FogFactory;
  /**
   * Matchmaker callbacks. Invoked by networking when application-
   * level events happen that the matchmaker needs to know about
   * (seating changes, disconnect timeout, terminal detection).
   */
  readonly matchmaker: MatchmakerBridge;
  /**
   * Optional lobby composition source (feature 010). When present,
   * the dispatcher routes the additive `lobby*` message family to the
   * facade it builds, hands it the event sink, and calls
   * `connectionClosed` on every socket close. When absent, lobby
   * frames receive a graceful `internal_error` reply and gameplay
   * behavior is completely unaffected.
   *
   * Host recipe (the factory is invoked lazily at the first lobby
   * frame, so forward references are safe):
   *
   * ```ts
   * let matchmaker: Matchmaker; // assigned right after server creation
   * const server = createMatchServer(config, {
   *   // ...
   *   lobby: {
   *     create: (sink) =>
   *       createLobbyService({ matchmaker, deliver: sink.deliver }),
   *   },
   * });
   * matchmaker = createMatchmaker({}, { server });
   * ```
   *
   * The host owns facade shutdown (`facade.close()`); the server never
   * closes it — matchmaking's facade cascades into `matchmaker.close()`.
   */
  readonly lobby?: LobbyServiceSource;
  /**
   * Logger. Default is a no-op (`() => {}`). Pass `console.log` in
   * dev, pino/winston in production.
   */
  readonly logger: Logger;
}

// ----------------------------------------------------------------------------
// Engine factory contract (mirrors engine-to-networking boundary)
// ----------------------------------------------------------------------------

/**
 * Engine factory shape, abstracting over the engine package's
 * `createMatchSession` from `engine-to-matchmaking.ts`. Networking
 * receives a `EngineSession` per match and drives it.
 */
export interface EngineFactory {
  /**
   * Construct a fresh engine session for a match. The full
   * construction parameters are owned by matchmaking; networking
   * only receives the resulting session reference.
   *
   * Spec FR-001: matches are in-memory; sessions are not persisted.
   */
  createMatchSession(req: EngineSessionInit): EngineSession;
}

/**
 * Initialization parameters for an engine session. Mirrors the
 * relevant subset of `engine-to-matchmaking.ts`'s `MatchInitRequest`
 * (we don't need `terrain` here because matchmaking passes the
 * already-constructed session via `attach*` — see `Server` API).
 */
export interface EngineSessionInit {
  readonly matchId: MatchId;
  readonly config: import('@europa/engine').MatchConfig;
  readonly board: import('@europa/engine').Board;
  readonly displayNames: ReadonlyArray<string>;
}

/**
 * Engine session handle. Mirrors `engine-to-matchmaking.ts`'s
 * `EngineSession`. Networking holds one per active match and drives it.
 */
export interface EngineSession {
  world(): import('@europa/engine').World;
  submit(order: import('@europa/engine').Order): import('@europa/engine').CommandResult;
  advance(): {
    readonly world: import('@europa/engine').World;
    readonly events: import('@europa/engine').TickEvents;
    readonly terminal?: import('@europa/engine').MatchResult;
  };
  status(): import('@europa/engine').MatchResult | undefined;
  close(): void;
}

// ----------------------------------------------------------------------------
// Fog factory contract
// ----------------------------------------------------------------------------

export interface FogFactory {
  /**
   * Compute the per-recipient view for a tick. Networking calls this
   * once per session (player or spectator) per tick.
   *
   * For spectator sessions, networking passes `role: 'spectator'`;
   * fog's `computePlayerView` honors its `options.spectator` flag and
   * returns the full board.
   */
  computePlayerView(args: {
    readonly world: import('@europa/engine').World;
    readonly playerId: import('@europa/engine').PlayerId;
    readonly spectator: boolean;
  }): import('@europa/fog').PlayerView;
}

// ----------------------------------------------------------------------------
// Matchmaker bridge (callbacks networking invokes)
// ----------------------------------------------------------------------------

/**
 * Networking is not the source of truth for match lifecycle; it only
 * reports events the matchmaker needs to react to. The matchmaker in
 * turn drives networking via the `Server.registerMatch` /
 * `attachPlayer` / etc. calls.
 *
 * This two-way coupling is intentional: networking is the *only*
 * layer that sees socket-level events, and the matchmaker is the
 * *only* layer that owns the durable match record.
 */
export interface MatchmakerBridge {
  /**
   * A client successfully claimed a seat (new or reconnect).
   * Matchmaker records the session→seat binding for the duration.
   * For spectators, `playerId` is null.
   */
  onSeatClaimed?(event: {
    readonly matchId: MatchId;
    readonly connectionId: ConnectionId;
    readonly sessionToken: SessionToken;
    readonly playerId: import('@europa/engine').PlayerId | null;
    readonly role: ConnectionRole;
  }): void;

  /**
   * A client WebSocket disconnected. Matchmaker may start the
   * reconnect grace timer (if not already running). The server
   * also independently enforces `reconnectGraceMs` and will call
   * `onSeatExpired` if the window lapses.
   */
  onSeatDisconnected?(event: {
    readonly matchId: MatchId;
    readonly connectionId: ConnectionId;
    readonly sessionToken: SessionToken;
  }): void;

  /**
   * A reconnecting client reclaimed the seat within the grace window.
   * Matchmaker cancels any pending forfeit timer.
   */
  onSeatReconnected?(event: {
    readonly matchId: MatchId;
    readonly connectionId: ConnectionId;
    readonly sessionToken: SessionToken;
  }): void;

  /**
   * The reconnect grace window expired. Matchmaker applies its
   * forfeit policy (matchmaking spec US5 / FR-010): if one player
   * remains they win, if none remain the match is destroyed.
   */
  onSeatExpired?(event: {
    readonly matchId: MatchId;
    readonly sessionToken: SessionToken;
    readonly playerId: import('@europa/engine').PlayerId | null;
  }): void;

  /**
   * The engine reported a terminal result on this tick. Matchmaker
   * records the result, prepares results delivery, and may start a
   * rematch window (matchmaking spec US4).
   */
  onMatchTerminal?(event: {
    readonly matchId: MatchId;
    readonly result: import('@europa/engine').MatchResult;
    readonly tick: number;
  }): void;
}

// ----------------------------------------------------------------------------
// Lobby service composition (feature 010)
// ----------------------------------------------------------------------------

/**
 * Opaque matchmaking session id (feature 010 structural mirror).
 * Mirrors `@europa/matchmaking`'s branded `PlayerSessionId` — the brand
 * name is identical so the types stay mutually assignable (networking
 * cannot import matchmaking: the dependency arrow points the other
 * way; drift is caught by cross-package conformance witnesses).
 */
export type LobbyPlayerSessionId = string & { readonly __brand: 'PlayerSessionId' };

/**
 * Structural mirror of matchmaking's `LobbyError` (feature 010): the
 * error payload of every failed lobby action. Field-for-field identical
 * to the matchmaking declaration and to the wire `error` `LobbyEvent`
 * variant's payload fields (`code` + `message` + optional `detail`).
 */
export interface LobbyFailure {
  /** Machine-readable code from the closed lobby error union. */
  readonly code: import('./network-types').LobbyErrorCode;
  /** Human-readable English; safe to show (never contains secrets). */
  readonly message: string;
  /**
   * Optional machine-readable detail (field name → message/value),
   * e.g. the rejected create-form settings fields (spec Clarifications
   * v1.3 field-specific feedback ruling).
   */
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Explicit success/error union for fallible lobby facade calls —
 * networking's mirror of matchmaking's `Result<T, LobbyError>` with the
 * error fixed to {@link LobbyFailure}. Same bare-arm conditional as the
 * matchmaking declaration: `LobbyResult<void>` collapses to `{ ok:
 * true }` alone (a required `data: void` field would force meaningless
 * `{ ok: true, data: undefined }` literals).
 */
export type LobbyResult<TSuccess> = [undefined] extends [TSuccess]
  ? { readonly ok: true } | { readonly ok: false; readonly error: LobbyFailure }
  :
      | { readonly ok: true; readonly data: TSuccess }
      | { readonly ok: false; readonly error: LobbyFailure };

/**
 * Structural mirror of matchmaking's `SeatAssignment` (feature 010):
 * the server-issued credential bundle a successful create/join yields.
 * Produced by the server, never accepted from the client. The
 * dispatcher does not forward this to the wire — the browser obtains
 * its session token through the EXISTING match join flow (`JoinAck`),
 * per lobby-wire.md ("returns the existing session assignment through
 * the existing match join flow").
 */
export interface LobbySeatAssignment {
  /** Matchmaking-owned session identity. */
  readonly playerSessionId: LobbyPlayerSessionId;
  /** Position in seat order (0..playerCount-1). */
  readonly seatIndex: number;
  /** Engine seat (1..playerCount); `seatIndex + 1` while filling. */
  readonly playerId: import('@europa/engine').PlayerId;
  /** Networking-bound token for reconnect (feature 004 boundary). */
  readonly sessionToken: SessionToken;
  /** Cosmetic name the seat-holder chose at create/join time. */
  readonly displayName: string;
}

/**
 * What a successful lobby create/join returns (mirror of matchmaking's
 * `MatchJoinTarget`): the entered match plus the server-issued seat
 * credentials. Server-side bookkeeping only — none of it except the
 * match id is projected to the wire (privacy envelope, spec FR-024).
 */
export interface LobbyMatchTarget {
  /** The match entered (also reflected in later snapshots' `activeMatchId`). */
  readonly matchId: MatchId;
  /** Server-issued seat/session credentials. */
  readonly seatAssignment: LobbySeatAssignment;
}

/**
 * What a successful lobby spectate returns (mirror of matchmaking's
 * `SpectatorTarget`): identification of the match now attached through
 * the existing read-only spectator path. No seat, no token.
 */
export interface LobbySpectateTarget {
  /** The match being spectated. */
  readonly matchId: MatchId;
}

/**
 * The event-delivery sink the server hands to a lobby facade. THE one
 * projection path onto the wire (feature 010 Wave-2 audit item 2):
 * the dispatcher never synthesizes snapshots or identity events
 * itself — every outbound `lobbyEvent` frame originates from a facade
 * push through this sink or from a facade RETURN VALUE framed verbatim
 * (e.g., subscribe's baseline snapshot).
 */
export interface LobbyEventSink {
  /**
   * Deliver one lobby event to one connection as a `lobbyEvent` frame.
   *
   * Directed events (identity confirmations, action outcomes) MUST be
   * deliverable regardless of lobby subscription — the facade decides
   * the audience; the sink only resolves connection → socket. Unknown
   * or already-closed connection ids are silently dropped (the
   * recipient is gone; nothing to acknowledge).
   *
   * @param connectionId Recipient transport connection.
   * @param event        The facade-produced event (sent verbatim).
   */
  deliver(connectionId: ConnectionId, event: import('./network-types').LobbyEvent): void;
}

/**
 * Networking's structural view of the server lobby facade (feature
 * 010). Mirrors `@europa/matchmaking`'s `createLobbyService` return
 * (`LobbyService & LobbyConnectionTeardown`) method-for-method; the
 * real instance is assignable because every shape involved is pinned
 * mutually assignable by conformance witnesses. See
 * `specs/010-public-lobby-match-browser/contracts/lobby-api.md` for
 * the normative semantics of each method.
 */
export interface LobbyServiceFacade {
  /** Resolve or mint the caller's ephemeral guest identity (FR-002). */
  establishIdentity(
    claim: import('./network-types').GuestIdentityClaim | undefined,
    connectionId: ConnectionId,
  ): import('./network-types').IdentityState;

  /** Validate + atomically reserve a handle (FR-004/FR-005). */
  setHandle(connectionId: ConnectionId, handle: string): LobbyResult<import('./network-types').IdentityState>;

  /** Subscribe to revisions; returns the baseline snapshot (FR-013). */
  subscribe(connectionId: ConnectionId): LobbyResult<import('./network-types').LobbySnapshot>;

  /** Create a public match; reserves the creator's seat (FR-008/FR-009). */
  create(connectionId: ConnectionId, settings?: Partial<import('./network-types').LobbyMatchSettings>): LobbyResult<LobbyMatchTarget>;

  /** Atomically assign at most one seat in a listed match (FR-010). */
  join(connectionId: ConnectionId, matchId: MatchId): LobbyResult<LobbyMatchTarget>;

  /** Attach read-only to an in-progress match (FR-012). */
  spectate(connectionId: ConnectionId, matchId: MatchId): LobbyResult<LobbySpectateTarget>;

  /** Release this identity's match association / return to lobby. */
  leave(connectionId: ConnectionId): LobbyResult<void>;

  /**
   * Transport teardown hook (Wave-2 audit item 1): the dispatcher MUST
   * invoke this for EVERY socket close — it unbinds the connection's
   * identity, drops its subscription, starts the reconnect grace
   * window, and releases spectator presence. Without it a lost
   * connection would squat its reserved handle forever.
   */
  connectionClosed(connectionId: ConnectionId): void;

  /** Shut the facade down (clears all lobby state). Host-owned: the
   *  server never calls this — matchmaking's facade cascades into
   *  `matchmaker.close()`, which is the host's lifecycle decision. */
  close(): Promise<void>;
}

/**
 * Optional composition source for the lobby facade (feature 010). The
 * server invokes {@linkcode create} LAZILY — at the first inbound
 * lobby frame — memoizing the result for the process lifetime. Lazy
 * invocation breaks the host boot-order knot (the facade needs the
 * matchmaker; the matchmaker needs the server), mirroring how the
 * bridge forwarding proxy defers matchmaker binding. By the time any
 * client can send a lobby frame the host has finished wiring, so no
 * facade lifecycle event can be missed.
 *
 * LIFECYCLE FAN-OUT NOTE (Wave-2 audit item 4): a facade built with
 * matchmaking's `createLobbyService({ matchmaker, deliver })`
 * registers its own bridge handlers via the matchmaker's
 * `registerLifecycleListener` seam and subscribes to the status bus
 * internally — no extra host wiring. Hosts supplying a CUSTOM facade
 * implementation MUST attach their bridge handlers to
 * `ServerDeps.matchmaker` themselves (or via the matchmaker's
 * `registerLifecycleListener`), or lobby projections will never see
 * fill/start/collect transitions.
 */
export interface LobbyServiceSource {
  /**
   * Build the lobby facade, receiving the server's event sink.
   *
   * @param sink The ONE projection path onto the wire (see
   *             {@link LobbyEventSink}). Pass it straight through as
   *             matchmaking's `LobbyServiceDeps.deliver`.
   * @returns The live facade (called once per server; result memoized).
   */
  create(sink: LobbyEventSink): LobbyServiceFacade;
}

// ----------------------------------------------------------------------------
// Logger
// ----------------------------------------------------------------------------

/**
 * Minimal logger interface. Networking never calls `console.*`
 * directly; the host provides a logger. The default in production
 * is pino; in tests a no-op.
 */
export interface Logger {
  debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}

/** No-op logger. Used as default when `ServerDeps.logger` is omitted. */
export const NULL_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ----------------------------------------------------------------------------
// Server public surface
// ----------------------------------------------------------------------------

/**
 * The match server. Created by `createMatchServer`. One per process.
 *
 * Lifecycle:
 *   1. `createMatchServer(config, deps)` → returns `Server`
 *   2. `server.listen()` → starts HTTP + WebSocket listener, scheduler
 *   3. (matchmaking drives) `registerMatch`, `attachPlayer`, ...
 *   4. `server.close()` → stops listener + scheduler, closes all
 *      connections with code 1001 ("going away")
 *
 * Threading model: single-threaded Node event loop. Tick scheduler
 * uses `setInterval`; all network I/O is non-blocking. No worker
 * threads (constitution Principle VII: self-hostable by default).
 */
export interface Server {
  /**
   * Start listening on `config.host:config.port` and start the tick
   * scheduler. Idempotent (calling twice is a no-op).
   */
  listen(): Promise<void>;

  /**
   * Register a fresh match that is ready to receive connections.
   * Called by the matchmaker immediately after all seats are filled
   * and the engine session is constructed.
   *
   * @throws if the match is already registered, if
   *         `config.tickRateMs` doesn't match the server's, or if
   *         `maxConcurrentMatches` is reached.
   */
  registerMatch(req: RegisterMatchRequest): void;

  /**
   * Remove a match. Closes all connections for the match (clean
   * `1001` close), releases the engine session, cancels any pending
   * grace timers. Called by the matchmaker on explicit teardown
   * (e.g., all players disconnected past grace).
   */
  unregisterMatch(matchId: MatchId): void;

  /**
   * Bind a player seat in a match to a session token. After this
   * call, a client presenting `token` via `joinMatch` (new or
   * reconnect) will be assigned `playerId`.
   *
   * Idempotent: calling twice with the same `(matchId, playerId,
   * token)` is a no-op; calling with a different token for the same
   * `(matchId, playerId)` invalidates the old token (spec edge case:
   * "two clients claim the same player seat → second claim invalidates
   * the first; old socket closed").
   */
  attachPlayer(req: AttachPlayerRequest): void;

  /**
   * Unbind a player seat (e.g., on surrender, elimination, or
   * matchmaking-driven forfeit). Closes any active connection bound
   * to the token. Does NOT remove the match itself.
   */
  detachPlayer(req: DetachRequest): void;

  /**
   * Allow spectator attach for a match (spec US3). After this call,
   * any client `joinMatch`-ing the match with `role: 'spectator'`
   * receives a full-board view. Spectators can join and leave at any
   * time during the match (no per-seat limits).
   */
  enableSpectators(matchId: MatchId): void;
  disableSpectators(matchId: MatchId): void;

  /**
   * Stop the listener and scheduler. After this, the server is
   * unusable. Idempotent.
   */
  close(): Promise<void>;

  /**
   * Stats snapshot. Read-only. Useful for `/health`, metrics, and
   * soak tests (spec SC-005).
   */
  stats(): ServerStats;
}

// ----------------------------------------------------------------------------
// Request shapes (the data the matchmaker sends to networking)
// ----------------------------------------------------------------------------

/**
 * `registerMatch` request. See `Server.registerMatch` for semantics.
 */
export interface RegisterMatchRequest {
  readonly matchId: MatchId;
  readonly engineSession: EngineSession;
  /** Config snapshot for the match (used for version checks + telemetry). */
  readonly matchConfig: import('@europa/engine').MatchConfig;
  /**
   * Optional per-seat display names, indexed by `PlayerId - 1`. When
   * present, networking overlays these onto the `JoinAckPayload.players`
   * roster's `displayName` fields WITHOUT touching the engine world
   * (feature 010 FR-020/SC-008: authoritative seat labels travel at the
   * registration boundary; engine state stays byte-deterministic and
   * ASCII-by-convention). Length SHOULD equal
   * `matchConfig.playerCount`; indices without a name keep the engine's
   * own value. Omitted (legacy feature-006 callers) → the engine world's
   * placeholders are sent verbatim.
   */
  readonly displayNames?: ReadonlyArray<string>;
}

/**
 * `attachPlayer` request.
 */
export interface AttachPlayerRequest {
  readonly matchId: MatchId;
  readonly playerId: import('@europa/engine').PlayerId;
  readonly sessionToken: SessionToken;
}

/**
 * `detachPlayer` / spectator-detach request.
 */
export interface DetachRequest {
  readonly matchId: MatchId;
  readonly playerId?: import('@europa/engine').PlayerId | null;
  readonly sessionToken: SessionToken;
}

// ----------------------------------------------------------------------------
// Stats
// ----------------------------------------------------------------------------

/**
 * Server stats snapshot. Cheap to read (counts + a few accumulators).
 * Used by tests, `/health`, and metrics.
 */
export interface ServerStats {
  readonly uptimeMs: number;
  readonly activeMatches: number;
  readonly activeConnections: number;
  readonly totalTicks: number;
  readonly totalFramesSent: number;
  readonly totalFramesReceived: number;
  readonly totalOrdersAccepted: number;
  readonly totalOrdersRejected: number;
  readonly totalRateLimitDrops: number;
  /** Last tick wall-clock duration (ms). Useful for tick-degradation assertions. */
  readonly lastTickDurationMs: number;
  /** Max tick wall-clock duration seen (ms). */
  readonly peakTickDurationMs: number;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

/**
 * Construct a `Server` instance. Does NOT start listening — call
 * `server.listen()` afterwards.
 *
 * @param config Server-wide configuration. Use `NETWORK_DEFAULT_CONFIG`
 *               as a base and override fields.
 * @param deps   Dependencies (engine factory, fog factory, matchmaker
 *               bridge, logger). All required.
 *
 * @example
 * ```ts
 * import { createMatchServer, NETWORK_DEFAULT_CONFIG } from '@europa/networking';
 * import { createMatchSession } from '@europa/engine';
 * import { computePlayerView } from '@europa/fog';
 *
 * const server = createMatchServer(
 *   { ...NETWORK_DEFAULT_CONFIG, port: 9090 },
 *   {
 *     engine: { createMatchSession: (req) => createMatchSession(req) },
 *     fog: { computePlayerView: ({ world, playerId, spectator }) =>
 *             computePlayerView(world, playerId, { spectator }) },
 *     matchmaker: { onSeatExpired: (e) => logger.warn('expired', e) },
 *     logger: console,
 *   },
 * );
 *
 * await server.listen();
 * ```
 */
export declare function createMatchServer(config: ServerConfig, deps: ServerDeps): Server;

// ----------------------------------------------------------------------------
// Server-internal types (not exported; documented for tests)
// ----------------------------------------------------------------------------

/**
 * The server's internal record for one registered match. Not part of
 * the public surface; declared here so tests can construct fixtures
 * via `registerMatch` + `attachPlayer` and inspect internal state
 * through `Server.stats()`.
 *
 * @internal
 */
export interface MatchTransport {
  readonly matchId: MatchId;
  readonly engineSession: EngineSession;
  readonly matchConfig: import('@europa/engine').MatchConfig;
  /** Per-player seat bindings: token + (optional) active connection. */
  readonly seats: Map<import('@europa/engine').PlayerId, SeatRecord>;
  /** Active spectator connections (no per-token record — spectators have no seat). */
  readonly spectatorConnections: Map<ConnectionId, ConnectionRecord>;
  /** Monotonic counter of tick boundaries elapsed since match start. */
  readonly tickCounter: number;
  /** Per-tick pending order queue, drained at tick boundaries. */
  readonly pendingOrders: Array<{
    readonly playerId: import('@europa/engine').PlayerId;
    readonly order: import('@europa/engine').Order;
    readonly submittedAtSeq: number;
  }>;
  /** Per-recipient last-sent PlayerView cache (for delta computation). */
  readonly lastSentView: Map<ConnectionId, import('@europa/fog').PlayerView>;
  /** Spectators allowed? (set by `enableSpectators`). */
  readonly spectatorsAllowed: boolean;
  /** Match has terminated (terminal payload sent; awaiting teardown). */
  readonly terminalSent: boolean;
}

/**
 * Per-player seat record. @internal.
 */
export interface SeatRecord {
  readonly playerId: import('@europa/engine').PlayerId;
  readonly sessionToken: SessionToken;
  /** Currently-attached connection, or null if disconnected. */
  connection: ConnectionRecord | null;
  /** Wall-clock epoch ms of disconnect (used for grace window check). */
  disconnectedAtMs: number | null;
}

/**
 * Per-connection record (server-side). Mirrors `ServerConnection` in
 * `network-types.ts` but enriched with `socket` (the underlying `ws`
 * handle) and `matchId` for routing.
 *
 * @internal
 */
export interface ConnectionRecord {
  readonly id: ConnectionId;
  readonly socket: import('ws').WebSocket;
  readonly matchId: MatchId;
  readonly role: ConnectionRole;
  readonly playerId: import('@europa/engine').PlayerId | null;
  state: ConnectionState;
  sessionToken: SessionToken | null;
  clientSeq: number;
  serverSeq: number;
  lastSeenAtMs: number;
  lastSentAtMs: number;
  rateBucket: {
    capacity: number;
    refillPerSec: number;
    tokens: number;
    lastRefillAtMs: number;
  };
}

// ----------------------------------------------------------------------------
// Convenience: a tiny helper to build a `ProtocolEnvelope`
// ----------------------------------------------------------------------------

/**
 * Build an outbound `ProtocolEnvelope` with a fresh server-side
 * sequence number. Networking uses this for every outbound frame;
 * the monotonic `seq` lets clients detect drops and reorderings.
 *
 * @internal — exported for tests only. Production code calls
 *             `Server.sendFrame` (not yet part of the public API).
 */
export declare function buildEnvelope<T extends NetworkPayload>(
  kind: MessageKind,
  payload: T,
  nextSeq: number,
): ProtocolEnvelope<T>;

// ----------------------------------------------------------------------------
// Client-side surface (browser console; declared for completeness, not v1)
// ----------------------------------------------------------------------------

/**
 * Browser-side handle returned by `createMatchClient`. NOT part of the
 * v1 contract — declared here as a forward-compatible placeholder so
 * feature 005 (console) can stub against it during planning.
 *
 * Will live in `packages/networking/src/client/connect.ts` once
 * feature 005 is dispatched.
 */
export interface MatchClient {
  connect(url: string): Promise<void>;
  disconnect(): void;
  joinMatch(req: {
    readonly matchId: MatchId;
    readonly role: ConnectionRole;
    readonly reconnectToken?: SessionToken;
    readonly displayName: string;
  }): Promise<void>;
  sendOrder(order: import('@europa/engine').Order): Promise<import('@europa/engine').CommandResult>;
  onMessage(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void;
  state(): ClientState;
}

export interface ClientState {
  readonly connection: ConnectionState;
  readonly sessionToken: SessionToken | null;
  readonly matchId: MatchId | null;
  readonly playerId: import('@europa/engine').PlayerId | null;
  readonly lastTick: number;
  readonly lastSeenServerSeq: number;
}

export declare function createMatchClient(opts: {
  readonly autoReconnect?: boolean;
  readonly verboseLogging?: boolean;
}): MatchClient;
