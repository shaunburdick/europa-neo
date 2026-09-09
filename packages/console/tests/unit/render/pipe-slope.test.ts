/**
 * Unit tests: pipe slope classification — Feature 005 FR-013 (issue #30).
 *
 * Pins the console-side mirror of the engine's flow formula
 * (`pipeFlowRate`) and the renderer's slope classification
 * (`classifyPipeSlope`) to the spec 024 v1.3 formula (FR-051):
 * downhill bonus capped at `flowSlopeDeltaCap`, uphill linear scale
 * to 0 at `flowUphillCap`, stall at Δ ≥ flowUphillCap (80).
 *
 * Expected values are hardcoded per the spec's own listing (spec 024
 * v1.3 FR-051); the drift test (`slope-drift.test.ts`) pins the
 * mirror against `ENGINE_CONSTANTS` / `flowRateForDelta` so a future
 * retune fails loudly here too.
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
            flowBase: 7,
            flowDownhillStep: 1,
            flowUphillStep: 1,
            flowSlopeDeltaCap: 5,
            flowUphillCap: 80,
        });
    });

    test('exposes the five documented fields as numbers', () => {
        expect(typeof PIPE_SLOPE_CONSTANTS.flowBase).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowDownhillStep).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowUphillStep).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowSlopeDeltaCap).toBe('number');
        expect(typeof PIPE_SLOPE_CONSTANTS.flowUphillCap).toBe('number');
    });
});

describe('pipeFlowRate (formula mirror, spec 024 v1.3 FR-051)', () => {
    test('downhill (Δ < 0): base + downhillStep × min(|Δ|, cap) — 8/9/10/11/12', () => {
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

    test('uphill flowing (Δ = 1..79): linear scale from 7 to 1', () => {
        // ceil(7 × (80 − Δ) / 80)
        expect(pipeFlowRate(1, PIPE_SLOPE_CONSTANTS)).toBe(7); // ceil(6.9125)
        expect(pipeFlowRate(10, PIPE_SLOPE_CONSTANTS)).toBe(7); // ceil(6.125)
        expect(pipeFlowRate(20, PIPE_SLOPE_CONSTANTS)).toBe(6); // ceil(5.25)
        expect(pipeFlowRate(40, PIPE_SLOPE_CONSTANTS)).toBe(4); // ceil(3.5)
        expect(pipeFlowRate(60, PIPE_SLOPE_CONSTANTS)).toBe(2); // ceil(1.75)
        expect(pipeFlowRate(73, PIPE_SLOPE_CONSTANTS)).toBe(1); // ceil(0.6125)
        expect(pipeFlowRate(79, PIPE_SLOPE_CONSTANTS)).toBe(1); // ceil(0.0875)
    });

    test('uphill stalls at Δ ≥ 80 — 0', () => {
        expect(pipeFlowRate(80, PIPE_SLOPE_CONSTANTS)).toBe(0);
        expect(pipeFlowRate(81, PIPE_SLOPE_CONSTANTS)).toBe(0);
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

    test('uphill flowing: Δ = 1..79 (rate > 0)', () => {
        expect(classifyPipeSlope(100, 101, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
        expect(classifyPipeSlope(100, 140, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
        expect(classifyPipeSlope(100, 179, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
    });

    test('stalled: uphill with flow rate 0 (Δ ≥ 80)', () => {
        expect(classifyPipeSlope(100, 180, PIPE_SLOPE_CONSTANTS)).toBe('stalled');
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
            classifyPipeSlope(100, 107, PIPE_SLOPE_CONSTANTS),
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

    test('uphill intensity scales linearly with Δ up to flowUphillCap', () => {
        // Normalized by flowUphillCap = 80
        // Δ=1 → 1/80 = 0.0125
        expect(pipeIntensity(100, 101, 'uphill', C)).toBe(1 / 80);
        // Δ=2 → 2/80 = 0.025
        expect(pipeIntensity(100, 102, 'uphill', C)).toBe(2 / 80);
        // Δ=40 → 40/80 = 0.5
        expect(pipeIntensity(100, 140, 'uphill', C)).toBe(40 / 80);
        // Δ=79 → 79/80 = 0.9875
        expect(pipeIntensity(100, 179, 'uphill', C)).toBe(79 / 80);
        // Δ=80 → 80/80 = 1.0 (saturates at flowUphillCap)
        expect(pipeIntensity(100, 180, 'uphill', C)).toBe(1);
    });

    test('uphill intensity saturates at 1 for Δ > flowUphillCap', () => {
        expect(pipeIntensity(100, 181, 'uphill', C)).toBe(1);
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
