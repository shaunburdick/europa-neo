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
 *   1. First visit: a fresh browser mints a local bootstrap claim, the
 *      server issues its OWN opaque id and delivers it through the
 *      directed `identity` event (spec Clarifications v1.6 channel),
 *      the client adopts + persists it, and a handle chosen through
 *      the form is confirmed.
 *   2. "Reload": a brand-new client + controller over the SAME
 *      browser storage re-mounts the landing, presents the STORED
 *      claim (server-delivered id — not a new mint), and the landing
 *      restores to `named` showing the handle without re-entry.
 *
 * No real sockets: the WebSocket is injected (`webSocketFactory`) and
 * every frame is exchanged synchronously with the scripted server.
 * Storage is the PRODUCTION surface (`resolveLobbyStorage()` →
 * window.localStorage) because the remount boundary under test is the
 * real persistence contract; the namespaced key is cleared around
 * every test.
 */

import { register } from '@europa/design/components';

register();

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { LobbyRoot } from '../../../src/internal/lobby-runtime';
import { LOBBY_STORAGE_KEY } from '../../../src/net/lobby-storage';
import type { LobbySnapshot } from '../../../src/net/ws-lobby-client';
import { createWsLobbyClient, type WsLobbyClient } from '../../../src/net/ws-lobby-client';
import { createLobbyController, type LobbyController } from '../../../src/state/lobby-controller';

// ----------------------------------------------------------------------------
// Scripted fake WebSocket + mini lobby server
// ----------------------------------------------------------------------------

/** Minimal constants shared with the scripted server. */
const SERVER_URL = 'ws://lobby.test:8080';
const WIRE_VERSION = '0.1.0';

/** Minimal WebSocket double: records outbound frames, exposes drivers. */
class FakeSocket {
    readonly sent: string[] = [];

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
 * in-memory registry, delivers directed identity events carrying ITS
 * OWN opaque id (v1.6), settles renames with a fresh directed event,
 * and answers subscribe with an empty baseline snapshot.
 */
class ScriptedLobbyServer {
    /** Registry of guest id → accepted handle (`null` while unnamed). */
    private readonly registry: Map<string, string | null>;

    private sessionGuestId: string | null = null;
    private snapshotSeq = 0;

    constructor(
        private readonly socket: FakeSocket,
        registry = new Map<string, string | null>(),
    ) {
        this.registry = registry;
        socket.onSend = (raw) => {
            this.accept(raw);
        };
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
                const claim = frame.payload.claim as { guestPlayerId: string; handle?: string };
                // Unknown claims mint a FRESH server-side identity whose
                // id reaches the browser only through the directed event.
                if (!this.registry.has(claim.guestPlayerId)) {
                    this.registry.set(claim.guestPlayerId, null);
                }
                this.sessionGuestId = claim.guestPlayerId;
                this.deliverIdentity();
                return;
            }
            case 'lobbySetHandle': {
                const handle = frame.payload.handle as string;
                if (this.sessionGuestId !== null) {
                    this.registry.set(this.sessionGuestId, handle);
                    this.deliverIdentity();
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
    private deliverIdentity(): void {
        if (this.sessionGuestId === null) {
            return;
        }
        this.socket.deliver('lobbyEvent', {
            event: {
                kind: 'identity',
                identity: {
                    handle: this.registry.get(this.sessionGuestId) ?? null,
                    hasIdentity: true,
                    guestPlayerId: this.sessionGuestId,
                },
            },
        });
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
async function mountFreshLanding(registry?: Map<string, string | null>): Promise<MountedLobby> {
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
});

afterEach(() => {
    cleanup();
    window.localStorage.removeItem(LOBBY_STORAGE_KEY);
});

describe('lobby identity persistence across a page remount (US1/FR-003)', () => {
    test('first visit mints locally, adopts the server-delivered id, and persists the named claim', async () => {
        const first = await mountFreshLanding();

        // Pre-connect posture: restoring (the persisted-claim question is open).
        expect(first.controller.store.getState().identityStatus).toBe('restoring');

        first.socket.open();
        await first.connecting;

        // Fresh visitor: established but unnamed (US1 AC-1 → AC-2 order).
        expect(first.controller.store.getState().identityStatus).toBe('unnamed');
        expect(first.server.issuedGuestId).not.toBeNull();

        // Choose a handle THROUGH THE FORM.
        const input = first.screen.getByRole('textbox', { name: 'Display name' });
        await input.fill('Nova');
        const setNameBtn = first.screen.getByRole('button', { name: 'Set name' }).element() as HTMLButtonElement;
        await setNameBtn.click();

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
        const registry = new Map<string, string | null>();
        const first = await mountFreshLanding(registry);
        first.socket.open();
        await first.connecting;
        await first.screen.getByRole('textbox', { name: 'Display name' }).fill('Nova');
        const setNameBtn = first.screen.getByRole('button', { name: 'Set name' }).element() as HTMLButtonElement;
        await setNameBtn.click();
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
        // Rename affordance (not first-visit wording) proves the named path.
        await expect.element(second.screen.getByRole('textbox', { name: 'Change name' })).toBeVisible();

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
});
