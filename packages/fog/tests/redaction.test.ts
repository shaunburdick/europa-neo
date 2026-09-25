/**
 * SC-001 Protocol-Level Redaction Test — Feature 002 (T033 + T-117/T-118)
 *
 * A 500-tick scripted match where friendly stacks appear, move, and
 * are destroyed. For every tick, `computePlayerView` is audited
 * against an INDEPENDENTLY-computed expected visible set (built from
 * the raw state arrays + the fixture's Chebyshev-disk oracle — not
 * from `computeVisibleSet`):
 *
 *   (a) zero leakage: every `visibleCell.coord` is in that tick's
 *       expected set (and the sets match exactly);
 *   (b) the `events` field contains no out-of-horizon cell-level
 *       events — ALL FIVE TickEvents categories are audited:
 *       - `combat`: cell must be in expected set
 *       - `captures`: cell must be in expected set
 *       - `appliedOrders`: for P1 orders, all `orderCoords` must be
 *         in expected set; P2 orders must be absent (player filter)
 *       - `errors`: for cell-carrying errors, all referenced cells
 *         must be in expected set
 *       - `eliminations`: pass through unfiltered (no cell check)
 *   (c) `visibleCells` is row-major with no duplicates;
 *   (d) the no-memory rule holds across all 500 consecutive ticks —
 *       each tick's view equals a per-tick oracle that knows nothing
 *       about prior ticks, so carried-over state is impossible.
 *
 * Between ticks, real orders are submitted via `applyCommand` from
 * `@europa/engine`. Some orders reference cells inside P1's horizon,
 * others outside. Paratroop orders are staged in pairs so the second
 * one fails during resolution (generating `errors` events). Pipe
 * orders for P2 are always outside P1's horizon and are filtered by
 * the player predicate. A summary (`cells observed / leaked: 0`)
 * rides on the final assertion message instead of console output.
 */

import type { Coord, PlayerId, World } from '@europa/engine';

import { applyCommand, tick } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { orderCoords, validationErrorCoords } from '../src/eventsFilter';
import { computePlayerView } from '../src/playerView';
import { chebyshevDisk } from '../src/range';
import { P1, P2 } from './fixtures/ids';
import { buildWorldWithTroops, withVisibilityRadius } from './fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

/** Tick count per plan.md's protocol-level assertion. */
const TICKS = 500;

/** Placement tuple: `[x, y, player, count]`. */
type Placement = readonly [number, number, PlayerId, number];

/**
 * Paratroop source spend: 2 × `paratroopCost` (10) = 20 troops.
 * Used to decide whether to submit paratroop orders that will
 * produce resolution errors.
 */
const PARATROOP_SOURCE_SPEND = 20;

/**
 * Minimum troop count at a cell to submit two paratroop orders
 * (the first succeeds, the second fails with `no_source_troops`).
 */
const PARATROOP_MIN_TROOPS = PARATROOP_SOURCE_SPEND + 1;

/**
 * Resolve a universal ID to the engine's private 1-based dense owner
 * byte (the same encoding the engine's resolution reads/writes).
 *
 * @param world  World snapshot whose registry is authoritative.
 * @param player Registered universal ID.
 * @returns The 1-based dense owner byte.
 * @throws {Error} When the ID is not registered (test-author bug).
 */
function ownerByte(world: Readonly<World>, player: PlayerId): number {
    const index = world.playerRegistry.indexOfId(player);
    if (index === null) {
        throw new Error(`ownerByte: "${player}" is not registered`);
    }
    return index + 1;
}

/**
 * Rebuild a world's troop arrays from an explicit placement list
 * (the same clone-mutation path the engine's resolution uses).
 *
 * @param world      Source world (not mutated).
 * @param placements Full placement list for BOTH players.
 * @returns A new `World` with exactly these troops.
 */
function applyPlacements(world: Readonly<World>, placements: readonly Placement[]): World {
    const size = world.board.width;
    const owners = new Uint8Array(size * size);
    const counts = new Uint32Array(size * size);
    for (const [x, y, player, count] of placements) {
        owners[y * size + x] = ownerByte(world, player);
        counts[y * size + x] = count;
    }
    return { ...world, state: { ...world.state, troopOwners: owners, troopCounts: counts } };
}

/**
 * Independent visibility oracle: scan the raw state arrays for
 * `player` viewers (owner === resolved byte && count > 0), union their
 * bounds-clipped Chebyshev disks, sort row-major. Shares NO code with
 * `computeVisibleSet` beyond the fixture-level disk helper.
 *
 * @param world  The world snapshot to audit.
 * @param player The recipient universal ID.
 * @returns Row-major, duplicate-free `Coord[]` of expected cells.
 */
