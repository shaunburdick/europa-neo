/**
 * Flow resolution phase — Feature 001, T023 (rewritten for issue #30,
 * equal-split model from issue #50 / Clarifications v1.9)
 *
 * Pure `resolveFlow(state, board, constants): WorldState`.
 *
 * For each cell with outgoing pipes (encoded in `state.pipeMasks`):
 *   1. Count outgoing pipes via popcount; compute `perPipe` =
 *      `floor(flowRate / numPipes)`.
 *   2. Compute destination cell from N/E/S/W bit.
 *   3. Reject out-of-board or water destinations (FR-002).
 *   4. Compute the elevation delta (`dest.elev - src.elev`).
 *   5. Rate = `flowRateForDelta(elevDelta, base, constants)` (FR-007):
 *        `base = min(perPipe, floor(available / remainingPipes))`
 *        where `available = srcCount − reserveFloor`.
 *        Downhill → bonus; flat → base; uphill → penalty (may stall).
 *   6. Clamp the destination's new count at `cellCapacity` (FR-011).
 *   7. Transfer troops from source to destination (Clarifications v1.6):
 *      source cells ARE decremented by the amount actually transferred.
 *      This is a transfer, not a copy — troop counts are conserved.
 *
 * **Equal-split model** (Clarifications v1.9): the total outflow budget
 * per cell per tick is the tunable constant `flowRate`. Each outgoing
 * pipe receives an equal share: `perPipe = floor(flowRate / numPipes)`.
 * When the source has fewer troops than `flowRate` (scarcity), troops
 * are split equally across pipes: `base = min(perPipe, available /
 * remainingPipes)` where `remainingPipes` decreases after each pipe.
 * The elevation gradient modifies each pipe's share individually.
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
 * iteration is N→E→S→W (fixed bit order). Pipe index within a cell is
 * tied to this fixed iteration order, ensuring deterministic `remainingPipes`
 * decrements. No randomness; same input → byte-identical output.
 */

import { flowRateForDelta } from '@europa/core';
import type { EngineConstants } from '../contracts/engine-api';
import type { Board, TickScratchBuffers, TransferParams, WorldState } from '../types';

// Pipe direction bitmasks (must match the contract's WorldState docs).
const N_BIT = 0x01;
const E_BIT = 0x02;
const S_BIT = 0x04;
const W_BIT = 0x08;

/**
 * Count the number of set bits in a pipe mask (Hamming weight).
 * Used to compute the equal-split `numPipes` for a source cell.
 * Input is a Uint8 (0..15), so the result is always 0..4.
 */
function popcount(mask: number): number {
    let count = 0;
    if ((mask & N_BIT) !== 0) count++;
    if ((mask & E_BIT) !== 0) count++;
    if ((mask & S_BIT) !== 0) count++;
    if ((mask & W_BIT) !== 0) count++;
    return count;
}

