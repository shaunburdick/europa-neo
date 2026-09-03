/**
 * Feature 013 T011 component coverage for the route/runtime boundary.
 * These tests exercise the observable lobby hand-off without opening a real
 * match socket: an open waiting match must remain on its waiting plate until
 * the authoritative snapshot says that it has started.
 */

import { register } from '@europa/design/components';

register();

import type { LobbySnapshot } from '@europa/matchmaking';
import { StrictMode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

const spectatorTransportMock = vi.hoisted(() => ({
    rejectFirstConnect: false,
    connectCalls: 0,
    createWsMatchClient: vi.fn(() => ({
        state: () => ({ connection: 'pending' }),
        onConnectionChanged: () => () => undefined,
        disconnect: vi.fn(),
        lastOrderSeq: () => null,
    })),
    createConsoleClient: vi.fn(() => ({
        connect: vi.fn(async () => {
            spectatorTransportMock.connectCalls += 1;
            if (spectatorTransportMock.rejectFirstConnect && spectatorTransportMock.connectCalls === 1) {
                throw new Error('stale StrictMode boot');
            }
        }),
        joinMatch: vi.fn(async () => undefined),
        onEnvelope: () => () => undefined,
        sendOrder: vi.fn(async () => ({ ok: true })),
        close: vi.fn(),
    })),
}));

vi.mock('../../../src/net/ws-match-client', () => ({
    createWsMatchClient: spectatorTransportMock.createWsMatchClient,
}));
vi.mock('../../../src/net/client', () => ({ createConsoleClient: spectatorTransportMock.createConsoleClient }));

import { LobbyRoot } from '../../../src/internal/lobby-runtime';
import { parseRoute } from '../../../src/routing/route';
import { createLobbyController } from '../../../src/state/lobby-controller';
import { RouteNotice } from '../../../src/ui/route-notice';
import { entryOf, matchIdOf, ScriptedLobbyTransport, snapshotOf } from '../../fixtures/lobbyTransports';
import '../../../src/styles/index.css';

afterEach(async () => {
    await cleanup();
    window.history.replaceState({}, '', '/lobby');
    spectatorTransportMock.createWsMatchClient.mockClear();
    spectatorTransportMock.createConsoleClient.mockClear();
    spectatorTransportMock.rejectFirstConnect = false;
    spectatorTransportMock.connectCalls = 0;
    vi.restoreAllMocks();
});

const MATCH_ID = matchIdOf('room-alpha');

function waitingSnapshot(): LobbySnapshot {
    return snapshotOf([entryOf({ matchId: MATCH_ID, seatsFilled: 1, capacity: 2 })]);
}

describe('semantic route runtime hand-off', () => {
    test('does not turn a stale first player boot rejection into Match unavailable under StrictMode', async () => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(waitingSnapshot());
        await controller.joinMatch(MATCH_ID);
        transport.emitSnapshot(
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'in_progress', seatsFilled: 2 })], MATCH_ID),
        );
        spectatorTransportMock.rejectFirstConnect = true;

        const screen = await render(
            <StrictMode>
                <LobbyRoot
                    controller={controller}
                    wsUrl="ws://localhost:8080"
                    initialRoute={
                        parseRoute('/match/room-alpha/join') as Extract<
                            ReturnType<typeof parseRoute>,
                            { kind: 'match' }
                        >
                    }
                />
            </StrictMode>,
        );

        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();
        expect(screen.container.querySelector('[data-europa-route-notice]')).toBeNull();
        expect(spectatorTransportMock.connectCalls).toBe(2);
        controller.disconnect();
    });

    test('does not turn a stale first spectator attach rejection into Match unavailable under StrictMode', async () => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        // Protocol-faithful ordering: the directed identity event ALWAYS
        // precedes the baseline snapshot in a real establish cycle, and
        // route resolution waits for a resolved identity posture (feature
        // 015 gating).
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(snapshotOf([entryOf({ matchId: MATCH_ID, status: 'in_progress', seatsFilled: 2 })]));
        spectatorTransportMock.rejectFirstConnect = true;

        const screen = await render(
            <StrictMode>
                <LobbyRoot
                    controller={controller}
                    wsUrl="ws://localhost:8080"
                    initialRoute={
                        parseRoute('/match/room-alpha') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>
                    }
                />
            </StrictMode>,
        );

        await expect.element(screen.getByRole('heading', { name: 'Spectating' })).toBeVisible();
        expect(screen.container.querySelector('[data-europa-route-notice]')).toBeNull();
        expect(spectatorTransportMock.connectCalls).toBe(2);
        controller.disconnect();
    });

    test('adaptive deep link requests the exact waiting match and stays in the waiting room', async () => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        // Protocol-faithful ordering (see the spectator test above): the
        // identity event precedes the baseline snapshot.
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(waitingSnapshot());

        const screen = await render(
            <LobbyRoot
                controller={controller}
                wsUrl="ws://localhost:8080"
                initialRoute={
                    parseRoute('/match/room-alpha') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>
                }
            />,
        );

        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();
        await expect.element(screen.getByRole('main').getByText(/Waiting for 1 more player/)).toBeVisible();
        await expect
            .element(screen.container.querySelector('[data-europa-live="polite"]') as HTMLElement)
            .toHaveTextContent('Waiting for 1 more player');
        expect(transport.commands).toContainEqual({ kind: 'joinMatch', argument: MATCH_ID });
        expect(transport.commands.some((command) => command.kind === 'spectateMatch')).toBe(false);
        expect(screen.container.querySelector('[data-europa-prestart-plate]')).not.toBeNull();
        controller.disconnect();
    });

    test('a route notice focuses recovery and exposes keyboard-operable actions', async () => {
        let returned = false;
        let retried = false;
        const screen = await render(
            <RouteNotice
                kind="shortcut-failure"
                title="Cannot join this match"
                message="The match is no longer joinable."
                onRetry={() => {
                    retried = true;
                }}
                onReturnToLobby={() => {
                    returned = true;
                }}
            />,
        );

        const panel = screen.container.querySelector('[data-europa-route-notice] section') as HTMLElement;
        expect(panel.getAttribute('role')).toBe('alert');
        expect(document.activeElement).toBe(panel);

        const tryAgainBtn = screen.getByRole('button', { name: 'Try again' }).element() as HTMLButtonElement;
        await tryAgainBtn.click();
        const returnBtn = screen.getByRole('button', { name: 'Return to lobby' }).element() as HTMLButtonElement;
        await returnBtn.click();
        expect(retried).toBe(true);
        expect(returned).toBe(true);
    });

    test('production route resolution renders unavailable recovery without issuing an entry command', async () => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        // Protocol-faithful ordering (see the spectator test above).
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(snapshotOf([]));

        const screen = await render(
            <LobbyRoot
                controller={controller}
                wsUrl="ws://localhost:8080"
                initialRoute={parseRoute('/match/missing') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>}
            />,
        );

        await expect.element(screen.getByRole('alert')).toBeVisible();
        await expect.element(screen.getByRole('heading', { name: 'Match unavailable' })).toBeVisible();
        await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
        expect(transport.commands).toEqual([{ kind: 'connect' }]);
        controller.disconnect();
    });

    test('Try again re-runs a failed shortcut command against the same route', async () => {
        const transport = new ScriptedLobbyTransport();
        transport.failNextCommand('joinMatch', () => new Error('match is temporarily unavailable'));
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        // Protocol-faithful ordering (see the spectator test above).
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(waitingSnapshot());

        const screen = await render(
            <LobbyRoot
                controller={controller}
                wsUrl="ws://localhost:8080"
                initialRoute={
                    parseRoute('/match/room-alpha/join') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>
                }
            />,
        );

        await expect.element(screen.getByRole('alert')).toBeVisible();
        expect(transport.commands.filter((command) => command.kind === 'joinMatch')).toHaveLength(1);

        const tryAgainBtn = screen.getByRole('button', { name: 'Try again' }).element() as HTMLButtonElement;
        await tryAgainBtn.click();
        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();
        expect(transport.commands.filter((command) => command.kind === 'joinMatch')).toHaveLength(2);
        controller.disconnect();
    });
});

