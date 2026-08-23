/**
 * The matchmaker — Feature 006 (T028)
 *
 * Implements the `Matchmaker` factory from
 * `contracts/matchmaking-api.ts`: `createMatch` + `joinMatch` with the
 * atomic auto-start path (US1), the synchronous public-lobby
 * projection (US2 surface, wired here because Q-M01 exercises it),
 * stats, and graceful close. Rematch (US4) and forfeit (US5) methods
 * are documented throwing stubs until their waves land.
 *
 * Auto-start sequence on the last seat fill (FR-007, all inside one
 * synchronous critical section — single-threaded event loop makes it
 * atomic):
 *
 *   1. mint a fresh uint32 seed (`newMatchSeed`)
 *   2. build the frozen engine `MatchConfig`
 *   3. generate the board via terrain's real `generateBoard`
 *   4. construct the engine session (see `engineSession.ts` for the
 *      documented deviation from T028's `createMatchSession` prose)
 *   5. `server.registerMatch({ matchId, engineSession, matchConfig })`
 *   6. `server.attachPlayer({ matchId, playerId, sessionToken })` × N
 *   7. `server.enableSpectators(matchId)`
 *   8. transition `filling → running` (emits FR-012 event)
 *
 * Dependency policy: `@europa/networking` is type-only (the `Server`
 * arrives injected via deps); `@europa/engine` + `@europa/terrain`
 * are runtime imports confined to `engineSession.ts` and the board
 * generation below — they are declared workspace dependencies and
 * stay external in the bundle.
 */

import { randomUUID } from 'node:crypto';

import { createRng } from '@europa/engine';
import type { Logger, MatchmakerBridge, Server, SessionToken } from '@europa/networking';
import { DEFAULT_GENERATION_SETTINGS, generateBoard } from '@europa/terrain';

import type {
  CreateMatchRequest,
  CreateMatchResult,
  JoinMatchRequest,
  JoinMatchResult,
  ListPublicMatchesResult,
  LobbyEntry,
  MatchmakerStats,
  MatchSettings,
  SeatAssignedResult,
  SeatAssignment,
  SeatIndex,
} from '../contracts/match-types';
import { DEFAULT_MATCH_SETTINGS } from '../contracts/match-types';
import type {
  AcceptRematchRequest,
  AcceptRematchResult,
  DeclineRematchRequest,
  DeclineRematchResult,
  LeaveMatchRequest,
  LeaveMatchResult,
  Matchmaker,
  MatchmakerConfig,
  MatchmakerDeps,
  RequestRematchRequest,
  RequestRematchResult,
} from '../contracts/matchmaking-api';
import { MATCHMAKING_CONSTANTS } from './constants';
import { buildEngineSession, buildMatchConfig } from './engineSession';
import { makeError } from './errors';
import type { StatusEventBus } from './eventBus';
import { newMatchSeed } from './idGen';
import type { MatchRecord } from './internal/matchRecord';
import { createPlayerSession } from './internal/playerSession';
import { listPublicMatches as projectLobby } from './lobby';
import {
  addSeatToFillingMatch,
  createMatchRecordWithCreator,
  createStatusBus,
  toPlayerId,
  transitionFillingToRunning,
} from './matchLifecycle';
import type { MatchmakerStore } from './store';
import { createStore } from './store';

// ----------------------------------------------------------------------------
// Config resolution + small helpers
// ----------------------------------------------------------------------------

/** Fully-resolved config: every knob has a concrete number. */
interface ResolvedConfig {
  readonly publicBaseUrl: string | null;
  readonly emptyMatchTtlMs: number;
  readonly resultsTtlMs: number;
  readonly rematchWindowMs: number;
  readonly maxConcurrentMatches: number;
  readonly maxDisplayNameLength: number;
  readonly minDisplayNameLength: number;
  readonly sweepIntervalMs: number;
}

/**
 * Merge caller config over `MATCHMAKING_CONSTANTS`. Single location
 * where defaults bind (constitution Principle II / research §12).
 */
