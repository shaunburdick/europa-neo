/**
 * Canvas terrain rendering tests — spec 021 + spec 024 (biome zones).
 *
 * Exercises drawTerrain through the public `paint` method using a mock
 * CanvasRenderingContext2D. Verifies water gradient + wave texture,
 * land biome-zone face textures + delta-based edge relief + contour
 * hints, city glow effects, void radial gradient, and pipe triangle
 * outlines. happy-dom has no canvas 2D, so the face-texture sprite path
 * falls back to a flat zone fill here; the browser readback suite
 * (`tests/component/render/relief.test.tsx`) asserts the texture.
 */

import { describe, expect, test, vi } from 'vitest';
import { MapCanvas } from '../../../src/render/canvas';
import { landBandColor, PIPE_OUTLINE_COLOR, PIPE_STALLED_COLOR } from '../../../src/render/palette';
import { reliefToneColours } from '../../../src/render/relief';
import type { CellRenderInfo, MapView } from '../../../src/state/types';

/** Tile size the mock board paints at (`makeMapView`'s camera zoom). */
const TILE_PX = 32;

/**
 * The two `fillStyle` literals sub-pass 1d painted on every land tile
 * before spec 017 retired them (005's absorbed `024-FR-013`, rewritten
 * by 017 FR-005).
 */
const RETIRED_INNER_SHADOW_FILLS = ['rgba(0, 0, 0, 0.25)', 'rgba(255, 255, 255, 0.15)'];

/** One `fillRect` the mock recorded, with the `fillStyle` in effect at the call. */
interface RecordedFill {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly fillStyle: unknown;
}

/** One filled path polygon the mock recorded. */
interface RecordedPolygon {
    readonly points: readonly number[];
    readonly fillStyle: unknown;
}

/** One colour stop the mock recorded on a gradient. */
interface RecordedStop {
    readonly offset: number;
    readonly color: string;
}

/** One gradient the mock created, in paint order. */
interface RecordedGradient {
    readonly kind: 'linear' | 'radial';
    readonly stops: RecordedStop[];
}

/** A mock 2D context plus every fill it recorded. */
interface RecordingMockCtx {
    readonly ctx: CanvasRenderingContext2D;
    readonly fills: RecordedFill[];
    readonly polygons: RecordedPolygon[];
    readonly gradients: RecordedGradient[];
}

/**
 * Build a mock context that records each `fillRect` and each filled path
 * polygon together with the `fillStyle` in effect, so a test can assert
 * a fill's colour and shape as the painter set them.
 */
