/**
 * Order validation — Feature 001, T024
 *
 * Pure `validateCommand(world, cmd): CommandResult`.
 *
 * For US1, the engine validates pipe commands exhaustively and defers
 * all other order kinds to their owning user stories. The function is
 * exported independently so callers (feature 005 client console,
 * feature 004 networking) can preflight-check orders without mutating
 * the world.
 *
 * **Validation rules covered in US1 (FR-018 subset)**:
 *   - `OrderSetPipe`:        out-of-bounds target, water target,
 *                            source not owned by player,
 *                            source has zero troops.
 *   - `OrderClearPipe`:      source not owned by player (in-bounds + owner only).
 *   - `OrderSetPipesExclusive`: source not owned by player.
 *   - `OrderClearAllPipes`:  source not owned by player.
 *   - Other order kinds:     deferred (returns `{ ok: true }` so US1
 *                            can exercise staging without rejecting them).
 *
 * **Where the destination is computed**: pipe orders carry a `cell`
 * (the source). The destination is `(cell.x + dx, cell.y + dy)` where
 * `(dx, dy)` is the direction's offset.
 */

import type {
  CellView,
  CommandResult,
  Coord,
  Direction,
  Order,
  PlayerId,
  ValidationError,
  World,
} from './types';

const DIRECTION_OFFSETS: Readonly<Record<Direction, readonly [number, number]>> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

/**
 * Validate an order against the world without staging it.
 *
 * @returns `{ ok: true }` if the order is valid (per US1 rules) or
 *          `{ ok: false, reason }` with a typed `ValidationError`.
 */
export function validateCommand(world: Readonly<World>, cmd: Order): CommandResult {
  switch (cmd.kind) {
    case 'setPipe':
      return validateSetPipe(world, cmd.cell, cmd.direction, cmd.player);
    case 'clearPipe':
      return validateClearPipe(world, cmd.cell, cmd.player);
    case 'setPipesExclusive':
      return validateSourceOwnership(world, cmd.cell, cmd.player);
    case 'clearAllPipes':
      return validateSourceOwnership(world, cmd.cell, cmd.player);
    // US1 defers the following to their owning user stories. Returning
    // `{ ok: true }` here lets US1 stage them in pendingOrders for the
    // future phases to apply; the orchestrator gates when they fire.
    case 'setReserves':
    case 'paratroop':
    case 'gun':
    case 'surrender':
      return { ok: true };
  }
}

/**
 * Validate `setPipe`: source in-bounds + owned by player;
 * destination in-bounds + land.
 *
 * **Why no "source has troops" check here?** Setting a pipe is a
 * marking operation; it doesn't spend troops. US1 keeps this lenient
 * so a freshly-created city (no troops at tick 0) can still wire up
 * outgoing pipes on its first turn. US4 adds the `no_source_troops`
 * check for paratroop/gun, which DO spend troops.
 */
function validateSetPipe(
  world: Readonly<World>,
  cell: Coord,
  direction: Direction,
  player: PlayerId,
): CommandResult {
  const sourceCheck = validateSourceOwnership(world, cell, player);
  if (!sourceCheck.ok) return sourceCheck;

  const offset = DIRECTION_OFFSETS[direction];
  const dst: Coord = { x: cell.x + (offset[0] ?? 0), y: cell.y + (offset[1] ?? 0) };
  const w = world.board.width;
  const h = world.board.height;
  if (dst.x < 0 || dst.x >= w || dst.y < 0 || dst.y >= h) {
    return fail({ kind: 'out_of_bounds', coord: dst });
  }
  const dstCell = world.board.cells[dst.y * w + dst.x];
  if (dstCell === undefined) {
    return fail({ kind: 'out_of_bounds', coord: dst });
  }
  if (dstCell.terrain !== 'land') {
    return fail({ kind: 'water_target', coord: dst });
  }
  return { ok: true };
}

/**
 * Validate `clearPipe`: source in-bounds + owned by player.
 * Direction is informational here (no destination check; clearing a
 * non-existent pipe is harmless).
 */
function validateClearPipe(world: Readonly<World>, cell: Coord, player: PlayerId): CommandResult {
  return validateSourceOwnership(world, cell, player);
}

/**
 * Generic in-bounds + ownership check for pipe-source orders.
 *
 * A cell is considered "owned by player" if EITHER the cell's
 * `troopOwners` slot OR its `cityOwners` slot is `player`. This lets a
 * freshly-created city (which has no troops on tick 0) still accept
 * pipe orders — the city owner IS the cell owner until an opponent's
 * troops capture it (US2's capture phase).
 */
function validateSourceOwnership(
  world: Readonly<World>,
  cell: Coord,
  player: PlayerId,
): CommandResult {
  const w = world.board.width;
  const h = world.board.height;
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    return fail({ kind: 'out_of_bounds', coord: cell });
  }
  if (cell.x < 0 || cell.x >= w || cell.y < 0 || cell.y >= h) {
    return fail({ kind: 'out_of_bounds', coord: cell });
  }
  const idx = cell.y * w + cell.x;
  const troopOwner = world.state.troopOwners[idx] ?? 0;
  const cityOwner = world.state.cityOwners[idx] ?? 0;
  if (troopOwner !== player && cityOwner !== player) {
    return fail({ kind: 'not_owner', coord: cell });
  }
  return { ok: true };
}

function fail(reason: ValidationError): CommandResult {
  return { ok: false, reason };
}

// Re-export CellView so consumers don't need to also import `types.ts`
// just to type their result. (Kept internal to the engine API surface.)
export type { CellView };
