/**
 * Browser readback: delta-based terrain relief — spec 017 (T005/T006).
 * FR-001…FR-006 and FR-010; AC-001…AC-005 and AC-008.
 *
 * Fixtures are painted straight through `MapCanvas.paint` on a real
 * canvas — no `<App />` indirection — so the relief render and its
 * relief-free control take the identical code path (plan D2/D8). Pixel
 * readback needs a real canvas, hence Vitest Browser Mode.
 *
 * Sampling (D8): one pixel per band, at the band's mid-axis on its
 * outermost row or column, with two guards — the control pixel must be
 * the closed-form 1c gradient colour there, and the relief render must
 * differ. A guard failure fails the test naming the pixel and the
 * deviation: the fixture is then wrong and moves; the sample point is
 * never retried onto a neighbouring pixel.
 *
 * The reference fixtures put the lower neighbour on the W side and the
 * higher one on the E side rather than on N/S as plan D8 draws it. That
 * rotation is D8's own remedy for its guards: at zoom 32 an N band's
 * outermost row at mid-axis lands exactly on the o = 16 diagonal of the
 * 1e contour lattice, so a zone ≥ 2 tile's own contour crosses the
 * sample point (12 bytes on a Peaks channel, against a tolerance of 8;
 * 7 on Rocky Outcrops) — while W/E sample the same two gradient
 * parameters (t = 17/64 for the highlight, 48/64 for the shadow), so
 * the tight Peaks `|Δ| = 209` highlight still sits over the light half
 * of its tile, which is the worst case D8 selected it for.
 */

import { describe, expect, test } from 'vitest';
import { MapCanvas, type PaintOptions } from '../../../src/render/canvas';
import { BIOME_ZONES, landBandColor, landBandIndex } from '../../../src/render/palette';
import {
    RELIEF_DIRECTIONS,
    RELIEF_HIGHLIGHT_IS_DOWNHILL,
    relativeLuminance,
    reliefBandThickness,
    reliefFraction,
    reliefTargetLuminance,
} from '../../../src/render/relief';
import { coordKey } from '../../../src/state/build-map-view';
import type { CellRenderInfo, Coord, Direction, MapView, MapViewId } from '../../../src/state/types';

// ---------------------------------------------------------------------------
// Measurement protocol (plan D8)
// ---------------------------------------------------------------------------

/** Cell size pinned by the measurement protocol (005 FR-017's minimum). */
const ZOOM = 32;

/** The confinement case's cell size (005 FR-017's maximum). */
const ZOOM_LARGE = 96;

/** Per-channel readback tolerance for same-coordinate comparisons (AC-003/AC-004). */
const TOLERANCE = 8;

/** FR-006b's single per-band floor, asserted at its stated value. */
const BAND_FLOOR = 1.2;

/** FR-006a's band-to-band floor, asserted at its stated value. */
const BAND_TO_BAND_FLOOR = 3;

/** D5.2's half-an-8-bit-step bound on a band's painted relative luminance. */
const LUMINANCE_ALLOWANCE = 0.0045;

/** AC-002's relative invariance tolerance for one `|Δ|` across the four zones. */
const ZONE_INVARIANCE = 0.2;

/** Board edge of the reference, neutrality and confinement fixtures. */
const SMALL_BOARD = 3;

/** Board edge of the sweep and cross-zone fixtures. */
const WIDE_BOARD = 16;

/** The painter's own `adjustBrightness(landBandColor(zone), -15)` step. */
const GRADIENT_DARKENING = -15;

/** Readback pixels: `getImageData`'s RGBA bytes. */
type Pixel = Uint8ClampedArray;

/** A pixel rectangle in board-pixel space. */
interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

// ---------------------------------------------------------------------------
// Fixture construction
// ---------------------------------------------------------------------------

/** A land cell with no troops, pipes, or city marker. */
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

/** A water cell, whose elevation no edge may ever reflect (FR-004(a)). */
function waterCell(coord: Coord, elevation: number): CellRenderInfo {
    return { ...landCell(coord, elevation), terrain: 'water' };
}

/**
 * A `MapView` holding exactly `cells`; every other board position is
 * absent from the view — the fog case FR-004(b).
 *
 * @param reversed Insert the cells in reverse order (AC-008's clause on
 *                 `Map` insertion order).
 */
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
        camera: { zoom, pan: { x: 0, y: 0 }, minZoom: ZOOM, maxZoom: ZOOM_LARGE },
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

// ---------------------------------------------------------------------------
// Readback helpers
// ---------------------------------------------------------------------------

/** One pixel's RGBA bytes. */
function pixelAt(ctx: CanvasRenderingContext2D, point: Coord): Pixel {
    return new Uint8ClampedArray(ctx.getImageData(point.x, point.y, 1, 1).data);
}

