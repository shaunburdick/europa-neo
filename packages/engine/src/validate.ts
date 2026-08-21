/**
 * Order validation — Feature 001, T024 + US4 + US5
 *
 * Pure `validateCommand(world, cmd): CommandResult`.
 *
 * Validates every `Order` kind against the world. Returns
 * `{ ok: true }` if the order would be accepted; otherwise
 * `{ ok: false, reason }` with a typed `ValidationError` per FR-018.
 *
 * **Validation rules covered**:
 *   - `OrderSetPipe`:           out-of-bounds target, water target,
 *                               source not owned by player.
 *   - `OrderClearPipe`:         source not owned by player.
 *   - `OrderSetPipesExclusive`: source not owned by player.
 *   - `OrderClearAllPipes`:     source not owned by player.
 *   - `OrderSetReserves`:       source not owned by player, percent invalid.
 *   - `OrderParatroop` (US4):   out-of-bounds target, water target,
 *                               source not owned by player,
 *                               source has insufficient troops (above
 *                               reserves floor), Chebyshev range > 2.
 *   - `OrderGun` (US4):         out-of-bounds target, source not owned
 *                               by player, source has insufficient troops
 *                               (above reserves floor).
 *   - `OrderSurrender` (US5):   player is already eliminated/surrendered
 *                               → `already_surrendered` error.
 *
 * **Why no "source has troops" check for pipe commands?** Setting a
 * pipe is a marking operation; it doesn't spend troops. US1 keeps
 * this lenient so a freshly-created city (no troops at tick 0) can
 * still wire up outgoing pipes on its first turn. US4 adds the
 * `no_source_troops` check for paratroop/gun, which DO spend troops.
 *
 * **Where the destination is computed**: pipe orders carry a `cell`
 * (the source). The destination is `(cell.x + dx, cell.y + dy)` where
 * `(dx, dy)` is the direction's offset.
 *
 * **Reserves-aware spending**: paratroop and gun compute the same
 * reserves-floor as `resolveDecay` (fallback mode: `count - count *
 * (10 - reservesPct) / 10`). If the source cell can't spend the
 * required troops ABOVE its floor, validation rejects with
 * `no_source_troops`.
 */

import { ENGINE_CONSTANTS } from './constants';
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

const PARATROOP_MAX_RANGE = 2;

/**
 * Validate an order against the world without staging it.
 *
 * @returns `{ ok: true }` if the order is valid or
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
    case 'setReserves':
      return validateSetReserves(world, cmd.cell, cmd.percent, cmd.player);
    case 'paratroop':
      return validateParatroop(world, cmd.source, cmd.target, cmd.player);
    case 'gun':
      return validateGun(world, cmd.source, cmd.target, cmd.player);
    case 'surrender':
      return validateSurrender(world, cmd.player);
  }
}

/**
 * Validate `setPipe`: source in-bounds + owned by player;
 * destination in-bounds + land.
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
 * Validate `setReserves`: source owned by player + percent ∈ 0..9.
 */
function validateSetReserves(
  world: Readonly<World>,
  cell: Coord,
  percent: number,
  player: PlayerId,
): CommandResult {
  if (!Number.isInteger(percent) || percent < 0 || percent > 9) {
    return fail({ kind: 'invalid_percent', percent });
  }
  return validateSourceOwnership(world, cell, player);
}

/**
 * Validate `OrderParatroop` per FR-013 + FR-018:
 *   - source in-bounds + owned by player
 *   - target in-bounds + land
 *   - Chebyshev distance ≤ 2
 *   - source has ≥ 2 × `paratroopCost` troops ABOVE its reserves floor
 */
