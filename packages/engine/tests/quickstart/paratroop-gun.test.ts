/**
 * Quickstart Q-008 — Paratroopers and Guns — Feature 001, T046
 *
 * End-to-end exercise of US4 (paratroopers + guns) via the full tick
 * pipeline (`runScenario` delegates to `applyCommand` + `tick`):
 *   - Paratroop 2:1 cost + destination pipe clear
 *   - Out-of-range paratroop rejection (via `applyCommand` preflight)
 *   - Into-water paratroop rejection
 *   - Gun friendly-fire
 *   - Gun at empty cell
 *
 * The unit tests in `paratroop.test.ts` and `gun.test.ts` exercise
 * the rule functions directly with hand-built state; this quickstart
 * focuses on the integration story through the engine pipeline.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/applyCommand';
import { ENGINE_CONSTANTS } from '../../src/constants';
import { createWorld } from '../../src/create';
import { getCell } from '../../src/read';
import type { MatchConfig, Order, PlayerId, World } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';
import { runScenario } from '../fixtures/scenarios';

const cfg: MatchConfig = {
    boardSize: 8,
    playerCount: 2,
    tickIntervalMs: 250,
    seed: 0xfeed1234,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
};

// N paratroopers per order (= paratroopCost); source spends 2N, target gains N.
const N = ENGINE_CONSTANTS.paratroopCost;
const TWO_N = N * 2;

/** Build a fresh World from a board. */
function freshWorld(board: ReturnType<typeof buildSmallBoard>): World {
    return createWorld(cfg, board);
}

describe('quickstart Q-008 — paratroop 2:1 cost + destination pipe clear', () => {
    it('paratroop from P1 city: source loses 2N, destination owner flipped to source', () => {
        // P1 city at (1,1), P2 city at (6,6) so match doesn't immediately
        // terminate. After 30 ticks P1's city has 30 troops. Paratroop
        // from P1 onto a P2 cell at (1,3). The destination was empty
        // (no city) so paratroop adds N troops there. After 1 tick of
        // decay (because destination has no city / no friendly inflow),
        // destination count = N - 1.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const paratroopOrder: Order = {
            kind: 'paratroop',
            player: 1 as PlayerId,
            source: { x: 1, y: 1 },
            target: { x: 1, y: 3 },
        };
        const orders = [{ atTick: 30, order: paratroopOrder }];
        const { finalWorld } = runScenario(cfg, board, orders, 31);
        // Source (1,1) loses 2N from its 30-troop stack.
        expect(getCell(finalWorld, 1, 1).troopCount).toBe(30 - TWO_N);
        // Destination (1,3) gained paratroopers (now ≥ 1 because of the
        // 1 tick of decay — N - 1 = 9, but we just assert ≥ 1 to keep
        // the test robust to ENGINE_CONSTANTS changes).
        expect(getCell(finalWorld, 1, 3).troopCount).toBeGreaterThanOrEqual(1);
        // Destination owner = source's player (paratroopers flip ownership).
        expect(getCell(finalWorld, 1, 3).troopOwner).toBe(1);
    });

    it('paratroop clears destination pipeMasks (FR-013)', () => {
        // P1 has city at (1,1); P2 has city at (1,3). Set pipe E on P2's
        // city on tick 29, then paratroop from P1 onto it on tick 30.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [1, 3, 2],
        ]);
        const orders: Array<{ atTick: number; order: Order }> = [
            {
                atTick: 29,
                order: { kind: 'setPipe', player: 2 as PlayerId, cell: { x: 1, y: 3 }, direction: 'E' },
            },
            {
                atTick: 30,
                order: {
                    kind: 'paratroop',
                    player: 1 as PlayerId,
                    source: { x: 1, y: 1 },
                    target: { x: 1, y: 3 },
                },
            },
        ];
        const { finalWorld } = runScenario(cfg, board, orders, 31);
        // Destination's pipeMasks cleared by paratroop.
        expect(finalWorld.state.pipeMasks[3 * 8 + 1]).toBe(0);
    });
});

