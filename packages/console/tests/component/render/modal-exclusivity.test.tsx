import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { ControlMappingSession } from '../../../src/input/control-mapping';
import { ControlMappingProvider } from '../../../src/input/control-mapping-context';
import {
    GamepadController,
    type GamepadPollEnvironment,
    type StandardGamepadState,
} from '../../../src/input/gamepad-controller';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { App } from '../../../src/render/App';
import { ConsoleRuntime } from '../../../src/runtime';
import { createOrderBridge } from '../../../src/state/order-actions';
import { type ConsoleStore, createConsoleStore } from '../../../src/state/store';
import type {
    ConsoleClient,
    ControlBinding,
    MatchId,
    ReducerEffect,
    SequenceNumber,
    SessionToken,
} from '../../../src/state/types';
import { ControlsEditorHostProvider } from '../../../src/ui/controls-editor-host';
import '../../../src/styles/index.css';
import { buildCellView, buildPlayerView, TEST_PLAYER_1, TEST_PLAYER_2 } from '../../fixtures/player-view';

afterEach(() => {
    cleanup();
});

async function bootApp(options?: {
    readonly onReturnToLobby?: (() => void) | undefined;
    readonly surrenderRequestEpoch?: number | undefined;
    readonly orderableCell?: boolean | undefined;
    readonly withControlsHost?: boolean | undefined;
    readonly mappingSession?: ControlMappingSession | undefined;
    readonly gamepadController?: GamepadController | undefined;
}): Promise<{
    readonly client: FakeMatchClient;
    readonly store: ConsoleStore;
    readonly screen: Awaited<ReturnType<typeof render>>;
}> {
    const view = buildPlayerView({
        width: 10,
        height: 10,
        playerId: TEST_PLAYER_1,
        ...(options?.orderableCell
            ? {
                  visibleCells: [
                      buildCellView({
                          coord: { x: 5, y: 5 },
                          elevation: 60,
                          troops: 10,
                          owner: TEST_PLAYER_1,
                      }),
                      buildCellView({
                          coord: { x: 5, y: 4 },
                          elevation: 60,
                          troops: 10,
                          owner: TEST_PLAYER_1,
                      }),
                  ],
              }
            : {}),
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

    const mappingSession = options?.mappingSession ?? new ControlMappingSession();
    const gamepadController = options?.gamepadController ?? new GamepadController(mappingSession);
    const app = (
        <App
            store={store}
            {...(options?.onReturnToLobby === undefined ? {} : { onReturnToLobby: options.onReturnToLobby })}
            {...(options?.surrenderRequestEpoch === undefined
                ? {}
                : { surrenderRequestEpoch: options.surrenderRequestEpoch })}
        />
    );
    const screen = await render(
        options?.withControlsHost ? (
            <ControlMappingProvider session={mappingSession} gamepadController={gamepadController}>
                <ControlsEditorHostProvider launcherPlacement="host-shell">{app}</ControlsEditorHostProvider>
            </ControlMappingProvider>
        ) : (
            app
        ),
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

function controlledGamepadEnvironment(): {
    readonly environment: GamepadPollEnvironment;
    setPad(pad: StandardGamepadState | null): void;
} {
    let pad: StandardGamepadState | null = null;
    return {
        environment: {
            readGamepads: () => [pad],
            requestFrame: () => 1,
            cancelFrame: () => undefined,
            isHidden: () => false,
            addBlurListener: () => undefined,
            removeBlurListener: () => undefined,
            addVisibilityListener: () => undefined,
            removeVisibilityListener: () => undefined,
        },
        setPad: (nextPad) => {
            pad = nextPad;
        },
    };
}

function standardButtonPad(pressed: boolean): StandardGamepadState {
    return {
        connected: true,
        mapping: 'standard',
        buttons: [{ pressed, value: pressed ? 1 : 0 }],
        axes: [],
    };
}

function embeddingClient(): ConsoleClient {
    return {
        connect: async () => undefined,
        joinMatch: async () => undefined,
        sendOrder: async () => undefined,
        onEnvelope: () => () => undefined,
        state: () => ({
            connection: 'joined',
            sessionToken: null,
            matchId: null,
            playerId: TEST_PLAYER_1,
            lastTick: 0,
            lastSeenServerSeq: 0 as SequenceNumber,
            consoleStatus: 'live',
        }),
        sessionToken: () => null,
        playerId: () => TEST_PLAYER_1,
        close: () => undefined,
    };
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

describe('Controls capture dispatch safety', () => {
    test('capturing a bound keyboard action in the mounted App emits no gameplay action or wire order', async () => {
        const { client, store } = await bootApp({ orderableCell: true, withControlsHost: true });
        const user = userEvent.setup();
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 5 } });
        const beforeCapture = store.getState();

        const openControls = document.querySelector<HTMLButtonElement>('[data-europa-controls-host-launcher="true"]');
        expect(openControls).not.toBeNull();
        await user.click(openControls as HTMLButtonElement);
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).not.toBeNull();
        });

        const changeNorth = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Change Primary binding for Toggle pipe North"]',
        );
        expect(changeNorth).not.toBeNull();
        await user.click(changeNorth as HTMLButtonElement);
        const captureButton = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Change Primary binding for Toggle pipe North"]',
        );
        expect(captureButton).not.toBeNull();
        captureButton?.focus();
        let capturedKeydown: KeyboardEvent | null = null;
        const observeKeydown = (event: KeyboardEvent): void => {
            if (event.key === 'i') capturedKeydown = event;
        };
        const documentKeydown = vi.fn();
        window.addEventListener('keydown', observeKeydown, true);
        document.addEventListener('keydown', documentKeydown);
        await user.keyboard('i');
        window.removeEventListener('keydown', observeKeydown, true);
        document.removeEventListener('keydown', documentKeydown);

        expect(document.body.textContent).toContain('Captured i for Toggle pipe North');
        expect(capturedKeydown?.defaultPrevented).toBe(true);
        expect(documentKeydown).not.toHaveBeenCalled();
        expect(store.getState()).toBe(beforeCapture);
        expect(client.orders).toHaveLength(0);
    });

    test('Gamepad input stays blocked while the host-shell editor is open and until a held button returns neutral', async () => {
        const mappingSession = new ControlMappingSession();
        const currentMapping = mappingSession.getSnapshot();
        const extraBinding: ControlBinding = { kind: 'gamepad-button', mapping: 'standard', button: 0 };
        const replacement = {
            ...currentMapping,
            moveNorth: [...currentMapping.moveNorth, extraBinding],
        };
        expect(mappingSession.replace(replacement).valid).toBe(true);
        const gamepad = controlledGamepadEnvironment();
        const gamepadController = new GamepadController(mappingSession, { environment: gamepad.environment });
        const { client, store, screen } = await bootApp({
            orderableCell: true,
            withControlsHost: true,
            mappingSession,
            gamepadController,
        });
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 5 } });

        const launcher = document.querySelector<HTMLButtonElement>('[data-europa-controls-host-launcher="true"]');
        expect(launcher).not.toBeNull();
        await userEvent.setup().click(launcher as HTMLButtonElement);
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).not.toBeNull();
        });

        gamepad.setPad(standardButtonPad(true));
        gamepadController.pollFrame(10);
        expect(store.getState().selection).toEqual({ x: 5, y: 5 });
        expect(client.orders).toHaveLength(0);

        await screen.getByRole('button', { name: 'Cancel', exact: true }).click();
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).toBeNull();
        });
        gamepadController.pollFrame(20);
        expect(store.getState().selection).toEqual({ x: 5, y: 5 });

        gamepad.setPad(standardButtonPad(false));
        gamepadController.pollFrame(30);
        gamepad.setPad(standardButtonPad(true));
        gamepadController.pollFrame(40);
        expect(store.getState().selection).toEqual({ x: 5, y: 4 });
        expect(client.orders).toHaveLength(0);
    });

    test('embedding host launcher stays outside the sidebar and blocks keyboard/pointer gameplay while open', async () => {
        const { client, store, screen } = await bootApp({ orderableCell: true, withControlsHost: true });
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 5 } });

        const launcher = document.querySelector<HTMLButtonElement>('[data-europa-controls-host-launcher="true"]');
        expect(launcher).not.toBeNull();
        expect(launcher?.closest('.europa-sidebar')).toBeNull();
        expect(document.querySelector('.europa-sidebar button')?.textContent).not.toBe('Configure controls…');
        await userEvent.setup().click(launcher as HTMLButtonElement);
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).not.toBeNull();
        });

        const selectionBeforeInput = store.getState().selection;
        const keyboardInput = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
        document.body.dispatchEvent(keyboardInput);
        const board = document.querySelector<HTMLElement>('.europa-board-area');
        board?.dispatchEvent(
            new PointerEvent('pointerdown', {
                clientX: 176,
                clientY: 176,
                button: 0,
                bubbles: true,
                cancelable: true,
            }),
        );

        expect(store.getState().selection).toEqual(selectionBeforeInput);
        expect(client.orders).toHaveLength(0);
        expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
        await screen.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(document.activeElement).toBe(launcher);
    });

    test('the editor-applied profile is the same mapping used by the first live input', async () => {
        const { client, store, screen } = await bootApp({ orderableCell: true, withControlsHost: true });
        store.dispatch({ kind: 'selectCell', cell: { x: 5, y: 5 } });

        const launcher = document.querySelector<HTMLButtonElement>('[data-europa-controls-host-launcher="true"]');
        expect(launcher).not.toBeNull();
        await userEvent.setup().click(launcher as HTMLButtonElement);
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).not.toBeNull();
        });

        const user = userEvent.setup();
        await user.selectOptions(screen.getByLabelText('Keyboard profile'), 'mmo-wasd');
        await screen.getByRole('button', { name: 'Apply changes' }).click();
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).toBeNull();
        });

        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
        expect(store.getState().selection).toEqual({ x: 5, y: 4 });
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        expect(store.getState().selection).toEqual({ x: 5, y: 4 });
        expect(client.orders).toHaveLength(0);
    });

    test('the real ConsoleRuntime renderer keeps its host-shell mapping for the first App input', async () => {
        const matchId = 'embedded-match' as MatchId;
        const runtime = new ConsoleRuntime({
            config: { client: { url: 'ws://localhost:8080', displayName: 'Embedded', matchId } },
            deps: { clientFactory: () => embeddingClient() },
        });
        const host = document.createElement('div');
        document.body.append(host);

        try {
            await runtime.mountInto(host);
            const view = buildPlayerView({
                width: 10,
                height: 10,
                playerId: TEST_PLAYER_1,
                visibleCells: [
                    buildCellView({
                        coord: { x: 5, y: 5 },
                        elevation: 60,
                        troops: 10,
                        owner: TEST_PLAYER_1,
                    }),
                    buildCellView({
                        coord: { x: 5, y: 4 },
                        elevation: 60,
                        troops: 10,
                        owner: TEST_PLAYER_1,
                    }),
                ],
            });
            runtime.apply({
                kind: 'joined',
                sessionToken: 'embedded-session' as SessionToken,
                playerId: TEST_PLAYER_1,
                view,
                players: [],
            });
            runtime.apply({ kind: 'selectCell', cell: { x: 5, y: 5 } });

            await vi.waitFor(() => {
                expect(host.querySelector('[data-europa-controls-host-launcher="true"]')).not.toBeNull();
            });
            const launcher = host.querySelector<HTMLButtonElement>('[data-europa-controls-host-launcher="true"]');
            expect(launcher).not.toBeNull();
            expect(launcher?.closest('.europa-sidebar')).toBeNull();
            await userEvent.setup().click(launcher as HTMLButtonElement);
            await vi.waitFor(() => {
                expect(host.querySelector('.europa-controls-overlay')).not.toBeNull();
            });

            const profile = host.querySelector<HTMLSelectElement>('.europa-controls-overlay__profile select');
            if (profile === null) throw new Error('Embedded Controls profile selector was not rendered.');
            await userEvent.setup().selectOptions(profile, 'mmo-wasd');
            const apply = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
                (button) => button.textContent?.trim() === 'Apply changes',
            );
            if (apply === undefined) throw new Error('Embedded Controls Apply button was not rendered.');
            await userEvent.setup().click(apply);
            await vi.waitFor(() => {
                expect(host.querySelector('.europa-controls-overlay')).toBeNull();
            });

            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
            expect(runtime.getState().selection).toEqual({ x: 5, y: 4 });
        } finally {
            await runtime.teardown();
            host.remove();
        }
    });

    test('game-over priority closes the host-shell editor without stacking modal surfaces', async () => {
        const { store } = await bootApp({ withControlsHost: true, onReturnToLobby: () => undefined });
        await userEvent
            .setup()
            .click(document.querySelector('[data-europa-controls-host-launcher="true"]') as HTMLElement);
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).not.toBeNull();
        });

        store.dispatch({
            kind: 'terminal',
            result: { kind: 'win', winner: TEST_PLAYER_1, tick: 42, reason: 'last_standing' },
        });

        await vi.waitFor(() => {
            expect(document.querySelector('#gameover-title')).not.toBeNull();
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).toBeNull();
        });
        expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
        expect(document.querySelector('[aria-modal="true"]')?.getAttribute('aria-labelledby')).toBe('gameover-title');
    });

    test('Help and Surrender preempt the host-shell editor without overlapping modals', async () => {
        await bootApp({ withControlsHost: true });
        await userEvent
            .setup()
            .click(document.querySelector('[data-europa-controls-host-launcher="true"]') as HTMLElement);
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).not.toBeNull();
        });

        document.querySelector<HTMLButtonElement>('.europa-help-button')?.click();
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-modal="true"]')?.textContent).toContain('Game Help');
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).toBeNull();
        });
        expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);

        document.querySelector<HTMLButtonElement>('.europa-help-button')?.click();
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-modal="true"]')).toBeNull();
        });
        await userEvent
            .setup()
            .click(document.querySelector('[data-europa-controls-host-launcher="true"]') as HTMLElement);
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).not.toBeNull();
        });

        document.querySelector<HTMLButtonElement>('.europa-hud__surrender')?.click();
        await vi.waitFor(() => {
            expect(document.querySelector('[aria-labelledby="surrender-title"]')).not.toBeNull();
            expect(document.querySelector('[aria-label="Toggle pipe North bindings"]')).toBeNull();
        });
        expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    });
});