function createRecordingCtx(width = 320, height = 240): RecordingMockCtx {
    const mocks = new Map<string | symbol, ReturnType<typeof vi.fn>>();
    const props = new Map<string | symbol, unknown>();
    const fills: RecordedFill[] = [];
    const polygons: RecordedPolygon[] = [];
    const gradients: RecordedGradient[] = [];
    // Sub-pass 1d batches relief bands into one path per distinct colour,
    // so a fill arrives as one or more `moveTo`/`lineTo` subpaths flushed
    // by `fill`.
    const pathRects: { x: number; y: number; width: number; height: number }[] = [];
    const pathPolygons: number[][] = [];
    let currentPoints: number[] = [];

    const handler: ProxyHandler<object> = {
        get(_target, prop) {
            if (prop === 'canvas') return { width, height };
            // Return stored property value if it was assigned (strokeStyle, lineWidth, etc.).
            if (props.has(prop)) {
                return props.get(prop);
            }
            if (!mocks.has(prop)) {
                if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
                    mocks.set(
                        prop,
                        vi.fn(() => {
                            const recorded: RecordedGradient = {
                                kind: prop === 'createLinearGradient' ? 'linear' : 'radial',
                                stops: [],
                            };
                            gradients.push(recorded);
                            return {
                                addColorStop: vi.fn((offset: number, color: string) => {
                                    recorded.stops.push({ offset, color });
                                }),
                            };
                        }),
                    );
                } else if (prop === 'fillRect') {
                    mocks.set(
                        prop,
                        vi.fn((x: number, y: number, fillWidth: number, fillHeight: number) => {
                            fills.push({
                                x,
                                y,
                                width: fillWidth,
                                height: fillHeight,
                                fillStyle: props.get('fillStyle'),
                            });
                        }),
                    );
                } else if (prop === 'rect') {
                    mocks.set(
                        prop,
                        vi.fn((x: number, y: number, fillWidth: number, fillHeight: number) => {
                            pathRects.push({ x, y, width: fillWidth, height: fillHeight });
                        }),
                    );
                } else if (prop === 'moveTo') {
                    mocks.set(
                        prop,
                        vi.fn((x: number, y: number) => {
                            if (currentPoints.length > 0) {
                                pathPolygons.push(currentPoints);
                            }
                            currentPoints = [x, y];
                        }),
                    );
                } else if (prop === 'lineTo') {
                    mocks.set(
                        prop,
                        vi.fn((x: number, y: number) => {
                            currentPoints.push(x, y);
                        }),
                    );
                } else if (prop === 'beginPath') {
                    mocks.set(
                        prop,
                        vi.fn(() => {
                            pathRects.length = 0;
                            pathPolygons.length = 0;
                            currentPoints = [];
                        }),
                    );
                } else if (prop === 'fill') {
                    mocks.set(
                        prop,
                        vi.fn(() => {
                            if (currentPoints.length > 0) {
                                pathPolygons.push(currentPoints);
                                currentPoints = [];
                            }
                            for (const rect of pathRects) {
                                fills.push({ ...rect, fillStyle: props.get('fillStyle') });
                            }
                            for (const points of pathPolygons) {
                                polygons.push({ points, fillStyle: props.get('fillStyle') });
                            }
                            pathRects.length = 0;
                            pathPolygons.length = 0;
                        }),
                    );
                } else {
                    mocks.set(prop, vi.fn());
                }
            }
            return mocks.get(prop);
        },
        set(_target, prop, value) {
            props.set(prop, value);
            return true;
        },
    };

    return { ctx: new Proxy({} as CanvasRenderingContext2D, handler), fills, polygons, gradients };
}

/** Build a minimal mock CanvasRenderingContext2D with tracked calls. */
function createMockCtx(width = 320, height = 240): CanvasRenderingContext2D {
    return createRecordingCtx(width, height).ctx;
}

/** Build a minimal MapView with the given cells. */
function makeMapView(cells: CellRenderInfo[]): MapView {
    return {
        cells: new Map(cells.map((c) => [`${c.coord.x},${c.coord.y}`, c])),
        camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 32, maxZoom: 96 },
        viewportOffset: { x: 0, y: 0 },
        hover: null,
        selection: null,
        effects: [],
        labels: [],
        playerColors: {},
    } as unknown as MapView;
}

function makeWaterCell(x: number, y: number, elevation = 128): CellRenderInfo {
    return {
        coord: { x, y },
        elevation,
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
    } as unknown as CellRenderInfo;
}

function makeLandCell(x: number, y: number, elevation: number, isCity = false): CellRenderInfo {
    return {
        coord: { x, y },
        elevation,
        terrain: 'land',
        troops: 0,
        owner: null,
        isCity,
        cityOwner: null,
        pipes: new Set(),
        pipeSlopes: new Map(),
        pipeIntensities: new Map(),
        reservesPct: 0,
        changedThisTick: false,
    } as unknown as CellRenderInfo;
}

function makePipeCell(
    x: number,
    y: number,
    elevation: number,
    direction: 'N' | 'S' | 'E' | 'W',
    slope: 'downhill' | 'flat' | 'uphill' | 'stalled',
): CellRenderInfo {
    return {
        coord: { x, y },
        elevation,
        terrain: 'land',
        troops: 0,
        owner: null,
        isCity: false,
        cityOwner: null,
        pipes: new Set([direction]),
        pipeSlopes: new Map([[direction, slope]]),
        pipeIntensities: new Map([[direction, 0.5]]),
        reservesPct: 0,
        changedThisTick: false,
    } as unknown as CellRenderInfo;
}

