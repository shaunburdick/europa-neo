import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { App } from '../../../src/render/App';
import { createOrderBridge } from '../../../src/state/order-actions';
import { type ConsoleStore, createConsoleStore } from '../../../src/state/store';
import type { ReducerEffect } from '../../../src/state/types';
import '../../../src/styles/index.css';
import { buildPlayerView, TEST_PLAYER_1, TEST_PLAYER_2 } from '../../fixtures/player-view';

afterEach(() => {
    cleanup();
});

async function bootApp(): Promise<{ readonly client: FakeMatchClient; readonly store: ConsoleStore }> {
    const view = buildPlayerView({
        width: 10,
        height: 10,
        playerId: TEST_PLAYER_1,
    });
    const client = new FakeMatchClient();
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore(
        {
            status: 'live',
            inputEnabled: true,
            latestView: view,
            camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 32, maxZoom: 96 },
            hover: null,
            selection: null,
            lastCursorScreen: null,
            feedback: [],
            rejectedOrders: [],
            qol: {
                soundOn: false,
                animation: 'full',
                tooltips: true,
                theme: 'system',
                ownerColorRing: true,
            },
            session: {
                matchId: null,
                sessionToken: null,
                playerId: TEST_PLAYER_1,
                displayName: 'Player 1',
                participants: [
                    { id: TEST_PLAYER_1, name: 'Player 1', isLocal: true },
                    { id: TEST_PLAYER_2, name: 'Player 2', isLocal: false },
                ],
                playerNames: new Map(),
            },
            exclusiveMode: false,
        },
        (effect) => {
            forward?.(effect);
        },
    );
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => bridge.handleEffect(effect);

    await render(<App store={store} />);
    return { client, store };
}

function surrenderTrigger(): HTMLElement {
    const trigger = document.querySelector<HTMLElement>('.europa-hud__surrender');
    if (trigger === null) {
        throw new Error('surrender trigger not rendered');
    }
    return trigger;
}

describe('surrender dialog focus restore (FR-009)', () => {
    test('closing via Cancel returns focus to the trigger', async () => {
        await bootApp();
        const user = userEvent.setup();
        const trigger = surrenderTrigger();
        trigger.focus();

        await user.click(trigger);
        const cancel = document.querySelector<HTMLElement>('.europa-modal__button');
        expect(cancel).not.toBeNull();
        expect(document.activeElement).toBe(cancel);

        await user.click(cancel as HTMLElement);
        expect(document.activeElement).toBe(trigger);
    });

    test('closing via Confirm returns focus to the trigger and sends the order', async () => {
        const { client } = await bootApp();
        const user = userEvent.setup();
        const trigger = surrenderTrigger();
        trigger.focus();

        await user.click(trigger);
        const confirm = document.querySelector<HTMLElement>('.europa-modal__button--danger');
        expect(confirm).not.toBeNull();

        await user.click(confirm as HTMLElement);
        expect(document.activeElement).toBe(trigger);
        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order.kind).toBe('surrender');
    });

    test('closing via Escape returns focus to the trigger', async () => {
        await bootApp();
        const user = userEvent.setup();
        const trigger = surrenderTrigger();
        trigger.focus();

        await user.click(trigger);
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();

        await user.keyboard('{Escape}');
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });
});
