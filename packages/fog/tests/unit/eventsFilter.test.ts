/**
 * Unit Tests: filterTickEvents — Feature 002 (T019) + Issue #143 (T-104, T-108)
 *
 * Covers FR-003 cell-level filtering and FR-012 (appliedOrders / errors):
 *   - `CombatEvent` inside the visible set kept; outside dropped.
 *   - `CaptureEvent` inside kept; outside dropped.
 *   - `EliminationEvent` (no `cell`) always kept.
 *   - `AppliedOrderRecord` — included only when player matches AND
 *     all referenced cells are visible (FR-012).
 *   - `errors` — included only when all referenced cells are visible;
 *     non-cell-carrying variants always included (FR-012).
 *   - `spectator: true` returns events unchanged (same reference).
 *   - Emission order is preserved within each category.
 *
 * Indirect tests for `orderCoords` (8 order kinds) and
 * `validationErrorCoords` (11 ValidationError variants) via
 * `filterTickEvents` — the helpers are not exported but their
 * behavior is exercised through the filter.
 *
 * Event identities use canonical universal `PlayerId` fixtures
 * (issue #74); the filter itself is identity-agnostic and only
 * inspects cell coordinates.
 */

import type { TickEvents } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { filterTickEvents } from '../../src/eventsFilter';
import { P1, P2, P3 } from '../fixtures/ids';
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
    // ----------------------------------------------------------------
    // Cell-level filtering (existing tests)
    // ----------------------------------------------------------------

    it('keeps CombatEvents inside the horizon and drops those outside', () => {
        const inside = {
            tick: 0,
            cell: { x: 8, y: 8 },
            attacker: P1,
            defender: P2,
            attackerLoss: 1,
            defenderLoss: 0,
            winner: P1,
            attackerTotal: 5,
            defenderTotal: 3,
        };
        const outside = {
            tick: 0,
            cell: { x: 0, y: 0 },
            attacker: P2,
            defender: P1,
            attackerLoss: 0,
            defenderLoss: 2,
            winner: P2,
            attackerTotal: 4,
            defenderTotal: 1,
        };
        const result = filterTickEvents(world, VISIBLE_CELLS, eventsWith({ combat: [inside, outside] }), false);
        expect(result.combat).toEqual([inside]);
    });

    it('keeps CaptureEvents inside the horizon and drops those outside', () => {
        const inside = {
            tick: 3,
            cell: { x: 9, y: 9 },
            fromOwner: null,
            toOwner: P1,
            isCity: false,
        };
        const outside = {
            tick: 3,
            cell: { x: 15, y: 15 },
            fromOwner: P2,
            toOwner: P1,
            isCity: true,
        };
        const result = filterTickEvents(world, VISIBLE_CELLS, eventsWith({ captures: [outside, inside] }), false);
        expect(result.captures).toEqual([inside]);
    });

    it('always keeps eliminations (player-level, not cell-bound)', () => {
        const events = eventsWith({
            eliminations: [{ tick: 5, player: P3, reason: 'surrendered' }],
        });

        const result = filterTickEvents(world, [], events, false);
        expect(result.eliminations).toHaveLength(1);
    });

    it('returns the input reference unchanged when spectating', () => {
        const events = eventsWith({
            combat: [
                {
                    tick: 0,
                    cell: { x: 0, y: 0 },
                    attacker: P1,
                    defender: P2,
                    attackerLoss: 0,
                    defenderLoss: 0,
                    winner: 'tie',
                    attackerTotal: 1,
                    defenderTotal: 1,
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
                    attacker: P1,
                    defender: P2,
                    attackerLoss: 0,
                    defenderLoss: 0,
                    winner: 'tie',
                    attackerTotal: 1,
                    defenderTotal: 1,
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
            attacker: P1,
            defender: P2,
            attackerLoss: 1,
            defenderLoss: 0,
            winner: P1,
            attackerTotal: 5,
            defenderTotal: 3,
        };
        const second = {
            tick: 0,
            cell: { x: 9, y: 9 },
            attacker: P2,
            defender: P1,
            attackerLoss: 0,
            defenderLoss: 1,
            winner: P2,
            attackerTotal: 4,
            defenderTotal: 2,
        };
        const thirdOutside = {
            tick: 0,
            cell: { x: 0, y: 15 },
            attacker: P1,
            defender: P2,
            attackerLoss: 2,
            defenderLoss: 0,
            winner: P1,
            attackerTotal: 6,
            defenderTotal: 1,
        };
        const result = filterTickEvents(
            world,
            VISIBLE_CELLS,
            eventsWith({ combat: [first, thirdOutside, second] }),
            false,
        );
        expect(result.combat).toEqual([first, second]);
    });

    // ----------------------------------------------------------------
    // Fast path: empty events → identity preserved
    // ----------------------------------------------------------------

    it('returns input reference when all event arrays are empty', () => {
        const events = eventsWith({});
        const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
        expect(result).toBe(events);
    });

    // ----------------------------------------------------------------
    // appliedOrders filtering (FR-012) — exercised through filterTickEvents
    // ----------------------------------------------------------------

    describe('appliedOrders filtering (FR-012)', () => {
        it('includes setPipe order when player matches AND cell is visible', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
            expect(result.appliedOrders[0]?.order).toBe(order);
        });

        it('excludes setPipe order when cell is outside horizon', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 0, y: 0 }, direction: 'north' as const };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(0);
        });

        it('excludes appliedOrder when player does not match', () => {
            const order = { kind: 'setPipe' as const, player: P2, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(0);
        });

        it('includes paratroop order when both source and target are visible', () => {
            const order = {
                kind: 'paratroop' as const,
                player: P1,
                source: { x: 7, y: 7 },
                target: { x: 9, y: 9 },
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
        });

        it('excludes paratroop order when source is visible but target is outside', () => {
            const order = {
                kind: 'paratroop' as const,
                player: P1,
                source: { x: 8, y: 8 },
                target: { x: 0, y: 0 },
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(0);
        });

        it('includes gun order when both source and target are visible', () => {
            const order = {
                kind: 'gun' as const,
                player: P1,
                source: { x: 7, y: 7 },
                target: { x: 9, y: 9 },
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
        });

        it('excludes gun order when target is outside horizon', () => {
            const order = {
                kind: 'gun' as const,
                player: P1,
                source: { x: 8, y: 8 },
                target: { x: 15, y: 15 },
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(0);
        });

        it('includes surrender order (no cell refs) when player matches', () => {
            const order = { kind: 'surrender' as const, player: P1 };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
        });

        it('excludes surrender order when player does not match', () => {
            const order = { kind: 'surrender' as const, player: P2 };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(0);
        });

        it('includes clearPipe order when player matches and cell is visible', () => {
            const order = {
                kind: 'clearPipe' as const,
                player: P1,
                cell: { x: 8, y: 8 },
                direction: 'north' as const,
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
        });

        it('includes setPipesExclusive order when player matches and cell is visible', () => {
            const order = {
                kind: 'setPipesExclusive' as const,
                player: P1,
                cell: { x: 8, y: 8 },
                direction: 'east' as const,
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
        });

        it('includes clearAllPipes order when player matches and cell is visible', () => {
            const order = {
                kind: 'clearAllPipes' as const,
                player: P1,
                cell: { x: 8, y: 8 },
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
        });

        it('includes setReserves order when player matches and cell is visible', () => {
            const order = {
                kind: 'setReserves' as const,
                player: P1,
                cell: { x: 8, y: 8 },
                percent: 50,
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(1);
        });

        it('excludes setReserves order when cell is outside horizon', () => {
            const order = {
                kind: 'setReserves' as const,
                player: P1,
                cell: { x: 0, y: 0 },
                percent: 50,
            };
            const events = eventsWith({
                appliedOrders: [{ tick: 1, order, result: { ok: true } }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(0);
        });

        it('preserves order within appliedOrders category', () => {
            const order1 = {
                kind: 'setPipe' as const,
                player: P1,
                cell: { x: 7, y: 7 },
                direction: 'north' as const,
            };
            const order2 = {
                kind: 'setReserves' as const,
                player: P1,
                cell: { x: 9, y: 9 },
                percent: 30,
            };
            const events = eventsWith({
                appliedOrders: [
                    { tick: 1, order: order1, result: { ok: true } },
                    { tick: 1, order: order2, result: { ok: true } },
                ],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result.appliedOrders).toHaveLength(2);
            expect(result.appliedOrders[0]?.order).toBe(order1);
            expect(result.appliedOrders[1]?.order).toBe(order2);
        });
    });

    // ----------------------------------------------------------------
    // errors filtering (FR-012) — exercised through filterTickEvents
    // ----------------------------------------------------------------

    describe('errors filtering (FR-012)', () => {
        it('includes error with cell-carrying variant when cell is visible', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'not_owner' as const, coord: { x: 8, y: 8 } };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('excludes error with cell-carrying variant when cell is outside horizon', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 0, y: 0 }, direction: 'north' as const };
            const reason = { kind: 'not_owner' as const, coord: { x: 0, y: 0 } };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(0);
        });

        it('includes error with out_of_bounds variant when coord is visible', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'out_of_bounds' as const, coord: { x: 8, y: 8 } };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('excludes error with out_of_bounds variant when coord is outside', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 0, y: 0 }, direction: 'north' as const };
            const reason = { kind: 'out_of_bounds' as const, coord: { x: 0, y: 0 } };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(0);
        });

        it('includes error with water_target variant when coord is visible', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'water_target' as const, coord: { x: 8, y: 8 } };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('includes error with no_source_troops variant when coord is visible', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'no_source_troops' as const, coord: { x: 8, y: 8 } };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('includes error with paratroop_range variant when both source and target visible', () => {
            const order = {
                kind: 'paratroop' as const,
                player: P1,
                source: { x: 7, y: 7 },
                target: { x: 9, y: 9 },
            };
            const reason = {
                kind: 'paratroop_range' as const,
                source: { x: 7, y: 7 },
                target: { x: 9, y: 9 },
                distance: 3,
            };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('excludes error with paratroop_range variant when target is outside', () => {
            const order = {
                kind: 'paratroop' as const,
                player: P1,
                source: { x: 8, y: 8 },
                target: { x: 0, y: 0 },
            };
            const reason = {
                kind: 'paratroop_range' as const,
                source: { x: 8, y: 8 },
                target: { x: 0, y: 0 },
                distance: 10,
            };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(0);
        });

        it('includes error with already_surrendered variant (no cell refs)', () => {
            const order = { kind: 'surrender' as const, player: P1 };
            const reason = { kind: 'already_surrendered' as const, player: P1 };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('includes error with invalid_percent variant (no cell refs)', () => {
            const order = {
                kind: 'setReserves' as const,
                player: P1,
                cell: { x: 8, y: 8 },
                percent: 55,
            };
            const reason = { kind: 'invalid_percent' as const, percent: 55 };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('includes error with unknown_player variant (no cell refs)', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'unknown_player' as const, player: P3 };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('includes error with unknown_order variant (no cell refs)', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'unknown_order' as const };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('includes error with invalid_direction variant (no cell refs)', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'invalid_direction' as const, direction: 'invalid' };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('includes error with match_terminal variant (no cell refs)', () => {
            const order = { kind: 'setPipe' as const, player: P1, cell: { x: 8, y: 8 }, direction: 'north' as const };
            const reason = { kind: 'match_terminal' as const };
            const events = eventsWith({
                errors: [{ order, reason }],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(1);
        });

        it('preserves order within errors category', () => {
            const order1 = { kind: 'setPipe' as const, player: P1, cell: { x: 7, y: 7 }, direction: 'north' as const };
            const reason1 = { kind: 'not_owner' as const, coord: { x: 7, y: 7 } };
            const order2 = {
                kind: 'setReserves' as const,
                player: P1,
                cell: { x: 9, y: 9 },
                percent: 50,
            };
            const reason2 = { kind: 'no_source_troops' as const, coord: { x: 9, y: 9 } };
            const events = eventsWith({
                errors: [
                    { order: order1, reason: reason1 },
                    { order: order2, reason: reason2 },
                ],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false);
            expect(result.errors).toHaveLength(2);
        });
    });

    // ----------------------------------------------------------------
    // Mixed categories — identity preservation
    // ----------------------------------------------------------------

    describe('identity preservation', () => {
        it('returns original reference when nothing is dropped across all categories', () => {
            const events = eventsWith({
                combat: [
                    {
                        tick: 0,
                        cell: { x: 8, y: 8 },
                        attacker: P1,
                        defender: P2,
                        attackerLoss: 0,
                        defenderLoss: 0,
                        winner: 'tie',
                        attackerTotal: 1,
                        defenderTotal: 1,
                    },
                ],
                appliedOrders: [
                    {
                        tick: 0,
                        order: {
                            kind: 'setPipe' as const,
                            player: P1,
                            cell: { x: 8, y: 8 },
                            direction: 'north' as const,
                        },
                        result: { ok: true },
                    },
                ],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result).toBe(events);
        });

        it('returns new object when any category has items dropped', () => {
            const events = eventsWith({
                combat: [
                    {
                        tick: 0,
                        cell: { x: 0, y: 0 }, // outside horizon
                        attacker: P1,
                        defender: P2,
                        attackerLoss: 0,
                        defenderLoss: 0,
                        winner: 'tie',
                        attackerTotal: 1,
                        defenderTotal: 1,
                    },
                ],
            });
            const result = filterTickEvents(world, VISIBLE_CELLS, events, false, P1);
            expect(result).not.toBe(events);
            expect(result.combat).toHaveLength(0);
        });
    });
});
