import { describe, expect, test } from 'vitest';
import { ControlMappingSession } from '../../../src/input/control-mapping';
import {
    GamepadController,
    type GamepadPollEnvironment,
    type StandardGamepadState,
} from '../../../src/input/gamepad-controller';
import { FakeMatchClient } from '../../../src/internal/fake-match-client';
import { HotkeyController } from '../../../src/qol/hotkeys';
import { createOrderBridge } from '../../../src/state/order-actions';
import type { ConsoleStore } from '../../../src/state/store';
import { createConsoleStore } from '../../../src/state/store';
import type { ControlActionId, ControlMapping, Direction, ReducerEffect } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

function gamepadState(
    options: {
        readonly buttons?: readonly number[];
        readonly axes?: readonly number[];
        readonly mapping?: string;
        readonly connected?: boolean;
    } = {},
): StandardGamepadState {
    const values = new Set(options.buttons ?? []);
    return {
        connected: options.connected ?? true,
        mapping: options.mapping ?? 'standard',
        buttons: Array.from({ length: 17 }, (_, index) => ({
            pressed: values.has(index),
            value: values.has(index) ? 1 : 0,
        })),
        axes: options.axes ?? [0, 0, 0, 0],
    };
}

function makeEnvironment(initial: StandardGamepadState | null = gamepadState()): {
    readonly environment: GamepadPollEnvironment;
    setPad(pad: StandardGamepadState | null): void;
    setHidden(hidden: boolean): void;
    blur(): void;
    pendingFrames(): number;
} {
    let pad = initial;
    let hidden = false;
    let nextFrame = 1;
    const frames = new Map<number, (time: number) => void>();
    const blurListeners = new Set<() => void>();
    const visibilityListeners = new Set<() => void>();
    return {
        environment: {
            readGamepads: () => (pad === null ? [] : [pad]),
            requestFrame: (callback) => {
                const handle = nextFrame++;
                frames.set(handle, callback);
                return handle;
            },
            cancelFrame: (handle) => frames.delete(handle),
            isHidden: () => hidden,
            addBlurListener: (listener) => blurListeners.add(listener),
            removeBlurListener: (listener) => blurListeners.delete(listener),
            addVisibilityListener: (listener) => visibilityListeners.add(listener),
            removeVisibilityListener: (listener) => visibilityListeners.delete(listener),
        },
        setPad: (next) => {
            pad = next;
        },
        setHidden: (next) => {
            hidden = next;
            for (const listener of visibilityListeners) listener();
        },
        blur: () => {
            for (const listener of blurListeners) listener();
        },
        pendingFrames: () => frames.size,
    };
}

function makeStore(selection: { x: number; y: number } | null): {
    readonly store: ConsoleStore;
    readonly client: FakeMatchClient;
} {
    const view = buildPlayerView({
        width: 8,
        height: 8,
        playerId: 1,
        visibleCells: [
            buildCellView({
                coord: { x: 4, y: 4 },
                elevation: 50,
                troops: 10,
                owner: 1,
                pipes: new Set<Direction>(),
            }),
        ],
    });
    const client = new FakeMatchClient();
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore({ ...createLiveConsoleState(view), selection }, (effect) => forward?.(effect));
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => bridge.handleEffect(effect);
    return { store, client };
}

function attachController(
    store: ConsoleStore,
    session: ControlMappingSession,
    environment: GamepadPollEnvironment,
): GamepadController {
    const controller = new GamepadController(session, { environment }).attach();
    controller.attachStore(store);
    return controller;
}

function withBinding(
    mapping: ControlMapping,
    action: ControlActionId,
    binding: ControlMapping[ControlActionId][number],
): ControlMapping {
    return { ...mapping, [action]: [...mapping[action], binding] };
}

