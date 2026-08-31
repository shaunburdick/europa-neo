/**
 * Match lifecycle state machine — Feature 006 (T026 + T027)
 *
 * The pure transition layer over `MatchRecord` per data-model.md §4:
 *
 *   (create) → filling → running → finished → collected
 *
 * Transitions are the ONLY code allowed to mutate a record's status.
 * Each one validates the current state (illegal transitions are
 * invariant violations and throw — correctness over availability,
 * mirroring the error strategy in `errors.ts`), applies its fields,
 * stamps caller-supplied timestamps, and emits a `MatchStatusChanged`
 * event through an optional emitter (FR-012; the matchmaker passes
 * its internal bus's `emit`).
 *
 * The create/fill path (`createMatchRecordWithCreator`,
 * `addSeatToFillingMatch`) builds records in the `'filling'` state
 * and appends seats append-only: existing `SeatRecord`s are never
 * touched after insertion.
 *
 * Feature 010 (T-006, spec FR-019): every seat-creation site copies
 * the seated session's authoritative `guestPlayerId` association and
 * accepted-handle snapshot into the new `SeatRecord`, so identity and
 * handle follow players through filling → running → finished →
 * collected, reconnect grace, forfeit, and rematch transitions.
 * {@linkcode propagateHandleRename} sweeps an accepted-handle rename
 * across a guest's in-flight records (US1 AC-4); subsequent matches
 * pick the fresh handle up automatically via the same snapshot copy.
 * The identity id is non-secret correlation metadata and may be included on
 * safe public or diagnostic surfaces; it does not grant authority. Handles
 * remain preferred labels, while session/reconnect tokens stay protected.
 *
 * Records are mutated in place and returned for fluent use — the
 * store holds live references, so there is exactly one copy of the
 * truth (constitution Principle V). Timestamps and ids always arrive
 * via arguments or injected factories; nothing here reads a clock or
 * CSPRNG except seat-token minting, which uses the same sanctioned
 * boundary as `idGen.ts` (identity artifacts, not simulation inputs).
 */

import type { EngineSession, MatchId } from '@europa/networking';
import type { MatchResultsRecord, MatchSettings, MatchVisibility, PlayerId, SeatIndex } from '../contracts/match-types';
import type { GuestPlayerId } from './contracts/lobby-types';
import type { MatchStatusChangedEvent } from './eventBus';
import { createStatusBus } from './eventBus';
import { newMatchSeed } from './idGen';
import type { MatchRecord } from './internal/matchRecord';
import { createMatchRecord } from './internal/matchRecord';
import type { PlayerSession } from './internal/playerSession';
import type { SeatRecord } from './internal/seatRecord';
import { createSeatRecord } from './internal/seatRecord';
import { newSessionToken } from './sessionToken';
import type { MatchmakerStore } from './store';

/** Optional event sink handed to transitions by the matchmaker/tests. */
export type StatusEmitter = (event: MatchStatusChangedEvent) => void;

export type { MatchStatusChangedEvent } from './eventBus';
// Re-exported so lifecycle consumers (and tests) have one import site.
export { createStatusBus };

/**
 * Narrow a seat-derived number into the engine's `PlayerId` union
 * without a blind cast. Seat order maps 1:1 to player ids in v1
 * (`playerId = seatIndex + 1`); anything outside 1..4 is a caller bug.
 *
 * Shared with `matchmaker.ts` so the guard exists exactly once.
 */
export function toPlayerId(value: number): PlayerId {
    if (value === 1 || value === 2 || value === 3 || value === 4) {
        return value;
    }
    throw new Error(`matchLifecycle: computed playerId ${String(value)} is outside 1..4`);
}

/**
 * Emit a transition event when an emitter was supplied. Keeps every
 * transition body free of `if (emit)` noise.
 */
function notify(
    emit: StatusEmitter | undefined,
    matchId: MatchId,
    from: MatchRecord['status'] | null,
    to: MatchRecord['status'],
    atMs: number,
): void {
    if (emit === undefined) {
        return;
    }
    emit({ matchId, from, to, atMs });
}

// ----------------------------------------------------------------------------
// Create/fill path (T027)
// ----------------------------------------------------------------------------

/** Arguments for {@linkcode createMatchRecordWithCreator}. */
export interface CreateMatchRecordWithCreatorArgs {
    /** Validated, defaults-applied settings (FR-002). */
    readonly settings: MatchSettings;
    /** Lobby visibility; fixed for the match's lifetime (FR-002). */
    readonly visibility: MatchVisibility;
    /** The creator's freshly created player session. */
    readonly creator: PlayerSession;
    /** Epoch ms of creation. */
    readonly nowMs: number;
    /** Injected UUID v4 generator for the match id (deterministic in tests). */
    readonly randomId: () => string;
}

