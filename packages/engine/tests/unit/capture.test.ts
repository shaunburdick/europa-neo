/**
 * Capture resolution unit tests — Feature 001, T032
 *
 * Covers:
 *   - FR-005: city ownership transfers when enemy troops occupy city cell.
 *   - Edge case "city captured mid-production": new owner inherits the
 *     saturation state — the city still produces at its current count
 *     (capture does not reset the troop count to 0).
 *   - Non-city cell with enemy troops: no capture event emitted.
 *   - Friendly troops only on city cell: no capture event.
 *   - Empty cell with no city: no capture event.
 *   - CaptureEvent shape per contract: { cell, fromOwner, toOwner, isCity }.
 *
 * resolveCapture is called directly with a hand-built WorldState so the
 * pure resolution function is exercised in isolation from the tick
 * orchestrator (per data-model.md §9 + research.md §10).
 *
 * **Capture rule**: for each cell with a city, if the city's current
 * owner (per `cityOwners[i]`) differs from the cell's occupying force
 * (per `troopOwners[i]`), the city transfers to the occupying force.
 * A `CaptureEvent` is emitted with `isCity: true` and the `from`/`to`
 * player labels. The troop count is left intact (inherited saturation).
 *
 * **Non-city cells**: no event is emitted, even if the occupant's
 * owner differs from the previous owner — capture applies only to city
 * cells per FR-005.
 */

import { describe, expect, it } from 'vitest';
import type { EngineConstants } from '../../src/contracts/engine-api';
import { resolveCapture } from '../../src/resolution/capture';
import type { Board, WorldState } from '../../src/types';
import { buildSmallBoard } from '../fixtures/board';

// Production constants — capture doesn't read any of these today, but
// the signature requires an EngineConstants so we pass the real one.
const CONSTANTS: EngineConstants = {
  productionRate: 1,
  cityCapacity: 30,
  cellCapacity: 30,
  decayPerTick: 1,
  flowDownhillFactor: 1,
  flowUphillFactor: 0,
  flowBase: 0,
  paratroopCost: 10,
  gunCost: 5,
  gunDamage: 2,
  visibilityRadiusDefault: 4,
};

function emptyState(size: number): WorldState {
  const n = size * size;
  return {
    troopCounts: new Uint32Array(n),
    troopOwners: new Uint8Array(n),
    pipeMasks: new Uint8Array(n),
    reservesPct: new Uint8Array(n),
    cityOwners: new Uint8Array(n),
  };
}

/** Place a stack + optional city on a cell. */
function place(
  state: WorldState,
  size: number,
  x: number,
  y: number,
  owner: number,
  count: number,
  cityOwner: number | null,
): void {
  const idx = y * size + x;
  state.troopCounts[idx] = count;
  state.troopOwners[idx] = owner;
  state.cityOwners[idx] = cityOwner ?? 0;
}

const TICK = 11;

describe('resolveCapture — FR-005 city capture', () => {
  it('enemy troops on city cell: city ownership transfers to enemy', () => {
    const size = 8;
    // City owned by P1; troops belong to P2 (after combat settled).
    const board: Board = buildSmallBoard(size, [[3, 3, 1]]);
    const state = emptyState(size);
    place(state, size, 3, 3, 2, 100, 1);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.state.cityOwners[3 * size + 3]).toBe(2);
  });

  it('enemy troops on city cell: emits CaptureEvent with fromOwner=1, toOwner=2, isCity=true', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, [[3, 3, 1]]);
    const state = emptyState(size);
    place(state, size, 3, 3, 2, 100, 1);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.events.captures.length).toBe(1);
    const ev = out.events.captures[0];
    expect(ev).toBeDefined();
    if (ev === undefined) {
      return;
    }
    expect(ev.tick).toBe(TICK);
    expect(ev.cell).toEqual({ x: 3, y: 3 });
    expect(ev.fromOwner).toBe(1);
    expect(ev.toOwner).toBe(2);
    expect(ev.isCity).toBe(true);
  });

  it('capture does NOT reset the troop count (city inherits saturation)', () => {
    const size = 8;
    // City had 30 troops (saturated). After capture by P2 (with, say,
    // 150 troops remaining from combat), the cell retains those 150
    // — capture does not zero the stack.
    const board: Board = buildSmallBoard(size, [[3, 3, 1]]);
    const state = emptyState(size);
    place(state, size, 3, 3, 2, 150, 1);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.state.troopCounts[3 * size + 3]).toBe(150);
    expect(out.state.troopOwners[3 * size + 3]).toBe(2);
    expect(out.state.cityOwners[3 * size + 3]).toBe(2);
  });

  it('capture does not affect the troop count when the city was mid-saturation (Edge Case: city captured mid-production)', () => {
    // The original city had been producing up to a partial count
    // (say 17). New owner's troops (also 17) occupy the cell after
    // combat. Capture transfers ownership without resetting production.
    const size = 8;
    const board: Board = buildSmallBoard(size, [[3, 3, 1]]);
    const state = emptyState(size);
    place(state, size, 3, 3, 2, 17, 1);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.state.troopCounts[3 * size + 3]).toBe(17);
  });
});

