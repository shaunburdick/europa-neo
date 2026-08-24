/**
 * Combat resolution phase — Feature 001, T033
 *
 * Pure `resolveCombat(state, board, constants, tickNumber, inflowTally?)`:
 * `{ state, events }`.
 *
 * Per spec FR-008 (attrition), when troops of different owners would
 * occupy the same cell after the flow phase, this phase resolves the
 * collision:
 *
 *   - **Two-way attrition**: 1:1 attrition; each side loses
 *     `min(countA, countB)`. The bigger force retains the difference
 *     (`max(0, A - B)`); the smaller force is eliminated. Equal forces
 *     are mutually destroyed (`winner: 'tie'`).
 *   - **Three-way (or more)**: dominant owner (highest count, ties
 *     broken by ascending PlayerId) keeps their original count and
 *     absorbs the cell. All non-dominant owners are eliminated.
 *     One `CombatEvent` is emitted per (winner, loser) pair so
 *     consumers can see every engagement.
 *
 * **How combat detects multi-owner cells**: the flow phase tracks
 * per-cell per-owner inflow via an optional `inflowTally` (Uint32Array
 * of size `n * 4`, packed: cell `i` has slots `[p1, p2, p3, p4]`).
 * This side-channel is populated by `resolveFlow` when supplied, and
 * consumed by `resolveCombat` / `resolveDecay`. When `inflowTally` is
 * not supplied, `resolveCombat` treats every cell as single-owner (a
 * no-op) — useful for direct unit testing without a flow setup.
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
 * @param state        Current world state (NOT mutated).
 * @param board        Board (used only for dimensions; cells are not read).
 * @param constants    Engine rule constants (reserved for future tunables
 *                     such as a `combatLossMultiplier`; unused today).
 * @param tickNumber   Tick number to stamp on every emitted CombatEvent.
 * @param inflowTally  Optional per-cell per-owner inflow tally written by
 *                     `resolveFlow`. Packed: slot `(cellIdx * 4) +
 *                     (playerId - 1)` is the count of troops that player
 *                     sent into that cell this tick. When omitted, every
 *                     cell is treated as single-owner (no combat).
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
): { state: WorldState; events: TickEvents } {
  // `constants` is reserved for future tunables; silence unused-arg lint.
  void constants;

  const n = board.width * board.height;

  // Allocate fresh typed arrays (immutable update).
  const newCounts = new Uint32Array(state.troopCounts);
  const newOwners = new Uint8Array(state.troopOwners);

  let events: TickEvents = emptyTickEvents();

  const tallyAvailable = inflowTally !== undefined && inflowTally.length >= n * PLAYERS;

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
        // 1:1 attrition: damage = min(dom.count, other.count).
        const damage = Math.min(dom.count, other.count);
        // Attacker = lower PlayerId (deterministic symmetry).
        const attacker: PlayerId = dom.owner < other.owner ? dom.owner : other.owner;
        const defender: PlayerId = dom.owner < other.owner ? other.owner : dom.owner;
        const winner: PlayerId | 'tie' = dom.count > other.count ? dom.owner : 'tie';

        // The cell's new owner is the surviving side (or 0 if both 0).
        // Attacker loses `damage`; defender loses `damage`. Remaining:
        // attacker retains max(0, attackerCount - damage); same for defender.
        const attackerCount = attacker === dom.owner ? dom.count : other.count;
        const defenderCount = defender === dom.owner ? dom.count : other.count;
        const attackerRemaining = (attackerCount - damage) >>> 0;
        const defenderRemaining = (defenderCount - damage) >>> 0;
        if (attackerRemaining > defenderRemaining) {
          newCounts[idx] = attackerRemaining;
          newOwners[idx] = attacker;
        } else if (defenderRemaining > attackerRemaining) {
          newCounts[idx] = defenderRemaining;
          newOwners[idx] = defender;
        } else {
          // Equal remnants (typically both 0) → tie.
          newCounts[idx] = 0;
          newOwners[idx] = 0;
        }

        const ev: CombatEvent = {
          tick: tickNumber,
          cell: idxToCoord(idx, board.width),
          attacker,
          defender,
          attackerLoss: damage,
          defenderLoss: damage,
          winner,
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
