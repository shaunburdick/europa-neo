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
 *   - An unresolved universal ID (forged/malformed/numeric) fails
 *     closed: no cells and no events (FR-010, issue #74).
 */

import type { PlayerId, TickEvents } from '@europa/engine';

import { getCell } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/playerView';
import { isVisible } from '../../src/utils';
import { FORGED_ID, MALFORMED_ID, NUMERIC_ID, P1, P2 } from '../fixtures/ids';
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/**
 * Scenario radius per quickstart Q-F01 ("Chebyshev range 3"): a
 * radius-3 disk is 7×7 = 49 cells unclipped.
 */
const RADIUS = 3;

/** Universe of adversarial, unregistered identities for fail-closed tests. */
const UNRESOLVED_IDS = [FORGED_ID, MALFORMED_ID, NUMERIC_ID] as const;

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
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
        const view = computePlayerView(world, P1);

        const home = view.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 8);
        expect(home).toBeDefined();
        expect(home?.cell.terrain).toBe('land');
        expect(home?.cell.elevation).toBe(0);
        expect(home?.troopCount).toBe(5);
        expect(home?.troopOwner).toBe(P1);
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
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
        const view = computePlayerView(world, P1);

        // (0,0) is Chebyshev-distance 8 from (8,8) — well beyond radius 4.
        expect(isVisible(view, { x: 0, y: 0 })).toBe(false);
        expect(view.visibleCells.find((c) => c.coord.x === 0 && c.coord.y === 0)).toBeUndefined();
        // Exactly the 49 horizon cells, nothing else.
        expect(view.visibleCells).toHaveLength(49);
    });

    it('exposes enemy troops inside the horizon with exact count and owner', () => {
        const world = buildWorldWithTroops(16, [
            [8, 8, P1, 5],
            [10, 8, P2, 7], // Chebyshev distance 2 — inside radius 4.
        ]);
        const view = computePlayerView(world, P1);

        const enemy = view.visibleCells.find((c) => c.coord.x === 10 && c.coord.y === 8);
        expect(enemy).toBeDefined();
        expect(enemy?.troopCount).toBe(7);
        expect(enemy?.troopOwner).toBe(P2);
    });

    it('hides enemy troops outside the horizon entirely', () => {
        const world = buildWorldWithTroops(16, [
            [8, 8, P1, 5],
            [15, 15, P2, 9], // Chebyshev distance 7 — outside radius 4.
        ]);
        const view = computePlayerView(world, P1);

        expect(view.visibleCells.find((c) => c.coord.x === 15 && c.coord.y === 15)).toBeUndefined();
    });

    it('echoes player, tick, and a config snapshot', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
        const view = computePlayerView(world, P1);

        expect(view.player).toBe(P1);
        expect(view.tick).toBe(world.tick);
        expect(view.config).toEqual(world.config);
    });

    it('copies the identity list so a view cannot mutate authoritative world config (N1)', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
        const original = [...world.config.playerIds];
        const view = computePlayerView(world, P1);

        // The snapshot must own a distinct array instance, not alias the
        // engine's retained (unfrozen) `config.playerIds`.
        expect(view.config.playerIds).not.toBe(world.config.playerIds);
        expect(view.config.playerIds).toEqual(original);

        // Mutating the view's config (the payload consumer's handle to
        // it) must not be able to reach the world's authoritative config.
        const mutable = view.config.playerIds as PlayerId[];
        mutable[0] = P2;
        expect(view.config.playerIds[0]).toBe(P2);
        expect(world.config.playerIds).toEqual(original);
        expect(world.config.playerIds[0]).toBe(P1);
    });

    it('filters cell-level events outside the horizon and keeps in-horizon ones', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
        const events: TickEvents = {
            combat: [
                {
                    tick: world.tick,
                    cell: { x: 9, y: 9 }, // inside radius 4 of (8,8)
                    attacker: P1,
                    defender: P2,
                    attackerLoss: 1,
                    defenderLoss: 2,
                    winner: P1,
                },
                {
                    tick: world.tick,
                    cell: { x: 0, y: 15 }, // far outside
                    attacker: P2,
                    defender: P1,
                    attackerLoss: 0,
                    defenderLoss: 1,
                    winner: P2,
                },
            ],
            captures: [],
            eliminations: [{ tick: world.tick, player: P2, reason: 'no_troops_no_cities' }],
            appliedOrders: [],
            errors: [],
        };

        const view = computePlayerView(world, P1, { events });
        expect(view.events.combat).toHaveLength(1);
        expect(view.events.combat[0]?.cell).toEqual({ x: 9, y: 9 });
        // Player-level events always survive.
        expect(view.events.eliminations).toHaveLength(1);
    });

    it('defaults to empty events when none are supplied', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
        const view = computePlayerView(world, P1);
        expect(view.events).toEqual(noEvents());
    });

    it('returns an empty view for a player with no troops', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P2, 5]]), RADIUS);
        const view = computePlayerView(world, P1);
        expect(view.visibleCells).toHaveLength(0);
    });

    describe('fail-closed identity handling (FR-010)', () => {
        it('returns an empty view with no events for forged/malformed/numeric IDs', () => {
            const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
            // Populated events would otherwise be filtered, not erased —
            // an unresolved ID must disclose nothing, including
            // player-level events.
            const events: TickEvents = {
                combat: [],
                captures: [],
                eliminations: [{ tick: world.tick, player: P2, reason: 'surrendered' }],
                appliedOrders: [],
                errors: [],
            };

            for (const unresolved of UNRESOLVED_IDS) {
                const view = computePlayerView(world, unresolved, { events });
                expect(view.player).toBe(unresolved);
                expect(view.visibleCells).toHaveLength(0);
                expect(view.events).toEqual(noEvents());
            }
        });

        it('never inherits a registered seat’s view', () => {
            const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P1, 5]]), RADIUS);
            const valid = computePlayerView(world, P1);
            expect(valid.visibleCells).toHaveLength(49);

            for (const unresolved of UNRESOLVED_IDS) {
                const forged = computePlayerView(world, unresolved);
                expect(forged.visibleCells).toHaveLength(0);
                expect(forged.visibleCells).not.toEqual(valid.visibleCells);
            }
        });
    });
});