describe('resolveCapture — no-capture cases', () => {
  it('friendly troops on city cell: no capture event', () => {
    // City owned by P1; troops also P1. No ownership mismatch → no event.
    const size = 8;
    const board: Board = buildSmallBoard(size, [[3, 3, 1]]);
    const state = emptyState(size);
    place(state, size, 3, 3, 1, 30, 1);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.events.captures.length).toBe(0);
    // City owner unchanged.
    expect(out.state.cityOwners[3 * size + 3]).toBe(1);
  });

  it('enemy troops on a NON-city cell: no capture event', () => {
    // P2 has troops on a cell that has NO city. No capture to do.
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    place(state, size, 3, 3, 2, 50, null);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.events.captures.length).toBe(0);
    // Cell still has no city.
    expect(out.state.cityOwners[3 * size + 3]).toBe(0);
  });

  it('empty cell with no city: no event', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, []);
    const state = emptyState(size);
    const before = Array.from(state.cityOwners);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.events.captures.length).toBe(0);
    expect(Array.from(out.state.cityOwners)).toEqual(before);
  });

  it('enemy troops on a city cell already owned by the enemy: no event (no change)', () => {
    // City is already owned by P2 (e.g., captured in a previous tick).
    // P2's troops occupy it. No further ownership change → no event.
    const size = 8;
    const board: Board = buildSmallBoard(size, [[3, 3, 2]]);
    const state = emptyState(size);
    place(state, size, 3, 3, 2, 25, 2);

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.events.captures.length).toBe(0);
    expect(out.state.cityOwners[3 * size + 3]).toBe(2);
  });

  it('empty cell with city: no event (neutral occupant)', () => {
    // City exists, but no troops occupy the cell. capture.ts only fires
    // when an occupant differs from the city owner — neutral occupants
    // never capture.
    const size = 8;
    const board: Board = buildSmallBoard(size, [[3, 3, 1]]);
    const state = emptyState(size);
    state.cityOwners[3 * size + 3] = 1;
    // troopCounts and troopOwners remain 0 (neutral).

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.events.captures.length).toBe(0);
    expect(out.state.cityOwners[3 * size + 3]).toBe(1);
  });
});

describe('resolveCapture — multiple captures', () => {
  it('multiple cities captured in the same tick: emits one CaptureEvent each', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const state = emptyState(size);
    place(state, size, 1, 1, 2, 100, 1); // P2 captured P1's city
    place(state, size, 6, 6, 1, 100, 2); // P1 captured P2's city

    const out = resolveCapture(state, board, CONSTANTS, TICK);
    expect(out.events.captures.length).toBe(2);
    expect(out.state.cityOwners[1 * size + 1]).toBe(2);
    expect(out.state.cityOwners[6 * size + 6]).toBe(1);
    // Both events carry the tick number.
    for (const ev of out.events.captures) {
      expect(ev.tick).toBe(TICK);
      expect(ev.isCity).toBe(true);
    }
  });
});

describe('resolveCapture — determinism & purity', () => {
  it('does not mutate input state arrays', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, [[3, 3, 1]]);
    const state = emptyState(size);
    place(state, size, 3, 3, 2, 100, 1);
    const before = Array.from(state.cityOwners);

    resolveCapture(state, board, CONSTANTS, TICK);

    expect(Array.from(state.cityOwners)).toEqual(before);
  });

  it('same input × 1000 calls → byte-identical output', () => {
    const size = 8;
    const board: Board = buildSmallBoard(size, [
      [1, 1, 1],
      [6, 6, 2],
    ]);
    const state = emptyState(size);
    place(state, size, 1, 1, 2, 100, 1);
    place(state, size, 6, 6, 1, 100, 2);

    const reference = resolveCapture(state, board, CONSTANTS, TICK);
    for (let i = 0; i < 1000; i++) {
      const next = resolveCapture(state, board, CONSTANTS, TICK);
      expect(Array.from(next.state.cityOwners)).toEqual(Array.from(reference.state.cityOwners));
      expect(next.events.captures.length).toBe(reference.events.captures.length);
    }
  });
});