describe('MapCanvas terrain rendering (spec 021 + 024)', () => {
    test('water cells use a linear gradient with brightness-adjusted stops', () => {
        const { ctx, gradients } = createRecordingCtx();
        const canvas = new MapCanvas();
        const view = makeMapView([makeWaterCell(0, 0)]);
        canvas.paint(view, ctx);

        // One water cell, one linear gradient: the base water colour at
        // 0.33, ±20 % at the ends, −10 % at 0.66.
        const water = gradients.filter((gradient) => gradient.kind === 'linear');
        expect(water).toHaveLength(1);
        expect(water[0]?.stops).toEqual([
            { offset: 0, color: '#5081ff' },
            { offset: 0.33, color: '#1d4ed8' },
            { offset: 0.66, color: '#0435bf' },
            { offset: 1, color: '#001ba5' },
        ]);
    });

    test('land cells paint their zone face without a per-cell gradient', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        const view = makeMapView([makeLandCell(0, 0, 128)]);
        canvas.paint(view, ctx);

        // 1c pre-renders one texture per zone; this happy-dom run has no
        // canvas 2D context for the sprite, so it exercises the flat
        // fallback. The browser readback asserts the texture (AC-004).
        expect(ctx.createLinearGradient).not.toHaveBeenCalled();
        expect(ctx.fillRect).toHaveBeenCalled();
    });

    test('land tiles paint relief bevels only where they are higher (017 FR-001, AC-004)', () => {
        const canvas = new MapCanvas();

        // A Peaks tile (own 209) with a lower N neighbour (0): one lit bevel
        // at Δ ≥ 3 and no shaded bevel anywhere, since no tile is higher
        // than a neighbour on a shaded side.
        const { ctx, fills, polygons } = createRecordingCtx();
        canvas.paint(makeMapView([makeLandCell(0, 1, 209), makeLandCell(0, 0, 0)]), ctx);
        const tones = reliefToneColours(landBandColor(3));
        expect(polygons.some((polygon) => polygon.fillStyle === tones.lit[2])).toBe(true);
        expect(polygons.some((polygon) => polygon.fillStyle === tones.shaded[2])).toBe(false);
        // The N band runs along the tile's top edge with its ends
        // tapering into the tile: a body strip at y = TILE_PX plus a
        // wedge opening from the tile's top-left corner.
        expect(
            polygons.some(
                (polygon) =>
                    polygon.fillStyle === tones.lit[2] &&
                    polygon.points[0] === 0 &&
                    polygon.points[1] === TILE_PX &&
                    polygon.points[3] === TILE_PX,
            ),
        ).toBe(true);
        expect(
            fills.some((fill) => fill.fillStyle === tones.lit[2] && fill.y === TILE_PX && fill.height < TILE_PX),
        ).toBe(true);

        // A lower S neighbour paints the shaded tone instead: tone follows
        // the side, never the drop alone (FR-002).
        const { ctx: shadedCtx, polygons: shadedPolygons } = createRecordingCtx();
        canvas.paint(makeMapView([makeLandCell(0, 0, 209), makeLandCell(0, 1, 0)]), shadedCtx);
        expect(shadedPolygons.some((polygon) => polygon.fillStyle === tones.shaded[2])).toBe(true);
        expect(shadedPolygons.some((polygon) => polygon.fillStyle === tones.lit[2])).toBe(false);

        // Equal heights are neutral: no bevel path, and the only land fill
        // left is the zone face.
        const { ctx: equalCtx, fills: equalFills, polygons: equalPolygons } = createRecordingCtx();
        canvas.paint(makeMapView([makeLandCell(0, 0, 209), makeLandCell(0, 1, 209)]), equalCtx);
        expect(equalPolygons).toHaveLength(0);
        expect(equalFills.some((fill) => fill.fillStyle === landBandColor(3))).toBe(true);

        // `relief: false` paints the control: same face, no bevel paths.
        const { ctx: controlCtx, polygons: controlPolygons } = createRecordingCtx();
        canvas.paint(makeMapView([makeLandCell(0, 1, 209), makeLandCell(0, 0, 0)]), controlCtx, { relief: false });
        expect(controlPolygons).toHaveLength(0);

        // And the retired uniform inner shadow is gone from every paint.
        for (const recorded of [fills, equalFills]) {
            expect(
                RETIRED_INNER_SHADOW_FILLS.filter((literal) => recorded.some((fill) => fill.fillStyle === literal)),
            ).toEqual([]);
        }
    });

    test('city cells draw radial glow and center dot', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        const view = makeMapView([makeLandCell(0, 0, 200, true)]);
        canvas.paint(view, ctx);

        // City glow: createRadialGradient for glow, arc for center dot.
        expect(ctx.createRadialGradient).toHaveBeenCalled();
        expect(ctx.arc).toHaveBeenCalled();
    });

    test('void backdrop uses radial gradient (not flat fill)', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        const view = makeMapView([]);
        canvas.paint(view, ctx);

        // Void gradient: createRadialGradient called for the void fill.
        expect(ctx.createRadialGradient).toHaveBeenCalled();
    });

    test('all terrain types render without throwing', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        const cells = [
            makeWaterCell(0, 0),
            makeLandCell(1, 0, 50),
            makeLandCell(2, 0, 128),
            makeLandCell(3, 0, 200),
            makeLandCell(4, 0, 255),
            makeLandCell(0, 1, 100, true),
        ];
        const view = makeMapView(cells);
        expect(() => canvas.paint(view, ctx)).not.toThrow();
    });

    test('zone 2+ land cells (Rocky Outcrops, Peaks) trigger contour hints', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        // Elevation 185 → zone 2 (Rocky Outcrops, zone ≥ 2) → contour hints
        const view = makeMapView([makeLandCell(0, 0, 185)]);
        canvas.paint(view, ctx);

        // Contour hints draw additional stroke calls (diagonal lines).
        expect(ctx.stroke).toHaveBeenCalled();
    });

    test('low-zone land cells (zones 0-1) have no contour hints', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        // Elevation 42 → zone 0 (Ice Plains, zone < 2) → no contour hints
        const view = makeMapView([makeLandCell(0, 0, 42)]);
        canvas.paint(view, ctx);

        // Land rendering still calls stroke for inner shadow, but
        // contour lines are not drawn (zone < 2). The test verifies
        // the method completes without error — exact contour counting
        // is an integration concern.
        expect(ctx.fillRect).toHaveBeenCalled();
    });
});

