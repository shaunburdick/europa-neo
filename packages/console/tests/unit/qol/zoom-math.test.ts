/**
 * Zoom/pan camera math unit tests — Feature 005 (US5 AC-1, T097
 * coverage). Covers clamp edges, cursor-anchored zoom in both wheel
 * directions, and pan clamping.
 */

import { describe, expect, it } from 'vitest';

import {
  type BoardBounds,
  clampCamera,
  pannedCamera,
  ZOOM_WHEEL_STEP,
  zoomedCamera,
} from '../../../src/qol/zoom';
import type { CameraState } from '../../../src/state/types';

const BASE: CameraState = {
  zoom: 32,
  pan: { x: 0, y: 0 },
  minZoom: 12,
  maxZoom: 96,
};
const BOARD: BoardBounds = { width: 32, height: 32 };

describe('clampCamera', () => {
  it('clamps zoom to [minZoom, maxZoom] and pans to the board window', () => {
    const clamped = clampCamera({ ...BASE, zoom: 500, pan: { x: -9999, y: 99999 } }, BOARD);
    expect(clamped.zoom).toBe(96);
    expect(clamped.pan.x).toBe(-(96 * 2));
    expect(clamped.pan.y).toBe(32 * 96);
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
    expect(runaway.pan.x).toBe(32 * 32);
    expect(runaway.pan.y).toBe(-(96 * 2));
  });
});