describe('GamepadController', () => {
    test('Gamepad selection works concurrently with the existing keyboard controller', () => {
        const { store } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const fake = makeEnvironment();
        const keyboard = new HotkeyController(store, { mappingSession: session });
        const gamepad = attachController(store, session, fake.environment);
        keyboard.attach();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        fake.setPad(gamepadState({ buttons: [15] }));
        gamepad.pollFrame(0);
        expect(store.getState().selection).toEqual({ x: 5, y: 3 });

        keyboard.dispose();
        gamepad.dispose();
    });

    test('standard d-pad defaults move selection only and repeat with bounded delay', () => {
        const { store, client } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const fake = makeEnvironment();
        const controller = attachController(store, session, fake.environment);

        fake.setPad(gamepadState({ buttons: [12] }));
        controller.pollFrame(0);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });
        controller.pollFrame(399);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });
        controller.pollFrame(400);
        expect(store.getState().selection).toEqual({ x: 4, y: 2 });
        controller.pollFrame(2_000);
        expect(store.getState().selection).toEqual({ x: 4, y: 1 });
        expect(client.orders).toHaveLength(0);
        controller.dispose();
    });

    test('selection directions stay inside board bounds', () => {
        const { store } = makeStore({ x: 0, y: 0 });
        const session = new ControlMappingSession();
        const fake = makeEnvironment(gamepadState({ buttons: [12, 14] }));
        const controller = attachController(store, session, fake.environment);

        controller.pollFrame(0);
        expect(store.getState().selection).toEqual({ x: 0, y: 0 });
        controller.dispose();
    });

    test('ignores non-standard pads and requires neutral after reconnect before selection input', () => {
        const { store } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const fake = makeEnvironment(gamepadState({ buttons: [12], mapping: 'vendor' }));
        const controller = attachController(store, session, fake.environment);

        controller.pollFrame(0);
        expect(store.getState().selection).toEqual({ x: 4, y: 4 });
        fake.setPad(gamepadState({ buttons: [12], connected: false }));
        controller.pollFrame(100);
        expect(store.getState().selection).toEqual({ x: 4, y: 4 });
        fake.setPad(gamepadState({ buttons: [12] }));
        controller.pollFrame(200);
        expect(store.getState().selection).toEqual({ x: 4, y: 4 });
        fake.setPad(gamepadState());
        controller.pollFrame(250);
        fake.setPad(gamepadState({ buttons: [12] }));
        controller.pollFrame(300);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });
        controller.dispose();
    });

    test('does not treat a held order button as a fresh press after Gamepad disconnect', () => {
        const { store, client } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const mapping = withBinding(session.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
        const multiBinding = withBinding(mapping, 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 1,
        });
        expect(session.replace(multiBinding).valid).toBe(true);
        const fake = makeEnvironment();
        const controller = attachController(store, session, fake.environment);

        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(0);
        expect(client.orders).toHaveLength(1);
        fake.setPad(null);
        controller.pollFrame(100);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(200);
        expect(client.orders).toHaveLength(1);

        fake.setPad(gamepadState());
        controller.pollFrame(300);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(400);
        expect(client.orders).toHaveLength(2);
        controller.dispose();
    });

    for (const boundary of ['blur', 'hidden page', 'disconnect'] as const) {
        test(`requires a neutral sample when a button becomes held across ${boundary}`, () => {
            const { store, client } = makeStore({ x: 4, y: 4 });
            const session = new ControlMappingSession();
            const mapping = withBinding(session.getSnapshot(), 'reserve7', {
                kind: 'gamepad-button',
                mapping: 'standard',
                button: 0,
            });
            expect(session.replace(mapping).valid).toBe(true);
            const fake = makeEnvironment();
            const controller = attachController(store, session, fake.environment);
            controller.pollFrame(0);

            switch (boundary) {
                case 'blur':
                    fake.blur();
                    fake.setPad(gamepadState({ buttons: [0] }));
                    controller.pollFrame(10);
                    break;
                case 'hidden page':
                    fake.setHidden(true);
                    fake.setPad(gamepadState({ buttons: [0] }));
                    fake.setHidden(false);
                    controller.pollFrame(20);
                    break;
                case 'disconnect':
                    fake.setPad(null);
                    controller.pollFrame(10);
                    fake.setPad(gamepadState({ buttons: [0] }));
                    controller.pollFrame(20);
                    break;
            }

            expect(client.orders).toHaveLength(0);
            controller.pollFrame(30);
            expect(client.orders).toHaveLength(0);

            fake.setPad(gamepadState());
            controller.pollFrame(40);
            fake.setPad(gamepadState({ buttons: [0] }));
            controller.pollFrame(50);
            expect(client.orders).toHaveLength(1);
            expect(client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 7 });
            controller.dispose();
        });
    }

    test('flushes held selection repeat when the match goes offline', () => {
        const { store } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const fake = makeEnvironment();
        const controller = attachController(store, session, fake.environment);

        fake.setPad(gamepadState({ buttons: [12] }));
        controller.pollFrame(0);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });
        store.dispatch({ kind: 'socketClosed', code: 1006, reason: 'transport lost' });
        controller.pollFrame(500);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });
        const latestView = store.getState().latestView;
        if (latestView === null) throw new Error('expected a live view for the reconnect fixture');
        store.dispatch({ kind: 'reconnected', view: latestView });
        controller.pollFrame(700);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });

        fake.setPad(gamepadState());
        controller.pollFrame(710);
        fake.setPad(gamepadState({ buttons: [12] }));
        controller.pollFrame(720);
        expect(store.getState().selection).toEqual({ x: 4, y: 2 });
        controller.dispose();
    });

    test('axis activation uses hysteresis and d-pad plus axis produces one action', () => {
        const { store } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const fake = makeEnvironment();
        const controller = attachController(store, session, fake.environment);

        fake.setPad(gamepadState({ buttons: [12], axes: [0, -0.6, 0, 0] }));
        controller.pollFrame(0);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });
        fake.setPad(gamepadState({ axes: [0, -0.4, 0, 0] }));
        controller.pollFrame(100);
        expect(store.getState().selection).toEqual({ x: 4, y: 3 });
        fake.setPad(gamepadState());
        controller.pollFrame(110);
        fake.setPad(gamepadState({ axes: [0, -0.6, 0, 0] }));
        controller.pollFrame(120);
        expect(store.getState().selection).toEqual({ x: 4, y: 2 });
        controller.dispose();
    });

    test('non-directional order bindings activate once per press edge', () => {
        const { store, client } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const mapping = withBinding(session.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
        const multiBinding = withBinding(mapping, 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 1,
        });
        expect(session.replace(multiBinding).valid).toBe(true);
        const fake = makeEnvironment();
        const controller = attachController(store, session, fake.environment);

        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(0);
        controller.pollFrame(50);
        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 7 });
        fake.setPad(gamepadState({ buttons: [0, 1] }));
        controller.pollFrame(100);
        expect(client.orders).toHaveLength(2);
        controller.pollFrame(500);
        expect(client.orders).toHaveLength(2);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(550);
        expect(client.orders).toHaveLength(2);
        fake.setPad(gamepadState());
        controller.pollFrame(600);
        fake.setPad(gamepadState({ buttons: [1] }));
        controller.pollFrame(700);
        expect(client.orders).toHaveLength(3);
        controller.dispose();
    });

    test('capture consumes one activation and held controls stay suppressed until neutral', () => {
        const { store, client } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const mapping = withBinding(session.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
        expect(session.replace(mapping).valid).toBe(true);
        const fake = makeEnvironment(gamepadState());
        const controller = attachController(store, session, fake.environment);
        let captured: ControlMapping[ControlActionId][number] | null = null;
        controller.setCaptureHandler((binding) => {
            captured = binding;
        });
        fake.setPad(gamepadState({ buttons: [1] }));
        controller.pollFrame(0);
        expect(captured).toEqual({ kind: 'gamepad-button', mapping: 'standard', button: 1 });
        expect(client.orders).toHaveLength(0);
        controller.pollFrame(100);
        expect(client.orders).toHaveLength(0);
        fake.setPad(gamepadState());
        controller.pollFrame(200);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(300);
        expect(client.orders).toHaveLength(1);
        controller.dispose();
    });

    test('modal, blur, hidden, disconnect, and unsupported states suppress input safely', () => {
        const { store, client } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const mapping = withBinding(session.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
        expect(session.replace(mapping).valid).toBe(true);
        const fake = makeEnvironment(gamepadState());
        const controller = attachController(store, session, fake.environment);
        controller.setGameplayEnabled(false);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(0);
        controller.setGameplayEnabled(true);
        controller.pollFrame(50);
        expect(client.orders).toHaveLength(0);
        fake.setPad(gamepadState());
        controller.pollFrame(60);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(70);
        expect(client.orders).toHaveLength(1);

        fake.blur();
        fake.setHidden(true);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(80);
        expect(client.orders).toHaveLength(1);
        fake.setHidden(false);
        fake.setPad(gamepadState({ buttons: [0], connected: false }));
        controller.pollFrame(90);
        expect(client.orders).toHaveLength(1);
        controller.dispose();

        const noConnectedPad = makeEnvironment(null);
        const noPadController = new GamepadController(session, { environment: noConnectedPad.environment });
        expect(noPadController.isSupported()).toBe(true);
        noPadController.attach();
        expect(noConnectedPad.pendingFrames()).toBe(1);
        noPadController.dispose();
        expect(noConnectedPad.pendingFrames()).toBe(0);

        const unsupported = makeEnvironment();
        const unsupportedEnvironment: GamepadPollEnvironment = {
            ...unsupported.environment,
            readGamepads: () => null,
        };
        const unsupportedController = new GamepadController(session, { environment: unsupportedEnvironment });
        expect(unsupportedController.isSupported()).toBe(false);
        unsupportedController.attach();
        expect(unsupported.pendingFrames()).toBe(0);
        unsupportedController.dispose();
        expect(unsupported.pendingFrames()).toBe(0);
    });

    test('captures without a store and does not turn the held capture into an order on attach', () => {
        const session = new ControlMappingSession();
        const mapping = withBinding(session.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
        expect(session.replace(mapping).valid).toBe(true);
        const fake = makeEnvironment(gamepadState());
        const controller = new GamepadController(session, { environment: fake.environment }).attach();
        let captured: ControlMapping[ControlActionId][number] | null = null;
        controller.setCaptureHandler((binding) => {
            captured = binding;
        });

        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(0);
        expect(captured).toEqual({ kind: 'gamepad-button', mapping: 'standard', button: 0 });

        const { store, client } = makeStore({ x: 4, y: 4 });
        controller.attachStore(store);
        controller.pollFrame(50);
        expect(client.orders).toHaveLength(0);

        fake.setPad(gamepadState());
        controller.pollFrame(60);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(70);
        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 7 });
        controller.dispose();
    });

    test('reuses one poller and the same applied mapping across store handoff', () => {
        const session = new ControlMappingSession();
        const mapping = withBinding(session.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 1,
        });
        expect(session.replace(mapping).valid).toBe(true);
        const fake = makeEnvironment(gamepadState());
        const controller = new GamepadController(session, { environment: fake.environment }).attach();
        controller.attach();
        expect(fake.pendingFrames()).toBe(1);

        const first = makeStore({ x: 4, y: 4 });
        controller.attachStore(first.store);
        controller.detachStore(first.store);
        const second = makeStore({ x: 4, y: 4 });
        controller.attachStore(second.store);
        fake.setPad(gamepadState({ buttons: [1] }));
        controller.pollFrame(0);

        expect(fake.pendingFrames()).toBe(1);
        expect(first.client.orders).toHaveLength(0);
        expect(second.client.orders).toHaveLength(1);
        expect(second.client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 7 });
        controller.dispose();
        expect(fake.pendingFrames()).toBe(0);
    });

    test('allows a fresh unrelated activation while a reconnect-held input stays suppressed', () => {
        const { store, client } = makeStore({ x: 4, y: 4 });
        const session = new ControlMappingSession();
        const reserve7 = withBinding(session.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
        const mapping = withBinding(reserve7, 'reserve8', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 1,
        });
        expect(session.replace(mapping).valid).toBe(true);
        const fake = makeEnvironment();
        const controller = attachController(store, session, fake.environment);

        fake.setPad(null);
        controller.pollFrame(0);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(10);
        expect(client.orders).toHaveLength(0);

        fake.setPad(gamepadState({ buttons: [0, 1] }));
        controller.pollFrame(20);
        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 8 });

        fake.setPad(gamepadState());
        controller.pollFrame(30);
        fake.setPad(gamepadState({ buttons: [0] }));
        controller.pollFrame(40);
        expect(client.orders).toHaveLength(2);
        expect(client.orders[1]?.order).toMatchObject({ kind: 'setReserves', percent: 7 });
        controller.dispose();
    });

    test('keeps Gamepad owners and dispatch isolated across embedding runtimes', () => {
        const firstSession = new ControlMappingSession();
        const firstMapping = withBinding(firstSession.getSnapshot(), 'reserve7', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
        expect(firstSession.replace(firstMapping).valid).toBe(true);
        const secondSession = new ControlMappingSession();
        const firstPad = makeEnvironment(gamepadState());
        const secondPad = makeEnvironment(gamepadState());
        const firstOwner = new GamepadController(firstSession, { environment: firstPad.environment }).attach();
        const secondOwner = new GamepadController(secondSession, { environment: secondPad.environment }).attach();
        const first = makeStore({ x: 4, y: 4 });
        const second = makeStore({ x: 4, y: 4 });
        firstOwner.attachStore(first.store);
        secondOwner.attachStore(second.store);

        firstPad.setPad(gamepadState({ buttons: [0] }));
        secondPad.setPad(gamepadState({ buttons: [0] }));
        firstOwner.pollFrame(0);
        secondOwner.pollFrame(0);

        expect(first.client.orders).toHaveLength(1);
        expect(first.client.orders[0]?.order).toMatchObject({ kind: 'setReserves', percent: 7 });
        expect(second.client.orders).toHaveLength(0);
        firstOwner.dispose();
        secondOwner.dispose();
    });
});
