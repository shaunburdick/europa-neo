/**
 * Lobby Snapshot & Projection Fixtures — Feature 010 test fixture (T-004)
 *
 * Deterministic, frozen constructors for the feature-010 public
 * projection and API payload shapes (`src/contracts/lobby-types.ts` +
 * `src/contracts/lobby-api.ts`):
 *
 *   - Branded-id minters ({@link nextLobbyMatchId},
 *     {@link nextLobbyRevision}, {@link nextLobbyActionId}) so suites
 *     never hand-roll branded literals.
 *   - {@link buildLobbyEntry} / {@link buildLobbySnapshot} — the safe
 *     public projections (FR-006/FR-013) with spec-default numbers.
 *   - {@link buildLobbyError} + the four {@link LobbyEvent} variant
 *     builders — the recoverable-failure payloads (FR-018) and push
 *     events Wave-2/-3 suites assert on.
 *   - {@link buildSeatAssignment} / {@link buildMatchJoinTarget} /
 *     {@link buildSpectatorTarget} — feature-006 canonical credential
 *     bundles wrapped in feature-010 hand-off targets, for facade
 *     delegation tests (T-007).
 *
 * Defaults follow the shipped v1 shape wherever one exists (2-player,
 * 32-board, 250 ms ticks) so generated fixtures resemble production
 * traffic; every field is overridable for edge cases.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { MatchId } from '@europa/networking';

import type { PlayerId, PlayerSessionId, SeatAssignment, SeatIndex, SessionToken } from '../../contracts/match-types';
import type { MatchJoinTarget, SpectatorTarget } from '../../src/contracts/lobby-api';
import type {
    IdentityState,
    LobbyActionId,
    LobbyError,
    LobbyErrorCode,
    LobbyEvent,
    LobbyRevision,
    LobbySnapshot,
    LobbyStatus,
    PublicLobbyEntry,
} from '../../src/contracts/lobby-types';

/**
 * Assert a plain string/number into a branded type (mirrors
 * networking's `toBranded`; brands prevent accidental interchange of
 * distinct id kinds in user code).
 */
function toBranded<T extends string>(value: string): T {
    return value as T;
}

// ----------------------------------------------------------------------------
// Branded id minting
// ----------------------------------------------------------------------------

/** Monotonic counters behind the minters below (per module load). */
let matchIdCounter = 0;
let revisionCounter = 0;
let actionIdCounter = 0;
let playerSessionCounter = 0;
let tokenCounter = 0;

/**
 * Mint a fresh lobby-projected `MatchId` (`match-lobby-0001`, …).
 * Deterministic within a process; pass explicit ids into builders when
 * a suite needs absolute stability across modules.
 */
export function nextLobbyMatchId(): MatchId {
    matchIdCounter += 1;
    return toBranded<MatchId>(`match-lobby-${String(matchIdCounter).padStart(4, '0')}`);
}

/** Mint the next monotonic `LobbyRevision` (starts at 1, FR-013). */
export function nextLobbyRevision(): LobbyRevision {
    revisionCounter += 1;
    return revisionCounter as LobbyRevision;
}

/** Mint the next client-side `LobbyActionId` correlation id. */
export function nextLobbyActionId(): LobbyActionId {
    actionIdCounter += 1;
    return actionIdCounter as LobbyActionId;
}

/** Mint a fresh `PlayerSessionId` for seat credentials. */
export function nextPlayerSessionId(): PlayerSessionId {
    playerSessionCounter += 1;
    return toBranded<PlayerSessionId>(`psn-${String(playerSessionCounter).padStart(4, '0')}`);
}

/** Mint a fresh deterministic `SessionToken` (reconnect credential). */
export function nextSessionToken(): SessionToken {
    tokenCounter += 1;
    return toBranded<SessionToken>(`token-${String(tokenCounter).padStart(4, '0')}`);
}

// ----------------------------------------------------------------------------
// Public projection builders
// ----------------------------------------------------------------------------

/** Overrides for {@link buildLobbyEntry}; omitted fields keep defaults. */
export interface LobbyEntryOverrides {
    readonly matchId?: MatchId;
    readonly seatsFilled?: number;
    readonly capacity?: 2 | 3 | 4;
    readonly status?: LobbyStatus;
    readonly boardSize?: number;
    readonly tickIntervalMs?: number;
}

/**
 * Build one `PublicLobbyEntry` (safe projection, FR-006). Defaults
 * mirror the shipped v1 create flow: a fresh match id, creator seated
 * (1 of 2), waiting on a 32-board at 250 ms ticks. Frozen.
 */
export function buildLobbyEntry(overrides: LobbyEntryOverrides = {}): PublicLobbyEntry {
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        seatsFilled: overrides.seatsFilled ?? 1,
        capacity: overrides.capacity ?? 2,
        status: overrides.status ?? 'waiting',
        boardSize: overrides.boardSize ?? 32,
        tickIntervalMs: overrides.tickIntervalMs ?? 250,
    });
}

