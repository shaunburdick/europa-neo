/**
 * Test Scenario Runner — Feature 001
 *
 * Test-only helper that drives a headless match. NOT part of the
 * production engine — fixtures live under `tests/` per the vitest
 * config and the package's `exports` map. NOT exported from the engine
 * barrel.
 *
 * **Phase 2 history**: this fixture used to ship with a minimal,
 * test-only simulator (production-only, no flow/combat/validation)
 * because the real engine wasn't built yet. As of Phase 3, US1 ships
 * `createWorld` + `applyCommand` + `tick`, and this runner delegates
 * to them. The public signature of `runScenario` is unchanged so the
 * quickstart tests and the Phase 2 sanity tests keep working without
 * edits.
 *
 * Per-tick loop:
 *   1. Apply each staged order (`atTick === t`) via `applyCommand`.
 *   2. Call `tick(world)` — drains staged orders + runs resolution.
 *   3. Collect the resulting `TickEvents`.
 *
 * Invalid orders (FR-018): `applyCommand` returns `{ ok: false, ... }`
 * and the world unchanged, so the runner does not stage them. The
 * production tick still advances, just without that order.
 */

import { applyCommand } from '../../src/applyCommand';
import { createWorld } from '../../src/create';
import { tick } from '../../src/tick';
import type { Board, CommandResult, MatchConfig, Order, TickEvents, World } from '../../src/types';

/**
 * Run a scripted scenario headlessly. Builds a world, stages orders
 * by their `atTick`, ticks `tickCount` times (default: `max(atTick) + 1`
 * or 1, whichever is larger), and returns the final world plus the
 * per-tick events.
 *
 * @param cfg       Match configuration.
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

  // Group orders by their target tick. Skip out-of-range atTick values
  // so callers don't need to know tickCount in advance.
  const byTick = new Map<number, Order[]>();
  for (const { atTick, order } of orders) {
    if (atTick < 0 || atTick >= totalTicks) {
      continue;
    }
    const bucket = byTick.get(atTick);
    if (bucket) {
      bucket.push(order);
    } else {
      byTick.set(atTick, [order]);
    }
  }

  let world: World = createWorld(cfg, board);
  const allEvents: TickEvents[] = [];

  for (let t = 0; t < totalTicks; t++) {
    // Stage every order for this tick. `applyCommand` validates; failed
    // orders don't advance the world but the rejection doesn't stop the
    // tick loop. We accumulate any rejections for diagnostic visibility
    // but don't surface them through `runScenario` (the engine's
    // `TickEvents.errors` channel is the proper home — it gets
    // populated by `tick` itself for in-tick rejections).
    const rejected: { order: Order; result: CommandResult }[] = [];
    const pending = byTick.get(t) ?? [];
    for (const order of pending) {
      const result = applyCommand(world, order);
      if (result.result.ok) {
        world = result.world;
      } else {
        rejected.push({ order, result: result.result });
      }
    }

    // Tick once. `tick` drains `pendingOrders`, applies them, and
    // runs the resolution pipeline (production + flow for US1).
    const tickResult = tick(world);
    world = tickResult.world;
    // Fold any pre-tick rejections into the per-tick events so callers
    // see them. US1 doesn't currently emit these on the events.errors
    // channel itself (that's a deferred-error channel), but surfacing
    // them here keeps the runner's behavior backward-compatible with
    // the Phase 2 fixture's expectation that "rejected orders are
    // visible somewhere".
    let eventsForTick: TickEvents = tickResult.events;
    for (const r of rejected) {
      if (!r.result.ok) {
        eventsForTick = {
          ...eventsForTick,
          errors: [...eventsForTick.errors, { order: r.order, reason: r.result.reason }],
        };
      }
    }
    allEvents.push(eventsForTick);
  }

  return { finalWorld: world, events: allEvents };
}
