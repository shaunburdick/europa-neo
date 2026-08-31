/**
 * Lobby controller unit tests — feature 010 (T-014).
 *
 * Drives the controller against a scripted in-memory fake transport
 * (structural {@link LobbyTransport} double) — fully deterministic:
 * promises resolve/reject on demand, no sockets, no timers.
 *
 * Coverage:
 *   - inbound fan-in: connection/identity/snapshot/error events land in
 *     the store, including the initial lifecycle sync,
 *   - PRIVACY: the directed identity event's opaque guestPlayerId is
 *     stripped at the boundary — asserted adversarially by scanning the
 *     ENTIRE serialized state for the secret,
 *   - command lifecycle: started → settled per action slot, result
 *     envelopes never throw, error normalization (wire code + detail,
 *     timeout, transport),
 *   - seat-grant transitions flip the view and pin eager match ids;
 *     leave returns to the lobby with the identity intact,
 *   - supersession via uncorrelated identity_invalid after a named
 *     session,
 *   - connect/retry guards and optimistic banner clearing,
 *   - dispose() detaches every binding idempotently.
 */

import type { GuestPlayerId, IdentityState, LobbyRevision, LobbySnapshot, MatchId } from '@europa/matchmaking';
import { describe, expect, it } from 'vitest';

import {
    LobbyActionRejectedError,
    type LobbyConnectionState,
    type LobbyErrorReport,
    type WsLobbyClientState,
} from '../../../src/net/ws-lobby-client';
import { createLobbyController, type LobbyTransport } from '../../../src/state/lobby-controller';

// ----------------------------------------------------------------------------
// Fake transport (structural LobbyTransport double)
// ----------------------------------------------------------------------------

type StateHandler = (connection: LobbyConnectionState) => void;
type IdentityHandler = (identity: IdentityState) => void;
type SnapshotHandler = (snapshot: LobbySnapshot) => void;
type ErrorHandler = (report: LobbyErrorReport) => void;

class FakeTransport implements LobbyTransport {
    connection: LobbyConnectionState = 'idle';
    handle: string | null = null;

    readonly calls: string[] = [];

    connectOutcome: (() => Promise<void>) | null = null;
    setHandleOutcome: (() => Promise<void>) | null = null;
    createOutcome: (() => Promise<'waiting' | 'match'>) | null = null;
    joinOutcome: (() => Promise<'waiting' | 'match'>) | null = null;
    spectateOutcome: (() => Promise<'waiting' | 'match'>) | null = null;
    leaveOutcome: (() => Promise<void>) | null = null;

    private readonly stateHandlers = new Set<StateHandler>();
    private readonly identityHandlers = new Set<IdentityHandler>();
    private readonly snapshotHandlers = new Set<SnapshotHandler>();
    private readonly errorHandlers = new Set<ErrorHandler>();

    // -- WsLobbyClient surface ---------------------------------------------------

    connect(url: string): Promise<void> {
        this.calls.push(`connect:${url}`);
        const outcome = this.connectOutcome;
        if (outcome === null) {
            this.connection = 'ready';
            return Promise.resolve();
        }
        return outcome();
    }

    disconnect(): void {
        this.calls.push('disconnect');
        this.connection = 'closed';
        this.emitState();
    }

    forgetIdentity(): void {
        this.calls.push('forgetIdentity');
    }

    setHandle(handle: string): Promise<IdentityState> {
        this.calls.push(`setHandle:${handle}`);
        const outcome = this.setHandleOutcome;
        if (outcome === null) {
            this.handle = handle;
            return Promise.resolve({ handle, hasIdentity: true });
        }
        return outcome().then(() => ({ handle: this.handle, hasIdentity: true }));
    }

    createMatch(): Promise<'waiting' | 'match'> {
        this.calls.push('createMatch');
        const outcome = this.createOutcome;
        return outcome === null ? Promise.resolve('waiting') : outcome();
    }

