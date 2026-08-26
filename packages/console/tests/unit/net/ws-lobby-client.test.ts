/**
 * WsLobbyClient unit tests — feature 010 (T-012).
 *
 * Drives the browser lobby transport client against a scripted fake
 * socket (injected via `webSocketFactory`), a manual scheduler clock,
 * and an in-memory storage double — fully deterministic, no network,
 * no real timers:
 *
 *   - establish cycle sequencing (hello → identity claim → subscribe →
 *     baseline snapshot → ready),
 *   - claim persistence: mint-on-first-visit, restore-on-reload,
 *     corrupted-storage tolerance, forget/expiry clearing, and the
 *     same claim re-presented on reconnect attempts (grace-window
 *     resume),
 *   - action correlation by exact LobbyActionId echo (impostor echoes
 *     ignored; timeouts fire; typed rejections carry code + detail),
 *   - snapshot revision gating (stale/equal discarded; baseline reset
 *     on re-establish adopts post-restart low revisions),
 *   - disconnect/retry state machine ('reconnecting' transient vs
 *     'failed'/'disconnected' terminal vs 'closed' explicit),
 *   - PRIVACY: the opaque guest player id never reaches any log line,
 *     error message, or URL — asserted adversarially with the secret
 *     planted inside server-authored text.
 */

import type { GuestPlayerId, IdentityState, LobbyEvent, LobbyRevision, MatchId } from '@europa/matchmaking';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOBBY_STORAGE_KEY, type LobbyStorage, type StoredLobbyClaim } from '../../../src/net/lobby-storage';
import {
    createWsLobbyClient,
    LobbyActionRejectedError,
    type LobbyClientLogger,
    type LobbyErrorReport,
    type LobbyScheduler,
    type LobbySnapshot,
    LobbyTimeoutError,
    type WsLobbyClient,
    type WsLobbyClientState,
} from '../../../src/net/ws-lobby-client';

// ----------------------------------------------------------------------------
// Scripted fake WebSocket (mirrors ws-match-client.test.ts's double)
// ----------------------------------------------------------------------------

/** Server-seq counter for fabricated inbound envelopes. */
let serverSeq = 0;

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    static reset(): void {
        FakeWebSocket.instances = [];
    }

    readonly url: string;
    readonly sent: string[] = [];
    readonly closed: Array<{ code: number; reason: string }> = [];

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(code?: number, reason?: string): void {
        this.closed.push({ code: code ?? 1005, reason: reason ?? '' });
    }

    // -- Test drivers ---------------------------------------------------------

    open(): void {
        this.onopen?.();
    }

    receive(raw: string): void {
        this.onmessage?.({ data: raw });
    }

    deliver(type: string, payload: unknown): void {
        serverSeq += 1;
        const envelope = { type, version: '0.1.0', seq: serverSeq, payload };
        this.receive(JSON.stringify(envelope));
    }

    deliverLobby(event: LobbyEvent): void {
        this.deliver('lobbyEvent', { event });
    }

    transportClose(code = 1006): void {
        this.onclose?.({ code });
    }
}

// ----------------------------------------------------------------------------
// Manual scheduler (injected clock — no fake-timer globals needed)
// ----------------------------------------------------------------------------

class ManualScheduler implements LobbyScheduler {
    private nextHandle = 0;

    private readonly tasks = new Map<number, { at: number; fn: () => void }>();

    nowMs = 0;

    setTimeout(fn: () => void, ms: number): unknown {
        this.nextHandle += 1;
        this.tasks.set(this.nextHandle, { at: this.nowMs + ms, fn });
        return this.nextHandle;
    }

    clearTimeout(handle: unknown): void {
        this.tasks.delete(handle as number);
    }

    get pendingCount(): number {
        return this.tasks.size;
    }

