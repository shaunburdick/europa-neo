/**
 * Camera zoom + pan — Feature 005 (T080).
 *
 * The US5 navigation layer (spec US5 AC-1, FR-010; data-model.md §4):
 * `wheel` zooms toward the cursor and middle-button drag pans,
 * producing clamped `CameraState` values dispatched as
 * `{ kind: 'setCamera', camera }` — local-only gestures, legal in any
 * connection status.
 *
 * Coordinate contract (data-model.md §4):
 *   screen = cell × zoom − viewportOffset          (forward)
 *   cell   = (screen + viewportOffset) / zoom      (inverse)
 * `viewportOffset` includes the board-centered origin and screen-pixel pan.
 *
 * Constraints enforced here:
 *   - `zoom` ∈ [camera.minZoom, camera.maxZoom];
 *   - each pan axis reaches both corner-cell-center alignments:
 *     `±(boardDimension / 2 − 0.5) × zoom`; board-exterior margins
 *     are allowed on fitting and overflowing axes.
 *
 * Zoom-toward-cursor anchoring: the board point under the cursor is
 * held stationary under the shared viewport transform, so content does not swim
 * under the pointer. Input targeting stays accurate at every zoom
 * level because hit-test reads the SAME transform (verified in
 * tests/unit/qol/zoom.test.ts).
 *
 * Purity: the camera math is pure; only the controller touches DOM.
 *
 * JSDoc references: US5 AC-1 + data-model.md §4 + FR-010.
 */

import { CONSOLE_CONSTANTS } from '../config';
import { computeViewportOffset } from '../render/viewport-offset';
import type { ConsoleStore } from '../state/store';
import type { CameraState, Coord, ScreenPoint } from '../state/types';

/**
 * Multiplicative zoom step per wheel notch. 1.15 ≈ a comfortable
 * browser-map feel; applied symmetrically (÷1.15 zooms out).
 * Module-level tunable: the single definition point for this number.
 */
export const ZOOM_WHEEL_STEP = 1.15;

/** Effective ceiling for a measured fit baseline; the physical max stays fixed. */
export function effectiveMaxZoom(fitZoom: number): number {
    return Math.min(CONSOLE_CONSTANTS.maxCellPx, fitZoom * 3);
}

/**
 * Zoom percentage display layer (issue #76 FR-017): the sidebar
 * indicator shows the camera zoom as a percentage of the measured fit
 * baseline. Physical zoom remains 32–96 CSS px per cell, so the 32px
 * lower bound may prevent a full-board fit; the effective ceiling is
 * `min(96, fitZoom * 3)`. Pure display conversion — `CameraState.zoom`
 * stays in cell-pixels.
 *
 * @param zoom    Camera zoom in cell-pixels.
 * @param fitZoom The fit-zoom level (100% baseline). Typically
 *                measured once by App and passed separately from the
 *                physical `CameraState.minZoom` bound.
 * @returns Rounded percentage (100 for fitZoom, 200 for 2× fitZoom, etc.).
 */
export function zoomPercent(zoom: number, fitZoom: number): number {
    return Math.round((zoom / fitZoom) * 100);
}

/** Board dimensions the pan clamp needs (cells). */
export interface BoardBounds {
    readonly width: number;
    readonly height: number;
}

/**
 * Pan that places a cell center at the viewport center.
 *
 * @param cell Cell index to center.
 * @param zoom Camera zoom in CSS pixels per cell.
 * @param board Board dimensions in cells.
 */
export function panForCellCenter(cell: Coord, zoom: number, board: BoardBounds): ScreenPoint {
    return {
        x: (board.width / 2 - (cell.x + 0.5)) * zoom,
        y: (board.height / 2 - (cell.y + 0.5)) * zoom,
    };
}

/**
 * Board-center anchor in screen space (issue #76 FR-017/FR-018).
 * Keyboard and sidebar-button zoom keep the board center stationary
 * instead of a cursor point, so the visible content does not swim
 * when zooming without a pointer anchor. Pure.
 *
 * @param camera Current camera.
 * @param board  Board dimensions in cells.
 * @param viewportOffset Board-space offset of the container's top-left
 *                       corner under the shared centered-origin transform.
 *                       When omitted, falls back to the legacy pan-only form.
 */
