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
 * `kind` alphabetical) and applies their effects. The queue is held
 * in a private `WeakMap` side-table keyed by the `World` object
 * reference, NOT in module state, so the engine remains pure across
 * parallel calls (each `World` value owns its own queue; old worlds
 * are garbage-collected and their entries cleaned up automatically).
 *
 * **Why a WeakMap side-table?** The contract's `World` interface is
 * fixed (no `pendingOrders` field). Storing the queue in a `WeakMap`
 * keyed by `World` keeps it off the contract surface while preserving
 * object identity semantics — every `World` returned from this module
 * is associated with its own queue, and the queue is unreachable once
 * the `World` is dropped.
 *
 * **Surrender (FR-016)**: surrender orders apply IMMEDIATELY on
 * `applyCommand` (not deferred to the next tick) — the player is
 * marked `'eliminated'` in the returned `world.players`, and the
 * next `tick()` will detect the terminal condition. This matches the
 * spec's "forces removed or rendered inert" requirement.
 */

import type { CommandResult, Order, Player, PlayerId, World } from './types';
import { validateCommand } from './validate';

/**
 * Private side-table: maps a `World` object reference to its pending
 * orders queue. Module-scoped so it cannot leak across test cases
 * (each test creates fresh worlds). WeakMap keyed by `World` ensures
 * automatic cleanup when a world is garbage-collected.
 *
 * NOT part of the public API surface; not re-exported via the engine
 * barrel.
 */
const pendingOrdersTable = new WeakMap<World, readonly Order[]>();

/**
 * Read pending orders off a `World`. Returns an empty array if the
 * world has no staged orders (defensive — worlds built without going
 * through `applyCommand` won't have an entry).
 */
export function readPendingOrders(world: Readonly<World>): readonly Order[] {
    // The cast to `World` is required because TypeScript's WeakMap typing
    // uses `object`, and our `Readonly<World>` flows from `World`. The
    // cast is identity-preserving (no runtime conversion).
    return pendingOrdersTable.get(world as World) ?? [];
}

/**
 * Attach a pending-orders queue to a `World`, returning the same
 * reference with the side-table populated. The `World` object identity
 * is preserved — no new object is created — which lets downstream
 * modules continue to use the returned reference as the canonical
 * "next world".
 */
export function withPendingOrders(world: Readonly<World>, pendingOrders: readonly Order[]): World {
    pendingOrdersTable.set(world as World, [...pendingOrders]);
    return world as World;
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

    // Surrender applies immediately (FR-016): mark the player eliminated
    // and return. The next tick() will detect the terminal condition via
    // resolveTerminal (which emits the EliminationEvent for the tick
    // pipeline). Surrender is NOT staged in pendingOrders — its effect is
    // durable in the returned world, no tick drain required.
    if (cmd.kind === 'surrender') {
        const nextWorld = markSurrendered(world, cmd.player);
        return { world: nextWorld, result: { ok: true } };
    }

    // All other order kinds: stage in pendingOrders. The side-table
    // attached to `world` is appended with the new order; the world
    // reference itself is unchanged (so concurrent snapshots stay valid).
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
    // Preserve the pendingOrders side-table if present.
    const pending = readPendingOrders(world);
    if (pending.length > 0) {
        return withPendingOrders(nextWorld, pending);
    }
    return nextWorld;
}