    /** Time remaining until the EARLIEST due task (`null` when idle). */
    nextDelay(): number | null {
        let earliest: number | null = null;
        for (const task of this.tasks.values()) {
            const remaining = task.at - this.nowMs;
            if (earliest === null || remaining < earliest) {
                earliest = remaining;
            }
        }
        return earliest;
    }

    advance(ms: number): void {
        const target = this.nowMs + ms;
        for (;;) {
            let nextId: number | undefined;
            let nextAt = Number.POSITIVE_INFINITY;
            for (const [id, task] of this.tasks) {
                if (task.at <= target && task.at < nextAt) {
                    nextAt = task.at;
                    nextId = id;
                }
            }
            if (nextId === undefined) {
                break;
            }
            const task = this.tasks.get(nextId);
            this.tasks.delete(nextId);
            this.nowMs = task?.at ?? this.nowMs;
            task?.fn();
        }
        this.nowMs = target;
    }
}

// ----------------------------------------------------------------------------
// Storage + logger doubles
// ----------------------------------------------------------------------------

class MemoryStorage implements LobbyStorage {
    private readonly map = new Map<string, string>();

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    /** Direct write for seeding pre-visit state. */
    seed(raw: string): void {
        this.map.set(LOBBY_STORAGE_KEY, raw);
    }

    read(): string | null {
        return this.map.get(LOBBY_STORAGE_KEY) ?? null;
    }
}

interface LogEntry {
    readonly level: 'debug' | 'info' | 'warn' | 'error';
    readonly msg: string;
    readonly ctx: Readonly<Record<string, unknown>>;
}

function capturingLogger(entries: LogEntry[]): LobbyClientLogger {
    return {
        debug: (msg, ctx) => entries.push({ level: 'debug', msg, ctx: ctx ?? {} }),
        info: (msg, ctx) => entries.push({ level: 'info', msg, ctx: ctx ?? {} }),
        warn: (msg, ctx) => entries.push({ level: 'warn', msg, ctx: ctx ?? {} }),
        error: (msg, ctx) => entries.push({ level: 'error', msg, ctx: ctx ?? {} }),
    };
}

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const CLAIM_A = 'claim-0001' as GuestPlayerId;
const CLAIM_B = 'claim-0002' as GuestPlayerId;

/** Sequential claim-id factory: first call CLAIM_A, second CLAIM_B, … */
function sequentialClaimFactory(): () => GuestPlayerId {
    let n = 0;
    return () => {
        n += 1;
        return `claim-${String(n).padStart(4, '0')}` as GuestPlayerId;
    };
}

function snapshot(revision: number, matchId: string | null = null): LobbySnapshot {
    return {
        revision: revision as LobbyRevision,
        entries: [
            {
                matchId: `match-${revision}` as MatchId,
                seatsFilled: 1,
                capacity: 2,
                status: 'waiting',
                boardSize: 32,
                tickIntervalMs: 250,
            },
        ],
        activeMatchId: (matchId === null ? null : matchId) as MatchId | null,
    };
}

function identityEvent(handle: string | null): Extract<LobbyEvent, { kind: 'identity' }> {
    return { kind: 'identity', identity: { handle, hasIdentity: true } satisfies IdentityState };
}

function acceptedEvent(actionId: number): Extract<LobbyEvent, { kind: 'actionAccepted' }> {
    return { kind: 'actionAccepted', actionId: actionId as never, transition: 'waiting' };
}

type FatalLobbyCode = 'match_full' | 'server_restarted' | 'identity_expired';

function errorEvent(actionId: number | undefined, code: FatalLobbyCode): Extract<LobbyEvent, { kind: 'error' }> {
    return actionId === undefined
        ? { kind: 'error', code, message: `lobby says ${code}` }
        : { kind: 'error', actionId: actionId as never, code, message: `lobby says ${code}` };
}

/** Parse one outbound frame recorded by the fake socket. */
function sentEnvelope(socket: FakeWebSocket, index: number): { type: string; payload: Record<string, unknown> } {
    const raw = socket.sent[index];
    if (raw === undefined) {
        throw new Error(`no outbound frame at index ${String(index)}`);
    }
    return JSON.parse(raw) as { type: string; payload: Record<string, unknown> };
}

