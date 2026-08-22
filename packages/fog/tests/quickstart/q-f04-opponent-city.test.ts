/**
 * Quickstart Q-F04 — Opponent city visibility (Feature 002, T026)
 *
 * Per quickstart.md §2 Q-F04:
 *   - Opponent city inside the viewer's horizon exposes the full
 *     cell data including `cityOwner`.
 *   - Opponent city outside the horizon is absent from
 *     `visibleCells`.
 */

import type { PlayerId, World } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/index';
import { buildWorldWithCities, withVisibilityRadius } from '../fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

/**
 * Place a single viewer stack on a copy of `world` using the same
 * typed-array clone mutation path the engine's combat/movement
 * resolution uses. Cities on the board are untouched.
 *
 * @param world  Source world (not mutated).
 * @param x      Stack x.
 * @param y      Stack y.
 * @param player Owning player.
 * @param count  Stack size (> 0).
 * @returns A new `World` with the stack placed.
 */
function placeStack(
  world: Readonly<World>,
  x: number,
  y: number,
  player: PlayerId,
  count: number,
): World {
  const owners = new Uint8Array(world.state.troopOwners);
  const counts = new Uint32Array(world.state.troopCounts);
  owners[y * world.board.width + x] = player;
  counts[y * world.board.width + x] = count;
  return { ...world, state: { ...world.state, troopOwners: owners, troopCounts: counts } };
}

describe('Q-F04 — opponent city in/out of the horizon', () => {
  it('opponent city at (10,8) inside the horizon exposes full cell data incl. cityOwner', () => {
    // Opponent city on the board + a viewer stack for player 1.
    const based = withVisibilityRadius(buildWorldWithCities(16, [[10, 8, 2]]), RADIUS);
    const world = placeStack(based, 8, 8, 1, 5);

    const view = computePlayerView(world, 1);
    const city = view.visibleCells.find((c) => c.coord.x === 10 && c.coord.y === 8);
    expect(city).toBeDefined();
    expect(city?.cityOwner).toBe(2);
    expect(city?.cell.terrain).toBe('land');
    expect(city?.troopCount).toBe(0);
    expect(city?.troopOwner).toBeNull();
  });

  it('opponent city at (15,15) outside the horizon is absent from visibleCells', () => {
    const based = withVisibilityRadius(buildWorldWithCities(16, [[15, 15, 2]]), RADIUS);
    const world = placeStack(based, 8, 8, 1, 5);

    const view = computePlayerView(world, 1);
    expect(view.visibleCells.find((c) => c.coord.x === 15 && c.coord.y === 15)).toBeUndefined();
  });
});
