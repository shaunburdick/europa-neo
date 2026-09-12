/**
 * Tick-Event Horizon Filter — Feature 002, US1 (T015) + Issue #143
 *
 * Implements FR-003 (server-side information hiding) and FR-012
 * (appliedOrders / errors filtering): no payload sent to a player
 * may contain state about cells outside that player's visible set.
 *
 * Rules:
 *   - Cell-level events (`combat`, `captures`) are dropped when their
 *     `cell` is outside the supplied visible set.
 *   - `appliedOrders` records are included only when:
 *       (a) `record.order.player === player`, AND
 *       (b) ALL cell coordinates referenced by the order are visible.
 *   - `errors` records are included only when:
 *       ALL cell coordinates referenced by the validation error are
 *       visible (non-cell-carrying variants are always included).
 *   - `eliminations` pass through unfiltered (player-level, not
 *     bound to a specific cell).
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

import type { Coord, Order, PlayerId, TickEvents, ValidationError, World } from '@europa/engine';

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
function buildVisibleIndex(visibleCells: readonly Coord[], width: number): Set<number> {
    const keys = new Set<number>();
    for (const coord of visibleCells) {
        keys.add(coord.y * width + coord.x);
    }
    return keys;
}

/**
 * Extract every cell coordinate referenced by an `Order`.
 * Used by `filterTickEvents` to decide whether an applied-order
 * record is safe to include in a player's view.
 *
 * Exhaustive over all 8 order kinds — a new kind added to the
 * engine will cause a compile error here rather than silently
 * passing through the filter.
 *
 * @param order The applied order.
 * @returns An array of cell coordinates (may be empty for `surrender`).
 */
export function orderCoords(order: Order): Coord[] {
    switch (order.kind) {
        case 'setPipe':
        case 'clearPipe':
        case 'setPipesExclusive':
        case 'clearAllPipes':
        case 'setReserves':
            return [order.cell];
        case 'paratroop':
        case 'gun':
            return [order.source, order.target];
        case 'surrender':
            return [];
    }
}

/**
 * Extract every cell coordinate referenced by a `ValidationError`.
 * Used by `filterTickEvents` to decide whether an error record is
 * safe to include in a player's view.
 *
 * Exhaustive over all 11 ValidationError variants — a new variant
 * added to the engine will cause a compile error here.
 *
 * @param reason The validation error.
 * @returns An array of cell coordinates (may be empty for non-cell
 *          variants like `already_surrendered`, `invalid_percent`, etc.).
 */
export function validationErrorCoords(reason: ValidationError): Coord[] {
    switch (reason.kind) {
        case 'out_of_bounds':
        case 'water_target':
        case 'not_owner':
        case 'no_source_troops':
            return [reason.coord];
        case 'paratroop_range':
            return [reason.source, reason.target];
        case 'already_surrendered':
        case 'invalid_percent':
        case 'unknown_player':
        case 'unknown_order':
        case 'invalid_direction':
        case 'match_terminal':
            return [];
    }
}

/**
 * Check whether every coordinate in a list is visible (present in the
 * flat-index set). Empty lists return `true` (vacuous truth).
 *
 * @param coords  The coordinates to check.
 * @param visible The flat-index visibility set.
 * @param width   Board width for flat-index computation.
 * @returns `true` when all coords are visible (or the list is empty).
 */
function allCoordsVisible(coords: readonly Coord[], visible: Set<number>, width: number): boolean {
    for (const coord of coords) {
        if (!visible.has(coord.y * width + coord.x)) {
            return false;
        }
    }
    return true;
}

/**
 * Filter `TickEvents` to remove events whose referenced cells are
 * outside the player's horizon.
 *
 * Cell-level events (`combat`, `captures`) are dropped when their
 * `cell` is outside the supplied visible set.
 *
 * `appliedOrders` records are included only when the order's player
 * matches the viewer AND all cell coordinates referenced by the order
 * are visible (FR-012).
 *
 * `errors` records are included only when all cell coordinates
 * referenced by the validation error are visible; non-cell-carrying
 * error variants are always included (FR-012).
 *
 * `eliminations` pass through unfiltered (player-level, not bound
 * to a specific cell).
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
 * @param player        The viewer's `PlayerId` — required for
 *                      `appliedOrders` filtering (orders from other
 *                      players are never shown to this viewer).
 * @returns A new `TickEvents` object with cell-level events dropped
 *         for out-of-horizon cells (or the input reference when
 *         spectating).
 */
export function filterTickEvents(
    world: Readonly<World>,
    visibleCells: readonly Coord[],
    events: Readonly<TickEvents>,
    spectator: boolean,
    player?: PlayerId,
): Readonly<TickEvents> {
    if (spectator) {
        return events;
    }

    // Fast path: nothing to hide if there are no filterable events at
    // all — return the input untouched (preserves identity for callers
    // that compare references).
    if (
        events.combat.length === 0 &&
        events.captures.length === 0 &&
        events.appliedOrders.length === 0 &&
        events.errors.length === 0
    ) {
        return events;
    }

    const visible = buildVisibleIndex(visibleCells, world.board.width);
    const width = world.board.width;

    // Filter each category independently, preserving emission order.
    const combat = events.combat.filter((event) => visible.has(event.cell.y * width + event.cell.x));
    const captures = events.captures.filter((event) => visible.has(event.cell.y * width + event.cell.x));

    // FR-012: appliedOrders — include only when the order's player
    // matches the viewer AND all referenced cells are visible.
    const appliedOrders = events.appliedOrders.filter((record) => {
        if (record.order.player !== player) {
            return false;
        }
        return allCoordsVisible(orderCoords(record.order), visible, width);
    });

    // FR-012: errors — include when all referenced cells are visible
    // (non-cell-carrying variants always pass).
    const errors = events.errors.filter(({ reason }) => {
        const coords = validationErrorCoords(reason);
        if (coords.length === 0) {
            return true;
        }
        return allCoordsVisible(coords, visible, width);
    });

    if (
        combat.length === events.combat.length &&
        captures.length === events.captures.length &&
        appliedOrders.length === events.appliedOrders.length &&
        errors.length === events.errors.length
    ) {
        // Nothing was dropped — return the original reference so callers
        // can rely on identity when the horizon hid nothing.
        return events;
    }

    return {
        combat,
        captures,
        eliminations: events.eliminations,
        appliedOrders,
        errors,
    };
}

/**
 * Convenience re-export of the engine's `emptyTickEvents` builder so
 * fog modules (and tests) share one canonical "no events" value.
 * Re-exported rather than re-declared to keep a single source of
 * truth for the empty shape.
 */
export { emptyTickEvents };
