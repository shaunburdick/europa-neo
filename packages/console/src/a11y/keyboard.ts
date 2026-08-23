/**
 * Roving-focus keyboard navigation — Feature 005 (T020).
 *
 * Pure-logic state machine for roving tabindex over the board grid
 * and the console's chrome regions (research.md §6). The renderer
 * consults this class on arrow-key presses; it never touches the DOM
 * itself, so focus behavior is unit-testable without a browser.
 *
 * WCAG references:
 *   - 2.1.1 Keyboard (Level A): every function operable via keyboard.
 *   - 2.4.7 Focus Visible (Level AA): the selection ring is drawn on
 *     the coord this navigator returns (renderer's focus indicator).
 *   - 2.4.11 Focus Not Obscured (Minimum) (Level AA, new in 2.2): the
 *     fixed Tab-region list keeps focus targets few and predictable,
 *     so sticky HUD chrome cannot cover the focused region.
 */

import type { ConsoleState, Coord } from '../state/types';

/** Cardinal movement direction for board-cell focus moves. */
export type FocusDirection = 'N' | 'W' | 'S' | 'E';

/** Board bounds in cells. */
interface BoardBounds {
  readonly width: number;
  readonly height: number;
}

/** One Tab-stop descriptor the renderer turns into a focusable node. */
export interface TabbableRegion {
  /** Stable DOM id of the region. */
  readonly id: string;
  /** Accessible name announced for the region. */
  readonly label: string;
  /** Whether the region participates in Tab order. */
  readonly focusable: boolean;
}

/**
 * Roving-tabindex navigator. Stateless pure logic — every method is a
 * function of its arguments, so one instance can serve any number of
 * boards / mounts.
 */
export class KeyboardNavigator {
  /**
   * Compute the next focused cell moving one cell in `direction`,
   * clamped to the board: movement that would leave the board returns
   * the same coordinate (focus "sticks" at edges — no wrap-around,
   * matching the original game's console behavior).
   *
   * A `null` current focus starts from {@link getInitialFocus}.
   * Pure.
   *
   * @param current   Currently focused cell, or `null` before first focus.
   * @param direction Movement direction (N = row-1, W = col-1, …).
   * @param bounds    Board size in cells.
   */
  moveFocus(current: Coord | null, direction: FocusDirection, bounds: BoardBounds): Coord {
    if (current === null) {
      return this.getInitialFocus(bounds.width, bounds.height);
    }
    const delta = DIRECTION_DELTAS[direction];
    const nextX = clamp(current.x + delta.dx, 0, bounds.width - 1);
    const nextY = clamp(current.y + delta.dy, 0, bounds.height - 1);
    return { x: nextX, y: nextY };
  }

  /**
   * The cell focused when the board first receives keyboard focus:
   * the center cell `(floor(width/2), floor(height/2))`. Pure.
   */
  getInitialFocus(width: number, height: number): Coord {
    return { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  }

  /**
   * The regions a Tab keypress visits, in order (Q-A04 Tab order:
   * skip-link → map → HUD → order-bar; reserves panel is reachable
   * via its own shortcut, not Tab, to keep the stop count small).
   *
   * @param _state Current console state (reserved for future dynamic
   *               entries — e.g., hiding the order palette while a
   *               modal is open; v1 list is static).
   */
  getTabbableRegions(_state: ConsoleState): ReadonlyArray<TabbableRegion> {
    return TAB_ORDER;
  }
}

/** Fixed v1 Tab order (WCAG 2.4.11: few, predictable focus stops). */
const TAB_ORDER: ReadonlyArray<TabbableRegion> = [
  { id: 'skip-link', label: 'Skip to main content', focusable: true },
  { id: 'map', label: 'Game board', focusable: true },
  { id: 'hud', label: 'Status bar', focusable: true },
  { id: 'order-bar', label: 'Order palette', focusable: true },
  { id: 'reserves', label: 'Reserves panel', focusable: false },
];

/** Unit deltas per {@link FocusDirection}. */
const DIRECTION_DELTAS: Readonly<
  Record<FocusDirection, { readonly dx: number; readonly dy: number }>
> = {
  N: { dx: 0, dy: -1 },
  W: { dx: -1, dy: 0 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
};

/** Clamp an integer into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
