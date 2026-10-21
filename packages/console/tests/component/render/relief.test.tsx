/**
 * Browser readback: terrain relief bevels — spec 017.
 * FR-001…FR-006 and FR-010; AC-001…AC-005 and AC-008.
 *
 * Fixtures are painted straight through `MapCanvas.paint` on a real
 * canvas — no `<App />` indirection — so the relief render and its
 * relief-free control take the identical code path (plan D2).
 *
 * The face carries one fixed decorative NW→SE gradient per zone, so the
 * control render (relief off) is texture plus — on zones 2–3 only — the
 * sub-pass 1e contour diagonals. Tone/geometry samples therefore use
 * zone 0–1 fixtures, or a zone 2–3 sample point off the contour lattice
 * (residue 4 mod 6 at zoom 32, and its zoom-96 equivalent).
 */

import { describe, expect, test } from 'vitest';
import { MapCanvas, type PaintOptions } from '../../../src/render/canvas';
import { BIOME_ZONES, LAND_FACE_GRADIENT_DELTA, landBandColor, landBandIndex } from '../../../src/render/palette';
import {
    RELIEF_SIDES,
    type ReliefSide,
    relativeLuminance,
    reliefBandWidth,
    reliefSideIsLit,
    reliefStep,
    reliefToneColours,
} from '../../../src/render/relief';
import { coordKey } from '../../../src/state/build-map-view';
import type { CellRenderInfo, Coord, MapView, MapViewId } from '../../../src/state/types';

// ---------------------------------------------------------------------------
// Fixture construction and readback helpers
// ---------------------------------------------------------------------------

/** Cell size pinned by the tone, width, cap and reference fixtures. */
const ZOOM = 96;

/** A small board for one-tile fixtures. */
const SMALL_BOARD = 3;

/** A wide board that keeps independent fixtures apart. */
const WIDE_BOARD = 16;

/** Per-channel readback tolerance for tone comparisons. */
const TOLERANCE = 4;

/** FR-006's lit/shaded floor, asserted at its stated value. */
const BAND_TO_BAND_FLOOR = 3;

/** FR-006's per-band floor against the flat face, asserted at its stated value. */
const FACE_FLOOR = 1.2;

/** The centre tile of the small fixtures. */
const CENTRE: Coord = { x: 1, y: 1 };

type Pixel = Uint8ClampedArray;

interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

function landCell(coord: Coord, elevation: number): CellRenderInfo {
    return {
        coord,
        elevation,
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
    };
}

function waterCell(coord: Coord, elevation: number): CellRenderInfo {
    return { ...landCell(coord, elevation), terrain: 'water' };
}

/** A `MapView` holding exactly `cells`; every other position is absent. */
function mapViewOf(cells: readonly CellRenderInfo[], boardSize: number, zoom: number, reversed = false): MapView {
    const ordered = reversed ? [...cells].reverse() : cells;
    return {
        id: 'mv-relief-readback' as MapViewId,
        tick: 1,
        width: boardSize,
        height: boardSize,
        cells: new Map(ordered.map((cell) => [coordKey(cell.coord), cell])),
        playerColors: {},
        effects: [],
        labels: [],
        camera: { zoom, pan: { x: 0, y: 0 }, minZoom: 32, maxZoom: 96 },
        hover: null,
        selection: null,
        dragSelection: null,
        exclusiveMode: false,
        viewportOffset: { x: 0, y: 0 },
    };
}

/** Paint one fixture on a fresh real canvas and return its 2D context. */
function paintFixture(view: MapView, options?: PaintOptions): CanvasRenderingContext2D {
    const canvas = document.createElement('canvas');
    canvas.width = view.width * view.camera.zoom;
    canvas.height = view.height * view.camera.zoom;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
        throw new Error('relief readback needs a real 2D canvas context');
    }
    new MapCanvas().paint(view, ctx, options);
    return ctx;
}

function pixelAt(ctx: CanvasRenderingContext2D, point: Coord): Pixel {
    return new Uint8ClampedArray(ctx.getImageData(point.x, point.y, 1, 1).data);
}

