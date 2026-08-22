/**
 * Acceptance Tests: US2 — No Memory of Previously Seen Terrain
 * Feature 002 (T032)
 *
 * Covers the two spec US2 acceptance scenarios end-to-end:
 *
 *   AC-1: Given a cell was visible last tick because a friendly
 *         stack occupied it, When that stack is destroyed by combat,
 *         Then next tick's view for that player contains no data for
 *         that cell.
 *   AC-2: Given a friendly stack marches out of range of a region,
 *         When the tick resolves, Then the region reverts to unknown
 *         for that player.
 *
 * State transitions are modeled with the same mutation path combat
 * and movement use: fresh typed-array clones of `world.state`
 * (destroy = count → 0; march = owner/count moved to a new cell).
 */

import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../../src/playerView';
import { isVisible } from '../../src/utils';
import { buildWorldWithTroops, withVisibilityRadius } from '../fixtures/world';

/** Scenario radius per quickstart Q-F01/Q-F03 (Chebyshev range 3). */
const RADIUS = 3;

describe('US2 — No Memory of Previously Seen Terrain', () => {
  it('AC-1: Given a cell was visible last tick because a friendly stack occupied it, When that stack is destroyed by combat, Then next tick\u2019s view for that player contains no data for that cell', () => {
    const before = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
    const viewBefore = computePlayerView(before, 1);
    expect(isVisible(viewBefore, { x: 8, y: 8 })).toBe(true);

    // Destroy the stack (combat resolution zeroes the count).
    const counts = new Uint32Array(before.state.troopCounts);
    counts[8 * 16 + 8] = 0;
    const after = {
      ...before,
      tick: before.tick + 1,
      state: { ...before.state, troopCounts: counts },
    };

    const viewAfter = computePlayerView(after, 1);
    expect(viewAfter.visibleCells).toHaveLength(0);
    // No data for that cell — not even stale terrain.
    expect(viewAfter.visibleCells.find((c) => c.coord.x === 8 && c.coord.y === 8)).toBeUndefined();
    expect(isVisible(viewAfter, { x: 8, y: 8 })).toBe(false);
  });

  it('AC-2: Given a friendly stack marches out of range of a region, When the tick resolves, Then the region reverts to unknown for that player', () => {
    // Tick t: stack at (8,8) sees the region around it…
    const atTickT = withVisibilityRadius(buildWorldWithTroops(16, [[8, 8, 1, 5]]), RADIUS);
    const viewT = computePlayerView(atTickT, 1);
    expect(isVisible(viewT, { x: 5, y: 5 })).toBe(true);

    // …tick t+1: the same stack has marched to (15,15).
    const owners = new Uint8Array(atTickT.state.troopOwners);
    const counts = new Uint32Array(atTickT.state.troopCounts);
    owners[8 * 16 + 8] = 0;
    counts[8 * 16 + 8] = 0;
    owners[15 * 16 + 15] = 1;
    counts[15 * 16 + 15] = 5;
    const atTickTPlus1 = {
      ...atTickT,
      tick: atTickT.tick + 1,
      state: { ...atTickT.state, troopOwners: owners, troopCounts: counts },
    };

    const viewTPlus1 = computePlayerView(atTickTPlus1, 1);
    // The old region reverted to unknown…
    expect(isVisible(viewTPlus1, { x: 5, y: 5 })).toBe(false);
    expect(isVisible(viewTPlus1, { x: 8, y: 8 })).toBe(false);
    // …and the new position projects its own horizon.
    expect(isVisible(viewTPlus1, { x: 15, y: 15 })).toBe(true);
    expect(isVisible(viewTPlus1, { x: 12, y: 12 })).toBe(true);
  });
});
