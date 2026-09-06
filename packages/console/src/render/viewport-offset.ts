/**
 * Viewport offset computation — issue #76.
 *
 * Pure function extracting the shared coordinate-transform logic used
 * by both the render layer (canvas paint, grid overlay transform) and
 * the input layer (hit-testing, zoom-toward-cursor).
 *
 * The viewport offset is the board-space position of the container's
 * top-left corner. When the board is smaller than the container it
 * centers the board; when the board is larger it follows pan.
 *
 * Coordinate contract (data-model.md §4, extended):
 *   screen = -viewportOffset + cell × zoom   (forward)
 *   cell   = (screen + viewportOffset) / zoom (inverse)
 */

import type { ScreenPoint } from '../state/types';

/**
 * Compute the viewport offset — the position of board cell (0, 0)
 * in container/screen coordinates. Both the canvas painter and the
 * DOM grid overlay use this to position cells, and the input layer
 * needs it to correctly map screen clicks back to board coordinates.
 *
 * When the board is smaller than the container, the offset centers
 * the board. When the board is larger, the offset follows pan
 * (`viewportOffset = -pan`).
 *
 * @param zoom           Camera zoom (cell size in CSS pixels).
 * @param pan            Camera pan offset.
 * @param boardCells     Board dimension in cells (square boards).
 * @param containerWidth Container width in CSS pixels.
 * @param containerHeight Container height in CSS pixels.
 */
export function computeViewportOffset(
    zoom: number,
    pan: ScreenPoint,
    boardCells: number,
    containerWidth: number,
    containerHeight: number,
): ScreenPoint {
    const boardPx = boardCells * zoom;
    const offX = boardPx < containerWidth ? -(containerWidth - boardPx) / 2 : -pan.x;
    const offY = boardPx < containerHeight ? -(containerHeight - boardPx) / 2 : -pan.y;
    return { x: offX, y: offY };
}
