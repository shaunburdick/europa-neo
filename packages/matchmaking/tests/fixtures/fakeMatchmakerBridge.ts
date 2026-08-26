/**
 * Fake Matchmaker Bridge — Feature 010 test fixture (T-004)
 *
 * The lobby-side double for Wave-2 suites (T-005/T-007/T-008/T-009):
 * a scriptable, recording fake of feature 006's `Matchmaker` (the
 * surface `LobbyService` delegates to per `contracts/lobby-api.ts`)
 * COMBINED with the lifecycle-event plumbing the lobby observes.
 *
 * Two directions, one object:
 *
 *   - **Delegation (lobby → matchmaker)**: `createMatch`, `joinMatch`,
 *     `leaveMatch`, `listPublicMatches`, … record every request and
 *     return either a scripted result (`queueCreateResult`,
 *     `setPublicMatches`, …) or a deterministic success built from the
 *     `lobbySnapshots` builders. Suites assert on the recorded calls
 *     to prove what the facade delegated.
 *   - **Publication (matchmaking → lobby)**: `registerLifecycleListener`
 *     captures the handler set a lobby under test subscribes with
 *     (typed as networking's real `MatchmakerBridge` — the same shape
 *     networking fires at matchmaking), and the `fireOn*` methods
 *     deliver seat/connection/terminal events on cue. This is the
 *     "reconnect/grace callbacks update identity state" seam from
 *     `contracts/lobby-api.md`, plus T-008's create/fill/start/collect
 *     publication triggers once those land.
 *
 * Event shapes are EXTRACTED from networking's `MatchmakerBridge` via
 * `Parameters<…>` indexed access — zero local re-declarations, so any
 * upstream contract change flows into this fixture at compile time.
 * Event factory functions (`seatClaimedEvent`, …) supply deterministic
 * defaults so tests fire realistic payloads in one call.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type {
    ConnectionId,
    ConnectionRole,
    MatchId,
    MatchmakerBridge,
    MatchResult,
    PlayerId,
    SessionToken,
} from '@europa/networking';
import type { JoinPath, LobbyEntry, MatchmakerStats } from '../../contracts/match-types';
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
    Matchmaker,
    RequestRematchRequest,
    RequestRematchResult,
} from '../../contracts/matchmaking-api';
import { buildSeatAssignment, nextLobbyMatchId, nextSessionToken } from './lobbySnapshots';

/**
 * Assert a plain string into a branded string type (mirrors
 * networking's `toBranded`; same helper as `scriptedBridges.ts`).
 */
function toBranded<T extends string>(value: string): T {
    return value as T;
}

// ----------------------------------------------------------------------------
// Event types extracted from the REAL networking contract (no re-declares)
// ----------------------------------------------------------------------------

/** Payload of `onSeatClaimed`, extracted from networking's contract. */
export type SeatClaimedEvent = Parameters<NonNullable<MatchmakerBridge['onSeatClaimed']>>[0];
/** Payload of `onSeatDisconnected`, extracted from networking's contract. */
export type SeatDisconnectedEvent = Parameters<NonNullable<MatchmakerBridge['onSeatDisconnected']>>[0];
/** Payload of `onSeatReconnected`, extracted from networking's contract. */
export type SeatReconnectedEvent = Parameters<NonNullable<MatchmakerBridge['onSeatReconnected']>>[0];
/** Payload of `onSeatExpired`, extracted from networking's contract. */
export type SeatExpiredEvent = Parameters<NonNullable<MatchmakerBridge['onSeatExpired']>>[0];
/** Payload of `onMatchTerminal`, extracted from networking's contract. */
export type MatchTerminalEvent = Parameters<NonNullable<MatchmakerBridge['onMatchTerminal']>>[0];

// ----------------------------------------------------------------------------
// Deterministic event factories
// ----------------------------------------------------------------------------

/** Monotonic counters behind connection-id minting (per module load). */
let connectionCounter = 0;

