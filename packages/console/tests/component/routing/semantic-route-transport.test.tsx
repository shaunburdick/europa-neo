/** Regression coverage for transport-loss handling in the production route shell. */

import type { LobbySnapshot } from '@europa/matchmaking';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

const matchTransportMock = vi.hoisted(() => {
    let connection: 'pending' | 'joined' | 'disconnected' = 'pending';
    const handlers: Array<(state: typeof connection) => void> = [];

    function emit(next: typeof connection): void {
        connection = next;
        for (const handler of handlers) handler(next);
    }

    return {
        createWsMatchClient: vi.fn(() => ({
            state: () => ({ connection }),
            onConnectionChanged: (handler: (state: typeof connection) => void) => {
                handlers.push(handler);
                return () => undefined;
            },
            disconnect: vi.fn(() => emit('disconnected')),
            lastOrderSeq: () => null,
        })),
        createConsoleClient: vi.fn(() => ({
            connect: vi.fn(async () => {
                emit('joined');
            }),
            joinMatch: vi.fn(async () => undefined),
            onEnvelope: vi.fn(() => () => undefined),
            sendOrder: vi.fn(async () => ({ ok: true })),
            close: vi.fn(() => emit('disconnected')),
        })),
        emit,
        reset: () => {
            connection = 'pending';
            handlers.length = 0;
        },
    };
});

vi.mock('../../../src/net/ws-match-client', () => ({ createWsMatchClient: matchTransportMock.createWsMatchClient }));
vi.mock('../../../src/net/client', () => ({ createConsoleClient: matchTransportMock.createConsoleClient }));

import { LobbyRoot } from '../../../src/internal/lobby-runtime';
import { parseRoute } from '../../../src/routing/route';
import { createLobbyController } from '../../../src/state/lobby-controller';
import { entryOf, matchIdOf, ScriptedLobbyTransport, snapshotOf } from '../../fixtures/lobbyTransports';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
    matchTransportMock.reset();
});

const MATCH_ID = matchIdOf('room-alpha');

function snapshot(status: 'waiting' | 'in_progress'): LobbySnapshot {
    return snapshotOf([entryOf({ matchId: MATCH_ID, seatsFilled: status === 'waiting' ? 1 : 2, status })]);
}

describe('semantic route transport recovery', () => {
    test('normal post-join transport loss keeps the reconnecting surface instead of route failure', async () => {
        const transport = new ScriptedLobbyTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        // Protocol-faithful ordering: the directed identity event ALWAYS
        // precedes the baseline snapshot in a real establish cycle, and
        // route resolution waits for a resolved identity posture (feature
        // 015 gating).
        transport.emitIdentity({ handle: 'Alice', hasIdentity: true });
        transport.emitSnapshot(snapshot('waiting'));

        const screen = await render(
            <LobbyRoot
                controller={controller}
                wsUrl="ws://localhost:8080"
                initialRoute={
                    parseRoute('/match/room-alpha/join') as Extract<ReturnType<typeof parseRoute>, { kind: 'match' }>
                }
            />,
        );
        await expect.element(screen.getByRole('heading', { name: /In match/ })).toBeVisible();

        transport.emitSnapshot(snapshot('in_progress'));
        await expect.element(screen.getByRole('img', { name: 'Game board visual' })).toBeVisible();
        matchTransportMock.emit('disconnected');

        await expect.element(screen.getByRole('alert', { name: '' })).toHaveTextContent('Reconnecting to match…');
        expect(screen.container.querySelector('[data-europa-route-notice]')).toBeNull();
        controller.disconnect();
    });
});
