/**
 * FakeServer — Feature 006 test fixture (T029)
 *
 * A stub of feature 004's `Server` interface
 * (`contracts/matchmaking-api.ts` §"Server dependencies") that records
 * every matchmaking-driven call so quickstart/unit tests can assert
 * the exact auto-start sequence without booting real networking:
 *
 *   - `registerMatchCalls`   — one per started match (+ engine session)
 *   - `attachPlayerCalls`    — one per seated player, in seat order
 *   - `detachPlayerCalls`    — forfeit/leave detachments (US5)
 *   - `unregisterMatchCalls` — teardowns (US5 / close)
 *   - `enableSpectatorsCalls` / `disableSpectatorsCalls`
 *
 * It also plays the networking side of the bridge: `bindMatchmaker`
 * captures the handlers a matchmaker registers (the soft-binding path
 * in `createMatchmaker`), and the `fireOn*` methods invoke them on cue
 * — the workhorse for US4 (`onMatchTerminal`) and US5
 * (`onSeatExpired`) scenarios.
 *
 * Constructor overrides for `now()` / `randomId()` let tests drive the
 * fixture deterministically; by default it is inert (zeroed stats,
 * no-op listen/close).
 */

import type {
  AttachPlayerRequest,
  ConnectionId,
  ConnectionRole,
  DetachRequest,
  EngineSession,
  Logger,
  MatchId,
  MatchmakerBridge,
  MatchResult,
  RegisterMatchRequest,
  ServerStats,
  SessionToken,
} from '@europa/networking';

/**
 * The recorded-call fixture. Structurally implements networking's
 * `Server`; the extra recording/binding surface is test-only.
 */
export class FakeServer {
  /** Every `registerMatch` request, in call order. */
  readonly registerMatchCalls: RegisterMatchRequest[] = [];
  /** Every `attachPlayer` request, in call order. */
  readonly attachPlayerCalls: AttachPlayerRequest[] = [];
  /** Every `detachPlayer` request, in call order. */
  readonly detachPlayerCalls: DetachRequest[] = [];
  /** Every unregistered match id, in call order. */
  readonly unregisterMatchCalls: MatchId[] = [];
  /** Every match id spectators were enabled for, in call order. */
  readonly enableSpectatorsCalls: MatchId[] = [];
  /** Every match id spectators were disabled for, in call order. */
  readonly disableSpectatorsCalls: MatchId[] = [];

  /** Injected wall clock (defaults to a fixed 0). */
  private readonly nowFn: () => number;
  /** Injected id factory (unused internally; symmetry with deps). */
  private readonly randomIdFn: () => string;
  /** Captured matchmaker handlers, merged across `bindMatchmaker` calls. */
  private handlers: Partial<MatchmakerBridge> = {};
  /** No-op logger handed to whoever asks. */
  private readonly nullLogger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  constructor(overrides?: { now?: () => number; randomId?: () => string }) {
    this.nowFn = overrides?.now ?? (() => 0);
    this.randomIdFn = overrides?.randomId ?? (() => 'fake-server-id');
  }

  // -- Server interface (inert) ---------------------------------------------

  /** No-op: the fake never opens sockets. */
  listen(): Promise<void> {
    return Promise.resolve();
  }

  /** No-op: the fake never holds resources. */
  close(): Promise<void> {
    return Promise.resolve();
  }

  /** Zeroed snapshot: the fake drives no ticks or frames. */
  stats(): ServerStats {
    return {
      uptimeMs: 0,
      activeMatches: this.registerMatchCalls.length - this.unregisterMatchCalls.length,
      activeConnections: 0,
      totalTicks: 0,
      totalFramesSent: 0,
      totalFramesReceived: 0,
      totalOrdersAccepted: 0,
      totalOrdersRejected: 0,
      totalRateLimitDrops: 0,
      lastTickDurationMs: 0,
      peakTickDurationMs: 0,
    };
  }

  /** Logger for tests that need to hand one onward. */
  get logger(): Logger {
    return this.nullLogger;
  }

  // -- Recording implementations ----------------------------------------------

  /** Record a registration (matchmaking → networking). */
  registerMatch(req: RegisterMatchRequest): void {
    this.registerMatchCalls.push(req);
  }

  /** Record an unregister teardown (matchmaking → networking). */
  unregisterMatch(matchId: MatchId): void {
    this.unregisterMatchCalls.push(matchId);
  }

  /** Record a seat binding (matchmaking → networking). */
  attachPlayer(req: AttachPlayerRequest): void {
    this.attachPlayerCalls.push(req);
  }

  /** Record a seat detachment (matchmaking → networking, US5). */
  detachPlayer(req: DetachRequest): void {
    this.detachPlayerCalls.push(req);
  }

  /** Record a spectator enablement (matchmaking → networking). */
  enableSpectators(matchId: MatchId): void {
    this.enableSpectatorsCalls.push(matchId);
  }

  /** Record a spectator disablement (matchmaking → networking). */
  disableSpectators(matchId: MatchId): void {
    this.disableSpectatorsCalls.push(matchId);
  }

  // -- Bridge plumbing ---------------------------------------------------------

  /**
   * Capture the matchmaker's bridge handlers (the optional
   * `bindMatchmaker` path from `contracts/matchmaking-api.ts`). Later
   * calls merge over earlier ones.
   */
  bindMatchmaker(bridge: MatchmakerBridge): void {
    this.handlers = { ...this.handlers, ...bridge };
  }

  /**
   * The engine session from the most recent `registerMatch`, if any.
   * Held for forfeit tests that submit surrender orders into it.
   */
  get lastEngineSession(): EngineSession | undefined {
    return this.registerMatchCalls[this.registerMatchCalls.length - 1]?.engineSession;
  }

  // -- fireOn* triggers (tests invoke these) -----------------------------------

  /** Fire `onSeatClaimed` with the given payload. */
  fireOnSeatClaimed(args: {
    matchId: MatchId;
    connectionId: ConnectionId;
    sessionToken: SessionToken;
    playerId: 1 | 2 | 3 | 4 | null;
    role: ConnectionRole;
  }): void {
    this.handlers.onSeatClaimed?.(args);
  }

  /** Fire `onSeatDisconnected` with the given payload. */
  fireOnSeatDisconnected(args: {
    matchId: MatchId;
    connectionId: ConnectionId;
    sessionToken: SessionToken;
  }): void {
    this.handlers.onSeatDisconnected?.(args);
  }

  /** Fire `onSeatReconnected` with the given payload. */
  fireOnSeatReconnected(args: {
    matchId: MatchId;
    connectionId: ConnectionId;
    sessionToken: SessionToken;
  }): void {
    this.handlers.onSeatReconnected?.(args);
  }

  /** Fire `onSeatExpired` with the given payload. */
  fireOnSeatExpired(args: {
    matchId: MatchId;
    sessionToken: SessionToken;
    playerId: 1 | 2 | 3 | 4 | null;
  }): void {
    this.handlers.onSeatExpired?.(args);
  }

  /** Fire `onMatchTerminal` with the given payload. */
  fireOnMatchTerminal(args: { matchId: MatchId; result: MatchResult; tick: number }): void {
    this.handlers.onMatchTerminal?.(args);
  }

  // -- Unused-injection accessors ------------------------------------------------

  /** Injected id factory (exposed for fixture symmetry/debugging). */
  get randomId(): () => string {
    return this.randomIdFn;
  }

  /** Injected clock (exposed for fixture symmetry/debugging). */
  get now(): () => number {
    return this.nowFn;
  }
}
