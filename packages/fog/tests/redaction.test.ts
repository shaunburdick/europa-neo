/**
 * SC-001 Protocol-Level Redaction Test — Feature 002 (T033)
 *
 * A 500-tick scripted match where friendly stacks appear, move, and
 * are destroyed. For every tick, `computePlayerView` is audited
 * against an INDEPENDENTLY-computed expected visible set (built from
 * the raw state arrays + the fixture's Chebyshev-disk oracle — not
 * from `computeVisibleSet`):
 *
 *   (a) zero leakage: every `visibleCell.coord` is in that tick's
 *       expected set (and the sets match exactly);
 *   (b) the `events` field contains no out-of-horizon cell-level
 *       events;
 *   (c) `visibleCells` is row-major with no duplicates;
 *   (d) the no-memory rule holds across all 500 consecutive ticks —
 *       each tick's view equals a per-tick oracle that knows nothing
 *       about prior ticks, so carried-over state is impossible.
 *
 * The engine's `tick()` advances state; scripted placements between
 * ticks use the same typed-array clone mutation path combat and
 * movement use. A summary (`cells observed / leaked: 0`) rides on
 * the final assertion message instead of console output.
 */

import type { Coord, PlayerId, World } from '@europa/engine';

import { tick } from '@europa/engine';
import { describe, expect, it } from 'vitest';
import { computePlayerView } from '../src/playerView';
import { chebyshevDisk } from '../src/range';
import { buildWorldWithTroops, withVisibilityRadius } from './fixtures/world';

/** Quickstart scenario radius (Chebyshev range 3). */
const RADIUS = 3;

/** Tick count per plan.md's protocol-level assertion. */
const TICKS = 500;

/** Placement tuple: `[x, y, player, count]`. */
type Placement = readonly [number, number, PlayerId, number];

/**
 * Rebuild a world's troop arrays from an explicit placement list
 * (the same clone-mutation path the engine's resolution uses).
 *
 * @param world      Source world (not mutated).
 * @param placements Full placement list for BOTH players.
 * @returns A new `World` with exactly these troops.
 */
function applyPlacements(world: Readonly<World>, placements: readonly Placement[]): World {
  const size = world.board.width;
  const owners = new Uint8Array(size * size);
  const counts = new Uint32Array(size * size);
  for (const [x, y, player, count] of placements) {
    owners[y * size + x] = player;
    counts[y * size + x] = count;
  }
  return { ...world, state: { ...world.state, troopOwners: owners, troopCounts: counts } };
}

/**
 * Independent visibility oracle: scan the raw state arrays for
 * player-1 viewers (owner === 1 && count > 0), union their
 * bounds-clipped Chebyshev disks, sort row-major. Shares NO code
 * with `computeVisibleSet` beyond the fixture-level disk helper.
 *
 * @param world  The world snapshot to audit.
 * @returns Row-major, duplicate-free `Coord[]` of expected cells.
 */
function expectedVisibleCoords(world: Readonly<World>): Coord[] {
  const { width, height } = world.board;
  const seen = new Set<number>();
  const out: Coord[] = [];
  const { troopCounts, troopOwners } = world.state;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if ((troopOwners[idx] ?? 0) !== 1) {
        continue;
      }
      if ((troopCounts[idx] ?? 0) <= 0) {
        continue;
      }
      for (const coord of chebyshevDisk({ x, y }, RADIUS, width, height)) {
        const key = coord.y * width + coord.x;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(coord);
        }
      }
    }
  }
  // Row-major canonical order (disks were unioned per-viewer).
  out.sort((a, b) => a.y * width + a.x - (b.y * width + b.x));
  return out;
}

describe('SC-001 protocol-level redaction over a 500-tick scripted match', () => {
  it(`audits every tick for ${TICKS} ticks: zero leakage, ordered cells, filtered events`, () => {
    // Script cycles: stacks appear → move → split → one destroyed →
    // respawn elsewhere. Both players always keep ≥ 1 stack so the
    // engine never eliminates anyone mid-run.
    const scripts: readonly (readonly Placement[])[] = [
      [
        [8, 8, 1, 4],
        [3, 3, 2, 2],
      ],
      [
        [10, 10, 1, 4],
        [5, 5, 2, 2],
      ],
      [
        [8, 8, 1, 4],
        [12, 12, 1, 6],
        [3, 3, 2, 2],
      ],
      [
        [8, 8, 1, 0], // destroyed by "combat"
        [12, 12, 1, 6],
        [14, 14, 2, 2],
      ],
      [
        [0, 15, 1, 9], // respawns at the far corner
        [12, 12, 1, 6],
        [14, 14, 2, 2],
      ],
    ];

    let world = withVisibilityRadius(buildWorldWithTroops(16, [...(scripts[0] ?? [])]), RADIUS);

    let totalCellsObserved = 0;
    let leakedCells = 0;
    let leakedEvents = 0;

    for (let t = 0; t < TICKS; t++) {
      // Scripted change every 10 ticks (cycle through the scripts).
      if (t > 0 && t % 10 === 0) {
        const script = scripts[Math.floor(t / 10) % scripts.length];
        if (script) {
          world = applyPlacements(world, script);
        }
      }

      // Advance with the REAL engine tick (PRNG, production, combat).
      const { world: nextWorld, events } = tick(world);
      world = nextWorld;

      // Per-tick independent oracle (knows nothing about other ticks).
      const expected = expectedVisibleCoords(world);
      const expectedKeys = new Set(expected.map((c) => c.y * world.board.width + c.x));

      const view = computePlayerView(world, 1, { events });

      // (a) Zero leakage — exact set equality against the oracle.
      expect(view.visibleCells).toHaveLength(expected.length);
      for (const cell of view.visibleCells) {
        totalCellsObserved++;
        if (!expectedKeys.has(cell.coord.y * world.board.width + cell.coord.x)) {
          leakedCells++;
        }
      }

      // (b) No out-of-horizon cell-level events survive filtering.
      for (const event of view.events.combat) {
        if (!expectedKeys.has(event.cell.y * world.board.width + event.cell.x)) {
          leakedEvents++;
        }
      }
      for (const event of view.events.captures) {
        if (!expectedKeys.has(event.cell.y * world.board.width + event.cell.x)) {
          leakedEvents++;
        }
      }

      // (c) Row-major strictly increasing flat keys → no duplicates.
      let lastKey = -1;
      for (const cell of view.visibleCells) {
        const key = cell.coord.y * world.board.width + cell.coord.x;
        expect(key).toBeGreaterThan(lastKey);
        lastKey = key;
      }
    }

    // (d) No-memory: enforced structurally — each tick was compared
    // against a fresh per-tick oracle; any recall would have broken
    // the exact-equality check above.
    expect(
      leakedCells,
      `${String(totalCellsObserved)} cells observed / leaked: ${String(leakedCells)}`,
    ).toBe(0);
    expect(leakedEvents, `out-of-horizon events leaked: ${String(leakedEvents)}`).toBe(0);
  });
});
