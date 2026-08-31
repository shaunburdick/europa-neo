/**
 * Feature 013 T011 component coverage for the route/runtime boundary.
 * These tests exercise the observable lobby hand-off without opening a real
 * match socket: an open waiting match must remain on its waiting plate until
 * the authoritative snapshot says that it has started.
 */

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

afterEach(() => {
    cleanup();
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

        await screen.getByRole('button', { name: 'Try again' }).click();
        await screen.getByRole('button', { name: 'Return to lobby' }).click();
        expect(retried).toBe(true);
        expect(returned).toBe(true);
    });

    test('production route resolution renders unavailable recovery without issuing an entry command', async () => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
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

        await screen.getByRole('button', { name: 'Try again' }).click();
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
        await screen.getByRole('button', { name: 'Create match', exact: true }).click();
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
        await screen.getByRole('button', { name: new RegExp(buttonName) }).click();
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
        await screen.getByRole('button', { name: /Join match/ }).click();
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
