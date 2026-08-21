/**
 * Test Scenario Runner — Feature 001
 *
 * Test-only helper that drives a minimal headless match. NOT part of
 * the production engine — fixtures live under `tests/` per the vitest
 * config and the package's `exports` map. NOT exported from the engine
 * barrel.
 *
 * **Why a minimal in-fixture engine here?** The real production
 * `createWorld` / `applyCommand` / `tick` land in Phase 3 (tasks
 * T021–T027). Phase 2 needs the scenario runner's *shape* (file path,
 * signature, return value) so the quickstart and determinism tests
 * written in Phase 3 have a stable fixture to import. We implement
 * just enough behavior to satisfy the Phase 2 sanity tests:
 *
 *   - "no orders produces a world where cities produce each tick"
 *   - "one order at tick 0 produces a tick event recording the order"
 *
 * The production engine replaces the minimal internals when Phase 3
 * lands; the *public signature* of `runScenario` is stable.
 *
 * Implemented phases here (test-only, not the real engine):
 *   - World construction (allocates flat typed arrays, populates cities).
 *   - Order staging: orders with `atTick === current tick` are
 *     recorded in `appliedOrders` of that tick's events.
 *   - Production: each city adds `ENGINE_CONSTANTS.productionRate`
 *     troops per tick up to `cityCapacity`.
 *
 * NOT implemented here (deferred to Phase 3):
 *   - Flow, combat, capture, decay, paratroop, gun, terminal.
 *   - Validation of order contents (we just record them).
 *   - `validateCommand` rejection → `errors` channel.
 *
 * When Phase 3 wires in the real engine, this fixture's `tickOne`
 * body swaps in for the production phase pipeline. The runScenario
 * outer loop (group orders by tick, drain, collect) is unchanged.
 */

import { ENGINE_CONSTANTS } from '../../src/constants';
import { emptyTickEvents, pushAppliedOrder, pushError } from '../../src/events';
import type {
  Board,
  MatchConfig,
  Order,
  Player,
  PlayerId,
  TickEvents,
  World,
  WorldState,
} from '../../src/types';

// ----------------------------------------------------------------------------
// Minimal world construction (test-only; Phase 3 production engine is
// authoritative for real matches).
// ----------------------------------------------------------------------------

/**
 * Build a `World` from `cfg` + `board` using a minimal, test-only
 * initializer. Allocates flat typed arrays per `data-model.md` §9,
 * populates `cityOwners` from `board.cities`, and constructs
 * `players` with status 'alive' and zero `troopsHeld` / `citiesOwned`.
 *
 * **Not** the production `createWorld` (lives in `src/create.ts` in
 * Phase 3). Used only by `runScenario` and its tests.
 */
function buildTestWorld(cfg: MatchConfig, board: Board, tick = 0): World {
  const total = board.width * board.height;

  const troopCounts = new Uint32Array(total);
  const troopOwners = new Uint8Array(total); // 0 = neutral
  const pipeMasks = new Uint8Array(total);
  const reservesPct = new Uint8Array(total);
  const cityOwners = new Uint8Array(total); // 0 = no city

  // Mark city cells; cities start owned.
  for (const city of board.cities) {
    const idx = city.cell.y * board.width + city.cell.x;
    cityOwners[idx] = city.owner;
  }

  const state: WorldState = {
    troopCounts,
    troopOwners,
    pipeMasks,
    reservesPct,
    cityOwners,
  };

  const players: Player[] = [];
  for (let i = 0; i < cfg.playerCount; i++) {
    const id = (i + 1) as PlayerId;
    players.push({
      id,
      displayName: `Player ${id}`,
      status: 'alive',
      citiesOwned: 0,
      troopsHeld: 0,
    });
  }

  return {
    config: cfg,
    tick,
    board,
    players: Object.freeze(players),
    state,
    rngSeed: cfg.seed,
    rngState: new Uint32Array(4),
  };
}

// ----------------------------------------------------------------------------
// Minimal production-only phase (test-only).
// ----------------------------------------------------------------------------

/**
 * Run one tick: drain the pending-order queue, run production, increment
 * the tick counter. Returns a NEW `World` (input never mutated) and
 * the events observed during the tick.
 *
 * This is the test-fixture analog of the production `tick()` function
 * in `src/tick.ts` (Phase 3). It supports exactly the two behaviors
 * the Phase 2 sanity tests assert; nothing more.
 */
