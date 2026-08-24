/**
 * PlayerView Query + Hash Helpers — Feature 002, US1 (T014)
 *
 * Lightweight helpers for clients that already hold a `PlayerView`:
 *
 *   - `isVisible(view, coord)`   — membership test over
 *     `view.visibleCells` (linear scan; O(visibleCells)).
 *   - `visibleCellAt(view, coord)` — locate the decoded `CellView`
 *     for a coord, or `undefined` when redacted.
 *   - `hashPlayerView(view)` — stable integer-only hash used by the
 *     determinism suite (SC-001) to prove byte-identical re-runs.
 *
 * Naming note: this `isVisible` is the **PlayerView query** (a
 * `CellView` lookup), distinct from the mask-level `isVisible` in
 * `src/mask.ts`, which is barrel-aliased to `isCellMarked`. The two
 * concepts must not be conflated: one queries a fog mask, the other
 * queries a delivered payload.
 *
 * Determinism: all three are pure functions of their inputs; no
 * wall-clock, no PRNG, no platform-dependent iteration order.
 */

import type { CellView, Coord, PlayerView } from './types';

/**
 * Test whether a specific cell is visible in a `PlayerView`.
 * O(visibleCells) unless the view's `visibleCells` has been
 * pre-indexed (which the networking layer may choose to do for
 * hot-path queries).
 *
 * For a server-side fast-path query (without materializing the full
 * `PlayerView`), call `computeVisibleSet` and check `visibleCells`
 * membership directly.
 *
 * @param view  The `PlayerView` to query.
 * @param coord The cell to check.
 * @returns `true` iff `coord` appears in `view.visibleCells`.
 */
export function isVisible(view: Readonly<PlayerView>, coord: Coord): boolean {
    for (const cell of view.visibleCells) {
        if (cell.coord.x === coord.x && cell.coord.y === coord.y) {
            return true;
        }
    }
    return false;
}

/**
 * Locate and return the `CellView` for a specific coordinate, or
 * `undefined` if the cell is not visible in this `PlayerView`.
 *
 * Convenience helper — equivalent to
 * `isVisible(view, coord) ? findByCoord(...) : undefined`. Provided
 * so clients don't have to write the lookup themselves.
 *
 * @param view  The `PlayerView` to query.
 * @param coord The cell to look up.
 * @returns The `CellView` for `coord`, or `undefined` if not visible.
 */
export function visibleCellAt(view: Readonly<PlayerView>, coord: Coord): CellView | undefined {
    for (const cell of view.visibleCells) {
        if (cell.coord.x === coord.x && cell.coord.y === coord.y) {
            return cell;
        }
    }
    return undefined;
}

/**
 * FNV-1a round constants (32-bit). The offset basis and prime are
 * the standard FNV-1a parameters; mixing two independent 32-bit
 * lanes (h1 seeded with the basis, h2 seeded with the prime) gives
 * 64 bits of digest that fold into a 16-char hex string. Integer-
 * only math (`Math.imul` + `>>> 0`) — deterministic on every
 * platform (constitution Principle II).
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HASH_MIX_HIGH = 0x85ebca6b;
const HASH_MIX_LOW = 0xc2b2ae35;
const HASH_HEX_RADIX = 16;
const HASH_WORD_HEX_LENGTH = 8;

/**
 * Stable hash of a `PlayerView`'s mutable parts (visibleCells,
 * events). Used by SC-001 (byte-identical re-runs) and tests.
 *
 * Integer-only FNV-1a-style hashing over the JSON-serialized view.
 * Not cryptographic — collision rate is fine for test use. The
 * serialized form includes every field of the view (player, tick,
 * cells, events, config), so ANY payload change flips the hash.
 *
 * @param view The `PlayerView` to hash.
 * @returns A 16-char lowercase hex string.
 */
export function hashPlayerView(view: Readonly<PlayerView>): string {
    // JSON.stringify with a fixed key order (the type declares the
    // field order; object literals preserve insertion order) yields a
    // stable byte string for identical views. Pipes serialize as an
    // array via JSON.stringify(Set) → "[]" — Sets stringify as `{}`,
    // so we normalize pipes to sorted arrays first to keep the hash
    // sensitive to pipe changes.
    const normalized = {
        player: view.player,
        tick: view.tick,
        visibleCells: view.visibleCells.map((cell) => ({
            coord: cell.coord,
            terrain: cell.cell.terrain,
            elevation: cell.cell.elevation,
            troopCount: cell.troopCount,
            troopOwner: cell.troopOwner,
            pipes: [...cell.pipes].sort(),
            reservesPercent: cell.reservesPercent,
            cityOwner: cell.cityOwner,
        })),
        events: {
            combat: view.events.combat,
            captures: view.events.captures,
            eliminations: view.events.eliminations,
            appliedOrders: view.events.appliedOrders,
            errors: view.events.errors,
        },
        config: view.config,
    };
    const json = JSON.stringify(normalized);

    // Two independent FNV-1a lanes over the UTF-16 code units.
    let h1 = FNV_OFFSET;
    let h2 = FNV_PRIME;
    for (let i = 0; i < json.length; i++) {
        const code = json.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, FNV_PRIME) >>> 0;
        h2 = Math.imul(h2 ^ (code + i), FNV_OFFSET) >>> 0;
    }

    // Fold both lanes into a 64-bit hex digest (16 chars). The second
    // lane is rotated by 7 bits before emission so single-bit input
    // differences avalanche into both halves.
    const hi = (h1 ^ Math.imul(h2, HASH_MIX_HIGH)) >>> 0;
    const lo = (h2 ^ Math.imul(h1, HASH_MIX_LOW)) >>> 0;
    return (
        hi.toString(HASH_HEX_RADIX).padStart(HASH_WORD_HEX_LENGTH, '0') +
        lo.toString(HASH_HEX_RADIX).padStart(HASH_WORD_HEX_LENGTH, '0')
    );
}
