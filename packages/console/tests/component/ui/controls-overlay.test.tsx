import { EuropaButton } from '@europa/design/components';
import type { JSX } from 'react';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { ControlMappingSession, matchKeyboardBinding } from '../../../src/input/control-mapping';
import type { GamepadCaptureHandler } from '../../../src/input/gamepad-controller';
import { ControlsOverlay } from '../../../src/ui/controls-overlay';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('ControlsOverlay', () => {
    test('preserves dialog focus trapping and restores focus to its opener', async () => {
        const session = new ControlMappingSession();
        function Harness(): JSX.Element {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <EuropaButton onClick={() => setOpen(true)}>Open controls</EuropaButton>
                    <ControlsOverlay
                        open={open}
                        onClose={() => setOpen(false)}
                        session={session}
                        gamepadSupported={false}
                        setGamepadCaptureHandler={() => undefined}
                    />
                </>
            );
        }
        await render(<Harness />);
        const opener = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Open controls',
        );
        await userEvent.click(opener as HTMLButtonElement);
        const dialog = document.querySelector('[role="dialog"]');
        expect(document.activeElement).toBe(dialog);
        const cancel = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Cancel',
        );
        await userEvent.click(cancel as HTMLButtonElement);
        expect(document.activeElement).toBe(opener);
    });

    test('stages keyboard capture, applies atomically, and captures no gameplay shortcut', async () => {
        const session = new ControlMappingSession();
        const setGamepadCaptureHandler = vi.fn<(handler: GamepadCaptureHandler | null) => void>();
        await render(
            <ControlsOverlay
                open
                onClose={vi.fn()}
                session={session}
                gamepadSupported
                setGamepadCaptureHandler={setGamepadCaptureHandler}
            />,
        );
        const north = document.querySelector('[aria-label="Toggle pipe North bindings"]');
        expect(north?.textContent).toContain('i');
        const addKeyboard = [...document.querySelectorAll('button')].find((button) =>
            button.getAttribute('aria-label')?.includes('Add keyboard')
                ? false
                : button.textContent?.trim() === 'Add keyboard binding',
        );
        expect(addKeyboard).not.toBeNull();
        await userEvent.click(addKeyboard as HTMLButtonElement);
        await userEvent.keyboard('q');

        expect(
            session.getSnapshot().pipeNorth.some((binding) => binding.kind === 'keyboard' && binding.value === 'q'),
        ).toBe(false);
        expect(document.body.textContent).toContain('Apply changes to use it.');
        const apply = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Apply changes',
        );
        expect(apply).not.toBeNull();
        await userEvent.click(apply as HTMLButtonElement);
        expect(
            session.getSnapshot().pipeNorth.some((binding) => binding.kind === 'keyboard' && binding.value === 'q'),
        ).toBe(true);
        expect(
            matchKeyboardBinding(session.getSnapshot(), {
                key: 'q',
                code: 'KeyQ',
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                shiftKey: false,
            }),
        ).toBe('pipeNorth');
    });

    test('conflicting capture reports feedback without changing the staged map; Cancel discards', async () => {
        const session = new ControlMappingSession();
        const original = session.getSnapshot();
        await render(
            <ControlsOverlay
                open
                onClose={vi.fn()}
                session={session}
                gamepadSupported={false}
                setGamepadCaptureHandler={() => undefined}
            />,
        );
        const addKeyboard = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Add keyboard binding',
        );
        await userEvent.click(addKeyboard as HTMLButtonElement);
        await userEvent.keyboard('j');
        expect(document.body.textContent).toContain('Binding for pipeWest conflicts with pipeNorth');
        expect(session.getSnapshot()).toBe(original);

        const cancel = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Cancel',
        );
        await userEvent.click(cancel as HTMLButtonElement);
        expect(session.getSnapshot()).toBe(original);
    });

    test('controller capture accepts a standard binding but remains staged until Apply', async () => {
        const session = new ControlMappingSession();
        let capture: GamepadCaptureHandler | null = null;
        await render(
            <ControlsOverlay
                open
                onClose={vi.fn()}
                session={session}
                gamepadSupported
                setGamepadCaptureHandler={(handler) => {
                    capture = handler;
                }}
            />,
        );
        const reserveSevenRow = [...document.querySelectorAll('.europa-controls-overlay__row')].find((row) =>
            row.textContent?.includes('Set reserves to 70%'),
        );
        const addGamepad = [...(reserveSevenRow?.querySelectorAll('button') ?? [])].find(
            (button) => button.textContent?.trim() === 'Add Gamepad binding',
        );
        await userEvent.click(addGamepad as HTMLButtonElement);
        await vi.waitFor(() => expect(capture).not.toBeNull());
        capture?.({ kind: 'gamepad-button', mapping: 'standard', button: 0 });
        expect(session.getSnapshot().reserve7.some((binding) => binding.kind === 'gamepad-button')).toBe(false);
        const apply = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Apply changes',
        );
        await userEvent.click(apply as HTMLButtonElement);
        expect(session.getSnapshot().reserve7).toContainEqual({
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
    });

    test('reserved browser chords remain usable and capture still works from modal footer focus', async () => {
        const onClose = vi.fn();
        await render(
            <ControlsOverlay
                open
                onClose={onClose}
                session={new ControlMappingSession()}
                gamepadSupported={false}
                setGamepadCaptureHandler={() => undefined}
            />,
        );
        const addKeyboard = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Add keyboard binding',
        );
        await userEvent.click(addKeyboard as HTMLButtonElement);

        const browserChord = new KeyboardEvent('keydown', {
            key: 'l',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        document.activeElement?.dispatchEvent(browserChord);
        expect(browserChord.defaultPrevented).toBe(false);
        expect(document.body.textContent).toContain('Ctrl and Meta shortcuts are reserved');

        const footerApply = [...document.querySelectorAll('.europa-modal__actions button')].find(
            (button) => button.textContent?.trim() === 'Apply changes',
        );
        footerApply?.focus();
        await userEvent.keyboard('q');
        expect(document.body.textContent).toContain('Captured q for Toggle pipe North');

        await userEvent.click(addKeyboard as HTMLButtonElement);
        const footerCancel = [...document.querySelectorAll('.europa-modal__actions button')].find(
            (button) => button.textContent?.trim() === 'Cancel',
        );
        footerCancel?.focus();
        await userEvent.keyboard('{Escape}');
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        expect(onClose).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Capture canceled.');
    });

    test('MMO/WASD and Original presets preserve custom Gamepad bindings', async () => {
        const session = new ControlMappingSession();
        const withCustomPad = {
            ...session.getSnapshot(),
            reserve7: [
                ...session.getSnapshot().reserve7,
                { kind: 'gamepad-button', mapping: 'standard', button: 0 } as const,
            ],
        };
        expect(session.replace(withCustomPad).valid).toBe(true);
        await render(
            <ControlsOverlay
                open
                onClose={vi.fn()}
                session={session}
                gamepadSupported
                setGamepadCaptureHandler={() => undefined}
            />,
        );
        const profile = document.querySelector('.europa-controls-overlay__profile select');
        await userEvent.selectOptions(profile as HTMLSelectElement, 'mmo-wasd');
        expect(session.getProfileSnapshot()).toBe('custom');
        let apply = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Apply changes',
        );
        await userEvent.click(apply as HTMLButtonElement);
        expect(session.getProfileSnapshot()).toBe('mmo-wasd');
        expect(
            session.getSnapshot().moveNorth.some((binding) => binding.kind === 'keyboard' && binding.value === 'w'),
        ).toBe(true);
        expect(session.getSnapshot().reserve7).toContainEqual({
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });

        const reset = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Reset to Original',
        );
        await userEvent.click(reset as HTMLButtonElement);
        apply = [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Apply changes',
        );
        await userEvent.click(apply as HTMLButtonElement);
        expect(session.getProfileSnapshot()).toBe('original');
        expect(
            session
                .getSnapshot()
                .moveNorth.some((binding) => binding.kind === 'keyboard' && binding.value === 'ArrowUp'),
        ).toBe(true);
        expect(session.getSnapshot().reserve7).toContainEqual({
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 0,
        });
    });
});
