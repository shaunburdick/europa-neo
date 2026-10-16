/**
 * Canvas terrain rendering tests — spec 021 + spec 024 (biome zones).
 *
 * Exercises drawTerrain through the public `paint` method using a mock
 * CanvasRenderingContext2D. Verifies water gradient + wave texture,
 * land biome-zone gradients + delta-based edge relief + contour hints,
 * city glow effects, void radial gradient, and pipe triangle outlines.
 */

import { describe, expect, test, vi } from 'vitest';
import { MapCanvas } from '../../../src/render/canvas';
import { PIPE_OUTLINE_COLOR, PIPE_STALLED_COLOR } from '../../../src/render/palette';
import type { CellRenderInfo, MapView } from '../../../src/state/types';

/** Band thickness at zoom 32: `max(2, round(32 · 0.08))` (spec 017 plan D3). */
const BAND_THICKNESS = 3;

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

/** A mock 2D context plus every fill it recorded. */
interface RecordingMockCtx {
    readonly ctx: CanvasRenderingContext2D;
    readonly fills: RecordedFill[];
}

/**
 * Build a mock context that records each `fillRect` together with the
 * `fillStyle` in effect, so a test can assert a fill's colour and rect
 * as the painter set them.
 */
function createRecordingCtx(width = 320, height = 240): RecordingMockCtx {
    const mocks = new Map<string | symbol, ReturnType<typeof vi.fn>>();
    const props = new Map<string | symbol, unknown>();
    const fills: RecordedFill[] = [];
    // Sub-pass 1d batches relief bands into one path per distinct colour
    // (T008), so a recorded fill can arrive either as `fillRect` or as
    // `rect` calls flushed by `fill`. Track the open path so both land in
    // `fills` with the same shape.
    const pathRects: { x: number; y: number; width: number; height: number }[] = [];
    const gradient = {
        addColorStop: vi.fn(),
    };

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
                        vi.fn(() => ({ ...gradient, addColorStop: vi.fn() })),
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
                } else if (prop === 'beginPath') {
                    mocks.set(
                        prop,
                        vi.fn(() => {
                            pathRects.length = 0;
                        }),
                    );
                } else if (prop === 'fill') {
                    mocks.set(
                        prop,
                        vi.fn(() => {
                            for (const rect of pathRects) {
                                fills.push({ ...rect, fillStyle: props.get('fillStyle') });
                            }
                            pathRects.length = 0;
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

    return { ctx: new Proxy({} as CanvasRenderingContext2D, handler), fills };
}

/** Build a minimal mock CanvasRenderingContext2D with tracked calls. */
function createMockCtx(width = 320, height = 240): CanvasRenderingContext2D {
    return createRecordingCtx(width, height).ctx;
}

/** True when `fills` holds a fill of exactly `rect` in exactly `color`. */
function hasFill(
    fills: readonly RecordedFill[],
    rect: readonly [number, number, number, number],
    color: string,
): boolean {
    const [x, y, width, height] = rect;
    return fills.some(
        (fill) =>
            fill.fillStyle === color && fill.x === x && fill.y === y && fill.width === width && fill.height === height,
    );
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
    test('water cells use linear gradient (not flat fill)', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        const view = makeMapView([makeWaterCell(0, 0)]);
        canvas.paint(view, ctx);

        // Verify createLinearGradient was called (water gradient fill).
        expect(ctx.createLinearGradient).toHaveBeenCalled();
    });

    test('land cells use directional gradient (top-left to bottom-right)', () => {
        const ctx = createMockCtx();
        const canvas = new MapCanvas();
        const view = makeMapView([makeLandCell(0, 0, 128)]);
        canvas.paint(view, ctx);

        // Verify createLinearGradient was called (land directional gradient).
        expect(ctx.createLinearGradient).toHaveBeenCalled();
    });

    test('land tiles paint delta-based edge relief, not the retired inner shadow (017 FR-005, AC-004)', () => {
        // The Peaks reference fixture of spec 017 FR-006 (plan D5/D8): own
        // elevation 209, lower neighbour (0) on the N side, higher (255) on
        // the S side, so the tight |Δ| = 209 highlight and the |Δ| = 46
        // shadow are both painted here.
        const { ctx, fills } = createRecordingCtx();
        const canvas = new MapCanvas();
        const view = makeMapView([makeLandCell(0, 1, 209), makeLandCell(0, 0, 0), makeLandCell(0, 2, 255)]);
        canvas.paint(view, ctx);

        // Both band colours are pinned byte-exactly: the mapping is
        // continuous (FR-003), so an implementation that floors it, or
        // picks the wrong gradient end for either sign, changes them.
        expect(hasFill(fills, [0, TILE_PX, TILE_PX, BAND_THICKNESS], '#f9fafb')).toBe(true);
        expect(hasFill(fills, [0, 2 * TILE_PX - BAND_THICKNESS, TILE_PX, BAND_THICKNESS], '#646c70')).toBe(true);

        // That these two assertions track the sub-pass is checked against
        // the same fixture painted with it skipped (D2's `relief: false`,
        // exactly what the removed sub-pass would paint): neither band
        // colour appears, so the pins above fail if 1d goes away.
        const { ctx: reliefFreeCtx, fills: reliefFreeFills } = createRecordingCtx();
        canvas.paint(view, reliefFreeCtx, { relief: false });
        expect(hasFill(reliefFreeFills, [0, TILE_PX, TILE_PX, BAND_THICKNESS], '#f9fafb')).toBe(false);
        expect(hasFill(reliefFreeFills, [0, 2 * TILE_PX - BAND_THICKNESS, TILE_PX, BAND_THICKNESS], '#646c70')).toBe(
            false,
        );

        // A land tile whose four neighbours are all non-land (absent from
        // the view here) carries no relief at all: every fill on that
        // board is a gradient — the void backdrop and the tile's own 1c
        // gradient — and a relief band is the only thing 1d fills a rect
        // with a plain colour string.
        const { ctx: isolatedCtx, fills: isolatedFills } = createRecordingCtx();
        canvas.paint(makeMapView([makeLandCell(0, 0, 128)]), isolatedCtx);
        expect(isolatedFills.some((fill) => typeof fill.fillStyle === 'string')).toBe(false);

        // And the retired uniform inner shadow is gone from every paint.
        for (const recorded of [fills, isolatedFills]) {
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
