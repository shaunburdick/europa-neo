/**
 * Recording Lobby Facade Fixture — Feature 010 test fixture (T-010)
 *
 * The networking-side double for the lobby dispatcher suites: a pure
 * recorder implementing networking's REAL structural facade contract
 * (`LobbyServiceFacade` in `src/contracts/network-api.ts`). Inject it
 * through {@link fakeLobbySource} into `ServerDeps.lobby` and assert
 * exactly what the dispatcher routed, correlated, and delivered —
 * including the sink hand-off (the ONE projection path) and the
 * `connectionClosed` teardown wiring.
 *
 * Behavior mirrors the REAL matchmaking facade's dispatcher-relevant
 * observables:
 *
 *   - `establishIdentity` / successful `setHandle` push a DIRECTED
 *     `identity` event through the sink (regardless of subscription);
 *   - `subscribe` RETURNS the baseline snapshot without pushing it;
 *   - `join` may push a post-mutation snapshot to the acting
 *     connection during the call (the recompute-and-broadcast the
 *     real facade performs), which is what the dispatcher's
 *     auto-start transition peek consumes;
 *   - every fallible method returns a configurable `LobbyResult`.
 *
 * Every invocation is captured in per-method arrays. Event/payload
 * SHAPES come from the wire fixtures (`lobbyWire.ts`) and the real
 * contract types — zero local re-declarations.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type {
    ConnectionId,
    GuestIdentityClaim,
    IdentityState,
    LobbyEvent,
    LobbyEventSink,
    LobbyFailure,
    LobbyMatchSettings,
    LobbyMatchTarget,
    LobbyResult,
    LobbyServiceFacade,
    LobbyServiceSource,
    LobbySnapshot,
    LobbySpectateTarget,
    MatchId,
} from '../../src/types';

// ----------------------------------------------------------------------------
// Builders
// ----------------------------------------------------------------------------

/** Build a `LobbyFailure` (the facade's error payload). */
export function lobbyFailure(
    code: LobbyFailure['code'],
    message = `lobby error: ${code}`,
    detail?: Readonly<Record<string, string | number | boolean>>,
): LobbyFailure {
    return Object.freeze(detail === undefined ? { code, message } : { code, message, detail });
}

/** A distinctive opaque guest id for secrecy assertions. */
export const BEARER_GUEST_ID = 'guest-BEARER-SECRET-0f3e5a' as GuestIdentityClaim['guestPlayerId'];

/**
 * Build a successful `LobbyMatchTarget` (mirror of matchmaking's
 * `SeatAssignment` bundle). Deterministic per call site via arguments.
 */
export function matchTarget(matchId: MatchId, seatIndex = 0): LobbyMatchTarget {
    return Object.freeze({
        matchId,
        seatAssignment: Object.freeze({
            playerSessionId:
                `psession-${matchId}-${String(seatIndex)}` as LobbyMatchTarget['seatAssignment']['playerSessionId'],
            seatIndex,
            playerId: (seatIndex + 1) as LobbyMatchTarget['seatAssignment']['playerId'],
            sessionToken: `token-${matchId}-${String(seatIndex)}` as LobbyMatchTarget['seatAssignment']['sessionToken'],
            displayName: 'Nova',
        }),
    });
}

// ----------------------------------------------------------------------------
// Call records (extracted from the REAL contract — no re-declares)
// ----------------------------------------------------------------------------

/** Recorded `establishIdentity` invocation. */
export interface IdentityCall {
    readonly claim: GuestIdentityClaim | undefined;
    readonly connectionId: ConnectionId;
}

/** Recorded `create` invocation. */
export interface CreateCall {
    readonly connectionId: ConnectionId;
    readonly settings: Partial<LobbyMatchSettings> | undefined;
}

/** Recorded match-addressed (`join`/`spectate`) invocation. */
export interface MatchCall {
    readonly connectionId: ConnectionId;
    readonly matchId: MatchId;
}

// ----------------------------------------------------------------------------
// The recorder
// ----------------------------------------------------------------------------

/**
 * Recording `LobbyServiceFacade`. Outcomes are scriptable per method;
 * unscripted methods succeed with deterministic defaults so suites
 * configure only the arm under test.
 */
export class FakeLobbyService implements LobbyServiceFacade {
    /** Sink captured from the server's `create` hand-off. */
    private sink: LobbyEventSink | null = null;

    // -- Scripted outcomes (defaults succeed) ---------------------------------

    /** Identity pushed after establish/rename successes. */
    identityToDeliver: IdentityState = Object.freeze({ handle: 'Nova', hasIdentity: true });
    /** `setHandle` outcome. */
    setHandleOutcome: LobbyResult<IdentityState> = { ok: true, data: this.identityToDeliver };
    /** `subscribe` outcome (returned baseline, NOT pushed). */
    subscribeOutcome: LobbyResult<LobbySnapshot> = {
        ok: true,
        data: Object.freeze({ revision: 7 as LobbySnapshot['revision'], entries: [], activeMatchId: null }),
    };
    /** `create` outcome. */
    createOutcome: LobbyResult<LobbyMatchTarget> = { ok: true, data: matchTarget('match-create' as MatchId) };
    /** `join` outcome. */
    joinOutcome: LobbyResult<LobbyMatchTarget> = { ok: true, data: matchTarget('match-join' as MatchId, 1) };
    /**
     * Snapshot the facade "broadcasts" to the ACTING connection during
     * `join` (simulates the real recompute-and-publish pass). Null =
     * no push (unsubscribed actor / no visible change).
     */
    joinPush: LobbySnapshot | null = null;
    /** `spectate` outcome. */
    spectateOutcome: LobbyResult<LobbySpectateTarget> = {
        ok: true,
        data: Object.freeze({ matchId: 'match-spectate' as MatchId }),
    };
    /** `leave` outcome. */
    leaveOutcome: LobbyResult<void> = { ok: true };
    /** Make `setHandle` THROW (invariant-breach path). */
    throwOnSetHandle = false;

