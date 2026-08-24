/**
 * Subcell-target unit tests — Feature 005 (T057).
 *
 * Covers spec US3 AC-1/2/3 and the contract's 5-bin threshold rule
 * (contracts/console-types.ts §"Subcell targeting"):
 *   · subcell (0.85, 0.15) with source (10, 10) targets (12, 8)
 *     (NE ring 2 — the original's documented "red subcell" example);
 *   · the center bin (0.5, 0.5) means self → no launch;
 *   · every threshold boundary bins per the documented rule;
 *   · preflight gating: water / off-horizon targets reject before any
 *     dispatch; enemy-owned targets pass (server is final authority).
 */

import { describe, expect, test } from 'vitest';

import { DEFAULT_CAMERA } from '../../../src/config';
import { hitTest } from '../../../src/input/hit-test';
import { subcellToTargetCoord, subcellToTargetOffset } from '../../../src/input/subcell';
import { buildAbilityAction, CURSOR_STALE_MS, isCursorFresh } from '../../../src/input/subcell-target';
import type { ConsoleState, CursorTarget, Direction } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';

describe('subcellToTargetOffset: the 5-bin threshold rule', () => {
    test('bins each axis per the documented thresholds', () => {
        const cases: [number, number][] = [
            // [x value, expected dx]
            [0.0, -2],
            [0.19, -2],
            [0.2, -1],
            [0.39, -1],
            [0.4, 0],
            [0.59, 0],
            [0.6, 1],
            [0.79, 1],
            [0.8, 2],
            [0.999, 2],
        ];
        for (const [x, dx] of cases) {
            expect(subcellToTargetOffset({ x, y: 0.5 })).toEqual({ dx, dy: 0 });
        }
    });

    test('y axis mirrors the same rule (0 = north)', () => {
        expect(subcellToTargetOffset({ x: 0.5, y: 0.15 })).toEqual({ dx: 0, dy: -2 });
        expect(subcellToTargetOffset({ x: 0.5, y: 0.85 })).toEqual({ dx: 0, dy: 2 });
    });

    test('center bin yields (0, 0) — self', () => {
        expect(subcellToTargetOffset({ x: 0.5, y: 0.5 })).toEqual({ dx: 0, dy: 0 });
    });

    test('every result satisfies Chebyshev ≤ SUBCELL_RANGE (2)', () => {
        for (let i = 0; i < 25; i++) {
            const x = i * 0.04;
            for (let j = 0; j < 25; j++) {
                const { dx, dy } = subcellToTargetOffset({ x, y: j * 0.04 });
                expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(2);
            }
        }
    });
});

describe('subcellToTargetCoord', () => {
    test('NE ring-2 aim from (10, 10) hits (12, 8) (US3 AC-1 posture)', () => {
        expect(subcellToTargetCoord({ x: 10, y: 10 }, { x: 0.85, y: 0.15 })).toEqual({ x: 12, y: 8 });
    });

    test('off-board negative targets fail safe to the source (self-reject)', () => {
        expect(subcellToTargetCoord({ x: 0, y: 0 }, { x: 0.1, y: 0.5 })).toEqual({ x: 0, y: 0 });
    });
});

/** Board with land/water/enemy cells around anchor (10, 10). */
function state(): ConsoleState {
    const view = buildPlayerView({
        width: 16,
        height: 16,
        playerId: 1,
        visibleCells: [
            buildCellView({
                coord: { x: 10, y: 10 },
                elevation: 50,
                troops: 20,
                owner: 1,
                pipes: new Set<Direction>(['N']),
            }),
            buildCellView({ coord: { x: 12, y: 8 }, elevation: 20 }), // NE ring 2, land
            buildCellView({ coord: { x: 11, y: 12 }, terrain: 'water' }), // SE ring 1/2, water
            buildCellView({ coord: { x: 12, y: 10 }, elevation: 30, troops: 5, owner: 2 }), // E ring 2, enemy
        ],
    });
    return { ...createLiveConsoleState(view), selection: { x: 10, y: 10 } };
}

function cursorIn(fx: number, fy: number): CursorTarget {
    return hitTest({ x: (10 + fx) * DEFAULT_CAMERA.zoom, y: (10 + fy) * DEFAULT_CAMERA.zoom }, DEFAULT_CAMERA);
}