/**
 * Create a match record in the `'filling'` state with the creator
 * seated in slot 0 (FR-002 + FR-004: the creator's seat is reserved
 * immediately). Mints the creator's session token on the sanctioned
 * CSPRNG boundary and binds their session to the match/seat/token.
 *
 * @param args - Settings, visibility, creator session, clock, ids.
 * @returns The stored-shape record plus the creator's `SeatRecord`.
 */
export function createMatchRecordWithCreator(args: CreateMatchRecordWithCreatorArgs): {
    match: MatchRecord;
    creatorSeat: SeatRecord;
} {
    const { creator, nowMs, randomId, settings, visibility } = args;
    const match = createMatchRecord({
        matchId: randomId() as MatchId,
        visibility,
        settings,
        createdAtMs: nowMs,
    });

    const sessionToken = newSessionToken();
    const creatorSeat = createSeatRecord({
        seatIndex: 0 as SeatIndex,
        playerSessionId: creator.playerSessionId,
        // Feature 010 FR-019: the authoritative identity association and
        // accepted-handle snapshot follow the creator into their seat.
        guestPlayerId: creator.guestPlayerId,
        handle: creator.acceptedHandle,
        displayName: creator.displayName,
        sessionToken,
        playerId: null, // finalized at the filling → running transition
        connectedAtMs: nowMs,
    });
    match.seats.set(creatorSeat.seatIndex, creatorSeat);

    // Bind the creator's ephemeral session to this seat.
    creator.currentMatchId = match.matchId;
    creator.currentSeatIndex = creatorSeat.seatIndex;
    creator.currentSessionToken = sessionToken;

    return { match, creatorSeat };
}

/**
 * Append a joiner to a `'filling'` match's next free seat (FR-004).
 * Mints the joiner's session token, inserts the `SeatRecord`
 * (append-only: existing seats are untouched), refreshes the match's
 * activity timestamp, and binds the joiner's session.
 *
 * @param match - The filling match (must have `seatIndex` free).
 * @param joiner - The joiner's freshly created player session.
 * @param seatIndex - The free seat assigned by the caller.
 * @param nowMs - Epoch ms of the join (drives `lastActivityAtMs`).
 * @returns The same record (mutated) plus the new `SeatRecord`.
 */
export function addSeatToFillingMatch(
    match: MatchRecord,
    joiner: PlayerSession,
    seatIndex: SeatIndex,
    nowMs: number,
): { match: MatchRecord; seat: SeatRecord } {
    const sessionToken = newSessionToken();
    const seat = createSeatRecord({
        seatIndex,
        playerSessionId: joiner.playerSessionId,
        // Feature 010 FR-019: the joiner's identity association and
        // accepted-handle snapshot follow them into their seat.
        guestPlayerId: joiner.guestPlayerId,
        handle: joiner.acceptedHandle,
        displayName: joiner.displayName,
        sessionToken,
        playerId: null, // finalized at the filling → running transition
        connectedAtMs: nowMs,
    });
    match.seats.set(seatIndex, seat);
    match.lastActivityAtMs = nowMs;

    joiner.currentMatchId = match.matchId;
    joiner.currentSeatIndex = seatIndex;
    joiner.currentSessionToken = sessionToken;

    return { match, seat };
}

// ----------------------------------------------------------------------------
// Lifecycle transitions (T026)
// ----------------------------------------------------------------------------

/**
 * Atomically transition `filling → running` (FR-007): stores the
 * engine session, stamps the start time, finalizes every seat's
 * `playerId` (`seatIndex + 1`, matching the provisional values
 * already published via `SeatAssignment`), and emits the
 * `MatchStatusChanged` event.
 *
 * @param match - A match currently in the `'filling'` state.
 * @param engineSession - The constructed engine session handle.
 * @param startedAtMs - Epoch ms of the transition.
 * @param emit - Optional event sink (FR-012).
 * @returns The same record, now `'running'`.
 * @throws When the match is not `'filling'` (illegal transition).
 */
