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
 *        downhill → `flowBase + flowDownhillStep × min(|Δ|, flowSlopeDeltaCap)`
 *        flat     → `flowBase`
 *        uphill   → `ceil(flowBase × (flowUphillCap − |Δ|) / flowUphillCap)`
 *                   — stalls at Δ ≥ flowUphillCap (legal no-op, US1 AC-5)
 *   5. Clamp the destination's new count at `cellCapacity` (FR-011).
 *   6. Transfer troops from source to destination (Clarifications v1.6):
 *      source cells ARE decremented by the amount actually transferred.
 *      This is a transfer, not a copy — troop counts are conserved.
 *
 * **Source depletion** (Clarifications v1.6): each pipe direction reads
 * the source's current count from `newCounts` (accumulated across prior
 * directions), so a 4-way pipe correctly depletes the source across all
 * four directions. A source with reserves (FR-012) is protected: the
 * reserve floor (`srcCount × reservesPct / 10`) is computed per-transfer
 * so the source never flows below that floor. Owner is preserved even
 * when a source is depleted — the pipe was placed by that player and
 * still "belongs" to them (Clarifications v1.8).
 *
 * All arithmetic is integer (the gradient formula in `flow-rate.ts` is
 * integer-only); no floats.
 *
 * **Determinism** (FR-017): cell iteration is row-major; direction
 * iteration is N→E→S→W (fixed bit order). No randomness; same input
 * → byte-identical output on every run.
 */

import { flowRateForDelta } from '@europa/core';
import type { EngineConstants } from '../contracts/engine-api';
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
    /** Per-cell reserves percentage (0..9 → 0..90%), FR-012. */
    reservesPct: Readonly<Uint8Array>;
    /** Optional inflow tally to populate (null when tally is not supplied). */
    tally: Uint32Array | null;
    /**
     * Optional committed-flow tally to populate (null when not supplied).
     * Records raw pipe flow BEFORE headroom clamping — used by combat
     * to compute total forces for each side.
     */
    committedTally: Uint32Array | null;
}

/**
 * Resolve one tick of pipe flow. Transfers troops from source cells to
 * destination cells (Clarifications v1.6 — troop conservation).
 *
 * @param state              Current world state (NOT mutated).
 * @param board              Board with cell elevations and terrain.
 * @param constants          Engine rule constants (flowBase, flowDownhillStep,
 *                           flowUphillStep, flowSlopeDeltaCap, flowUphillCap,
 *                           cellCapacity).
 * @param inflowTally        Optional per-cell per-owner inflow tally. When
 *                           supplied, slot `(cellIdx * 4) + (playerId - 1)` is
 *                           incremented by the count of troops that player
 *                           sent into that cell this tick. Consumed by
 *                           resolveCombat (multi-owner detection) and
 *                           resolveDecay (friendly-inflow exemption).
 * @param committedFlowTally Required per-cell per-owner committed-flow tally.
 *                           Records raw pipe flow BEFORE headroom clamping.
 *                           Used by resolveCombat to compute total forces.
 * @returns A fresh `WorldState` with updated troopCounts/troopOwners.
 *          Source cells are decremented by the amount transferred;
 *          destination cells are incremented. Troop counts are conserved.
 */
export function resolveFlow(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    inflowTally?: Uint32Array,
    committedFlowTally?: Uint32Array,
): WorldState {
    const w = board.width;
    const n = w * w;

    // Start with copies; transfer() will modify both source (decrement)
    // and destination (increment) cells as troops move along pipes.
    const newCounts = new Uint32Array(state.troopCounts);
    const newOwners = new Uint8Array(state.troopOwners);

    const cap = constants.cellCapacity >>> 0;

    const tallyAvailable = inflowTally !== undefined && inflowTally.length >= n * 4;
    const committedTallyAvailable = committedFlowTally !== undefined && committedFlowTally.length >= n * 4;

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
            reservesPct: state.reservesPct,
            tally: tallyAvailable ? (inflowTally as Uint32Array) : null,
            committedTally: committedTallyAvailable ? (committedFlowTally as Uint32Array) : null,
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
 *
 * Troops are TRANSFERRED, not copied (Clarifications v1.6): the source
 * cell is decremented by the amount actually delivered to the
 * destination. The source's reserves floor (FR-012) protects a
 * percentage of the source stack from flowing out. Owner is preserved
 * even when the source is depleted (Clarifications v1.8).
 */
function transfer(params: TransferParams): void {
    const { board, x, y, dx, dy, srcOwner, constants, cap, newCounts, newOwners, reservesPct, tally, committedTally } =
        params;
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
        return; // stall (uphill Δ ≥ flowUphillCap) — legal no-op
    }

    // Check source availability BEFORE writing the destination
    // (Clarifications v1.6 — transfer, not copy). Read the CURRENT
    // source count from `newCounts` so multi-pipe sources deplete
    // across all directions in N→E→S→W order.
    const srcIdx = y * w + x;
    const srcCount = newCounts[srcIdx] ?? 0;
    if (srcCount === 0) {
        return; // nothing left to transfer
    }
    // Reserve floor (FR-012): protect `reservesPct` of the source stack
    // from flowing out. Computed per-transfer against the current count
    // so a multi-pipe source never dips below its floor.
    const reservePct = reservesPct[srcIdx] ?? 0;
    const reserveFloor = reservePct > 0 ? Math.ceil((srcCount * reservePct) / 10) : 0;
    const maxDeductable = srcCount > reserveFloor ? srcCount - reserveFloor : 0;
    if (maxDeductable === 0) {
        return; // all troops reserved — nothing can flow
    }

    // Record committed flow BEFORE headroom clamping — used by combat
    // to compute total forces for each side. Capped at what the source
    // can actually supply (source depletion + reserves floor).
    const committed = moved < maxDeductable ? moved : maxDeductable;
    if (committedTally !== null && srcOwner >= 1 && srcOwner <= 4) {
        committedTally[dstIdx * 4 + (srcOwner - 1)] = (committedTally[dstIdx * 4 + (srcOwner - 1)] ?? 0) + committed;
    }

    // Clamp destination to capacity (FR-011), then clamp the actual
    // transfer to what the source can supply. `deduct` is the number of
    // troops that actually move: destination gains it, source loses it.
    const current = newCounts[dstIdx] ?? 0;
    if (current >= cap) {
        return;
    }
    const headroom = cap - current;
    const add = moved < headroom ? moved : headroom;
    const deduct = add < maxDeductable ? add : maxDeductable;
    newCounts[dstIdx] = current + deduct;
    newOwners[dstIdx] = srcOwner;
    // Update inflow tally if supplied (US2 combat + US3 decay side-channel).
    if (tally !== null && srcOwner >= 1 && srcOwner <= 4) {
        tally[dstIdx * 4 + (srcOwner - 1)] = (tally[dstIdx * 4 + (srcOwner - 1)] ?? 0) + deduct;
    }

    // Deduct from the source (Clarifications v1.6 — transfer, not copy).
    newCounts[srcIdx] = (srcCount - deduct) >>> 0;
    // Owner is preserved even when depleted — the pipe was placed by
    // this player and still "belongs" to them (Clarifications v1.8).
}
