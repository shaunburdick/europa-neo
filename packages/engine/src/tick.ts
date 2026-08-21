/**
 * tick orchestrator — Feature 001, T027 + US2/US3 wiring
 *
 * Pure `tick(world): TickResult`. Advances the simulation by exactly
 * one tick: drains staged orders, applies them in a deterministic total
 * order, runs the resolution pipeline, and returns the next `World`
 * plus the events observed during resolution.
 *
 * **Phase pipeline (US1 + US2 + US3)**:
 *   1. Drain staged orders, sort by PlayerId ascending then `kind`
 *      alphabetical, apply each (pipe commands mutate `pipeMasks`),
 *      record successes in `events.appliedOrders`.
 *   2. `resolveProduction` — each owned city adds `productionRate`
 *      troops up to `cityCapacity`.
 *   3. `resolveFlow` — each pipe transfers troops modified by slope,
 *      populating the inflow tally (US2/US3 side-channel).
 *   4. `resolveCombat` — multi-owner cells (per inflow tally) resolve
 *      attrition; `CombatEvent`s emitted.
 *   5. `resolveCapture` — cities transfer to the dominant occupant;
 *      `CaptureEvent`s emitted.
 *   6. `resolveDecay` — unfed stacks lose `decayPerTick`, clamped at
 *      the reserves floor; friendly-inflow cells are exempt.
 *
 * **Determinism** (FR-017 + SC-001):
 *   - Pure function: input is never mutated; output is a fresh `World`.
 *   - Integer math throughout (delegated to resolution modules).
 *   - Sort comparator is fixed (PlayerId ascending, `kind` alphabetical).
 *   - No wall-clock reads; no `Math.random()`; no trig.
 */

import { readPendingOrders, withPendingOrders } from './applyCommand';
import { ENGINE_CONSTANTS } from './constants';
import { emptyTickEvents, pushAppliedOrder } from './events';
import { resolveCapture } from './resolution/capture';
import { resolveCombat } from './resolution/combat';
import { resolveDecay } from './resolution/decay';
import { resolveFlow } from './resolution/flow';
import { resolveProduction } from './resolution/production';
import type {
  AppliedOrderRecord,
  Board,
  Coord,
  Direction,
  MatchResult,
  Order,
  Player,
  PlayerId,
  TickEvents,
  TickResult,
  World,
  WorldState,
} from './types';

const PLAYERS = 4;

// Pipe mask bits (must match flow.ts / read.ts).
const N_BIT = 0x01;
const E_BIT = 0x02;
const S_BIT = 0x04;
const W_BIT = 0x08;

const DIRECTION_BITS: Readonly<Record<Direction, number>> = Object.freeze({
  N: N_BIT,
  E: E_BIT,
  S: S_BIT,
  W: W_BIT,
});

/**
 * Advance the world by one tick. Pure.
 *
 * @returns `{ world, events }` — the next world (with `pendingOrders`
 *          drained) and the events observed during resolution. If the
 *          match ends on this tick, `terminal` is populated (US5).
 */
export function tick(world: Readonly<World>): TickResult {
  // Frozen-once-terminal: future US5 makes tick a no-op when the match
  // is already over. For US1-US3, terminal is always undefined, so we
  // always run.
  const existingTerminal = isTerminal(world);
  if (existingTerminal !== undefined) {
    return {
      world,
      events: emptyTickEvents(),
      terminal: existingTerminal,
    };
  }

  let events: TickEvents = emptyTickEvents();
  let state: WorldState = world.state;

  // ---- Phase 0: drain + apply staged orders ----------------------------
  const pending = readPendingOrders(world);
  const sorted = sortOrdersDeterministic(pending);

  for (const order of sorted) {
    const record = applyStagedOrder(order, world.tick, state, world.board);
    events = pushAppliedOrder(events, record.record);
    state = record.nextState;
  }

  const n = world.board.width * world.board.height;

  // ---- Phase 1: production ----------------------------------------------
  state = resolveProduction(state, world.board, ENGINE_CONSTANTS);

  // ---- Phase 2: flow (populates inflow tally) ---------------------------
  const inflowTally = new Uint32Array(n * PLAYERS);
  state = resolveFlow(state, world.board, ENGINE_CONSTANTS, inflowTally);

  // ---- Phase 3: combat -------------------------------------------------
  const combatResult = resolveCombat(state, world.board, ENGINE_CONSTANTS, world.tick, inflowTally);
  state = combatResult.state;
  // Append combat events.
  events = {
    ...events,
    combat: [...events.combat, ...combatResult.events.combat],
  };

  // ---- Phase 4: capture ------------------------------------------------
  const captureResult = resolveCapture(state, world.board, ENGINE_CONSTANTS, world.tick);
  state = captureResult.state;
  events = {
    ...events,
    captures: [...events.captures, ...captureResult.events.captures],
  };

  // ---- Phase 5: decay --------------------------------------------------
  // Reserved floors default to zero (no FR-012 enforcement beyond the
  // state.reservesPct fallback). US4/US5 will wire setReserves-driven
  // floors here.
  const reservedFloors = new Uint32Array(n);
  const decayResult = resolveDecay(
    state,
    world.board,
    ENGINE_CONSTANTS,
    world.tick,
    inflowTally,
    reservedFloors,
  );
  state = decayResult.state;
  events = {
    ...events,
    eliminations: [...events.eliminations, ...decayResult.events.eliminations],
  };

  // Recompute players snapshot (troopsHeld + citiesOwned) so the public
  // `World.players` stays in sync with `state`. Done after all resolution
  // so the snapshot reflects the post-resolution numbers.
  const players = recomputePlayers(state, world.players);

  const nextWorld: World = withPendingOrders(
    {
      ...world,
      tick: world.tick + 1,
      state,
      players: Object.freeze(players),
    },
    [], // drained
  );

  // US5 wires terminal detection; US1-US3 always return undefined.
  const terminal: MatchResult | undefined = undefined;
  void terminal;

  return { world: nextWorld, events };
}

