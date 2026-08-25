/**
 * The matchmaker — Feature 006 (T028)
 *
 * Implements the `Matchmaker` factory from
 * `contracts/matchmaking-api.ts`: `createMatch` + `joinMatch` with the
 * atomic auto-start path (US1), the synchronous public-lobby
 * projection (US2 surface, wired here because Q-M01 exercises it),
 * stats, and graceful close. Rematch (US4) and forfeit (US5) are
 * wired; Phase 8 adds the lazy empty-match GC sweep (FR-011); review
 * remediation adds the results-TTL sweep for finished matches (FR-011
 * second clause).
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

import type { MatchResult } from '@europa/engine';
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
    MatchId,
    MatchmakerError,
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
import { handleSeatExpired } from './forfeit';
import { newMatchSeed } from './idGen';
import type { MatchRecord } from './internal/matchRecord';
import { createPlayerSession } from './internal/playerSession';
import { listPublicMatches as projectLobby } from './lobby';
import {
    addSeatToFillingMatch,
    createMatchRecordWithCreator,
    createRematchMatchRecord,
    createStatusBus,
    toPlayerId,
    transitionFillingToRunning,
    transitionRunningToFinished,
    transitionToCollected,
} from './matchLifecycle';
import {
    castAcceptVote,
    castDeclineVote,
    classifyVoterEligibility,
    isWindowClosed,
    openRematchWindow,
} from './rematch';
import { buildMatchResultsRecord } from './results';
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
function resolveSettings(partial: CreateMatchRequest['settings'], boardSizeDefault: number): MatchSettings | null {
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
 * for the full contract doc and example). No timers are started:
 * all lazy sweeps (rematch-window expiry FR-009; results-TTL and
 * empty-match GC FR-011) run on read paths with the injected clock —
 * real scheduling belongs to the host integration wave.
 *
 * @param config - Matchmaker-wide configuration; omitted knobs fall
 *   back to `MATCHMAKING_CONSTANTS`.
 * @param deps - Required `server`; optional `logger`, `randomId`,
 *   `rngFactory`, `now` (deterministic overrides for tests).
 * @returns The matchmaker instance.
 */
