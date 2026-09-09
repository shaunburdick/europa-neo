/**
 * Unit tests: pipe slope classification — Feature 005 FR-013 (issue #30).
 *
 * Pins the console-side mirror of the engine's flow formula
 * (`pipeFlowRate`) and the renderer's slope classification
 * (`classifyPipeSlope`) to the equal-split formula (spec 001
 * Clarifications v1.9):
 *   perPipe = floor(flowRate / numPipes)
 *   downhill: perPipe + flowDownhillStep × min(|Δ|, flowSlopeDeltaCap)
 *   flat:     perPipe
 *   uphill:   max(0, perPipe − flowUphillStep × |Δ|)
 *   stall at Δ ≥ perPipe / flowUphillStep (varies by pipe count).
 *
 * For single-pipe classification (perPipe = flowRate = 12), stall
 * occurs at Δ ≥ 12.
 *
 * Expected values are hardcoded per the formula; the drift test
 * (`slope-drift.test.ts`) pins the mirror against `ENGINE_CONSTANTS`
 * / `flowRateForDelta` so a future retune fails loudly here too.
 */

import { describe, expect, test } from 'vitest';
import {
    classifyPipeSlope,
    PIPE_SLOPE_CONSTANTS,
    type PipeSlope,
    pipeFlowRate,
    pipeIntensity,
} from '../../../src/render/pipe-slope';

describe('PIPE_SLOPE_CONSTANTS (005 FR-013 mirror)', () => {
    test('mirrors the engine flow constants exactly', () => {
        expect(PIPE_SLOPE_CONSTANTS).toEqual({
            flowRate: 12,
            flowDownhillStep: 1,
            flowUphillStep: 1,
            flowSlopeDeltaCap: 5,
        });
    });

    test('exposes the four documented fields as numbers', () => {
        expect(typeof PIPE_SLOPE_CONSTANTS.flowRate).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowDownhillStep).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowUphillStep).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowSlopeDeltaCap).toBe('number');
    });
});

