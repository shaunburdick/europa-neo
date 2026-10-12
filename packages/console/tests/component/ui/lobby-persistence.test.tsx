/**
 * Lobby identity PERSISTENCE through a page remount — feature 010 (T-018).
 *
 * Component-tier proof of US1 AC-1..AC-3 and FR-002/FR-003 at the UI
 * level: the storage unit round-trips and the transport's claim
 * restore are pinned elsewhere (tests/unit/net/lobby-storage.test.ts,
 * ws-lobby-client.test.ts); THIS suite mounts the FULL landing runtime
 * (`LobbyRoot` over the REAL `createWsLobbyClient`) twice against a
 * scripted in-page fake server and asserts the reload-restore flow:
 *
 *   1. First visit: a fresh browser presents an advisory claim with NO
 *      identity (issue #74 — the browser never mints one), the server
 *      issues its OWN canonical id and owner-only resume secret and
 *      delivers them through the directed `identity` event (spec
 *      Clarifications v1.6 channel + issue #146), the client adopts +
 *      persists them, and a handle chosen through the form is confirmed.
 *   2. "Reload": a brand-new client + controller over the SAME
 *      browser storage re-mounts the landing, presents the STORED
 *      claim INCLUDING its resume secret (the scripted server restores
 *      only then), and the landing restores to `named` showing the
 *      handle without re-entry.
 *   3. Rename → reload → restore: a secret-less rename emission must not
 *      wipe the stored credential a later reload needs (plan AD-9/Q1a).
 *
 * No real sockets: the WebSocket is injected (`webSocketFactory`) and
 * every frame is exchanged synchronously with the scripted server.
 * Storage is the PRODUCTION surface (`resolveLobbyStorage()` →
 * window.localStorage) because the remount boundary under test is the
 * real persistence contract; the namespaced key is cleared around
 * every test.
 */

import { NETWORK_API_VERSION } from '@europa/networking/browser';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { LOBBY_STORAGE_KEY } from '../../../src/net/lobby-storage';
import type { LobbySnapshot } from '../../../src/net/ws-lobby-client';
import { createWsLobbyClient, type WsLobbyClient } from '../../../src/net/ws-lobby-client';
import { createLobbyController, type LobbyController } from '../../../src/state/lobby-controller';
import { LobbyRootWithLayout as LobbyRoot } from '../../fixtures/lobby-layout-wrapper';

// ----------------------------------------------------------------------------
// Scripted fake WebSocket + mini lobby server
// ----------------------------------------------------------------------------

/** Minimal constants shared with the scripted server. */
const SERVER_URL = 'ws://lobby.test:8080';
const WIRE_VERSION = NETWORK_API_VERSION;

/** Minimal WebSocket double: records outbound frames, exposes drivers. */
class FakeSocket {
    readonly sent: string[] = [];

    /** Platform ready-state (WebSocket.OPEN = 1). */
    readyState = 1;

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;

    /** Outbound frames are mirrored into the bound fake server. */
    onSend: ((raw: string) => void) | null = null;

    send(data: string): void {
        this.sent.push(data);
        this.onSend?.(data);
    }

    close(): void {
        this.onclose?.({ code: 1000 });
    }

    open(): void {
        this.onopen?.();
    }

    deliver(type: string, payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify({ type, version: WIRE_VERSION, seq: 1, payload }) });
    }
}

interface WireFrame {
    readonly type: string;
    readonly payload: Record<string, unknown>;
}

/**
 * One-session fake lobby server: resolves presented claims against an
 * in-memory registry, ISSUES its own canonical id when a client presents
 * none (issue #74 — clients never mint), mints an owner-only resume
 * secret beside every identity (issue #146), RESTORES only a claim that
 * presents the matching secret, delivers directed identity events
 * carrying that secret on establishment and omitting it on rename,
 * settles renames with a fresh directed event, and answers subscribe
 * with an empty baseline snapshot.
 */

