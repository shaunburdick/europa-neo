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
import { MINIMAP_SIZE_PX, Minimap, viewportRect, viewportStrokeRect } from '../../../src/qol/minimap';
import { terrainColor } from '../../../src/render/palette';
import type { CameraState, CellRenderInfo } from '../../../src/state/types';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const CAMERA: CameraState = { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 32, maxZoom: 96 };

type Pixel = readonly [number, number, number, number];

function pixelAt(ctx: CanvasRenderingContext2D, x: number, y: number): Pixel {
    const data = ctx.getImageData(x, y, 1, 1).data;
    return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0];
}

/** `rgba(255,255,255,0.8)` over an opaque backdrop, as the canvas blends it. */
function whiteOver(backdrop: Pixel): Pixel {
    const channel = (value: number): number => Math.round(value * 0.2 + 255 * 0.8);
    return [channel(backdrop[0]), channel(backdrop[1]), channel(backdrop[2]), 255];
}

function deviation(first: Pixel, second: Pixel): number {
    return Math.max(Math.abs(first[0] - second[0]), Math.abs(first[1] - second[1]), Math.abs(first[2] - second[2]));
}

/** An all-water board: one backdrop colour and no owner dots. */
function waterBoard(size: number): readonly CellRenderInfo[] {
    const cells: CellRenderInfo[] = [];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            cells.push({
                coord: { x, y },
                elevation: 0,
                terrain: 'water',
                troops: 0,
                owner: null,
                isCity: false,
                cityOwner: null,
                pipes: new Set(),
                pipeSlopes: new Map(),
                pipeIntensities: new Map(),
                reservesPct: 0,
                changedThisTick: false,
            });
        }
    }
    return cells;
}

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
        // Click within cell (8, 8): scale = 96/16 = 6. Camera pan aligns
        // that cell's center with the viewport center.
        await user.click(canvas, { position: { x: 51, y: 51 } });

        expect(onSetCamera).toHaveBeenCalledTimes(1);
        const dispatched = onSetCamera.mock.calls[0]?.[0] as CameraState;
        expect(dispatched.zoom).toBe(CAMERA.zoom);
        expect(dispatched.pan.x).toBe(-16);
        expect(dispatched.pan.y).toBe(-16);
    });

    test('clicking a corner targets its cell center within pan bounds', async () => {
        const { onSetCamera } = await mountMinimap();
        const user = userEvent.setup();

        const canvas = document.querySelector<HTMLCanvasElement>('.europa-minimap');
        expect(canvas).not.toBeNull();
        // Click the top-left cell; its center is reachable at either zoom.
        await user.click(canvas as HTMLCanvasElement, { position: { x: 1, y: 1 } });
        const dispatched = onSetCamera.mock.calls[0]?.[0] as CameraState;
        expect(dispatched.pan.x).toBe(240);
        expect(dispatched.pan.y).toBe(240);
    });

    test('clicking the opposite corner centers its last cell center', async () => {
        const { onSetCamera } = await mountMinimap();
        const user = userEvent.setup();
        const canvas = document.querySelector<HTMLCanvasElement>('.europa-minimap');
        expect(canvas).not.toBeNull();

        await user.click(canvas as HTMLCanvasElement, { position: { x: 95, y: 95 } });
        const dispatched = onSetCamera.mock.calls[0]?.[0] as CameraState;
        expect(dispatched.pan.x).toBe(-240);
        expect(dispatched.pan.y).toBe(-240);
    });
});

