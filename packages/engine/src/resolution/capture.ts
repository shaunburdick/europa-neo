/**
 * Capture resolution phase — Feature 001, T034
 *
 * Pure `resolveCapture(state, board, constants, tickNumber)`:
 * `{ state, events }`.
 *
 * Per spec FR-005, city ownership transfers when the occupying force
 * belongs to an enemy. This phase runs AFTER combat resolves
 * (per tick pipeline order: production → flow → combat → capture),
 * so by the time it runs, the post-combat occupant of each cell is
 * fixed.
 *
 * **Capture rule**: for each cell with a city (`cityOwners[i] !== 0`):
 *   - If the cell's `troopOwners[i]` differs from `cityOwners[i]`, the
 *     city transfers to the occupying force.
 *   - The transfer emits a `CaptureEvent` with `isCity: true`.
 *   - **Troop count is preserved** (new owner inherits saturation,
 *     per the "city captured mid-production" edge case in the spec).
 *
 * **Non-city cells**: no event emitted, no state change.
 *
 * Determinism:
 *   - Row-major iteration; deterministic encounter order.
 *   - Pure: input is never mutated; output is a fresh `WorldState`.
 *
 * Combat's `troopOwners` is the source of truth for "who's on the
 * cell after combat." A neutral cell (owner 0) NEVER captures a city
 * (no event), and a friendly cell (matching city owner) NEVER
 * re-captures (no event).
 */

import type { EngineConstants } from '../contracts/engine-api';
import { emptyTickEvents, pushCaptureEvent } from '../events';
import type { Board, CaptureEvent, PlayerId, TickEvents, WorldState } from '../types';

/**
 * Resolve one tick of city captures across the board. Pure.
 *
 * @param state      Current world state (NOT mutated).
 * @param board      Board (used only for dimensions; cells are not read).
 * @param constants  Engine rule constants (reserved for future tunables;
 *                   unused today).
 * @param tickNumber Tick number to stamp on every emitted CaptureEvent.
 * @returns A fresh `WorldState` with cityOwners updated to reflect
 *          captures, plus a `TickEvents` value carrying the
 *          CaptureEvents in deterministic row-major order.
 */
export function resolveCapture(
  state: Readonly<WorldState>,
  board: Readonly<Board>,
  constants: EngineConstants,
  tickNumber: number,
): { state: WorldState; events: TickEvents } {
  // `constants` is reserved for future tunables; silence unused-arg lint.
  void constants;

  const n = board.width * board.height;

  // Allocate fresh typed arrays (immutable update). Only `cityOwners`
  // is potentially modified.
  const newCityOwners = new Uint8Array(state.cityOwners);

  let events: TickEvents = emptyTickEvents();

  for (let idx = 0; idx < n; idx++) {
    const cityOwner = newCityOwners[idx] ?? 0;
    if (cityOwner === 0) {
      continue; // no city here → no capture possible
    }

    const occupant = state.troopOwners[idx] ?? 0;
    if (occupant === 0) {
      continue; // neutral cell never captures
    }
    if (occupant === cityOwner) {
      continue; // friendly already — no event
    }

    // Occupant differs from city owner → capture transfers the city.
    newCityOwners[idx] = occupant;
    const ev: CaptureEvent = {
      tick: tickNumber,
      cell: idxToCoord(idx, board.width),
      fromOwner: cityOwner as PlayerId,
      toOwner: occupant as PlayerId,
      isCity: true,
    };
    events = pushCaptureEvent(events, ev);
  }

  return {
    state: {
      troopCounts: new Uint32Array(state.troopCounts),
      troopOwners: new Uint8Array(state.troopOwners),
      pipeMasks: new Uint8Array(state.pipeMasks),
      reservesPct: new Uint8Array(state.reservesPct),
      cityOwners: newCityOwners,
    },
    events,
  };
}

/** Convert a flat cell index to a `{x, y}` Coord. */
function idxToCoord(idx: number, width: number): { x: number; y: number } {
  return { x: idx % width, y: Math.floor(idx / width) };
}
