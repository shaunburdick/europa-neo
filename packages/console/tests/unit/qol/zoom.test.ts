/**
 * Zoom/pan unit tests — Feature 005 (T073).
 *
 * Covers US5 AC-1 + data-model.md §4:
 *   · wheel zoom clamps to `[CONSOLE_CONSTANTS.minCellPx,
 *     maxCellPx] = [12, 96]`;
 *   · zoom anchors at the cursor (the board point under the cursor
 *     stays put);
 *   · pan is clamped to keep the board visible
 *     (`pan.x ∈ [-(maxZoom*2), width*zoom]`, same for y);
 *   · input targeting (`hitTest`) remains accurate at every zoom
 *     level (round-trip through the same transform).
 */

import { describe, expect, test } from 'vitest';

import { CONSOLE_CONSTANTS } from '../../../src/config';
import { hitTest } from '../../../src/input/hit-test';
import { clampCamera, pannedCamera, ZOOM_WHEEL_STEP, zoomedCamera } from '../../../src/qol/zoom';
import type { CameraState } from '../../../src/state/types';

/** 16×16 board with the default camera. */
const BOARD = { width: 16, height: 16 };
const BASE: CameraState = { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 };

describe('zoomedCamera', () => {
    test('scroll up zooms in by the wheel step', () => {
        const next = zoomedCamera(BASE, -100, { x: 256, y: 256 }, BOARD);
        expect(next.zoom).toBeCloseTo(32 * ZOOM_WHEEL_STEP, 10);
    });

    test('scroll down zooms out symmetrically', () => {
        const next = zoomedCamera(BASE, 100, { x: 256, y: 256 }, BOARD);
        expect(next.zoom).toBeCloseTo(32 / ZOOM_WHEEL_STEP, 10);
    });

    test('zoom clamps to [minCellPx, maxCellPx]', () => {
        // Near the ceiling one step overshoots into the clamp…
        const maxed = zoomedCamera({ ...BASE, zoom: 90 }, -100, { x: 0, y: 0 }, BOARD);
        expect(maxed.zoom).toBe(CONSOLE_CONSTANTS.maxCellPx);
        const minned = zoomedCamera({ ...BASE, zoom: 13 }, 100, { x: 0, y: 0 }, BOARD);
        expect(minned.zoom).toBe(CONSOLE_CONSTANTS.minCellPx);
        expect(CONSOLE_CONSTANTS.minCellPx).toBe(12);
        expect(CONSOLE_CONSTANTS.maxCellPx).toBe(96);
    });

    test('zoom anchors at the cursor: the board point stays put', () => {
        const cursor = { x: 200, y: 140 };
        const next = zoomedCamera(BASE, -100, cursor, BOARD);
        // Board point under the cursor before…
        const before = hitTest(cursor, BASE);
        // …and after.
        const after = hitTest(cursor, next);
        expect(after.cell).toEqual(before.cell);
        expect(after.subcell?.x).toBeCloseTo(before.subcell?.x ?? 0, 6);
        expect(after.subcell?.y).toBeCloseTo(before.subcell?.y ?? 0, 6);
    });
});

describe('pannedCamera + clampCamera', () => {
    test('pan moves the camera by the drag delta', () => {
        const next = pannedCamera(BASE, -40, 20, BOARD);
        expect(next.pan).toEqual({ x: -40, y: 20 });
    });

    test('pan is clamped to keep the board visible', () => {
        // Far beyond the window in every direction at once.
        const next = pannedCamera(BASE, -100_000, 100_000, BOARD);
        expect(next.pan.x).toBe(-(BASE.maxZoom * 2));
        expect(next.pan.y).toBe(BOARD.height * BASE.zoom);
    });

    test('clampCamera bounds zoom and both pan axes', () => {
        const clamped = clampCamera({ zoom: 500, minZoom: 12, maxZoom: 96, pan: { x: -9999, y: 9999 } }, BOARD);
        expect(clamped.zoom).toBe(96);
        expect(clamped.pan.x).toBe(-192);
        expect(clamped.pan.y).toBe(16 * 96);
    });
});

describe('hitTest accuracy across zoom levels', () => {
    test('the same screen point maps to scaled cells consistently', () => {
        for (const zoom of [CONSOLE_CONSTANTS.minCellPx, 32, CONSOLE_CONSTANTS.maxCellPx]) {
            const camera: CameraState = { ...BASE, zoom };
            const target = { x: 3.5 * zoom, y: 7.25 * zoom };
            const result = hitTest(target, camera);
            expect(result.cell, `zoom ${zoom}`).toEqual({ x: 3, y: 7 });
            expect(result.subcell?.x).toBeCloseTo(0.5, 6);
            expect(result.subcell?.y).toBeCloseTo(0.25, 6);
        }
    });

    test('hit-testing stays correct after a zoom + pan round trip', () => {
        const camera: CameraState = pannedCamera(zoomedCamera(BASE, -100, { x: 128, y: 128 }, BOARD), 30, -15, BOARD);
        // Any point on-screen resolves through the current transform.
        const probe = { x: 200, y: 200 };
        const view = hitTest(probe, camera);
        if (view.cell !== null) {
            // Round trip: forward-map the resolved cell back to screen.
            const screenX = camera.pan.x + (view.cell.x + (view.subcell?.x ?? 0)) * camera.zoom;
            const screenY = camera.pan.y + (view.cell.y + (view.subcell?.y ?? 0)) * camera.zoom;
            expect(screenX).toBeCloseTo(probe.x, 6);
            expect(screenY).toBeCloseTo(probe.y, 6);
        } else {
            // Off-board probes are legal; clamp must keep SOME board visible.
            const rect = viewportOnScreen(camera, BOARD);
            expect(rect.right > 0 && rect.bottom > 0).toBe(true);
        }
    });
});

/** Visible board rectangle on screen (helper for the off-board case). */
function viewportOnScreen(
    camera: CameraState,
    board: { readonly width: number; readonly height: number },
): { left: number; top: number; right: number; bottom: number } {
    return {
        left: camera.pan.x,
        top: camera.pan.y,
        right: camera.pan.x + board.width * camera.zoom,
        bottom: camera.pan.y + board.height * camera.zoom,
    };
}