function expectedVisibleCoords(world: Readonly<World>, player: PlayerId): Coord[] {
    const { width, height } = world.board;
    const viewerByte = ownerByte(world, player);
    const seen = new Set<number>();
    const out: Coord[] = [];
    const { troopCounts, troopOwners } = world.state;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if ((troopOwners[idx] ?? 0) !== viewerByte) {
                continue;
            }
            if ((troopCounts[idx] ?? 0) <= 0) {
                continue;
            }
            for (const coord of chebyshevDisk({ x, y }, RADIUS, width, height)) {
                const key = coord.y * width + coord.x;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(coord);
                }
            }
        }
    }
    // Row-major canonical order (disks were unioned per-viewer).
    out.sort((a, b) => a.y * width + a.x - (b.y * width + b.x));
    return out;
}

/**
 * Find the first P1-owned cell with at least `minCount` troops.
 * Returns `undefined` when no cell qualifies (e.g. P1 was eliminated
 * or has no troops in the current script phase).
 *
 * @param world    The current world snapshot.
 * @param minCount Minimum troop count at the cell.
 * @returns The first qualifying `Coord`, or `undefined`.
 */
function findP1CellWithTroops(world: Readonly<World>, minCount: number): Coord | undefined {
    const { width, height } = world.board;
    const viewerByte = ownerByte(world, P1);
    const { troopCounts, troopOwners } = world.state;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if ((troopOwners[idx] ?? 0) === viewerByte && (troopCounts[idx] ?? 0) >= minCount) {
                return { x, y };
            }
        }
    }
    return undefined;
}

/**
 * Find the first P2-owned cell (any troop count). Used to stage
 * out-of-horizon pipe orders for P2 — these are always filtered by
 * the player predicate in `filterTickEvents`.
 *
 * @param world The current world snapshot.
 * @returns The first P2-owned `Coord`, or `undefined`.
 */
function findP2Cell(world: Readonly<World>): Coord | undefined {
    const { width, height } = world.board;
    const p2Byte = ownerByte(world, P2);
    const { troopCounts, troopOwners } = world.state;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if ((troopOwners[idx] ?? 0) === p2Byte && (troopCounts[idx] ?? 0) > 0) {
                return { x, y };
            }
        }
    }
    return undefined;
}

