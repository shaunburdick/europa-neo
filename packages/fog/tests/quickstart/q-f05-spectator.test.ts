/**
 * Quickstart Q-F05 — Spectator sees everything (Feature 002, US3, T034)
 *
 * Per quickstart.md §2 Q-F05:
 *   - Non-spectator view of a player with no troops is empty.
 *   - Same world with `options.spectator: true` returns a view with
 *     every cell on the board; corners and center spot-checked.
 *   - Spectator events are unfiltered (pass-through).
 *   - A spectator's identity is correlation-only: an unresolved
 *     (null/forged) target still receives the full board because the
 *     read-only session flag — not the ID — is the authority
 *     (FR-009 / FR-010, issue #74).
 */

import type { TickEvents } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/index';
import { FORGED_ID, P1, P2 } from '../fixtures/ids';
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

describe('Q-F05 — spectator sees everything', () => {
    it('non-spectator view of a troopless player is empty', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P2, 5]]), RADIUS);
        const view = computePlayerView(world, P1);
        expect(view.visibleCells).toHaveLength(0);
    });

    it('spectator view of the same world contains every cell on the board', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P2, 5]]), RADIUS);
        const view = computePlayerView(world, P1, { spectator: true });
        expect(view.visibleCells).toHaveLength(16 * 16);

        // Spot-check: corners + center present and decoded.
        for (const [x, y] of [
            [0, 0],
            [15, 0],
            [0, 15],
            [15, 15],
            [8, 8],
        ] as const) {
            const cell = view.visibleCells.find((c) => c.coord.x === x && c.coord.y === y);
            expect(cell).toBeDefined();
            expect(cell?.cell.terrain).toBe('land');
            expect(cell?.coord).toEqual({ x, y });
        }
    });

    it('spectator events are unfiltered: out-of-horizon combat events pass through', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P2, 5]]), RADIUS);
        const events: TickEvents = {
            combat: [
                {
                    tick: world.tick,
                    cell: { x: 0, y: 15 }, // outside any horizon
                    attacker: P2,
                    defender: P1,
                    attackerLoss: 1,
                    defenderLoss: 0,
                    winner: P2,
                },
            ],
            captures: [],
            eliminations: [],
            appliedOrders: [],
            errors: [],
        };

        // Non-spectator: dropped. Spectator: kept.
        const filtered = computePlayerView(world, P1, { events });
        expect(filtered.events.combat).toHaveLength(0);

        const unfiltered = computePlayerView(world, P1, { spectator: true, events });
        expect(unfiltered.events.combat).toHaveLength(1);
    });

    it('an unresolved spectator target still receives the full board (ID is metadata, not authority)', () => {
        const world = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, P2, 5]]), RADIUS);

        // The horizon path fails closed for this forged ID…
        expect(computePlayerView(world, FORGED_ID).visibleCells).toHaveLength(0);

        // …but a server-authorized spectator session sees everything,
        // because the read-only flag is the authority, not the ID.
        const spectator = computePlayerView(world, FORGED_ID, { spectator: true });
        expect(spectator.visibleCells).toHaveLength(16 * 16);
        expect(spectator.player).toBe(FORGED_ID);

        // Neutral cells decode their owners as null (no numeric seat
        // sentinel leaks into the payload).
        const empty = spectator.visibleCells.find((c) => c.coord.x === 0 && c.coord.y === 0);
        expect(empty?.troopOwner).toBeNull();
        expect(empty?.cityOwner).toBeNull();
    });
});
