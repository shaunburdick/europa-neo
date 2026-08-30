/**
 * Unit tests: pipe slope classification — Feature 005 FR-013 (issue #30).
 *
 * Pins the console-side mirror of the engine's flow formula
 * (`pipeFlowRate`) and the renderer's slope classification
 * (`classifyPipeSlope`) to the PM-confirmed formula (R-1 — asymmetric
 * cap): downhill bonus capped at `flowSlopeDeltaCap`, uphill handicap
 * uncapped, stall at Δ ≥ `flowBase / flowSlopeStep` = 7.
 *
 * Expected values are hardcoded per the spec's own listing (spec 001
 * v1.2 / 005 v1.2); the drift test (`slope-drift.test.ts`) pins the
 * mirror against `ENGINE_CONSTANTS` / `flowRateForDelta` so a future
 * retune fails loudly here too.
 */

import { describe, expect, test } from 'vitest';
import {
    classifyPipeSlope,
    PIPE_SLOPE_CONSTANTS,
    pipeFlowRate,
    type PipeSlope,
} from '../../../src/render/pipe-slope';

describe('PIPE_SLOPE_CONSTANTS (005 FR-013 mirror)', () => {
    test('mirrors the engine flow constants exactly', () => {
        expect(PIPE_SLOPE_CONSTANTS).toEqual({
            flowBase: 7,
            flowSlopeStep: 1,
            flowSlopeDeltaCap: 5,
        });
    });

    test('exposes the three documented fields as numbers', () => {
        expect(typeof PIPE_SLOPE_CONSTANTS.flowBase).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowSlopeStep).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowSlopeDeltaCap).toBe('number');
    });
});

describe('pipeFlowRate (formula mirror, R-1 asymmetric cap)', () => {
    test('downhill (Δ < 0): base + step × min(|Δ|, cap) — 8/9/10/11/12', () => {
        expect(pipeFlowRate(-1, PIPE_SLOPE_CONSTANTS)).toBe(8);
        expect(pipeFlowRate(-2, PIPE_SLOPE_CONSTANTS)).toBe(9);
        expect(pipeFlowRate(-3, PIPE_SLOPE_CONSTANTS)).toBe(10);
        expect(pipeFlowRate(-4, PIPE_SLOPE_CONSTANTS)).toBe(11);
        expect(pipeFlowRate(-5, PIPE_SLOPE_CONSTANTS)).toBe(12);
    });

    test('downhill bonus saturates at the cap (Δ ≤ -5 → 12)', () => {
        expect(pipeFlowRate(-6, PIPE_SLOPE_CONSTANTS)).toBe(12);
        expect(pipeFlowRate(-10, PIPE_SLOPE_CONSTANTS)).toBe(12);
        expect(pipeFlowRate(-100, PIPE_SLOPE_CONSTANTS)).toBe(12);
    });

    test('flat (Δ = 0): base — 7', () => {
        expect(pipeFlowRate(0, PIPE_SLOPE_CONSTANTS)).toBe(7);
    });

    test('uphill flowing (Δ = 1..6): uncapped handicap — 6/5/4/3/2/1', () => {
        expect(pipeFlowRate(1, PIPE_SLOPE_CONSTANTS)).toBe(6);
        expect(pipeFlowRate(2, PIPE_SLOPE_CONSTANTS)).toBe(5);
        expect(pipeFlowRate(3, PIPE_SLOPE_CONSTANTS)).toBe(4);
        expect(pipeFlowRate(4, PIPE_SLOPE_CONSTANTS)).toBe(3);
        expect(pipeFlowRate(5, PIPE_SLOPE_CONSTANTS)).toBe(2);
        expect(pipeFlowRate(6, PIPE_SLOPE_CONSTANTS)).toBe(1);
    });

    test('uphill stalls at Δ ≥ 7 — 0', () => {
        expect(pipeFlowRate(7, PIPE_SLOPE_CONSTANTS)).toBe(0);
        expect(pipeFlowRate(8, PIPE_SLOPE_CONSTANTS)).toBe(0);
        expect(pipeFlowRate(10, PIPE_SLOPE_CONSTANTS)).toBe(0);
        expect(pipeFlowRate(100, PIPE_SLOPE_CONSTANTS)).toBe(0);
    });
});

describe('classifyPipeSlope (005 FR-013)', () => {
    test('downhill: destination elevation < source', () => {
        expect(classifyPipeSlope(100, 50, PIPE_SLOPE_CONSTANTS)).toBe('downhill');
        expect(classifyPipeSlope(100, 99, PIPE_SLOPE_CONSTANTS)).toBe('downhill');
    });

    test('flat: equal elevation', () => {
        expect(classifyPipeSlope(100, 100, PIPE_SLOPE_CONSTANTS)).toBe('flat');
        expect(classifyPipeSlope(0, 0, PIPE_SLOPE_CONSTANTS)).toBe('flat');
    });

    test('uphill flowing: Δ = 1..6 (rate > 0)', () => {
        expect(classifyPipeSlope(100, 101, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
        expect(classifyPipeSlope(100, 103, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
        expect(classifyPipeSlope(100, 106, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
    });

    test('stalled: uphill with flow rate 0 (Δ ≥ 7)', () => {
        expect(classifyPipeSlope(100, 107, PIPE_SLOPE_CONSTANTS)).toBe('stalled');
        expect(classifyPipeSlope(100, 120, PIPE_SLOPE_CONSTANTS)).toBe('stalled');
        expect(classifyPipeSlope(0, 255, PIPE_SLOPE_CONSTANTS)).toBe('stalled');
    });

    test('fog fallback: unknown destination elevation → flat (no slope claim)', () => {
        expect(classifyPipeSlope(100, null, PIPE_SLOPE_CONSTANTS)).toBe('flat');
        expect(classifyPipeSlope(0, null, PIPE_SLOPE_CONSTANTS)).toBe('flat');
    });

    test('every classification is a member of the PipeSlope union', () => {
        const classifications: PipeSlope[] = [
            classifyPipeSlope(100, 50, PIPE_SLOPE_CONSTANTS),
            classifyPipeSlope(100, 100, PIPE_SLOPE_CONSTANTS),
            classifyPipeSlope(100, 103, PIPE_SLOPE_CONSTANTS),
            classifyPipeSlope(100, 107, PIPE_SLOPE_CONSTANTS),
            classifyPipeSlope(100, null, PIPE_SLOPE_CONSTANTS),
        ];
        for (const slope of classifications) {
            expect(['downhill', 'flat', 'uphill', 'stalled']).toContain(slope);
        }
    });
});