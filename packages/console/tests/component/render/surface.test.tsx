/**
 * Browser readback: board surface treatment — spec 018.
 * FR-001…FR-003 and FR-002's floors; AC-001…AC-005.
 *
 * Fixtures paint straight through `MapCanvas.paint` on a real canvas. The
 * 018-free control is the same fixture with `surface: false`; relief stays
 * on unless a test says otherwise. Where a comparison must isolate one
 * treatment, the fixture uses coordinates whose grain offset is zero, so
 * the face is byte-identical in both paints.
 */

import { describe, expect, test } from 'vitest';
import { MapCanvas, type PaintOptions } from '../../../src/render/canvas';
import { landBandColor, landBandColorWithLightness, landBandIndex, SEAM_COLOR } from '../../../src/render/palette';
import {
    RELIEF_SIDES,
    type ReliefSide,
    relativeLuminance,
    reliefSideIsLit,
    reliefStep,
    reliefToneColours,
} from '../../../src/render/relief';
import {
    coastBandWidth,
    grainOffsetIndex,
    LAND_FACE_GRAIN_OFFSETS,
    landFaceGrainOffset,
    SEAM_WIDTH_PX,
} from '../../../src/render/surface';
import { coordKey } from '../../../src/state/build-map-view';
import type { CellRenderInfo, Coord, MapView, MapViewId } from '../../../src/state/types';

// ---------------------------------------------------------------------------
// Fixtures and readback helpers
// ---------------------------------------------------------------------------

const ZOOM = 96;
const BOARD = 8;
/** Grain index 0, and its west/east neighbours also index 0. */
const ISLAND: Coord = { x: 5, y: 1 };
const CENTRE: Coord = { x: 1, y: 1 };
const TOLERANCE = 4;
const FACE_FLOOR = 1.2;

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