/** Flush pending microtasks so promise continuations run. */
async function settlePromises(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------

interface Harness {
    client: WsLobbyClient;
    scheduler: ManualScheduler;
    storage: MemoryStorage;
    logs: LogEntry[];
    errors: LobbyErrorReport[];
    states: string[];
    snapshots: LobbySnapshot[];
    identities: IdentityState[];
}

interface HarnessOptions {
    readonly storage?: LobbyStorage;
    readonly autoReconnect?: boolean;
    readonly maxReconnectAttempts?: number;
    readonly verbose?: boolean;
}

function createHarness(options: HarnessOptions = {}): Harness {
    FakeWebSocket.reset();
    serverSeq = 0;
    const scheduler = new ManualScheduler();
    const storage = options.storage ?? new MemoryStorage();
    const logs: LogEntry[] = [];
    const harness: Harness = {
        scheduler,
        storage,
        logs,
        errors: [],
        states: [],
        snapshots: [],
        identities: [],
        client: createWsLobbyClient({
            webSocketFactory: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
            storage,
            scheduler,
            autoReconnect: options.autoReconnect ?? true,
            maxReconnectAttempts: options.maxReconnectAttempts ?? 6,
            verboseLogging: options.verbose ?? true,
            logger: capturingLogger(logs),
            claimIdFactory: sequentialClaimFactory(),
        }),
    };
    harness.client.onError((report) => {
        harness.errors.push(report);
    });
    harness.client.onStateChange((state) => {
        harness.states.push(state);
    });
    harness.client.onSnapshot((snap) => {
        harness.snapshots.push(snap);
    });
    harness.client.onIdentity((identity) => {
        harness.identities.push(identity);
    });
    return harness;
}

/** Drive one full establish cycle on the CURRENT socket; resolves when 'ready'. */
async function establish(revision = 1): Promise<FakeWebSocket> {
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!(socket instanceof FakeWebSocket)) {
        throw new Error('no socket created');
    }
    socket.open();
    socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'conn-1', heartbeatIntervalMs: 60_000 });
    socket.deliverLobby(identityEvent(null));
    await settlePromises(); // let the subscribe .then chain run its course later
    socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(revision) });
    await settlePromises();
    return socket;
}