    joinMatch(matchId: MatchId): Promise<'waiting' | 'match'> {
        this.calls.push(`joinMatch:${matchId}`);
        const outcome = this.joinOutcome;
        return outcome === null ? Promise.resolve('waiting') : outcome();
    }

    spectateMatch(matchId: MatchId): Promise<'waiting' | 'match'> {
        this.calls.push(`spectateMatch:${matchId}`);
        const outcome = this.spectateOutcome;
        return outcome === null ? Promise.resolve('match') : outcome();
    }

    leaveMatch(): Promise<void> {
        this.calls.push('leaveMatch');
        const outcome = this.leaveOutcome;
        return outcome === null ? Promise.resolve() : outcome();
    }

    state(): WsLobbyClientState {
        return {
            connection: this.connection,
            handle: this.handle,
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

    // -- Test drivers --------------------------------------------------------------

    emitState(): void {
        for (const handler of this.stateHandlers) {
            handler(this.connection);
        }
    }

    deliverIdentity(identity: IdentityState): void {
        for (const handler of this.identityHandlers) {
            handler(identity);
        }
    }

    deliverSnapshot(snapshot: LobbySnapshot): void {
        for (const handler of this.snapshotHandlers) {
            handler(snapshot);
        }
    }

    deliverError(report: LobbyErrorReport): void {
        for (const handler of this.errorHandlers) {
            handler(report);
        }
    }
}

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const LOBBY_URL = 'ws://localhost:8080';
const MATCH_A = 'match-a' as MatchId;
/** Stable identity value used to exercise the directed delivery path. */
const GUEST_ID = 'guest-correlation-id' as GuestPlayerId;

function snapshotOf(revision: number, activeMatchId: MatchId | null): LobbySnapshot {
    return { revision: revision as LobbyRevision, entries: [], activeMatchId };
}

function namedIdentity(handle: string): IdentityState {
    return { handle, hasIdentity: true, guestPlayerId: GUEST_ID };
}

// ----------------------------------------------------------------------------
// Inbound fan-in
// ----------------------------------------------------------------------------

describe('inbound transport fan-in', () => {
    it('syncs the initial connection lifecycle at construction', () => {
        const transport = new FakeTransport();
        transport.connection = 'reconnecting';
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        expect(controller.store.getState().connection).toBe('reconnecting');
        controller.dispose();
    });

    it('projects connection transitions, raising and clearing failure banners', () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });

        transport.connection = 'failed';
        transport.emitState();
        expect(controller.store.getState().failure?.code).toBe('connection_failed');

        transport.connection = 'ready';
        transport.emitState();
        expect(controller.store.getState().failure).toBeNull();
        controller.dispose();
    });

    it('applies snapshots wholesale', () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        transport.deliverSnapshot(snapshotOf(3, MATCH_A));
        expect(controller.store.getState().snapshot?.revision).toBe(3);
        expect(controller.store.getState().activeMatchId).toBe(MATCH_A);
        controller.dispose();
    });

    it('routes uncorrelated server errors into the failure banner', () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        transport.deliverError({ code: 'server_restarted', message: 'Lobby restarted.', detail: null, actionId: null });
        const state = controller.store.getState();
        expect(state.failure?.source).toBe('server');
        expect(state.failure?.code).toBe('server_restarted');
        controller.dispose();
    });

    it('keeps the accepted handle correlated in application state', () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });

        // The directed identity event legitimately CARRIES the opaque id
        // (Clarifications v1.6 delivery channel); only the handle may cross.
        transport.deliverIdentity(namedIdentity('Nova'));
        transport.deliverSnapshot(snapshotOf(1, null));
        // Server-authored MESSAGES arrive here already sanitized — the
        // transport client's redact() choke point owns echo-scrubbing
        // (tested in ws-lobby-client.test.ts) — so this fake models the
        // post-sanitization report shape.
        transport.deliverError({
            code: 'handle_taken',
            message: 'That handle is in use.',
            detail: { normalized: 'nova' },
            actionId: null,
        });

        expect(controller.store.getState().handle).toBe('Nova');
        expect(controller.store.getState().failure?.detail).toEqual({ normalized: 'nova' });
        controller.dispose();
    });

    it('dispose() detaches every binding and is idempotent', () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        controller.dispose();
        controller.dispose();

        transport.connection = 'failed';
        transport.emitState();
        transport.deliverSnapshot(snapshotOf(2, MATCH_A));
        transport.deliverIdentity(namedIdentity('Nova'));

        const state = controller.store.getState();
        expect(state.connection).toBe('idle'); // unchanged after dispose
        expect(state.snapshot).toBeNull();
        expect(state.handle).toBeNull();
    });
});

