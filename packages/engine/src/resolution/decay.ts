/**
 * Decay resolution phase — Feature 001, T038
 *
 * Pure `resolveDecay(state, board, constants, tickNumber, inflowTally?, reservedFloors?)`:
 * `{ state, events }`.
 *
 * Per spec FR-009, troops in a cell with no incoming pipe flow lose
 * exactly 1 troop per tick. FR-010 adds the mutual-feeding exemption:
 * two cells piping into each other sustain indefinitely without city
 * supply. FR-012 introduces reserves (0..9 → 0..90%): the reserved
 * count is held in the cell before any outward flow or decay.
 *
 * **Decay rule**:
 *   - For each cell with `count > 0`:
 *     - If the inflow tally shows a non-zero entry for the cell's
 *       owner (friendly inflow), skip — no decay.
 *     - Otherwise, subtract `decayPerTick` (integer), clamping at the
 *       reserves floor.
 *     - When count reaches 0, owner becomes 0 (null).
 *
 * **Reserves floor** (FR-012):
 *   - When `reservedFloors` is supplied, slot `[idx]` is the cell's
 *     fixed floor — the count below which decay cannot reduce the
 *     stack. (US3 wires this by computing the floor at the time
 *     `setReserves` is applied, e.g., `count * reservesPct / 10`.)
 *   - When `reservedFloors` is NOT supplied, the floor falls back to
 *     the per-cell "current-count" interpretation:
 *     `floor = count - floor(count * (10 - reservesPct) / 10)`. This
 *     degrades gracefully in unit tests that don't track the
 *     fixed-floor side-channel.
 *   - **Edge case (reserves > count holds all troops)**: with
 *     reserves=9 and count=5, the fallback floor is 5; with explicit
 *     `reservedFloors[i] = 5`, same outcome.
 *
 * **Mutual feeding** is a natural consequence: cell A's pipe puts
 * troops into cell B (B has friendly inflow from B's owner), and B's
 * pipe puts troops into A (A has friendly inflow from A's owner).
 *
 * Determinism:
 *   - Row-major iteration; integer math only (`>>> 0`).
 *   - Pure: input is never mutated; output is a fresh `WorldState`.
 */

import type { EngineConstants } from '../contracts/engine-api';
import { emptyTickEvents } from '../events';
import type { Board, TickEvents, WorldState } from '../types';

const PLAYERS = 4;

/**
 * Resolve one tick of decay across the board. Pure.
 *
 * @param state           Current world state (NOT mutated).
 * @param board           Board (used only for dimensions; cells are not read).
 * @param constants       Engine rule constants (uses `decayPerTick`).
 * @param tickNumber      Tick number (reserved for future events; the
 *                        current implementation emits no events).
 * @param inflowTally     Optional per-cell per-owner inflow tally written
 *                        by `resolveFlow`. Encoding: slot
 *                        `(cellIdx * 4) + (playerId - 1)` is the count of
 *                        troops that player sent into that cell this tick.
 *                        When omitted, every cell is treated as having no
 *                        friendly inflow (i.e., decay applies to all
 *                        non-zero cells).
 * @param reservedFloors  Optional per-cell fixed reserves floor. When
 *                        supplied, slot `[idx]` is the minimum count the
 *                        cell can decay to (FR-012 invariant). When
 *                        omitted, the fallback uses `count * reservesPct`
 *                        of the current count (less strict).
 * @returns A fresh `WorldState` with post-decay counts and owners,
 *          plus a `TickEvents` value (empty — decay doesn't emit).
 */
export function resolveDecay(
  state: Readonly<WorldState>,
  board: Readonly<Board>,
  constants: EngineConstants,
  tickNumber: number,
  inflowTally?: Readonly<Uint32Array>,
  reservedFloors?: Readonly<Uint32Array>,
): { state: WorldState; events: TickEvents } {
  // `tickNumber` is reserved for future event emission.
  void tickNumber;

  const n = board.width * board.height;
  const decayPerTick = constants.decayPerTick >>> 0;

  // We allocate fresh typed arrays and write into them; the input
  // `state` arrays are never mutated.
  const newCounts: Uint32Array = new Uint32Array(state.troopCounts);
  const newOwners: Uint8Array = new Uint8Array(state.troopOwners);

  const tallyAvailable = inflowTally !== undefined && inflowTally.length >= n * PLAYERS;
  const floorsAvailable = reservedFloors !== undefined && reservedFloors.length >= n;

  for (let idx = 0; idx < n; idx++) {
    const count = newCounts[idx] ?? 0;
    if (count === 0) continue;

    const owner = newOwners[idx] ?? 0;
    if (owner === 0) continue; // neutral cell — nothing to decay

    // City cells are self-feeding (the city produces troops each tick;
    // they're their own supply). Skip them — the production phase keeps
    // them topped up to city capacity, and decay would zero them out
    // every tick otherwise.
    if ((state.cityOwners[idx] ?? 0) !== 0) continue;

    // Friendly-inflow check.
    if (tallyAvailable) {
      const tally = inflowTally as Uint32Array;
      const inflowFromOwner = tally[idx * PLAYERS + (owner - 1)] ?? 0;
      if (inflowFromOwner > 0) continue;
    }

    // Determine the floor for this cell. Two modes:
    //   - Explicit fixed floor (FR-012 strict): the count below which
    //     decay cannot go. Set when `setReserves` is applied.
    //   - Fallback: derive from current count × reserves percent.
    let floor: number;
    if (floorsAvailable) {
      floor = (reservedFloors as Uint32Array)[idx] ?? 0;
    } else {
      const reservesPct = (state.reservesPct[idx] ?? 0) >>> 0;
      floor = computeReservesFloor(count, reservesPct);
    }

    // If already at or below the floor, no decay this tick.
    if (count <= floor) continue;

    // Subtract decayPerTick (integer); clamp to floor.
    const next = (count - decayPerTick) >>> 0;
    const clamped = next < floor ? floor : next;
    newCounts[idx] = clamped;
    // If count reached 0, owner becomes 0 (null).
    if (clamped === 0) {
      newOwners[idx] = 0;
    }
  }

  return {
    state: {
      troopCounts: newCounts,
      troopOwners: newOwners,
      pipeMasks: new Uint8Array(state.pipeMasks),
      reservesPct: new Uint8Array(state.reservesPct),
      cityOwners: new Uint8Array(state.cityOwners),
    },
    events: emptyTickEvents(),
  };
}

/**
 * Compute the reserves floor for a given count and reserves
 * percentage (0..9) using the current-count interpretation.
 * `floor = count - floor(count * (10 - reserves) / 10)`.
 *
 * Edge case: when reserves >= 10 (impossible per contract) or when
 * count * (10 - reserves) / 10 rounds to 0, the floor equals the
 * count, holding all troops.
 */
function computeReservesFloor(count: number, reserves: number): number {
  if (count <= 0) return 0;
  if (reserves <= 0) return 0;
  if (reserves >= 10) return count;
  const flowable = Math.floor((count * (10 - reserves)) / 10);
  return count - flowable;
}