export function createMatchmaker(config: MatchmakerConfig, deps: MatchmakerDeps): Matchmaker {
    const resolved = resolveConfig(config);
    const { server } = deps;
    const logger = deps.logger ?? NULL_LOGGER;
    const randomId = deps.randomId ?? (() => randomUUID());
    const rngFactory = deps.rngFactory ?? createRng;
    const now = deps.now ?? Date.now;

    const store: MatchmakerStore = createStore();
    const bus: StatusEventBus = createStatusBus();
    const constructedAtMs = now();

    let closed = false;
    let totalCreated = 0;
    let totalFinished = 0; // US4 terminal handler
    let totalCollected = 0; // decline / expiry sweep / all-accept / forfeit teardown
    let totalRematchAccepted = 0; // accept votes cast (US4)
    let totalRematchDeclined = 0; // decline votes cast (US4)
    let totalForfeits = 0; // seats forfeited via onSeatExpired (US5)

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
        /**
         * No matchmaking state changes on a seat claim — networking owns
         * connection lifecycle. Kept as an explicit hook for future waves.
         */
        onSeatClaimed: () => {},
        /**
         * Intentionally a no-op: the reconnect grace window lives entirely
         * in networking (its own seat records time the disconnect). The
         * matchmaker learns of trouble only when networking reports the
         * grace expiry via {@linkcode bridgeHandlers.onSeatExpired}.
         */
        onSeatDisconnected: () => {},
        /**
         * Intentionally a no-op: a reconnect cancels the grace timer
         * inside networking, so there is nothing for the matchmaker to
         * undo (no pending forfeit state exists on this side).
         */
        onSeatReconnected: () => {},
        /**
         * Applies the forfeit policy (US5 / FR-010) via `forfeit.ts`
         * (T058/T059). Boundary rule 4: networking only reports the
         * expiry; the matchmaker decides the forfeit. Engine-level
         * forfeits (`surrendered` / `torn_down`) bump `totalForfeits`;
         * filling-phase inline releases do not.
         */
        onSeatExpired: (event) => {
            const result = handleSeatExpired(event, { store, server, logger, emit: bus.emit }, now());
            if (result === null) {
                return;
            }
            if (result.outcome === 'released') {
                return;
            }
            totalForfeits += 1;
            if (result.outcome === 'torn_down') {
                totalCollected += 1;
            }
        },
        /** Records results + transitions running → finished (US4 / FR-008). */
        onMatchTerminal: handleMatchTerminal,
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
     * doc for the exact call order. Rematch-created matches carry a
     * pre-minted `initialSeed` (FR-009); normal creates mint theirs
     * here — both store it back on the record so a match has exactly
     * one seed for its lifetime.
     */
    function autoStart(match: MatchRecord): void {
        const seed = match.initialSeed ?? newMatchSeed();
        match.initialSeed = seed;
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

    /**
     * The FR-006 single existence code path, shared by every operation
     * that takes a `matchId`: an unknown id yields this exact non-leaking
     * failure payload — never a throw, and a message that mentions
     * neither privacy nor existence (`research.md` §2). Callers check
     * `store.getMatch(...)` first and return this when it misses.
     */
    function notFoundResult(): { readonly ok: false; readonly error: MatchmakerError } {
        return { ok: false, error: makeError('match_not_found') };
    }

    /**
     * Find the seat bound to a session token within one match, or
     * `undefined` when the token matches nothing (the caller decides
     * which non-leaking error that becomes).
     */
    function findSeatByToken(match: MatchRecord, token: SessionToken) {
        for (const seat of match.seats.values()) {
            // Plain `===` is fine here (documented accepted risk, mirroring
            // networking's ids.ts): tokens are 122-bit CSPRNG v4 outputs, so
            // a timing oracle leaks nothing an attacker doesn't already hold.
            if (seat.sessionToken === token) {
                return seat;
            }
        }
        return undefined;
    }

    /**
     * The US4 terminal handler (FR-008): transition `running → finished`
     * and store the engine-reported result as the match's
     * `MatchResultsRecord`. The rematch window itself opens lazily on
     * the first `requestRematch`, but its deadline is anchored at this
     * transition's `finishedAtMs` (T047).
     */
    function handleMatchTerminal(event: { matchId: MatchId; result: MatchResult; tick: number }): void {
        const match = store.getMatch(event.matchId);
        if (match === undefined || match.status !== 'running' || match.engineSession === null) {
            // Defensive: terminal events only make sense for running matches.
            logger.warn('matchmaker: ignoring onMatchTerminal for non-running match', {
                matchId: event.matchId,
            });
            return;
        }
        const results = buildMatchResultsRecord({
            matchId: event.matchId,
            world: match.engineSession.world(),
            result: event.result,
            seats: match.seats,
        });
        transitionRunningToFinished(match, results, now(), bus.emit);
        totalFinished += 1;
        logger.info('matchmaker: match finished', { matchId: event.matchId });
    }

    /**
     * Lazy expiry sweep (FR-009 + dispatch ruling 1): collect every
     * `finished` match whose open rematch window lapsed unresolved.
     * Invoked from read paths (`stats`, `listPublicMatches`) with the
     * injected clock — NO timers inside matchmaking logic; real
     * scheduling belongs to the host integration wave. Mutators handle
     * their own inline window checks so they can still return
     * `rematch_window_closed` before a sweep would erase the offer.
     *
     * @param atMs - Current injected-clock reading.
     * @returns How many matches were collected by this sweep.
     */
    function sweepExpiredRematches(atMs: number): number {
        let swept = 0;
        for (const m of store.listMatches()) {
            const offer = m.rematch;
            if (m.status === 'finished' && offer !== null && isWindowClosed(offer, atMs)) {
                transitionToCollected(m, atMs, bus.emit);
                totalCollected += 1;
                swept += 1;
                logger.info('matchmaker: rematch window expired; match collected', {
                    matchId: m.matchId,
                });
            }
        }
        return swept;
    }

    /**
     * Lazy empty-match GC sweep (FR-011 + Q-M06): collect every
     * `'filling'` match idle past `emptyMatchTtlMs` — "empty" here means
     * *unstarted* (no engine session), matching the executable quickstart
     * scenario where a creator-seated match that never fills is GC'd.
     * Before collecting, each seated player's ephemeral session is
     * deleted from the store: a session bound to a collected match is
     * unreachable garbage (joins always mint fresh sessions), and SC-005's
     * no-leak invariant requires actual removal, not just unbinding.
     *
     * Invoked from read paths (`stats`, `listPublicMatches`) with the
     * injected clock — NO timers inside matchmaking logic (same lazy,
     * check-on-access pattern as {@linkcode sweepExpiredRematches}).
     *
     * @param atMs - Current injected-clock reading.
     * @returns How many matches were collected by this sweep.
     */
    function sweepStaleEmptyMatches(atMs: number): number {
        let swept = 0;
        for (const m of store.listMatches()) {
            if (m.status !== 'filling') {
                continue;
            }
            if (atMs - m.lastActivityAtMs < resolved.emptyMatchTtlMs) {
                continue;
            }
            // Release seated players' sessions before collecting: the seats
            // die with the match. The identity guard skips any session that
            // has already moved on to a different match (defensive; cannot
            // happen while the seat holds the only binding).
            for (const seat of m.seats.values()) {
                const session = store.getSession(seat.playerSessionId);
                if (session !== undefined && session.currentMatchId === m.matchId) {
                    store.deleteSession(seat.playerSessionId);
                }
            }
            transitionToCollected(m, atMs, bus.emit);
            totalCollected += 1;
            swept += 1;
            logger.info('matchmaker: empty-match TTL elapsed; match collected', {
                matchId: m.matchId,
            });
        }
        return swept;
    }

    /**
     * Lazy results-TTL sweep (FR-011 second clause, data-model §4):
     * collect every `finished` match whose `resultsTtlMs` grace period
     * has elapsed since `finishedAtMs` — regardless of whether a rematch
     * offer is attached. This is the no-leak backstop for matches that
     * finished with NO `requestRematch`: without it they would stay
     * `'finished'` forever and each would hold a slot against
     * `maxConcurrentMatches` until restart. Before collecting, each
     * seated player's ephemeral session is deleted (same discipline as
     * {@linkcode sweepStaleEmptyMatches}: identity-guarded, actual
     * removal per SC-005).
     *
     * Runs AFTER {@linkcode sweepExpiredRematches} so an open rematch
     * window that lapses unresolved is resolved by the more specific
     * sweep first; by then this sweep's TTL condition is equally true
     * (both anchor at `finishedAtMs`, default TTLs coincide), so
     * behavior for offered matches is unchanged.
     *
     * Invoked from read paths with the injected clock — NO timers inside
     * matchmaking logic (same lazy pattern as the sibling sweeps).
     *
     * @param atMs - Current injected-clock reading.
     * @returns How many matches were collected by this sweep.
     */
    function sweepFinishedResultsTtl(atMs: number): number {
        let swept = 0;
        for (const m of store.listMatches()) {
            if (m.status !== 'finished' || m.finishedAtMs === null) {
                continue;
            }
            if (atMs - m.finishedAtMs < resolved.resultsTtlMs) {
                continue;
            }
            // Release participants' sessions before collecting: the seats
            // die with the match. The identity guard skips any session that
            // has already moved on to a different match (defensive).
            for (const seat of m.seats.values()) {
                const session = store.getSession(seat.playerSessionId);
                if (session !== undefined && session.currentMatchId === m.matchId) {
                    store.deleteSession(seat.playerSessionId);
                }
            }
            transitionToCollected(m, atMs, bus.emit);
            totalCollected += 1;
            swept += 1;
            logger.info('matchmaker: results TTL elapsed; match collected', {
                matchId: m.matchId,
            });
        }
        return swept;
    }

    /**
     * Run all lazy sweeps against one clock reading. The single place
     * read paths hook into GC so ordering stays fixed: rematch-window
     * expiry first (it may resolve offers on matches the other sweeps
     * would never touch), then results-TTL collection, then empty-match
     * collection.
     */
    function runLazySweeps(): void {
        const atMs = now();
        sweepExpiredRematches(atMs);
        sweepFinishedResultsTtl(atMs);
        sweepStaleEmptyMatches(atMs);
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
                    // Plain `===` is fine here (documented accepted risk, as in
                    // `findSeatByToken`): 122-bit CSPRNG v4 tokens make a timing
                    // oracle worthless.
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

        leaveMatch(req: LeaveMatchRequest): LeaveMatchResult {
            assertOpen();
            // Single existence code path (FR-006 + Q2; research.md §2): an
            // unknown MatchId gets the same non-leaking `match_not_found`
            // RESULT as every other operation — checked BEFORE the wave gate
            // below so the no-leak invariant holds uniformly across the whole
            // surface, stubbed or not.
            if (store.getMatch(req.matchId) === undefined) {
                return notFoundResult();
            }
            // US3 AC-3 (seat release) lands with the lifecycle-completion wave;
            // calling it before then is an invariant violation, not an expected
            // failure — so it throws rather than returning an error result.
            throw new Error('matchmaker: leaveMatch is not implemented until the US3+ wave');
        },

        listPublicMatches(): ListPublicMatchesResult {
            assertOpen();
            // Read paths drive the lazy sweeps (no timers): rematch-window
            // expiry + empty-match GC (FR-009 / FR-011).
            runLazySweeps();
            const entries: readonly LobbyEntry[] = projectLobby(store.listMatches(), now());
            return { ok: true, matches: entries };
        },

        requestRematch(req: RequestRematchRequest): RequestRematchResult {
            assertOpen();
            // Single existence code path (FR-006 + Q2), as in `leaveMatch`.
            const match = store.getMatch(req.matchId);
            if (match === undefined) {
                return notFoundResult();
            }
            // US4 AC-1: only a finished match carries a rematch offer.
            if (match.status !== 'finished') {
                return { ok: false, error: makeError('rematch_not_offered') };
            }
            const seat = findSeatByToken(match, req.sessionToken);
            if (seat === undefined) {
                return { ok: false, error: makeError('session_invalid') };
            }

            const existing = match.rematch;
            if (existing !== null) {
                // Contract idempotency: an unvoted repeat request returns the
                // existing offer; a voted one is rejected (rematch_already_voted).
                const eligibility = classifyVoterEligibility(existing, seat.playerSessionId);
                if (eligibility === 'already_voted') {
                    return { ok: false, error: makeError('rematch_already_voted') };
                }
                if (isWindowClosed(existing, now())) {
                    return { ok: false, error: makeError('rematch_window_closed') };
                }
                return { ok: true, rematchOfferId: existing.offerId };
            }

            // First request opens the window; the deadline anchors at the
            // finish time (T047), so a late first caller can still find the
            // window already closed.
            const offer = openRematchWindow(match, randomId() as MatchId, now(), resolved.rematchWindowMs);
            if (isWindowClosed(offer, now())) {
                return { ok: false, error: makeError('rematch_window_closed') };
            }
            match.rematch = offer;
            logger.info('matchmaker: rematch window opened', { matchId: req.matchId });
            return { ok: true, rematchOfferId: offer.offerId };
        },

        acceptRematch(req: AcceptRematchRequest): AcceptRematchResult {
            assertOpen();
            // Single existence code path (FR-006 + Q2), as in `leaveMatch`.
            const match = store.getMatch(req.matchId);
            if (match === undefined) {
                return notFoundResult();
            }
            // A swept/collected or running match offers nothing to accept.
            if (match.status !== 'finished') {
                return { ok: false, error: makeError('rematch_not_offered') };
            }
            const offer = match.rematch;
            if (offer === null || req.rematchOfferId !== offer.offerId) {
                return { ok: false, error: makeError('rematch_not_offered') };
            }
            const seat = findSeatByToken(match, req.sessionToken);
            if (seat === undefined) {
                return { ok: false, error: makeError('session_invalid') };
            }
            // T053 — forfeited-participant exclusion (spec edge case "What
            // happens when a rematch participant has left?"): a forfeited
            // seat's holder, or one whose session was GC'd, cannot vote.
            if (seat.forfeitedAtMs !== null || store.getSession(seat.playerSessionId) === undefined) {
                return { ok: false, error: makeError('session_invalid') };
            }
            const voterId = seat.playerSessionId;
            const eligibility = classifyVoterEligibility(offer, voterId);
            if (eligibility === 'not_in_match') {
                return { ok: false, error: makeError('player_not_in_match') };
            }
            if (eligibility === 'already_voted') {
                return { ok: false, error: makeError('rematch_already_voted') };
            }
            if (isWindowClosed(offer, now())) {
                return { ok: false, error: makeError('rematch_window_closed') };
            }

            const { allAccepted } = castAcceptVote(offer, voterId);
            totalRematchAccepted += 1;
            if (!allAccepted) {
                return { ok: true, allAccepted: false };
            }

            // US4 AC-2 resolution: every original participant accepted.
            // Create the new match via the shared record factory (PM ruling
            // 2): same visibility + settings, fresh MatchId + seed + tokens,
            // participants auto-seated at their prior seatIndex. The new
            // match stays in `filling` until its players reconnect (Q-M05);
            // auto-start ownership belongs to the host integration wave.
            const participants = [...match.seats.values()]
                .sort((a, b) => a.seatIndex - b.seatIndex)
                .map((s) => {
                    const session = store.getSession(s.playerSessionId);
                    if (session === undefined) {
                        throw new Error(
                            `matchmaker: original session ${s.playerSessionId} missing at rematch resolution`,
                        );
                    }
                    return { session, seatIndex: s.seatIndex };
                });
            const atMs = now();
            const { match: newMatch, seats: newSeats } = createRematchMatchRecord({
                original: match,
                participants,
                nowMs: atMs,
                randomId,
            });
            store.putMatch(newMatch);
            totalCreated += 1;
            bus.emit({ matchId: newMatch.matchId, from: null, to: 'filling', atMs });

            offer.newMatchRecord = newMatch;

            // The original match is resolved → collected (data-model §4:
            // finished → collected on "rematch resolved").
            transitionToCollected(match, atMs, bus.emit);
            totalCollected += 1;

            // The completing voter receives their fresh seat assignment.
            const callerSeat = newSeats.find((s) => s.seatIndex === seat.seatIndex);
            if (callerSeat === undefined) {
                throw new Error('matchmaker: caller seat missing in rematch match');
            }
            logger.info('matchmaker: rematch accepted; new match created', {
                matchId: req.matchId,
                newMatchId: newMatch.matchId,
            });
            return {
                ok: true,
                allAccepted: true,
                newMatchId: newMatch.matchId,
                newSeatAssignment: seatAssignmentFor(
                    callerSeat.seatIndex,
                    callerSeat.playerSessionId,
                    callerSeat.sessionToken as SessionToken,
                    callerSeat.displayName,
                ),
            };
        },

        declineRematch(req: DeclineRematchRequest): DeclineRematchResult {
            assertOpen();
            // Single existence code path (FR-006 + Q2), as in `leaveMatch`.
            const match = store.getMatch(req.matchId);
            if (match === undefined) {
                return notFoundResult();
            }
            if (match.status !== 'finished') {
                return { ok: false, error: makeError('rematch_not_offered') };
            }
            const offer = match.rematch;
            if (offer === null || req.rematchOfferId !== offer.offerId) {
                return { ok: false, error: makeError('rematch_not_offered') };
            }
            const seat = findSeatByToken(match, req.sessionToken);
            if (seat === undefined) {
                return { ok: false, error: makeError('session_invalid') };
            }
            if (seat.forfeitedAtMs !== null || store.getSession(seat.playerSessionId) === undefined) {
                return { ok: false, error: makeError('session_invalid') };
            }
            const voterId = seat.playerSessionId;
            const eligibility = classifyVoterEligibility(offer, voterId);
            if (eligibility === 'not_in_match') {
                return { ok: false, error: makeError('player_not_in_match') };
            }
            if (eligibility === 'already_voted') {
                return { ok: false, error: makeError('rematch_already_voted') };
            }
            if (isWindowClosed(offer, now())) {
                return { ok: false, error: makeError('rematch_window_closed') };
            }

            castDeclineVote(offer, voterId);
            totalRematchDeclined += 1;
            // Any decline resolves the offer immediately (US4 AC-2): the
            // original match transitions to collected; no new match.
            transitionToCollected(match, now(), bus.emit);
            totalCollected += 1;
            logger.info('matchmaker: rematch declined; match collected', {
                matchId: req.matchId,
            });
            return { ok: true };
        },

        stats(): MatchmakerStats {
            // Read paths drive the lazy sweeps (no timers): rematch-window
            // expiry + empty-match GC (FR-009 / FR-011). No `assertOpen`
            // here: stats stays readable after close() (pre-existing
            // behavior pinned by earlier suites).
            runLazySweeps();
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
                        if (m.visibility === 'public') {
                            publicJoinable += 1;
                        }
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
                totalFinished,
                totalCollected,
                totalForfeits,
                totalRematchAccepted,
                totalRematchDeclined,
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