describe('buildAbilityAction (US3 AC-1/2/3)', () => {
    test('fresh NE aim builds a paratroop action to exactly (12, 8)', () => {
        const outcome = buildAbilityAction({
            kind: 'paratroop',
            selection: { x: 10, y: 10 },
            cursor: cursorIn(0.85, 0.15),
            cursorAgeMs: 10,
            state: state(),
        });
        expect(outcome).toEqual({
            status: 'ok',
            action: { kind: 'paratroop', source: { x: 10, y: 10 }, target: { x: 12, y: 8 } },
        });
    });

    test('same posture builds a gun action to the same destination (AC-2)', () => {
        const outcome = buildAbilityAction({
            kind: 'gun',
            selection: { x: 10, y: 10 },
            cursor: cursorIn(0.85, 0.15),
            cursorAgeMs: 10,
            state: state(),
        });
        expect(outcome).toMatchObject({
            status: 'ok',
            action: { kind: 'gun', target: { x: 12, y: 8 } },
        });
    });

    test('center subcell → no launch (center-subcell)', () => {
        const outcome = buildAbilityAction({
            kind: 'paratroop',
            selection: { x: 10, y: 10 },
            cursor: cursorIn(0.5, 0.5),
            cursorAgeMs: 10,
            state: state(),
        });
        expect(outcome).toEqual({ status: 'no_launch', reason: 'center-subcell' });
    });

    test('stale cursor aim defaults to center → no launch (research.md §13 #3)', () => {
        const outcome = buildAbilityAction({
            kind: 'gun',
            selection: { x: 10, y: 10 },
            cursor: cursorIn(0.85, 0.15),
            cursorAgeMs: CURSOR_STALE_MS + 1,
            state: state(),
        });
        expect(outcome).toEqual({ status: 'no_launch', reason: 'stale-cursor' });
    });

    test('no cursor sample at all → no launch (no-cursor)', () => {
        const outcome = buildAbilityAction({
            kind: 'paratroop',
            selection: { x: 10, y: 10 },
            cursor: null,
            cursorAgeMs: null,
            state: state(),
        });
        expect(outcome).toEqual({ status: 'no_launch', reason: 'no-cursor' });
    });

    test('no selection anchor → no launch (no-selection)', () => {
        const outcome = buildAbilityAction({
            kind: 'paratroop',
            selection: null,
            cursor: cursorIn(0.85, 0.15),
            cursorAgeMs: 10,
            state: state(),
        });
        expect(outcome).toEqual({ status: 'no_launch', reason: 'no-selection' });
    });

    test('water target rejected by preflight before any order exists (AC-3)', () => {
        const outcome = buildAbilityAction({
            kind: 'paratroop',
            selection: { x: 10, y: 10 },
            cursor: cursorIn(0.65, 0.85), // (+1, +2) → water (11, 12)
            cursorAgeMs: 10,
            state: state(),
        });
        expect(outcome).toEqual({
            status: 'rejected',
            reason: { kind: 'water_target', coord: { x: 11, y: 12 } },
        });
    });

    test('target outside the visibility horizon fails closed (out_of_bounds)', () => {
        const outcome = buildAbilityAction({
            kind: 'gun',
            selection: { x: 10, y: 10 },
            cursor: cursorIn(0.1, 0.1), // (-2, -2) → (8, 8): unseen
            cursorAgeMs: 10,
            state: state(),
        });
        expect(outcome).toEqual({
            status: 'rejected',
            reason: { kind: 'out_of_bounds', coord: { x: 8, y: 8 } },
        });
    });

    test('enemy-owned target is NOT preflight-rejected (server final authority)', () => {
        const outcome = buildAbilityAction({
            kind: 'paratroop',
            selection: { x: 10, y: 10 },
            cursor: cursorIn(0.85, 0.5), // (+2, 0) → enemy (12, 10)
            cursorAgeMs: 10,
            state: state(),
        });
        expect(outcome).toEqual({
            status: 'ok',
            action: { kind: 'paratroop', source: { x: 10, y: 10 }, target: { x: 12, y: 10 } },
        });
    });
});

describe('isCursorFresh', () => {
    test('boundary behavior matches CURSOR_STALE_MS', () => {
        expect(isCursorFresh(null)).toBe(false);
        expect(isCursorFresh(0)).toBe(true);
        expect(isCursorFresh(CURSOR_STALE_MS)).toBe(true);
        expect(isCursorFresh(CURSOR_STALE_MS + 1)).toBe(false);
    });
});