/**
 * Resolve one tick of pipe flow using the equal-split model
 * (Clarifications v1.9). Transfers troops from source cells to
 * destination cells (Clarifications v1.6 — troop conservation).
 *
 * Each source cell's total outflow budget is `flowRate`, split equally
 * among outgoing pipes. The elevation gradient modifies each pipe's
 * share individually. Under scarcity (fewer troops than `flowRate`),
 * the budget is further reduced to `min(perPipe, available / remainingPipes)`.
 *
 * @param state              Current world state (NOT mutated).
 * @param board              Board with cell elevations and terrain.
 * @param constants          Engine rule constants (flowRate, flowDownhillStep,
 *                           flowUphillStep, flowSlopeDeltaCap, cellCapacity).
 * @param inflowTally        Optional per-cell per-owner inflow tally. When
 *                           supplied, slot `(cellIdx * 4) + (playerId - 1)` is
 *                           incremented by the count of troops that player
 *                           sent into that cell this tick. Consumed by
 *                           resolveCombat (multi-owner detection) and
 *                           resolveDecay (friendly-inflow exemption).
 * @param committedFlowTally Required per-cell per-owner committed-flow tally.
 *                           Records raw pipe flow BEFORE headroom clamping.
 *                           Used by resolveCombat to compute total forces.
 * @param scratch            Optional pre-allocated scratch buffers (FR-03,
 *                           SC-006). When provided, reuses `flowNewCounts`,
 *                           `flowNewOwners`, and `transferParams` from the
 *                           pool instead of allocating fresh arrays. Caller
 *                           MUST zero the buffers before calling.
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
    scratch?: TickScratchBuffers,
): WorldState {
    const w = board.width;
    const n = w * w;

    // Start with copies; transfer() will modify both source (decrement)
    // and destination (increment) cells as troops move along pipes.
    // When scratch buffers are provided, reuse them to avoid per-tick
    // heap allocations (FR-03, SC-006).
    const newCounts = scratch !== undefined ? scratch.flowNewCounts : new Uint32Array(state.troopCounts);
    const newOwners = scratch !== undefined ? scratch.flowNewOwners : new Uint8Array(state.troopOwners);
    // When using scratch, copy initial state into the pre-allocated buffers.
    if (scratch !== undefined) {
        newCounts.set(state.troopCounts);
        newOwners.set(state.troopOwners);
    }

    const cap = constants.cellCapacity >>> 0;

    const tallyAvailable = inflowTally !== undefined && inflowTally.length >= n * 4;
    const committedTallyAvailable = committedFlowTally !== undefined && committedFlowTally.length >= n * 4;

    // Use the scratch transfer params pool when available; otherwise
    // allocate fresh objects per source cell (legacy path for tests).
    const pool = scratch?.transferParams;

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

        // Equal-split model (Clarifications v1.9): count outgoing pipes,
        // compute the per-pipe budget, and pre-compute the reserve floor
        // so each transfer() call can apply the per-pipe share formula.
        const numPipes = popcount(mask);
        const perPipe = Math.floor(constants.flowRate / numPipes);
        const reservePct = state.reservesPct[idx] ?? 0;
        const reserveFloor = reservePct > 0 ? Math.ceil((srcCount * reservePct) / 10) : 0;

        const x = idx % w;
        const y = Math.floor(idx / w);

        // Get or create TransferParams: reuse from pool when available.
        // Pool always has 4 entries (MAX_PIPES_PER_CELL) from createTickScratchBuffers.
        const params: TransferParams =
            pool !== undefined
                ? (pool[0] as TransferParams)
                : {
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
                      numPipes,
                      perPipe,
                      pipeIndex: 0,
                      reserveFloor,
                  };

        // Reset params fields in-place for this source cell.
        params.board = board;
        params.x = x;
        params.y = y;
        params.srcOwner = srcOwner;
        params.constants = constants;
        params.cap = cap;
        params.newCounts = newCounts;
        params.newOwners = newOwners;
        params.reservesPct = state.reservesPct;
        params.tally = tallyAvailable ? (inflowTally as Uint32Array) : null;
        params.committedTally = committedTallyAvailable ? (committedFlowTally as Uint32Array) : null;
        params.numPipes = numPipes;
        params.perPipe = perPipe;
        params.pipeIndex = 0;
        params.reserveFloor = reserveFloor;

        // Iterate directions in fixed order (N, E, S, W) for determinism.
        // pipeIndex is incremented after each direction to track remainingPipes.
        if ((mask & N_BIT) !== 0) {
            params.dx = 0;
            params.dy = -1;
            transfer(params);
            params.pipeIndex++;
        }
        if ((mask & E_BIT) !== 0) {
            params.dx = 1;
            params.dy = 0;
            transfer(params);
            params.pipeIndex++;
        }
        if ((mask & S_BIT) !== 0) {
            params.dx = 0;
            params.dy = 1;
            transfer(params);
            params.pipeIndex++;
        }
        if ((mask & W_BIT) !== 0) {
            params.dx = -1;
            params.dy = 0;
            transfer(params);
            params.pipeIndex++;
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
 * percentage of the source stack from flowing out. Under scarcity,
 * the per-pipe share is reduced to `min(perPipe, available / remainingPipes)`.
 * Owner is preserved even when the source is depleted (Clarifications v1.8).
 */
function transfer(params: TransferParams): void {
    const {
        board,
        x,
        y,
        dx,
        dy,
        srcOwner,
        constants,
        cap,
        newCounts,
        newOwners,
        reservesPct,
        tally,
        committedTally,
        numPipes,
        perPipe,
        pipeIndex,
        reserveFloor,
    } = params;
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

    // Compute the elevation delta (FR-007).
    const srcCell = board.cells[y * w + x];
    if (srcCell === undefined) {
        return;
    }
    const elevDelta = dstCell.elevation - srcCell.elevation;

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
    const reserveFloorCurrent = reservePct > 0 ? Math.ceil((srcCount * reservePct) / 10) : 0;
    const maxDeductable = srcCount > reserveFloorCurrent ? srcCount - reserveFloorCurrent : 0;
    if (maxDeductable === 0) {
        return; // all troops reserved — nothing can flow
    }

    // Equal-split model (Clarifications v1.9): compute the per-pipe
    // share, applying source depletion under scarcity. `remainingPipes`
    // accounts for pipes already processed in the N→E→S→W iteration.
    const remainingPipes = numPipes - pipeIndex;
    const available = srcCount > reserveFloor ? srcCount - reserveFloor : 0;
    const base = Math.min(perPipe, Math.floor(available / remainingPipes));
    const moved = flowRateForDelta(elevDelta, base, constants);
    if (moved === 0) {
        return; // stall (uphill penalty exhausted the base) — legal no-op
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