/** Registry record for one scripted identity. */
interface ScriptedRecord {
    handle: string | null;
    secret: string;
}

/** Registry of guest id → scripted record, shared across "page loads". */
type ScriptedRegistry = Map<string, ScriptedRecord>;

/**
 * Issued-id counter lives at MODULE scope (reset per test) so a "reload"
 * cannot accidentally re-issue the previous session's id — mint-fresh has
 * to be observable as a different identity.
 */
let issuedCounter = 0;
/** Companion monotonic source for the scripted server's secrets. */
let secretCounter = 0;

function mintScriptedSecret(): string {
    secretCounter += 1;
    return `scripted-secret-${String(secretCounter).padStart(4, '0')}`;
}

class ScriptedLobbyServer {
    private readonly registry: ScriptedRegistry;

    private sessionGuestId: string | null = null;
    private snapshotSeq = 0;

    constructor(
        private readonly socket: FakeSocket,
        registry: ScriptedRegistry = new Map<string, ScriptedRecord>(),
    ) {
        this.registry = registry;
        socket.onSend = (raw) => {
            this.accept(raw);
        };
    }

    /** Mint a canonical 12-character server identity. */
    private issueGuestId(): string {
        issuedCounter += 1;
        return `SrvGuest${String(issuedCounter).padStart(4, '0')}`;
    }

    /** The guest id this server issued for the current session. */
    get issuedGuestId(): string | null {
        return this.sessionGuestId;
    }

    /** Feed one client frame into the fake server. */
    private accept(raw: string): void {
        const frame = JSON.parse(raw) as WireFrame;
        switch (frame.type) {
            case 'hello':
                this.socket.deliver('helloAck', {
                    protocolVersion: WIRE_VERSION,
                    connectionId: 'conn-1',
                    heartbeatIntervalMs: 60_000,
                });
                return;
            case 'lobbyIdentity': {
                const claim = frame.payload.claim as {
                    guestPlayerId?: string;
                    handle?: string;
                    resumeSecret?: string;
                };
                // A first visit presents NO id (issue #74): the server
                // issues its own. A presented id is restored ONLY when the
                // claim carries its matching resume secret (issue #146);
                // an id-only claim is advisory and mints fresh.
                const record = claim.guestPlayerId === undefined ? undefined : this.registry.get(claim.guestPlayerId);
                const authorized =
                    record !== undefined && claim.resumeSecret !== undefined && claim.resumeSecret === record.secret;
                if (authorized && record !== undefined && claim.guestPlayerId !== undefined) {
                    // Single-epoch (D3): a successful restore rotates.
                    record.secret = mintScriptedSecret();
                    this.sessionGuestId = claim.guestPlayerId;
                } else {
                    const fresh = this.issueGuestId();
                    this.registry.set(fresh, { handle: null, secret: mintScriptedSecret() });
                    this.sessionGuestId = fresh;
                }
                this.deliverIdentity(true);
                return;
            }
            case 'lobbySetHandle': {
                const handle = frame.payload.handle as string;
                if (this.sessionGuestId !== null) {
                    const record = this.registry.get(this.sessionGuestId);
                    this.registry.set(this.sessionGuestId, {
                        handle,
                        secret: record?.secret ?? mintScriptedSecret(),
                    });
                    // Rename-path emission: id + handle, NO secret (plan AD-11).
                    this.deliverIdentity(false);
                }
                return;
            }
            case 'lobbySubscribe':
                this.snapshotSeq += 1;
                this.socket.deliver('lobbyEvent', {
                    event: {
                        kind: 'snapshot',
                        snapshot: {
                            revision: this.snapshotSeq,
                            entries: [],
                            activeMatchId: null,
                        } satisfies LobbySnapshot,
                    },
                });
                return;
            default:
                return;
        }
    }

