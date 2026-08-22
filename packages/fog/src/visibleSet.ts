/**
 * Visibility Horizon — Feature 002, US1 (T027)
 *
 * `computeVisibleSet` is the core of the fog package: given a `World`
 * snapshot and a player, it returns every cell within Chebyshev range
 * `visibilityRadius` of ANY of that player's troop stacks.
 *
 * Algorithm (per `research.md` §1 and `contracts/fog-api.ts` JSDoc):
 *   1. Iterate `world.state.troopOwners` row-major (y outer, x inner);
 *      collect viewers where `troopOwners[i] === player &&
 *      troopCounts[i] > 0`. Cities do NOT project vision (spec US1
 *      Edge Case "city ownership") — vision derives from troop
 *      presence only.
 *   2. Allocate a fresh binary `FogMask` (zero-init) per call — the
 *      no-memory rule (spec FR-004 / US2): nothing survives between
 *      calls, so previously seen cells can never leak into the output.
 *   3. For each viewer, mark every cell within Chebyshev range using
 *      the engine's `cellsInRange` (bounds-clipped, row-major order).
 *   4. Iterate the mask row-major and emit each marked cell's `Coord`.
 *
 * Determinism (spec FR-007): identical `(world, player,
 * visibilityRadius)` produces byte-identical output. Row-major
 * iteration everywhere; integer-only math; no wall-clock, no PRNG,
 * no Set/Map iteration in the output path (constitution Principle II).
 *
 * Signature conforms to feature 001's `engine-to-fog.ts`
 * `computeVisibleSet` declaration (structurally assignable; verified
 * by `tests/conformance.test.ts`). The parameter is accepted as
 * optional so callers may omit it, in which case the match config's
 * `visibilityRadius` is used (falling back to
 * `FOG_CONSTANTS.defaultRadiusFallback` defensively).
 */

import type { Coord, PlayerId, World } from '@europa/engine';
import { cellsInRange } from '@europa/engine';

import { FOG_CONSTANTS } from './constants';
import { createMask, isVisible as isCellMarked } from './mask';
import type { VisibleSet } from './types';

/**
 * Resolve the effective sensor radius for a world snapshot.
 *
 * Prefers the explicit argument, then the match config's
 * `visibilityRadius` (the engine guarantees it is populated), then
 * the defensive `FOG_CONSTANTS.defaultRadiusFallback`. Non-integer
 * inputs are floored via bitwise truncation to mirror the engine's
 * `cellsInRange` normalization (`r | 0`).
 *
 * @param visibilityRadius Explicit radius from the caller, if any.
 * @param world            The world snapshot (source of the config
 *                         default).
 * @returns A non-negative integer radius.
 */
function resolveRadius(visibilityRadius: number | undefined, world: Readonly<World>): number {
  const raw =
    visibilityRadius ?? world.config.visibilityRadius ?? FOG_CONSTANTS.defaultRadiusFallback;
  // Truncate + clamp to mirror the engine's `cellsInRange` handling
  // (`Math.max(0, r | 0)`); keeps fog's horizon identical to the
  // engine's range helper for any numeric input.
  return Math.max(0, raw | 0);
}

/**
 * Compute the per-player `VisibleSet` for one tick. Pure.
 *
 * The result is the union of the Chebyshev disks (radius
 * `visibilityRadius`) centered on every troop stack owned by
 * `player` with `troopCount > 0`. Cells are emitted in row-major
 * order with no duplicates. Destroyed stacks (`troopCount === 0`)
 * project nothing; cities alone project nothing (spec US1 Edge
 * Cases).
 *
 * JSDoc references: FR-001 (per-player visible set from troop
 * positions), FR-007 (deterministic), FR-008 (uniform radius),
 * US1 AC-1 (lone stack horizon), US1 AC-2 (multi-stack union).
 *
 * @param world            The current `World` snapshot (from
 *                         `tick()`).
 * @param player           The player whose visibility is computed.
 * @param visibilityRadius Sensor radius in cells (Chebyshev).
 *                         Optional; defaults to
 *                         `world.config.visibilityRadius`.
 * @returns A `VisibleSet` containing every cell visible to `player`
 *         this tick, row-major, no duplicates.
 */
export function computeVisibleSet(
  world: Readonly<World>,
  player: PlayerId,
  visibilityRadius?: number,
): VisibleSet {
  const width = world.board.width;
  const height = world.board.height;
  const radius = resolveRadius(visibilityRadius, world);

  // Fresh zero-init mask per call — the structural no-memory rule
  // (FR-004): there is no recall state anywhere in the pipeline.
  const mask = createMask(width, height);
  const { troopCounts, troopOwners } = world.state;

  // Pass 1 — mark horizons. Row-major scan over owners; each viewer
  // stamps its bounds-clipped Chebyshev disk into the shared mask.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if ((troopOwners[idx] ?? 0) !== player) continue;
      if ((troopCounts[idx] ?? 0) <= 0) continue;
      const cells = cellsInRange(world, { x, y }, radius);
      for (const cell of cells) {
        mask.data[cell.y * width + cell.x] = FOG_CONSTANTS.maskVisible;
      }
    }
  }

  // Pass 2 — collect marks row-major. Duplicate-free by
  // construction (each flat index is visited exactly once).
  const visibleCells: Coord[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isCellMarked(mask, x, y)) {
        visibleCells.push({ x, y });
      }
    }
  }

  return { player, tick: world.tick, visibleCells };
}