function pixelsOf(ctx: CanvasRenderingContext2D): Pixel {
    return new Uint8ClampedArray(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data);
}

function samePixels(first: Pixel, second: Pixel): boolean {
    if (first.length !== second.length) {
        return false;
    }
    for (let index = 0; index < first.length; index += 1) {
        if (first[index] !== second[index]) {
            return false;
        }
    }
    return true;
}

function rgbOf(pixel: Pixel): readonly [number, number, number] {
    return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
}

function deviationOf(pixel: Pixel, rgb: readonly [number, number, number]): number {
    const [red, green, blue] = rgbOf(pixel);
    return Math.max(Math.abs(red - rgb[0]), Math.abs(green - rgb[1]), Math.abs(blue - rgb[2]));
}

function closeTo(pixel: Pixel, rgb: readonly [number, number, number], tolerance = TOLERANCE): boolean {
    return deviationOf(pixel, rgb) < tolerance;
}

function contrastBetween(first: readonly [number, number, number], second: readonly [number, number, number]): number {
    const a = relativeLuminance(first);
    const b = relativeLuminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function contrastOf(first: Pixel, second: Pixel): number {
    return contrastBetween(rgbOf(first), rgbOf(second));
}

/** Parse `hsl(H, S%, L%)` to sRGB bytes — the browser's own conversion. */
function hslToRgb(hsl: string): readonly [number, number, number] {
    const match = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/.exec(hsl);
    if (match === null) {
        throw new Error(`not an "hsl(H, S%, L%)" colour: ${hsl}`);
    }
    const hue = Number(match[1]);
    const saturation = Number(match[2]) / 100;
    const lightness = Number(match[3]) / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const offset = lightness - chroma / 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    if (hue < 60) {
        red = chroma;
        green = second;
    } else if (hue < 120) {
        red = second;
        green = chroma;
    } else if (hue < 180) {
        green = chroma;
        blue = second;
    } else if (hue < 240) {
        green = second;
        blue = chroma;
    } else if (hue < 300) {
        red = second;
        blue = chroma;
    } else {
        red = chroma;
        blue = second;
    }
    return [Math.round((red + offset) * 255), Math.round((green + offset) * 255), Math.round((blue + offset) * 255)];
}

function hexToRgb(hex: string): readonly [number, number, number] {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** The tone a side must paint at `delta`, straight from the pure mapping. */
function toneOf(zone: number, delta: number, side: ReliefSide): string {
    const tones = reliefToneColours(landBandColor(zone));
    return (reliefSideIsLit(side) ? tones.lit : tones.shaded)[reliefStep(delta) - 1] ?? landBandColor(zone);
}

/** The face texture's NW (light) and SE (dark) stops for one zone. */
function faceStops(zone: number): { readonly light: string; readonly dark: string } {
    const light = landBandColor(zone);
    const dark = light.replace(/,\s*(\d+)%\)$/, (_match, lightness: string) => {
        return `, ${Number(lightness) + LAND_FACE_GRADIENT_DELTA}%)`;
    });
    return { light, dark };
}

/**
 * A point at the band's mid-axis, one fully-covered pixel inside its
 * width: the sample never sits on the tapered end or on a contour line.
 */
function bandSamplePoint(coord: Coord, side: ReliefSide, delta: number, zoom = ZOOM): Coord {
    const width = reliefBandWidth(zoom, delta);
    const inset = Math.max(1, Math.round(width / 2));
    const x = coord.x * zoom;
    const y = coord.y * zoom;
    const mid = Math.floor(zoom / 2);
    switch (side) {
        case 'N':
            return { x: x + mid, y: y + inset };
        case 'S':
            return { x: x + mid, y: y + zoom - 1 - inset };
        case 'W':
            return { x: x + inset, y: y + mid };
        case 'E':
            return { x: x + zoom - 1 - inset, y: y + mid };
    }
}

/** The tile rect in board pixels. */
function tileRect(coord: Coord, zoom: number): Rect {
    return { x: coord.x * zoom, y: coord.y * zoom, width: zoom, height: zoom };
}

/** Count pixels inside `region` that differ between two renders. */
function differingPixels(relief: Pixel, control: Pixel, width: number, region: Rect): number {
    let differing = 0;
    for (let index = 0; index < relief.length; index += 4) {
        if (
            relief[index] === control[index] &&
            relief[index + 1] === control[index + 1] &&
            relief[index + 2] === control[index + 2] &&
            relief[index + 3] === control[index + 3]
        ) {
            continue;
        }
        const pixel = index / 4;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) {
            differing += 1;
        }
    }
    return differing;
}