/** Create + connect + fully establish. Returns the harness with a READY client. */
async function readyHarness(options: HarnessOptions = {}): Promise<Harness & { socket: FakeWebSocket }> {
    const harness = createHarness(options);
    const connecting = harness.client.connect('ws://lobby');
    const socket = await establish();
    await connecting;
    return { ...harness, socket };
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

afterEach(() => {
    FakeWebSocket.reset();
});

describe('establish cycle', () => {
    it('sequences hello → lobbyIdentity(claim) → lobbySubscribe → ready', async () => {
        const harness = createHarness();
        const connecting = harness.client.connect('ws://lobby');
        expect(harness.client.state().connection).toBe('connecting');

        const socket = FakeWebSocket.instances[0];
        socket.open();
        expect(sentEnvelope(socket, 0).type).toBe('hello');

        socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        const identityFrame = sentEnvelope(socket, 1);
        expect(identityFrame.type).toBe('lobbyIdentity');
        const claim = identityFrame.payload.claim as Record<string, unknown>;
        expect(claim.guestPlayerId).toBe(CLAIM_A);

        socket.deliverLobby(identityEvent(null));
        await settlePromises();
        expect(sentEnvelope(socket, 2).type).toBe('lobbySubscribe');

        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(4) });
        await connecting;
        const state = harness.client.state();
        expect(state.connection).toBe('ready');
        expect(state.lastAppliedRevision).toBe(4 as LobbyRevision);
        expect(state.hasClaim).toBe(true);
    });

    it('rejects a second connect() while active', async () => {
        const { client } = await readyHarness();
        await expect(client.connect('ws://again')).rejects.toThrow(/active client/);
    });

    it('lands in failed (terminal, no retries) on helloAck version mismatch', async () => {
        const harness = createHarness();
        void harness.client.connect('ws://lobby').catch(() => undefined);
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.deliver('helloAck', { protocolVersion: '9.9.9', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        expect(harness.client.state().connection).toBe('failed');
        expect(socket.closed[0]?.code).toBe(1008);
        expect(harness.scheduler.pendingCount).toBe(0);
    });

    it('drops malformed inbound frames without harming the state machine', async () => {
        const { client, socket } = await readyHarness();
        socket.receive('not json at all');
        socket.receive(JSON.stringify({ type: 'lobbyEvent' }));
        expect(client.state().connection).toBe('ready');
    });
});

describe('claim persistence', () => {
    it('mints + persists a fresh claim on first visit', async () => {
        const { storage } = await readyHarness();
        const stored = JSON.parse(storage.read() ?? '') as StoredLobbyClaim;
        expect(stored.guestPlayerId).toBe(CLAIM_A);
        expect(stored.handle).toBeNull();
    });

    it('restores the persisted claim + handle on reload (new client instance)', async () => {
        const storage = new MemoryStorage();
        storage.seed(JSON.stringify({ guestPlayerId: 'claim-777', handle: 'Nova' }));
        const harness = createHarness({ storage });
        const connecting = harness.client.connect('ws://lobby');
        const socket = await establish();

        const identityFrame = sentEnvelope(socket, 1);
        const claim = identityFrame.payload.claim as Record<string, unknown>;
        expect(claim.guestPlayerId).toBe('claim-777');
        expect(claim.handle).toBe('Nova');
        await connecting;
        // The server's directed identity event is authoritative for the
        // DISPLAYED handle; this fixture server has not yet confirmed one.
        expect(harness.client.state().handle).toBeNull();
    });

    it('updates the persisted handle when the server confirms one', async () => {
        const harness = createHarness();
        const connecting = harness.client.connect('ws://lobby');
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        socket.deliverLobby(identityEvent('Nova'));
        await settlePromises();
        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        await connecting;

        const stored = JSON.parse(harness.storage.read() ?? '') as StoredLobbyClaim;
        expect(stored.handle).toBe('Nova');
        expect(harness.client.state().handle).toBe('Nova');
    });

    it('treats corrupted stored JSON as a first visit (fresh mint)', async () => {
        const storage = new MemoryStorage();
        storage.seed('{oops');
        const harness = createHarness({ storage });
        const connecting = harness.client.connect('ws://lobby');
        const socket = await establish();
        await connecting;
        const claim = sentEnvelope(socket, 1).payload.claim as Record<string, unknown>;
        expect(claim.guestPlayerId).toBe(CLAIM_A);
    });

    it('survives unwritable storage (private mode) with an in-memory session', async () => {
        const throwing: LobbyStorage = {
            getItem: () => {
                throw new Error('SecurityError');
            },
            setItem: () => {
                throw new Error('QuotaExceededError');
            },
            removeItem: () => {
                throw new Error('SecurityError');
            },
        };
        const harness = createHarness({ storage: throwing });
        const connecting = harness.client.connect('ws://lobby');
        await establish();
        await connecting;
        expect(harness.client.state().connection).toBe('ready');
        expect(harness.client.state().hasClaim).toBe(true);
        expect(harness.logs.some((entry) => entry.level === 'warn' && entry.msg.includes('persistence'))).toBe(true);
    });

    it('forgetIdentity clears storage; the next connect mints a NEW claim', async () => {
        const harness = await readyHarness();
        expect(harness.storage.read()).not.toBeNull();

        // Local-only semantics: forgetting drops the credential; it does
        // not tear down an active connection (no wire action exists for
        // identity abandonment). Disconnect first, then forget.
        harness.client.disconnect();
        harness.client.forgetIdentity();
        expect(harness.storage.read()).toBeNull();
        expect(harness.client.state().hasClaim).toBe(false);

        const reconnecting = harness.client.connect('ws://lobby');
        await establish();
        await reconnecting;
        const secondClaim = JSON.parse(harness.storage.read() ?? '') as StoredLobbyClaim;
        expect(secondClaim.guestPlayerId).toBe(CLAIM_B);
    });

    it('clears the claim on an uncorrelated server_restarted error and reports it', async () => {
        const { client, socket, storage, errors } = await readyHarness();
        socket.deliverLobby(errorEvent(undefined, 'server_restarted'));
        await settlePromises();

        expect(storage.read()).toBeNull();
        expect(client.state().hasClaim).toBe(false);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.code).toBe('server_restarted');
    });

    it('invalidates the claim when a correlated identity_expired error arrives', async () => {
        const harness = createHarness();
        const connecting = harness.client.connect('ws://lobby');
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        socket.deliverLobby(identityEvent('Nova'));
        await settlePromises();
        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        await connecting;

        const joinPromise = harness.client.joinMatch('m-9' as never);
        const subscribeFrameIndex = 2;
        const joinFrame = sentEnvelope(socket, subscribeFrameIndex + 1);
        const actionId = joinFrame.payload.actionId as number;
        socket.deliverLobby(errorEvent(actionId, 'identity_expired'));

        await expect(joinPromise).rejects.toThrow(/identity_expired/);
        expect(harness.storage.read()).toBeNull();
        expect(harness.errors.map((report) => report.code)).toContain('identity_expired');
    });

    it('invalidates the claim when a confirmed handle drops back to null (post-restart heuristic)', async () => {
        const harness = createHarness();
        const connecting = harness.client.connect('ws://lobby');
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        socket.deliverLobby(identityEvent('Nova'));
        await settlePromises();
        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        await connecting;
        expect(harness.storage.read()).not.toBeNull();

        socket.deliverLobby(identityEvent(null));
        await settlePromises();
        expect(harness.storage.read()).toBeNull();
        expect(harness.client.state().hasClaim).toBe(false);
    });
});

