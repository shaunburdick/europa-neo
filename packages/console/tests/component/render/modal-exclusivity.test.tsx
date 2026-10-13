import { afterEach, describe, expect, test, vi } from 'vitest';
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

async function bootApp(options?: {
    readonly onReturnToLobby?: (() => void) | undefined;
    readonly surrenderRequestEpoch?: number | undefined;
}): Promise<{
    readonly client: FakeMatchClient;
    readonly store: ConsoleStore;
    readonly screen: Awaited<ReturnType<typeof render>>;
}> {
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

    const screen = await render(
        <App
            store={store}
            {...(options?.onReturnToLobby === undefined ? {} : { onReturnToLobby: options.onReturnToLobby })}
            {...(options?.surrenderRequestEpoch === undefined
                ? {}
                : { surrenderRequestEpoch: options.surrenderRequestEpoch })}
        />,
    );
    return { client, store, screen };
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

        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await vi.waitFor(() => {
            expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        });
        const cancel = document.querySelector<HTMLElement>('.europa-modal__button');
        expect(cancel).not.toBeNull();
        expect(document.activeElement).toBe(cancel);

        (cancel as HTMLElement).click();
        await vi.waitFor(() => {
            expect(document.activeElement).toBe(trigger);
        });
        await user.hover(document.body);
    });

    test('closing via Confirm returns focus to the trigger and sends the order', async () => {
        const { client } = await bootApp();
        const user = userEvent.setup();
        const trigger = surrenderTrigger();
        trigger.focus();

        trigger.click();
        await vi.waitFor(() => {
            expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        });
        const confirm = document.querySelector<HTMLElement>('.europa-modal__button--danger');
        expect(confirm).not.toBeNull();

        (confirm as HTMLElement).click();
        await vi.waitFor(() => {
            expect(document.activeElement).toBe(trigger);
        });
        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order.kind).toBe('surrender');
        await user.hover(document.body);
    });

    test('closing via Escape returns focus to the trigger', async () => {
        await bootApp();
        const user = userEvent.setup();
        const trigger = surrenderTrigger();
        trigger.focus();

        trigger.click();
        await vi.waitFor(() => {
            expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        });

        await user.keyboard('{Escape}');
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });
});

describe('modal exclusivity (FR-042)', () => {
    test('a programmatic surrender request while help is open leaves exactly one modal surface', async () => {
        const { store, screen } = await bootApp();
        const user = userEvent.setup();

        (document.activeElement as HTMLElement | null)?.blur();
        await user.keyboard('?');
        expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);

        await screen.rerender(<App store={store} surrenderRequestEpoch={1} />);
        const modals = document.querySelectorAll('[aria-modal="true"]');
        expect(modals).toHaveLength(1);
        expect(modals[0]?.getAttribute('aria-labelledby')).toBe('surrender-title');
    });

    test('with the match terminal the game-over modal is the only modal surface', async () => {
        const { store } = await bootApp({ onReturnToLobby: () => undefined });
        const user = userEvent.setup();

        store.dispatch({
            kind: 'terminal',
            result: { kind: 'win', winner: TEST_PLAYER_1, tick: 42, reason: 'last_standing' },
        });
        await vi.waitFor(() => {
            expect(document.querySelector('#gameover-title')).not.toBeNull();
        });

        expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
        expect(document.querySelector('[aria-modal="true"]')?.getAttribute('aria-labelledby')).toBe('gameover-title');

        (document.activeElement as HTMLElement | null)?.blur();
        await user.keyboard('?');
        expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
        expect(document.querySelector('[aria-modal="true"]')?.getAttribute('aria-labelledby')).toBe('gameover-title');

        const surrender = document.querySelector<HTMLButtonElement>('.europa-hud__surrender');
        expect(surrender?.disabled).toBe(true);
    });
});
