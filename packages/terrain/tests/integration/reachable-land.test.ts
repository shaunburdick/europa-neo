/**
 * US4 AC-1 Reachable-Land Integration Test — Feature 003 (T019, issue #30)
 *
 * The terrain-side half of the issue #30 cross-feature change set: the
 * engine's uphill flow handicap (feature 001 FR-007) must not leave maps
 * with only 1–2 viable cross-map routes. With the default smoothing
 * (`terrainSmoothing: 4`) and the shipped flow constants, the mean
 * flow-viable reachable-land fraction from a starting position must be
 * ≥ 50% of land cells over the 200-map balance suite (spec 003 US4 AC-1;
 * empirically 53.6% at planning time, spec 003 Clarifications v1.3).
 *
 * Methodology (mirrors the `sc-002-balance.test.ts` harness):
 *
 *   - Generate 200 maps at DEFAULT settings (32×32, 2 players,
 *     `DEFAULT_GENERATION_SETTINGS` — smoothing default 4).
 *   - For each map, BFS from every starting city over LAND cells only.
 *   - An edge is flow-viable when the pipe can carry troops in BOTH
 *     directions: `flowRateForDelta(delta, ENGINE_CONSTANTS) > 0` AND
 *     `flowRateForDelta(-delta, ENGINE_CONSTANTS) > 0`, where
 *     `delta = dstElevation − srcElevation`. Pipes are bidirectional
 *     conduits, so the uphill direction is the binding constraint: the
 *     edge is traversable iff `|delta| < flowBase / flowSlopeStep`
 *     (the stall threshold, 7 with the shipped constants). This matches
 *     the empirical grounding in spec 003 v1.3 — a directional-only
 *     edge rule measures ~84% (downhill edges of any height stay
 *     traversable), while the bidirectional rule measures ~54.5%,
 *     reproducing the spec's 53.6% figure.
 *   - Reachable-land fraction per map = (union of reachable land cells
 *     over all starting cities) / (total land cells).
 *   - Assert the MEAN over the 200-map suite ≥ 0.50.
 *
 * **Stall-threshold coupling (fails loudly on retune)**: the edge rule
 * reads the stall threshold from `ENGINE_CONSTANTS` via
 * `flowRateForDelta` (feature 001 FR-007), never from a hard-coded
 * literal. A future retune of `flowBase` / `flowSlopeStep` shifts the
 * threshold and moves the measured mean — the suite sits ~4.5pp above
 * the 50% floor, so a retune that narrows flow-viable traversal fails
 * this suite loudly (spec 003 Clarifications v1.3, cross-feature
 * coupling; spec 001 plan.md R-2).
 */

import { ENGINE_CONSTANTS, flowRateForDelta } from '@europa/engine';
import { describe, expect, it } from 'vitest';

import { DEFAULT_GENERATION_SETTINGS } from '../../src/constants';
import { generateBoard } from '../../src/generate';
import { engineSfc32, goldenSeeds } from '../fixtures/seeds';

const BOARD_SIZE = 32;
const TRIALS = 200;
const MIN_MEAN_REACHABLE_LAND = 0.5;

/** 4-neighborhood offsets (N/S/E/W) for the BFS. */
const NEIGHBOR_DELTAS = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
] as const;

/**
 * Is the undirected land edge (src → dst) flow-viable in BOTH
 * directions? A pipe is a bidirectional conduit, so a cell is only
 * flow-reachable when the pipe can carry troops each way — the uphill
 * direction is the binding constraint (stall threshold
 * `flowBase / flowSlopeStep`, read live from `ENGINE_CONSTANTS`).
 *
 * @param srcElevation Elevation of the source cell.
 * @param dstElevation Elevation of the destination cell.
 * @returns `true` when both traversal directions move > 0 troops/tick.
 */
function isFlowViableEdge(srcElevation: number, dstElevation: number): boolean {
    const delta = dstElevation - srcElevation;
    return flowRateForDelta(delta, ENGINE_CONSTANTS) > 0 && flowRateForDelta(-delta, ENGINE_CONSTANTS) > 0;
}

describe('US4 AC-1 reachable land (200 maps, mean flow-viable fraction ≥ 50%)', () => {
    it('mean flow-viable reachable-land fraction over the suite is ≥ 0.50', { timeout: 60_000 }, () => {
        const seeds = goldenSeeds(TRIALS);
        const fractions: number[] = [];

        for (const seed of seeds) {
            const req = {
                boardSize: BOARD_SIZE,
                playerCount: 2 as const,
                seed,
                rng: engineSfc32(seed),
                settings: DEFAULT_GENERATION_SETTINGS,
            };
            const { board } = generateBoard(req);
            const Size = board.width;

            // Total land cells — the fraction's denominator.
            let landCount = 0;
            for (const cell of board.cells) {
                if (cell.terrain === 'land') {
                    landCount++;
                }
            }

            // BFS from every starting city over flow-viable land edges;
            // union the reachable sets into one per-map fraction.
            const reachable = new Set<number>();
            const queue: number[] = [];
            for (const city of board.cities) {
                const startIdx = city.cell.y * Size + city.cell.x;
                if (!reachable.has(startIdx)) {
                    reachable.add(startIdx);
                    queue.push(startIdx);
                }
            }
            while (queue.length > 0) {
                const cur = queue.shift();
                if (cur === undefined) {
                    break;
                }
                const cx = cur % Size;
                const cy = Math.floor(cur / Size);
                const srcCell = board.cells[cur];
                if (!srcCell) {
                    break;
                }
                for (const [dx, dy] of NEIGHBOR_DELTAS) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || nx >= Size || ny < 0 || ny >= Size) {
                        continue;
                    }
                    const nIdx = ny * Size + nx;
                    if (reachable.has(nIdx)) {
                        continue;
                    }
                    const nCell = board.cells[nIdx];
                    if (nCell?.terrain !== 'land') {
                        continue;
                    }
                    if (isFlowViableEdge(srcCell.elevation, nCell.elevation)) {
                        reachable.add(nIdx);
                        queue.push(nIdx);
                    }
                }
            }

            fractions.push(reachable.size / landCount);
        }

        const mean = fractions.reduce((a, b) => a + b, 0) / fractions.length;
        expect(mean, `measured mean reachable-land fraction ${mean.toFixed(4)}`).toBeGreaterThanOrEqual(
            MIN_MEAN_REACHABLE_LAND,
        );
    });
});
