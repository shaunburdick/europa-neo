import type { ConsoleStore } from '../state/store';
import type { ControlActionId, ControlBinding, CursorTarget } from '../state/types';
import type { ControlMappingReader } from './control-mapping';
import { CONTROL_ACTION_IDS } from './control-mapping';
import { isOrderProducingAction, translateControlAction } from './order-draft';

const BUTTON_PRESS_THRESHOLD = 0.55;
const BUTTON_RELEASE_THRESHOLD = 0.35;
const AXIS_PRESS_THRESHOLD = 0.55;
const AXIS_RELEASE_THRESHOLD = 0.35;
const MOVE_REPEAT_DELAY_MS = 400;
const MOVE_REPEAT_INTERVAL_MS = 140;
const MAX_BUTTONS = 32;
const MAX_AXES = 4;

export interface StandardGamepadButtonState {
    readonly pressed: boolean;
    readonly value: number;
}

export interface StandardGamepadState {
    readonly connected: boolean;
    readonly mapping: string;
    readonly buttons: readonly StandardGamepadButtonState[];
    readonly axes: readonly number[];
}

export interface GamepadPollEnvironment {
    readGamepads(): readonly (StandardGamepadState | null)[] | null;
    requestFrame(callback: (time: number) => void): number;
    cancelFrame(handle: number): void;
    isHidden(): boolean;
    addBlurListener(listener: () => void): void;
    removeBlurListener(listener: () => void): void;
    addVisibilityListener(listener: () => void): void;
    removeVisibilityListener(listener: () => void): void;
}

export type GamepadCaptureHandler = (binding: ControlBinding) => void;

export interface GamepadControllerOptions {
    readonly environment?: GamepadPollEnvironment;
}

interface HeldMove {
    nextAt: number;
}

function browserEnvironment(): GamepadPollEnvironment {
    return {
        readGamepads: () => {
            if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
            try {
                return Array.from(navigator.getGamepads(), (gamepad) =>
                    gamepad === null
                        ? null
                        : {
                              connected: gamepad.connected,
                              mapping: gamepad.mapping,
                              buttons: Array.from(gamepad.buttons, ({ pressed, value }) => ({ pressed, value })),
                              axes: Array.from(gamepad.axes),
                          },
                );
            } catch {
                return null;
            }
        },
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (handle) => window.cancelAnimationFrame(handle),
        isHidden: () => document.visibilityState === 'hidden',
        addBlurListener: (listener) => window.addEventListener('blur', listener),
        removeBlurListener: (listener) => window.removeEventListener('blur', listener),
        addVisibilityListener: (listener) => document.addEventListener('visibilitychange', listener),
        removeVisibilityListener: (listener) => document.removeEventListener('visibilitychange', listener),
    };
}

function buttonToken(button: number): string {
    return `button:${button}`;
}

function axisToken(axis: number, direction: -1 | 1): string {
    return `axis:${axis}:${direction}`;
}

function tokenForBinding(binding: ControlBinding): string | null {
    if (binding.kind === 'gamepad-button') return buttonToken(binding.button);
    if (binding.kind === 'gamepad-axis') return axisToken(binding.axis, binding.direction);
    return null;
}

function isMoveAction(action: ControlActionId): boolean {
    return action === 'moveNorth' || action === 'moveWest' || action === 'moveSouth' || action === 'moveEast';
}

function matchingActions(
    mapping: ReturnType<ControlMappingReader['getSnapshot']>,
    activeInputs: ReadonlySet<string>,
): Set<ControlActionId> {
    const actions = new Set<ControlActionId>();
    for (const action of CONTROL_ACTION_IDS) {
        if (
            mapping[action].some((binding) => {
                const token = tokenForBinding(binding);
                return token !== null && activeInputs.has(token);
            })
        ) {
            actions.add(action);
        }
    }
    return actions;
}

function actionsWithRisingBindings(
    mapping: ReturnType<ControlMappingReader['getSnapshot']>,
    previousInputs: ReadonlySet<string>,
    nextInputs: ReadonlySet<string>,
): Set<ControlActionId> {
    const actions = new Set<ControlActionId>();
    for (const action of CONTROL_ACTION_IDS) {
        if (
            mapping[action].some((binding) => {
                const token = tokenForBinding(binding);
                return token !== null && nextInputs.has(token) && !previousInputs.has(token);
            })
        ) {
            actions.add(action);
        }
    }
    return actions;
}

/**
 * Poll one standard-mapped Gamepad and route discrete activations through the
 * same guarded semantic-action translator used by keyboard controls.
 */
