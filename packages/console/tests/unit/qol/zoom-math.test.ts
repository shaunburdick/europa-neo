/**
 * Zoom/pan camera math unit tests — Feature 005 (US5 AC-1, T097
 * coverage). Covers clamp edges, cursor-anchored zoom in both wheel
 * directions, and pan clamping.
 */

import { describe, expect, it } from 'vitest';

import {
    type BoardBounds,
    clampCamera,
    effectiveMaxZoom,
    panForCellCenter,
    pannedCamera,
    ZOOM_WHEEL_STEP,
    zoomedCamera,
} from '../../../src/qol/zoom';
import { computeViewportOffset } from '../../../src/render/viewport-offset';
import type { CameraState, Coord } from '../../../src/state/types';

const BASE: CameraState = {
    zoom: 32,
    pan: { x: 0, y: 0 },
    minZoom: 32,
    maxZoom: 96,
};
const BOARD: BoardBounds = { width: 32, height: 32 };

describe('clampCamera', () => {
    it('clamps zoom to [minZoom, maxZoom] and pans to the board window', () => {
        const clamped = clampCamera({ ...BASE, zoom: 500, pan: { x: -9999, y: 99999 } }, BOARD);
        expect(clamped.zoom).toBe(96);
        expect(clamped.pan.x).toBe(-(32 / 2 - 0.5) * 96);
        expect(clamped.pan.y).toBe((32 / 2 - 0.5) * 96);
    });

    it('leaves in-range cameras untouched', () => {
        expect(clampCamera(BASE, BOARD)).toEqual(BASE);
    });
});

describe('zoomedCamera', () => {
    it('zooms in on scroll-up and holds the cursor point stationary', () => {
        const cursor = { x: 64, y: 64 };
        const next = zoomedCamera(BASE, -100, cursor, BOARD);
        expect(next.zoom).toBeCloseTo(32 * ZOOM_WHEEL_STEP);
        // Board point under the cursor before == after.
        const boardXBefore = (cursor.x - BASE.pan.x) / BASE.zoom;
        const boardXAfter = (cursor.x - next.pan.x) / next.zoom;
        expect(boardXAfter).toBeCloseTo(boardXBefore);
    });

    it('zooms out on scroll-down and never crosses the zoom floor', () => {
        let camera = BASE;
        for (let i = 0; i < 20; i += 1) {
            camera = zoomedCamera(camera, 100, { x: 0, y: 0 }, BOARD);
        }
        expect(camera.zoom).toBe(BASE.minZoom);
    });

    it('never exceeds the zoom ceiling', () => {
        let camera = BASE;
        for (let i = 0; i < 20; i += 1) {
            camera = zoomedCamera(camera, -100, { x: 0, y: 0 }, BOARD);
        }
        expect(camera.zoom).toBe(BASE.maxZoom);
    });
});

describe('pannedCamera', () => {
    it('pans by the drag delta and clamps to the board window', () => {
        const panned = pannedCamera(BASE, 50, -20, BOARD);
        expect(panned.pan).toEqual({ x: 50, y: -20 });
        const runaway = pannedCamera(BASE, 1e6, -1e6, BOARD);
        expect(runaway.pan.x).toBe((32 / 2 - 0.5) * 32);
        expect(runaway.pan.y).toBe(-(32 / 2 - 0.5) * 32);
    });
});

describe('fit camera geometry', () => {
    it('keeps the physical zoom ceiling and limits fit-relative maximum', () => {
        expect(BASE.minZoom).toBe(32);
        expect(BASE.maxZoom).toBe(96);
        expect(effectiveMaxZoom(20)).toBe(60);
        expect(effectiveMaxZoom(32)).toBe(96);
        expect(effectiveMaxZoom(80)).toBe(96);
    });

    it.each([
        [{ width: 700, height: 400 }],
        [{ width: 400, height: 700 }],
        [{ width: 900, height: 900 }],
        [{ width: 400, height: 400 }],
    ] as const)('centers all corner-cell centers for viewport %o', (viewport) => {
        const corners: readonly Coord[] = [
            { x: 0, y: 0 },
            { x: 31, y: 0 },
            { x: 0, y: 31 },
            { x: 31, y: 31 },
        ];
        for (const cell of corners) {
            const pan = panForCellCenter(cell, BASE.zoom, BOARD);
            const offset = computeViewportOffset(BASE.zoom, pan, BOARD, viewport.width, viewport.height);
            const screenX = (cell.x + 0.5) * BASE.zoom - offset.x;
            const screenY = (cell.y + 0.5) * BASE.zoom - offset.y;
            expect(Math.abs(screenX - viewport.width / 2)).toBeLessThanOrEqual(1);
            expect(Math.abs(screenY - viewport.height / 2)).toBeLessThanOrEqual(1);
        }
    });

    it('allows pan to center corners on both fitting and overflowing axes', () => {
        const pan = panForCellCenter({ x: 0, y: 0 }, BASE.zoom, BOARD);
        const clamped = clampCamera({ ...BASE, pan }, BOARD);
        expect(clamped.pan).toEqual(pan);
    });
});