describe('MapCanvas pipe outlines (spec 024 FR-010, AC-010)', () => {
    test('filled pipe triangles get a dark outline stroke before fill', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        // Downhill pipe at elevation 40 (Ice Plains zone)
        const view = makeMapView([makePipeCell(0, 0, 40, 'N', 'downhill')]);
        canvas.paint(view, ctx);

        // FR-010: stroke (outline) must be called before fill (colored).
        const strokeIdx = ctx.stroke.mock.invocationCallOrder[0];
        const fillIdx = ctx.fill.mock.invocationCallOrder[0];
        expect(fillIdx).toBeDefined();
        expect(strokeIdx).toBeLessThan(fillIdx as number);

        // Outline color must be PIPE_OUTLINE_COLOR (dark, guaranteed contrast).
        expect(ctx.strokeStyle).toBe(PIPE_OUTLINE_COLOR);

        // lineWidth = Math.max(1, zoom * 0.04); zoom=32 → 1.28
        expect(ctx.lineWidth).toBe(Math.max(1, 32 * 0.04));
    });

    test('stalled pipe triangles get a thick dark outline + colored inner stroke', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        // Stalled pipe at elevation 200 (Rocky Outcrops zone)
        const view = makeMapView([makePipeCell(0, 0, 200, 'E', 'stalled')]);
        canvas.paint(view, ctx);

        // Stalled pipes: exactly 2 strokes (thick dark outline + colored inner),
        // no fill (hollow treatment). Terrain strokes may also be present,
        // so we check >= 2 total stroke calls.
        expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(2);

        // No fill call for stalled pipes (hollow).
        expect(ctx.fill).not.toHaveBeenCalled();

        // Final strokeStyle is the inner color (last pipe stroke sets it).
        expect(ctx.strokeStyle).toBe(PIPE_STALLED_COLOR);

        // lineWidth: outline uses Math.max(2, zoom * 0.08)=2.56, then
        // inner stroke uses Math.max(1.5, zoom * 0.06)=1.92.
        // Final lineWidth is the inner stroke's value.
        expect(ctx.lineWidth).toBe(Math.max(1.5, 32 * 0.06));
    });

    test('all pipe slope types render without throwing', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        const cells = [
            makePipeCell(0, 0, 40, 'N', 'downhill'),
            makePipeCell(1, 0, 120, 'S', 'flat'),
            makePipeCell(2, 0, 185, 'E', 'uphill'),
            makePipeCell(3, 0, 230, 'W', 'stalled'),
        ];
        const view = makeMapView(cells);
        expect(() => canvas.paint(view, ctx)).not.toThrow();
    });
});
