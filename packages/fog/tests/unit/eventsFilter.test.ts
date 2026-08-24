/**
 * Unit Tests: filterTickEvents — Feature 002 (T019)
 *
 * Covers FR-003 cell-level filtering:
 *   - `CombatEvent` inside the visible set kept; outside dropped.
 *   - `CaptureEvent` inside kept; outside dropped.
 *   - `EliminationEvent` (no `cell`) always kept.
 *   - `AppliedOrderRecord` (no `cell`) always kept.
 *   - `errors` (no `cell`) always kept.
 *   - `spectator: true` returns events unchanged (same reference).
 *   - Emission order is preserved within each category.
 */

import type { TickEvents } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { filterTickEvents } from '../../src/eventsFilter';
import { buildSmallWorld } from '../fixtures/world';

/** 16×16 empty world — geometry only, no troops needed for filtering. */
const world = buildSmallWorld(16, 2);

/** All cells within radius 4 of (8,8) on a 16×16 board. */
const VISIBLE_CELLS = [
    { x: 7, y: 7 },
    { x: 8, y: 8 },
    { x: 9, y: 9 },
];

function eventsWith(overrides: Partial<TickEvents>): TickEvents {
    return {
        combat: [],
        captures: [],
        eliminations: [],
        appliedOrders: [],
        errors: [],
        ...overrides,
    };
}

describe('filterTickEvents', () => {
    it('keeps CombatEvents inside the horizon and drops those outside', () => {
        const inside = {
            tick: 0,
            cell: { x: 8, y: 8 },
            attacker: 1,
            defender: 2,
            attackerLoss: 1,
            defenderLoss: 0,
            winner: 1 as const,
        };
        const outside = {
            tick: 0,
            cell: { x: 0, y: 0 },
            attacker: 2,
            defender: 1,
            attackerLoss: 0,
            defenderLoss: 2,
            winner: 2 as const,
        };
        const result = filterTickEvents(world, VISIBLE_CELLS, eventsWith({ combat: [inside, outside] }), false);
        expect(result.combat).toEqual([inside]);
    });

    it('keeps CaptureEvents inside the horizon and drops those outside', () => {
        const inside = {
            tick: 3,
            cell: { x: 9, y: 9 },
            fromOwner: null,
            toOwner: 1 as const,
            isCity: false,
        };
        const outside = {
            tick: 3,
            cell: { x: 15, y: 15 },
            fromOwner: 2 as const,
            toOwner: 1 as const,
            isCity: true,
        };
        const result = filterTickEvents(world, VISIBLE_CELLS, eventsWith({ captures: [outside, inside] }), false);
        expect(result.captures).toEqual([inside]);
    });

    it('always keeps player-level events (eliminations, appliedOrders, errors)', () => {
        const events = eventsWith({
            eliminations: [{ tick: 5, player: 3, reason: 'surrendered' }],
            appliedOrders: [
                {
                    tick: 5,
                    order: {
                        kind: 'move',
                        units: 1,
                        path: [
                            { x: 1, y: 1 },
                            { x: 2, y: 1 },
                        ],
                    },
                    result: { ok: true },
                },
            ],
            errors: [],
        });

        // Horizon that contains NONE of the event cells (there are none).
        const result = filterTickEvents(world, [], events, false);
        expect(result.eliminations).toHaveLength(1);
        expect(result.appliedOrders).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
    });

    it('returns the input reference unchanged when spectating', () => {
        const events = eventsWith({
            combat: [
                {
                    tick: 0,
                    cell: { x: 0, y: 0 },
                    attacker: 1,
                    defender: 2,
                    attackerLoss: 0,
                    defenderLoss: 0,
                    winner: 'tie',
                },
            ],
        });
        const result = filterTickEvents(world, [], events, true);
        expect(result).toBe(events);
    });

    it('returns the input reference when nothing needs dropping', () => {
        const events = eventsWith({
            combat: [
                {
                    tick: 0,
                    cell: { x: 7, y: 7 },
                    attacker: 1,
                    defender: 2,
                    attackerLoss: 0,
                    defenderLoss: 0,
                    winner: 'tie',
                },
            ],
        });
        const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
        expect(result).toBe(events);
    });

    it('preserves emission order within a category', () => {
        const first = {
            tick: 0,
            cell: { x: 8, y: 8 },
            attacker: 1,
            defender: 2,
            attackerLoss: 1,
            defenderLoss: 0,
            winner: 1 as const,
        };
        const second = {
            tick: 0,
            cell: { x: 9, y: 9 },
            attacker: 2,
            defender: 1,
            attackerLoss: 0,
            defenderLoss: 1,
            winner: 2 as const,
        };
        const thirdOutside = {
            tick: 0,
            cell: { x: 0, y: 15 },
            attacker: 1,
            defender: 2,
            attackerLoss: 2,
            defenderLoss: 0,
            winner: 1 as const,
        };
        const result = filterTickEvents(
            world,
            VISIBLE_CELLS,
            eventsWith({ combat: [first, thirdOutside, second] }),
            false,
        );
        expect(result.combat).toEqual([first, second]);
    });
});