/** Mint a fresh deterministic `ConnectionId` (`conn-0001`, …). */
export function nextConnectionId(): ConnectionId {
    connectionCounter += 1;
    return toBranded<ConnectionId>(`conn-${String(connectionCounter).padStart(4, '0')}`);
}

/** Overrides for {@link seatClaimedEvent}; omitted fields keep defaults. */
export type SeatClaimedOverrides = Partial<SeatClaimedEvent>;

/** Build an `onSeatClaimed` payload with deterministic defaults. */
export function seatClaimedEvent(overrides: SeatClaimedOverrides = {}): SeatClaimedEvent {
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        connectionId: overrides.connectionId ?? nextConnectionId(),
        sessionToken: overrides.sessionToken ?? nextSessionToken(),
        playerId: overrides.playerId ?? (1 as PlayerId),
        role: overrides.role ?? ('player' as ConnectionRole),
    });
}

/** Overrides for {@link seatDisconnectedEvent}; omitted fields keep defaults. */
export interface SeatConnectionOverrides {
    readonly matchId?: MatchId;
    readonly connectionId?: ConnectionId;
    readonly sessionToken?: SessionToken;
}

/** Build an `onSeatDisconnected` payload with deterministic defaults. */
export function seatDisconnectedEvent(overrides: SeatConnectionOverrides = {}): SeatDisconnectedEvent {
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        connectionId: overrides.connectionId ?? nextConnectionId(),
        sessionToken: overrides.sessionToken ?? nextSessionToken(),
    });
}

/** Build an `onSeatReconnected` payload with deterministic defaults. */
export function seatReconnectedEvent(overrides: SeatConnectionOverrides = {}): SeatReconnectedEvent {
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        connectionId: overrides.connectionId ?? nextConnectionId(),
        sessionToken: overrides.sessionToken ?? nextSessionToken(),
    });
}

/** Overrides for {@link seatExpiredEvent}; omitted fields keep defaults. */
export interface SeatExpiredOverrides {
    readonly matchId?: MatchId;
    readonly sessionToken?: SessionToken;
    readonly playerId?: PlayerId | null;
}

/** Build an `onSeatExpired` payload with deterministic defaults. */
export function seatExpiredEvent(overrides: SeatExpiredOverrides = {}): SeatExpiredEvent {
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        sessionToken: overrides.sessionToken ?? nextSessionToken(),
        playerId: overrides.playerId ?? (1 as PlayerId),
    });
}

/** Overrides for {@link matchTerminalEvent}; omitted fields keep defaults. */
export interface MatchTerminalOverrides {
    readonly matchId?: MatchId;
    readonly result?: MatchResult;
    readonly tick?: number;
}

/** Build an `onMatchTerminal` payload (default: player 1 wins on tick 100). */
export function matchTerminalEvent(overrides: MatchTerminalOverrides = {}): MatchTerminalEvent {
    const result: MatchResult = overrides.result ?? {
        kind: 'win',
        winner: 1 as PlayerId,
        tick: overrides.tick ?? 100,
        reason: 'last_standing',
    };
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        result,
        tick: overrides.tick ?? 100,
    });
}

// ----------------------------------------------------------------------------
// The fake itself
// ----------------------------------------------------------------------------

/**
 * Scriptable `Matchmaker` double + lifecycle publication trigger.
 *
 * Result scripting is FIFO per method (`queueCreateResult`, …); when a
 * queue is empty the corresponding call returns a deterministic
 * success. Rematch methods record calls and return benign defaults —
 * feature-010 lobby suites do not drive rematch flows; script them via
 * a dedicated queue here only if a future task needs one.
 */
