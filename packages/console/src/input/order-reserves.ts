/**
 * Digit-key → reserves action builder — Feature 005 (T070).
 *
 * The keyboard half of the US4 reserves pipeline (spec US4 AC-1/2,
 * FR-004 "0–9 (reserves)"). Extracted from `order-draft.ts` (which
 * shipped the digit branch inline per T054) into this dedicated
 * module so the reserves gesture has one testable home shared by the
 * keyboard controller and the {@link import('../ui/reserves-panel').ReservesPanel}
 * click path.
 *
 * Semantics (spec US4 AC-1/2):
 *   - digit `d` over the focused cell issues
 *     `{ kind: 'setReserves', cell, percent: d }` — the engine
 *     interprets `percent` as tens of percent (`7` → 70%);
 *   - digit `0` clears reserves (`percent: 0`, AC-2);
 *   - non-digits are not reserves keys (`null` outcome — the caller
 *     falls through to its next binding);
 *   - order-producing digits require live input (`state.inputEnabled`,
 *     data-model.md §1) and a focused cell.
 *
 * Pure: no DOM, no clock reads. The reducer (T022) turns the returned
 * action into the wire order + confirmation feedback; the transient
 * "%" flash is raised by the MapView layer (T024/T071) once the
 * applied view carries the new value.
 *
 * JSDoc references: spec US4 AC-1/2 + FR-004.
 */

import type { ConsoleState, PlayerAction, ReservesPct } from '../state/types';
import { DEFAULT_INPUT_MAPPING } from '../state/types';

/**
 * Resolve a raw key string to its reserves percent digit (engine
 * `ReservesPct` domain 0..9; the issued order means `10 × digit`
 * percent). Keys come from `DEFAULT_INPUT_MAPPING.reserveKeys` —
 * never hard-coded. Returns `null` for non-reserve keys. Pure.
 *
 * @param key Normalized `KeyboardEvent.key` value (single character).
 */
export function resolveReservePercent(key: string): ReservesPct | null {
  const index = DEFAULT_INPUT_MAPPING.reserveKeys.indexOf(key);
  if (index < 0) {
    return null;
  }
  return index as ReservesPct;
}

/** Why a reserve keypress produced no action. */
export type ReservesIgnoreReason = 'not-live' | 'no-selection';

/**
 * The outcome of translating one potential reserves keypress.
 * `'action'` carries the ready-to-dispatch `PlayerAction`.
 */
export type ReservesOutcome =
  | { readonly kind: 'action'; readonly action: PlayerAction }
  | { readonly kind: 'ignore'; readonly reason: ReservesIgnoreReason };

/**
 * Translate a keydown into a reserves `PlayerAction`, or explain why
 * it produced nothing. Returns `null` when `key` is not a reserve key
 * at all (caller falls through to other bindings). Pure.
 *
 * @param state Console snapshot (input gate + focused cell).
 * @param key   Raw key value (normalized by the caller).
 */
export function buildReservesAction(state: ConsoleState, key: string): ReservesOutcome | null {
  const percent = resolveReservePercent(key);
  if (percent === null) {
    return null;
  }
  if (!state.inputEnabled) {
    return { kind: 'ignore', reason: 'not-live' };
  }
  if (state.selection === null) {
    return { kind: 'ignore', reason: 'no-selection' };
  }
  return {
    kind: 'action',
    action: { kind: 'setReserves', cell: state.selection, percent },
  };
}

/**
 * Accessible label for one reserves digit control ("Set reserves to
 * 70%"). Shared by the reserves panel buttons so screen readers hear
 * the exact command the button issues (Q-A05 US4 portion). Pure.
 *
 * @param percent Engine reserves digit (0..9).
 */
export function reservesDigitLabel(percent: ReservesPct): string {
  return `Set reserves to ${percent * 10}%`;
}
