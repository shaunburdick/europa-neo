/**
 * Viewport offset computation — issue #76.
 *
 * Pure function extracting the shared coordinate-transform logic used
 * by both the render layer (canvas paint, grid overlay transform) and
 * the input layer (hit-testing, zoom-toward-cursor).
 *
 * The viewport offset is the board-space position of the container's
 * top-left corner. Pan is measured from a board-centered origin on
 * every axis, so fitting boards can expose blank margins at the edges.
 *
 * Coordinate contract (data-model.md §4, extended):
 *   screen = -viewportOffset + cell × zoom   (forward)
 *   cell   = (screen + viewportOffset) / zoom (inverse)
 */

import type { ScreenPoint } from '../state/types';

/**
 * Compute the board-pixel origin at the viewport's top-left. The
 * returned viewportOffset has the opposite sign from the screen-space
 * translation: `screen = cell * zoom - viewportOffset`. Canvas, DOM,
 * minimap, and input consumers all use this shared origin.
 *
 * The unpanned board is centered on each axis. Pan is then subtracted
 * from that board-space origin for both fitting and overflowing axes.
 * Render, hit-test, and minimap share this origin.
 *
 * @param zoom           Camera zoom (cell size in CSS pixels).
 * @param pan            Camera pan offset.
 * @param boardCells     Board dimension in cells (square boards), or
 *                       explicit dimensions for rectangular geometry.
 * @param containerWidth Container width in CSS pixels.
 * @param containerHeight Container height in CSS pixels.
 */
export function computeViewportOffset(
    zoom: number,
    pan: ScreenPoint,
    boardCells: number | { readonly width: number; readonly height: number },
    containerWidth: number,
    containerHeight: number,
): ScreenPoint {
    const width = typeof boardCells === 'number' ? boardCells : boardCells.width;
    const height = typeof boardCells === 'number' ? boardCells : boardCells.height;
    // Camera pan is a CSS-pixel translation relative to the centered
    // board origin; viewportOffset remains board-space for all consumers.
    return {
        x: (width * zoom - containerWidth) / 2 - pan.x,
        y: (height * zoom - containerHeight) / 2 - pan.y,
    };
}
