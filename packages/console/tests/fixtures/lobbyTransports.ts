/**
 * Shared lobby test doubles — feature 010 (T-018).
 *
 * Deterministic fakes for component/a11y-tier lobby suites: a scripted
 * {@link ScriptedLobbyTransport} implementing exactly the controller's
 * {@link LobbyTransport} surface (no sockets, no timers), plus small
 * builders for the wire-derived shapes the store consumes.
 *
 * Contract fidelity notes:
 *   - `setHandle` resolves by emitting the DIRECTED identity event
 *     (feature 010 T-012 ruling: a rename settles on the directed
 *     identity event alone), mirroring the real server's reply shape.
 *   - Seat-granting commands resolve to their transition classification
 *     (`createMatch` → `'waiting'`, `joinMatch` → `'waiting'`,
 *     `spectateMatch` → `'match'`) unless a failure is queued.
 *   - Queued failures are ONE-SHOT: the next call of that command
 *     rejects with the fabricated error; later calls succeed.
 *
 * The transport deliberately deals in POST-decode types (IdentityState,
 * LobbySnapshot, LobbyErrorReport). Sanitization of server-authored
 * text is the REAL transport client's documented choke point and is
 * pinned adversarially by the node-mode suite
 * (`tests/unit/net/ws-lobby-client.test.ts`); this double hands the
 * controller exactly what that client would deliver.
 */

import type {
    GuestPlayerId,
    IdentityState,
    LobbyErrorCode,
    LobbyRevision,
    LobbySnapshot,
    MatchId,
    PublicLobbyEntry,
} from '@europa/matchmaking';
import type { LobbyMatchSettings } from '@europa/networking';

import type { LobbyConnectionState, LobbyErrorReport, WsLobbyClientState } from '../../src/net/ws-lobby-client';
import type { LobbyTransport } from '../../src/state/lobby-controller';

// ----------------------------------------------------------------------------
// Shape builders
// ----------------------------------------------------------------------------

/** Cast helper for match ids (opaque strings in tests). */
export function matchIdOf(value: string): MatchId {
    return value as MatchId;
}

/** Cast helper for guest player ids (opaque strings in tests). */
export function guestIdOf(value: string): GuestPlayerId {
    return value as GuestPlayerId;
}

/** Cast helper for snapshot revisions. */
export function revisionOf(value: number): LobbyRevision {
    return value as LobbyRevision;
}

/** Build one public entry with overridable fields. */
export function entryOf(overrides: Partial<PublicLobbyEntry> = {}): PublicLobbyEntry {
    return {
        matchId: matchIdOf('aaaaaaaa-0000-4000-8000-000000000000'),
        seatsFilled: 1,
        capacity: 2,
        status: 'waiting',
        boardSize: 32,
        tickIntervalMs: 250,
        ...overrides,
    };
}

/** Build a lobby snapshot with overridable entries/active match. */
export function snapshotOf(
    entries: ReadonlyArray<PublicLobbyEntry>,
    activeMatchId: MatchId | null = null,
    revision = 1,
): LobbySnapshot {
    return { revision: revisionOf(revision), entries, activeMatchId };
}

/**
 * Build a directed identity projection. `guestPlayerId` models the
 * v1.6 delivery channel (present on the owner's directed events only).
 */
export function identityOf(handle: string | null, guestPlayerId?: GuestPlayerId): IdentityState {
    return guestPlayerId === undefined ? { handle, hasIdentity: true } : { handle, hasIdentity: true, guestPlayerId };
}

/** Build an uncorrelated error report (the transport's onError shape). */
export function errorReportOf(
    code: LobbyErrorCode,
    message: string,
    detail: Readonly<Record<string, string | number | boolean>> | null = null,
): LobbyErrorReport {
    return { code, message, detail, actionId: null };
}

// ----------------------------------------------------------------------------
// Scripted transport
// ----------------------------------------------------------------------------

/** Every command the transport records, in call order. */
export type RecordedCommand =
    | { readonly kind: 'connect'; readonly argument?: never }
    | { readonly kind: 'disconnect'; readonly argument?: never }
    | { readonly kind: 'forgetIdentity'; readonly argument?: never }
    | { readonly kind: 'setHandle'; readonly argument: string }
    | { readonly kind: 'createMatch'; readonly argument?: Partial<LobbyMatchSettings> }
    | { readonly kind: 'joinMatch'; readonly argument: MatchId }
    | { readonly kind: 'spectateMatch'; readonly argument: MatchId }
    | { readonly kind: 'leaveMatch'; readonly argument?: never };

/** Mutating commands that support one-shot failure queueing. */
type FailableCommand = Extract<
    RecordedCommand,
    { kind: 'setHandle' | 'createMatch' | 'joinMatch' | 'spectateMatch' | 'leaveMatch' }
>['kind'];

type StateHandler = (connection: LobbyConnectionState) => void;
type IdentityHandler = (identity: IdentityState) => void;
type SnapshotHandler = (snapshot: LobbySnapshot) => void;
type ErrorHandler = (report: LobbyErrorReport) => void;

/**
 * Scripted lobby transport double. Tests drive inbound traffic through
 * the `emit*` methods and queue command failures through
 * {@link ScriptedLobbyTransport.failNextCommand}; every command is
 * recorded for interaction assertions.
 */
export class ScriptedLobbyTransport implements LobbyTransport {
    private connectionState: LobbyConnectionState = 'idle';

