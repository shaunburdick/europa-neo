/**
 * tick orchestrator — Feature 001, T027 + US2/US3/US4/US5 wiring
 *
 * Pure `tick(world): TickResult`. Advances the simulation by exactly
 * one tick: drains staged orders, applies them in a deterministic total
 * order, runs the resolution pipeline, and returns the next `World`
 * plus the events observed during resolution.
 *
 * **Phase pipeline (US1 + US2 + US3 + US4 + US5)**:
 *   0. Drain staged orders, sort by PlayerId ascending then `kind`
 *      alphabetical, apply each (pipe commands mutate `pipeMasks`),
 *      record successes in `events.appliedOrders`.
 *   1. `resolveProduction` — each owned city adds `productionRate`
 *      troops up to `cityCapacity`.
 *   2. `resolveParatroop` (US4) — paratroop commands spend 2N from
 *      source, add N to target, clear target pipes. Runs BEFORE flow
 *      so paratroopers can clear pipes before flow reads them.
 *   3. `resolveGun` (US4) — gun commands spend `gunCost` from source,
 *      damage `gunDamage` from target occupants. Runs BEFORE flow
 *      so gun damage applies to current-tick occupants (FR-014
 *      "at tick time").
 *   4. `resolveFlow` — each pipe transfers troops modified by slope,
 *      populating the inflow tally (US2/US3 side-channel).
 *   5. `resolveCombat` — multi-owner cells (per inflow tally) resolve
 *      attrition; `CombatEvent`s emitted.
 *   6. `resolveCapture` — cities transfer to the dominant occupant;
 *      `CaptureEvent`s emitted.
 *   7. `resolveDecay` — unfed stacks lose `decayPerTick`, clamped at
 *      the reserves floor; friendly-inflow cells are exempt.
 *   8. `resolveTerminal` (US5) — eliminated players detected (zero
 *      troops AND zero cities), `MatchResult` emitted if <2 alive.
 *
 * **Determinism** (FR-017 + SC-001):
 *   - Pure function: input is never mutated; output is a fresh `World`.
 *   - Integer math throughout (delegated to resolution modules).
 *   - Sort comparator is fixed (PlayerId ascending, `kind` alphabetical).
 *   - No wall-clock reads; no `Math.random()`; no trig.
 *
 * **Frozen-once-terminal**: when the input world has an already-set
 * terminal result, tick is a no-op that returns the input world with
 * the same `terminal` field (FR-015 + FR-016 invariants).
 */

