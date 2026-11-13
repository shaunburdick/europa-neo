import { StrictMode } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { ControlMappingSession } from '../../../src/input/control-mapping';
import { ControlMappingProvider } from '../../../src/input/control-mapping-context';
import { GamepadController, type GamepadPollEnvironment } from '../../../src/input/gamepad-controller';
import type { ControlMapping } from '../../../src/state/types';

interface PollFixture {
    readonly environment: GamepadPollEnvironment;
    pendingFrames(): number;
    activeListeners(): number;
}

function pollFixture(): PollFixture {
    let nextHandle = 1;
    const frames = new Map<number, (time: number) => void>();
    const blurListeners = new Set<() => void>();
    const visibilityListeners = new Set<() => void>();
    return {
        environment: {
            readGamepads: () => [],
            requestFrame: (callback) => {
                const handle = nextHandle++;
                frames.set(handle, callback);
                return handle;
            },
            cancelFrame: (handle) => frames.delete(handle),
            isHidden: () => false,
            addBlurListener: (listener) => blurListeners.add(listener),
            removeBlurListener: (listener) => blurListeners.delete(listener),
            addVisibilityListener: (listener) => visibilityListeners.add(listener),
            removeVisibilityListener: (listener) => visibilityListeners.delete(listener),
        },
        pendingFrames: () => frames.size,
        activeListeners: () => blurListeners.size + visibilityListeners.size,
    };
}

function withSelectionBinding(mapping: ControlMapping, value: string): ControlMapping {
    return {
        ...mapping,
        moveNorth: [
            {
                kind: 'keyboard',
                event: 'key',
                value,
                modifiers: [],
                caseSensitive: false,
                modifierMatch: 'exact',
            },
        ],
    };
}

afterEach(() => cleanup());

describe('runtime Gamepad owner context', () => {
    test('StrictMode effect replay leaves one poller and preserves the applied mapping', async () => {
        const session = new ControlMappingSession();
        const replacement = withSelectionBinding(session.getSnapshot(), 'w');
        expect(session.replace(replacement).valid).toBe(true);
        const appliedMapping = session.getSnapshot();
        const fixture = pollFixture();
        const gamepadController = new GamepadController(session, { environment: fixture.environment });

        await render(
            <StrictMode>
                <ControlMappingProvider session={session} gamepadController={gamepadController}>
                    <span>runtime</span>
                </ControlMappingProvider>
            </StrictMode>,
        );

        expect(fixture.pendingFrames()).toBe(1);
        expect(fixture.activeListeners()).toBe(2);
        expect(session.getSnapshot()).toBe(appliedMapping);

        cleanup();
        expect(fixture.pendingFrames()).toBe(0);
        expect(fixture.activeListeners()).toBe(0);
        expect(session.getSnapshot()).toBe(appliedMapping);
    });

    test('separate provider instances retain separate mappings and pollers', async () => {
        const firstSession = new ControlMappingSession();
        const secondSession = new ControlMappingSession();
        const firstFixture = pollFixture();
        const secondFixture = pollFixture();
        const firstController = new GamepadController(firstSession, { environment: firstFixture.environment });
        const secondController = new GamepadController(secondSession, { environment: secondFixture.environment });
        const changed = withSelectionBinding(firstSession.getSnapshot(), 'w');

        await render(
            <StrictMode>
                <ControlMappingProvider session={firstSession} gamepadController={firstController}>
                    <span>first runtime</span>
                </ControlMappingProvider>
                <ControlMappingProvider session={secondSession} gamepadController={secondController}>
                    <span>second runtime</span>
                </ControlMappingProvider>
            </StrictMode>,
        );

        expect(firstSession.replace(changed).valid).toBe(true);
        expect(firstSession.getSnapshot().moveNorth).toEqual(changed.moveNorth);
        expect(secondSession.getSnapshot().moveNorth).not.toEqual(changed.moveNorth);
        expect(firstFixture.pendingFrames()).toBe(1);
        expect(secondFixture.pendingFrames()).toBe(1);

        cleanup();
        expect(firstFixture.pendingFrames()).toBe(0);
        expect(secondFixture.pendingFrames()).toBe(0);
        expect(firstFixture.activeListeners()).toBe(0);
        expect(secondFixture.activeListeners()).toBe(0);
    });
});
