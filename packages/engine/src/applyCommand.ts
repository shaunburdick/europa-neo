/**
 * applyCommand — Feature 001, T025 + US5 surrender handling
 *
 * Pure. Delegates to `validateCommand`. On success, stages the order
 * into an internal `pendingOrders` queue preserved on the returned
 * `world` clone (the next `tick()` call drains it). On failure,
 * returns the input world unchanged with the rejection reason in
 * `result`.
 *
 * **Why internal pending orders?** `tick()` is deterministic and
 * idempotent on its inputs (FR-017). The server calls `applyCommand`
 * multiple times before each `tick()` to stage orders; `tick()` then
 * drains them in a fixed total order (by PlayerId ascending, then by
 * `kind` alphabetical) and applies their effects. The queue lives on
 * the `World` value itself (an extension of the contract's `World`
 * interface), not in module state, so the engine remains pure across
 * parallel calls.
 *
 * **Internal extension of `World`**: the contract's `World` interface
 * is fixed (no `pendingOrders` field). The engine defines a sibling
 * `InternalWorld` interface here that adds the field for in-process
 * use; public callers see only the contract type. This is the same
 * pattern used by `create.ts` and `tick.ts`.
 *
 * **Surrender (FR-016)**: surrender orders apply IMMEDIATELY on
 * `applyCommand` (not deferred to the next tick) — the player is
 * marked `'eliminated'` in the returned `world.players`, and the
 * next `tick()` will detect the terminal condition. This matches the
 * spec's "forces removed or rendered inert" requirement.
 */

import { emptyTickEvents, pushEliminationEvent } from './events';
import type { CommandResult, Order, Player, PlayerId, World } from './types';
import { validateCommand } from './validate';

/**
 * Internal-only extension of the contract's `World` interface. Adds a
 * `pendingOrders` queue. NOT part of the public API surface; not
 * re-exported via the engine barrel.
 */
export interface InternalWorld extends World {
  readonly pendingOrders: ReadonlyArray<Order>;
}

/**
 * Read pending orders off a `World` (cast to the internal type).
 * Returns an empty array if the world has no staged orders (defensive —
 * worlds built without going through `applyCommand` won't have the
 * field).
 */
export function readPendingOrders(world: Readonly<World>): ReadonlyArray<Order> {
  return (world as InternalWorld).pendingOrders ?? [];
}

/**
 * Attach a pending-orders queue to a `World`, returning a new value
 * with the field populated. Other fields are copied unchanged.
 */
export function withPendingOrders(
  world: Readonly<World>,
  pendingOrders: ReadonlyArray<Order>,
): World {
  return {
    ...world,
    pendingOrders: [...pendingOrders],
  } as InternalWorld as World;
}

/**
 * Validate and stage an order on the world. Pure.
 *
 * @param world Current world.
 * @param cmd   Order to stage (any kind).
 * @returns `{ world, result }`. On success, the returned world carries
 *          the staged order in its `pendingOrders` queue (or, for
 *          `surrender`, the player is marked eliminated immediately).
 *          On failure, the returned world is the input unchanged.
 */
export function applyCommand(
  world: Readonly<World>,
  cmd: Order,
): { readonly world: World; readonly result: CommandResult } {
  const result = validateCommand(world, cmd);
  if (!result.ok) {
    return { world, result };
  }

  // Surrender applies immediately (FR-016): mark the player eliminated,
  // emit an EliminationEvent into the world's tick events slot (kept
  // for parity with the tick-pipeline EliminationEvents), and return.
  if (cmd.kind === 'surrender') {
    const nextWorld = markSurrendered(world, cmd.player);
    // Note: we don't stage surrender in pendingOrders (it's been
    // applied immediately). The next tick() will see the eliminated
    // status and detect the terminal condition.
    void emptyTickEvents();
    void pushEliminationEvent;
    return { world: nextWorld, result: { ok: true } };
  }

  // All other order kinds: stage in pendingOrders.
  const pending = readPendingOrders(world);
  const nextWorld = withPendingOrders(world, [...pending, cmd]);
  return { world: nextWorld, result: { ok: true } };
}

/**
 * Return a new `World` with the given player's status set to
 * `'eliminated'` (FR-016). All other fields are unchanged. Pure.
 *
 * The player is identified by `PlayerId`; the function throws if no
 * matching player is found (this is unreachable when called from
 * `applyCommand` because `validateSurrender` already verified the
 * player exists).
 */
function markSurrendered(world: Readonly<World>, player: PlayerId): World {
  const updatedPlayers: Player[] = world.players.map((p) =>
    p.id === player ? { ...p, status: 'eliminated' as const } : p,
  );
  const nextWorld: World = {
    ...world,
    players: Object.freeze(updatedPlayers),
  };
  // Preserve the pendingOrders field if present.
  const pending = (world as InternalWorld).pendingOrders;
  if (pending !== undefined) {
    return withPendingOrders(nextWorld, pending);
  }
  return nextWorld;
}
