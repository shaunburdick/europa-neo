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
 *   - the container is one Tab stop; ArrowLeft/ArrowRight/Home/End
 *     rove focus between the command buttons (WCAG 2.1.1 Keyboard);
 *   - Enter/Space activate the focused button natively;
 *   - every control is single-pointer-activation — no dragging
 *     anywhere in the palette (WCAG 2.5.7 Dragging Movements);
 *   - the mode badge is a `role="status"` live region so exclusive-
 *     mode changes are announced without moving focus (WCAG 4.1.3);
 *   - visible focus indicators via the shared `.europa-focus-ring`
 *     outline (≥ 3:1 contrast against the bar background, WCAG 2.4.7).
 *
 * When input is disabled (`status !== 'live'`) the buttons render
 * disabled and drop out of the Tab order; the region itself stays as
 * a stable landmark.
 */

import type { JSX } from 'react';
import { useRef } from 'react';

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
export function OrderBar({
  exclusiveMode,
  inputEnabled,
  onToggleExclusive,
  onClearPipes,
}: OrderBarProps): JSX.Element {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  /** Roving arrow-key focus across the palette's buttons (toolbar pattern). */
  function handleToolbarKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const buttons = buttonsRef.current.filter((b) => b !== null && !b.disabled);
    if (buttons.length === 0) {
      return;
    }
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1 + buttons.length) % buttons.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = buttons.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    // Wrap-around from an unfocused toolbar starts at the first button.
    const target = buttons[nextIndex] ?? buttons[0];
    target?.focus();
  }

  return (
    <section id="order-bar" aria-label="Order palette" tabIndex={0} className="europa-order-bar">
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
        <button
          type="button"
          ref={(node) => {
            buttonsRef.current[0] = node;
          }}
          className="europa-order-bar__button"
          aria-pressed={exclusiveMode}
          disabled={!inputEnabled}
          onClick={onToggleExclusive}
        >
          Exclusive pipes
        </button>
        <button
          type="button"
          ref={(node) => {
            buttonsRef.current[1] = node;
          }}
          className="europa-order-bar__button"
          disabled={!inputEnabled}
          onClick={onClearPipes}
        >
          Clear pipes
        </button>
      </div>
    </section>
  );
}
