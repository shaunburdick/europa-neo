/**
 * Drift coverage for the console pipe-flow mirror (spec 005 FR-013).
 * Compares both mirrored constants and calculated outputs with the
 * engine across single- and multi-pipe source cells.
 */

import { ENGINE_CONSTANTS, flowRateForDelta } from '@europa/engine';
import { describe, expect, test } from 'vitest';
import { classifyPipeSlope, PIPE_SLOPE_CONSTANTS, pipeFlowRate, pipeIntensity } from '../../../src/render/pipe-slope';

const PIPE_COUNTS = [1, 2, 3, 4] as const;
const DELTAS = [-9, -5, -1, 0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 80] as const;

describe('console pipe-slope drift from @europa/engine', () => {
    test('mirror fields equal the current engine flow constants', () => {
        expect(PIPE_SLOPE_CONSTANTS).toEqual({
            flowRate: ENGINE_CONSTANTS.flowRate,
            flowDownhillStep: ENGINE_CONSTANTS.flowDownhillStep,
            flowUphillStep: ENGINE_CONSTANTS.flowUphillStep,
            flowSlopeDeltaCap: ENGINE_CONSTANTS.flowSlopeDeltaCap,
        });
    });

    test('flow, classification, and intensity match for representative deltas and 1–4 pipes', () => {
        for (const numPipes of PIPE_COUNTS) {
            const perPipe = Math.floor(ENGINE_CONSTANTS.flowRate / numPipes);
            for (const delta of DELTAS) {
                const engineFlow = flowRateForDelta(delta, perPipe, ENGINE_CONSTANTS);
                const consoleFlow = pipeFlowRate(delta, perPipe, PIPE_SLOPE_CONSTANTS);
                expect(consoleFlow).toBe(engineFlow);

                const expectedSlope =
                    delta < 0 ? 'downhill' : delta === 0 ? 'flat' : engineFlow === 0 ? 'stalled' : 'uphill';
                const slope = classifyPipeSlope(100, 100 + delta, numPipes, PIPE_SLOPE_CONSTANTS);
                expect(slope).toBe(expectedSlope);

                const expectedIntensity =
                    slope === 'downhill'
                        ? (engineFlow - perPipe) /
                          (ENGINE_CONSTANTS.flowDownhillStep * ENGINE_CONSTANTS.flowSlopeDeltaCap)
                        : slope === 'uphill'
                          ? (perPipe - engineFlow) / perPipe
                          : 0;
                expect(pipeIntensity(100, 100 + delta, slope, numPipes, PIPE_SLOPE_CONSTANTS)).toBe(expectedIntensity);
            }
        }
    });

    test.each([
        [2, 6],
        [3, 4],
        [4, 3],
    ])('multi-pipe uphill stalls exactly at %i pipes / Δ ≥ %i', (numPipes, boundary) => {
        expect(classifyPipeSlope(100, 100 + boundary - 1, numPipes, PIPE_SLOPE_CONSTANTS)).toBe('uphill');
        expect(classifyPipeSlope(100, 100 + boundary, numPipes, PIPE_SLOPE_CONSTANTS)).toBe('stalled');
    });

    test('unknown destination elevation remains flat in fog', () => {
        expect(classifyPipeSlope(100, null, 4, PIPE_SLOPE_CONSTANTS)).toBe('flat');
        expect(pipeIntensity(100, null, 'flat', 4, PIPE_SLOPE_CONSTANTS)).toBe(0);
    });
});