export class GamepadController {
    private readonly store: ConsoleStore;
    private readonly mappingSession: ControlMappingReader;
    private readonly environment: GamepadPollEnvironment;
    private frame: number | null = null;
    private attached = false;
    private gameplayEnabled = true;
    private captureHandler: GamepadCaptureHandler | null = null;
    private readonly activeInputs = new Set<string>();
    private readonly suppressedInputs = new Set<string>();
    private readonly heldMoves = new Map<ControlActionId, HeldMove>();
    private sample: { readonly target: CursorTarget; readonly atMs: number } | null = null;
    private mapUnsubscribe: (() => void) | null = null;
    private stateUnsubscribe: (() => void) | null = null;
    private blurListener: (() => void) | null = null;
    private visibilityListener: (() => void) | null = null;

    constructor(store: ConsoleStore, mappingSession: ControlMappingReader, options: GamepadControllerOptions = {}) {
        this.store = store;
        this.mappingSession = mappingSession;
        this.environment = options.environment ?? browserEnvironment();
    }

    /** Whether the environment exposes the Gamepad API; no hardware is required. */
    isSupported(): boolean {
        return this.environment.readGamepads() !== null;
    }

    /** Start feature-detected polling and lifecycle cleanup. */
    attach(): this {
        if (this.attached) return this;
        this.attached = true;
        this.mapUnsubscribe = this.mappingSession.subscribe?.(() => this.reset()) ?? null;
        this.stateUnsubscribe = this.store.subscribe((state) => {
            if (!state.inputEnabled) this.reset();
        });
        this.blurListener = () => this.reset();
        this.visibilityListener = () => {
            if (this.environment.isHidden()) this.reset();
        };
        this.environment.addBlurListener(this.blurListener);
        this.environment.addVisibilityListener(this.visibilityListener);
        if (this.isSupported()) this.scheduleFrame();
        return this;
    }

    /** Drop all active and repeated input when a modal or lifecycle guard takes over. */
    setGameplayEnabled(enabled: boolean): void {
        if (this.gameplayEnabled === enabled) return;
        this.gameplayEnabled = enabled;
        if (!enabled) {
            for (const token of this.activeInputs) this.suppressedInputs.add(token);
            this.activeInputs.clear();
            this.heldMoves.clear();
            this.clearAim();
        } else {
            this.heldMoves.clear();
        }
    }

    /** Capture the next fresh standard button/axis activation instead of dispatching it. */
    setCaptureHandler(handler: GamepadCaptureHandler | null): void {
        this.captureHandler = handler;
        this.heldMoves.clear();
    }

    /** Supply the latest pointer subcell for existing special-weapon aiming. */
    notePointer(target: CursorTarget, atMs: number): void {
        this.sample = { target, atMs };
    }

    /** Deterministic one-frame seam used by tests and the RAF loop. */
    pollFrame(nowMs: number): void {
        if (!this.attached || this.environment.isHidden()) {
            this.reset();
            return;
        }
        const pads = this.environment.readGamepads();
        if (pads === null) {
            this.reset();
            return;
        }
        const pad = pads.find((candidate) => candidate?.connected && candidate.mapping === 'standard') ?? null;
        if (pad === null) {
            this.reset();
            return;
        }
        const nextInputs = new Set<string>();
        this.readActiveInputs(pad, nextInputs);

        const newlyPressed = [...nextInputs].find(
            (token) => !this.activeInputs.has(token) && !this.suppressedInputs.has(token),
        );
        if (this.captureHandler !== null && newlyPressed !== undefined) {
            const binding = this.bindingForToken(newlyPressed);
            this.activeInputs.clear();
            for (const token of nextInputs) this.activeInputs.add(token);
            if (binding !== null) {
                this.suppressedInputs.add(newlyPressed);
                const captureHandler = this.captureHandler;
                this.captureHandler = null;
                captureHandler?.(binding);
            }
            return;
        }

        for (const token of this.suppressedInputs) {
            if (!nextInputs.has(token)) this.suppressedInputs.delete(token);
        }
        for (const token of [...nextInputs]) {
            if (this.suppressedInputs.has(token)) nextInputs.delete(token);
        }

        if (!this.gameplayEnabled) {
            for (const token of nextInputs) this.suppressedInputs.add(token);
            this.activeInputs.clear();
            this.heldMoves.clear();
            return;
        }

        const mapping = this.mappingSession.getSnapshot();
        const previousActions = matchingActions(mapping, this.activeInputs);
        const nextActions = matchingActions(mapping, nextInputs);
        const risingActions = actionsWithRisingBindings(mapping, this.activeInputs, nextInputs);
        this.activeInputs.clear();
        for (const token of nextInputs) this.activeInputs.add(token);

        for (const action of previousActions) {
            if (!nextActions.has(action)) this.heldMoves.delete(action);
        }
        for (const action of nextActions) {
            if (isMoveAction(action)) {
                const held = this.heldMoves.get(action);
                if (held === undefined) {
                    this.heldMoves.set(action, { nextAt: nowMs + MOVE_REPEAT_DELAY_MS });
                    this.dispatch(action, nowMs);
                } else if (risingActions.has(action)) {
                    held.nextAt = nowMs + MOVE_REPEAT_DELAY_MS;
                    this.dispatch(action, nowMs);
                } else if (nowMs >= held.nextAt) {
                    held.nextAt = nowMs + MOVE_REPEAT_INTERVAL_MS;
                    this.dispatch(action, nowMs);
                }
            } else if (risingActions.has(action)) {
                this.dispatch(action, nowMs);
            }
        }
    }