    // -- Recordings ------------------------------------------------------------

    /** Every `establishIdentity` call, in arrival order. */
    readonly identityCalls: IdentityCall[] = [];
    /** Every `setHandle` call, in arrival order. */
    readonly setHandleCalls: Array<{ readonly connectionId: ConnectionId; readonly handle: string }> = [];
    /** Every `subscribe` call, in arrival order. */
    readonly subscribeCalls: ConnectionId[] = [];
    /** Every `create` call, in arrival order. */
    readonly createCalls: CreateCall[] = [];
    /** Every `join` call, in arrival order. */
    readonly joinCalls: MatchCall[] = [];
    /** Every `spectate` call, in arrival order. */
    readonly spectateCalls: MatchCall[] = [];
    /** Every `leave` call, in arrival order. */
    readonly leaveCalls: ConnectionId[] = [];
    /** Every `connectionClosed` call, in arrival order. */
    readonly closedCalls: ConnectionId[] = [];

    /**
     * Deliver an arbitrary event through the captured sink — the test
     * side of THE one projection path (directed pushes, broadcasts).
     * No-op until the server has handed the sink over.
     *
     * @param connectionId Recipient connection.
     * @param event        Event to push verbatim.
     */
    push(connectionId: ConnectionId, event: LobbyEvent): void {
        this.sink?.deliver(connectionId, event);
    }

    /**
     * Capture the server-handed sink (called by {@link fakeLobbySource};
     * kept OFF the `create` name because the facade contract already
     * claims it for match creation).
     *
     * @param sink The ONE projection path onto the wire.
     */
    attachSink(sink: LobbyEventSink): void {
        this.sink = sink;
    }

    /** How many times the server invoked the factory (memoization pin). */
    factoryInvocations = 0;

    /** @inheritdoc Records + pushes the directed identity event. */
    establishIdentity(claim: GuestIdentityClaim | undefined, connectionId: ConnectionId): IdentityState {
        this.identityCalls.push(Object.freeze({ claim, connectionId }));
        this.push(connectionId, { kind: 'identity', identity: this.identityToDeliver });
        return this.identityToDeliver;
    }

    /** @inheritdoc Records; scripted outcome; pushes identity on success. */
    setHandle(connectionId: ConnectionId, handle: string): LobbyResult<IdentityState> {
        this.setHandleCalls.push(Object.freeze({ connectionId, handle }));
        if (this.throwOnSetHandle) {
            throw new Error('scripted facade invariant breach');
        }
        if (!this.setHandleOutcome.ok) {
            return this.setHandleOutcome;
        }
        this.push(connectionId, { kind: 'identity', identity: this.setHandleOutcome.data });
        return this.setHandleOutcome;
    }

    /** @inheritdoc Records; returns the baseline WITHOUT pushing it. */
    subscribe(connectionId: ConnectionId): LobbyResult<LobbySnapshot> {
        this.subscribeCalls.push(connectionId);
        return this.subscribeOutcome;
    }

    /** @inheritdoc Records; scripted outcome. */
    create(connectionId: ConnectionId, settings?: Partial<LobbyMatchSettings>): LobbyResult<LobbyMatchTarget> {
        this.createCalls.push(Object.freeze({ connectionId, settings }));
        return this.createOutcome;
    }

    /** @inheritdoc Records; pushes the scripted broadcast FIRST (the real
     * facade publishes inside the call), then returns the outcome. */
    join(connectionId: ConnectionId, matchId: MatchId): LobbyResult<LobbyMatchTarget> {
        this.joinCalls.push(Object.freeze({ connectionId, matchId }));
        if (this.joinPush !== null) {
            this.push(connectionId, { kind: 'snapshot', snapshot: this.joinPush });
        }
        return this.joinOutcome;
    }

    /** @inheritdoc Records; scripted outcome. */
    spectate(connectionId: ConnectionId, matchId: MatchId): LobbyResult<LobbySpectateTarget> {
        this.spectateCalls.push(Object.freeze({ connectionId, matchId }));
        return this.spectateOutcome;
    }

    /** @inheritdoc Records; scripted outcome. */
    leave(connectionId: ConnectionId): LobbyResult<void> {
        this.leaveCalls.push(connectionId);
        return this.leaveOutcome;
    }

    /** @inheritdoc Records the teardown call (tolerant, like the real one). */
    connectionClosed(connectionId: ConnectionId): void {
        this.closedCalls.push(connectionId);
    }

    /** @inheritdoc Shutdown is host-owned; recording only. */
    close(): Promise<void> {
        return Promise.resolve();
    }
}

/**
 * Wrap a recorder in the `ServerDeps.lobby` source shape. The source's
 * `create` is where the server hands the sink over — counted and
 * forwarded here so the recorder class itself stays a pure facade.
 *
 * @param service The recorder the source hands back (once, memoized
 *                server-side).
 * @returns The lobby composition source.
 */
export function fakeLobbySource(service: FakeLobbyService): LobbyServiceSource {
    return {
        create: (sink) => {
            service.factoryInvocations += 1;
            service.attachSink(sink);
            return service;
        },
    };
}