describe('SC-001 protocol-level redaction over a 500-tick scripted match', () => {
    it(`audits every tick for ${TICKS} ticks: zero leakage, ordered cells, filtered events`, () => {
        // Script cycles: stacks appear → move → split → one destroyed →
        // respawn elsewhere. Both players always keep ≥ 1 stack so the
        // engine never eliminates anyone mid-run.
        //
        // P1 troop counts are ≥ PARATROOP_MIN_TROOPS (21) so that
        // paratroop orders can be staged to produce resolution errors.
        const scripts: readonly (readonly Placement[])[] = [
            [
                [8, 8, P1, 25],
                [3, 3, P2, 2],
            ],
            [
                [10, 10, P1, 25],
                [5, 5, P2, 2],
            ],
            [
                [8, 8, P1, 25],
                [12, 12, P1, 25],
                [3, 3, P2, 2],
            ],
            [
                [8, 8, P1, 0], // destroyed by "combat"
                [12, 12, P1, 25],
                [14, 14, P2, 2],
            ],
            [
                [0, 15, P1, 25], // respawns at the far corner
                [12, 12, P1, 25],
                [14, 14, P2, 2],
            ],
        ];

        let world = withVisibilityRadius(buildWorldWithTroops(16, [...(scripts[0] ?? [])]), RADIUS);

        let totalCellsObserved = 0;
        let leakedCells = 0;
        let leakedEvents = 0;
        let leakedAppliedOrders = 0;
        let leakedErrors = 0;
        let totalAppliedOrders = 0;
        let totalErrors = 0;

        for (let t = 0; t < TICKS; t++) {
            // Scripted change every 10 ticks (cycle through the scripts).
            if (t > 0 && t % 10 === 0) {
                const script = scripts[Math.floor(t / 10) % scripts.length];
                if (script) {
                    world = applyPlacements(world, script);
                }
            }

            // ---- Stage real orders via applyCommand (T-117/T-118) ----
            //
            // Pipe orders for P1 (in-horizon) — always pass validation
            // because the cell is owned by P1.
            const p1Cell = findP1CellWithTroops(world, 1);
            if (p1Cell) {
                world = applyCommand(world, {
                    kind: 'setPipe',
                    player: P1,
                    cell: p1Cell,
                    direction: 'N',
                }).world;
            }

            // Pipe orders for P2 (out of P1's horizon) — filtered by
            // the player predicate, never visible to P1.
            const p2Cell = findP2Cell(world);
            if (p2Cell) {
                world = applyCommand(world, {
                    kind: 'setPipe',
                    player: P2,
                    cell: p2Cell,
                    direction: 'S',
                }).world;
            }

            // Paratroop orders for P1 — staged in PAIRS so the second
            // one fails during resolution with `no_source_troops`.
            // Both pass `validateCommand` (validated against the same
            // world state before any orders are applied), but the
            // second fails in Phase 2 after the first depletes the
            // source. This produces a real `errors` event with cell
            // coordinates that the filter must redact.
            const paraSource = findP1CellWithTroops(world, PARATROOP_MIN_TROOPS);
            if (paraSource) {
                // Target within Chebyshev range 2 of the source.
                const paraTarget: Coord = { x: paraSource.x, y: Math.max(0, paraSource.y - 2) };
                // First paratroop — will succeed (depletes source).
                world = applyCommand(world, {
                    kind: 'paratroop',
                    player: P1,
                    source: paraSource,
                    target: paraTarget,
                }).world;
                // Second paratroop — will fail during resolution
                // (source depleted by the first).
                world = applyCommand(world, {
                    kind: 'paratroop',
                    player: P1,
                    source: paraSource,
                    target: paraTarget,
                }).world;
            }

            // ---- Advance with the REAL engine tick ----
            const { world: nextWorld, events } = tick(world);
            world = nextWorld;

            // Per-tick independent oracle (knows nothing about other ticks).
            const expected = expectedVisibleCoords(world, P1);
            const expectedKeys = new Set(expected.map((c) => c.y * world.board.width + c.x));

            const view = computePlayerView(world, P1, { events });

            // (a) Zero leakage — exact set equality against the oracle.
            expect(view.visibleCells).toHaveLength(expected.length);
            for (const cell of view.visibleCells) {
                totalCellsObserved++;
                if (!expectedKeys.has(cell.coord.y * world.board.width + cell.coord.x)) {
                    leakedCells++;
                }
            }

            // (b) No out-of-horizon cell-level events survive filtering.
            // Audit ALL FIVE TickEvents categories (T-117/T-118).

            // --- combat ---
            for (const event of view.events.combat) {
                if (!expectedKeys.has(event.cell.y * world.board.width + event.cell.x)) {
                    leakedEvents++;
                }
            }

            // --- captures ---
            for (const event of view.events.captures) {
                if (!expectedKeys.has(event.cell.y * world.board.width + event.cell.x)) {
                    leakedEvents++;
                }
            }

            // --- appliedOrders ---
            // P1 orders: all referenced cells must be in the horizon.
            // P2 orders: must be absent (filtered by player predicate).
            for (const record of view.events.appliedOrders) {
                totalAppliedOrders++;
                if (record.order.player === P1) {
                    // P1's own orders: every referenced cell must be visible.
                    for (const coord of orderCoords(record.order)) {
                        if (!expectedKeys.has(coord.y * world.board.width + coord.x)) {
                            leakedAppliedOrders++;
                        }
                    }
                } else {
                    // Another player's order leaked into P1's view — this
                    // is a filter failure (player predicate should block it).
                    leakedAppliedOrders++;
                }
            }

            // --- errors ---
            // Cell-carrying errors: all referenced cells must be visible.
            // Non-cell-carrying errors (e.g. `already_surrendered`) are
            // always included — no cell check needed.
            for (const entry of view.events.errors) {
                totalErrors++;
                const coords = validationErrorCoords(entry.reason);
                for (const coord of coords) {
                    if (!expectedKeys.has(coord.y * world.board.width + coord.x)) {
                        leakedErrors++;
                    }
                }
            }

            // --- eliminations ---
            // Pass through unfiltered (player-level, not cell-bound).
            // No cell-level leakage check needed — just verify they're
            // all present.
            expect(view.events.eliminations).toHaveLength(events.eliminations.length);

            // (c) Row-major strictly increasing flat keys → no duplicates.
            let lastKey = -1;
            for (const cell of view.visibleCells) {
                const key = cell.coord.y * world.board.width + cell.coord.x;
                expect(key).toBeGreaterThan(lastKey);
                lastKey = key;
            }
        }

        // (d) No-memory: enforced structurally — each tick was compared
        // against a fresh per-tick oracle; any recall would have broken
        // the exact-equality check above.
        expect(leakedCells, `${String(totalCellsObserved)} cells observed / leaked: ${String(leakedCells)}`).toBe(0);
        expect(leakedEvents, `out-of-horizon events leaked: ${String(leakedEvents)}`).toBe(0);
        expect(
            leakedAppliedOrders,
            `out-of-horizon appliedOrders leaked: ${String(leakedAppliedOrders)} of ${String(totalAppliedOrders)}`,
        ).toBe(0);
        expect(leakedErrors, `out-of-horizon errors leaked: ${String(leakedErrors)} of ${String(totalErrors)}`).toBe(0);
    });
});