    /** Stop polling and release listeners, held state, and captured input. */
    dispose(): void {
        if (!this.attached) return;
        this.attached = false;
        if (this.frame !== null) this.environment.cancelFrame(this.frame);
        this.frame = null;
        if (this.blurListener !== null) this.environment.removeBlurListener(this.blurListener);
        if (this.visibilityListener !== null) this.environment.removeVisibilityListener(this.visibilityListener);
        this.blurListener = null;
        this.visibilityListener = null;
        this.mapUnsubscribe?.();
        this.stateUnsubscribe?.();
        this.mapUnsubscribe = null;
        this.stateUnsubscribe = null;
        this.captureHandler = null;
        this.reset();
    }

    private scheduleFrame(): void {
        if (!this.attached || this.frame !== null) return;
        this.frame = this.environment.requestFrame((time) => {
            this.frame = null;
            this.pollFrame(time);
            this.scheduleFrame();
        });
    }

    private readActiveInputs(pad: StandardGamepadState, output: Set<string>): void {
        for (let button = 0; button < Math.min(pad.buttons.length, MAX_BUTTONS); button += 1) {
            const state = pad.buttons[button];
            if (state === undefined) continue;
            const token = buttonToken(button);
            const threshold =
                this.activeInputs.has(token) || this.suppressedInputs.has(token)
                    ? BUTTON_RELEASE_THRESHOLD
                    : BUTTON_PRESS_THRESHOLD;
            if (state.pressed || state.value >= threshold) output.add(token);
        }
        for (let axis = 0; axis < Math.min(pad.axes.length, MAX_AXES); axis += 1) {
            const value = pad.axes[axis];
            if (value === undefined || !Number.isFinite(value)) continue;
            for (const direction of [-1, 1] as const) {
                const token = axisToken(axis, direction);
                const threshold =
                    this.activeInputs.has(token) || this.suppressedInputs.has(token)
                        ? AXIS_RELEASE_THRESHOLD
                        : AXIS_PRESS_THRESHOLD;
                if (value * direction >= threshold) output.add(token);
            }
        }
    }

    private bindingForToken(token: string): ControlBinding | null {
        const buttonMatch = /^button:(\d+)$/.exec(token);
        if (buttonMatch?.[1] !== undefined) {
            return { kind: 'gamepad-button', mapping: 'standard', button: Number(buttonMatch[1]) };
        }
        const axisMatch = /^axis:(\d+):(-?1)$/.exec(token);
        if (axisMatch?.[1] !== undefined && axisMatch[2] !== undefined) {
            return {
                kind: 'gamepad-axis',
                mapping: 'standard',
                axis: Number(axisMatch[1]),
                direction: Number(axisMatch[2]) as -1 | 1,
            };
        }
        return null;
    }

    private dispatch(action: ControlActionId, nowMs: number): void {
        const state = this.store.getState();
        const ageMs = this.sample === null ? null : nowMs - this.sample.atMs;
        const outcome = translateControlAction({
            action,
            state,
            cursor: this.sample?.target ?? null,
            cursorAgeMs: ageMs,
        });
        if (outcome.kind !== 'action') return;
        if (this.sample !== null && this.sample.target.cell === null && isOrderProducingAction(outcome.action)) return;
        this.store.dispatch(outcome.action, { nowMs });
    }

    private clearAim(): void {
        this.sample = null;
    }

    private reset(): void {
        for (const token of this.activeInputs) this.suppressedInputs.add(token);
        this.activeInputs.clear();
        this.heldMoves.clear();
        this.clearAim();
    }
}
