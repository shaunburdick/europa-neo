/**
 * Tick-Event Horizon Filter — Feature 002, US1 (T015)
 *
 * Implements FR-003 (server-side information hiding): no payload sent
 * to a player may contain state about cells outside that player's
 * visible set.
 *
 * Rules:
 *   - Cell-level events (`combat`, `captures`) are dropped when their
 *     `cell` is outside the supplied visible set.
 *   - Player-level events (`eliminations`, `appliedOrders`, `errors`)
 *     are kept regardless — they are not bound to a cell.
 *   - `spectator === true` short-circuits: events are returned
 *     unchanged (FR-006 / US3).
 *   - Emission order is preserved within each category (the filter
 *     never reorders; it only drops).
 *
 * Membership testing uses a `Set<number>` of flat-index keys built
 * once per call — O(1) per event after O(visibleCells) setup.
 *
 * Determinism: pure function of its inputs; identical arguments
 * produce identical output. No wall-clock, no PRNG.
 */

import type { Coord, TickEvents, World } from '@europa/engine';

import { emptyTickEvents } from '@europa/engine';

/**
 * Build a `Set<number>` of flat-index keys from a row-major `Coord`
 * list. Keys are `y * width + x` — the same flat indexing the engine's
 * `WorldState` typed arrays use. Out-of-bounds coords are still keyed
 * (they simply never match an in-bounds event cell).
 *
 * @param visibleCells Row-major, duplicate-free `Coord[]` (the output
 *                     of `computeVisibleSet`).
 * @param width        Board width in cells.
 * @returns A `Set` of flat-index keys for O(1) membership tests.
 */
function buildVisibleIndex(visibleCells: ReadonlyArray<Coord>, width: number): Set<number> {
  const keys = new Set<number>();
  for (const coord of visibleCells) {
    keys.add(coord.y * width + coord.x);
  }
  return keys;
}

/**
 * Filter `TickEvents` to remove cell-level events whose cell is
 * outside the player's horizon. Player-level events
 * (`EliminationEvent`, `AppliedOrderRecord`, `errors`) are kept
 * regardless.
 *
 * Exposed primarily for tests; `computePlayerView` calls this
 * internally. Feature 004 should NOT need to call this directly —
 * use `computePlayerView` instead.
 *
 * For spectators (`spectator === true`), the filter is a no-op and
 * the original `events` reference is returned unchanged.
 *
 * @param world         The current `World` snapshot (board geometry
 *                      for flat-index keying).
 * @param visibleCells  The player's already-computed visible cells
 *                      (row-major, no duplicates).
 * @param events        The unfiltered `TickEvents` to filter.
 * @param spectator     If `true`, return `events` unchanged.
 * @returns A new `TickEvents` object with cell-level events dropped
 *         for out-of-horizon cells (or the input reference when
 *         spectating).
 */
export function filterTickEvents(
  world: Readonly<World>,
  visibleCells: ReadonlyArray<Coord>,
  events: Readonly<TickEvents>,
  spectator: boolean,
): Readonly<TickEvents> {
  if (spectator) {
    return events;
  }

  // Fast path: nothing to hide if there are no cell-level events at
  // all — return the input untouched (preserves identity for callers
  // that compare references).
  if (events.combat.length === 0 && events.captures.length === 0) {
    return events;
  }

  const visible = buildVisibleIndex(visibleCells, world.board.width);

  // Filter each cell-level category independently, preserving
  // emission order. Player-level categories pass through as-is.
  const combat = events.combat.filter((event) =>
    visible.has(event.cell.y * world.board.width + event.cell.x),
  );
  const captures = events.captures.filter((event) =>
    visible.has(event.cell.y * world.board.width + event.cell.x),
  );

  if (combat.length === events.combat.length && captures.length === events.captures.length) {
    // Nothing was dropped — return the original reference so callers
    // can rely on identity when the horizon hid nothing.
    return events;
  }

  return {
    combat,
    captures,
    eliminations: events.eliminations,
    appliedOrders: events.appliedOrders,
    errors: events.errors,
  };
}

/**
 * Convenience re-export of the engine's `emptyTickEvents` builder so
 * fog modules (and tests) share one canonical "no events" value.
 * Re-exported rather than re-declared to keep a single source of
 * truth for the empty shape.
 */
export { emptyTickEvents };
