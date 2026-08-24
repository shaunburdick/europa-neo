/**
 * Awaiting-match-start derivation — post-playtest UX fix (2026-08-23).
 *
 * The product-owner playtest found a silent-failure window: a player
 * who joins while their match is still filling reaches console status
 * `'live'` (the wire join succeeded and the join snapshot arrived) but
 * no tick broadcast flows until matchmaking's auto-start fires with
 * the final seat. The board renders as a black grid, the status chip
 * reads "live", and "waiting for the opponent" is indistinguishable
 * from "broken".
 *
 * This module is the single pure predicate behind the waiting-for-
 * opponent overlay ({@link ../ui/waiting-overlay.tsx}). It answers
 * exactly one question from the contractual {@link ConsoleState} —
 * no timers, no extra state, fully store-derived:
 *
 *   "Is this console joined but the match not yet producing ticks?"
 *
 * Signal choice (wire-protocol reasoning):
 *  - `status === 'live'` covers both seated paths of the console's own
 *    mapping (`joined` and `rejoined` both map to 'live' in
 *    `net/connection.ts`); every non-live status already owns its UI
 *    (connecting spinner, reconnecting banner, game-over surfaces), so
 *    the overlay must never fire there.
 *  - `latestView === null` means NO PlayerView of any kind has been
 *    applied — defensive against viewless-live paths.
 *  - `latestView.tick === 0` is the join-snapshot fingerprint of an
 *    unstarted match: worlds are created at tick 0 (`createWorld`) and
 *    every server tick broadcast happens AFTER `advance()` increments
 *    the world, so broadcasts always carry tick ≥ 1. A view stuck at
 *    tick 0 therefore means "snapshot in hand, zero ticks flowed" —
 *    precisely the playtested waiting-room state.
 *
 * Pure: reads only the state argument. No clock, no randomness.
 */

import type { ConsoleState } from './types';

/**
 * Whether the console is joined (`status === 'live'`) but the match
 * has not yet delivered its first tick broadcast. True exactly when
 * the waiting-for-opponent overlay should be visible over the board.
 * Pure.
 *
 * @param state Current console state (store-derived; never mutated).
 */
export function isAwaitingMatchStart(state: ConsoleState): boolean {
  return state.status === 'live' && (state.latestView === null || state.latestView.tick === 0);
}