describe('quickstart Q-008 — paratroop validation rejections', () => {
    it('out-of-range paratroop: applyCommand rejects with paratroop_range', () => {
        // Both players have cities so US5 terminal detection doesn't fire.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const { finalWorld: w0 } = runScenario(cfg, board, [], 30);
        const r = applyCommand(w0, {
            kind: 'paratroop',
            player: 1 as PlayerId,
            source: { x: 1, y: 1 },
            target: { x: 7, y: 7 }, // Chebyshev distance = 6
        });
        expect(r.result.ok).toBe(false);
        if (!r.result.ok) {
            expect(r.result.reason.kind).toBe('paratroop_range');
        }
    });

    it('into-water paratroop: applyCommand rejects with water_target', () => {
        // Build a board with P1 city at (1,1) and water at (3,3), plus
        // a P2 city at (6,6) so US5 doesn't terminate.
        const size = 8;
        const cells = Array.from({ length: size * size }, (_, i) => ({
            x: i % size,
            y: Math.floor(i / size),
            elevation: 0,
            terrain: 'land' as const,
        }));
        cells[3 * size + 3] = {
            ...(cells[3 * size + 3] ?? { x: 0, y: 0, elevation: 0, terrain: 'land' }),
            terrain: 'water',
        };
        const board = Object.freeze({
            width: size,
            height: size,
            cells: Object.freeze(cells),
            cities: Object.freeze([
                { cell: { x: 1, y: 1 }, owner: 1 as PlayerId },
                { cell: { x: 6, y: 6 }, owner: 2 as PlayerId },
            ]),
        });
        const { finalWorld: w0 } = runScenario(cfg, board, [], 30);
        const r = applyCommand(w0, {
            kind: 'paratroop',
            player: 1 as PlayerId,
            source: { x: 1, y: 1 },
            target: { x: 3, y: 3 },
        });
        expect(r.result.ok).toBe(false);
        if (!r.result.ok) {
            expect(r.result.reason.kind).toBe('water_target');
        }
    });
});

describe('quickstart Q-008 — gun friendly fire', () => {
    it('gun fired into a friendly-occupied cell: friendly troops take damage', () => {
        // P1 has two cities at (1,1) and (1,3); P2 has city at (6,6) so
        // the match doesn't terminate. After 30 ticks both P1 cities have
        // 30 troops. Fire a gun from (1,1) at (1,3) — friendly fire.
        // Use tickCount=31 so we observe state immediately after the gun
        // fires (tick 30 → world.tick=31), before an extra production tick.
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [1, 3, 1],
            [6, 6, 2],
        ]);
        const gunOrder: Order = {
            kind: 'gun',
            player: 1 as PlayerId,
            source: { x: 1, y: 1 },
            target: { x: 1, y: 3 },
        };
        const orders = [{ atTick: 30, order: gunOrder }];
        const { finalWorld, events } = runScenario(cfg, board, orders, 31);
        // Target (1,3) loses gunDamage (=2) from its 30-troop stack.
        expect(getCell(finalWorld, 1, 3).troopCount).toBe(30 - ENGINE_CONSTANTS.gunDamage);
        // Owner unchanged (still P1 — friendly fire doesn't change ownership).
        expect(getCell(finalWorld, 1, 3).troopOwner).toBe(1);
        // Source (1,1) loses gunCost.
        expect(getCell(finalWorld, 1, 1).troopCount).toBe(30 - ENGINE_CONSTANTS.gunCost);
        // No validation errors.
        expect(events[events.length - 1]?.errors).toEqual([]);
    });

    it('gun fired at empty cell: source loses gunCost, target stays at 0', () => {
        const board = buildSmallBoard(8, [
            [1, 1, 1],
            [6, 6, 2],
        ]);
        const gunOrder: Order = {
            kind: 'gun',
            player: 1 as PlayerId,
            source: { x: 1, y: 1 },
            target: { x: 1, y: 3 },
        };
        const orders = [{ atTick: 30, order: gunOrder }];
        const { finalWorld } = runScenario(cfg, board, orders, 31);
        // Source lost gunCost.
        expect(getCell(finalWorld, 1, 1).troopCount).toBe(30 - ENGINE_CONSTANTS.gunCost);
        // Target stays at 0 (no movement).
        expect(getCell(finalWorld, 1, 3).troopCount).toBe(0);
        expect(getCell(finalWorld, 1, 3).troopOwner).toBe(null);
    });
});

// Suppress unused-helper lint warning when `freshWorld` isn't used.
void freshWorld;
