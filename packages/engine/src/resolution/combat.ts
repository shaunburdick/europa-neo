/**
 * Combat resolution phase — Feature 001, T033 (total-force model)
 *
 * Pure `resolveCombat(state, board, constants, tickNumber, inflowTally,
 * committedFlowTally, preFlowState)`:
 * `{ state, events }`.
 *
 * Per spec FR-008 (attrition), when troops of different owners would
 * occupy the same cell after the flow phase, this phase resolves the
 * collision using total-force comparison:
 *
 *   - **Two-way attrition**: compare total forces (garrison + committed
 *     flow) for each side; 1:1 attrition with `min(totalA, totalB)`
 *     damage. The bigger total retains the difference; the smaller is
 *     eliminated. Equal totals → mutual destruction (`winner: 'tie'`).
 *   - **Three-way (or more)**: dominant owner (highest count, ties
 *     broken by ascending PlayerId) keeps their original count and
 *     absorbs the cell. All non-dominant owners are eliminated.
 *     One `CombatEvent` is emitted per (winner, loser) pair so
 *     consumers can see every engagement.
 *
 * **Total-force identification** (FR-008 Clarifications v1.4):
 *   - `preFlowState` captures the cell's owner/count BEFORE the flow
 *     phase overwrites them.
 *   - `committedFlowTally` records raw pipe flow before headroom clamping.
 *   - Defender = pre-flow owner (garrison). Defender total = garrison
 *     count + defender's committed flow.
 *   - Attacker(s) = other player(s) in the committed flow tally.
 *   - If cell was empty before flow (garrisonOwner === 0), fall back to
 *     the dominant-owner model (unchanged behavior).
 *
 * Determinism:
 *   - Row-major iteration; deterministic per-cell owner collection
 *     sorted by ascending PlayerId.
 *   - Integer math only (`Math.imul`, `>>> 0`); no float drift.
 *   - CombatEvent.attacker is always the lower PlayerId; defender is
 *     the higher. This keeps the 2-sided payload symmetric regardless
 *     of which player initiated the flow (per spec Edge Case).
 *
 * Single-sided cells (one owner, or empty) are no-ops: no event
 * emitted, no state change. The function is total: same input → same
 * output on every platform.
 */

import type { EngineConstants } from '../contracts/engine-api';
import { emptyTickEvents, pushCombatEvent } from '../events';
import type { Board, CombatEvent, PlayerId, TickEvents, WorldState } from '../types';

const PLAYERS = 4;

/**
 * Resolve one tick of combat across the board. Pure.
 *
 * @param state              Current world state (NOT mutated).
 * @param board              Board (used only for dimensions; cells are not read).
 * @param constants          Engine rule constants (reserved for future tunables
 *                           such as a `combatLossMultiplier`; unused today).
 * @param tickNumber         Tick number to stamp on every emitted CombatEvent.
 * @param inflowTally        Optional per-cell per-owner inflow tally written by
 *                           `resolveFlow`. Packed: slot `(cellIdx * 4) +
 *                           (playerId - 1)` is the count of troops that player
 *                           sent into that cell this tick. When omitted, every
 *                           cell is treated as single-owner (no combat).
 * @param committedFlowTally Required per-cell per-owner committed-flow tally.
 *                           Records raw pipe flow BEFORE headroom clamping.
 *                           Used to compute total forces for each side.
 * @param preFlowState       Snapshot of troopOwners/troopCounts taken before
 *                           resolveFlow ran. Used to identify the garrison
 *                           owner and count for total-force comparison.
 * @returns A fresh `WorldState` with post-attrition counts/owners, plus
 *          a `TickEvents` value carrying the `CombatEvent`s in
 *          deterministic order (ascending PlayerId of attacker, then
 *          defender).
 */