function mapViewOf(cells: readonly CellRenderInfo[], boardSize: number, zoom: number, reversed = false): MapView {
    const ordered = reversed ? [...cells].reverse() : cells;
    return {
        id: 'mv-surface-readback' as MapViewId,
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

function paintFixture(view: MapView, options?: PaintOptions): CanvasRenderingContext2D {
    const canvas = document.createElement('canvas');
    canvas.width = view.width * view.camera.zoom;
    canvas.height = view.height * view.camera.zoom;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
        throw new Error('surface readback needs a real 2D canvas context');
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

function hslToRgb(hsl: string): readonly [number, number, number] {
    const match = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/.exec(hsl);
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

function coastTone(zone: number, side: ReliefSide): string {
    const tones = reliefToneColours(landBandColor(zone));
    return reliefSideIsLit(side) ? tones.lit[0] : tones.shaded[0];
}

function differingPixels(first: Pixel, second: Pixel, width: number, region: Rect): number {
    let differing = 0;
    for (let index = 0; index < first.length; index += 4) {
        if (
            first[index] === second[index] &&
            first[index + 1] === second[index + 1] &&
            first[index + 2] === second[index + 2] &&
            first[index + 3] === second[index + 3]
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

function differingOutside(first: Pixel, second: Pixel, width: number, region: Rect): number {
    let differing = 0;
    for (let index = 0; index < first.length; index += 4) {
        if (
            first[index] === second[index] &&
            first[index + 1] === second[index + 1] &&
            first[index + 2] === second[index + 2] &&
            first[index + 3] === second[index + 3]
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

function edgePoint(coord: Coord, side: ReliefSide, zoom = ZOOM): Coord {
    const x = coord.x * zoom;
    const y = coord.y * zoom;
    const mid = Math.floor(zoom / 2);
    switch (side) {
        case 'N':
            return { x: x + mid, y };
        case 'S':
            return { x: x + mid, y: y + zoom - 1 };
        case 'W':
            return { x, y: y + mid };
        case 'E':
            return { x: x + zoom - 1, y: y + mid };
    }
}

/** Four water neighbours around one land tile — a one-cell island. */
function islandView(zoom = ZOOM): MapView {
    return mapViewOf(
        [
            waterCell({ x: ISLAND.x, y: ISLAND.y - 1 }, 64),
            waterCell({ x: ISLAND.x + 1, y: ISLAND.y }, 64),
            waterCell({ x: ISLAND.x, y: ISLAND.y + 1 }, 64),
            waterCell({ x: ISLAND.x - 1, y: ISLAND.y }, 64),
            landCell(ISLAND, 128),
        ],
        BOARD,
        zoom,
    );
}

// ---------------------------------------------------------------------------
// AC-001 / FR-001 — coast tone, direction, width, silence
// ---------------------------------------------------------------------------

describe('surface readback: coastline band (AC-001, FR-001)', () => {
    test.each([32, 96])('a water-facing side carries its lit or shaded band at %i px', (zoom) => {
        const view = islandView(zoom);
        const painted = paintFixture(view);
        const control = paintFixture(view, { surface: false });
        const zone = landBandIndex(128);

        for (const side of RELIEF_SIDES) {
            const sample = edgePoint(ISLAND, side, zoom);
            expect(closeTo(pixelAt(painted, sample), hexToRgb(coastTone(zone, side))), `${side} tone`).toBe(true);
            expect(
                samePixels(pixelAt(painted, sample), pixelAt(control, sample)),
                `${side} band is present only because of 018`,
            ).toBe(false);
        }

        const expected = coastBandWidth(zoom);
        for (const side of RELIEF_SIDES) {
            const mid = Math.floor(zoom / 2);
            let depth = 0;
            for (let step = 0; step < zoom; step += 1) {
                const point: Coord =
                    side === 'N'
                        ? { x: ISLAND.x * zoom + mid, y: ISLAND.y * zoom + step }
                        : side === 'S'
                          ? { x: ISLAND.x * zoom + mid, y: ISLAND.y * zoom + zoom - 1 - step }
                          : side === 'W'
                            ? { x: ISLAND.x * zoom + step, y: ISLAND.y * zoom + mid }
                            : { x: ISLAND.x * zoom + zoom - 1 - step, y: ISLAND.y * zoom + mid };
                if (samePixels(pixelAt(painted, point), pixelAt(control, point))) {
                    break;
                }
                depth += 1;
            }
            expect(depth, `${side} band depth at ${zoom}px`).toBeGreaterThanOrEqual(1);
            expect(depth, `${side} band depth at ${zoom}px`).toBeLessThanOrEqual(Math.ceil(expected) + 1);
        }
    });

    test('absent, off-board and land neighbours carry no band; water cells are unchanged', () => {
        const zone = landBandIndex(128);
        const withoutWater = (other: CellRenderInfo | null): CanvasRenderingContext2D =>
            paintFixture(mapViewOf([...(other === null ? [] : [other]), landCell(ISLAND, 128)], BOARD, ZOOM));

        // North neighbour absent, then equal-height land: no band on N.
        for (const other of [null, landCell({ x: ISLAND.x, y: ISLAND.y - 1 }, 128)]) {
            const painted = withoutWater(other);
            expect(
                deviationOf(pixelAt(painted, edgePoint(ISLAND, 'N')), hexToRgb(coastTone(zone, 'N'))),
            ).toBeGreaterThan(TOLERANCE);
        }

        // Off-board: a tile at the corner has no N/W sides at all.
        const corner: Coord = { x: 0, y: 0 };
        const cornerPainted = paintFixture(mapViewOf([landCell(corner, 128)], BOARD, ZOOM));
        expect(deviationOf(pixelAt(cornerPainted, { x: 0, y: 0 }), hexToRgb(coastTone(zone, 'N')))).toBeGreaterThan(
            TOLERANCE,
        );

        // The water tile itself paints byte-identically with the coast on.
        const island = islandView();
        const water: Coord = { x: ISLAND.x, y: ISLAND.y - 1 };
        const waterRect = (ctx: CanvasRenderingContext2D): Pixel =>
            new Uint8ClampedArray(ctx.getImageData(water.x * ZOOM, water.y * ZOOM, ZOOM, ZOOM).data);
        expect(samePixels(waterRect(paintFixture(island)), waterRect(paintFixture(island, { surface: false })))).toBe(
            true,
        );
    });
});

// ---------------------------------------------------------------------------
// AC-002 / FR-001 — the relief bevel wins at a shared corner
// ---------------------------------------------------------------------------

describe('surface readback: bevel wins at a corner (AC-002, FR-001)', () => {
    test('the W bevel survives and the N coast band fills the rest of its side', () => {
        // ISLAND 128: N water (coast, lit), W land 118 (Δ10 bevel, lit).
        const view = mapViewOf(
            [
                waterCell({ x: ISLAND.x, y: ISLAND.y - 1 }, 64),
                landCell({ x: ISLAND.x - 1, y: ISLAND.y }, 118),
                landCell(ISLAND, 128),
            ],
            BOARD,
            ZOOM,
        );
        const painted = paintFixture(view);
        const control = paintFixture(view, { surface: false });
        const x = ISLAND.x * ZOOM;
        const y = ISLAND.y * ZOOM;
        const width = coastBandWidth(ZOOM);

        const bevelPoint = { x: x + Math.floor(width / 2), y: y + Math.ceil(width) - 2 };
        expect(samePixels(pixelAt(painted, bevelPoint), pixelAt(control, bevelPoint)), 'bevel pixel').toBe(true);

        expect(samePixels(pixelAt(painted, { x: x + ZOOM - 2, y }), pixelAt(control, { x: x + ZOOM - 2, y }))).toBe(
            false,
        );
        expect(closeTo(pixelAt(painted, { x: x + ZOOM - 2, y }), hexToRgb(coastTone(landBandIndex(128), 'N')))).toBe(
            true,
        );

        // Coast differences against the control are confined to the tile.
        const tile: Rect = { x, y, width: ZOOM, height: ZOOM };
        expect(differingPixels(pixelsOf(painted), pixelsOf(control), painted.canvas.width, tile)).toBeGreaterThan(0);
        expect(differingOutside(pixelsOf(painted), pixelsOf(control), painted.canvas.width, tile)).toBe(0);
    });

    test('an island paints four bands and no bevel', () => {
        const painted = paintFixture(islandView());
        const control = paintFixture(islandView(), { surface: false });
        for (const side of RELIEF_SIDES) {
            const point = edgePoint(ISLAND, side);
            expect(closeTo(pixelAt(painted, point), hexToRgb(coastTone(landBandIndex(128), side))), side).toBe(true);
            expect(samePixels(pixelAt(painted, point), pixelAt(control, point)), side).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// AC-003 / FR-002 — zone seams
// ---------------------------------------------------------------------------

describe('surface readback: zone seams (AC-003, FR-002)', () => {
    /** Zone 0 at LEFT and zone 1 at RIGHT: vertical shared edge. */
    const LEFT: Coord = { x: 4, y: 1 };
    const RIGHT: Coord = { x: 5, y: 1 };

    function pairView(rightElevation: number, rightTerrain: 'land' | 'water' = 'land'): MapView {
        const right = rightTerrain === 'water' ? waterCell(RIGHT, rightElevation) : landCell(RIGHT, rightElevation);
        return mapViewOf([landCell(LEFT, 64), right], BOARD, ZOOM);
    }

    function seamPoint(zoom = ZOOM): Coord {
        return { x: RIGHT.x * zoom - SEAM_WIDTH_PX, y: LEFT.y * zoom + Math.floor(zoom / 2) };
    }

    test.each([32, 96])('one pixel on the shared edge at %i px, face hue still changes', (zoom) => {
        const view = mapViewOf([landCell(LEFT, 64), landCell(RIGHT, 128)], BOARD, zoom);
        const painted = paintFixture(view);
        const control = paintFixture(view, { surface: false });
        const edgeX = RIGHT.x * zoom;
        const mid = LEFT.y * zoom + Math.floor(zoom / 2);

        expect(closeTo(pixelAt(painted, seamPoint(zoom)), hexToRgb(SEAM_COLOR)), 'seam colour').toBe(true);
        expect(samePixels(pixelAt(painted, seamPoint(zoom)), pixelAt(control, seamPoint(zoom)))).toBe(false);

        // Exactly one column, and the faces on both sides keep their zone
        // colours (the seam marks the cut, it does not unify it).
        expect(samePixels(pixelAt(painted, { x: edgeX - 2, y: mid }), pixelAt(control, { x: edgeX - 2, y: mid }))).toBe(
            true,
        );
        expect(samePixels(pixelAt(painted, { x: edgeX, y: mid }), pixelAt(control, { x: edgeX, y: mid }))).toBe(true);
        expect(samePixels(pixelAt(painted, { x: edgeX - 2, y: mid }), pixelAt(painted, { x: edgeX, y: mid }))).toBe(
            false,
        );
    });

    test('no seam within one zone, against water, or against an absent cell', () => {
        const notASeam = (view: MapView): boolean =>
            deviationOf(pixelAt(paintFixture(view), seamPoint()), hexToRgb(SEAM_COLOR)) > TOLERANCE;
        expect(notASeam(pairView(40))).toBe(true);
        expect(notASeam(pairView(64, 'water'))).toBe(true);
        expect(notASeam(mapViewOf([landCell(LEFT, 64)], BOARD, ZOOM))).toBe(true);

        // The water tile is byte-identical with the seam pass on.
        const water = paintFixture(pairView(64, 'water'));
        const waterControl = paintFixture(pairView(64, 'water'), { surface: false });
        const rect: Rect = { x: RIGHT.x * ZOOM, y: RIGHT.y * ZOOM, width: ZOOM, height: ZOOM };
        expect(differingPixels(pixelsOf(water), pixelsOf(waterControl), water.canvas.width, rect)).toBe(0);
    });

    test('the seam crosses a relief bevel and keeps its colour', () => {
        // LEFT is higher, so its E bevel covers the shared edge.
        const painted = paintFixture(mapViewOf([landCell(LEFT, 128), landCell(RIGHT, 64)], BOARD, ZOOM));
        expect(closeTo(pixelAt(painted, seamPoint()), hexToRgb(SEAM_COLOR))).toBe(true);
        expect(reliefStep(128 - 64)).toBe(3);
    });

    test('every zone pair and every crossed bevel clears the 1.2:1 floor', () => {
        const seam = hexToRgb(SEAM_COLOR);
        const stopsOf = (zone: number): readonly (readonly [number, number, number])[] => {
            const stops: (readonly [number, number, number])[] = [];
            for (const shift of LAND_FACE_GRAIN_OFFSETS) {
                stops.push(hslToRgb(landBandColorWithLightness(zone, shift)));
                stops.push(hslToRgb(landBandColorWithLightness(zone, shift - 5)));
            }
            return stops;
        };
        const pairs: readonly (readonly [number, number])[] = [
            [0, 1],
            [0, 2],
            [0, 3],
            [1, 2],
            [1, 3],
            [2, 3],
        ];
        const measured: string[] = [];
        for (const [first, second] of pairs) {
            for (const zone of [first, second]) {
                for (const stop of stopsOf(zone)) {
                    expect(
                        contrastBetween(seam, stop),
                        `pair ${first}/${second} zone ${zone} stop`,
                    ).toBeGreaterThanOrEqual(FACE_FLOOR);
                }
            }
            measured.push(
                `${first}/${second} ${Math.min(
                    ...[...stopsOf(first), ...stopsOf(second)].map((stop) => contrastBetween(seam, stop)),
                ).toFixed(3)}`,
            );
        }
        console.warn(`[surface] seam worst-case contrasts: ${measured.join(', ')}`);

        let worst = Number.POSITIVE_INFINITY;
        for (const zone of [0, 1, 2, 3]) {
            const tones = reliefToneColours(landBandColor(zone));
            for (const tone of [...tones.lit, ...tones.shaded]) {
                worst = Math.min(worst, contrastBetween(seam, hexToRgb(tone)));
            }
        }
        console.warn(`[surface] seam worst bevel contrast: ${worst.toFixed(3)}`);
        expect(worst).toBeGreaterThanOrEqual(FACE_FLOOR);
    });
});

// ---------------------------------------------------------------------------
// AC-004 / FR-003 — deterministic, bounded tile grain
// ---------------------------------------------------------------------------

describe('surface readback: tile grain (AC-004, FR-003)', () => {
    function nwPoint(coord: Coord, zoom = ZOOM): Coord {
        return { x: coord.x * zoom + 1, y: coord.y * zoom + 1 };
    }

    function loneTile(coord: Coord, elevation: number, zoom = ZOOM): CanvasRenderingContext2D {
        return paintFixture(mapViewOf([landCell(coord, elevation)], BOARD, zoom));
    }

    test('offsets are bounded to ±2 and at least four appear on a 32×32 board', () => {
        const seen = new Set<number>();
        for (let y = 0; y < 32; y += 1) {
            for (let x = 0; x < 32; x += 1) {
                const offset = landFaceGrainOffset({ x, y });
                expect(Math.abs(offset)).toBeLessThanOrEqual(2);
                seen.add(offset);
            }
        }
        expect(seen.size).toBe(4);

        const cells: CellRenderInfo[] = [];
        for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) cells.push(landCell({ x, y }, 128));
        const painted = paintFixture(mapViewOf(cells, 32, 32));
        const colours = new Set<string>();
        for (let y = 0; y < 32; y += 1) {
            for (let x = 0; x < 32; x += 1) colours.add(rgbOf(pixelAt(painted, nwPoint({ x, y }, 32))).join(','));
        }
        expect(colours.size).toBeGreaterThanOrEqual(4);
    });

    test('the same fixture paints byte-identically twice and in a reversed cell order', () => {
        const cells: CellRenderInfo[] = [];
        for (let y = 0; y < 6; y += 1)
            for (let x = 0; x < 6; x += 1) cells.push(landCell({ x, y }, 64 + ((x * 37 + y * 53) % 120)));
        const first = pixelsOf(paintFixture(mapViewOf(cells, 8, 32)));
        const second = pixelsOf(paintFixture(mapViewOf(cells, 8, 32)));
        const reversed = pixelsOf(paintFixture(mapViewOf(cells, 8, 32, true)));
        expect(samePixels(first, second)).toBe(true);
        expect(samePixels(first, reversed)).toBe(true);
    });

    test('a cell’s surface offset depends on its coordinate, not its elevation or neighbours', () => {
        for (const elevation of [64, 128]) {
            const zone = landBandIndex(elevation);
            const expected = hslToRgb(landBandColorWithLightness(zone, landFaceGrainOffset(CENTRE)));
            expect(closeTo(pixelAt(loneTile(CENTRE, elevation), nwPoint(CENTRE)), expected), `zone ${zone}`).toBe(true);
        }

        const withNeighbour = (neighbourElevation: number): Pixel =>
            pixelAt(
                paintFixture(
                    mapViewOf([landCell({ x: 2, y: 1 }, neighbourElevation), landCell(CENTRE, 128)], BOARD, ZOOM),
                ),
                nwPoint(CENTRE),
            );
        expect(samePixels(withNeighbour(100), withNeighbour(140))).toBe(true);

        const other = [...Array(16).keys()]
            .map((index) => ({ x: index % 4, y: Math.floor(index / 4) }))
            .find((coord) => grainOffsetIndex(coord) !== grainOffsetIndex(CENTRE));
        if (other === undefined) {
            throw new Error('fixture has no second grain variant');
        }
        expect(
            samePixels(pixelAt(loneTile(CENTRE, 128), nwPoint(CENTRE)), pixelAt(loneTile(other, 128), nwPoint(other))),
        ).toBe(false);
    });

    test('a fog-frontier tile is identical whichever representable variant its hidden neighbour takes', () => {
        const untiled = paintFixture(mapViewOf([landCell(CENTRE, 128)], BOARD, ZOOM));
        const water0 = paintFixture(
            mapViewOf([waterCell({ x: CENTRE.x + 1, y: CENTRE.y }, 0), landCell(CENTRE, 128)], BOARD, ZOOM),
        );
        const water255 = paintFixture(
            mapViewOf([waterCell({ x: CENTRE.x + 1, y: CENTRE.y }, 255), landCell(CENTRE, 128)], BOARD, ZOOM),
        );
        const face = (ctx: CanvasRenderingContext2D): Pixel => pixelAt(ctx, nwPoint(CENTRE));
        expect(samePixels(face(untiled), face(water0))).toBe(true);
        expect(samePixels(face(water0), face(water255))).toBe(true);
    });
});
