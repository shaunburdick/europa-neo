/**
 * Acceptance Tests: US3 — Spectator Sees Everything (Feature 002, T035)
 *
 * Covers the spec US3 acceptance scenario:
 *
 *   AC-1: Given a player surrenders mid-match, When subsequent ticks
 *         broadcast, Then their client receives unrestricted board
 *         state and cannot issue orders.
 *
 * The surrender is modeled as `computePlayerView(world, player,
 * { spectator: true })` for that player. Fog's contract is the VIEW
 * only: unrestricted board state + unfiltered events. Order
 * revocation is feature 004's concern — fog has no opinion on
 * orders, so this suite asserts fog delivers the full board, not
 * that orders are rejected.
 */

import type { TickEvents } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/playerView';
import { isVisible } from '../../src/utils';
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/** Scenario radius per quickstart Q-F05 (Chebyshev range 3). */
const RADIUS = 3;

describe('US3 — Spectator Sees Everything', () => {
    it('AC-1: Given a player surrenders mid-match, When subsequent ticks broadcast, Then their client receives unrestricted board state', () => {
        // A sparse board: the surrendering player holds ONE stack; most
        // of the map is outside their horizon.
        const world = withVisibilityRadius(
            buildWorldWithTroops(16, [
                [8, 8, 1, 5],
                [2, 2, 2, 3],
            ]),
            RADIUS,
        );

        // Sanity: the non-spectator view is horizon-filtered…
        const playerView = computePlayerView(world, 1);
        expect(playerView.visibleCells.length).toBeLessThan(16 * 16);
        expect(isVisible(playerView, { x: 15, y: 15 })).toBe(false);

        // …but the spectator view is unrestricted: EVERY cell decoded.
        const spectatorView = computePlayerView(world, 1, { spectator: true });
        expect(spectatorView.visibleCells).toHaveLength(16 * 16);
        // Corners and center are present and decoded.
        for (const coord of [
            { x: 0, y: 0 },
            { x: 15, y: 0 },
            { x: 0, y: 15 },
            { x: 15, y: 15 },
            { x: 8, y: 8 },
        ]) {
            const cell = spectatorView.visibleCells.find((c) => c.coord.x === coord.x && c.coord.y === coord.y);
            expect(cell).toBeDefined();
            expect(cell?.cell.terrain).toBe('land');
        }
        // Enemy stacks are exposed with exact data everywhere.
        const enemy = spectatorView.visibleCells.find((c) => c.coord.x === 2 && c.coord.y === 2);
        expect(enemy?.troopOwner).toBe(2);
        expect(enemy?.troopCount).toBe(3);
    });

    it('AC-1 (events): Given a spectator session, When events broadcast, Then cell-level events are unfiltered regardless of horizon', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
        const events: TickEvents = {
            combat: [
                {
                    tick: world.tick,
                    cell: { x: 0, y: 0 }, // far outside any horizon
                    attacker: 2,
                    defender: 1,
                    attackerLoss: 0,
                    defenderLoss: 1,
                    winner: 2,
                },
            ],
            captures: [],
            eliminations: [],
            appliedOrders: [],
            errors: [],
        };

        const spectatorView = computePlayerView(world, 1, { spectator: true, events });
        expect(spectatorView.events.combat).toHaveLength(1);
        expect(spectatorView.events.combat[0]?.cell).toEqual({ x: 0, y: 0 });
    });

    it('AC-1 (read-only boundary): fog delivers the full board; order enforcement is feature 004\u2019s concern', () => {
        // Fog has no opinion on orders — the "cannot issue orders" half
        // of US3 AC-1 lives in networking. Here we pin fog's side of the
        // contract: a full-board view for ANY player id requested.
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 2, 4]]), RADIUS);
        const viewForPlayer1 = computePlayerView(world, 1, { spectator: true });
        const viewForPlayer2 = computePlayerView(world, 2, { spectator: true });
        expect(viewForPlayer1.visibleCells).toHaveLength(16 * 16);
        expect(viewForPlayer2.visibleCells).toHaveLength(16 * 16);
        expect(viewForPlayer1.player).toBe(1);
        expect(viewForPlayer2.player).toBe(2);
    });
});