    private readonly stateHandlers = new Set<StateHandler>();
    private readonly identityHandlers = new Set<IdentityHandler>();
    private readonly snapshotHandlers = new Set<SnapshotHandler>();
    private readonly errorHandlers = new Set<ErrorHandler>();

    private readonly commandLog: RecordedCommand[] = [];
    private readonly queuedFailures = new Map<FailableCommand, Array<(argument: never) => Error>>();

    /** Recorded commands, in call order. */
    get commands(): ReadonlyArray<RecordedCommand> {
        return this.commandLog;
    }

    // -- Test drivers ---------------------------------------------------------

    /** Emit a connection lifecycle transition. */
    emitConnection(connection: LobbyConnectionState): void {
        this.connectionState = connection;
        for (const handler of this.stateHandlers) {
            handler(connection);
        }
    }

    /** Emit a directed identity event (may carry the v1.6 guestPlayerId). */
    emitIdentity(identity: IdentityState): void {
        for (const handler of this.identityHandlers) {
            handler(identity);
        }
    }

    /** Emit an applied snapshot. */
    emitSnapshot(snapshot: LobbySnapshot): void {
        for (const handler of this.snapshotHandlers) {
            handler(snapshot);
        }
    }

    /** Emit an uncorrelated error report. */
    emitError(report: LobbyErrorReport): void {
        for (const handler of this.errorHandlers) {
            handler(report);
        }
    }

    /**
     * Queue a ONE-SHOT rejection for the next call of `kind`: the call
     * throws the error built from its own argument (later calls of the
     * same kind succeed again).
     */
    failNextCommand(kind: FailableCommand, makeError: (argument: never) => Error): void {
        const queue = this.queuedFailures.get(kind) ?? [];
        queue.push(makeError);
        this.queuedFailures.set(kind, queue);
    }

    /** Current connection state (for `state()`). */
    get currentConnection(): LobbyConnectionState {
        return this.connectionState;
    }

    // -- LobbyTransport surface -------------------------------------------------

    connect(): Promise<void> {
        this.commandLog.push({ kind: 'connect' });
        this.emitConnection('ready');
        return Promise.resolve();
    }

    disconnect(): void {
        this.commandLog.push({ kind: 'disconnect' });
        this.emitConnection('closed');
    }

    forgetIdentity(): void {
        this.commandLog.push({ kind: 'forgetIdentity' });
    }

    async setHandle(handle: string): Promise<IdentityState> {
        this.commandLog.push({ kind: 'setHandle', argument: handle });
        const failure = this.takeFailure('setHandle', handle as never);
        if (failure !== null) {
            throw failure;
        }
        // Wire truth: a rename settles on the DIRECTED identity event.
        const identity = identityOf(handle);
        this.emitIdentity(identity);
        return identity;
    }

    async createMatch(settings?: Partial<LobbyMatchSettings>): Promise<'waiting' | 'match'> {
        this.commandLog.push({ ...(settings === undefined ? {} : { argument: settings }), kind: 'createMatch' });
        const failure = this.takeFailure('createMatch', settings as never);
        if (failure !== null) {
            throw failure;
        }
        return 'waiting';
    }

    async joinMatch(matchId: MatchId): Promise<'waiting' | 'match'> {
        this.commandLog.push({ kind: 'joinMatch', argument: matchId });
        const failure = this.takeFailure('joinMatch', matchId as never);
        if (failure !== null) {
            throw failure;
        }
        return 'waiting';
    }

    async spectateMatch(matchId: MatchId): Promise<'waiting' | 'match'> {
        this.commandLog.push({ kind: 'spectateMatch', argument: matchId });
        const failure = this.takeFailure('spectateMatch', matchId as never);
        if (failure !== null) {
            throw failure;
        }
        return 'match';
    }

    async leaveMatch(): Promise<void> {
        this.commandLog.push({ kind: 'leaveMatch' });
        const failure = this.takeFailure('leaveMatch', undefined as never);
        if (failure !== null) {
            throw failure;
        }
    }

    state(): WsLobbyClientState {
        return {
            connection: this.connectionState,
            handle: null,
            hasClaim: false,
            snapshot: null,
            lastAppliedRevision: null,
            reconnectAttempt: 0,
        };
    }

    onStateChange(handler: StateHandler): () => void {
        this.stateHandlers.add(handler);
        return () => {
            this.stateHandlers.delete(handler);
        };
    }

    onIdentity(handler: IdentityHandler): () => void {
        this.identityHandlers.add(handler);
        return () => {
            this.identityHandlers.delete(handler);
        };
    }

    onSnapshot(handler: SnapshotHandler): () => void {
        this.snapshotHandlers.add(handler);
        return () => {
            this.snapshotHandlers.delete(handler);
        };
    }

    onError(handler: ErrorHandler): () => void {
        this.errorHandlers.add(handler);
        return () => {
            this.errorHandlers.delete(handler);
        };
    }

    /** Pop the next queued failure for `kind`, or `null`. */
    private takeFailure(kind: FailableCommand, argument: never): Error | null {
        const queue = this.queuedFailures.get(kind);
        const makeError = queue?.shift();
        if (queue !== undefined && queue.length === 0) {
            this.queuedFailures.delete(kind);
        }
        return makeError === undefined ? null : makeError(argument);
    }
}