export function boardCenterScreen(
    camera: CameraState,
    board: BoardBounds,
    viewportOffset?: { readonly x: number; readonly y: number },
): {
    readonly x: number;
    readonly y: number;
} {
    const ox = viewportOffset?.x ?? -camera.pan.x;
    const oy = viewportOffset?.y ?? -camera.pan.y;
    return {
        x: -ox + (board.width * camera.zoom) / 2,
        y: -oy + (board.height * camera.zoom) / 2,
    };
}

/**
 * Clamp physical zoom and pan to the range that can place either end
 * cell center at viewport center (data-model.md §4). Pure.
 *
 * @param camera Candidate camera.
 * @param board  Board dimensions in cells.
 */
export function clampCamera(camera: CameraState, board: BoardBounds): CameraState {
    const { minZoom, maxZoom } = camera;
    const zoom = Math.min(maxZoom, Math.max(minZoom, camera.zoom));
    const maxX = Math.max(0, board.width / 2 - 0.5) * zoom;
    const maxY = Math.max(0, board.height / 2 - 0.5) * zoom;
    return {
        ...camera,
        zoom,
        pan: {
            x: Math.min(maxX, Math.max(-maxX, camera.pan.x)),
            y: Math.min(maxY, Math.max(-maxY, camera.pan.y)),
        },
    };
}

/**
 * Compute the camera after one wheel notch at `cursor`. Negative
 * `deltaY` (scroll up) zooms in. The board point under the cursor
 * stays put; the result is clamped via {@link clampCamera}. Pure.
 *
 * @param camera  Current camera.
 * @param deltaY  Raw `WheelEvent.deltaY`.
 * @param cursor  Cursor position in canvas CSS pixels.
 * @param board   Board dimensions in cells.
 * @param viewportOffset Board-space offset of the container's top-left
 *                       corner under the shared centered-origin transform.
 *                       When omitted, falls back to the legacy pan-only form.
 */
export function zoomedCamera(
    camera: CameraState,
    deltaY: number,
    cursor: ScreenPoint,
    board: BoardBounds,
    viewportOffset?: { readonly x: number; readonly y: number },
): CameraState {
    const factor = deltaY < 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP;
    const rawZoom = camera.zoom * factor;
    const zoom = Math.min(camera.maxZoom, Math.max(camera.minZoom, rawZoom));
    // Hold the board point under the cursor stationary.
    // Use viewportOffset for the shared screen→board mapping on both
    // centered and overflowing axes.
    const ox = viewportOffset?.x ?? -camera.pan.x;
    const boardX = (cursor.x + ox) / camera.zoom;
    const oy = viewportOffset?.y ?? -camera.pan.y;
    const boardY = (cursor.y + oy) / camera.zoom;
    // Rebase the centered origin at the new zoom while holding the same
    // board point under the cursor. Omission preserves the legacy
    // pan-only transform for existing helper callers.
    const panX =
        viewportOffset === undefined
            ? cursor.x - boardX * zoom
            : cursor.x - boardX * zoom + camera.pan.x + viewportOffset.x + (board.width * (zoom - camera.zoom)) / 2;
    const panY =
        viewportOffset === undefined
            ? cursor.y - boardY * zoom
            : cursor.y - boardY * zoom + camera.pan.y + viewportOffset.y + (board.height * (zoom - camera.zoom)) / 2;
    return clampCamera(
        {
            ...camera,
            zoom,
            pan: { x: panX, y: panY },
        },
        board,
    );
}

/**
 * Compute the camera after panning by `(dx, dy)` CSS pixels. The
 * result is clamped via {@link clampCamera}. Pure.
 *
 * @param camera Current camera.
 * @param dx     Horizontal drag delta.
 * @param dy     Vertical drag delta.
 * @param board  Board dimensions in cells.
 */
export function pannedCamera(camera: CameraState, dx: number, dy: number, board: BoardBounds): CameraState {
    return clampCamera({ ...camera, pan: { x: camera.pan.x + dx, y: camera.pan.y + dy } }, board);
}