/** Count pixels outside `region` that differ between two renders. */
function differingOutside(relief: Pixel, control: Pixel, width: number, region: Rect): number {
    let differing = 0;
    for (let index = 0; index < relief.length; index += 4) {
        if (
            relief[index] === control[index] &&
            relief[index + 1] === control[index + 1] &&
            relief[index + 2] === control[index + 2] &&
            relief[index + 3] === control[index + 3]
        ) {
            continue;
        }
        const pixel = index / 4;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x < region.x || x >= region.x + region.width || y < region.y || y >= region.y + region.height) {
            differing += 1;
        }
    }
    return differing;
}

/** How many pixels deep a band paints along its mid-axis. */
function bandDepth(
    relief: CanvasRenderingContext2D,
    control: CanvasRenderingContext2D,
    coord: Coord,
    side: ReliefSide,
    zoom: number,
): number {
    const x = coord.x * zoom;
    const y = coord.y * zoom;
    const mid = Math.floor(zoom / 2);
    let depth = 0;
    for (let step = 0; step < zoom; step += 1) {
        const point: Coord =
            side === 'N'
                ? { x: x + mid, y: y + step }
                : side === 'S'
                  ? { x: x + mid, y: y + zoom - 1 - step }
                  : side === 'W'
                    ? { x: x + step, y: y + mid }
                    : { x: x + zoom - 1 - step, y: y + mid };
        if (samePixels(pixelAt(relief, point), pixelAt(control, point))) {
            break;
        }
        depth += 1;
    }
    return depth;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A zone-1 tile with four lower neighbours at a fixed drop. */
function fourLowerNeighbours(own: number, neighbour: number, zoom = ZOOM): MapView {
    return mapViewOf(
        [
            landCell({ x: CENTRE.x, y: CENTRE.y - 1 }, neighbour),
            landCell({ x: CENTRE.x + 1, y: CENTRE.y }, neighbour),
            landCell({ x: CENTRE.x, y: CENTRE.y + 1 }, neighbour),
            landCell({ x: CENTRE.x - 1, y: CENTRE.y }, neighbour),
            landCell(CENTRE, own),
        ],
        SMALL_BOARD,
        zoom,
    );
}

/** One zone's reference fixture: own at the zone ceiling, W/E neighbours one lower. */
function zoneReferenceView(zone: number): MapView {
    const own = BIOME_ZONES[zone]?.elevationMax ?? 255;
    return mapViewOf(
        [
            landCell({ x: CENTRE.x - 1, y: CENTRE.y }, own - 1),
            landCell({ x: CENTRE.x + 1, y: CENTRE.y }, own - 1),
            landCell(CENTRE, own),
        ],
        SMALL_BOARD,
        ZOOM,
    );
}

// ---------------------------------------------------------------------------
// AC-001 / FR-001 / FR-002 — per-side tone, higher/equal silence
// ---------------------------------------------------------------------------

describe('relief readback: per-side tone and the drop-only bevel rule', () => {
    test('north and west bevels are lit, south and east shaded, on one tile (AC-001, FR-002)', () => {
        const view = fourLowerNeighbours(128, 118);
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const delta = 10;

        const samples = {
            N: pixelAt(relief, bandSamplePoint(CENTRE, 'N', delta)),
            E: pixelAt(relief, bandSamplePoint(CENTRE, 'E', delta)),
            S: pixelAt(relief, bandSamplePoint(CENTRE, 'S', delta)),
            W: pixelAt(relief, bandSamplePoint(CENTRE, 'W', delta)),
        };
        const face = pixelAt(control, bandSamplePoint(CENTRE, 'N', delta));

        for (const side of RELIEF_SIDES) {
            const tone = toneOf(landBandIndex(128), delta, side);
            expect(closeTo(samples[side], hexToRgb(tone)), `${side} bevel colour`).toBe(true);
        }
        // The drop is the same on all four sides; only orientation decides tone.
        expect(samples.N).toEqual(samples.W);
        expect(samples.S).toEqual(samples.E);
        expect(relativeLuminance(rgbOf(samples.N))).toBeGreaterThan(relativeLuminance(rgbOf(face)));
        expect(relativeLuminance(rgbOf(samples.S))).toBeLessThan(relativeLuminance(rgbOf(face)));
        expect(contrastOf(samples.N, samples.S)).toBeGreaterThanOrEqual(BAND_TO_BAND_FLOOR);
    });

    test('a tile that is not higher than a neighbour paints no bevel on that side (AC-001)', () => {
        for (const neighbour of [128, 138]) {
            const view = fourLowerNeighbours(128, neighbour);
            const relief = paintFixture(view);
            const control = paintFixture(view, { relief: false });
            // The neighbour may paint its own bevel on the shared edge; the
            // centre tile is never the higher one, so its own rect is face.
            expect(
                differingPixels(pixelsOf(relief), pixelsOf(control), relief.canvas.width, tileRect(CENTRE, ZOOM)),
            ).toBe(0);
        }
    });

    test('bevels never leak onto a lower tile’s facing edge (AC-001)', () => {
        // Centre 128 over its E neighbour 118: the centre's E bevel is
        // shaded. The lower tile is not higher than anything, so its W
        // edge stays face — no paired ridge/valley state.
        const view = mapViewOf([landCell({ x: 2, y: 1 }, 118), landCell(CENTRE, 128)], SMALL_BOARD, ZOOM);
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const lowerTileW = pixelAt(relief, bandSamplePoint({ x: 2, y: 1 }, 'W', 10));
        const lowerTileControl = pixelAt(control, bandSamplePoint({ x: 2, y: 1 }, 'W', 10));
        expect(samePixels(lowerTileW, lowerTileControl)).toBe(true);
        expect(
            differingPixels(pixelsOf(relief), pixelsOf(control), relief.canvas.width, tileRect(CENTRE, ZOOM)),
        ).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// AC-002 / FR-003 — the 4 / 7 / 10 % width ladder, capped at 10 %
// ---------------------------------------------------------------------------

describe('relief readback: width ladder (AC-002, FR-003)', () => {
    test('Δ1 < Δ5 < Δ10, and step 3+ is capped', () => {
        // Four independent N-edge fixtures on a wide board crossing the
        // measured thresholds: drops of 1, 5, 10 and 255 map to steps
        // 1, 2, 3 and 3. Widths at zoom 96 are 3.84 / 6.72 / 9.6 / 9.6 px.
        const drops = [1, 5, 10, 255];
        const coords = drops.map((_, index) => ({ x: 2 + index * 3, y: 1 }));
        const cells: CellRenderInfo[] = [];
        drops.forEach((delta, index) => {
            const coord = coords[index];
            if (coord === undefined) {
                return;
            }
            cells.push(landCell({ x: coord.x, y: coord.y - 1 }, 128 - delta), landCell(coord, 128));
        });
        const view = mapViewOf(cells, WIDE_BOARD, ZOOM);
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const depths = coords.map((coord) => bandDepth(relief, control, coord, 'N', ZOOM));

        expect(depths[1]).toBeGreaterThan(depths[0] ?? 0);
        expect(depths[2]).toBeGreaterThan(depths[1] ?? 0);
        expect(depths[3]).toBe(depths[2]);
        expect(depths[0]).toBeGreaterThanOrEqual(3);
        expect(depths[0]).toBeLessThanOrEqual(5);
        expect(depths[2]).toBeGreaterThanOrEqual(9);
        expect(depths[2]).toBeLessThanOrEqual(11);

        // Step 3 and step 3 share both width and tone, so their tiles are identical.
        const third = coords[2];
        const ninth = coords[3];
        if (third === undefined || ninth === undefined) {
            throw new Error('width fixture is missing a tile');
        }
        expect(
            samePixels(
                new Uint8ClampedArray(relief.getImageData(third.x * ZOOM, third.y * ZOOM, ZOOM, ZOOM).data),
                new Uint8ClampedArray(relief.getImageData(ninth.x * ZOOM, ninth.y * ZOOM, ZOOM, ZOOM).data),
            ),
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// AC-003 / FR-004 — unseen, water, off-board and equal-height silence
// ---------------------------------------------------------------------------

describe('relief readback: neutral edges (AC-003, FR-004)', () => {
    test('fog-absent, water, off-board and equal-height neighbours paint nothing', () => {
        const centreFixture = (east: CellRenderInfo | null): MapView =>
            mapViewOf(
                [
                    ...(east === null ? [] : [east]),
                    waterCell({ x: CENTRE.x - 1, y: CENTRE.y }, 64),
                    landCell({ x: CENTRE.x, y: CENTRE.y + 1 }, 128),
                    landCell(CENTRE, 128),
                ],
                SMALL_BOARD,
                ZOOM,
            );
        const absent = paintFixture(centreFixture(null));
        const absentControl = paintFixture(centreFixture(null), { relief: false });
        expect(samePixels(pixelsOf(absent), pixelsOf(absentControl))).toBe(true);

        // A non-visible neighbour's elevation cannot reach the edge: absent,
        // water at 0 and water at 255 all paint the identical tile.
        const reference = new Uint8ClampedArray(absent.getImageData(CENTRE.x * ZOOM, CENTRE.y * ZOOM, ZOOM, ZOOM).data);
        for (const elevation of [0, 255]) {
            const view = centreFixture(waterCell({ x: CENTRE.x + 1, y: CENTRE.y }, elevation));
            const render = paintFixture(view);
            expect(
                samePixels(
                    new Uint8ClampedArray(render.getImageData(CENTRE.x * ZOOM, CENTRE.y * ZOOM, ZOOM, ZOOM).data),
                    reference,
                ),
            ).toBe(true);
        }

        // Off-board: a corner tile's missing N/W neighbours are neutral,
        // while its E and S lower neighbours still carry bevels.
        const corner: Coord = { x: 0, y: 0 };
        const cornerView = mapViewOf(
            [landCell(corner, 128), landCell({ x: 1, y: 0 }, 118), landCell({ x: 0, y: 1 }, 118)],
            SMALL_BOARD,
            ZOOM,
        );
        const cornerRelief = paintFixture(cornerView);
        const cornerControl = paintFixture(cornerView, { relief: false });
        for (const side of ['N', 'W'] as const) {
            expect(
                samePixels(
                    pixelAt(cornerRelief, bandSamplePoint(corner, side, 10)),
                    pixelAt(cornerControl, bandSamplePoint(corner, side, 10)),
                ),
                `${side} is off-board and stays face`,
            ).toBe(true);
        }
        for (const side of ['E', 'S'] as const) {
            expect(
                closeTo(
                    pixelAt(cornerRelief, bandSamplePoint(corner, side, 10)),
                    hexToRgb(toneOf(landBandIndex(128), 10, side)),
                ),
                `${side} is a land drop and carries its tone`,
            ).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// AC-004 / FR-005 — face texture, retired fills, confinement
// ---------------------------------------------------------------------------

describe('relief readback: face texture and confinement (AC-004, FR-005)', () => {
    test('land faces carry the documented NW→SE texture', () => {
        // A lone zone-1 tile: no land neighbour, so no bevel, and no contour
        // hints on zone < 2 — the whole rect is 1c's face.
        const view = mapViewOf([landCell(CENTRE, 128)], SMALL_BOARD, ZOOM);
        const control = paintFixture(view, { relief: false });
        const origin = { x: CENTRE.x * ZOOM, y: CENTRE.y * ZOOM };
        const stops = faceStops(landBandIndex(128));

        expect(LAND_FACE_GRADIENT_DELTA).toBe(-5);
        // One pixel inside each corner: the pattern's outermost pixel is
        // resampled and reads a channel step darker.
        expect(closeTo(pixelAt(control, { x: origin.x + 1, y: origin.y + 1 }), hslToRgb(stops.light)), 'NW stop').toBe(
            true,
        );
        expect(
            closeTo(pixelAt(control, { x: origin.x + ZOOM - 2, y: origin.y + ZOOM - 2 }), hslToRgb(stops.dark)),
            'SE stop',
        ).toBe(true);
    });

    test('two tiles of one zone render identical faces — texture, not lighting', () => {
        const coords: readonly Coord[] = [
            { x: 0, y: 0 },
            { x: 2, y: 2 },
        ];
        const control = paintFixture(
            mapViewOf(
                coords.map((coord) => landCell(coord, 128)),
                SMALL_BOARD,
                ZOOM,
            ),
            {
                relief: false,
            },
        );
        const rectOf = (coord: Coord): Pixel =>
            new Uint8ClampedArray(control.getImageData(coord.x * ZOOM, coord.y * ZOOM, ZOOM, ZOOM).data);
        const first = coords[0];
        const second = coords[1];
        if (first === undefined || second === undefined) {
            throw new Error('texture fixture is missing a tile');
        }
        expect(samePixels(rectOf(first), rectOf(second))).toBe(true);
        // Guard against a flat fill making the comparison pass vacuously.
        expect(samePixels(pixelAt(control, { x: 0, y: 0 }), pixelAt(control, { x: ZOOM - 1, y: ZOOM - 1 }))).toBe(
            false,
        );
    });

    test('relief stays inside the tile that owns it', () => {
        const view = fourLowerNeighbours(128, 118);
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });

        // Every changed pixel lies inside the centre tile; its neighbours
        // are lower and have no bevel of their own.
        const width = relief.canvas.width;
        expect(differingPixels(pixelsOf(relief), pixelsOf(control), width, tileRect(CENTRE, ZOOM))).toBeGreaterThan(0);
        expect(differingOutside(pixelsOf(relief), pixelsOf(control), width, tileRect(CENTRE, ZOOM))).toBe(0);

        // The 96 px case is this fixture's own cell size.
        expect(ZOOM).toBe(96);
    });
});

// ---------------------------------------------------------------------------
// AC-005 / FR-006 — every zone's lit and shaded bevels are distinguishable
// ---------------------------------------------------------------------------

describe('relief readback: per-zone tone floors (AC-005, FR-006)', () => {
    test('each zone paints a lit and a shaded bevel at Δ1, ≥ 3:1 apart and visible over its face texture', () => {
        for (const zone of [0, 1, 2, 3]) {
            const view = zoneReferenceView(zone);
            const relief = paintFixture(view);
            const own = BIOME_ZONES[zone]?.elevationMax ?? 255;
            const delta = 1;
            // W is lit, E is shaded; both sample points sit off the 1e
            // contour lattice.
            const lit = pixelAt(relief, bandSamplePoint(CENTRE, 'W', delta));
            const shaded = pixelAt(relief, bandSamplePoint(CENTRE, 'E', delta));
            const stops = faceStops(zone);
            const label = `zone ${zone} (own ${own})`;

            expect(closeTo(lit, hexToRgb(toneOf(zone, delta, 'W'))), `${label} lit tone`).toBe(true);
            expect(closeTo(shaded, hexToRgb(toneOf(zone, delta, 'E'))), `${label} shaded tone`).toBe(true);
            expect(contrastOf(lit, shaded), `${label}: lit/shaded`).toBeGreaterThanOrEqual(BAND_TO_BAND_FLOOR);
            // Worst case per tone: a lit bevel is weakest against the
            // texture's lightest stop, a shaded one against its darkest.
            expect(
                contrastBetween(rgbOf(lit), hslToRgb(stops.light)),
                `${label}: lit/light stop`,
            ).toBeGreaterThanOrEqual(FACE_FLOOR);
            expect(
                contrastBetween(rgbOf(shaded), hslToRgb(stops.dark)),
                `${label}: shaded/dark stop`,
            ).toBeGreaterThanOrEqual(FACE_FLOOR);
        }
    });
});

// ---------------------------------------------------------------------------
// AC-003 — vertex caps close the taper only where two ends meet
// ---------------------------------------------------------------------------

describe('relief readback: vertex caps (FR-001, FR-002)', () => {
    /** Tile A's NW corner and tile B's SE corner meet at this grid vertex. */
    const VERTEX = { x: 1, y: 1 };

    /** Occupancy-two fixture: A=(1,1) W bevel, B=(0,0) S bevel, both into (0,1). */
    function twoEndView(): MapView {
        return mapViewOf(
            [landCell({ x: 0, y: 1 }, 118), landCell({ x: 0, y: 0 }, 128), landCell({ x: 1, y: 1 }, 128)],
            SMALL_BOARD,
            ZOOM,
        );
    }

    test('two ends at a vertex fill both cut triangles', () => {
        const view = twoEndView();
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const width = reliefBandWidth(ZOOM, 10);
        const vertexX = VERTEX.x * ZOOM;
        const vertexY = VERTEX.y * ZOOM;
        // A's W-top triangle centroid lies below-right of the vertex; B's
        // S-right triangle centroid lies above-left of it.
        const aCap = { x: Math.round(vertexX + (2 * width) / 3), y: Math.round(vertexY + width / 3) };
        const bCap = { x: Math.round(vertexX - width / 3), y: Math.round(vertexY - (2 * width) / 3) };

        expect(closeTo(pixelAt(relief, aCap), hexToRgb(toneOf(landBandIndex(128), 10, 'W')))).toBe(true);
        expect(closeTo(pixelAt(relief, bCap), hexToRgb(toneOf(landBandIndex(128), 10, 'S')))).toBe(true);
        // Without the caps both triangles would still be face.
        expect(samePixels(pixelAt(relief, aCap), pixelAt(control, aCap))).toBe(false);
        expect(samePixels(pixelAt(relief, bCap), pixelAt(control, bCap))).toBe(false);
    });

    test('one end at a vertex keeps its taper', () => {
        // B is equal height, so only A's W bevel ends at the vertex.
        const view = mapViewOf(
            [landCell({ x: 0, y: 1 }, 118), landCell({ x: 0, y: 0 }, 118), landCell({ x: 1, y: 1 }, 128)],
            SMALL_BOARD,
            ZOOM,
        );
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const width = reliefBandWidth(ZOOM, 10);
        const aCap = {
            x: Math.round(VERTEX.x * ZOOM + (2 * width) / 3),
            y: Math.round(VERTEX.y * ZOOM + width / 3),
        };
        expect(samePixels(pixelAt(relief, aCap), pixelAt(control, aCap))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// AC-008 — determinism
// ---------------------------------------------------------------------------

describe('relief readback: determinism (AC-008, FR-010)', () => {
    test('repeat paints and a re-ordered cell map are byte-identical', () => {
        const cells = [
            landCell({ x: CENTRE.x, y: CENTRE.y - 1 }, 60),
            landCell({ x: CENTRE.x + 1, y: CENTRE.y }, 230),
            landCell({ x: CENTRE.x, y: CENTRE.y + 1 }, 200),
            landCell({ x: CENTRE.x - 1, y: CENTRE.y }, 40),
            landCell(CENTRE, 128),
        ];
        const first = pixelsOf(paintFixture(mapViewOf(cells, SMALL_BOARD, ZOOM)));
        const second = pixelsOf(paintFixture(mapViewOf(cells, SMALL_BOARD, ZOOM)));
        const reversed = pixelsOf(paintFixture(mapViewOf(cells, SMALL_BOARD, ZOOM, true)));

        expect(samePixels(first, second)).toBe(true);
        expect(samePixels(first, reversed)).toBe(true);
    });
});