function resolveConfig(config: MatchmakerConfig): ResolvedConfig {
  return {
    publicBaseUrl: config.publicBaseUrl ?? null,
    emptyMatchTtlMs: config.emptyMatchTtlMs ?? MATCHMAKING_CONSTANTS.emptyMatchTtlMs,
    resultsTtlMs: config.resultsTtlMs ?? MATCHMAKING_CONSTANTS.resultsTtlMs,
    rematchWindowMs: config.rematchWindowMs ?? MATCHMAKING_CONSTANTS.rematchWindowMs,
    maxConcurrentMatches: config.maxConcurrentMatches ?? MATCHMAKING_CONSTANTS.maxConcurrentMatches,
    maxDisplayNameLength: config.maxDisplayNameLength ?? MATCHMAKING_CONSTANTS.maxDisplayNameLength,
    minDisplayNameLength: config.minDisplayNameLength ?? MATCHMAKING_CONSTANTS.minDisplayNameLength,
    sweepIntervalMs: config.sweepIntervalMs ?? MATCHMAKING_CONSTANTS.sweepIntervalMs,
  };
}

/** Local no-op logger — networking's `NULL_LOGGER` is a runtime value. */
const NULL_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Clamp a board size to the terrain generator's safe range [8, 128]. */
const MIN_BOARD_SIZE = 8;
const MAX_BOARD_SIZE = 128;

/**
 * Validate a display name against the configured bounds (FR-001).
 * Trims surrounding whitespace first; whitespace-only names are
 * rejected.
 *
 * @returns The trimmed name, or `null` when invalid.
 */
function validateDisplayName(name: string, min: number, max: number): string | null {
  const trimmed = name.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return null;
  }
  return trimmed;
}

/**
 * Merge partial player settings over `DEFAULT_MATCH_SETTINGS`
 * (contract: "missing fields merged with DEFAULT_MATCH_SETTINGS").
 * Board size is clamped to `[8, 128]` per `MatchSettings.boardSize`;
 * everything else out-of-contract is rejected.
 *
 * @returns Resolved settings, or `null` when a field is invalid.
 */
function resolveSettings(
  partial: CreateMatchRequest['settings'],
  boardSizeDefault: number,
): MatchSettings | null {
  const playerCount = partial?.playerCount ?? DEFAULT_MATCH_SETTINGS.playerCount;
  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) {
    return null;
  }

  const rawBoardSize = partial?.boardSize ?? boardSizeDefault;
  if (!Number.isFinite(rawBoardSize)) {
    return null;
  }
  const boardSize = Math.min(MAX_BOARD_SIZE, Math.max(MIN_BOARD_SIZE, Math.trunc(rawBoardSize)));

  const tickIntervalMs = partial?.tickIntervalMs ?? DEFAULT_MATCH_SETTINGS.tickIntervalMs;
  if (!Number.isInteger(tickIntervalMs) || tickIntervalMs <= 0) {
    return null;
  }

  const terrainSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    ...partial?.terrainSettings,
  };

  return {
    playerCount,
    boardSize,
    tickIntervalMs,
    terrainSettings,
  };
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

/**
 * Construct a `Matchmaker` instance (see `contracts/matchmaking-api.ts`
 * for the full contract doc and example). Timers are NOT started in
 * this wave: the empty-match sweep (FR-011) lands with Phase 8, so
 * `close()` only clears state.
 *
 * @param config - Matchmaker-wide configuration; omitted knobs fall
 *   back to `MATCHMAKING_CONSTANTS`.
 * @param deps - Required `server`; optional `logger`, `randomId`,
 *   `rngFactory`, `now` (deterministic overrides for tests).
 * @returns The matchmaker instance.
 */