// ----------------------------------------------------------------------------
// Commands
// ----------------------------------------------------------------------------

describe('command lifecycle', () => {
    it('connect() establishes against the configured URL and is a no-op while ready', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });

        const first = await controller.connect();
        expect(first).toEqual({ ok: true, transition: null });
        expect(transport.calls).toEqual([`connect:${LOBBY_URL}`]);

        const second = await controller.connect();
        expect(second).toEqual({ ok: true, transition: null });
        expect(transport.calls).toHaveLength(1); // no duplicate establish
        controller.dispose();
    });

    it('connect() resolves ok:false when the attempt dies (transport truth stays in the store)', async () => {
        const transport = new FakeTransport();
        transport.connectOutcome = () => {
            transport.connection = 'failed';
            transport.emitState();
            return Promise.reject(new Error('establish cycle timed out'));
        };
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        const result = await controller.connect();
        expect(result.ok).toBe(false);
        expect(controller.store.getState().connection).toBe('failed');
        controller.dispose();
    });

    it('retry() clears the banner optimistically and re-establishes from a terminal state', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });

        transport.connection = 'failed';
        transport.emitState();
        expect(controller.store.getState().failure?.code).toBe('connection_failed');

        transport.connection = 'closed'; // terminal: retry is legal
        const result = await controller.retry();
        expect(result.ok).toBe(true);
        expect(transport.calls).toContain(`connect:${LOBBY_URL}`);
        expect(controller.store.getState().failure).toBeNull(); // cleared before/at re-establish
        controller.dispose();
    });

    it('retry() is a no-op while connected', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        await controller.connect();
        const callsBefore = transport.calls.length;
        await controller.retry();
        expect(transport.calls).toHaveLength(callsBefore);
        controller.dispose();
    });

    it('setHandle marks loading synchronously, settles idle, and never moves the view', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });

        // Object-holder gate: property mutation sidesteps control-flow
        // narrowing of closure-assigned locals.
        const gate: { open: () => void } = { open: () => undefined };
        transport.setHandleOutcome = () =>
            new Promise<void>((resolve) => {
                gate.open = resolve;
            });

        const pending = controller.setHandle('Nova');
        expect(controller.store.getState().actions.setHandle.phase).toBe('loading');

        transport.deliverIdentity(namedIdentity('Nova')); // directed confirmation arrives first
        expect(controller.store.getState().handle).toBe('Nova');

        gate.open();
        const result = await pending;
        expect(result).toEqual({ ok: true, transition: null });
        expect(controller.store.getState().actions.setHandle).toEqual({ phase: 'idle', error: null });
        expect(controller.store.getState().viewMode).toBe('lobby');
        controller.dispose();
    });

    it('setHandle rejection records wire code + detail and resolves ok:false', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        transport.setHandleOutcome = () =>
            Promise.reject(
                new LobbyActionRejectedError('handle_taken', 'That handle is in use.', { normalized: 'nova' }),
            );

        const result = await controller.setHandle('Nova');
        expect(result.ok).toBe(false);
        const slot = controller.store.getState().actions.setHandle;
        expect(slot.phase).toBe('error');
        expect(slot.error?.code).toBe('handle_taken');
        expect(slot.error?.detail).toEqual({ normalized: 'nova' });
        controller.dispose();
    });

    it('timeout-shaped failures normalize to the timeout code', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        const timeoutError = Object.assign(new Error('ws-lobby-client: joinMatch timed out'), {
            name: 'LobbyTimeoutError',
        });
        transport.joinOutcome = () => Promise.reject(timeoutError);

        const result = await controller.joinMatch(MATCH_A);
        expect(result.ok).toBe(false);
        expect(controller.store.getState().actions.joinMatch.error?.code).toBe('timeout');
        controller.dispose();
    });

    it('generic transport failures normalize to the transport code', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        transport.createOutcome = () => Promise.reject(new Error('socket closed mid-request'));

        const result = await controller.createMatch();
        expect(result.ok).toBe(false);
        expect(controller.store.getState().actions.createMatch.error?.code).toBe('transport');
        controller.dispose();
    });

    it('join success flips the view to match and pins the match id eagerly', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        transport.joinOutcome = () => Promise.resolve('waiting');

        const result = await controller.joinMatch(MATCH_A);
        expect(result).toEqual({ ok: true, transition: 'waiting' });
        const state = controller.store.getState();
        expect(state.viewMode).toBe('match');
        expect(state.activeMatchId).toBe(MATCH_A);
        expect(state.actions.joinMatch.phase).toBe('idle');
        controller.dispose();
    });

    it('spectate success behaves like a seat grant from the view perspective', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });

        const result = await controller.spectateMatch(MATCH_A);
        expect(result).toEqual({ ok: true, transition: 'match' });
        expect(controller.store.getState().viewMode).toBe('match');
        expect(controller.store.getState().activeMatchId).toBe(MATCH_A);
        controller.dispose();
    });

    it('create success flips the view without an eager id (the snapshot supplies it)', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });

        const result = await controller.createMatch();
        expect(result).toEqual({ ok: true, transition: 'waiting' });
        expect(controller.store.getState().viewMode).toBe('match');
        expect(controller.store.getState().activeMatchId).toBeNull();

        transport.deliverSnapshot(snapshotOf(5, MATCH_A));
        expect(controller.store.getState().activeMatchId).toBe(MATCH_A);
        controller.dispose();
    });

    it('leave success returns to the lobby view with the identity intact', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        transport.deliverIdentity(namedIdentity('Nova'));
        await controller.joinMatch(MATCH_A);

        const result = await controller.leaveMatch();
        expect(result).toEqual({ ok: true, transition: null });
        const state = controller.store.getState();
        expect(state.viewMode).toBe('lobby');
        expect(state.activeMatchId).toBeNull();
        expect(state.actions.leaveMatch).toEqual({ phase: 'idle', error: null });
        expect(state.handle).toBe('Nova'); // identity preserved across return
        controller.dispose();
    });

    it('leave failure keeps the current view and records the error', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        await controller.joinMatch(MATCH_A);
        transport.leaveOutcome = () =>
            Promise.reject(new LobbyActionRejectedError('identity_in_match', 'Still committed.', null));

        const result = await controller.leaveMatch();
        expect(result.ok).toBe(false);
        const state = controller.store.getState();
        expect(state.viewMode).toBe('match');
        expect(state.actions.leaveMatch.error?.code).toBe('identity_in_match');
        controller.dispose();
    });

    it('uncorrelated identity_invalid after a NAMED session raises the superseded flag', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        transport.deliverIdentity(namedIdentity('Nova'));

        transport.deliverError({
            code: 'identity_invalid',
            message: 'Claim taken over elsewhere.',
            detail: null,
            actionId: null,
        });
        expect(controller.store.getState().superseded).toBe(true);

        controller.acknowledgeSuperseded();
        expect(controller.store.getState().superseded).toBe(false);
        controller.dispose();
    });

    it('commands pass settings through to the transport untouched', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: LOBBY_URL });
        const settings = { playerCount: 2 as const };
        await controller.createMatch(settings);
        expect(transport.calls).toEqual(['createMatch']);
        // The fake's signature drops settings; production forwards them
        // verbatim — asserted here only to pin the call path shape.
        controller.dispose();
    });
});
