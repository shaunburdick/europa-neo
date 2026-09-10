/**
 * Component tests: per-cell renderer — Feature 005 (T040).
 *
 * Covers data-model.md §3 visual contract: water renders blue, land
 * is elevation-shaded, cities carry a distinct outline, pipes render
 * as edge triangles, reserves render as a small badge.
 *
 * Runs in Vitest Browser Mode (real Chromium) so computed styles and
 * CSS triangles are evaluated by a real engine.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';

import '../../../src/styles/index.css';
import { DEFAULT_CAMERA } from '../../../src/config';
import { CellView } from '../../../src/render/cell-view';
import type { CellRenderInfo, PlayerId } from '../../../src/state/types';

/** Minimal player-color map for CellView tests. */
const TEST_PLAYER_COLORS: ReadonlyMap<PlayerId, string> = new Map([
    ['1' as PlayerId, '#dc2626'],
    ['2' as PlayerId, '#2563eb'],
]);

/** Render one cell and return its root element. */
async function renderCell(info: CellRenderInfo): Promise<HTMLElement> {
    const screen = await render(
        <div role="row">
            <CellView info={info} camera={DEFAULT_CAMERA} playerColors={TEST_PLAYER_COLORS} />
        </div>,
    );
    const el = screen.container.querySelector('[role="gridcell"]');
    if (el === null) {
        throw new Error('CellView did not render a gridcell element');
    }
    return el;
}

afterEach(() => {
    cleanup();
});

describe('CellView (T040 / data-model §3)', () => {
    test('water cells render with transparent background (canvas handles terrain color)', async () => {
        const el = await renderCell({
            coord: { x: 2, y: 9 },
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

        // DOM cell is transparent — terrain coloring comes from the canvas layer.
        expect(getComputedStyle(el).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        // A11y label still encodes terrain type.
        expect(el.getAttribute('aria-label')).toContain('Cell (2, 9)');
    });

    test('land cells render with transparent background (canvas handles terrain color)', async () => {
        const high = await renderCell({
            coord: { x: 0, y: 0 },
            elevation: 200,
            terrain: 'land',
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
        const low = await renderCell({
            coord: { x: 1, y: 0 },
            elevation: 0,
            terrain: 'land',
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

        // Both DOM cells are transparent — terrain shading comes from the canvas layer.
        expect(getComputedStyle(high).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(getComputedStyle(low).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        // A11y labels still encode coordinates.
        expect(high.getAttribute('aria-label')).toContain('Cell (0, 0)');
        expect(low.getAttribute('aria-label')).toContain('Cell (1, 0)');
    });

    test('city cells render with a distinct outline', async () => {
        const city = await renderCell({
            coord: { x: 5, y: 5 },
            elevation: 40,
            terrain: 'land',
            troops: 10,
            owner: 1,
            isCity: true,
            cityOwner: 1,
            pipes: new Set(),
            pipeSlopes: new Map(),
            pipeIntensities: new Map(),
            reservesPct: 0,
            changedThisTick: false,
        });
        const plain = await renderCell({
            coord: { x: 6, y: 5 },
            elevation: 40,
            terrain: 'land',
            troops: 10,
            owner: 1,
            isCity: false,
            cityOwner: null,
            pipes: new Set(),
            pipeSlopes: new Map(),
            pipeIntensities: new Map(),
            reservesPct: 0,
            changedThisTick: false,
        });

        const cityOutline = getComputedStyle(city).outlineStyle;
        const plainOutline = getComputedStyle(plain).outlineStyle;
        expect(cityOutline).not.toBe('none');
        expect(parseFloat(getComputedStyle(city).outlineWidth)).toBeGreaterThan(0);
        expect(plainOutline).toBe('none');
    });

    test('pipe directions render as edge triangles', async () => {
        const el = await renderCell({
            coord: { x: 3, y: 8 },
            elevation: 50,
            terrain: 'land',
            troops: 7,
            owner: 1,
            isCity: false,
            cityOwner: null,
            pipes: new Set(['N', 'E']),
            pipeSlopes: new Map([
                ['N', 'flat'],
                ['E', 'flat'],
            ]),
            pipeIntensities: new Map([
                ['N', 0],
                ['E', 0],
            ]),
            reservesPct: 0,
            changedThisTick: false,
        });

        const north = el.querySelector('.europa-pipe--N');
        const east = el.querySelector('.europa-pipe--E');
        expect(north).not.toBeNull();
        expect(east).not.toBeNull();
        // N/E triangles rendered via clip-path + background (no CSS borders).
        expect(getComputedStyle(north as Element).clipPath).toContain('polygon');
        expect(getComputedStyle(east as Element).clipPath).toContain('polygon');
        // No S/W indicators for directions that are not piped.
        expect(el.querySelector('.europa-pipe--S')).toBeNull();
        expect(el.querySelector('.europa-pipe--W')).toBeNull();
    });

    test('pipe triangles have dark drop-shadow outline (spec 024 AC-016)', async () => {
        const el = await renderCell({
            coord: { x: 3, y: 8 },
            elevation: 50,
            terrain: 'land',
            troops: 7,
            owner: 1,
            isCity: false,
            cityOwner: null,
            pipes: new Set(['N', 'E']),
            pipeSlopes: new Map([
                ['N', 'downhill'],
                ['E', 'uphill'],
            ]),
            pipeIntensities: new Map([
                ['N', 0.5],
                ['E', 0.5],
            ]),
            reservesPct: 0,
            changedThisTick: false,
        });

        const north = el.querySelector('.europa-pipe--N') as Element;
        const east = el.querySelector('.europa-pipe--E') as Element;
        expect(north).not.toBeNull();
        expect(east).not.toBeNull();

        // The CSS rule .europa-pipe applies filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.7))
        // to guarantee contrast against any biome background (spec 024 FR-021).
        const northFilter = getComputedStyle(north).filter;
        const eastFilter = getComputedStyle(east).filter;
        expect(northFilter).toContain('drop-shadow');
        expect(eastFilter).toContain('drop-shadow');
    });

    test('reserves percentage renders as a small badge', async () => {
        const el = await renderCell({
            coord: { x: 4, y: 4 },
            elevation: 60,
            terrain: 'land',
            troops: 12,
            owner: 1,
            isCity: false,
            cityOwner: null,
            pipes: new Set(),
            pipeSlopes: new Map(),
            pipeIntensities: new Map(),
            reservesPct: 7,
            changedThisTick: false,
        });

        const badge = el.querySelector('.europa-cell__reserves');
        expect(badge?.textContent).toBe('70%');
        const height = parseFloat(getComputedStyle(badge as Element).height);
        expect(height).toBeLessThan(DEFAULT_CAMERA.zoom / 2); // "small"
    });
});