export function createMatchmaker(config: MatchmakerConfig, deps: MatchmakerDeps): Matchmaker {
  const resolved = resolveConfig(config);
  const server = deps.server;
  const logger = deps.logger ?? NULL_LOGGER;
  const randomId = deps.randomId ?? (() => randomUUID());
  const rngFactory = deps.rngFactory ?? createRng;
  const now = deps.now ?? Date.now;

  const store: MatchmakerStore = createStore();
  const bus: StatusEventBus = createStatusBus();
  const constructedAtMs = now();

  let closed = false;
  let totalCreated = 0;

  /** Invariant guard: the matchmaker is unusable after `close()`. */
  function assertOpen(): void {
    if (closed) {
      throw new Error('matchmaker: instance is closed');
    }
  }

  // -- Bridge wiring ---------------------------------------------------------
  //
  // Per contracts/matchmaking-api.ts implementation note: the host wires
  // these handlers into networking's ServerDeps; when the server exposes
  // an optional `bindMatchmaker`, the matchmaker hands them over itself.
  // US1 implements no bridge behavior yet — each handler documents the
  // wave that fills it in.

  /** Handlers the matchmaker owns; networking invokes them. */
  const bridgeHandlers: MatchmakerBridge = {
    /** Wired with forfeit handling in Phase 7 (US5). */
    onSeatClaimed: () => {},
    /** Recorded for reconnect-grace bookkeeping in Phase 7 (US5). */
    onSeatDisconnected: () => {},
    /** Cancels pending forfeit state in Phase 7 (US5). */
    onSeatReconnected: () => {},
    /** Applies the forfeit policy in Phase 7 (US5 / FR-010). */
    onSeatExpired: () => {},
    /** Drives running → finished + rematch window in Phase 6 (US4). */
    onMatchTerminal: () => {},
  };

  /**
   * Servers that optionally accept direct bridge binding (structural
   * intersection — no cast; the real networking `Server` wires the
   * bridge via `ServerDeps` instead, per the contract note).
   */
  interface BindableServer {
    bindMatchmaker?(bridge: MatchmakerBridge): void;
  }
  const bindable = server as Server & BindableServer;
  if (typeof bindable.bindMatchmaker === 'function') {
    bindable.bindMatchmaker(bridgeHandlers);
  }

  // -- Internal operations ---------------------------------------------------

  /**
   * Build the public result payload for a seated player (contract:
   * provisional `playerId = seatIndex + 1` while filling).
   */
  function seatAssignmentFor(
    seatIndex: SeatIndex,
    playerSessionId: string,
    sessionToken: SessionToken,
    displayName: string,
  ): SeatAssignment {
    return Object.freeze({
      playerSessionId: playerSessionId as SeatAssignment['playerSessionId'],
      seatIndex,
      playerId: toPlayerId(seatIndex + 1),
      sessionToken,
      displayName,
    });
  }

  /**
   * Compose the shareable-link pair for a match (FR-003): the
   * relative `joinPath` always; the absolute `joinUrl` only when a
   * `publicBaseUrl` is configured.
   */
  function joinLinks(match: MatchRecord): { joinPath: string; joinUrl: string | null } {
    const base = resolved.publicBaseUrl;
    return {
      joinPath: match.joinPath,
      joinUrl: base === null ? null : `${base}${match.joinPath}`,
    };
  }

  /**
   * The US1 auto-start critical section (FR-007). Runs synchronously
   * inside `joinMatch` once the last seat is taken; see the module
   * doc for the exact call order.
   */
  function autoStart(match: MatchRecord): void {
    const seed = newMatchSeed();
    const engineConfig = buildMatchConfig(match.settings, seed);
    const rng = rngFactory(seed);

    const generation = generateBoard({
      boardSize: match.settings.boardSize,
      playerCount: match.settings.playerCount,
      seed,
      rng,
      settings: match.settings.terrainSettings,
    });
    logger.debug('matchmaker: board generated', {
      matchId: match.matchId,
      effectiveSeed: generation.effectiveSeed,
    });

    const engineSession = buildEngineSession(engineConfig, generation.board);

    server.registerMatch({ matchId: match.matchId, engineSession, matchConfig: engineConfig });

    // Attach in seat order so playerId n maps to seatIndex n - 1.
    for (let index = 0; index < match.settings.playerCount; index++) {
      const seat = match.seats.get(index as SeatIndex);
      if (seat === undefined) {
        throw new Error(`matchmaker: seat ${String(index)} missing at auto-start`);
      }
      server.attachPlayer({
        matchId: match.matchId,
        playerId: toPlayerId(index + 1),
        sessionToken: seat.sessionToken,
      });
    }

    server.enableSpectators(match.matchId);

    transitionFillingToRunning(match, engineSession, now(), bus.emit);
  }

  // -- Public surface --------------------------------------------------------

  const matchmaker: Matchmaker = {
    createMatch(req: CreateMatchRequest): CreateMatchResult {
      assertOpen();

      if (req.visibility !== 'public' && req.visibility !== 'private') {
        return { ok: false, error: makeError('invalid_request', 'Unknown visibility type') };
      }
      const displayName = validateDisplayName(
        req.displayName,
        resolved.minDisplayNameLength,
        resolved.maxDisplayNameLength,
      );
      if (displayName === null) {
        return {
          ok: false,
          error: makeError('invalid_request', 'displayName must be 1..32 characters'),
        };
      }
      const settings = resolveSettings(req.settings, DEFAULT_MATCH_SETTINGS.boardSize);
      if (settings === null) {
        return { ok: false, error: makeError('invalid_request', 'Invalid match settings') };
      }

      const activeMatches = store.listMatches().filter((m) => m.status !== 'collected').length;
      if (activeMatches >= resolved.maxConcurrentMatches) {
        return {
          ok: false,
          error: makeError('rate_limited', 'Server is at maximum concurrent matches'),
        };
      }

      const atMs = now();
      const session = createPlayerSession({ displayName, randomId, now });
      store.putSession(session);

      const { match } = createMatchRecordWithCreator({
        settings,
        visibility: req.visibility,
        creator: session,
        nowMs: atMs,
        randomId,
      });
      store.putMatch(match);
      totalCreated += 1;

      // Creation transition (created → filling) is observable too (FR-012).
      bus.emit({ matchId: match.matchId, from: null, to: 'filling', atMs });

      const links = joinLinks(match);
      const result: SeatAssignedResult = {
        matchId: match.matchId,
        joinPath: links.joinPath,
        joinUrl: links.joinUrl,
        seatAssignment: seatAssignmentFor(
          0 as SeatIndex,
          session.playerSessionId,
          session.currentSessionToken as SessionToken,
          displayName,
        ),
      };
      logger.info('matchmaker: match created', {
        matchId: match.matchId,
        visibility: req.visibility,
      });
      return { ok: true, data: result };
    },

    joinMatch(req: JoinMatchRequest): JoinMatchResult {
      assertOpen();

      const displayName = validateDisplayName(
        req.displayName,
        resolved.minDisplayNameLength,
        resolved.maxDisplayNameLength,
      );
      if (displayName === null) {
        return {
          ok: false,
          error: makeError('invalid_request', 'displayName must be 1..32 characters'),
        };
      }

      // Single existence code path (FR-006): unknown id AND private-
      // without-token both land here; message never leaks existence.
      const match = store.getMatch(req.matchId);
      if (match === undefined) {
        return { ok: false, error: makeError('match_not_found') };
      }

      // Reconnect slice (full reclaim flows land with US5): validate
      // the token against this match's seats. Unknown token → the same
      // non-leaking `match_not_found`; known token → the seat is bound.
      if (req.reconnectToken !== undefined) {
        for (const seat of match.seats.values()) {
          if (seat.sessionToken === req.reconnectToken) {
            return { ok: false, error: makeError('seat_taken') };
          }
        }
        return { ok: false, error: makeError('match_not_found') };
      }

      // Free-seat check FIRST (spec edge case + Q-M07): a joiner that
      // loses the race for the last seat gets `match_full`, even though
      // the winner's fill already moved the match to `running`.
      let freeSeat: SeatIndex | null = null;
      for (let index = 0 as SeatIndex; index < match.settings.playerCount; index++) {
        if (!match.seats.has(index)) {
          freeSeat = index;
          break;
        }
      }
      if (freeSeat === null) {
        return { ok: false, error: makeError('match_full') };
      }
      if (match.status !== 'filling') {
        // Defensive: unreachable in v1 (matches start only when full and
        // running matches never release seats), kept for contract parity.
        return { ok: false, error: makeError('match_not_joinable') };
      }

      const atMs = now();
      const session = createPlayerSession({ displayName, randomId, now });
      store.putSession(session);

      addSeatToFillingMatch(match, session, freeSeat, atMs);

      const started = match.seats.size >= match.settings.playerCount;
      if (started) {
        autoStart(match);
      }

      const links = joinLinks(match);
      const result: SeatAssignedResult = {
        matchId: match.matchId,
        joinPath: links.joinPath,
        joinUrl: links.joinUrl,
        seatAssignment: seatAssignmentFor(
          freeSeat,
          session.playerSessionId,
          session.currentSessionToken as SessionToken,
          displayName,
        ),
      };
      logger.info(started ? 'matchmaker: match started' : 'matchmaker: seat filled', {
        matchId: match.matchId,
        seatsFilled: match.seats.size,
      });
      return { ok: true, data: result };
    },

    leaveMatch(_req: LeaveMatchRequest): LeaveMatchResult {
      // US1 AC-3 (seat release) lands with the lifecycle-completion wave;
      // calling it before then is an invariant violation, not an expected
      // failure — so it throws rather than returning an error result.
      throw new Error('matchmaker: leaveMatch is not implemented until the US3+ wave');
    },

    listPublicMatches(): ListPublicMatchesResult {
      assertOpen();
      const entries: ReadonlyArray<LobbyEntry> = projectLobby(store.listMatches(), now());
      return { ok: true, matches: entries };
    },

    requestRematch(_req: RequestRematchRequest): RequestRematchResult {
      // Phase 6 (US4 / FR-009).
      throw new Error('matchmaker: requestRematch is not implemented until the US4 wave');
    },

    acceptRematch(_req: AcceptRematchRequest): AcceptRematchResult {
      // Phase 6 (US4 / FR-009).
      throw new Error('matchmaker: acceptRematch is not implemented until the US4 wave');
    },

    declineRematch(_req: DeclineRematchRequest): DeclineRematchResult {
      // Phase 6 (US4 / FR-009).
      throw new Error('matchmaker: declineRematch is not implemented until the US4 wave');
    },

    stats(): MatchmakerStats {
      const matches = store.listMatches();
      const sessions = store.listSessions();
      let filling = 0;
      let running = 0;
      let finished = 0;
      let collected = 0;
      let publicJoinable = 0;
      for (const m of matches) {
        switch (m.status) {
          case 'filling':
            filling += 1;
            if (m.visibility === 'public') publicJoinable += 1;
            break;
          case 'running':
            running += 1;
            break;
          case 'finished':
            finished += 1;
            break;
          case 'collected':
            collected += 1;
            break;
        }
      }
      return Object.freeze({
        activeMatches: filling + running + finished,
        fillingMatches: filling,
        runningMatches: running,
        finishedMatches: finished,
        collectedMatches: collected,
        publicJoinableMatches: publicJoinable,
        activePlayerSessions: sessions.filter((s) => s.currentMatchId !== null).length,
        totalCreated,
        totalFinished: 0, // incremented by the US4 terminal handler
        totalCollected: 0, // incremented by the sweep/teardown wave
        totalForfeits: 0, // incremented by the US5 forfeit handler
        totalRematchAccepted: 0, // US4
        totalRematchDeclined: 0, // US4
        uptimeMs: now() - constructedAtMs,
      });
    },

    close(): Promise<void> {
      closed = true;
      for (const m of store.listMatches()) {
        store.deleteMatch(m.matchId);
      }
      for (const s of store.listSessions()) {
        store.deleteSession(s.playerSessionId);
      }
      return Promise.resolve();
    },
  };

  return matchmaker;
}