export function transitionFillingToRunning(
    match: MatchRecord,
    engineSession: EngineSession,
    startedAtMs: number,
    emit?: StatusEmitter,
): MatchRecord {
    if (match.status !== 'filling') {
        throw new Error(`matchLifecycle: illegal transition ${match.status} → running for match ${match.matchId}`);
    }

    for (const seat of match.seats.values()) {
        seat.playerId = toPlayerId(seat.seatIndex + 1);
    }
    match.engineSession = engineSession;
    match.startedAtMs = startedAtMs;
    match.status = 'running';
    match.lastActivityAtMs = startedAtMs;

    notify(emit, match.matchId, 'filling', 'running', startedAtMs);
    return match;
}

/**
 * Atomically transition `running → finished`: stores the terminal
 * results record, stamps the finish time, clears any rematch offer
 * (the window opens later, US4), and emits the transition event.
 *
 * @param match - A match currently in the `'running'` state.
 * @param results - The terminal results record (data-model §10).
 * @param finishedAtMs - Epoch ms of the transition.
 * @param emit - Optional event sink (FR-012).
 * @returns The same record, now `'finished'`.
 * @throws When the match is not `'running'` (e.g., skipping the
 *   running state entirely — data-model §4 forbids `filling → finished`).
 */
export function transitionRunningToFinished(
    match: MatchRecord,
    results: MatchResultsRecord,
    finishedAtMs: number,
    emit?: StatusEmitter,
): MatchRecord {
    if (match.status !== 'running') {
        throw new Error(`matchLifecycle: illegal transition ${match.status} → finished for match ${match.matchId}`);
    }

    match.results = results;
    match.finishedAtMs = finishedAtMs;
    match.rematch = null;
    match.status = 'finished';
    match.lastActivityAtMs = finishedAtMs;

    notify(emit, match.matchId, 'running', 'finished', finishedAtMs);
    return match;
}

/**
 * Transition any live state to `'collected'` (teardown complete):
 * legal from `filling` (empty-match TTL / creator left), `finished`
 * (results TTL / rematch resolved), and `running` (all players
 * forfeited, US5 AC-2). Emits the transition event.
 *
 * @param match - The match being torn down.
 * @param atMs - Epoch ms of the teardown.
 * @param emit - Optional event sink (FR-012).
 * @param results - Optional terminal results to stamp before
 *   collecting — the US5 all-forfeited teardown records a
 *   `kind: 'cancelled'` result per data-model §4/§10.
 * @returns The same record, now `'collected'`.
 * @throws When the match is already `'collected'` (double-teardown).
 */
export function transitionToCollected(
    match: MatchRecord,
    atMs: number,
    emit?: StatusEmitter,
    results?: MatchResultsRecord,
): MatchRecord {
    if (match.status === 'collected') {
        throw new Error(`matchLifecycle: illegal transition collected → collected for match ${match.matchId}`);
    }

    const from = match.status;
    if (results !== undefined) {
        match.results = results;
    }
    match.status = 'collected';
    match.lastActivityAtMs = atMs;

    notify(emit, match.matchId, from, 'collected', atMs);
    return match;
}

// ----------------------------------------------------------------------------
// Rematch creation path (T050/T052) — shares the create/fill primitives
// ----------------------------------------------------------------------------

/** One auto-seated original participant for {@linkcode createRematchMatchRecord}. */
export interface RematchParticipant {
    /** The participant's live ephemeral session (rebound to the new match). */
    readonly session: PlayerSession;
    /** Their prior seat index, preserved verbatim (US4 AC-2). */
    readonly seatIndex: SeatIndex;
}

/** Arguments for {@linkcode createRematchMatchRecord}. */
export interface CreateRematchMatchRecordArgs {
    /** The resolved original match (visibility + settings are copied). */
    readonly original: MatchRecord;
    /** Original participants in seat order. */
    readonly participants: readonly RematchParticipant[];
    /** Epoch ms of creation. */
    readonly nowMs: number;
    /** Injected UUID v4 generator for the new match id (deterministic in tests). */
    readonly randomId: () => string;
}

/**
 * Create the rematch `MatchRecord` once every original participant
 * accepted (FR-009 "fresh map generation once all accept" + research.md
 * §5). Shares the exact record/seat factories of the normal create/fill
 * path (`createMatchRecord` + `createSeatRecord`) so validation and
 * invariants live in one place:
 *
 *   - new UUID v4 `MatchId` via the injected generator → fresh
 *     `/join/<matchId>` share path (FR-009 "newly generated seed/ID/link")
 *   - visibility + settings copied from the original (immutable)
 *   - a fresh uint32 seed minted NOW and stored as `initialSeed`
 *     (FR-007/FR-009): the rematch match stays in `'filling'` until its
 *     players reconnect, so the seed cannot be minted at a later
 *     auto-start the way first-run matches do
 *   - each participant re-seated at their prior `seatIndex` with a NEW
 *     session token; their session is rebound to the new match
 *
 * @param args - Original record, ordered participants, clock, ids.
 * @returns The stored-shape record plus its freshly created seats.
 */
