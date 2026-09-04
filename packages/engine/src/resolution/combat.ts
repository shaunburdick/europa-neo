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
        preFlowState !== undefined && preFlowState.troopOwners.length >= n && preFlowState.troopCounts.length >= n;

    for (let idx = 0; idx < n; idx++) {
        if (preFlowAvailable && committedAvailable) {
            // Total-force model: detect contested cells from committedFlowTally
            // (raw pipe intent) + preFlowState (garrison). This detects combat
            // even when headroom is 0 (inflowTally would be empty).
            const committed = committedFlowTally as Uint32Array;
            const preOwners = (preFlowState as Required<typeof preFlowState>).troopOwners;
            const preCounts = (preFlowState as Required<typeof preFlowState>).troopCounts;
            const garrisonOwner = preOwners[idx] ?? 0;
            const garrisonCount = preCounts[idx] ?? 0;

            // Build the set of players who committed flow to this cell.
            const committedPlayers: Array<{ owner: PlayerId; count: number }> = [];
            for (let p = 1; p <= PLAYERS; p++) {
                const c = committed[idx * PLAYERS + (p - 1)] ?? 0;
                if (c > 0) {
                    committedPlayers.push({ owner: p as PlayerId, count: c });
                }
            }

            // Determine if this cell is contested:
            // 1. Garrison exists + at least one non-garrison player committed flow
            // 2. Empty cell + multiple players committed flow
            let contested = false;
            if (garrisonOwner !== 0) {
                // Cell had a garrison. Contested if any non-garrison player committed.
                contested = committedPlayers.some((p) => p.owner !== garrisonOwner);
                // Add garrison to the participants if it exists (for total-force calc).
                if (!committedPlayers.some((p) => p.owner === garrisonOwner)) {
                    committedPlayers.push({ owner: garrisonOwner as PlayerId, count: 0 });
                }
            } else {
                // Empty cell before flow. Contested if multiple players committed.
                contested = committedPlayers.length >= 2;
            }

            if (!contested || committedPlayers.length < 2) {
                continue;
            }

            // Sort by PlayerId ascending (deterministic).
            committedPlayers.sort((a, b) => a.owner - b.owner);

            if (committedPlayers.length === 2) {
                const a = committedPlayers[0];
                const b = committedPlayers[1];
                if (a === undefined || b === undefined) {
                    continue;
                }

                // Determine logical attacker/defender and their total forces.
                let logicalAttacker: PlayerId;
                let logicalDefender: PlayerId;
                let attackerTotalForce: number;
                let defenderTotalForce: number;

                if (garrisonOwner !== 0) {
                    // Garrison exists: logical defender = garrison owner.
                    logicalDefender = garrisonOwner as PlayerId;
                    logicalAttacker = a.owner === garrisonOwner ? b.owner : a.owner;
                    const defenderCommitted = committed[idx * PLAYERS + (garrisonOwner - 1)] ?? 0;
                    defenderTotalForce = garrisonCount + defenderCommitted;
                    attackerTotalForce = committed[idx * PLAYERS + (logicalAttacker - 1)] ?? 0;
                } else {
                    // No garrison: dominant-owner model.
                    logicalAttacker = a.owner < b.owner ? a.owner : b.owner;
                    logicalDefender = a.owner < b.owner ? b.owner : a.owner;
                    if (a.owner < b.owner) {
                        attackerTotalForce = a.count;
                        defenderTotalForce = b.count;
                    } else {
                        attackerTotalForce = b.count;
                        defenderTotalForce = a.count;
                    }
                }

                // 1:1 attrition: damage = min(attackerTotal, defenderTotal).
                const damage = Math.min(attackerTotalForce, defenderTotalForce);

                // Event labeling: attacker = lower PlayerId (deterministic symmetry).
                const eventAttacker: PlayerId = a.owner < b.owner ? a.owner : b.owner;
                const eventDefender: PlayerId = a.owner < b.owner ? b.owner : a.owner;

                // Winner: whoever has the higher total (or 'tie' if equal).
                const winner: PlayerId | 'tie' =
                    attackerTotalForce > defenderTotalForce
                        ? logicalAttacker
                        : defenderTotalForce > attackerTotalForce
                          ? logicalDefender
                          : 'tie';

                // Remaining troops after 1:1 attrition.
                const attackerRemaining = (attackerTotalForce - damage) >>> 0;
                const defenderRemaining = (defenderTotalForce - damage) >>> 0;

                if (attackerRemaining > defenderRemaining) {
                    newCounts[idx] = attackerRemaining;
                    newOwners[idx] = logicalAttacker;
                } else if (defenderRemaining > attackerRemaining) {
                    newCounts[idx] = defenderRemaining;
                    newOwners[idx] = logicalDefender;
                } else {
                    // Equal remnants (typically both 0) → tie.
                    newCounts[idx] = 0;
                    newOwners[idx] = 0;
                }

                const ev: CombatEvent = {
                    tick: tickNumber,
                    cell: idxToCoord(idx, board.width),
                    attacker: eventAttacker,
                    defender: eventDefender,
                    attackerLoss: damage,
                    defenderLoss: damage,
                    winner,
                    attackerTotal: attackerTotalForce,
                    defenderTotal: defenderTotalForce,
                };
                events = pushCombatEvent(events, ev);
            } else {
                // 3-way or more: dominant keeps their count, losers eliminated.
                // Dominant = highest committed count, ascending PlayerId as tiebreak.
                let domIdx = 0;
                for (let i = 1; i < committedPlayers.length; i++) {
                    const ai = committedPlayers[i];
                    const bi = committedPlayers[domIdx];
                    if (ai === undefined || bi === undefined) {
                        continue;
                    }
                    if (ai.count > bi.count || (ai.count === bi.count && ai.owner < bi.owner)) {
                        domIdx = i;
                    }
                }
                const domPlayer = committedPlayers[domIdx];
                if (domPlayer === undefined) {
                    continue;
                }
                newCounts[idx] = domPlayer.count;
                newOwners[idx] = domPlayer.owner;
                for (const o of committedPlayers) {
                    if (o.owner === domPlayer.owner) {
                        continue;
                    }
                    const ev: CombatEvent = {
                        tick: tickNumber,
                        cell: idxToCoord(idx, board.width),
                        attacker: domPlayer.owner,
                        defender: o.owner,
                        attackerLoss: 0, // dominant retains all in 3-way+
                        defenderLoss: o.count,
                        winner: domPlayer.owner,
                        attackerTotal: domPlayer.count,
                        defenderTotal: o.count,
                    };
                    events = pushCombatEvent(events, ev);
                }
            }
        } else if (tallyAvailable) {
            // Legacy path: detect from inflow tally (used in unit tests
            // without preFlowState).
            const tally = inflowTally as Uint32Array;
            const ownersAtCell: Array<{ owner: PlayerId; count: number }> = [];
            for (let p = 1; p <= PLAYERS; p++) {
                const c = tally[idx * PLAYERS + (p - 1)] ?? 0;
                if (c > 0) {
                    ownersAtCell.push({ owner: p as PlayerId, count: c });
                }
            }
            if (ownersAtCell.length <= 1) {
                continue;
            }
            ownersAtCell.sort((a, b) => a.owner - b.owner);

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
                continue;
            }

            if (ownersAtCell.length === 2) {
                const other = ownersAtCell[dominantIdx === 0 ? 1 : 0];
                if (other === undefined) {
                    continue;
                }
                const damage = Math.min(dom.count, other.count);
                const attackerLabel: PlayerId = dom.owner < other.owner ? dom.owner : other.owner;
                const defenderLabel: PlayerId = dom.owner < other.owner ? other.owner : dom.owner;
                const winner: PlayerId | 'tie' = dom.count > other.count ? dom.owner : 'tie';

                const attackerCount = attackerLabel === dom.owner ? dom.count : other.count;
                const defenderCount = defenderLabel === dom.owner ? dom.count : other.count;
                const attackerRemaining = (attackerCount - damage) >>> 0;
                const defenderRemaining = (defenderCount - damage) >>> 0;
                if (attackerRemaining > defenderRemaining) {
                    newCounts[idx] = attackerRemaining;
                    newOwners[idx] = attackerLabel;
                } else if (defenderRemaining > attackerRemaining) {
                    newCounts[idx] = defenderRemaining;
                    newOwners[idx] = defenderLabel;
                } else {
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
                    attackerTotal: attackerCount,
                    defenderTotal: defenderCount,
                };
                events = pushCombatEvent(events, ev);
            } else {
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
                        attackerLoss: 0,
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