export function resolveCombat(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    tickNumber: number,
    inflowTally?: Readonly<Uint32Array>,
    committedFlowTally?: Readonly<Uint32Array>,
    preFlowState?: Readonly<{ troopOwners: Uint8Array; troopCounts: Uint32Array }>,
): { state: WorldState; events: TickEvents } {
    // `constants` is reserved for future tunables; silence unused-arg lint.
    void constants;

    const n = board.width * board.height;

    // Allocate fresh typed arrays (immutable update).
    const newCounts = new Uint32Array(state.troopCounts);
    const newOwners = new Uint8Array(state.troopOwners);

    let events: TickEvents = emptyTickEvents();

    const tallyAvailable = inflowTally !== undefined && inflowTally.length >= n * PLAYERS;
    const committedAvailable = committedFlowTally !== undefined && committedFlowTally.length >= n * PLAYERS;
    const preFlowAvailable =
        preFlowState !== undefined &&
        preFlowState.troopOwners.length >= n &&
        preFlowState.troopCounts.length >= n;

    for (let idx = 0; idx < n; idx++) {
        if (tallyAvailable) {
            // Multi-owner conflict detection from the inflow tally.
            const tally = inflowTally as Uint32Array; // narrowed above
            const ownersAtCell: Array<{ owner: PlayerId; count: number }> = [];
            for (let p = 1; p <= PLAYERS; p++) {
                const c = tally[idx * PLAYERS + (p - 1)] ?? 0;
                if (c > 0) {
                    ownersAtCell.push({ owner: p as PlayerId, count: c });
                }
            }
            if (ownersAtCell.length <= 1) {
                continue; // single-owner cell: no combat
            }

            // Sort by PlayerId ascending (deterministic).
            ownersAtCell.sort((a, b) => a.owner - b.owner);

            // Dominant owner: highest count, ascending PlayerId as tiebreak.
            let dominantIdx = 0;
            for (let i = 1; i < ownersAtCell.length; i++) {
                const a = ownersAtCell[i];
                const b = ownersAtCell[dominantIdx];
                if (a === undefined || b === undefined) {
                    continue;
                }
                if (a.count > b.count || (a.count === b.count && a.owner < b.owner)) {
                    dominantIdx = i;
                }
            }

            const dom = ownersAtCell[dominantIdx];
            if (dom === undefined) {
                continue; // defensive
            }

            if (ownersAtCell.length === 2) {
                const other = ownersAtCell[dominantIdx === 0 ? 1 : 0];
                if (other === undefined) {
                    continue;
                }

                // Total-force model: use preFlowState to identify garrison,
                // committedFlowTally to compute total forces.
                const garrisonOwner = preFlowAvailable ? (preFlowState as Required<typeof preFlowState>).troopOwners[idx] ?? 0 : 0;
                const garrisonCount = preFlowAvailable ? (preFlowState as Required<typeof preFlowState>).troopCounts[idx] ?? 0 : 0;

                let attackerTotal: number;
                let defenderTotal: number;

                if (garrisonOwner !== 0 && committedAvailable) {
                    // Garrison exists: defender = garrison owner.
                    const committed = committedFlowTally as Uint32Array;
                    const defenderCommitted = committed[idx * PLAYERS + (garrisonOwner - 1)] ?? 0;
                    defenderTotal = garrisonCount + defenderCommitted;

                    // Attacker is the other player in the tally.
                    const attackerOwner = dom.owner === garrisonOwner ? other.owner : dom.owner;
                    attackerTotal = committed[idx * PLAYERS + (attackerOwner - 1)] ?? 0;
                } else {
                    // No garrison (empty cell before flow): dominant-owner model.
                    // attacker = lower PlayerId, defender = higher PlayerId.
                    if (dom.owner < other.owner) {
                        attackerTotal = dom.count;
                        defenderTotal = other.count;
                    } else {
                        attackerTotal = other.count;
                        defenderTotal = dom.count;
                    }
                }

                // 1:1 attrition: damage = min(attackerTotal, defenderTotal).
                const damage = Math.min(attackerTotal, defenderTotal);

                // Attacker/defender labeling: attacker = lower PlayerId
                // (deterministic symmetry).
                const attackerLabel: PlayerId = dom.owner < other.owner ? dom.owner : other.owner;
                const defenderLabel: PlayerId = dom.owner < other.owner ? other.owner : dom.owner;

                // Winner: whoever has the higher total (or 'tie' if equal).
                let winnerTotal: number;
                let loserTotal: number;
                if (attackerTotal >= defenderTotal) {
                    winnerTotal = attackerTotal;
                    loserTotal = defenderTotal;
                } else {
                    winnerTotal = defenderTotal;
                    loserTotal = attackerTotal;
                }
                const winner: PlayerId | 'tie' = winnerTotal > loserTotal
                    ? (winnerTotal === attackerTotal ? attackerLabel : defenderLabel)
                    : 'tie';

                // Remaining troops after 1:1 attrition.
                const attackerRemaining = (attackerTotal - damage) >>> 0;
                const defenderRemaining = (defenderTotal - damage) >>> 0;

                if (attackerRemaining > defenderRemaining) {
                    newCounts[idx] = attackerRemaining;
                    newOwners[idx] = attackerLabel;
                } else if (defenderRemaining > attackerRemaining) {
                    newCounts[idx] = defenderRemaining;
                    newOwners[idx] = defenderLabel;
                } else {
                    // Equal remnants (typically both 0) → tie.
                    newCounts[idx] = 0;
                    newOwners[idx] = 0;
                }

                const ev: CombatEvent = {
                    tick: tickNumber,
                    cell: idxToCoord(idx, board.width),
                    attacker: attackerLabel,
                    defender: defenderLabel,
                    attackerLoss: damage,
                    defenderLoss: damage,
                    winner,
                    attackerTotal,
                    defenderTotal,
                };
                events = pushCombatEvent(events, ev);
            } else {
                // 3-way or more: dominant keeps their count, losers eliminated.
                newCounts[idx] = dom.count;
                newOwners[idx] = dom.owner;
                for (const o of ownersAtCell) {
                    if (o.owner === dom.owner) {
                        continue;
                    }
                    const ev: CombatEvent = {
                        tick: tickNumber,
                        cell: idxToCoord(idx, board.width),
                        attacker: dom.owner,
                        defender: o.owner,
                        attackerLoss: 0, // dominant retains all in 3-way+
                        defenderLoss: o.count,
                        winner: dom.owner,
                        attackerTotal: dom.count,
                        defenderTotal: o.count,
                    };
                    events = pushCombatEvent(events, ev);
                }
            }
        }
        // When no tally is provided, we treat the cell as single-owner.
        // The state may still contain a multi-owner encoding from upstream
        // (not in the current model), so we don't try to detect it here.
    }

    return {
        state: {
            troopCounts: newCounts,
            troopOwners: newOwners,
            pipeMasks: new Uint8Array(state.pipeMasks),
            reservesPct: new Uint8Array(state.reservesPct),
            cityOwners: new Uint8Array(state.cityOwners),
        },
        events,
    };
}

/** Convert a flat cell index to a `{x, y}` Coord. */
function idxToCoord(idx: number, width: number): { x: number; y: number } {
    return { x: idx % width, y: Math.floor(idx / width) };
}
