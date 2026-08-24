/**
 * Production resolution phase — Feature 001, T022
 *
 * Pure `resolveProduction(state, board, constants): WorldState`.
 *
 * Each owned city cell (`cityOwners[i] !== 0`) gains
 * `constants.productionRate` troops per call, capped at
 * `constants.cityCapacity`. All arithmetic is integer; no floats.
 *
 * **Determinism**: input is never mutated. Output is a fresh
 * `WorldState` with freshly allocated typed arrays. Calling with the
 * same input produces a byte-identical output on every platform
 * (constitution Principle II + spec FR-017).
 *
 * **Why no city-state dependency?** Production is unconditional per
 * cell per tick — it doesn't read pipe masks, troop counts from
 * neighbors, or anything else. US1 keeps it that way; US4 may layer
 * "city captured mid-production" handling on top in `capture.ts`.
 */

import type { EngineConstants } from '../contracts/engine-api';
import type { Board, WorldState } from '../types';

/**
 * Run one production pass over the world state.
 *
 * @param state     Current world state (NOT mutated).
 * @param board     Current board (used only for width/height; cells aren't read).
 * @param constants Engine rule constants (productionRate, cityCapacity).
 * @returns A fresh `WorldState` with updated troopCounts and troopOwners
 *          on city cells.
 */
export function resolveProduction(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
): WorldState {
    const n = board.width * board.height;
    // Allocate fresh typed arrays (immutable update).
    const newCounts = new Uint32Array(state.troopCounts);
    const newOwners = new Uint8Array(state.troopOwners);

    const rate = constants.productionRate >>> 0;
    const cap = constants.cityCapacity >>> 0;

    for (let i = 0; i < n; i++) {
        const owner = state.cityOwners[i] ?? 0;
        if (owner === 0) {
            continue; // no city here
        }
        const current = newCounts[i] ?? 0;
        if (current >= cap) {
            continue; // already saturated; no overflow
        }
        const headroom = cap - current;
        const add = rate < headroom ? rate : headroom;
        newCounts[i] = current + add;
        newOwners[i] = owner;
    }

    return {
        troopCounts: newCounts,
        troopOwners: newOwners,
        pipeMasks: new Uint8Array(state.pipeMasks),
        reservesPct: new Uint8Array(state.reservesPct),
        cityOwners: new Uint8Array(state.cityOwners),
    };
}