/**
 * Pointer controller binding {@link zoomedCamera} /
 * {@link pannedCamera} to one board-surface element:
 *   - `wheel` → zoom toward the cursor (preventDefault'd so the page
 *     never scrolls mid-aim);
 *   - middle-button `pointerdown` + move → pan (pointer capture keeps
 *     the drag alive outside the element). Middle button is used
 *     because left is the pipe toggle and right is the exclusive-pipe
 *     command (FR-002/FR-003). Attach this controller BEFORE the
 *     region-select layer on the SAME element: pan start calls
 *     `stopImmediatePropagation`, which shields the later-registered
 *     pipe handlers from the pan gesture.
 *
 * Surface note: the ARIA grid overlay (`#map`) is the topmost board
 * layer, so listeners belong on the board AREA that contains both —
 * events on the overlay bubble through it.
 */
export class ZoomPanController {
    private readonly element: HTMLElement;

    private readonly store: ConsoleStore;

    private readonly listeners: Array<() => void> = [];

    private lastPanPoint: ScreenPoint | null = null;

    /**
     * @param element The board-surface element events bind to (the area
     *                covering the canvas, shared with region-select).
     * @param store   Dispatch target + state source.
     */
    constructor(element: HTMLElement, store: ConsoleStore) {
        this.element = element;
        this.store = store;
    }

    /** Attach all listeners. Returns a disposer. */
    attach(): { readonly dispose: () => void } {
        const wheelHandler = (event: WheelEvent): void => {
            event.preventDefault();
            const state = this.store.getState();
            if (state.latestView === null) {
                return;
            }
            const size = state.latestView.config.boardSize;
            const rect = this.element.getBoundingClientRect();
            const viewportOffset = computeViewportOffset(
                state.camera.zoom,
                state.camera.pan,
                size,
                rect.width,
                rect.height,
            );
            const next = zoomedCamera(
                state.camera,
                event.deltaY,
                this.relativePoint(event),
                {
                    width: size,
                    height: size,
                },
                viewportOffset,
            );
            this.store.dispatch({ kind: 'setCamera', camera: next });
        };

        const downHandler = (event: PointerEvent): void => {
            // Only the middle button pans (left = pipe toggle, right =
            // exclusive pipe). Halt the gesture for every later listener on
            // this element so region-select never turns a pan start into an
            // exclusive-pipe click.
            if (event.button !== 1) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            this.lastPanPoint = this.relativePoint(event);
            this.element.setPointerCapture(event.pointerId);

            const moveHandler = (moveEvent: PointerEvent): void => {
                if (this.lastPanPoint === null) {
                    return;
                }
                const point = this.relativePoint(moveEvent);
                const dx = point.x - this.lastPanPoint.x;
                const dy = point.y - this.lastPanPoint.y;
                this.lastPanPoint = point;
                const state = this.store.getState();
                if (state.latestView === null || (dx === 0 && dy === 0)) {
                    return;
                }
                const size = state.latestView.config.boardSize;
                this.store.dispatch({
                    kind: 'setCamera',
                    camera: pannedCamera(state.camera, dx, dy, { width: size, height: size }),
                });
            };
            const upHandler = (): void => {
                this.lastPanPoint = null;
                this.element.removeEventListener('pointermove', moveHandler);
                this.element.removeEventListener('pointerup', upHandler);
                this.element.removeEventListener('pointercancel', upHandler);
            };
            this.element.addEventListener('pointermove', moveHandler);
            this.element.addEventListener('pointerup', upHandler);
            this.element.addEventListener('pointercancel', upHandler);
        };

        this.element.addEventListener('wheel', wheelHandler, { passive: false });
        this.element.addEventListener('pointerdown', downHandler);
        this.listeners.push(
            () => this.element.removeEventListener('wheel', wheelHandler),
            () => this.element.removeEventListener('pointerdown', downHandler),
        );
        return {
            dispose: () => {
                for (const off of this.listeners) {
                    off();
                }
                this.listeners.length = 0;
                this.lastPanPoint = null;
            },
        };
    }

    /** Translate a client-space event to an element-relative point. */
    private relativePoint(event: WheelEvent | PointerEvent): ScreenPoint {
        const rect = this.element.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
}
