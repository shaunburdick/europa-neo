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
import { DEFAULT_CAMERA, DEFAULT_PLAYER_COLORS } from '../../../src/config';
import { CellView } from '../../../src/render/cell-view';
import { WATER_COLOR } from '../../../src/render/palette';
import type { CellRenderInfo } from '../../../src/state/types';

/** Render one cell and return its root element. */
async function renderCell(info: CellRenderInfo): Promise<HTMLElement> {
    const screen = await render(
        <div role="row">
            <CellView info={info} camera={DEFAULT_CAMERA} playerColors={DEFAULT_PLAYER_COLORS} />
        </div>,
    );
    const el = screen.container.querySelector('[role="gridcell"]');
    if (el === null) {
        throw new Error('CellView did not render a gridcell element');
    }
    return el;
}

/** Parse an `rgb(...)`/`rgba(...)` computed color into channels. */
function rgbChannels(color: string): [number, number, number] {
    const matches = color.match(/[\d.]+/g);
    if (matches === null || matches.length < 3) {
        throw new Error(`Unparseable color: ${color}`);
    }
    return [Number(matches[0]), Number(matches[1]), Number(matches[2])];
}

/** Parse an `#rrggbb` palette color into channels. */
function hexToRgb(hex: string): [number, number, number] {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

/** Relative luminance (WCAG 1.4.3 definition) of an rgb triple. */
function luminance([r, g, b]: [number, number, number]): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

afterEach(() => {
    cleanup();
});

describe('CellView (T040 / data-model §3)', () => {
    test('water cells render blue', async () => {
        const el = await renderCell({
            coord: { x: 2, y: 9 },
            elevation: 0,
            terrain: 'water',
            troops: 0,
            owner: null,
            isCity: false,
            cityOwner: null,
            pipes: new Set(),
            reservesPct: 0,
            changedThisTick: false,
        });

        const [r, g, b] = rgbChannels(getComputedStyle(el).backgroundColor);
        expect(b).toBeGreaterThan(r + 50);
        expect(b).toBeGreaterThan(g + 50);
        // And it is the palette's water color exactly.
        expect([r, g, b]).toEqual(hexToRgb(WATER_COLOR));
    });

    test('land at elevation 200 renders lighter than sea-level land', async () => {
        const high = await renderCell({
            coord: { x: 0, y: 0 },
            elevation: 200,
            terrain: 'land',
            troops: 0,
            owner: null,
            isCity: false,
            cityOwner: null,
            pipes: new Set(),
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
            reservesPct: 0,
            changedThisTick: false,
        });

        const highLum = luminance(rgbChannels(getComputedStyle(high).backgroundColor));
        const lowLum = luminance(rgbChannels(getComputedStyle(low).backgroundColor));
        expect(highLum).toBeGreaterThan(lowLum);
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
            reservesPct: 0,
            changedThisTick: false,
        });

        const north = el.querySelector('.europa-pipe--N');
        const east = el.querySelector('.europa-pipe--E');
        expect(north).not.toBeNull();
        expect(east).not.toBeNull();
        // The N triangle is drawn with a bottom border (pointing up).
        expect(parseFloat(getComputedStyle(north as Element).borderBottomWidth)).toBeGreaterThan(0);
        // The E triangle is drawn with a left border (pointing right).
        expect(parseFloat(getComputedStyle(east as Element).borderLeftWidth)).toBeGreaterThan(0);
        // No S/W indicators for directions that are not piped.
        expect(el.querySelector('.europa-pipe--S')).toBeNull();
        expect(el.querySelector('.europa-pipe--W')).toBeNull();
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
            reservesPct: 7,
            changedThisTick: false,
        });

        const badge = el.querySelector('.europa-cell__reserves');
        expect(badge?.textContent).toBe('70%');
        const height = parseFloat(getComputedStyle(badge as Element).height);
        expect(height).toBeLessThan(DEFAULT_CAMERA.zoom / 2); // "small"
    });
});