describe('same-document semantic history', () => {
    test('successful create creates exactly one semantic history entry', async () => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(snapshotOf([]));
        const pushState = vi.spyOn(window.history, 'pushState');

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        const createBtn = screen.getByRole('button', { name: 'Create match' }).element() as HTMLButtonElement;
        await createBtn.click();
        transport.emitSnapshot(snapshotOf([entryOf({ matchId: MATCH_ID })], MATCH_ID));
        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();

        expect(pushState).toHaveBeenCalledTimes(1);
        expect(window.location.pathname).toBe(`/match/${MATCH_ID}`);
        controller.disconnect();
    });

    test.each([
        ['join', 'waiting', 'Join'],
        ['spectate', 'in_progress', 'Spectate'],
    ] as const)('successful %s creates exactly one semantic history entry', async (action, status, buttonName) => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(
            snapshotOf([entryOf({ matchId: MATCH_ID, status, seatsFilled: status === 'waiting' ? 1 : 2 })]),
        );
        const pushState = vi.spyOn(window.history, 'pushState');

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        const actionBtn = screen.getByRole('button', { name: new RegExp(buttonName) }).element() as HTMLButtonElement;
        await actionBtn.click();
        await expect.element(screen.getByRole('heading', { name: /In match|Spectating/ })).toBeVisible();

        expect(pushState).toHaveBeenCalledTimes(1);
        expect(window.location.pathname).toBe(`/match/${MATCH_ID}/${action}`);
        controller.disconnect();
    });

    test('a failed lobby action does not create a semantic history entry', async () => {
        const transport = new ScriptedLobbyTransport();
        transport.failNextCommand('joinMatch', () => new Error('join rejected'));
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(snapshotOf([entryOf({ matchId: MATCH_ID })]));
        const pushState = vi.spyOn(window.history, 'pushState');

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        const joinBtn = screen.getByRole('button', { name: /Join match/ }).element() as HTMLButtonElement;
        await joinBtn.click();
        await expect.element(screen.getByRole('alert')).toBeVisible();

        expect(pushState).not.toHaveBeenCalled();
        expect(window.location.pathname).toBe('/lobby');
        controller.disconnect();
    });
});

