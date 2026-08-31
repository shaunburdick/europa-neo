/**
 * Feature 013 T011 component coverage for the route/runtime boundary.
 * These tests exercise the observable lobby hand-off without opening a real
 * match socket: an open waiting match must remain on its waiting plate until
 * the authoritative snapshot says that it has started.
 */

import type { LobbySnapshot } from '@europa/matchmaking';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import { LobbyRoot } from '../../../src/internal/lobby-runtime';
import { parseRoute } from '../../../src/routing/route';
import { createLobbyController } from '../../../src/state/lobby-controller';
import { RouteNotice } from '../../../src/ui/route-notice';
import { entryOf, matchIdOf, ScriptedLobbyTransport, snapshotOf } from '../../fixtures/lobbyTransports';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
});

const MATCH_ID = matchIdOf('room-alpha');

function waitingSnapshot(): LobbySnapshot {
    return snapshotOf([entryOf({ matchId: MATCH_ID, seatsFilled: 1, capacity: 2 })]);
}

describe('semantic route runtime hand-off', () => {
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
