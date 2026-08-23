/**
 * Visibility horizon filter — Feature 005 (T043).
 *
 * The canonical statement of the fog rule for the render layer
 * (spec FR-001 + data-model.md §2): a cell is rendered **if and only
 * if** it appears in `PlayerView.visibleCells`. Everything else is
 * void — the renderer paints out-of-horizon pixels as empty space and
 * emits no a11y node for them (Phase 3 Independent Test item f).
 *
 * Pure: `PlayerView` in, fresh `ReadonlyMap` out; nothing cached, no
 * clock, no randomness.
 */

import { cellViewToRenderInfo, coordKey } from '../state/build-map-view';
import type { CellRenderInfo, PlayerView } from '../state/types';

/**
 * Filter a fog-filtered `PlayerView` down to the renderable cell set.
 *
 * Returns exactly one `CellRenderInfo` per entry of
 * `view.visibleCells`, keyed by `coordKey(coord)` (`"x,y"`). Cells
 * outside the visibility horizon are absent from the result — the
 * renderer treats their absence as "paint void, emit no gridcell".
 * Duplicate coordinates cannot occur (engine invariant: each coord
 * appears at most once per view), so the map size always equals
 * `view.visibleCells.length`.
 *
 * JSDoc reference: FR-001 (fog-filtered game state rendering) +
 * data-model.md §2 ("cells references only the cells present in
 * latestView.visibleCells") + data-model.md §17 (map-size invariant).
 *
 * @param view The latest fog-filtered view from the server.
 * @returns Coord-keyed render info for every visible cell.
 */
export function filterVisibleCells(view: PlayerView): ReadonlyMap<string, CellRenderInfo> {
  const cells = new Map<string, CellRenderInfo>();
  for (const cellView of view.visibleCells) {
    cells.set(coordKey(cellView.coord), cellViewToRenderInfo(cellView));
  }
  return cells;
}