export function createRematchMatchRecord(args: CreateRematchMatchRecordArgs): {
    match: MatchRecord;
    seats: SeatRecord[];
} {
    const { nowMs, original, participants, randomId } = args;
    const match = createMatchRecord({
        matchId: randomId() as MatchId,
        visibility: original.visibility,
        settings: original.settings,
        createdAtMs: nowMs,
    });
    match.initialSeed = newMatchSeed();

    const seats: SeatRecord[] = [];
    for (const participant of participants) {
        const sessionToken = newSessionToken();
        const seat = createSeatRecord({
            seatIndex: participant.seatIndex,
            playerSessionId: participant.session.playerSessionId,
            // Feature 010 FR-019 + US1 AC-4: the fresh snapshot reads the
            // session's CURRENT accepted handle, so a rename since the
            // original match propagates into the rematch seats while the
            // identity reference itself is unchanged.
            guestPlayerId: participant.session.guestPlayerId,
            handle: participant.session.acceptedHandle,
            displayName: participant.session.displayName,
            sessionToken,
            playerId: null, // finalized at the filling → running transition
            connectedAtMs: nowMs,
        });
        match.seats.set(seat.seatIndex, seat);
        seats.push(seat);

        // Rebind the participant's ephemeral session to the new match.
        participant.session.currentMatchId = match.matchId;
        participant.session.currentSeatIndex = seat.seatIndex;
        participant.session.currentSessionToken = sessionToken;
    }

    return { match, seats };
}

// ----------------------------------------------------------------------------
// Identity handle rename propagation (feature 010, T-006)
// ----------------------------------------------------------------------------

/** What {@linkcode propagateHandleRename} updated. */
export interface HandleRenameResult {
    /** Player sessions whose `acceptedHandle` snapshot was refreshed. */
    readonly sessions: number;
    /** Seat records whose `handle` snapshot was refreshed. */
    readonly seats: number;
}

/**
 * Sweep an accepted-handle rename across one guest's in-flight
 * matchmaking records (feature 010 FR-019 / US1 AC-4: "the new handle
 * replaces the old one … in any subsequently joined match" — and this
 * keeps already-joined waiting/running projections consistent too).
 *
 * The identity REGISTRY (feature 010) stays the sole authority for the
 * handle; this transition only refreshes the display snapshots the
 * matchmaker holds, keyed by the server-resolved `guestPlayerId` —
 * never by a client-supplied value. Sessions are matched directly;
 * seats are matched across every non-`'collected'` match (collected
 * matches are dead records that no projection can ever reach).
 *
 * Forge-safety groundwork (full adversarial suite is T-009): an
 * unknown or foreign `guestPlayerId` matches nothing and returns zero
 * counts — there is no way to re-target another player's records, and
 * the association fields themselves are immutable everywhere else.
 *
 * Pure apart from the in-place snapshot mutation: no clock reads, no
 * randomness (constitution Principle II).
 *
 * @param store - The matchmaker store holding sessions + matches.
 * @param guestPlayerId - The registry-verified guest identity whose
 *   handle changed.
 * @param acceptedHandle - The newly ACCEPTED display handle (already
 *   validated + uniqueness-reserved by the registry).
 * @returns How many session snapshots and seat snapshots were
 *   refreshed (zero for an unknown id).
 */
export function propagateHandleRename(
    store: MatchmakerStore,
    guestPlayerId: GuestPlayerId,
    acceptedHandle: string,
): HandleRenameResult {
    let sessions = 0;
    let seats = 0;

    for (const session of store.listSessions()) {
        if (session.guestPlayerId === guestPlayerId && session.acceptedHandle !== acceptedHandle) {
            session.acceptedHandle = acceptedHandle;
            sessions += 1;
        }
    }

    for (const match of store.listMatches()) {
        if (match.status === 'collected') {
            continue;
        }
        for (const seat of match.seats.values()) {
            if (seat.guestPlayerId === guestPlayerId && seat.handle !== acceptedHandle) {
                seat.handle = acceptedHandle;
                seats += 1;
            }
        }
    }

    return { sessions, seats };
}