function tickOne(
  world: World,
  pendingOrders: ReadonlyArray<Order>,
): { world: World; events: TickEvents } {
  let events = emptyTickEvents();

  // 1) Drain pending orders: record each as applied (test-only; real
  //    engine applies the order's effect too). Validation rejection
  //    isn't modeled in Phase 2 — every pending order is "applied".
  for (const order of pendingOrders) {
    events = pushAppliedOrder(events, {
      tick: world.tick,
      order,
      result: { ok: true },
    });
  }

  // 2) Production: each city cell adds `productionRate` troops up to
  //    `cityCapacity`. Integer-only ops, matches ENGINE_CONSTANTS.
  const newCounts = new Uint32Array(world.state.troopCounts);
  const newOwners = new Uint8Array(world.state.troopOwners);
  for (let i = 0; i < world.state.troopCounts.length; i++) {
    const owner = world.state.cityOwners[i] ?? 0;
    if (owner === 0) continue; // no city here
    const current = newCounts[i] ?? 0;
    if (current >= ENGINE_CONSTANTS.cityCapacity) continue;
    const add = Math.min(ENGINE_CONSTANTS.productionRate, ENGINE_CONSTANTS.cityCapacity - current);
    newCounts[i] = current + add;
    newOwners[i] = owner;
  }

  // 3) Recompute players snapshot (troopsHeld + citiesOwned). Real
  //    engine does this in the terminal phase; we do it each tick so
  //    the sanity test can read `world.players[0].troopsHeld`.
  const totalPerPlayer: Record<number, number> = {};
  const citiesPerPlayer: Record<number, number> = {};
  for (let i = 0; i < newCounts.length; i++) {
    const owner = newOwners[i] ?? 0;
    if (owner === 0) continue;
    totalPerPlayer[owner] = (totalPerPlayer[owner] ?? 0) + (newCounts[i] ?? 0);
  }
  for (let i = 0; i < world.state.cityOwners.length; i++) {
    const owner = world.state.cityOwners[i] ?? 0;
    if (owner === 0) continue;
    citiesPerPlayer[owner] = (citiesPerPlayer[owner] ?? 0) + 1;
  }
  const newPlayers: Player[] = world.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    status: p.status,
    citiesOwned: citiesPerPlayer[p.id] ?? 0,
    troopsHeld: totalPerPlayer[p.id] ?? 0,
  }));

  const nextWorld: World = {
    config: world.config,
    tick: world.tick + 1,
    board: world.board,
    players: Object.freeze(newPlayers),
    state: {
      troopCounts: newCounts,
      troopOwners: newOwners,
      pipeMasks: new Uint8Array(world.state.pipeMasks),
      reservesPct: new Uint8Array(world.state.reservesPct),
      cityOwners: new Uint8Array(world.state.cityOwners),
    },
    rngSeed: world.rngSeed,
    rngState: new Uint32Array(world.rngState),
  };

  return { world: nextWorld, events };
}

// ----------------------------------------------------------------------------
// Public scenario runner
// ----------------------------------------------------------------------------

/**
 * Run a scripted scenario headlessly. Builds a world, stages orders
 * by their `atTick`, ticks `tickCount` times (default: `max(atTick) + 1`
 * or 1, whichever is larger), and returns the final world plus the
 * per-tick events.
 *
 * @param cfg       Match configuration (used for player count, board
 *                  size, seed).
 * @param board     Static terrain (cities, cells).
 * @param orders    Orders grouped by tick. Orders with `atTick` < 0
 *                  or ≥ `tickCount` are silently ignored.
 * @param tickCount Number of ticks to simulate. Defaults to
 *                  `max(1, max(atTick) + 1)` if orders are present,
 *                  else 1.
 * @returns `finalWorld` (the last tick's world) and `events` (one
 *          `TickEvents` per tick, in tick order).
 */
export function runScenario(
  cfg: MatchConfig,
  board: Board,
  orders: ReadonlyArray<{ atTick: number; order: Order }>,
  tickCount?: number,
): { finalWorld: World; events: TickEvents[] } {
  // Determine tick count: enough to include the latest staged order.
  const maxAtTick = orders.reduce((m, o) => Math.max(m, o.atTick), -1);
  const totalTicks = tickCount ?? Math.max(1, maxAtTick + 1);

  let world = buildTestWorld(cfg, board, 0);
  const allEvents: TickEvents[] = [];

  // Group orders by their target tick.
  const byTick = new Map<number, Order[]>();
  for (const { atTick, order } of orders) {
    if (atTick < 0 || atTick >= totalTicks) continue;
    const bucket = byTick.get(atTick);
    if (bucket) {
      bucket.push(order);
    } else {
      byTick.set(atTick, [order]);
    }
  }

  for (let t = 0; t < totalTicks; t++) {
    const pending = byTick.get(t) ?? [];
    const result = tickOne(world, pending);
    world = result.world;
    allEvents.push(result.events);
  }

  return { finalWorld: world, events: allEvents };
}

// Re-export `pushError` for symmetry with the events module; some
// downstream fixtures may want to record validation rejections in
// extended scenario runners. Not currently used by runScenario itself.
export { pushError };