    /** Deliver the directed identity projection for the active session. */
    private deliverIdentity(withSecret: boolean): void {
        if (this.sessionGuestId === null) {
            return;
        }
        const record = this.registry.get(this.sessionGuestId);
        const identity: { handle: string | null; hasIdentity: true; guestPlayerId: string; resumeSecret?: string } = {
            handle: record?.handle ?? null,
            hasIdentity: true,
            guestPlayerId: this.sessionGuestId,
            ...(withSecret && record !== undefined ? { resumeSecret: record.secret } : {}),
        };
        this.socket.deliver('lobbyEvent', { event: { kind: 'identity', identity } });
    }
}

// ----------------------------------------------------------------------------
// Mount harness
// ----------------------------------------------------------------------------

interface MountedLobby {
    readonly controller: LobbyController;
    readonly client: WsLobbyClient;
    readonly socket: FakeSocket;
    readonly server: ScriptedLobbyServer;
    readonly connecting: Promise<void>;
    readonly screen: Awaited<ReturnType<typeof render>>;
}

/**
 * Mount one fresh landing runtime over the PRODUCTION storage surface:
 * real transport client (fake socket injected), real controller, real
 * `LobbyRoot`. Callers drive `socket.open()` to run the establish
 * cycle against the scripted server.
 */