export class FakeMatchmakerBridge implements Matchmaker {
    /** Every `createMatch` request, in call order. */
    readonly createCalls: CreateMatchRequest[] = [];
    /** Every `joinMatch` request, in call order. */
    readonly joinCalls: JoinMatchRequest[] = [];
    /** Every `leaveMatch` request, in call order. */
    readonly leaveCalls: LeaveMatchRequest[] = [];
    /** Every `requestRematch` request, in call order. */
    readonly rematchRequests: RequestRematchRequest[] = [];
    /** Every `acceptRematch` request, in call order. */
    readonly rematchAccepts: AcceptRematchRequest[] = [];
    /** Every `declineRematch` request, in call order. */
    readonly rematchDeclines: DeclineRematchRequest[] = [];

    /** Scripted `createMatch` results; FIFO, then deterministic default. */
    private readonly createResults: CreateMatchResult[] = [];
    /** Scripted `joinMatch` results; FIFO, then deterministic default. */
    private readonly joinResults: JoinMatchResult[] = [];
    /** Scripted `leaveMatch` results; FIFO, then `{ ok: true }`. */
    private readonly leaveResults: LeaveMatchResult[] = [];
    /** Sticky public-lobby projection until the next `setPublicMatches`. */
    private publicEntries: readonly LobbyEntry[] = [];
    /** Registered lifecycle listeners (the lobby under test, usually one). */
    private readonly listeners: MatchmakerBridge[] = [];
    /** Set by {@link close}; further mutations throw. */
    private closed = false;

    // -- Scripting ------------------------------------------------------------

    /**
     * Queue a `createMatch` result (FIFO). Queue a failure to drive
     * delegated-validation paths (US3 AC-4 field-specific feedback).
     */
    queueCreateResult(result: CreateMatchResult): void {
        this.createResults.push(result);
    }

    /**
     * Queue a `joinMatch` result (FIFO). Queue failures to drive
     * full/unavailable/reconnect-expired delegation paths (FR-010).
     */
    queueJoinResult(result: JoinMatchResult): void {
        this.joinResults.push(result);
    }

    /** Queue a `leaveMatch` result (FIFO). Default is `{ ok: true }`. */
    queueLeaveResult(result: LeaveMatchResult): void {
        this.leaveResults.push(result);
    }

    /**
     * Replace the sticky public-lobby projection returned by
     * `listPublicMatches` (feature-006 `LobbyEntry` shape — NOT the
     * feature-010 projection; the facade builds that itself).
     */
    setPublicMatches(entries: readonly LobbyEntry[]): void {
        this.publicEntries = [...entries];
    }

    // -- Lifecycle publication (tests fire; listeners observe) ----------------

    /**
     * Register a lifecycle listener (typically the lobby facade under
     * test). Listeners receive every subsequent `fireOn*` event in
     * registration order; duplicate registrations are the caller's bug
     * and will receive duplicates.
     */
    registerLifecycleListener(listener: MatchmakerBridge): void {
        this.listeners.push(listener);
    }

    /** Fire `onSeatClaimed` at every registered listener. */
    fireOnSeatClaimed(event: SeatClaimedEvent): void {
        for (const listener of this.listeners) {
            listener.onSeatClaimed?.(event);
        }
    }

    /** Fire `onSeatDisconnected` at every registered listener. */
    fireOnSeatDisconnected(event: SeatDisconnectedEvent): void {
        for (const listener of this.listeners) {
            listener.onSeatDisconnected?.(event);
        }
    }

    /** Fire `onSeatReconnected` at every registered listener. */
    fireOnSeatReconnected(event: SeatReconnectedEvent): void {
        for (const listener of this.listeners) {
            listener.onSeatReconnected?.(event);
        }
    }

    /** Fire `onSeatExpired` at every registered listener. */
    fireOnSeatExpired(event: SeatExpiredEvent): void {
        for (const listener of this.listeners) {
            listener.onSeatExpired?.(event);
        }
    }

    /** Fire `onMatchTerminal` at every registered listener. */
    fireOnMatchTerminal(event: MatchTerminalEvent): void {
        for (const listener of this.listeners) {
            listener.onMatchTerminal?.(event);
        }
    }

