/**
 * Order palette UI — Feature 005 (T055).
 *
 * The order bar is the only new visual element US2 adds (tasks.md MVP
 * scope note): a horizontal strip showing the current pipe mode plus
 * two command buttons, sitting after the HUD in DOM and Tab order
 * (Q-A04: skip-link → map → HUD → order-bar).
 *
 * Accessibility contract (Q-A05 + WCAG):
 *   - `aria-label="Order palette"` on the region (task text);
 *   - the palette presents as one Tab stop (exactly one command
 *     button in the Tab order); ArrowLeft/ArrowRight/Home/End rove
 *     focus between the command buttons (WCAG 2.1.1 Keyboard);
 *   - Enter/Space activate the focused button natively;
 *   - every control is single-pointer-activation — no dragging
 *     anywhere in the palette (WCAG 2.5.7 Dragging Movements);
 *   - the mode badge is a `role="status"` live region so exclusive-
 *     mode changes are announced without moving focus (WCAG 4.1.3);
 *   - visible focus indicators via the shared `.europa-focus-ring`
 *     outline (≥ 3:1 contrast against the bar background, WCAG 2.4.7).
 *
 * When input is disabled (`status !== 'live'`) the buttons render
 * disabled and drop out of the Tab order.
 */

import { EuropaButton } from '@europa/design/components';
import type { JSX } from 'react';
import { useRef, useState } from 'react';

/** Props for {@link OrderBar}. */
export interface OrderBarProps {
    /** Whether exclusive-pipe mode is currently engaged. */
    readonly exclusiveMode: boolean;
    /** Whether orders may be issued right now (drives button disabled state). */
    readonly inputEnabled: boolean;
    /** Toggle exclusive mode; omitted in static (store-less) boots. */
    readonly onToggleExclusive?: (() => void) | undefined;
    /**
     * Clear all pipes on the focused cell; omitted in static boots.
     * Callers guard the null-selection case.
     */
    readonly onClearPipes?: (() => void) | undefined;
}

/**
 * The order palette strip: mode badge + Exclusive toggle + Clear pipes.
 */
export function OrderBar({ exclusiveMode, inputEnabled, onToggleExclusive, onClearPipes }: OrderBarProps): JSX.Element {
    const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
    const [activeIndex, setActiveIndex] = useState(0);

    /** Roving arrow-key focus across the palette's buttons (toolbar pattern). */
    function handleToolbarKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
        const enabled = buttonsRef.current
            .map((button, index) => ({ button, index }))
            .filter(
                (entry): entry is { button: HTMLButtonElement; index: number } =>
                    entry.button !== null && !entry.button.disabled,
            );
        if (enabled.length === 0) {
            return;
        }
        const currentIndex = enabled.findIndex((entry) => entry.button === document.activeElement);
        let nextIndex: number;
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                nextIndex = (currentIndex + 1 + enabled.length) % enabled.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = enabled.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        // Wrap-around from an unfocused toolbar starts at the first button.
        const target = enabled[nextIndex] ?? enabled[0];
        if (target === undefined) {
            return;
        }
        setActiveIndex(target.index);
        target.button.focus();
    }

    return (
        <section id="order-bar" aria-label="Order palette" className="europa-order-bar">
            <span className="europa-order-bar__mode" role="status">
                Mode: {exclusiveMode ? 'Exclusive pipes' : 'Toggle pipes'}
            </span>
            <div
                className="europa-order-bar__buttons"
                role="toolbar"
                aria-label="Order commands"
                aria-orientation="horizontal"
                onKeyDown={handleToolbarKeyDown}
            >
                <EuropaButton
                    type="button"
                    ref={(node) => {
                        buttonsRef.current[0] = node;
                    }}
                    variant="secondary"
                    className="europa-order-bar__button"
                    tabIndex={0 === activeIndex ? 0 : -1}
                    aria-pressed={exclusiveMode}
                    disabled={!inputEnabled}
                    onFocus={() => {
                        setActiveIndex(0);
                    }}
                    onClick={onToggleExclusive}
                >
                    Exclusive pipes
                </EuropaButton>
                <EuropaButton
                    type="button"
                    ref={(node) => {
                        buttonsRef.current[1] = node;
                    }}
                    variant="secondary"
                    className="europa-order-bar__button"
                    tabIndex={1 === activeIndex ? 0 : -1}
                    disabled={!inputEnabled}
                    onFocus={() => {
                        setActiveIndex(1);
                    }}
                    onClick={onClearPipes}
                >
                    Clear pipes
                </EuropaButton>
            </div>
        </section>
    );
}