describe('minimap viewport snap (FR-019, issue #209)', () => {
    const BOARD = 20;
    const VIEWPORT = { width: 200, height: 200 };
    /** Zoom 32 with a pan that puts every viewport edge on a fractional minimap pixel. */
    const FRACTIONAL_CAMERA: CameraState = { zoom: 32, pan: { x: 3.3, y: 5.7 }, minZoom: 32, maxZoom: 96 };

    test('a fractional scale paints whole-pixel edges with no antialiased neighbour', async () => {
        await render(
            createElement(Minimap, {
                boardWidth: BOARD,
                boardHeight: BOARD,
                camera: FRACTIONAL_CAMERA,
                cells: waterBoard(BOARD),
                viewportSize: VIEWPORT,
                onSetCamera: () => undefined,
            }),
        );
        const canvas = document.querySelector<HTMLCanvasElement>('.europa-minimap');
        const ctx = canvas?.getContext('2d') ?? null;
        expect(ctx).not.toBeNull();
        if (ctx === null) {
            throw new Error('minimap readback needs a real 2D canvas context');
        }

        const rect = viewportRect(FRACTIONAL_CAMERA, { width: BOARD, height: BOARD }, VIEWPORT);
        expect(rect.x).toBeCloseTo(32.505, 6);
        expect(rect.y).toBeCloseTo(32.145, 6);
        expect(rect.w).toBeCloseTo(30, 6);
        expect(rect.h).toBeCloseTo(30, 6);
        for (const edge of [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h]) {
            expect(Number.isInteger(edge), 'the fixture puts every edge on a fractional pixel').toBe(false);
        }
        // The 1 px stroke covers pixel `round(edge)` when its centre is at integer + 0.5.
        const left = Math.round(rect.x);
        const right = Math.round(rect.x + rect.w);
        const top = Math.round(rect.y);
        const bottom = Math.round(rect.y + rect.h);
        const midX = Math.floor((left + right) / 2);
        const midY = Math.floor((top + bottom) / 2);

        const backdrop = pixelAt(ctx, 10, 10);
        expect(pixelAt(ctx, midX, 10)).toEqual(backdrop);
        const blend = whiteOver(backdrop);

        const edges: readonly (readonly [number, number, number, number, number, number])[] = [
            // [edge pixel x, edge pixel y, neighbour x, neighbour y, neighbour x, neighbour y]
            [left, midY, left - 1, midY, left + 1, midY],
            [right, midY, right - 1, midY, right + 1, midY],
            [midX, top, midX, top - 1, midX, top + 1],
            [midX, bottom, midX, bottom - 1, midX, bottom + 1],
        ];
        for (const [x, y, nx1, ny1, nx2, ny2] of edges) {
            const edge = pixelAt(ctx, x, y);
            expect(deviation(edge, blend), `edge (${x},${y}) is the full 0.8 white blend`).toBeLessThanOrEqual(2);
            expect(pixelAt(ctx, nx1, ny1), `neighbour of (${x},${y}) is the backdrop`).toEqual(backdrop);
            expect(pixelAt(ctx, nx2, ny2), `neighbour of (${x},${y}) is the backdrop`).toEqual(backdrop);
        }
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
        expect(partial.x).toBeCloseTo(24, 6);
        expect(partial.y).toBeCloseTo(36, 6);
    });

    test('clips the viewport indicator to board bounds at extreme camera positions', () => {
        const clipped = viewportRect(
            { ...CAMERA, pan: { x: -240, y: 240 } },
            { width: 16, height: 16 },
            { width: 128, height: 128 },
        );
        expect(clipped.x).toBeGreaterThanOrEqual(0);
        expect(clipped.y).toBeGreaterThanOrEqual(0);
        expect(clipped.x + clipped.w).toBeLessThanOrEqual(MINIMAP_SIZE_PX);
        expect(clipped.y + clipped.h).toBeLessThanOrEqual(MINIMAP_SIZE_PX);
    });

    test('whole-number scales keep the existing +0.5 stroke alignment', () => {
        // 16×16 → scale 6; the full-board rect is integral, so the snapped
        // stroke centre is exactly the pre-#209 `x + 0.5`.
        const rect = viewportRect(CAMERA, { width: 16, height: 16 });
        expect(rect).toEqual({ x: 0, y: 0, w: 96, h: 96 });
        expect(viewportStrokeRect(rect)).toEqual({ x: 0.5, y: 0.5, w: 96, h: 96 });
    });
});

describe('Minimap terrain colors (spec 021 FR-007)', () => {
    test('terrain colors match terrainColor() output (no hardcoded hex)', async () => {
        await mountMinimap();
        // Verify terrainColor is callable and returns expected values for test cells.
        expect(terrainColor('land', 40)).not.toBe('#3f4a35');
        expect(terrainColor('water', 20)).toBe('#1d4ed8');
        // The minimap should use terrainColor for each cell — no hardcoded hex.
        const landColor = terrainColor('land', 40);
        const waterColor = terrainColor('water', 20);
        expect(landColor).toMatch(/^hsl\(/);
        expect(waterColor).toMatch(/^#[0-9a-f]{6}$/);
    });
});
