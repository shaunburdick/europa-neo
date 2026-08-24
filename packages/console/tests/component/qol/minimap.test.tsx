/**
 * Minimap component tests — Feature 005 (T074).
 *
 * Covers US5 AC-1: a small canvas showing the full board at thumbnail
 * size; the player's viewport (current camera) is highlighted as a
 * rectangle; clicking the minimap centers the camera on the clicked
 * position.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { MINIMAP_SIZE_PX, Minimap, viewportRect } from '../../../src/qol/minimap';
import type { CameraState, CellRenderInfo } from '../../../src/state/types';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const CAMERA: CameraState = { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 };

/** Two owned cells on a 16×16 board. */
const CELLS: readonly CellRenderInfo[] = [
    {
        coord: { x: 2, y: 3 },
        elevation: 40,
        terrain: 'land',
        troops: 5,
        owner: 1,
        isCity: true,
        cityOwner: 1,
        pipes: new Set(),
        reservesPct: 0,
        changedThisTick: false,
    },
    {
        coord: { x: 10, y: 8 },
        elevation: 20,
        terrain: 'water',
        troops: 0,
        owner: null,
        isCity: false,
        cityOwner: null,
        pipes: new Set(),
        reservesPct: 0,
        changedThisTick: false,
    },
];

async function mountMinimap(camera: CameraState = CAMERA) {
    const onSetCamera = vi.fn();
    await render(
        createElement(Minimap, {
            boardWidth: 16,
            boardHeight: 16,
            camera,
            cells: CELLS,
            onSetCamera,
        }),
    );
    return { onSetCamera };
}

describe('Minimap (T074)', () => {
    test('renders a 96×96 canvas with the contract ARIA', async () => {
        await mountMinimap();
        const canvas = document.querySelector<HTMLCanvasElement>('.europa-minimap');
        expect(canvas).not.toBeNull();
        expect(canvas?.getAttribute('width')).toBe(String(MINIMAP_SIZE_PX));
        expect(canvas?.getAttribute('height')).toBe(String(MINIMAP_SIZE_PX));
        expect(canvas?.getAttribute('role')).toBe('img');
        expect(canvas?.getAttribute('aria-label')).toBe('Minimap');
    });

    test('clicking centers the camera on the clicked cell', async () => {
        const { onSetCamera } = await mountMinimap();
        const user = userEvent.setup();

        const canvas = document.querySelector<HTMLCanvasElement>('.europa-minimap');
        expect(canvas).not.toBeNull();
        // Click the center of board cell (8, 8): scale = 96/16 = 6, so
        // (51, 51) minimap px sits safely inside that cell. Expected pan
        // = viewportCenter − cell × zoom with the default full-board
        // viewport (512×512): 256 − 8×32 = 0.
        await user.click(canvas, { position: { x: 51, y: 51 } });

        expect(onSetCamera).toHaveBeenCalledTimes(1);
        const dispatched = onSetCamera.mock.calls[0]?.[0] as CameraState;
        expect(dispatched.zoom).toBe(CAMERA.zoom);
        expect(dispatched.pan.x).toBe(0);
        expect(dispatched.pan.y).toBe(0);
    });

    test('the dispatched pan is clamped to the visible window', async () => {
        const { onSetCamera } = await mountMinimap();
        const user = userEvent.setup();

        const canvas = document.querySelector<HTMLCanvasElement>('.europa-minimap');
        expect(canvas).not.toBeNull();
        // Click the extreme top-left corner → unclamped pan would be far
        // negative; the clamp keeps it ≥ -(maxZoom*2).
        await user.click(canvas as HTMLCanvasElement, { position: { x: 1, y: 1 } });
        const dispatched = onSetCamera.mock.calls[0]?.[0] as CameraState;
        expect(dispatched.pan.x).toBeGreaterThanOrEqual(-(CAMERA.maxZoom * 2));
        expect(dispatched.pan.y).toBeGreaterThanOrEqual(-(CAMERA.maxZoom * 2));
    });
});

describe('viewportRect (pure geometry)', () => {
    test('maps the screen window into minimap pixels', () => {
        // Default camera: whole board visible → rect covers the minimap.
        const full = viewportRect(CAMERA, { width: 16, height: 16 });
        expect(full).toEqual({ x: 0, y: 0, w: 96, h: 96 });

        // Panned right/down: the window shifts by cells × scale (6 px).
        const panned = viewportRect({ ...CAMERA, pan: { x: -32, y: -64 } }, { width: 16, height: 16 });
        expect(panned.x).toBeCloseTo(6, 6);
        expect(panned.y).toBeCloseTo(12, 6);
    });

    test('a smaller viewport shrinks the rectangle', () => {
        const partial = viewportRect(CAMERA, { width: 16, height: 16 }, { width: 256, height: 128 });
        expect(partial.w).toBeCloseTo((256 / 32) * (96 / 16), 6);
        expect(partial.h).toBeCloseTo((128 / 32) * (96 / 16), 6);
    });
});
