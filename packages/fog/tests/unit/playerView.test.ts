/**
 * Unit Tests: computePlayerView — Feature 002, US1 (T022)
 *
 * Covers FR-002 + FR-003 + FR-005:
 *   - In-horizon cells appear in `visibleCells` as fully-decoded
 *     `CellView` (terrain, elevation, troopCount, troopOwner, pipes,
 *     reservesPercent, cityOwner all present).
 *   - Out-of-horizon cells are ABSENT (structural redaction — no
 *     placeholder object).
 *   - Enemy troop inside horizon shows exact `troopCount` and
 *     `troopOwner`.
 *   - The `config` field snapshots `world.config`; `tick` echoes
 *     `world.tick`; `player` echoes the input.
 *   - `events` is the horizon-filtered `TickEvents` supplied by the
 *     caller (cell-level events outside the horizon are dropped;
 *     player-level events are always kept).
 */

import type { TickEvents } from '@europa/engine';

import { getCell } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/playerView';
import { isVisible } from '../../src/utils';
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/**
 * Scenario radius per quickstart Q-F01 ("Chebyshev range 3"): a
 * radius-3 disk is 7×7 = 49 cells unclipped.
 */
const RADIUS = 3;

/** Empty event set helper (all categories, zero entries). */
function noEvents(): TickEvents {
    return {
        combat: [],
        captures: [],
        eliminations: [],
        appliedOrders: [],
        errors: [],
    };
}

describe('computePlayerView (US1)', () => {
    it('decodes in-horizon cells fully (terrain, elevation, counts, owners, pipes, reserves, city)', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        const view = computePlayerView(world, 1);

        const home = view.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 8);
        expect(home).toBeDefined();
        expect(home?.cell.terrain).toBe('land');
        expect(home?.cell.elevation).toBe(0);
        expect(home?.troopCount).toBe(5);
        expect(home?.troopOwner).toBe(1);
        expect(home?.pipes.size).toBe(0);
        expect(home?.reservesPercent).toBe(0);
        expect(home?.cityOwner).toBeNull();

        // Every decoded cell matches what the engine's read helper
        // returns for that coord (decode fidelity).
        for (const cell of view.visibleCells) {
            expect(cell).toEqual(getCell(world, cell.coord.x, cell.coord.y));
        }
    });

    it('omits out-of-horizon cells entirely (structural redaction, no placeholder)', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        const view = computePlayerView(world, 1);

        // (0,0) is Chebyshev-distance 8 from (8,8) — well beyond radius 4.
        expect(isVisible(view, { x: 0, y: 0 })).toBe(false);
        expect(view.visibleCells.find((c) => c.coord.x === 0 && c.coord.y === 0)).toBeUndefined();
        // Exactly the 49 horizon cells, nothing else.
        expect(view.visibleCells).toHaveLength(49);
    });

    it('exposes enemy troops inside the horizon with exact count and owner', () => {
        const world = buildWorldWithTroops(16, [
            [8, 8, 1, 5],
            [10, 8, 2, 7], // Chebyshev distance 2 — inside radius 4.
        ]);
        const view = computePlayerView(world, 1);

        const enemy = view.visibleCells.find((c) => c.coord.x === 10 && c.coord.y === 8);
        expect(enemy).toBeDefined();
        expect(enemy?.troopCount).toBe(7);
        expect(enemy?.troopOwner).toBe(2);
    });

    it('hides enemy troops outside the horizon entirely', () => {
        const world = buildWorldWithTroops(16, [
            [8, 8, 1, 5],
            [15, 15, 2, 9], // Chebyshev distance 7 — outside radius 4.
        ]);
        const view = computePlayerView(world, 1);

        expect(view.visibleCells.find((c) => c.coord.x === 15 && c.coord.y === 15)).toBeUndefined();
    });

    it('echoes player, tick, and a config snapshot', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        const view = computePlayerView(world, 1);

        expect(view.player).toBe(1);
        expect(view.tick).toBe(world.tick);
        expect(view.config).toEqual(world.config);
    });

    it('filters cell-level events outside the horizon and keeps in-horizon ones', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        const events: TickEvents = {
            combat: [
                {
                    tick: world.tick,
                    cell: { x: 9, y: 9 }, // inside radius 4 of (8,8)
                    attacker: 1,
                    defender: 2,
                    attackerLoss: 1,
                    defenderLoss: 2,
                    winner: 1,
                },
                {
                    tick: world.tick,
                    cell: { x: 0, y: 15 }, // far outside
                    attacker: 2,
                    defender: 1,
                    attackerLoss: 0,
                    defenderLoss: 1,
                    winner: 2,
                },
            ],
            captures: [],
            eliminations: [{ tick: world.tick, player: 2, reason: 'no_troops_no_cities' }],
            appliedOrders: [],
            errors: [],
        };

        const view = computePlayerView(world, 1, { events });
        expect(view.events.combat).toHaveLength(1);
        expect(view.events.combat[0]?.cell).toEqual({ x: 9, y: 9 });
        // Player-level events always survive.
        expect(view.events.eliminations).toHaveLength(1);
    });

    it('defaults to empty events when none are supplied', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        const view = computePlayerView(world, 1);
        expect(view.events).toEqual(noEvents());
    });

    it('returns an empty view for a player with no troops', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 2, 5]]), RADIUS);
        const view = computePlayerView(world, 1);
        expect(view.visibleCells).toHaveLength(0);
    });
});