describe('semantic route recovery data', () => {
    test('a missing route notice contains no opaque match identity', async () => {
        const screen = await render(
            <RouteNotice
                kind="unknown"
                title="Page not found"
                message="Page not found. Returning to lobby."
                onReturnToLobby={() => undefined}
            />,
        );

        expect(screen.container.textContent).toBe('Page not foundPage not found. Returning to lobby.Return to lobby');
        expect(screen.container.querySelector('a')).toBeNull();
    });
});

describe('match-route resolution gates (feature 015 live-smoke defect fix)', () => {
    test('defers route resolution while identity is unresolved and never fires an entry command', async () => {
        window.history.replaceState({}, '', '/match/room-alpha/join');
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        // No identity event: the posture stays 'restoring' — the deep link
        // must NOT command a join against an unresolved identity (the old
        // defect fired one and matchmaking rejected it with
        // identity_invalid, planting a sticky Match unavailable notice).
        transport.emitSnapshot(waitingSnapshot());

        const screen = await render(
            <LobbyRoot
                controller={controller}
                wsUrl="ws://localhost:8080"
                initialRoute={
                    parseRoute('/match/room-alpha/join') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>
                }
            />,
        );

        await expect.element(screen.getByRole('heading', { name: 'Europa Neo lobby' })).toBeVisible();
        expect(transport.commands.some((command) => command.kind === 'joinMatch')).toBe(false);
        expect(screen.container.querySelector('[data-europa-route-notice]')).toBeNull();
        controller.disconnect();
    });

    test('an unnamed deep-link visitor is redirected to the profile and the naming round-trip resolves the route', async () => {
        window.history.replaceState({}, '', '/match/room-alpha/join');
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.emitIdentity({ handle: null, hasIdentity: true });
        transport.emitSnapshot(waitingSnapshot());

        const screen = await render(
            <LobbyRoot
                controller={controller}
                wsUrl="ws://localhost:8080"
                initialRoute={
                    parseRoute('/match/room-alpha/join') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>
                }
            />,
        );

        // US3 AC-1: the redirect owns the URL and the profile form renders.
        // The old defect rendered a sticky "Match unavailable" notice over
        // this form because a premature join had already failed.
        await expect.element(screen.getByRole('textbox', { name: 'Display name' })).toBeVisible();
        expect(window.location.pathname).toBe('/profile');
        expect(window.location.search).toContain('returnTo=');
        expect(screen.container.querySelector('[data-europa-route-notice]')).toBeNull();
        expect(transport.commands.some((command) => command.kind === 'joinMatch')).toBe(false);

        // Name yourself through the REAL form: the fixture settles the
        // rename on the directed identity event, the FR-010 auto-navigation
        // pushes the returnTo target, and the deferred route resolves.
        const input = screen.getByRole('textbox', { name: 'Display name' });
        await input.fill('Deeplink');
        await (screen.getByRole('button', { name: 'Set name' }).element() as HTMLButtonElement).click();
        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();
        expect(window.location.pathname).toBe('/match/room-alpha/join');
        expect(transport.commands).toContainEqual({ kind: 'joinMatch', argument: MATCH_ID });
        expect(screen.container.querySelector('[data-europa-route-notice]')).toBeNull();
        controller.disconnect();
    });

    test('route resolution waits for a ready connection even after the baseline snapshot arrives', async () => {
        window.history.replaceState({}, '', '/match/room-alpha/join');
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        // Model the real establish-cycle tail: the baseline snapshot is
        // applied while the transport is still connecting (the ready flip
        // is dispatched a microtask after the snapshot handlers on the
        // wire). The old defect joined in that window and the transport
        // rejected it locally.
        transport.emitConnection('connecting');
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(waitingSnapshot());

        const screen = await render(
            <LobbyRoot
                controller={controller}
                wsUrl="ws://localhost:8080"
                initialRoute={
                    parseRoute('/match/room-alpha/join') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>
                }
            />,
        );

        await expect.element(screen.getByRole('heading', { name: 'Europa Neo lobby' })).toBeVisible();
        expect(transport.commands.some((command) => command.kind === 'joinMatch')).toBe(false);
        expect(screen.container.querySelector('[data-europa-route-notice]')).toBeNull();

        // The ready flip (what the wire delivers when the in-flight cycle
        // completes — controller.connect() would deliberately no-op while
        // the transport reports 'connecting') re-runs the effect and
        // resolves the deferred route.
        transport.emitConnection('ready');
        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();
        expect(transport.commands).toContainEqual({ kind: 'joinMatch', argument: MATCH_ID });
        controller.disconnect();
    });
});