describe('pipeFlowRate (formula mirror, equal-split spec 001 Clarifications v1.9)', () => {
    test('downhill (Δ < 0): perPipe + downhillStep × min(|Δ|, cap) — 13/14/15/16/17', () => {
        expect(pipeFlowRate(-1, 12, PIPE_SLOPE_CONSTANTS)).toBe(13);
        expect(pipeFlowRate(-2, 12, PIPE_SLOPE_CONSTANTS)).toBe(14);
        expect(pipeFlowRate(-3, 12, PIPE_SLOPE_CONSTANTS)).toBe(15);
        expect(pipeFlowRate(-4, 12, PIPE_SLOPE_CONSTANTS)).toBe(16);
        expect(pipeFlowRate(-5, 12, PIPE_SLOPE_CONSTANTS)).toBe(17);
    });

    test('downhill bonus saturates at the cap (Δ ≤ -5 → 17)', () => {
        expect(pipeFlowRate(-6, 12, PIPE_SLOPE_CONSTANTS)).toBe(17);
        expect(pipeFlowRate(-10, 12, PIPE_SLOPE_CONSTANTS)).toBe(17);
        expect(pipeFlowRate(-100, 12, PIPE_SLOPE_CONSTANTS)).toBe(17);
    });

    test('flat (Δ = 0): perPipe — 12', () => {
        expect(pipeFlowRate(0, 12, PIPE_SLOPE_CONSTANTS)).toBe(12);
    });

    test('uphill flowing (Δ = 1..11): linear scale from 11 to 1', () => {
        expect(pipeFlowRate(1, 12, PIPE_SLOPE_CONSTANTS)).toBe(11); // 12 − 1
        expect(pipeFlowRate(6, 12, PIPE_SLOPE_CONSTANTS)).toBe(6); // 12 − 6
        expect(pipeFlowRate(11, 12, PIPE_SLOPE_CONSTANTS)).toBe(1); // 12 − 11
    });

    test('uphill stalls at Δ ≥ 12 — 0', () => {
        expect(pipeFlowRate(12, 12, PIPE_SLOPE_CONSTANTS)).toBe(0);
        expect(pipeFlowRate(80, 12, PIPE_SLOPE_CONSTANTS)).toBe(0);
        expect(pipeFlowRate(100, 12, PIPE_SLOPE_CONSTANTS)).toBe(0);
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

    test('uphill flowing: Δ = 1..11 (rate > 0)', () => {
        expect(classifyPipeSlope(100, 101, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
        expect(classifyPipeSlope(100, 106, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
        expect(classifyPipeSlope(100, 111, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
    });

    test('stalled: uphill with flow rate 0 (Δ ≥ 12)', () => {
        expect(classifyPipeSlope(100, 112, PIPE_SLOPE_CONSTANTS)).toBe('stalled');
        expect(classifyPipeSlope(100, 200, PIPE_SLOPE_CONSTANTS)).toBe('stalled');
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
            classifyPipeSlope(100, 120, PIPE_SLOPE_CONSTANTS),
            classifyPipeSlope(100, null, PIPE_SLOPE_CONSTANTS),
        ];
        for (const slope of classifications) {
            expect(['downhill', 'flat', 'uphill', 'stalled']).toContain(slope);
        }
    });
});

describe('pipeIntensity (issue #43)', () => {
    const C = PIPE_SLOPE_CONSTANTS;

    test('downhill Δ=0 → intensity 0', () => {
        // Δ=0 classifies as flat, so intensity is 0.
        expect(pipeIntensity(100, 100, 'flat', C)).toBe(0);
    });

    test('downhill intensity scales linearly with |Δ| up to cap', () => {
        // Δ=-1 → |Δ|=1 → 1/5 = 0.2
        expect(pipeIntensity(100, 99, 'downhill', C)).toBe(1 / 5);
        // Δ=-2 → |Δ|=2 → 2/5 = 0.4
        expect(pipeIntensity(100, 98, 'downhill', C)).toBe(2 / 5);
        // Δ=-3 → |Δ|=3 → 3/5 = 0.6
        expect(pipeIntensity(100, 97, 'downhill', C)).toBe(3 / 5);
        // Δ=-4 → |Δ|=4 → 4/5 = 0.8
        expect(pipeIntensity(100, 96, 'downhill', C)).toBe(4 / 5);
        // Δ=-5 → |Δ|=5 → 5/5 = 1.0 (saturates at cap)
        expect(pipeIntensity(100, 95, 'downhill', C)).toBe(1);
    });

    test('downhill intensity saturates at 1 for |Δ| > cap', () => {
        expect(pipeIntensity(100, 94, 'downhill', C)).toBe(1);
        expect(pipeIntensity(100, 90, 'downhill', C)).toBe(1);
        expect(pipeIntensity(100, 0, 'downhill', C)).toBe(1);
    });

    test('uphill intensity scales linearly with Δ up to flowRate', () => {
        // Normalized by flowRate = 12
        // Δ=1 → 1/12
        expect(pipeIntensity(100, 101, 'uphill', C)).toBe(1 / 12);
        // Δ=6 → 6/12 = 0.5
        expect(pipeIntensity(100, 106, 'uphill', C)).toBe(6 / 12);
        // Δ=12 → 12/12 = 1.0 (saturates at flowRate)
        expect(pipeIntensity(100, 112, 'uphill', C)).toBe(1);
    });

    test('uphill intensity saturates at 1 for Δ > flowRate', () => {
        expect(pipeIntensity(100, 113, 'uphill', C)).toBe(1);
        expect(pipeIntensity(100, 280, 'uphill', C)).toBe(1);
    });

    test('flat → intensity 0', () => {
        expect(pipeIntensity(100, 100, 'flat', C)).toBe(0);
    });

    test('stalled → intensity 0', () => {
        expect(pipeIntensity(100, 180, 'stalled', C)).toBe(0);
    });

    test('fog fallback (dstElev=null) → intensity 0', () => {
        expect(pipeIntensity(100, null, 'flat', C)).toBe(0);
        expect(pipeIntensity(100, null, 'downhill', C)).toBe(0);
    });
});
