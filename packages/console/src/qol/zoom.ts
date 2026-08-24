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
 *   screen = pan + cell × zoom          (forward)
 *   cell   = (screen − pan) / zoom      (inverse / hit-testing)
 *
 * Constraints enforced here:
 *   - `zoom` ∈ [camera.minZoom, camera.maxZoom] ([12, 96] by
 *     default per CONSOLE_CONSTANTS);
 *   - `pan.x` ∈ [−(maxZoom × 2), boardWidth × zoom], same for y —
 *     the board can never be panned entirely off-screen.
 *
 * Zoom-toward-cursor anchoring: the board point under the cursor is
 * held stationary (`boardPt = (cursor − pan)/zoom`;
 * `pan' = cursor − boardPt × newZoom`), so content does not swim
 * under the pointer. Input targeting stays accurate at every zoom
 * level because hit-test reads the SAME transform (verified in
 * tests/unit/qol/zoom.test.ts).
 *
 * Purity: the camera math is pure; only the controller touches DOM.
 *
 * JSDoc references: US5 AC-1 + data-model.md §4 + FR-010.
 */

import type { ConsoleStore } from '../state/store';
import type { CameraState, ScreenPoint } from '../state/types';

/**
 * Multiplicative zoom step per wheel notch. 1.15 ≈ a comfortable
 * browser-map feel; applied symmetrically (÷1.15 zooms out).
 * Module-level tunable: the single definition point for this number.
 */
export const ZOOM_WHEEL_STEP = 1.15;

/** Board dimensions the pan clamp needs (cells). */
export interface BoardBounds {
    readonly width: number;
    readonly height: number;
}

/**
 * Clamp a camera to the contractual zoom range and pan window
 * (data-model.md §4). Pure.
 *
 * @param camera Candidate camera.
 * @param board  Board dimensions in cells.
 */
export function clampCamera(camera: CameraState, board: BoardBounds): CameraState {
    const { minZoom, maxZoom } = camera;
    const zoom = Math.min(maxZoom, Math.max(minZoom, camera.zoom));
    const minX = -(maxZoom * 2);
    const maxX = board.width * zoom;
    const minY = -(maxZoom * 2);
    const maxY = board.height * zoom;
    return {
        ...camera,
        zoom,
        pan: {
            x: Math.min(maxX, Math.max(minX, camera.pan.x)),
            y: Math.min(maxY, Math.max(minY, camera.pan.y)),
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
 */
export function zoomedCamera(
    camera: CameraState,
    deltaY: number,
    cursor: ScreenPoint,
    board: BoardBounds,
): CameraState {
    const factor = deltaY < 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP;
    const rawZoom = camera.zoom * factor;
    const zoom = Math.min(camera.maxZoom, Math.max(camera.minZoom, rawZoom));
    // Hold the board point under the cursor stationary.
    const boardX = (cursor.x - camera.pan.x) / camera.zoom;
    const boardY = (cursor.y - camera.pan.y) / camera.zoom;
    return clampCamera(
        {
            ...camera,
            zoom,
            pan: { x: cursor.x - boardX * zoom, y: cursor.y - boardY * zoom },
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
            const next = zoomedCamera(state.camera, event.deltaY, this.relativePoint(event), {
                width: size,
                height: size,
            });
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