describe('action correlation', () => {
    it('resolves setHandle only after BOTH the echo and the confirming identity arrive', async () => {
        const { client, socket } = await readyHarness();

        const setting = client.setHandle('Nova');
        const frame = sentEnvelope(socket, 3);
        expect(frame.type).toBe('lobbySetHandle');
        expect(frame.payload.handle).toBe('Nova');
        const actionId = frame.payload.actionId as number;

        // Impostor echo first: must be ignored.
        socket.deliverLobby(acceptedEvent(actionId + 41));
        let settled = false;
        void setting.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );
        await settlePromises();
        expect(settled).toBe(false);

        // Correct echo alone still holds (awaiting the authoritative
        // identity confirmation).
        socket.deliverLobby(acceptedEvent(actionId));
        await settlePromises();
        expect(settled).toBe(false);

        // The confirming identity event completes the rename.
        socket.deliverLobby(identityEvent('Nova'));
        await expect(setting).resolves.toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('resolves setHandle when the identity confirmation precedes the echo', async () => {
        const { client, socket } = await readyHarness();
        const setting = client.setHandle('Nova');
        const actionId = sentEnvelope(socket, 3).payload.actionId as number;

        socket.deliverLobby(identityEvent('Nova'));
        await settlePromises();
        socket.deliverLobby(acceptedEvent(actionId));
        await expect(setting).resolves.toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('rejects with typed code + detail on a correlated error echo', async () => {
        const { client, socket } = await readyHarness();
        const joining = client.joinMatch('m-full' as never);
        const frame = sentEnvelope(socket, 3);
        const actionId = frame.payload.actionId as number;

        socket.deliverLobby({
            kind: 'error',
            actionId: actionId as never,
            code: 'match_full',
            message: 'every seat is claimed',
            detail: { matchId: 'm-full', seatsFilled: 2 },
        });

        const failure = await joining.catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(LobbyActionRejectedError);
        const rejected = failure as LobbyActionRejectedError;
        expect(rejected.code).toBe('match_full');
        expect(rejected.detail).toEqual({ matchId: 'm-full', seatsFilled: 2 });
    });

    it('times out an unanswered action with a typed timeout error', async () => {
        const scheduler = new ManualScheduler();
        const storage = new MemoryStorage();
        const client = createWsLobbyClient({
            webSocketFactory: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
            storage,
            scheduler,
            actionTimeoutMs: 50,
            claimIdFactory: sequentialClaimFactory(),
        });
        const connecting = client.connect('ws://lobby');
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        socket.deliverLobby(identityEvent(null));
        await settlePromises();
        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        await connecting;

        const leaving = client.leaveMatch();
        scheduler.advance(51);
        await expect(leaving).rejects.toBeInstanceOf(LobbyTimeoutError);
    });

    it('rejects actions issued before the connection is ready', async () => {
        const { client } = await readyHarness();
        client.disconnect();
        await expect(client.joinMatch('m-1' as never)).rejects.toThrow(/requires a ready lobby connection/);
    });

    it('flushes pending actions with a transport error when the socket dies', async () => {
        const { client, socket } = await readyHarness();
        const creating = client.createMatch();
        socket.transportClose(1006);
        await expect(creating).rejects.toThrow(/socket closed/);
    });
});

describe('snapshot revision gating', () => {
    it('applies strictly newer revisions and discards stale/equal ones', async () => {
        const { client, socket, snapshots } = await readyHarness({ maxReconnectAttempts: 6 });
        expect(snapshots).toHaveLength(1);
        expect(client.state().lastAppliedRevision).toBe(1 as LobbyRevision);

        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(0) });
        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        expect(snapshots).toHaveLength(1);
        expect(client.state().snapshot?.entries[0]?.matchId).toBe('match-1');

        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(2) });
        expect(snapshots).toHaveLength(2);
        expect(client.state().lastAppliedRevision).toBe(2 as LobbyRevision);
    });

    it('re-adopts LOW revisions after a re-establish (server restart simulation)', async () => {
        const harness = createHarness();
        const first = harness.client.connect('ws://lobby');
        const socketA = await establish(50);
        await first;
        expect(harness.client.state().lastAppliedRevision).toBe(50 as LobbyRevision);

        // Transport loss → automatic retry → new socket → fresh cycle.
        socketA.transportClose(1006);
        harness.scheduler.advance(500);
        const socketB = FakeWebSocket.instances[1];
        const reconnecting = harness.client.state();
        expect(reconnecting.connection).toBe('reconnecting');
        socketB.open();
        socketB.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c2', heartbeatIntervalMs: 60_000 });
        socketB.deliverLobby(identityEvent(null));
        await settlePromises();
        // Post-restart the server's revisions restarted from 1.
        socketB.deliverLobby({ kind: 'snapshot', snapshot: snapshot(2) });
        await settlePromises();

        expect(harness.client.state().connection).toBe('ready');
        expect(harness.client.state().lastAppliedRevision).toBe(2 as LobbyRevision);
        expect(harness.snapshots.map((snap) => snap.revision)).toEqual([50, 2]);
    });
});