import { readPendingOrders, withPendingOrders } from './applyCommand';
import { ENGINE_CONSTANTS } from './constants';
import { emptyTickEvents, pushAppliedOrder } from './events';
import { resolveCapture } from './resolution/capture';
import { resolveCombat } from './resolution/combat';
import { resolveDecay } from './resolution/decay';
import { resolveFlow } from './resolution/flow';
import { resolveGun } from './resolution/gun';
import { resolveParatroop } from './resolution/paratroop';
import { resolveProduction } from './resolution/production';
import { resolveTerminal } from './resolution/terminal';
import type {
  AppliedOrderRecord,
  Board,
  Coord,
  Direction,
  MatchResult,
  Order,
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
  // Frozen-once-terminal: if the match is already over, return the
  // input world unchanged with the same terminal result.
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

  // ---- Phase 2: paratroop (US4) ----------------------------------------
  // Runs BEFORE flow so paratroopers can clear pipes before flow reads
  // them. Filter to paratroop orders only — other kinds are silently
  // ignored (callers stage orders of any kind; the resolver handles
  // its own kind).
  const paratroopOrders = sorted.filter(
    (o): o is Extract<Order, { kind: 'paratroop' }> => o.kind === 'paratroop',
  );
  if (paratroopOrders.length > 0) {
    const paraResult = resolveParatroop(state, world.board, ENGINE_CONSTANTS, paratroopOrders);
    state = paraResult.state;
    for (const e of paraResult.errors) {
      events = { ...events, errors: [...events.errors, e] };
    }
  }

  // ---- Phase 3: gun (US4) ----------------------------------------------
  // Runs BEFORE flow so gun damage applies to current-tick occupants
  // (FR-014 "at tick time"). Damage is applied regardless of target
  // ownership — friendly fire is real.
  const gunOrders = sorted.filter((o): o is Extract<Order, { kind: 'gun' }> => o.kind === 'gun');
  if (gunOrders.length > 0) {
    const gunResult = resolveGun(state, world.board, ENGINE_CONSTANTS, gunOrders);
    state = gunResult.state;
    for (const e of gunResult.errors) {
      events = { ...events, errors: [...events.errors, e] };
    }
  }

  // ---- Phase 4: flow (populates inflow tally) ---------------------------
  const inflowTally = new Uint32Array(n * PLAYERS);
  state = resolveFlow(state, world.board, ENGINE_CONSTANTS, inflowTally);

  // ---- Phase 5: combat -------------------------------------------------
  const combatResult = resolveCombat(state, world.board, ENGINE_CONSTANTS, world.tick, inflowTally);
  state = combatResult.state;
  events = {
    ...events,
    combat: [...events.combat, ...combatResult.events.combat],
  };

  // ---- Phase 6: capture ------------------------------------------------
  const captureResult = resolveCapture(state, world.board, ENGINE_CONSTANTS, world.tick);
  state = captureResult.state;
  events = {
    ...events,
    captures: [...events.captures, ...captureResult.events.captures],
  };

  // ---- Phase 7: decay --------------------------------------------------
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

  // ---- Phase 8: terminal (US5) -----------------------------------------
  // Runs AFTER decay so it sees the final post-decay state. Detects
  // elimination (zero troops + zero cities) and emits MatchResult if
  // fewer than two players remain alive.
  //
  // Use `world.players` (pre-tick snapshot) for the status baseline;
  // resolveTerminal recomputes troops/cities from `state` and marks
  // newly eliminated players.
  const terminalResult = resolveTerminal(state, world.players, ENGINE_CONSTANTS, world.tick);
  events = {
    ...events,
    eliminations: [...events.eliminations, ...terminalResult.events.eliminations],
  };

  const nextWorld: World = withPendingOrders(
    {
      ...world,
      tick: world.tick + 1,
      state,
      players: Object.freeze(terminalResult.players),
    },
    [], // drained
  );

  const terminal: MatchResult | undefined = terminalResult.terminal;

  if (terminal === undefined) {
    return { world: nextWorld, events };
  }
  return { world: nextWorld, events, terminal };
}

/**
 * Cheap terminal check (does not advance time).
 *
 * Recomputes the post-decay snapshot from `world.state` and the
 * player list, returning a `MatchResult` if fewer than two players
 * remain alive. The full detection runs again inside `tick()` —
 * this is the pre-tick check used by feature 006's matchmaking and
 * feature 005's console.
 */
export function isTerminal(world: Readonly<World>): MatchResult | undefined {
  // Count alive players. A player is "alive" iff status === 'alive'.
  // Eliminated/surrendered players don't count.
  const alive = world.players.filter((p) => p.status === 'alive');
  if (alive.length >= 2) return undefined;
  if (alive.length === 1) {
    const winner = alive[0];
    if (winner !== undefined) {
      return {
        kind: 'win',
        winner: winner.id,
        tick: world.tick,
        reason: 'last_standing',
      };
    }
    return undefined;
  }
  // alive.length === 0 — mutual elimination.
  return {
    kind: 'draw',
    tick: world.tick,
    reason: 'mutual_elimination',
  };
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
 * surrender was applied immediately in `applyCommand` (US5); other
 * deferred kinds (setReserves) are no-ops in v1 (T045/T049).
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
    // setReserves mutates state.reservesPct (US3 deferred to T045; we
    // wire it here so the engine surface covers all FRs).
    case 'setReserves': {
      const newPct = new Uint8Array(state.reservesPct);
      const idx = order.cell.y * board.width + order.cell.x;
      newPct[idx] = order.percent;
      return { ...state, reservesPct: newPct };
    }
    // paratroop, gun: applied by their dedicated resolution phases
    // (Phase 2 / Phase 3) using the staged order set.
    // surrender: applied immediately in applyCommand (not staged).
    case 'paratroop':
    case 'gun':
    case 'surrender':
      return state;
  }
}