/** The whole canvas bitmap's RGBA bytes. */
function pixelsOf(ctx: CanvasRenderingContext2D): Pixel {
    return new Uint8ClampedArray(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data);
}

/** RGBA equality, including fill state. */
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

/** The sRGB triple of one readback pixel. */
function rgbOf(pixel: Pixel): readonly [number, number, number] {
    return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
}

/** Largest per-channel distance between a readback pixel and a colour. */
function deviationOf(pixel: Pixel, rgb: readonly [number, number, number]): number {
    const [red, green, blue] = rgbOf(pixel);
    return Math.max(Math.abs(red - rgb[0]), Math.abs(green - rgb[1]), Math.abs(blue - rgb[2]));
}

/** Per-channel match within `tolerance` (`closeTo` in pipe-slope.test.tsx). */
function closeTo(pixel: Pixel, rgb: readonly [number, number, number], tolerance = TOLERANCE): boolean {
    return deviationOf(pixel, rgb) < tolerance;
}

/** WCAG 2.x contrast between two relative luminances, lighter first. */
function contrastOf(luminanceA: number, luminanceB: number): number {
    return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}

/** WCAG 2.x contrast between two readback pixels. */
function wcagContrast(first: Pixel, second: Pixel): number {
    return contrastOf(relativeLuminance(rgbOf(first)), relativeLuminance(rgbOf(second)));
}

// ---------------------------------------------------------------------------
// The 1c closed form the sampling guard checks against
// ---------------------------------------------------------------------------

/** `hsl(H, S%, L%)` → sRGB bytes: the browser's own conversion. */
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

/** The dark end of a zone's 1c gradient — `canvas.ts` applies the same step. */
function darkGradientEnd(zone: number): string {
    const light = landBandColor(zone);
    const match = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/.exec(light);
    if (match === null) {
        throw new Error(`not an "hsl(H, S%, L%)" colour: ${light}`);
    }
    const lightness = Math.max(0, Math.min(100, Math.round(Number(match[3]) + GRADIENT_DARKENING)));
    return `hsl(${match[1]}, ${match[2]}%, ${lightness}%)`;
}

/** The 1c gradient's byte colour at gradient parameter `t`. */
function gradientBytes(zone: number, t: number): readonly [number, number, number] {
    const light = hslToRgb(landBandColor(zone));
    const dark = hslToRgb(darkGradientEnd(zone));
    return [
        Math.round(light[0] + t * (dark[0] - light[0])),
        Math.round(light[1] + t * (dark[1] - light[1])),
        Math.round(light[2] + t * (dark[2] - light[2])),
    ];
}

/** A point's gradient parameter inside the tile at `coord` (D5). */
function gradientT(coord: Coord, point: Coord, zoom: number): number {
    const u = point.x + 0.5 - coord.x * zoom;
    const v = point.y + 0.5 - coord.y * zoom;
    return (u + v) / (2 * zoom);
}

/** The base a band's magnitude is anchored at and measured against (D5). */
function anchorLuminance(zone: number, highlight: boolean): number {
    return relativeLuminance(hslToRgb(highlight ? landBandColor(zone) : darkGradientEnd(zone)));
}

/**
 * A zone's maximum treatment for one sign: the contrast between that
 * base and the sign's token extreme, which is the model's `|Δ| = 255`
 * band (no tile in zones 1–2 can carry one — its own elevation bounds
 * the reachable delta).
 */
function maximumTreatment(zone: number, highlight: boolean): number {
    const anchor = anchorLuminance(zone, highlight);
    return contrastOf(anchor, reliefTargetLuminance(anchor, 1, highlight));
}

// ---------------------------------------------------------------------------
// Band geometry and sign
// ---------------------------------------------------------------------------