function validateParatroop(
  world: Readonly<World>,
  source: Coord,
  target: Coord,
  player: PlayerId,
): CommandResult {
  // Source in-bounds + ownership.
  const sourceCheck = validateSourceOwnership(world, source, player);
  if (!sourceCheck.ok) return sourceCheck;

  const w = world.board.width;
  const h = world.board.height;
  // Target in-bounds.
  if (
    !Number.isInteger(target.x) ||
    !Number.isInteger(target.y) ||
    target.x < 0 ||
    target.x >= w ||
    target.y < 0 ||
    target.y >= h
  ) {
    return fail({ kind: 'out_of_bounds', coord: target });
  }
  // Target not water.
  const targetCell = world.board.cells[target.y * w + target.x];
  if (targetCell === undefined || targetCell.terrain !== 'land') {
    return fail({ kind: 'water_target', coord: target });
  }
  // Range check (Chebyshev ≤ 2).
  const dx = Math.abs(target.x - source.x);
  const dy = Math.abs(target.y - source.y);
  const distance = dx > dy ? dx : dy;
  if (distance > PARATROOP_MAX_RANGE) {
    return fail({ kind: 'paratroop_range', source, target, distance });
  }
  // Source troop check (above reserves floor).
  const sourceIdx = source.y * w + source.x;
  const sourceCount = world.state.troopCounts[sourceIdx] ?? 0;
  const reservesPct = (world.state.reservesPct[sourceIdx] ?? 0) >>> 0;
  const floor = computeReservesFloor(sourceCount, reservesPct);
  const sourceSpend = Math.imul(ENGINE_CONSTANTS.paratroopCost, 2) >>> 0;
  const usableAboveFloor = (sourceCount - floor) >>> 0;
  if (usableAboveFloor < sourceSpend) {
    return fail({ kind: 'no_source_troops', coord: source });
  }
  return { ok: true };
}

/**
 * Validate `OrderGun` per FR-014 + FR-018:
 *   - source in-bounds + owned by player
 *   - target in-bounds
 *   - source has ≥ `gunCost` troops ABOVE its reserves floor
 */
function validateGun(
  world: Readonly<World>,
  source: Coord,
  target: Coord,
  player: PlayerId,
): CommandResult {
  // Source in-bounds + ownership.
  const sourceCheck = validateSourceOwnership(world, source, player);
  if (!sourceCheck.ok) return sourceCheck;

  const w = world.board.width;
  const h = world.board.height;
  // Target in-bounds.
  if (
    !Number.isInteger(target.x) ||
    !Number.isInteger(target.y) ||
    target.x < 0 ||
    target.x >= w ||
    target.y < 0 ||
    target.y >= h
  ) {
    return fail({ kind: 'out_of_bounds', coord: target });
  }
  // Source troop check (above reserves floor).
  const sourceIdx = source.y * w + source.x;
  const sourceCount = world.state.troopCounts[sourceIdx] ?? 0;
  const reservesPct = (world.state.reservesPct[sourceIdx] ?? 0) >>> 0;
  const floor = computeReservesFloor(sourceCount, reservesPct);
  const usableAboveFloor = (sourceCount - floor) >>> 0;
  if (usableAboveFloor < ENGINE_CONSTANTS.gunCost) {
    return fail({ kind: 'no_source_troops', coord: source });
  }
  return { ok: true };
}

/**
 * Validate `OrderSurrender` per FR-016:
 *   - player exists and isn't already eliminated/surrendered.
 */
function validateSurrender(world: Readonly<World>, player: PlayerId): CommandResult {
  const found = world.players.find((p) => p.id === player);
  if (found === undefined) {
    return fail({ kind: 'unknown_player', player });
  }
  if (found.status === 'eliminated' || found.status === 'surrendered') {
    return fail({ kind: 'already_surrendered', player });
  }
  return { ok: true };
}

/**
 * Generic in-bounds + ownership check for pipe-source orders.
 *
 * A cell is considered "owned by player" if EITHER the cell's
 * `troopOwners` slot OR its `cityOwners` slot is `player`. This lets a
 * freshly-created city (which has no troops at tick 0) still accept
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

/**
 * Compute the reserves floor for a given count and reserves percentage
 * (0..9) using the current-count interpretation (matches resolveDecay's
 * fallback semantics).
 */
function computeReservesFloor(count: number, reserves: number): number {
  if (count <= 0) return 0;
  if (reserves <= 0) return 0;
  if (reserves >= 10) return count;
  const flowable = Math.floor((count * (10 - reserves)) / 10);
  return count - flowable;
}

// Re-export CellView so consumers don't need to also import `types.ts`
// just to type their result. (Kept internal to the engine API surface.)
export type { CellView };