/**
 * Cheap terminal check (does not advance time). US5 implements the
 * real check; US1-US3 always return `undefined` because elimination /
 * surrender land in US5.
 */
export function isTerminal(world: Readonly<World>): MatchResult | undefined {
  void world;
  return undefined;
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

/**
 * Comparator that establishes a total order on orders for deterministic
 * application (FR-017): ascending PlayerId, then alphabetical `kind`,
 * then a stable secondary on the rest of the payload (cell, then
 * direction).
 */
function sortOrdersDeterministic(orders: ReadonlyArray<Order>): ReadonlyArray<Order> {
  const copy = [...orders];
  copy.sort((a, b) => {
    if (a.player !== b.player) return a.player - b.player;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return tieBreak(a, b);
  });
  return copy;
}

function tieBreak(a: Order, b: Order): number {
  const ac = pickCoord(a);
  const bc = pickCoord(b);
  if (ac !== undefined && bc !== undefined) {
    if (ac.x !== bc.x) return ac.x - bc.x;
    if (ac.y !== bc.y) return ac.y - bc.y;
  }
  const ad = pickDirection(a);
  const bd = pickDirection(b);
  if (ad !== undefined && bd !== undefined) {
    if (ad < bd) return -1;
    if (ad > bd) return 1;
  }
  return 0;
}

function pickCoord(o: Order): Coord | undefined {
  if ('cell' in o) return o.cell;
  if ('source' in o) return o.source;
  return undefined;
}

function pickDirection(o: Order): Direction | undefined {
  if ('direction' in o && typeof o.direction === 'string') return o.direction;
  return undefined;
}

/**
 * Apply a single staged order to the world state, returning the new
 * state and an `AppliedOrderRecord`. Pipe orders mutate `pipeMasks`;
 * other kinds (setReserves, paratroop, gun, surrender) are deferred
 * to their owning user stories.
 */
function applyStagedOrder(
  order: Order,
  tickNumber: number,
  state: Readonly<WorldState>,
  board: Readonly<Board>,
): { nextState: WorldState; record: AppliedOrderRecord } {
  const nextState = dispatchOrderEffect(order, state, board);
  const record: AppliedOrderRecord = {
    tick: tickNumber,
    order,
    result: { ok: true },
  };
  return { nextState, record };
}

/**
 * Dispatch a single order to its effect. Returns the new state
 * (which may be unchanged for orders deferred to other stories).
 */
function dispatchOrderEffect(
  order: Order,
  state: Readonly<WorldState>,
  board: Readonly<Board>,
): WorldState {
  switch (order.kind) {
    case 'setPipe': {
      const newMasks = new Uint8Array(state.pipeMasks);
      const bit = DIRECTION_BITS[order.direction];
      const idx = order.cell.y * board.width + order.cell.x;
      newMasks[idx] = (newMasks[idx] ?? 0) | bit;
      return { ...state, pipeMasks: newMasks };
    }
    case 'clearPipe': {
      const newMasks = new Uint8Array(state.pipeMasks);
      const bit = DIRECTION_BITS[order.direction];
      const idx = order.cell.y * board.width + order.cell.x;
      newMasks[idx] = (newMasks[idx] ?? 0) & ~bit;
      return { ...state, pipeMasks: newMasks };
    }
    case 'setPipesExclusive': {
      const newMasks = new Uint8Array(state.pipeMasks);
      const bit = DIRECTION_BITS[order.direction];
      const idx = order.cell.y * board.width + order.cell.x;
      newMasks[idx] = bit;
      return { ...state, pipeMasks: newMasks };
    }
    case 'clearAllPipes': {
      const newMasks = new Uint8Array(state.pipeMasks);
      const idx = order.cell.y * board.width + order.cell.x;
      newMasks[idx] = 0;
      return { ...state, pipeMasks: newMasks };
    }
    // US1-US3 defer these — no state change in tick.
    case 'setReserves':
    case 'paratroop':
    case 'gun':
    case 'surrender':
      return state;
  }
}

/**
 * Recompute `troopsHeld` and `citiesOwned` per player from the flat
 * state. Pure. The returned array is a fresh `Player[]` with
 * `displayName` and `status` preserved from the input.
 */
function recomputePlayers(
  state: Readonly<WorldState>,
  prevPlayers: ReadonlyArray<Player>,
): Player[] {
  const troopsByPlayer = new Map<PlayerId, number>();
  const citiesByPlayer = new Map<PlayerId, number>();
  for (let i = 0; i < state.troopCounts.length; i++) {
    const owner = state.troopOwners[i] ?? 0;
    if (owner === 0) continue;
    troopsByPlayer.set(
      owner as PlayerId,
      (troopsByPlayer.get(owner as PlayerId) ?? 0) + (state.troopCounts[i] ?? 0),
    );
  }
  for (let i = 0; i < state.cityOwners.length; i++) {
    const owner = state.cityOwners[i] ?? 0;
    if (owner === 0) continue;
    citiesByPlayer.set(owner as PlayerId, (citiesByPlayer.get(owner as PlayerId) ?? 0) + 1);
  }
  return prevPlayers.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    status: p.status,
    citiesOwned: citiesByPlayer.get(p.id) ?? 0,
    troopsHeld: troopsByPlayer.get(p.id) ?? 0,
  }));
}
