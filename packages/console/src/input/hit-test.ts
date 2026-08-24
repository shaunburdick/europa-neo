/**
 * Pointer hit-testing — Feature 005 (T032).
 *
 * Pure math translating a screen point (CSS pixels) into the cell +
 * region + subcell it targets (data-model.md §4 coordinate mapping,
 * research.md §7). No DOM access; the input layer calls this on every
 * `pointermove` and dispatches the result.
 *
 * Region classification assigns the cursor to its nearest cell edge. This
 * gives each cardinal direction a usable area instead of making N/S a
 * zero-width centerline. Equal-distance corners use the contract tie-break:
 * horizontal edges win, and the exact center maps to N.
 *
 * Spec reference: US2 AC-1 (region-based pipe targeting).
 */

import type { CameraState, CellRegion, Coord, CursorTarget, Direction, ScreenPoint } from '../state/types';

/**
 * Resolve a cell-local position `(subcellX, subcellY)` in `[0, 1)`
 * to the `CellRegion` a pipe click targets. Pure.
 *
 * The nearest edge wins. Equal-distance points use the horizontal edge
 * first (W/E), while the exact center maps to N (upper half wins ties).
 *
 * @param subcellX 0..1 across the cell width (0 = west edge).
 * @param subcellY 0..1 across the cell height (0 = north edge).
 */
export function regionFromSubcell(subcellX: number, subcellY: number): CellRegion {
    const horizontalDistance = Math.abs(subcellX - 0.5);
    const verticalDistance = Math.abs(subcellY - 0.5);

    if (horizontalDistance === 0 && verticalDistance === 0) {
        return 'N';
    }
    if (horizontalDistance >= verticalDistance) {
        return subcellX < 0.5 ? 'W' : 'E';
    }
    return subcellY <= 0.5 ? 'N' : 'S';
}

/**
 * Map a `CellRegion` to the engine `Direction` its pipe order targets.
 * Identity by design — regions ARE directions in the original game's
 * geometry. Pure.
 */
export function directionFromRegion(region: CellRegion): Direction {
    return region;
}

/**
 * Map an engine `Direction` back to its `CellRegion`. Inverse of
 * {@link directionFromRegion}. Pure.
 */
export function regionFromDirection(direction: Direction): CellRegion {
    return direction;
}

/**
 * Hit-test a screen point against the camera transform. Pure.
 *
 * Inverse mapping (data-model.md §4):
 *   cell.x = floor((screen.x - pan.x) / zoom)
 *   subcellX = ((screen.x - pan.x) / zoom) - cell.x   // [0, 1)
 *
 * Points left of or above the board origin yield `cell: null` (the
 * cursor is over chrome / void); negative cells are never returned.
 *
 * @param screen Screen-space point (CSS pixels, canvas top-left origin).
 * @param camera Current camera (zoom = px per cell, pan = board offset).
 */
export function hitTest(screen: ScreenPoint, camera: CameraState): CursorTarget {
    const boardX = (screen.x - camera.pan.x) / camera.zoom;
    const boardY = (screen.y - camera.pan.y) / camera.zoom;

    const cellX = Math.floor(boardX);
    const cellY = Math.floor(boardY);

    if (cellX < 0 || cellY < 0 || !Number.isFinite(cellX) || !Number.isFinite(cellY)) {
        return { screen, cell: null, region: null, subcell: null };
    }

    const cell: Coord = { x: cellX, y: cellY };
    const subcell = { x: boardX - cellX, y: boardY - cellY };

    return {
        screen,
        cell,
        region: regionFromSubcell(subcell.x, subcell.y),
        subcell,
    };
}