async function mountFreshLanding(registry?: ScriptedRegistry): Promise<MountedLobby> {
    let socket: FakeSocket | null = null;
    const client = createWsLobbyClient({
        webSocketFactory: () => {
            socket = new FakeSocket();
            return socket as unknown as WebSocket;
        },
    });
    const controller = createLobbyController({ transport: client, url: SERVER_URL });
    // Start the connection before rendering so the injected socket exists
    // deterministically, while leaving the open event under test control.
    const connecting = controller.connect(SERVER_URL);
    if (socket === null) {
        throw new Error('transport did not create a socket during connect');
    }
    const server = new ScriptedLobbyServer(socket, registry);
    const screen = await render(<LobbyRoot controller={controller} wsUrl={SERVER_URL} />);
    return { controller, client, socket, server, connecting, screen };
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

beforeEach(() => {
    window.localStorage.removeItem(LOBBY_STORAGE_KEY);
    issuedCounter = 0;
    secretCounter = 0;
});

afterEach(() => {
    cleanup();
    window.localStorage.removeItem(LOBBY_STORAGE_KEY);
});

describe('lobby identity persistence across a page remount (US1/FR-003)', () => {
    test('first visit presents no identity, adopts the server-issued id, and persists the named claim', async () => {
        const first = await mountFreshLanding();

        // Pre-connect posture: restoring (the persisted-claim question is open).
        expect(first.controller.store.getState().identityStatus).toBe('restoring');

        first.socket.open();
        await first.connecting;

        // Fresh visitor: established but unnamed (US1 AC-1 → AC-2 order).
        expect(first.controller.store.getState().identityStatus).toBe('unnamed');
        expect(first.server.issuedGuestId).not.toBeNull();

        // Choose a handle via the controller (identity form now lives at
        // /profile via ProfileView — feature 015 moved the form off the
        // lobby landing). The persistence contract is the same: the handle
        // reaches the store and is persisted to storage.
        await first.controller.setHandle('Nova');

        const named = first.screen.getByText('Nova');
        await expect.element(named).toBeVisible();
        expect(first.controller.store.getState().handle).toBe('Nova');

        // v1.6 adoption: the STORED claim carries the SERVER-delivered id.
        const storedRaw = window.localStorage.getItem(LOBBY_STORAGE_KEY);
        expect(storedRaw).not.toBeNull();
        const stored = JSON.parse(storedRaw ?? '{}') as { guestPlayerId?: string; handle?: string | null };
        expect(stored.guestPlayerId).toBe(first.server.issuedGuestId);
        expect(stored.handle).toBe('Nova');

        first.controller.disconnect();
    });

    test('a remount over the same storage restores the named identity without re-entry', async () => {
        // -- Visit 1: establish + name (setup for the reload) ---------------
        const registry: ScriptedRegistry = new Map();
        const first = await mountFreshLanding(registry);
        first.socket.open();
        await first.connecting;
        // Choose a handle via the controller (identity form now lives at /profile).
        await first.controller.setHandle('Nova');
        await expect.element(first.screen.getByText('Nova')).toBeVisible();
        const issuedId = first.server.issuedGuestId;
        first.controller.disconnect();
        cleanup();

        // -- "Reload": brand-new client/controller over the SAME storage ----
        const second = await mountFreshLanding(registry);
        expect(second.controller.store.getState().identityStatus).toBe('restoring');

        second.socket.open();
        await second.connecting;

        // The restore lands NAMED with the handle shown — no typing.
        expect(second.controller.store.getState().identityStatus).toBe('named');
        expect(second.controller.store.getState().handle).toBe('Nova');
        await expect.element(second.screen.getByText('Nova')).toBeVisible();
        // Named identity shows "Manage profile" link to /profile (feature 015
        // identity flow) — proves the named path without re-entry.
        await expect.element(second.screen.getByRole('link', { name: 'Manage profile' })).toBeVisible();

        // The reload PRESENTED the stored (server-delivered) claim — not
        // a fresh local mint — so the server resolved the SAME identity.
        const identityFrame = second.socket.sent
            .map((raw) => JSON.parse(raw) as WireFrame)
            .find((frame) => frame.type === 'lobbyIdentity');
        expect(identityFrame).toBeDefined();
        const presentedClaim = identityFrame?.payload.claim as { guestPlayerId: string; handle: string };
        expect(presentedClaim.guestPlayerId).toBe(issuedId);
        expect(presentedClaim.handle).toBe('Nova');

        second.controller.disconnect();
    });

    test('rename → reload → restore keeps the identity, the handle, and its credential', async () => {
        // SC-017 trial (a) extended (plan AD-9/Q1a): the RENAME emission
        // carries no secret, so the stored credential must survive it —
        // otherwise the reload below would mint a fresh identity.
        const registry: ScriptedRegistry = new Map();
        const first = await mountFreshLanding(registry);
        first.socket.open();
        await first.connecting;
        await first.controller.setHandle('Nova');
        await expect.element(first.screen.getByText('Nova')).toBeVisible();

        // A SECOND rename through the real client: secret-less emission.
        await first.controller.setHandle('Nova Prime');
        await expect.element(first.screen.getByText('Nova Prime')).toBeVisible();

        const storedRaw = window.localStorage.getItem(LOBBY_STORAGE_KEY);
        const stored = JSON.parse(storedRaw ?? '{}') as {
            guestPlayerId?: string;
            resumeSecret?: string | null;
            handle?: string | null;
        };
        const issuedId = first.server.issuedGuestId;
        expect(stored.guestPlayerId).toBe(issuedId);
        expect(stored.resumeSecret).toBeTypeOf('string');
        expect(stored.handle).toBe('Nova Prime');

        first.controller.disconnect();
        cleanup();

        // -- "Reload": brand-new client/controller over the SAME storage ----
        const second = await mountFreshLanding(registry);
        second.socket.open();
        await second.connecting;

        expect(second.controller.store.getState().identityStatus).toBe('named');
        expect(second.controller.store.getState().handle).toBe('Nova Prime');
        await expect.element(second.screen.getByText('Nova Prime')).toBeVisible();

        // The reload presented the stored credential alongside the id —
        // that is what the scripted server requires to restore.
        const identityFrame = second.socket.sent
            .map((raw) => JSON.parse(raw) as WireFrame)
            .find((frame) => frame.type === 'lobbyIdentity');
        const presentedClaim = identityFrame?.payload.claim as {
            guestPlayerId?: string;
            resumeSecret?: string;
        };
        expect(presentedClaim.guestPlayerId).toBe(issuedId);
        expect(presentedClaim.resumeSecret).toBe(stored.resumeSecret);

        second.controller.disconnect();
    });
});
