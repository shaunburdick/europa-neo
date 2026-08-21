/**
 * tick orchestrator — Feature 001, T027
 *
 * Pure `tick(world): TickResult`. Advances the simulation by exactly
 * one tick: drains staged orders (added by `applyCommand`), applies
 * them in a deterministic total order, runs the US1 resolution
 * pipeline (production → flow), and returns the next `World` plus the
 * events observed during resolution.
 *
 * **Phase pipeline (US1)**:
 *   1. Drain staged orders, sort by PlayerId ascending then `kind`
 *      alphabetical, apply each (pipe commands mutate `pipeMasks`),
 *      record successes in `events.appliedOrders`.
 *   2. `resolveProduction` — each owned city adds `productionRate`
 *      troops up to `cityCapacity`.
 *   3. `resolveFlow` — each pipe transfers troops modified by slope.
 *
 * Future phases (combat, capture, decay, paratroop, gun, terminal)
 * slot in between (2) and (3) in later user stories. See plan.md
 * §"Tick pipeline" for the canonical order.
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
 *          drained) and the events observed during resolution. For
 *          US1, `terminal` is always `undefined`; US5 wires terminal
 *          detection.
 */
export function tick(world: Readonly<World>): TickResult {
  // Frozen-once-terminal: future US5 makes tick a no-op when the match
  // is already over. For US1, terminal is always undefined, so we
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

  // ---- Phase 1: production ----------------------------------------------
  state = resolveProduction(state, world.board, ENGINE_CONSTANTS);

  // ---- Phase 2: flow ----------------------------------------------------
  state = resolveFlow(state, world.board, ENGINE_CONSTANTS);

  // Recompute players snapshot (troopsHeld + citiesOwned) so the public
  // `World.players` stays in sync with `state`. Done after production +
  // flow so the snapshot reflects the post-resolution numbers.
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

  // US5 wires terminal detection; US1 always returns undefined.
  const terminal: MatchResult | undefined = undefined;
  void terminal;

  return { world: nextWorld, events };
}

/**
 * Cheap terminal check (does not advance time). US1 always returns
 * `undefined` because elimination / surrender are US5; US5 implements
 * the real check. The function exists so callers can use it before
 * driving the tick loop.
 */
export function isTerminal(world: Readonly<World>): MatchResult | undefined {
  // US1: no terminal conditions yet. US5 will replace this body.
  // Keep `world` referenced to satisfy lint and document intent.
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
 * state and an `AppliedOrderRecord`. US1 implements pipe commands;
 * other order kinds are no-ops at this stage (their effect fires in
 * their owning user story's phase — see plan.md §"Tick pipeline").
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
 * Dispatch a single order to its US1 effect. Returns the new state
 * (which may be unchanged for orders deferred to other stories).
 *
 * US1 implements pipe commands; US4/US5 add paratroop, gun, surrender.
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
    // US1 defers these — no state change in tick.
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