    /**
     * A `MatchmakerBridge` view whose handlers route through the
     * `fireOn*` methods — hand this to seams that expect the
     * matchmaking side's registration object.
     */
    get bridgeHandlers(): MatchmakerBridge {
        return {
            onSeatClaimed: (event) => this.fireOnSeatClaimed(event),
            onSeatDisconnected: (event) => this.fireOnSeatDisconnected(event),
            onSeatReconnected: (event) => this.fireOnSeatReconnected(event),
            onSeatExpired: (event) => this.fireOnSeatExpired(event),
            onMatchTerminal: (event) => this.fireOnMatchTerminal(event),
        };
    }

    // -- Matchmaker surface (record + scripted/default results) -----------------

    /** @inheritdoc */
    createMatch(req: CreateMatchRequest): CreateMatchResult {
        this.assertOpen('createMatch');
        this.createCalls.push(req);
        const scripted = this.createResults.shift();
        if (scripted !== undefined) {
            return scripted;
        }
        const target = nextLobbyMatchId();
        return {
            ok: true,
            data: {
                matchId: target,
                joinPath: `/join/${target}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ displayName: req.displayName }),
            },
        };
    }

    /** @inheritdoc */
    joinMatch(req: JoinMatchRequest): JoinMatchResult {
        this.assertOpen('joinMatch');
        this.joinCalls.push(req);
        const scripted = this.joinResults.shift();
        if (scripted !== undefined) {
            return scripted;
        }
        return {
            ok: true,
            data: {
                matchId: req.matchId,
                joinPath: `/join/${req.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ displayName: req.displayName }),
            },
        };
    }

    /** @inheritdoc */
    leaveMatch(req: LeaveMatchRequest): LeaveMatchResult {
        this.assertOpen('leaveMatch');
        this.leaveCalls.push(req);
        const scripted = this.leaveResults.shift();
        return scripted ?? { ok: true };
    }

    /** @inheritdoc */
    listPublicMatches(): ListPublicMatchesResult {
        this.assertOpen('listPublicMatches');
        return { ok: true, matches: this.publicEntries };
    }

    /** @inheritdoc */
    requestRematch(req: RequestRematchRequest): RequestRematchResult {
        this.assertOpen('requestRematch');
        this.rematchRequests.push(req);
        return { ok: true, rematchOfferId: nextLobbyMatchId() };
    }

    /** @inheritdoc */
    acceptRematch(req: AcceptRematchRequest): AcceptRematchResult {
        this.assertOpen('acceptRematch');
        this.rematchAccepts.push(req);
        return { ok: true, allAccepted: false };
    }

    /** @inheritdoc */
    declineRematch(req: DeclineRematchRequest): DeclineRematchResult {
        this.assertOpen('declineRematch');
        this.rematchDeclines.push(req);
        return { ok: true };
    }

    /** @inheritdoc */
    stats(): MatchmakerStats {
        return {
            activeMatches: 0,
            fillingMatches: 0,
            runningMatches: 0,
            finishedMatches: 0,
            collectedMatches: 0,
            publicJoinableMatches: this.publicEntries.length,
            activePlayerSessions: 0,
            totalCreated: this.createCalls.length,
            totalFinished: 0,
            totalCollected: 0,
            totalForfeits: 0,
            totalRematchAccepted: this.rematchAccepts.length,
            totalRematchDeclined: this.rematchDeclines.length,
            uptimeMs: 0,
        };
    }

    /**
     * Graceful shutdown. Idempotent; afterwards every mutating method
     * throws so suites catch post-close delegation bugs loudly.
     */
    close(): Promise<void> {
        this.closed = true;
        return Promise.resolve();
    }

    /**
     * Throw when a mutating method runs after {@link close}.
     *
     * @param method Caller name, for the error message.
     */
    private assertOpen(method: string): void {
        if (this.closed) {
            throw new Error(`FakeMatchmakerBridge.${method}: matchmaker already closed`);
        }
    }
}
