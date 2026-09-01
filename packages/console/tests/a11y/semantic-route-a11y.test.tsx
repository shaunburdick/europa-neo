/** Feature 013 T011: recovery and spectator accessibility assertions. */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import { App } from '../../src/render/App';
import { initialSpectatorState } from '../../src/state/spectator-session';
import { RouteNotice } from '../../src/ui/route-notice';
import { matchIdOf } from '../fixtures/lobbyTransports';
import { buildPlayerView } from '../fixtures/player-view';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';
import '../../src/styles/index.css';

afterEach(() => {
    cleanup();
});

describe('semantic route accessibility', () => {
    test('unknown-route recovery has an alert, a named heading, and a return action', async () => {
        const screen = await render(
            <RouteNotice
                kind="unknown"
                title="Page not found"
                message="Page not found. Returning to lobby."
                onReturnToLobby={() => undefined}
            />,
        );

        await expect.element(screen.getByRole('alert')).toBeVisible();
        await expect.element(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible();
        await expect.element(screen.getByRole('button', { name: 'Return to lobby' })).toBeEnabled();
        await expectNoDomA11yViolations(screen.container);
    });

    test('spectator rendering remains seatless and disables every order control', async () => {
        const matchId = matchIdOf('room-alpha');
        const state = {
            ...initialSpectatorState(matchId),
            status: 'spectating' as const,
            latestView: buildPlayerView({ width: 4, height: 4, playerId: 0, visibleCells: [] }),
        };

        const screen = await render(<App state={state} />);
        await expect.element(screen.getByRole('region', { name: 'Order palette' })).toBeVisible();
        const orderButtons = screen.getByRole('toolbar', { name: 'Order commands' }).getByRole('button').elements();
        expect(orderButtons).toHaveLength(2);
        for (const button of orderButtons) {
            expect((button as HTMLButtonElement).disabled).toBe(true);
        }
        expect(screen.getByRole('button', { name: 'Surrender…' }).elements()).toHaveLength(0);
        expect(screen.getByRole('region', { name: 'Surrender controls' }).elements()).toHaveLength(0);
        expect(screen.container.textContent).not.toContain('bearer-token');
        await expectNoDomA11yViolations(screen.container);
    });
});
