/**
 * Flow resolution phase — Feature 001, T023 (rewritten for issue #30)
 *
 * Pure `resolveFlow(state, board, constants): WorldState`.
 *
 * For each cell with outgoing pipes (encoded in `state.pipeMasks`):
 *   1. Compute destination cell from N/E/S/W bit.
 *   2. Reject out-of-board or water destinations (FR-002).
 *   3. Compute the elevation delta (`dest.elev - src.elev`).
 *   4. Rate = `flowRateForDelta(elevDelta, constants)` (FR-007):
 *        downhill → `flowBase + flowSlopeStep × min(|Δ|, flowSlopeDeltaCap)`
 *        flat     → `flowBase`
 *        uphill   → `max(0, flowBase − flowSlopeStep × |Δ|)` — stalls at
 *                   Δ ≥ flowBase / flowSlopeStep (legal no-op, US1 AC-5)
 *   5. Clamp the destination's new count at `cellCapacity` (FR-011).
 *   6. Reserve handling is US3 (decay phase); US1 flows every available
 *      troop up to the cap on the pipe (no reserves floor).
 *
 * All arithmetic is integer (the gradient formula in `flow-rate.ts` is
 * integer-only); no floats.
 *
 * **Determinism** (FR-017): cell iteration is row-major; direction
 * iteration is N→E→S→W (fixed bit order). No randomness; same input
 * → byte-identical output on every run.
 */

import type { EngineConstants } from '../contracts/engine-api';
import { flowRateForDelta } from '../flow-rate';
import type { Board, WorldState } from '../types';

// Pipe direction bitmasks (must match the contract's WorldState docs).
const N_BIT = 0x01;
const E_BIT = 0x02;
const S_BIT = 0x04;
const W_BIT = 0x08;

interface TransferParams {
    board: Readonly<Board>;
    x: number;
    y: number;
    dx: number;
    dy: number;
    srcOwner: number;
    constants: EngineConstants;
    cap: number;
    newCounts: Uint32Array;
    newOwners: Uint8Array;
    /** Optional inflow tally to populate (null when tally is not supplied). */
    tally: Uint32Array | null;
}

/**
 * Resolve one tick of pipe flow.
 *
 * @param state        Current world state (NOT mutated).
 * @param board        Board with cell elevations and terrain.
 * @param constants    Engine rule constants (flowBase, flowSlopeStep,
 *                     flowSlopeDeltaCap, cellCapacity).
 * @param inflowTally  Optional per-cell per-owner inflow tally. When
 *                     supplied, slot `(cellIdx * 4) + (playerId - 1)` is
 *                     incremented by the count of troops that player
 *                     sent into that cell this tick. Consumed by
 *                     resolveCombat (multi-owner detection) and
 *                     resolveDecay (friendly-inflow exemption).
 * @returns A fresh `WorldState` with updated troopCounts/troopOwners on
 *          destination cells. Source cells retain their counts (US1 does
 *          not model source depletion here; US3 reserves/decay cover that).
 */
export function resolveFlow(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    inflowTally?: Uint32Array,
): WorldState {
    const w = board.width;
    const n = w * w;

    // Start with copies; we'll only modify destination cells in this
    // phase. Source counts are not decremented (US1 simplification —
    // US3 decay/reserves govern source losses).
    const newCounts = new Uint32Array(state.troopCounts);
    const newOwners = new Uint8Array(state.troopOwners);

    const cap = constants.cellCapacity >>> 0;

    const tallyAvailable = inflowTally !== undefined && inflowTally.length >= n * 4;

    for (let idx = 0; idx < n; idx++) {
        const mask = state.pipeMasks[idx] ?? 0;
        if (mask === 0) {
            continue;
        }
        const srcCount = state.troopCounts[idx] ?? 0;
        const srcOwner = state.troopOwners[idx] ?? 0;
        if (srcCount === 0 || srcOwner === 0) {
            continue;
        }

        const x = idx % w;
        const y = Math.floor(idx / w);
        const params: TransferParams = {
            board,
            x,
            y,
            dx: 0,
            dy: 0,
            srcOwner,
            constants,
            cap,
            newCounts,
            newOwners,
            tally: tallyAvailable ? (inflowTally as Uint32Array) : null,
        };

        // Iterate directions in fixed order (N, E, S, W) for determinism.
        if ((mask & N_BIT) !== 0) {
            params.dx = 0;
            params.dy = -1;
            transfer(params);
        }
        if ((mask & E_BIT) !== 0) {
            params.dx = 1;
            params.dy = 0;
            transfer(params);
        }
        if ((mask & S_BIT) !== 0) {
            params.dx = 0;
            params.dy = 1;
            transfer(params);
        }
        if ((mask & W_BIT) !== 0) {
            params.dx = -1;
            params.dy = 0;
            transfer(params);
        }
    }

    return {
        troopCounts: newCounts,
        troopOwners: newOwners,
        pipeMasks: new Uint8Array(state.pipeMasks),
        reservesPct: new Uint8Array(state.reservesPct),
        cityOwners: new Uint8Array(state.cityOwners),
    };
}

/**
 * Apply a single pipe transfer from `(x, y)` to `(x+dx, y+dy)`. No-ops
 * if the destination is out of bounds, water, or already at capacity.
 */
function transfer(params: TransferParams): void {
    const { board, x, y, dx, dy, srcOwner, constants, cap, newCounts, newOwners, tally } = params;
    const nx = x + dx;
    const ny = y + dy;
    const w = board.width;
    if (nx < 0 || nx >= w || ny < 0 || ny >= w) {
        return; // OOB → no-op
    }
    const dstIdx = ny * w + nx;
    const dstCell = board.cells[dstIdx];
    if (dstCell === undefined) {
        return; // defensive
    }
    if (dstCell.terrain !== 'land') {
        return; // water impassable (FR-002)
    }

    // Compute the elevation delta and the gradient flow rate (FR-007).
    const srcCell = board.cells[y * w + x];
    if (srcCell === undefined) {
        return;
    }
    const elevDelta = dstCell.elevation - srcCell.elevation;
    const moved = flowRateForDelta(elevDelta, constants);
    if (moved === 0) {
        return; // stall (uphill Δ ≥ flowBase / flowSlopeStep) — legal no-op
    }

    // Clamp destination to capacity (FR-011).
    const current = newCounts[dstIdx] ?? 0;
    if (current >= cap) {
        return;
    }
    const headroom = cap - current;
    const add = moved < headroom ? moved : headroom;
    newCounts[dstIdx] = current + add;
    newOwners[dstIdx] = srcOwner;
    // Update inflow tally if supplied (US2 combat + US3 decay side-channel).
    if (tally !== null && srcOwner >= 1 && srcOwner <= 4) {
        tally[dstIdx * 4 + (srcOwner - 1)] = (tally[dstIdx * 4 + (srcOwner - 1)] ?? 0) + add;
    }
}
