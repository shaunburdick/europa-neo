/**
 * Read helpers — Feature 001, T026
 *
 * Pure, allocation-light decoders that expose a friendly view over the
 * flat `WorldState` typed arrays. These are the API consumers (UI/fog)
 * prefer; the resolution rules themselves stay on the raw arrays for
 * perf.
 *
 * Helpers:
 *   - `getCell(world, x, y)`             → CellView at one cell
 *   - `forEachCell(world, visit)`        → row-major iteration, early-exit on `false`
 *   - `cellsInRange(world, center, r)`   → Chebyshev ball, in-bounds only
 *   - `neighborsOf(world, coord)`        → 4-way in-bounds neighbors with direction
 *   - `getPlayer(world, id)`             → Player by PlayerId
 *   - `alivePlayers(world)`              → list of PlayerIds with status 'alive'
 *
 * All functions are pure. `forEachCell`'s callback may mutate the
 * caller's state; the engine itself is untouched.
 */

import type { CellView, Coord, Direction, Player, PlayerId, ReservesPct, World } from './types';

// Pipe mask bits (match the contract's WorldState docs).
const N_BIT = 0x01;
const E_BIT = 0x02;
const S_BIT = 0x04;
const W_BIT = 0x08;

const DIRECTIONS: ReadonlyArray<readonly [Direction, number, number]> = [
  ['N', 0, -1],
  ['E', 1, 0],
  ['S', 0, 1],
  ['W', -1, 0],
];

/**
 * Decode a single cell into a `CellView`. O(1).
 */
export function getCell(world: Readonly<World>, x: number, y: number): CellView {
  const w = world.board.width;
  const idx = y * w + x;
  const cell = world.board.cells[idx];
  if (cell === undefined) {
    throw new Error(`getCell: cell [${String(x)},${String(y)}] not found`);
  }
  const mask = world.state.pipeMasks[idx] ?? 0;
  const pipes = new Set<Direction>();
  if ((mask & N_BIT) !== 0) pipes.add('N');
  if ((mask & E_BIT) !== 0) pipes.add('E');
  if ((mask & S_BIT) !== 0) pipes.add('S');
  if ((mask & W_BIT) !== 0) pipes.add('W');

  const ownerByte = world.state.troopOwners[idx] ?? 0;
  const cityByte = world.state.cityOwners[idx] ?? 0;
  const reservesByte = world.state.reservesPct[idx] ?? 0;

  return {
    coord: { x, y },
    cell,
    troopCount: world.state.troopCounts[idx] ?? 0,
    troopOwner: ownerByte === 0 ? null : (ownerByte as PlayerId),
    pipes,
    reservesPercent: reservesByte as ReservesPct,
    cityOwner: cityByte === 0 ? null : (cityByte as PlayerId),
  };
}

/**
 * Iterate every cell in row-major order. The callback receives each
 * `CellView`; returning `false` stops iteration early.
 */
export function forEachCell(
  world: Readonly<World>,
  visit: (view: CellView) => boolean | undefined,
): void {
  const w = world.board.width;
  const h = world.board.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const view = getCell(world, x, y);
      const result = visit(view);
      if (result === false) return;
    }
  }
}

/**
 * Cells within Chebyshev range `r` of `center` (inclusive). Out-of-board
 * cells are omitted; the returned array preserves a stable row-major
 * order so consumers can iterate deterministically.
 */
export function cellsInRange(
  world: Readonly<World>,
  center: Coord,
  r: number,
): ReadonlyArray<Coord> {
  const w = world.board.width;
  const h = world.board.height;
  const radius = Math.max(0, r | 0);
  const minX = Math.max(0, center.x - radius);
  const maxX = Math.min(w - 1, center.x + radius);
  const minY = Math.max(0, center.y - radius);
  const maxY = Math.min(h - 1, center.y + radius);
  const out: Coord[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      out.push({ x, y });
    }
  }
  return out;
}

/**
 * In-bounds 4-way neighbors of `coord`, each tagged with the direction
 * the neighbor sits in relative to `coord`. Order: N, E, S, W.
 */
export function neighborsOf(
  world: Readonly<World>,
  coord: Coord,
): ReadonlyArray<{ readonly direction: Direction; readonly coord: Coord }> {
  const w = world.board.width;
  const h = world.board.height;
  const out: { direction: Direction; coord: Coord }[] = [];
  for (const [dir, dx, dy] of DIRECTIONS) {
    const nx = coord.x + dx;
    const ny = coord.y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    out.push({ direction: dir, coord: { x: nx, y: ny } });
  }
  return out;
}

/**
 * Player lookup by `PlayerId` (1-indexed; `players[id - 1]`).
 */
export function getPlayer(world: Readonly<World>, id: PlayerId): Player {
  const idx = id - 1;
  const player = world.players[idx];
  if (player === undefined) {
    throw new Error(`getPlayer: no player with id ${String(id)}`);
  }
  return player;
}

/**
 * PlayerIds whose status is `'alive'`. Order matches `world.players`.
 */
export function alivePlayers(world: Readonly<World>): ReadonlyArray<PlayerId> {
  const ids: PlayerId[] = [];
  for (const p of world.players) {
    if (p.status === 'alive') ids.push(p.id);
  }
  return ids;
}
