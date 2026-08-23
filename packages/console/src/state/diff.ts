/**
 * Cell-change diffing — Feature 005 (T025).
 *
 * Computes which visible cells changed between two render snapshots
 * so the renderer can flash changed cells (`changedThisTick`, ~200 ms
 * highlight per data-model.md §3) and screen readers can be told what
 * moved. Comparison covers every gameplay-relevant field: troops,
 * owner, pipes, reservesPct, isCity, cityOwner (data-model.md §17
 * test invariants).
 *
 * Pure. O(n) over the visible cells of the next snapshot.
 */

import type { CellRenderInfo } from './types';

/**
 * Return the set of coord keys whose render-relevant fields differ
 * between `prev` and `next`. Keys present in only one map count as
 * changed (a cell entering or leaving the visibility horizon is a
 * change the renderer must paint).
 *
 * @param prev Previous snapshot's cell map (may be empty on first frame).
 * @param next Next snapshot's cell map.
 * @returns Coord keys (`coordKey` format) whose cells changed.
 */
export function diffCellChanges(
  prev: ReadonlyMap<string, CellRenderInfo>,
  next: ReadonlyMap<string, CellRenderInfo>,
): ReadonlySet<string> {
  const changed = new Set<string>();

  for (const [key, nextInfo] of next) {
    const prevInfo = prev.get(key);
    if (prevInfo === undefined || cellDiffers(prevInfo, nextInfo)) {
      changed.add(key);
    }
  }

  // Cells that vanished from view (left the horizon) are changes too.
  for (const key of prev.keys()) {
    if (!next.has(key)) {
      changed.add(key);
    }
  }

  return changed;
}

/**
 * Field-wise comparison of two render infos. Pure predicate.
 */
function cellDiffers(a: CellRenderInfo, b: CellRenderInfo): boolean {
  return (
    a.troops !== b.troops ||
    a.owner !== b.owner ||
    a.reservesPct !== b.reservesPct ||
    a.isCity !== b.isCity ||
    a.cityOwner !== b.cityOwner ||
    !pipesEqual(a.pipes, b.pipes)
  );
}

/**
 * Set equality for pipe directions (size check + membership probe).
 */
function pipesEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const direction of a) {
    if (!b.has(direction)) {
      return false;
    }
  }
  return true;
}