describe('disconnect / retry state machine', () => {
    it('enters reconnecting with exponential backoff and restores the SAME claim', async () => {
        const harness = createHarness();
        const first = harness.client.connect('ws://lobby');
        const socketA = await establish();
        await first;

        socketA.transportClose(1006);
        expect(harness.client.state().connection).toBe('reconnecting');
        expect(harness.client.state().reconnectAttempt).toBe(1);
        expect(harness.scheduler.nextDelay()).toBe(500);

        harness.scheduler.advance(500);
        const socketB = FakeWebSocket.instances[1];
        socketB.open();
        socketB.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c2', heartbeatIntervalMs: 60_000 });
        const identityFrame = sentEnvelope(socketB, 1);
        expect(identityFrame.type).toBe('lobbyIdentity');
        expect((identityFrame.payload.claim as Record<string, unknown>).guestPlayerId).toBe(CLAIM_A);
    });

    it('doubles the backoff per attempt up to the cap, then fails terminally', async () => {
        const harness = createHarness({ maxReconnectAttempts: 3 });
        const first = harness.client.connect('ws://lobby');
        const socketA = await establish();
        await first;

        const expectedDelays = [500, 1000, 2000];
        let current: FakeWebSocket | undefined = socketA;
        for (const expectedDelay of expectedDelays) {
            current?.transportClose(1006);
            expect(harness.scheduler.nextDelay()).toBe(expectedDelay);
            harness.scheduler.advance(expectedDelay);
            current = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
        }

        // Fourth death exceeds the budget of 3 → 'failed', nothing scheduled.
        current?.transportClose(1006);
        expect(harness.client.state().connection).toBe('failed');
        expect(harness.scheduler.pendingCount).toBe(0);
    });

    it('surfaces a distinct disconnected state when autoReconnect is disabled', async () => {
        const harness = createHarness({ autoReconnect: false });
        const first = harness.client.connect('ws://lobby');
        const socket = await establish();
        await first;

        socket.transportClose(1006);
        expect(harness.client.state().connection).toBe('disconnected');
        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(harness.scheduler.pendingCount).toBe(0);
    });

    it('disconnect() during the retry loop cancels it and lands in closed', async () => {
        const harness = createHarness();
        const first = harness.client.connect('ws://lobby');
        const socket = await establish();
        await first;

        socket.transportClose(1006);
        expect(harness.client.state().connection).toBe('reconnecting');

        harness.client.disconnect();
        expect(harness.client.state().connection).toBe('closed');
        expect(harness.scheduler.pendingCount).toBe(0);

        harness.scheduler.advance(60_000);
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('explicit disconnect closes with code 1000 and keeps the claim for reload-resume', async () => {
        const { client, socket, storage } = await readyHarness();
        client.disconnect();
        expect(socket.closed[0]).toMatchObject({ code: 1000 });
        expect(client.state().connection).toBe('closed');
        expect(storage.read()).not.toBeNull();
    });
});

describe('heartbeat', () => {
    it('pings at half the advertised interval and stops on transport loss', async () => {
        const harness = createHarness();
        const first = harness.client.connect('ws://lobby');
        const socket = await establish(); // heartbeatIntervalMs 60_000 → ping every 30_000
        await first;

        harness.scheduler.advance(29_999);
        expect(socket.sent.some((frame) => frame.includes('"ping"'))).toBe(false);
        harness.scheduler.advance(1);
        expect(socket.sent.filter((frame) => frame.includes('"ping"'))).toHaveLength(1);

        socket.transportClose(1006);
        harness.scheduler.advance(120_000);
        expect(socket.sent.filter((frame) => frame.includes('"ping"'))).toHaveLength(1);
    });
});

describe('privacy — no identity leakage in URLs, logs, or errors', () => {
    it('never mutates the caller-supplied URL across initial connect and retries', async () => {
        const scheduler = new ManualScheduler();
        const storage = new MemoryStorage();
        const urlsSeen: string[] = [];
        const factory = vi.fn((url: string) => {
            urlsSeen.push(url);
            return new FakeWebSocket(url) as unknown as WebSocket;
        });
        const client = createWsLobbyClient({
            webSocketFactory: factory,
            storage,
            scheduler,
            claimIdFactory: sequentialClaimFactory(),
        });
        const first = client.connect('ws://lobby.example:8080/ws');
        const socketA = FakeWebSocket.instances[0];
        socketA.open();
        socketA.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        socketA.deliverLobby(identityEvent('Nova'));
        await settlePromises();
        socketA.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        await first;

        // Transport loss → one automatic retry attempt with the SAME URL.
        socketA.transportClose(1006);
        scheduler.advance(500);

        expect(urlsSeen).toEqual(['ws://lobby.example:8080/ws', 'ws://lobby.example:8080/ws']);
    });

    it('redacts the claim id out of every log line, context value, and server-authored message', async () => {
        const logs: LogEntry[] = [];
        const clientErrors: LobbyErrorReport[] = [];
        const scheduler = new ManualScheduler();
        const storage = new MemoryStorage();
        const client = createWsLobbyClient({
            webSocketFactory: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
            storage,
            scheduler,
            verboseLogging: true,
            logger: capturingLogger(logs),
            claimIdFactory: sequentialClaimFactory(),
        });
        client.onError((report) => {
            clientErrors.push(report);
        });
        const connecting = client.connect('ws://lobby');
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        socket.deliverLobby(identityEvent('Nova'));
        await settlePromises();
        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        await connecting;

        // Server-authored text ECHOING the secret back (hostile-server drill).
        socket.deliverLobby({
            kind: 'error',
            code: 'internal_error',
            message: `registry exploded for ${CLAIM_A} while holding ${CLAIM_A}`,
        });
        await settlePromises();

        const flattened = logs.map((entry) => `${entry.msg} ${JSON.stringify(entry.ctx)}`).join('\n');
        expect(flattened).not.toContain(CLAIM_A);
        expect(flattened).toContain('[redacted]');

        // The onError report channel is sanitized with the same rigor.
        const reports = clientErrors
            .map((report) => `${report.message} ${JSON.stringify(report.detail ?? {})}`)
            .join('\n');
        expect(reports).not.toContain(CLAIM_A);
    });

    it('keeps the claim id out of rejection messages (timeout + transport paths)', async () => {
        const scheduler = new ManualScheduler();
        const storage = new MemoryStorage();
        const client = createWsLobbyClient({
            webSocketFactory: (url: string) => new FakeWebSocket(url) as unknown as WebSocket,
            storage,
            scheduler,
            actionTimeoutMs: 40,
            claimIdFactory: sequentialClaimFactory(),
        });
        const connecting = client.connect('ws://lobby');
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.deliver('helloAck', { protocolVersion: '0.1.0', connectionId: 'c1', heartbeatIntervalMs: 60_000 });
        socket.deliverLobby(identityEvent(null));
        await settlePromises();
        socket.deliverLobby({ kind: 'snapshot', snapshot: snapshot(1) });
        await connecting;

        const timingOut = client.joinMatch('m-1' as never);
        scheduler.advance(41);
        const timeoutError = await timingOut.catch((error: unknown) => error as Error);
        expect(timeoutError.message).not.toContain(CLAIM_A);

        const failing = client.spectateMatch('m-2' as never);
        socket.transportClose(1006);
        const transportError = await failing.catch((error: unknown) => error as Error);
        expect(transportError.message).not.toContain(CLAIM_A);
    });

    it('never writes console.* directly, even with verbose logging enabled', async () => {
        const consoleSpies = ['log', 'debug', 'info', 'warn', 'error'].map((method) =>
            vi.spyOn(console, method as 'log').mockImplementation(() => undefined),
        );
        try {
            const { socket } = await readyHarness({ verbose: true });
            socket.deliverLobby(errorEvent(undefined, 'server_restarted'));
            await settlePromises();
            for (const spy of consoleSpies) {
                expect(spy).not.toHaveBeenCalled();
            }
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('exposes no accessor returning the opaque claim id', async () => {
        const { client } = await readyHarness();
        const state: WsLobbyClientState = client.state();
        const serialized = JSON.stringify(state);
        expect(serialized).not.toContain(CLAIM_A);
        expect(Object.keys(state).some((key) => key.toLowerCase().includes('guest'))).toBe(false);
    });
});