/** Overrides for {@link buildLobbySnapshot}; omitted fields keep defaults. */
export interface LobbySnapshotOverrides {
    readonly revision?: LobbyRevision;
    readonly entries?: readonly PublicLobbyEntry[];
    readonly activeMatchId?: MatchId | null;
}

/**
 * Build a complete `LobbySnapshot` (FR-013). Defaults: the next
 * monotonic revision, no entries, no active match — the fresh-visitor
 * baseline. Frozen; entries are NOT copied or frozen recursively, so
 * compose them from {@link buildLobbyEntry} outputs.
 */
export function buildLobbySnapshot(overrides: LobbySnapshotOverrides = {}): LobbySnapshot {
    return Object.freeze({
        revision: overrides.revision ?? nextLobbyRevision(),
        entries: overrides.entries ?? [],
        activeMatchId: overrides.activeMatchId ?? null,
    });
}

// ----------------------------------------------------------------------------
// Error + event builders
// ----------------------------------------------------------------------------

/**
 * Build a `LobbyError` payload (the `E` of every failing lobby call).
 * Message defaults to a stable English sentence keyed by the code so
 * suites can assert presence without caring about exact copy.
 */
export function buildLobbyError(
    code: LobbyErrorCode,
    message = `lobby error: ${code}`,
    detail?: Readonly<Record<string, string | number | boolean>>,
): LobbyError {
    return Object.freeze(
        detail === undefined ? { code, message } : { code, message, detail: Object.freeze({ ...detail }) },
    );
}

/** Build an `identity` lobby event (identity resolved/restored/renamed). */
export function identityEvent(identity: IdentityState): LobbyEvent {
    return Object.freeze({ kind: 'identity', identity });
}

/** Build a `snapshot` lobby event (full replacement at a revision). */
export function snapshotEvent(snapshot: LobbySnapshot): LobbyEvent {
    return Object.freeze({ kind: 'snapshot', snapshot });
}

/**
 * Build an `actionAccepted` lobby event. Defaults mint the next action
 * id and use the `'waiting'` transition (seated in a filling match);
 * pass `'match'` for create/join flows that hand off to live play.
 */
export function actionAcceptedEvent(
    actionId: LobbyActionId = nextLobbyActionId(),
    transition: 'waiting' | 'match' = 'waiting',
): LobbyEvent {
    return Object.freeze({ kind: 'actionAccepted', actionId, transition });
}

/**
 * Build an `error` lobby event (recoverable failure, FR-018). The
 * action id is OPTIONAL — present when correlating to a client action,
 * absent for unsolicited failures such as `server_restarted`.
 */
export function errorEvent(options: {
    readonly code: LobbyErrorCode;
    readonly message?: string;
    readonly actionId?: LobbyActionId;
}): LobbyEvent {
    const message = options.message ?? `lobby error: ${options.code}`;
    return Object.freeze(
        options.actionId === undefined
            ? { kind: 'error', code: options.code, message }
            : { kind: 'error', actionId: options.actionId, code: options.code, message },
    );
}

// ----------------------------------------------------------------------------
// Hand-off target builders (feature-006 credentials, feature-010 wrap)
// ----------------------------------------------------------------------------

/** Overrides for {@link buildSeatAssignment}; omitted fields keep defaults. */
export interface SeatAssignmentOverrides {
    readonly playerSessionId?: PlayerSessionId;
    readonly seatIndex?: SeatIndex;
    readonly playerId?: PlayerId;
    readonly sessionToken?: SessionToken;
    readonly displayName?: string;
}

/**
 * Build a feature-006 canonical `SeatAssignment` (server-issued seat
 * credential bundle). Defaults: seat 0 / player 1 with fresh session
 * and token ids under display handle `'Nova'`. Frozen.
 */
export function buildSeatAssignment(overrides: SeatAssignmentOverrides = {}): SeatAssignment {
    return Object.freeze({
        playerSessionId: overrides.playerSessionId ?? nextPlayerSessionId(),
        seatIndex: overrides.seatIndex ?? (0 as SeatIndex),
        playerId: overrides.playerId ?? (1 as PlayerId),
        sessionToken: overrides.sessionToken ?? nextSessionToken(),
        displayName: overrides.displayName ?? 'Nova',
    });
}

/** Overrides for {@link buildMatchJoinTarget}; omitted fields keep defaults. */
export interface MatchJoinTargetOverrides {
    readonly matchId?: MatchId;
    readonly seatAssignment?: SeatAssignment;
}

/**
 * Build a successful create/join hand-off (`MatchJoinTarget`): the
 * entered match plus its server-issued seat credentials. Frozen.
 */
export function buildMatchJoinTarget(overrides: MatchJoinTargetOverrides = {}): MatchJoinTarget {
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        seatAssignment: overrides.seatAssignment ?? buildSeatAssignment(),
    });
}

/**
 * Build a successful spectate hand-off (`SpectatorTarget`): match
 * identification ONLY — no seat, no token (FR-012). Frozen.
 */
export function buildSpectatorTarget(matchId: MatchId = nextLobbyMatchId()): SpectatorTarget {
    return Object.freeze({ matchId });
}