/** D8's sample point: the band's mid-axis on its outermost row/column. */
function bandSamplePoint(coord: Coord, direction: Direction, zoom: number): Coord {
    const x = coord.x * zoom;
    const y = coord.y * zoom;
    const mid = Math.floor(zoom / 2);
    switch (direction) {
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

/** The rect sub-pass 1d fills for `direction` inside the tile at `coord` (D3). */
function bandRect(coord: Coord, direction: Direction, zoom: number): Rect {
    const thickness = reliefBandThickness(zoom);
    const x = coord.x * zoom;
    const y = coord.y * zoom;
    switch (direction) {
        case 'N':
            return { x, y, width: zoom, height: thickness };
        case 'S':
            return { x, y: y + zoom - thickness, width: zoom, height: thickness };
        case 'W':
            return { x, y, width: thickness, height: zoom };
        case 'E':
            return { x: x + zoom - thickness, y, width: thickness, height: zoom };
    }
}

/** The rect of the whole tile at `coord`. */
function tileRect(coord: Coord, zoom: number): Rect {
    return { x: coord.x * zoom, y: coord.y * zoom, width: zoom, height: zoom };
}

/** Which treatment FR-002's sign constant puts on an edge toward `neighbour`. */
function highlightFor(own: number, neighbour: number): boolean {
    return neighbour < own === RELIEF_HIGHLIGHT_IS_DOWNHILL;
}

// ---------------------------------------------------------------------------
// The guarded band sampler
// ---------------------------------------------------------------------------

/** One edge of a fixture: which band is asserted, and the elevations behind it. */
interface BandExpectation {
    readonly coord: Coord;
    readonly direction: Direction;
    readonly zone: number;
    /** Elevation of the tile the band belongs to. */
    readonly own: number;
    /** Elevation of the visible land neighbour the band faces. */
    readonly neighbour: number;
}

/** One sampled band: the D8 point, both renders' pixels there, and the figures. */
interface BandSample {
    readonly point: Coord;
    /** Signed elevation delta the fixture puts on this edge. */
    readonly delta: number;
    /** `|Δ|` as a fraction of the 255 normaliser. */
    readonly fraction: number;
    readonly highlight: boolean;
    readonly control: Pixel;
    readonly band: Pixel;
    readonly controlLuminance: number;
    readonly paintedLuminance: number;
    /** The band's contrast against the same pixel of the control render (FR-006b). */
    readonly ratio: number;
    /** D5's closed form evaluated at the zone's own gradient end. */
    readonly modelledLuminance: number;
    /** That same model's ratio against the anchor — D5's lower bound for this band. */
    readonly boundRatio: number;
}

/**
 * Sample one band at its D8 point and run both sampling guards. The
 * control pixel must be the closed-form 1c colour: a 1e contour crossing
 * composites `rgba(0, 0, 0, 0.10)` over it and shifts a Peaks channel
 * three times the tolerance. The relief render must differ there, so a
 * band really is painted. Either guard fails loudly, naming the pixel
 * and the deviation.
 */
function sampleBand(
    relief: CanvasRenderingContext2D,
    control: CanvasRenderingContext2D,
    expectation: BandExpectation,
    zoom: number,
): BandSample {
    const { coord, direction, zone, own, neighbour } = expectation;
    const point = bandSamplePoint(coord, direction, zoom);
    const controlPixel = pixelAt(control, point);
    const bandPixel = pixelAt(relief, point);
    const closedForm = gradientBytes(zone, gradientT(coord, point, zoom));
    const where = `${direction} band of the zone ${zone} tile at (${coord.x},${coord.y}), sample pixel (${point.x},${point.y})`;
    if (!closeTo(controlPixel, closedForm)) {
        throw new Error(
            `relief sampling guard: ${where} — the control pixel is ${rgbOf(controlPixel).join(',')} but the ` +
                `1c closed form is ${closedForm.join(',')}, ${deviationOf(controlPixel, closedForm)} bytes off ` +
                `(tolerance ${TOLERANCE}). A 1e contour crosses the sample point; move the fixture, never the ` +
                'sample point.',
        );
    }
    if (samePixels(bandPixel, controlPixel)) {
        throw new Error(`relief sampling guard: ${where} — the relief render paints no band there.`);
    }
    const delta = neighbour - own;
    const fraction = reliefFraction(delta);
    const highlight = highlightFor(own, neighbour);
    const controlLuminance = relativeLuminance(rgbOf(controlPixel));
    const anchor = anchorLuminance(zone, highlight);
    const modelled = reliefTargetLuminance(anchor, fraction, highlight);
    return {
        point,
        delta,
        fraction,
        highlight,
        control: controlPixel,
        band: bandPixel,
        controlLuminance,
        paintedLuminance: relativeLuminance(rgbOf(bandPixel)),
        ratio: wcagContrast(bandPixel, controlPixel),
        modelledLuminance: modelled,
        boundRatio: contrastOf(modelled, anchor),
    };
}

// ---------------------------------------------------------------------------
// Edge-band and confinement assertions
// ---------------------------------------------------------------------------

/** How a band's pixel moved against its relief-free control. */
type BandDirection = 'lighter' | 'darker' | 'neutral';

/** Classify all four of `coord`'s bands against `control` (AC-001's reading). */
function bandDirections(
    relief: CanvasRenderingContext2D,
    control: CanvasRenderingContext2D,
    coord: Coord,
    zoom: number,
): Record<Direction, BandDirection> {
    const directions: Record<Direction, BandDirection> = { N: 'neutral', E: 'neutral', S: 'neutral', W: 'neutral' };
    for (const direction of RELIEF_DIRECTIONS) {
        const point = bandSamplePoint(coord, direction, zoom);
        const band = pixelAt(relief, point);
        const base = pixelAt(control, point);
        const ratio = wcagContrast(band, base);
        if (ratio < BAND_FLOOR) {
            continue;
        }
        directions[direction] = relativeLuminance(rgbOf(band)) > relativeLuminance(rgbOf(base)) ? 'lighter' : 'darker';
    }
    return directions;
}

/** Every pixel of `coord`'s four edge bands is the plain 1c gradient there. */
function expectEdgeBandsRender1c(ctx: CanvasRenderingContext2D, coord: Coord, zone: number, zoom: number): void {
    for (const direction of RELIEF_DIRECTIONS) {
        const rect = bandRect(coord, direction, zoom);
        for (let y = rect.y; y < rect.y + rect.height; y += 1) {
            for (let x = rect.x; x < rect.x + rect.width; x += 1) {
                const pixel = pixelAt(ctx, { x, y });
                const closedForm = gradientBytes(zone, gradientT(coord, { x, y }, zoom));
                if (!closeTo(pixel, closedForm)) {
                    throw new Error(
                        `AC-004: the ${direction} edge band pixel (${x},${y}) of the tile at ` +
                            `(${coord.x},${coord.y}) is ${rgbOf(pixel).join(',')} but the plain 1c gradient there is ` +
                            `${closedForm.join(',')} (${deviationOf(pixel, closedForm)} bytes off) — a neutral edge ` +
                            'carries no band and no retired inner-shadow fill.',
                    );
                }
            }
        }
    }
}

/** Every pixel of `coord`'s four edge bands matches the control render there. */
function expectEdgeBandsCloseToControl(
    relief: CanvasRenderingContext2D,
    control: CanvasRenderingContext2D,
    coord: Coord,
    zoom: number,
): void {
    for (const direction of RELIEF_DIRECTIONS) {
        const rect = bandRect(coord, direction, zoom);
        for (let y = rect.y; y < rect.y + rect.height; y += 1) {
            for (let x = rect.x; x < rect.x + rect.width; x += 1) {
                const pixel = pixelAt(relief, { x, y });
                const base = pixelAt(control, { x, y });
                if (!closeTo(pixel, rgbOf(base))) {
                    throw new Error(
                        `AC-003: the ${direction} edge band pixel (${x},${y}) of the tile at ` +
                            `(${coord.x},${coord.y}) is ${rgbOf(pixel).join(',')} but the relief-free control ` +
                            `paints ${rgbOf(base).join(',')} — a neutral edge must match it.`,
                    );
                }
            }
        }
    }
}

/**
 * Assert every pixel that differs between two renders lies inside one of
 * `rects`, and return how many differ — 0 would make the caller's
 * assertion vacuous. With `region` the scan covers only that rectangle,
 * which is how a single tile's own contribution is isolated from the
 * bands its neighbours legitimately paint.
 */
function differingPixelsInside(
    relief: Pixel,
    control: Pixel,
    width: number,
    rects: readonly Rect[],
    region?: Rect,
): number {
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
        if (
            region !== undefined &&
            (x < region.x || x >= region.x + region.width || y < region.y || y >= region.y + region.height)
        ) {
            continue;
        }
        const inside = rects.some(
            (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
        );
        if (!inside) {
            throw new Error(
                `AC-003 confinement: pixel (${x},${y}) differs from the relief-free control outside every band ` +
                    'rect relief is allowed to paint in — relief escaped its own tile.',
            );
        }
        differing += 1;
    }
    return differing;
}

// ---------------------------------------------------------------------------
// FR-006's per-zone reference fixtures (plan D5/D8)
// ---------------------------------------------------------------------------

/** One zone's reference fixture: own elevation, and `|Δ|` either side of it. */
interface ReferenceFixture {
    readonly zone: number;
    readonly own: number;
    /** `|Δ|` toward the lower neighbour, on the W side. */
    readonly lowerDelta: number;
    /** `|Δ|` toward the higher neighbour, on the E side. */
    readonly higherDelta: number;
}

/**
 * The four reference fixtures of plan D5: the largest balanced delta pair
 * each zone can carry, against neighbours at 0 and 255.
 */
const REFERENCE_FIXTURES: readonly ReferenceFixture[] = [
    { zone: 0, own: 80, lowerDelta: 80, higherDelta: 175 },
    { zone: 1, own: 128, lowerDelta: 128, higherDelta: 127 },
    { zone: 2, own: 161, lowerDelta: 161, higherDelta: 94 },
    { zone: 3, own: 209, lowerDelta: 209, higherDelta: 46 },
];

/** The tile under test in the reference and neutrality fixtures. */
const CENTRE: Coord = { x: 1, y: 1 };

/** A reference fixture rendered on a 3×3 board with only its three tiles visible. */
function referenceFixtureView(fixture: ReferenceFixture, zoom = ZOOM): MapView {
    return mapViewOf(
        [
            landCell({ x: CENTRE.x - 1, y: CENTRE.y }, 0),
            landCell(CENTRE, fixture.own),
            landCell({ x: CENTRE.x + 1, y: CENTRE.y }, 255),
        ],
        SMALL_BOARD,
        zoom,
    );
}

/** Both bands of a zone's reference fixture, sampled with the guards. */
function sampleReferenceFixture(fixture: ReferenceFixture): {
    readonly highlight: BandSample;
    readonly shadow: BandSample;
} {
    const view = referenceFixtureView(fixture);
    const relief = paintFixture(view);
    const control = paintFixture(view, { relief: false });
    return {
        highlight: sampleBand(
            relief,
            control,
            { coord: CENTRE, direction: 'W', zone: fixture.zone, own: fixture.own, neighbour: 0 },
            ZOOM,
        ),
        shadow: sampleBand(
            relief,
            control,
            { coord: CENTRE, direction: 'E', zone: fixture.zone, own: fixture.own, neighbour: 255 },
            ZOOM,
        ),
    };
}

/** The two fixed `|Δ|` magnitudes AC-002's invariance clause repeats in every zone. */
const CROSS_ZONE_MAGNITUDES = [64, 160];

/** One sampled band of the cross-zone fixture, and the edge it sits on. */
interface CrossZoneEntry {
    readonly coord: Coord;
    readonly direction: Direction;
    readonly own: number;
    readonly neighbour: number;
}

/**
 * Both fixed magnitudes in all four zones. Zones 0–1 sample the N band
 * and zones 2–3 the W band: an own tile in zone ≥ 2 has its N band's
 * sample point on its own contour lattice (see the module note), while a
 * W band is clean unless the tile directly to its west is itself zone
 * ≥ 2 — which no neighbour here is.
 */
const CROSS_ZONE_ENTRIES: readonly CrossZoneEntry[] = [
    // Zone 0 (own 80) — shadow, higher neighbour on the N side.
    { coord: { x: 2, y: 2 }, direction: 'N', own: 80, neighbour: 144 },
    { coord: { x: 6, y: 2 }, direction: 'N', own: 80, neighbour: 240 },
    // Zone 1 (own 160) — highlight, lower neighbour on the N side.
    { coord: { x: 2, y: 6 }, direction: 'N', own: 160, neighbour: 96 },
    { coord: { x: 6, y: 6 }, direction: 'N', own: 160, neighbour: 0 },
    // Zone 2 (own 161) — highlight, lower neighbour on the W side.
    { coord: { x: 10, y: 2 }, direction: 'W', own: 161, neighbour: 97 },
    { coord: { x: 10, y: 6 }, direction: 'W', own: 161, neighbour: 1 },
    // Zone 3 (own 209) — highlight, lower neighbour on the W side.
    { coord: { x: 10, y: 10 }, direction: 'W', own: 209, neighbour: 145 },
    { coord: { x: 10, y: 14 }, direction: 'W', own: 209, neighbour: 49 },
];

/** The cross-zone fixture: every entry's own tile and its one neighbour. */
function crossZoneView(zoom = ZOOM): MapView {
    const cells: CellRenderInfo[] = [];
    for (const entry of CROSS_ZONE_ENTRIES) {
        const offset: Coord = entry.direction === 'N' ? { x: 0, y: -1 } : { x: -1, y: 0 };
        cells.push(landCell({ x: entry.coord.x + offset.x, y: entry.coord.y + offset.y }, entry.neighbour));
        cells.push(landCell(entry.coord, entry.own));
    }
    return mapViewOf(cells, WIDE_BOARD, zoom);
}

/** The `|Δ|` values AC-002's sweep samples. */
const SWEEP_DELTAS = [1, 2, 16, 64, 128, 192, 255] as const;

/** The sweep's own-tile elevation: zone 0, so the shadow direction reaches `|Δ| = 255`. */
const SWEEP_OWN = 0;

/** One sweep sample: an even column of the fixture's middle row, band facing N. */
function sweepCoord(index: number): Coord {
    return { x: index * 2, y: 1 };
}

/** The `|Δ| = 1…255` sweep fixture — one shadow band per sampled magnitude. */
function sweepView(zoom = ZOOM): MapView {
    const cells: CellRenderInfo[] = [];
    SWEEP_DELTAS.forEach((delta, index) => {
        const coord = sweepCoord(index);
        cells.push(landCell({ x: coord.x, y: coord.y - 1 }, SWEEP_OWN + delta));
        cells.push(landCell(coord, SWEEP_OWN));
    });
    return mapViewOf(cells, WIDE_BOARD, zoom);
}

// ---------------------------------------------------------------------------
// T005 — signs, neutrality, confinement, determinism
// ---------------------------------------------------------------------------

describe('relief readback: signs, neutrality, confinement and determinism', () => {
    test('a lower neighbour paints lighter and a higher one darker than the control (AC-001)', () => {
        const view = referenceFixtureView(REFERENCE_FIXTURES[1]);
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });

        // Zone 1's fixture: elevation 0 on the W side (Δ = 128, the
        // highlight) and 255 on the E side (Δ = 127, the shadow).
        expect(bandDirections(relief, control, CENTRE, ZOOM)).toEqual({
            N: 'neutral',
            E: 'darker',
            S: 'neutral',
            W: 'lighter',
        });

        // Non-vacuity. The pre-T004 painter cannot be restored to prove
        // this fails against it, and `relief: false` is the same fixture
        // through the same code path with the whole sub-pass skipped:
        // classifying it against itself yields four neutrals, so the
        // assertion above is not something a relief-free paint can
        // satisfy — and a uniform per-tile treatment (the retired inner
        // shadow, painted alike on both edges) would read the same way.
        expect(bandDirections(control, control, CENTRE, ZOOM)).toEqual({
            N: 'neutral',
            E: 'neutral',
            S: 'neutral',
            W: 'neutral',
        });
    });

    test('a tile whose four neighbours are all non-land paints no band (AC-004)', () => {
        const view = mapViewOf(
            [
                waterCell({ x: CENTRE.x, y: CENTRE.y - 1 }, 0),
                waterCell({ x: CENTRE.x - 1, y: CENTRE.y }, 64),
                waterCell({ x: CENTRE.x + 1, y: CENTRE.y }, 200),
                waterCell({ x: CENTRE.x, y: CENTRE.y + 1 }, 255),
                landCell(CENTRE, 128),
            ],
            SMALL_BOARD,
            ZOOM,
        );
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });

        // The absolute form of AC-004's per-channel comparison: the
        // control render paints the 1c gradient at those coordinates, so
        // a band or a re-introduced uniform fill would differ visibly —
        // `rgba(0, 0, 0, 0.25)` on the top row moves ~55 bytes.
        expectEdgeBandsRender1c(relief, CENTRE, landBandIndex(128), ZOOM);
        // And nothing at all is painted differently: no band, and no
        // relief on the water neighbours either.
        expect(samePixels(pixelsOf(relief), pixelsOf(control))).toBe(true);
    });

    test('water, fog-absent, off-board and zero-delta edges are neutral (AC-003)', () => {
        // One centre tile, four edges: a fog-absent N neighbour, a water
        // E neighbour whose underlying elevation varies between the three
        // renders, a land S neighbour at the same elevation (Δ = 0), and a
        // water W neighbour.
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
        const waterLow = centreFixture(waterCell({ x: CENTRE.x + 1, y: CENTRE.y }, 0));
        const waterHigh = centreFixture(waterCell({ x: CENTRE.x + 1, y: CENTRE.y }, 255));
        const control = paintFixture(waterLow, { relief: false });

        expectEdgeBandsCloseToControl(paintFixture(waterLow), control, CENTRE, ZOOM);

        // A non-visible neighbour's elevation cannot reach the edge: the
        // same tile is byte-identical whether that neighbour is absent
        // from the view or water carrying 0 or 255.
        const centreRect = tileRect(CENTRE, ZOOM);
        const rectOf = (ctx: CanvasRenderingContext2D): Pixel =>
            new Uint8ClampedArray(
                ctx.getImageData(centreRect.x, centreRect.y, centreRect.width, centreRect.height).data,
            );
        const reference = rectOf(absent);
        expect(samePixels(rectOf(paintFixture(waterLow)), reference)).toBe(true);
        expect(samePixels(rectOf(paintFixture(waterHigh)), reference)).toBe(true);

        // Off-board: a corner tile's two missing neighbours are neutral,
        // while its one visible land neighbour still carries relief — so
        // the fixture is not neutral for want of any neighbour at all.
        const corner: Coord = { x: 0, y: 0 };
        const cornerView = mapViewOf([landCell(corner, 128), landCell({ x: 1, y: 0 }, 200)], SMALL_BOARD, ZOOM);
        const cornerRelief = paintFixture(cornerView);
        const cornerControl = paintFixture(cornerView, { relief: false });
        expect(bandDirections(cornerRelief, cornerControl, corner, ZOOM)).toEqual({
            N: 'neutral',
            E: 'darker',
            S: 'neutral',
            W: 'neutral',
        });
        // And relief paints exactly the two bands the fixture implies — the
        // corner tile's E band and its neighbour's W band — and nothing else.
        expect(
            differingPixelsInside(pixelsOf(cornerRelief), pixelsOf(cornerControl), cornerRelief.canvas.width, [
                bandRect(corner, 'E', ZOOM),
                bandRect({ x: 1, y: 0 }, 'W', ZOOM),
            ]),
        ).toBeGreaterThan(0);
    });

    test('relief changes nothing outside the band a tile owns (AC-003)', () => {
        // Centre tile with four visible land neighbours, so every one of
        // its edges carries a band and each neighbour carries exactly the
        // one band that faces it. AC-003's third clause cannot hold
        // literally for a neighbouring *land* tile — it paints its own
        // band on the shared edge — so the same property is asserted in
        // the form that can fail: the pixels relief changes are confined
        // to the band each tile owns, at the mid-axis sample geometry.
        const neighbours: ReadonlyArray<{ coord: Coord; facing: Direction; elevation: number }> = [
            { coord: { x: CENTRE.x, y: CENTRE.y - 1 }, facing: 'S', elevation: 60 },
            { coord: { x: CENTRE.x + 1, y: CENTRE.y }, facing: 'W', elevation: 230 },
            { coord: { x: CENTRE.x, y: CENTRE.y + 1 }, facing: 'N', elevation: 200 },
            { coord: { x: CENTRE.x - 1, y: CENTRE.y }, facing: 'E', elevation: 40 },
        ];
        const view = mapViewOf(
            [landCell(CENTRE, 128), ...neighbours.map((n) => landCell(n.coord, n.elevation))],
            SMALL_BOARD,
            ZOOM,
        );
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const width = relief.canvas.width;
        const reliefPixels = pixelsOf(relief);
        const controlPixels = pixelsOf(control);

        const ownBands = RELIEF_DIRECTIONS.map((direction) => bandRect(CENTRE, direction, ZOOM));
        const neighbourBands = neighbours.map((neighbour) => bandRect(neighbour.coord, neighbour.facing, ZOOM));
        // Every pixel relief changes, anywhere in the board, is inside a
        // band rect of the tile that owns it.
        expect(
            differingPixelsInside(reliefPixels, controlPixels, width, [...ownBands, ...neighbourBands]),
        ).toBeGreaterThan(0);
        // And per tile: the centre's four bands, each neighbour's one.
        expect(
            differingPixelsInside(reliefPixels, controlPixels, width, ownBands, tileRect(CENTRE, ZOOM)),
        ).toBeGreaterThan(0);
        for (const neighbour of neighbours) {
            const band = bandRect(neighbour.coord, neighbour.facing, ZOOM);
            expect(
                differingPixelsInside(reliefPixels, controlPixels, width, [band], tileRect(neighbour.coord, ZOOM)),
                `the tile at (${neighbour.coord.x},${neighbour.coord.y}) changes only in its own ${neighbour.facing} band`,
            ).toBeGreaterThan(0);
        }

        // The same confinement at the 96 px maximum cell size (005 FR-017).
        const largeView = mapViewOf(
            [landCell(CENTRE, 128), ...neighbours.map((n) => landCell(n.coord, n.elevation))],
            SMALL_BOARD,
            ZOOM_LARGE,
        );
        const largeRelief = paintFixture(largeView);
        const largeControl = paintFixture(largeView, { relief: false });
        const largeBands = RELIEF_DIRECTIONS.map((direction) => bandRect(CENTRE, direction, ZOOM_LARGE));
        expect(
            differingPixelsInside(
                pixelsOf(largeRelief),
                pixelsOf(largeControl),
                largeRelief.canvas.width,
                largeBands,
                tileRect(CENTRE, ZOOM_LARGE),
            ),
        ).toBeGreaterThan(0);
    });

    test('repeat paints and a re-ordered cell map are byte-identical (AC-008)', () => {
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

// ---------------------------------------------------------------------------
// T006 — reference fixtures, sweep, zone invariance
// ---------------------------------------------------------------------------

describe('relief readback: reference fixtures, sweep and zone invariance', () => {
    test('every zone clears the band-to-band and per-band floors on its reference fixture (AC-005)', () => {
        for (const fixture of REFERENCE_FIXTURES) {
            const { highlight, shadow } = sampleReferenceFixture(fixture);
            const label = `zone ${fixture.zone} (own ${fixture.own})`;
            for (const sample of [highlight, shadow]) {
                const band = `${label} ${sample.highlight ? 'highlight' : 'shadow'} |Δ| = ${Math.abs(sample.delta)}`;
                const moved = 'the band moved the way the sign constant puts it, against its control pixel';
                if (sample.highlight) {
                    expect(sample.paintedLuminance, `${band}: ${moved}`).toBeGreaterThan(sample.controlLuminance);
                } else {
                    expect(sample.paintedLuminance, `${band}: ${moved}`).toBeLessThan(sample.controlLuminance);
                }
                expect(
                    sample.ratio,
                    `${band}: measured ratio ${sample.ratio.toFixed(4)} against its relief-free control`,
                ).toBeGreaterThanOrEqual(BAND_FLOOR);
                expect(
                    Math.abs(sample.paintedLuminance - sample.modelledLuminance),
                    `${band}: painted luminance ${sample.paintedLuminance.toFixed(5)} against the modelled ` +
                        `${sample.modelledLuminance.toFixed(5)}`,
                ).toBeLessThanOrEqual(LUMINANCE_ALLOWANCE);
                // D5's derivation is a lower bound satisfied at every pixel
                // of every band: the sample reads above it, never below.
                expect(
                    sample.ratio,
                    `${band}: measured ratio ${sample.ratio.toFixed(4)} below D5's derived bound ` +
                        `${sample.boundRatio.toFixed(4)} — the fixture or the implementation has moved`,
                ).toBeGreaterThanOrEqual(sample.boundRatio);
            }
            const bandToBand = wcagContrast(highlight.band, shadow.band);
            expect(
                bandToBand,
                `${label}: the ${Math.abs(highlight.delta)} and ${Math.abs(shadow.delta)} bands measure ` +
                    `${bandToBand.toFixed(4)} apart`,
            ).toBeGreaterThanOrEqual(BAND_TO_BAND_FLOOR);
        }
    });

    test('the |Δ| sweep never falls and 255 stays strictly above its bottom and quarters (AC-002)', () => {
        const view = sweepView();
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const magnitudes = SWEEP_DELTAS.map((delta, index) => {
            const sample = sampleBand(
                relief,
                control,
                {
                    coord: sweepCoord(index),
                    direction: 'N',
                    zone: landBandIndex(SWEEP_OWN),
                    own: SWEEP_OWN,
                    neighbour: SWEEP_OWN + delta,
                },
                ZOOM,
            );
            expect(sample.delta).toBe(delta);
            return { delta, magnitude: sample.ratio };
        });

        // Sampled at 1, 2, 16, 64, 128, 192 and 255: the rendered magnitude
        // never falls, and the top of the range is strictly above the
        // bottom and each sampled quarter.
        magnitudes.forEach(({ delta, magnitude }, index) => {
            const previous = magnitudes[index - 1];
            if (previous !== undefined) {
                expect(
                    magnitude,
                    `|Δ| = ${delta}: magnitude ${magnitude.toFixed(4)} fell from ${previous.magnitude.toFixed(4)}`,
                ).toBeGreaterThanOrEqual(previous.magnitude);
            }
        });
        const top = magnitudes.at(-1);
        if (top === undefined) {
            throw new Error('the sweep fixture sampled no band');
        }
        for (const { delta, magnitude } of magnitudes.slice(0, -1)) {
            expect(
                top.magnitude,
                `|Δ| = ${top.delta} (${top.magnitude.toFixed(4)}) against |Δ| = ${delta} (${magnitude.toFixed(4)})`,
            ).toBeGreaterThan(magnitude);
        }
    });

    test('a fixed |Δ| reaches the same fraction of each zone’s maximum treatment (AC-002)', () => {
        const view = crossZoneView();
        const relief = paintFixture(view);
        const control = paintFixture(view, { relief: false });
        const samples = CROSS_ZONE_ENTRIES.map((entry) => {
            const zone = landBandIndex(entry.own);
            const sample = sampleBand(relief, control, { ...entry, zone }, ZOOM);
            // Measured in the model's own frame (D5): the band's contrast
            // excess against the base it is anchored at, over that base's
            // maximum treatment. The zone's `|Δ| = 255` band stands in as
            // that maximum — no tile in zones 1–2 can carry one, since its
            // own elevation bounds the reachable delta — and the anchor
            // frame is what makes the figure comparable across zones at
            // all: against a tile's *local* control pixel a Peaks
            // highlight is capped tighter than an Ice Plains one by the
            // zone's own luminance, which is not a magnitude difference.
            const fraction =
                (contrastOf(sample.paintedLuminance, anchorLuminance(zone, sample.highlight)) - 1) /
                (maximumTreatment(zone, sample.highlight) - 1);
            return { zone, fraction, sample };
        });

        for (const magnitude of CROSS_ZONE_MAGNITUDES) {
            const band = samples.filter(({ sample }) => Math.abs(sample.delta) === magnitude);
            expect(band).toHaveLength(BIOME_ZONES.length);
            const reference = band[0];
            if (reference === undefined) {
                throw new Error(`no fixture band carries |Δ| = ${magnitude}`);
            }
            // The fraction is the delta's own fraction of the maximum
            // treatment (FR-003), so it is the same number in every zone.
            expect(reference.fraction, `|Δ| = ${magnitude}`).toBeCloseTo(reliefFraction(magnitude), 2);
            for (const { zone, fraction } of band) {
                expect(
                    Math.abs(fraction - reference.fraction) / reference.fraction,
                    `|Δ| = ${magnitude}: zone ${zone} reaches ${fraction.toFixed(4)} of its maximum treatment, ` +
                        `zone ${reference.zone} reaches ${reference.fraction.toFixed(4)}`,
                ).toBeLessThanOrEqual(ZONE_INVARIANCE);
            }
        }
    });
});
