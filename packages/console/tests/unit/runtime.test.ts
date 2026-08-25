/**
 * Runtime + factory unit tests — Feature 005 (T086/T087).
 *
 * Drives the console runtime headlessly (happy-dom): a fake
 * MatchClient-like adapter stands in for feature 004's browser client,
 * fake renderer/input factories record lifecycle calls, and the store
 * is observed through the public surface. Covers the reducer-effect
 * interpretation contract (state first, then effects), wire-order
 * ActionId uniqueness, surrender flows, teardown semantics, and the
 * mount handshake including connection-failure resilience.
 */

import { describe, expect, it } from 'vitest';

import type { ConsoleConfig, ConsoleDeps } from '../../contracts/console-api';
import { createConsole } from '../../src/create-console';
import { createConsoleClient } from '../../src/net/client';
import { ConsoleRuntime } from '../../src/runtime';
import type {
    ActionId,
    ConsoleState,
    NetworkPayload,
    Order,
    ProtocolEnvelope,
    QoLSettings,
    SessionToken,
} from '../../state/types';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Full MatchClient-shaped fake (passes the adapter's guard). */
class FakeMatchClientLike {
    private readonly orderLog: Order[] = [];

    /** Every submitted order, in send order. */
    get sent(): readonly Order[] {
        return this.orderLog;
    }

    private handlers = new Set<(envelope: ProtocolEnvelope<NetworkPayload>) => void>();

    connectCalls = 0;

    joinCalls = 0;

    closed = false;

    /** When set, connect() rejects — drives the failure path. */
    failConnect = false;

    async connect(): Promise<void> {
        this.connectCalls += 1;
        if (this.failConnect) {
            throw new Error('boom: socket refused');
        }
    }

    disconnect(): void {
        this.closed = true;
    }

    async joinMatch(_req: {
        readonly matchId: string;
        readonly role: 'player' | 'spectator';
        readonly reconnectToken?: string;
        readonly displayName: string;
    }): Promise<void> {
        this.joinCalls += 1;
    }

    async sendOrder(order: Order): Promise<import('@europa/engine').CommandResult> {
        this.orderLog.push(order);
        return { ok: true };
    }

    onMessage(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }

    state(): {
        readonly connection: 'joined';
        readonly sessionToken: string | null;
        readonly matchId: string | null;
        readonly playerId: number | null;
        readonly lastTick: number;
        readonly lastSeenServerSeq: number;
    } {
        return {
            connection: 'joined',
            sessionToken: null,
            matchId: null,
            playerId: null,
            lastTick: 0,
            lastSeenServerSeq: 0,
        };
    }
}

/** Recorded lifecycle calls for the fake renderer/input. */
interface LifecycleLog {
    readonly rendererMounts: string[];
    readonly rendererUnmounts: number;
    readonly inputStarts: number;
    readonly inputStops: number;
}

/** Lifecycle log whose counters tests never assert on. */
const NOOP_LOG: LifecycleLog = {
    rendererMounts: [],
    rendererUnmounts: 0,
    inputStarts: 0,
    inputStops: 0,
};

function makeDeps(client: FakeMatchClientLike, log: LifecycleLog): ConsoleDeps {
    return {
        // Wrap the raw MatchClient-like in the REAL console adapter so the
        // bridge sees the contractual onEnvelope surface.
        clientFactory: (config) => createConsoleClient(config, { matchClientFactory: () => client }),
        rendererFactory: () => ({
            mount(container: HTMLElement) {
                log.rendererMounts.push(container.tagName);
            },
            unmount() {
                log.rendererUnmounts += 1;
            },
        }),
        inputFactory: () => ({
            start: () => {
                log.inputStarts += 1;
            },
            stop: () => {
                log.inputStops += 1;
            },
            teardown: () => undefined,
        }),
        clock: (() => {
            let now = 1000;
            return () => {
                now += 250;
                return now;
            };
        })(),
    };
}

function makeConfig(overrides?: {
    readonly displayName?: string;
    readonly qolSettings?: QoLSettings;
    readonly persist?: (settings: QoLSettings) => void;
    readonly onSurrenderRequest?: () => void;
    readonly matchId?: string;
}): ConsoleConfig {
    const client: ConsoleConfig['client'] = {
        url: 'ws://localhost:8080',
        displayName: overrides?.displayName ?? 'Alice',
        ...(overrides?.matchId !== undefined ? { matchId: overrides.matchId as never } : {}),
    };
    return {
        client,
        ...(overrides?.qolSettings !== undefined ? { qolSettings: overrides.qolSettings } : {}),
        ...(overrides?.persist !== undefined ? { persist: overrides.persist } : {}),
        ...(overrides?.onSurrenderRequest !== undefined ? { onSurrenderRequest: overrides.onSurrenderRequest } : {}),
    };
}

// ---------------------------------------------------------------------------
// Construction + contractual surface
// ---------------------------------------------------------------------------

describe('ConsoleRuntime (T086)', () => {
    it('seeds QoL settings and display name from config', () => {
        const qol: Partial<QoLSettings> = { ownerColorRing: true };
        const runtime = new ConsoleRuntime({
            config: makeConfig({
                displayName: 'Bob',
                qolSettings: qol as QoLSettings,
            }),
            deps: makeDeps(new FakeMatchClientLike(), NOOP_LOG),
        });
        expect(runtime.getState().session.displayName).toBe('Bob');
        expect(runtime.getState().qol.ownerColorRing).toBe(true);
    });

    it('apply() advances state and subscribe() observes each publish', () => {
        const runtime = new ConsoleRuntime({
            config: makeConfig(),
            deps: makeDeps(new FakeMatchClientLike(), NOOP_LOG),
        });
        const seen: ConsoleState[] = [];
        runtime.subscribe((state) => seen.push(state));
        runtime.apply({ kind: 'selectCell', cell: { x: 2, y: 3 } });
        expect(runtime.getState().selection).toEqual({ x: 2, y: 3 });
        expect(seen).toHaveLength(1);
        expect(seen[0]?.selection).toEqual({ x: 2, y: 3 });
    });

    it('interprets reducer effects: persistQol → host callback', () => {
        const persisted: QoLSettings[] = [];
        const runtime = new ConsoleRuntime({
            config: makeConfig({ persist: (settings) => persisted.push(settings) }),
            deps: makeDeps(new FakeMatchClientLike(), NOOP_LOG),
        });
        runtime.apply({ kind: 'setQol', patch: { gridlines: false } });
        expect(persisted).toHaveLength(1);
        expect(persisted[0]?.gridlines).toBe(false);
    });

    it('routes sendOrder effects through the bridge to the client', async () => {
        const client = new FakeMatchClientLike();
        const runtime = new ConsoleRuntime({
            config: makeConfig(),
            deps: makeDeps(client, {
                rendererMounts: [],
                rendererUnmounts: 0,
                inputStarts: 0,
                inputStops: 0,
            }),
        });
        // Seed a joined state so the reducer's live-input gate opens.
        runtime.apply({ kind: 'connecting', matchId: 'm-1' });
        runtime.apply({
            kind: 'joined',
            sessionToken: 'tok' as SessionToken,
            playerId: 1,
            view: emptyView(),
            players: [],
        });
        runtime.apply({ kind: 'setPipe', cell: { x: 3, y: 8 }, direction: 'N' });
        // The bridge's sendOrder promise resolves on the microtask queue.
        await Promise.resolve();
        await Promise.resolve();
        expect(client.sent).toHaveLength(1);
        expect(client.sent[0]?.kind).toBe('setPipe');
    });

    it('sendWireOrder allocates globally-unique ActionIds and hits the wire', async () => {
        const client = new FakeMatchClientLike();
        const runtime = new ConsoleRuntime({
            config: makeConfig(),
            deps: makeDeps(client, {
                rendererMounts: [],
                rendererUnmounts: 0,
                inputStarts: 0,
                inputStops: 0,
            }),
        });
        const first = runtime.sendWireOrder({ kind: 'surrender', player: 1 });
        const second = runtime.sendWireOrder({ kind: 'surrender', player: 1 });
        expect(first).not.toBe(second);
        expect([first, second] as ActionId[]).toHaveLength(new Set([first, second]).size);
        await Promise.resolve();
        expect(client.sent).toHaveLength(2);
    });

    it('requestSurrender delegates to the host callback when configured', async () => {
        let calls = 0;
        const runtime = new ConsoleRuntime({
            config: makeConfig({
                onSurrenderRequest: () => {
                    calls += 1;
                },
            }),
            deps: makeDeps(new FakeMatchClientLike(), NOOP_LOG),
        });
        await runtime.requestSurrender();
        expect(calls).toBe(1);
        expect(runtime.getSurrenderEpoch()).toBe(0);
    });

    it('requestSurrender bumps the modal epoch when no host callback exists', async () => {
        const runtime = new ConsoleRuntime({
            config: makeConfig(),
            deps: makeDeps(new FakeMatchClientLike(), NOOP_LOG),
        });
        const epochs: number[] = [];
        const unsubscribe = runtime.subscribeSurrenderEpoch(() => {
            epochs.push(runtime.getSurrenderEpoch());
        });
        await runtime.requestSurrender();
        await runtime.requestSurrender();
        expect(runtime.getSurrenderEpoch()).toBe(2);
        expect(epochs).toEqual([1, 2]);
        unsubscribe();
    });

    it('teardown stops everything and is idempotent; the handle is then unusable', async () => {
        const client = new FakeMatchClientLike();
        const log: LifecycleLog = {
            rendererMounts: [],
            rendererUnmounts: 0,
            inputStarts: 0,
            inputStops: 0,
        };
        const runtime = new ConsoleRuntime({
            config: makeConfig(),
            deps: makeDeps(client, log),
        });
        const container = document.createElement('div');
        await runtime.mountInto(container);
        await runtime.teardown();
        await runtime.teardown(); // idempotent
        expect(log.inputStops).toBe(1);
        expect(log.rendererUnmounts).toBe(1);
        expect(client.closed).toBe(true);
        expect(container.querySelectorAll('[data-europa-live]')).toHaveLength(0);
        expect(() => runtime.apply({ kind: 'selectCell', cell: null })).toThrow(/unmounted/);
    });

    describe('mountInto', () => {
        it('runs the connect→joinMatch handshake and starts renderer+input', async () => {
            const client = new FakeMatchClientLike();
            const log: LifecycleLog = {
                rendererMounts: [],
                rendererUnmounts: 0,
                inputStarts: 0,
                inputStops: 0,
            };
            const runtime = new ConsoleRuntime({
                config: makeConfig({ matchId: 'm-9' }),
                deps: makeDeps(client, log),
            });
            const container = document.createElement('div');
            await runtime.mountInto(container);
            expect(runtime.getState().status).toBe('connecting');
            expect(client.connectCalls).toBe(1);
            expect(client.joinCalls).toBe(1);
            expect(log.rendererMounts).toEqual(['DIV']);
            expect(log.inputStarts).toBe(1);
            // Live regions mounted for announce effects.
            expect(container.querySelectorAll('[data-europa-live]')).toHaveLength(2);
        });

        it('is idempotent on double mount', async () => {
            const client = new FakeMatchClientLike();
            const log: LifecycleLog = {
                rendererMounts: [],
                rendererUnmounts: 0,
                inputStarts: 0,
                inputStops: 0,
            };
            const runtime = new ConsoleRuntime({
                config: makeConfig(),
                deps: makeDeps(client, log),
            });
            const container = document.createElement('div');
            await runtime.mountInto(container);
            await runtime.mountInto(container);
            expect(client.connectCalls).toBe(1);
            expect(log.rendererMounts).toHaveLength(1);
        });

        it('renders the real React App when no rendererFactory is injected', async () => {
            // Default renderer path: React 19 mounts the App tree into the
            // container (happy-dom). The pre-join state renders chrome only.
            const runtime = new ConsoleRuntime({
                config: makeConfig(),
                deps: {
                    // Real adapter over the fake MatchClient; NO rendererFactory
                    // so the built-in ReactAppRenderer mounts the actual App.
                    clientFactory: (config) =>
                        createConsoleClient(config, { matchClientFactory: () => new FakeMatchClientLike() }),
                },
            });
            const container = document.createElement('div');
            document.body.append(container);
            await runtime.mountInto(container);
            // React 19 commits concurrently — flush the scheduler before
            // asserting on the DOM.
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(container.querySelector('#main')).not.toBeNull();
            expect(container.querySelector('#skip-link')).not.toBeNull();
            await runtime.teardown();
            container.remove();
        });

        it('survives connection failure: surfaces an error and still mounts UI', async () => {
            const client = new FakeMatchClientLike();
            client.failConnect = true;
            const log: LifecycleLog = {
                rendererMounts: [],
                rendererUnmounts: 0,
                inputStarts: 0,
                inputStops: 0,
            };
            const runtime = new ConsoleRuntime({
                config: makeConfig({ matchId: 'm-1' }),
                deps: makeDeps(client, log),
            });
            await runtime.mountInto(document.createElement('div'));
            expect(runtime.getState().feedback.some((f) => f.kind === 'error')).toBe(true);
            expect(log.rendererMounts).toHaveLength(1);
        });

        it('routes post-mount announce and reconnect effects through the interpreter', async () => {
            const clips: string[] = [];
            const log: LifecycleLog = {
                rendererMounts: [],
                rendererUnmounts: 0,
                inputStarts: 0,
                inputStops: 0,
            };
            const runtime = new ConsoleRuntime({
                config: makeConfig({ matchId: 'm-1' }),
                deps: {
                    ...makeDeps(new FakeMatchClientLike(), log),
                    soundPlayer: {
                        play: (clip) => {
                            clips.push(clip);
                        },
                        setMuted: () => undefined,
                    },
                },
            });
            const container = document.createElement('div');
            await runtime.mountInto(container);

            // Reconnected → polite announcement into the live region.
            runtime.apply({ kind: 'reconnected', view: emptyView() });
            const polite = container.querySelector('[data-europa-live="polite"]');
            expect(polite?.textContent).toBe('Reconnected to match');

            // Reconnecting → scheduleReconnect effect (logged, no timer).
            expect(() => runtime.apply({ kind: 'reconnecting', attempt: 1, nextRetryMs: 500 })).not.toThrow();

            // A live gesture plays its confirmation through the sound seam.
            runtime.apply({ kind: 'selectCell', cell: { x: 1, y: 1 } });
            expect(clips).toEqual([]);
        });
    });
});

// ---------------------------------------------------------------------------
// createConsole facade (T087)
// ---------------------------------------------------------------------------

describe('createConsole (T087)', () => {
    it('exposes the contractual facade over a fresh runtime', async () => {
        const client = new FakeMatchClientLike();
        const log: LifecycleLog = {
            rendererMounts: [],
            rendererUnmounts: 0,
            inputStarts: 0,
            inputStops: 0,
        };
        const europa = createConsole(makeConfig(), makeDeps(client, log));
        const before = europa.getState();
        expect(before.status).toBe('idle');

        let announced: ConsoleState | null = null;
        const unsubscribe = europa.subscribe((state) => {
            announced = state;
        });
        europa.dispatch({ kind: 'selectCell', cell: { x: 1, y: 1 } });
        expect(europa.getState().selection).toEqual({ x: 1, y: 1 });
        expect((announced as ConsoleState | null)?.selection).toEqual({ x: 1, y: 1 });
        unsubscribe();

        // Partial-camera merge semantics.
        europa.setCamera({ zoom: 48 });
        expect(europa.getState().camera.zoom).toBe(48);
        expect(europa.getState().camera.minZoom).toBe(12);

        // Session accessors before join.
        expect(europa.getSessionToken()).toBeNull();
        expect(europa.getPlayerId()).toBeNull();
        expect(europa.getConnectionStatus()).toBe('idle');

        await europa.mount(document.createElement('div'));
        await europa.unmount();
    });

    it('sendOrder returns correlatable ActionIds', () => {
        const europa = createConsole(
            makeConfig(),
            makeDeps(new FakeMatchClientLike(), {
                rendererMounts: [],
                rendererUnmounts: 0,
                inputStarts: 0,
                inputStops: 0,
            }),
        );
        const id: ActionId = europa.sendOrder({ kind: 'surrender', player: 1 });
        expect(typeof id).toBe('number');
        expect(id).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal fog view for seeding joined states. */
function emptyView(): import('../../state/types').PlayerView {
    return {
        player: 1,
        tick: 1,
        visibleCells: [],
        events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
        config: {
            boardSize: 16,
            playerCount: 2,
            tickIntervalMs: 250,
            seed: 0,
            visibilityRadius: 2,
        },
    };
}
