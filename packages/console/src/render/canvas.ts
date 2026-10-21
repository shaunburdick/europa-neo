/**
 * Canvas 2D board painter — Feature 005 (T045).
 *
 * The dense visual layer (research.md §2): one `MapCanvas` instance
 * paints a full `MapView` snapshot into any `CanvasRenderingContext2D`
 * in a fixed pass order — terrain → units → pipes → effects → labels
 * — so overlapping layers always stack identically between frames.
 *
 * Separation of duties: this class owns **how pixels are drawn**; the
 * DOM overlay (`grid-overlay.tsx`) owns **what assistive tech sees**;
 * the `requestAnimationFrame` loop that drives repaints lives in the
 * runtime (`runtime.ts`, Phase 8). The MVP paints synchronously on
 * state change from `App`'s effect — same pure entry point the rAF
 * loop will call.
 *
 * Purity: `paint` is a pure function of `(mapView, ctx)` — no clock
 * reads, no randomness, no layout queries. Deterministic input yields
 * byte-identical canvas output (SC-002 render determinism).
 *
 * JSDoc reference: FR-001 (elevation-shaded terrain, water, city
 * markers, troop counts, owner colors, pipe indicators) + research.md
 * §2 (Canvas 2D decision).
 */

import { filterEffectsForMotion } from '../qol/reduced-motion';
import { coordKey, destinationCoord } from '../state/build-map-view';
import type { CellRenderInfo, MapEffect, MapView } from '../state/types';
import { drawMapLabels } from './label-overlay';
import {
    CAPTURE_EFFECT_COLOR,
    CHIP_BACKGROUND,
    CHIP_TEXT,
    CITY_COLOR,
    CITY_GLOW_STRONG_COLOR,
    COMBAT_EFFECT_COLOR,
    FOCUS_RING_COLOR,
    GENERIC_EFFECT_COLOR,
    LAND_BAND_COUNT,
    LAND_FACE_GRADIENT_DELTA,
    landBandColor,
    landBandIndex,
    PIPE_DOWNHILL_COLOR,
    PIPE_FLAT_COLOR,
    PIPE_OUTLINE_COLOR,
    PIPE_STALLED_COLOR,
    PIPE_UPHILL_COLOR,
    terrainColor,
    VOID_GRADIENT_CENTER,
    VOID_GRADIENT_EDGE,
    WATER_DEEP_COLOR,
    WATER_SHALLOW_COLOR,
    waterDepthForCell,
} from './palette';
import type { PipeSlope } from './pipe-slope';
import { RELIEF_SIDES, reliefBandWidth, reliefSideIsLit, reliefStep, reliefToneColours } from './relief';
import { type ReliefBand, reliefGeometry } from './relief-caps';

/** Fraction of the cell size used as the troop-disc radius. */
const UNIT_RADIUS_RATIO = 0.32;

/** Inset fraction for the city outline square. */
const CITY_INSET_RATIO = 0.12;

/**
 * Map a pipe slope classification to its palette color (005 FR-013).
 * Pure; the stalled color is used for the hollow triangle's stroke.
 */
function pipeSlopeColor(slope: PipeSlope): string {
    switch (slope) {
        case 'downhill':
            return PIPE_DOWNHILL_COLOR;
        case 'flat':
            return PIPE_FLAT_COLOR;
        case 'uphill':
            return PIPE_UPHILL_COLOR;
        case 'stalled':
            return PIPE_STALLED_COLOR;
    }
}

/**
 * Fill one phase's flat colour runs. Colours are iterated in sorted key
 * order, so the paint sequence is a pure function of the colour set
 * rather than of cell insertion order (AC-008).
 */
function fillBuckets(
    ctx: CanvasRenderingContext2D,
    buckets: ReadonlyMap<string, readonly number[]>,
    stride: 6 | 8,
): void {
    for (const colour of [...buckets.keys()].sort()) {
        const run = buckets.get(colour);
        if (run === undefined) continue;
        ctx.fillStyle = colour;
        ctx.beginPath();
        for (let index = 0; index < run.length; index += stride) {
            // Almost every band is an axis-aligned rect; `rect()` is far
            // cheaper than four line segments, so detect that form.
            if (
                stride === 8 &&
                run[index] === run[index + 6] &&
                run[index + 1] === run[index + 3] &&
                run[index + 2] === run[index + 4] &&
                run[index + 5] === run[index + 7]
            ) {
                ctx.rect(
                    run[index] ?? 0,
                    run[index + 1] ?? 0,
                    (run[index + 2] ?? 0) - (run[index] ?? 0),
                    (run[index + 5] ?? 0) - (run[index + 1] ?? 0),
                );
                continue;
            }
            ctx.moveTo(run[index] ?? 0, run[index + 1] ?? 0);
            for (let point = index + 2; point < index + stride; point += 2) {
                ctx.lineTo(run[point] ?? 0, run[point + 1] ?? 0);
            }
            ctx.closePath();
        }
        ctx.fill();
    }
}

/**
 * Resolution of one zone's face-texture sprite. Fixed, so the sprite is
 * built once per zone and the pattern transform scales it to the zoom.
 */
const FACE_TEXTURE_PX = 64;

/**
 * Pre-render one biome zone's face texture (FR-005): the zone colour at
 * the NW corner, `LAND_FACE_GRADIENT_DELTA` darker at the SE corner.
 * Returns `undefined` where no 2D context exists (happy-dom unit runs),
 * leaving sub-pass 1c on its flat fallback.
 */
function createLandFace(colour: string, dark: string): HTMLCanvasElement | undefined {
    const sprite = document.createElement('canvas');
    sprite.width = FACE_TEXTURE_PX;
    sprite.height = FACE_TEXTURE_PX;
    const spriteCtx = sprite.getContext('2d');
    if (spriteCtx === null) {
        return undefined;
    }
    const gradient = spriteCtx.createLinearGradient(0, 0, FACE_TEXTURE_PX, FACE_TEXTURE_PX);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, dark);
    spriteCtx.fillStyle = gradient;
    spriteCtx.fillRect(0, 0, FACE_TEXTURE_PX, FACE_TEXTURE_PX);
    return sprite;
}

/**
 * A repeating face pattern whose period is exactly one cell, anchored to
 * the board origin, so every tile of a zone draws the same texture at any
 * zoom. Built per paint (patterns belong to one context); the sprite is
 * cached. `undefined` when the context cannot create patterns.
 */
function createLandFacePattern(
    ctx: CanvasRenderingContext2D,
    sprite: HTMLCanvasElement,
    zoom: number,
): CanvasPattern | undefined {
    const pattern = ctx.createPattern(sprite, 'repeat');
    if (pattern === null) {
        return undefined;
    }
    const scale = zoom / FACE_TEXTURE_PX;
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
    return pattern;
}

/** Options modifying one paint pass. */
export interface PaintOptions {
    /**
     * Honor `prefers-reduced-motion` (Q-A07 / WCAG 2.3.3): skip the
     * flashing combat/capture effect markers entirely. Default `false`.
     */
    readonly reducedMotion?: boolean;
    /**
     * Paint delta-based edge relief (FR-001). `false` paints the
     * relief-free control used by the 017 readback suite: the whole
     * sub-pass is skipped. It does not restore the retired uniform
     * inner shadow — FR-005 retires that unconditionally.
     */
    readonly relief?: boolean;
}

/**
 * Canvas 2D painter for the satellite grid. Stateless apart from a memo of
 * the per-zone face sprites — a pure function of the zone colours — so one
 * instance may serve any number of canvases and frames.
 */
export class MapCanvas {
    private landFaceSprites: ReadonlyMap<number, HTMLCanvasElement> | undefined;
    /**
     * Paint one complete frame of `mapView` into `ctx`. Clears the
     * canvas to void first (out-of-horizon cells stay void per fog
     * FR-002), then draws in the fixed pass order.
     *
     * The caller owns canvas sizing: the canvas bitmap should match
     * its CSS layout size (fills the board area container). The
     * viewport offset in `mapView` determines which board cells are
     * visible at the current zoom level. Drawing clips naturally to
     * the canvas bounds.
     *
     * @param mapView The immutable snapshot to paint.
     * @param ctx Target 2D context (its current transform is treated
     *            as identity over the board's pixel space).
     * @param options Optional paint modifiers (reduced motion, relief).
     */
    paint(mapView: MapView, ctx: CanvasRenderingContext2D, options?: PaintOptions): void {
        const reducedMotion = options?.reducedMotion === true;
        const relief = options?.relief !== false;
        const { zoom } = mapView.camera;
        const { viewportOffset } = mapView;
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;

        // Pass 0: void backdrop with radial gradient (FR-004).
        const cx = canvasWidth / 2;
        const cy = canvasHeight / 2;
        const outerRadius = Math.sqrt(cx * cx + cy * cy);
        const voidGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius);
        voidGrad.addColorStop(0, VOID_GRADIENT_CENTER);
        voidGrad.addColorStop(1, VOID_GRADIENT_EDGE);
        ctx.fillStyle = voidGrad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Apply viewport offset so cells paint relative to the
        // visible area instead of the full board origin (issue #76).
        ctx.save();
        ctx.translate(-viewportOffset.x, -viewportOffset.y);

        // --- Pass 1: batched terrain sub-passes ---
        //
        // The original per-cell drawTerrain had three performance bottlenecks:
        //   (a) ~5000 adjustBrightness regex calls per frame
        //   (b) ~4000 individual ctx.stroke() calls for wave + contour lines
        //   (c) ~2000 ctx.save()/ctx.restore() pairs for minor state changes
        //
        // Restructured into batched sub-passes that pre-compute colors once,
        // batch all strokes into single paths, and minimize state operations.

        // Pre-compute once: cached land band colors eliminate the per-tile
        // hue lookups (and the retired gradient's brightness calls).
        const landBandColors = new Map<number, string>();
        for (let b = 0; b < LAND_BAND_COUNT; b++) {
            landBandColors.set(b, landBandColor(b));
        }

        // Pre-compute once: water gradient stop color variants per depth tier.
        // depth ≤ 0 → shallow; depth ≥ 2 → deep; else → standard WATER_COLOR.
        const waterStops = {
            shallow: {
                light20: this.adjustBrightness(WATER_SHALLOW_COLOR, 20),
                base: WATER_SHALLOW_COLOR,
                dark10: this.adjustBrightness(WATER_SHALLOW_COLOR, -10),
                dark20: this.adjustBrightness(WATER_SHALLOW_COLOR, -20),
            },
            standard: {
                light20: this.adjustBrightness(terrainColor('water', 128), 20),
                base: terrainColor('water', 128),
                dark10: this.adjustBrightness(terrainColor('water', 128), -10),
                dark20: this.adjustBrightness(terrainColor('water', 128), -20),
            },
            deep: {
                light20: this.adjustBrightness(WATER_DEEP_COLOR, 20),
                base: WATER_DEEP_COLOR,
                dark10: this.adjustBrightness(WATER_DEEP_COLOR, -10),
                dark20: this.adjustBrightness(WATER_DEEP_COLOR, -20),
            },
        };

        // Sub-pass 1a: water gradient fills (per-cell — gradients are
        // position-dependent, but color computation is now pre-cached).
        for (const info of mapView.cells.values()) {
            if (info.terrain !== 'water') continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            const depth = waterDepthForCell(info.elevation);
            const stops = depth <= 0 ? waterStops.shallow : depth >= 2 ? waterStops.deep : waterStops.standard;
            const grad = ctx.createLinearGradient(x, y, x + zoom, y + zoom);
            grad.addColorStop(0, stops.light20);
            grad.addColorStop(0.33, stops.base);
            grad.addColorStop(0.66, stops.dark10);
            grad.addColorStop(1, stops.dark20);
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, zoom, zoom);
        }

        // Sub-pass 1b: batched wave texture — ALL water wave lines collected
        // into a single path and stroked once (was ~4000 individual strokes).
        // design-exception: canvas fallback
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (const info of mapView.cells.values()) {
            if (info.terrain !== 'water') continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            for (let wx = x; wx < x + zoom; wx += 4) {
                ctx.moveTo(wx, y);
                ctx.lineTo(wx, y + zoom);
            }
        }
        ctx.stroke();

        // Sub-pass 1c: land faces — a fixed decorative NW→SE gradient per
        // biome zone, blitted as one pattern fill per zone, so no per-cell
        // gradient or image objects exist. It encodes no elevation: the
        // bevels are the sole relief cue (FR-005).
        const faces = this.landFacePatterns(ctx, zoom, landBandColors);
        const runs = new Map<number, number[]>();
        for (const info of mapView.cells.values()) {
            if (info.terrain !== 'land') continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            const band = landBandIndex(info.elevation);
            if (!faces.has(band)) {
                ctx.fillStyle = landBandColors.get(band) ?? landBandColor(band);
                ctx.fillRect(x, y, zoom, zoom);
                continue;
            }
            const run = runs.get(band) ?? [];
            run.push(x, y);
            runs.set(band, run);
        }
        for (const band of [...runs.keys()].sort((a, b) => a - b)) {
            const pattern = faces.get(band);
            const run = runs.get(band);
            if (pattern === undefined || run === undefined) continue;
            ctx.fillStyle = pattern;
            ctx.beginPath();
            for (let index = 0; index < run.length; index += 2) {
                ctx.rect(run[index] ?? 0, run[index + 1] ?? 0, zoom, zoom);
            }
            ctx.fill();
        }

        // Sub-pass 1d: relief bevels (FR-001). A bevel exists only where
        // this tile is strictly higher than a visible land neighbour; its
        // width and tone step with that drop, its tone side with the NW
        // light (FR-002/FR-003). Bands are mitred trapezoids inside the
        // tile, then vertex caps close the taper where ends meet.
        if (relief) {
            const bands: ReliefBand[] = [];
            // Per zone, the three lit and three shaded tones, so no band
            // re-parses an hsl() string.
            const tonesByZone = new Map<number, ReturnType<typeof reliefToneColours>>();
            for (let band = 0; band < LAND_BAND_COUNT; band++) {
                tonesByZone.set(band, reliefToneColours(landBandColor(band)));
            }
            for (const info of mapView.cells.values()) {
                if (info.terrain !== 'land') continue;
                const x = info.coord.x * zoom;
                const y = info.coord.y * zoom;
                const zone = landBandIndex(info.elevation);
                const tones = tonesByZone.get(zone);
                if (tones === undefined) continue;
                for (const side of RELIEF_SIDES) {
                    const dst = destinationCoord(info.coord, side);
                    // Off-board, absent (fog-hidden), water, and equal-height
                    // neighbours are all neutral (FR-004): no bevel, no
                    // synthesized neighbour elevation.
                    if (dst.x < 0 || dst.x >= mapView.width || dst.y < 0 || dst.y >= mapView.height) continue;
                    const neighbour = mapView.cells.get(coordKey(dst));
                    if (neighbour === undefined || neighbour.terrain !== 'land') continue;
                    const delta = info.elevation - neighbour.elevation;
                    if (delta <= 0) continue;
                    bands.push({
                        x,
                        y,
                        size: zoom,
                        side,
                        width: reliefBandWidth(zoom, delta),
                        colour: (reliefSideIsLit(side) ? tones.lit : tones.shaded)[reliefStep(delta) - 1] ?? '',
                    });
                }
            }

            // Bands, cap squares and cap triangles are each filled one path
            // per colour, colours in sorted key order, so the fill sequence
            // is a pure function of the colour set rather than of cell
            // insertion order (AC-008). Phase order matters: a cap square
            // rebases a corner, then its triangle restores the other half.
            const geometry = reliefGeometry(bands);
            fillBuckets(ctx, geometry.bands, 8);
            fillBuckets(ctx, geometry.squares, 8);
            fillBuckets(ctx, geometry.caps, 6);
        }

        // Sub-pass 1e: batched contour hints — ALL contour diagonal lines
        // collected into a single path and stroked once (was hundreds of
        // individual strokes). Zone ≥ 2 only (Rocky Outcrops + Peaks).
        const contourStep = 6;
        // design-exception: canvas fallback
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.10)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (const info of mapView.cells.values()) {
            if (info.terrain !== 'land') continue;
            const zone = landBandIndex(info.elevation);
            if (zone < 2) continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            for (let offset = -zoom; offset < zoom * 2; offset += contourStep) {
                ctx.moveTo(x + offset, y);
                ctx.lineTo(x + offset + zoom, y + zoom);
            }
        }
        ctx.stroke();

        // Sub-pass 1f: batched city glow effects — drawn last in terrain
        // because shadowBlur is one of the most expensive Canvas2D ops.
        // Grouping cities together keeps the shadow state set once and
        // minimizes save/restore cycles.
        for (const info of mapView.cells.values()) {
            if (!info.isCity) continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            const inset = zoom * CITY_INSET_RATIO;
            const cityCx = x + zoom / 2;
            const cityCy = y + zoom / 2;

            // Radial glow: 40% cell radius, cityGlowStrong → transparent.
            const glowRadius = zoom * 0.4;
            const glowGrad = ctx.createRadialGradient(cityCx, cityCy, 0, cityCx, cityCy, glowRadius);
            glowGrad.addColorStop(0, CITY_GLOW_STRONG_COLOR);
            // design-exception: canvas fallback
            glowGrad.addColorStop(1, 'rgba(255, 68, 68, 0)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(x, y, zoom, zoom);

            // Center dot with shadow blur.
            ctx.save();
            ctx.beginPath();
            ctx.arc(cityCx, cityCy, Math.max(1, zoom * 0.06), 0, Math.PI * 2);
            ctx.fillStyle = CITY_GLOW_STRONG_COLOR;
            ctx.shadowColor = CITY_GLOW_STRONG_COLOR;
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.restore();

            // Border stroke with glow.
            ctx.save();
            ctx.strokeStyle = CITY_COLOR;
            ctx.lineWidth = Math.max(1.5, zoom * 0.06);
            ctx.shadowColor = CITY_GLOW_STRONG_COLOR;
            ctx.shadowBlur = 4;
            ctx.strokeRect(x + inset, y + inset, zoom - inset * 2, zoom - inset * 2);
            ctx.restore();
        }

        // --- End Pass 1 terrain sub-passes ---

        // Pass 2: units (troop discs + counts in owner colors).
        for (const info of mapView.cells.values()) {
            this.drawUnit(ctx, info, zoom, mapView);
        }

        // Pass 3: pipes (edge triangles).
        for (const info of mapView.cells.values()) {
            this.drawPipes(ctx, info, zoom);
        }

        // Pass 4: transient effects (combat flashes, capture rings) —
        // flashing kinds are skipped under reduced motion (T083).
        const effects = filterEffectsForMotion(mapView.effects, reducedMotion);
        for (const effect of effects) {
            this.drawEffect(ctx, effect, zoom);
        }

        // Pass 5: transient labels ("70%" reserve confirmations) — the
        // chip painter lives in label-overlay.ts (T071) so US5's
        // transient-feedback surfaces reuse the identical style.
        drawMapLabels(ctx, mapView.labels, zoom);

        // Pass 6: hover highlight + selection focus ring on top so they
        // never disappear under units/pipes (WCAG 2.4.7 visual target).
        if (mapView.hover !== null) {
            this.strokeCellRect(
                ctx,
                mapView.hover.x * zoom,
                mapView.hover.y * zoom,
                zoom,
                // design-exception: canvas fallback — spec Edge Cases § pit
                'rgba(255,255,255,0.45)',
                1.5,
            );
        }
        if (mapView.selection !== null) {
            this.strokeCellRect(ctx, mapView.selection.x * zoom, mapView.selection.y * zoom, zoom, FOCUS_RING_COLOR, 2);
        }

        // Restore to canvas-absolute coordinates (undo viewport offset).
        ctx.restore();
    }

    /** Draw the troop disc + count for an occupied cell. */
    private drawUnit(ctx: CanvasRenderingContext2D, info: CellRenderInfo, zoom: number, mapView: MapView): void {
        if (info.troops <= 0 || info.owner === null) {
            return;
        }
        const cx = info.coord.x * zoom + zoom / 2;
        const cy = info.coord.y * zoom + zoom / 2;
        const radius = zoom * UNIT_RADIUS_RATIO;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = CHIP_BACKGROUND;
        ctx.fill();
        // Owner color ring around the disc (FR-001 owner colors); the
        // accessible name carries the handle/ID so color is not the only
        // carrier of ownership.
        ctx.strokeStyle = mapView.playerColors[info.owner] ?? CHIP_TEXT;
        ctx.lineWidth = Math.max(1.5, zoom * 0.05);
        ctx.stroke();

        ctx.fillStyle = CHIP_TEXT;
        ctx.font = `bold ${Math.max(9, Math.round(zoom * 0.34))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(info.troops), cx, cy);
    }

    /**
     * Draw outward-pointing pipe triangles at the cell's edges.
     * Triangle size scales with intensity (issue #43): smaller at low
     * intensity, full size at high intensity. Stalled pipes use a fixed
     * 80%-depth outline with no fill. Every pipe gets a dark outline
     * (spec 024 FR-010) for contrast against any biome background.
     */
    private drawPipes(ctx: CanvasRenderingContext2D, info: CellRenderInfo, zoom: number): void {
        const x = info.coord.x * zoom;
        const y = info.coord.y * zoom;
        const midX = x + zoom / 2;
        const midY = y + zoom / 2;
        // Maximum depth = center to cell edge (zoom / 2).
        const maxDepth = zoom / 2;
        for (const direction of info.pipes) {
            // Slope classification precomputed by buildMapView (005
            // FR-013); a missing entry (defensive) renders flat.
            const slope = info.pipeSlopes.get(direction) ?? 'flat';
            // Intensity scales triangle depth (issue #43): 30% at
            // intensity=0, 100% at intensity=1. Stalled pipes use a
            // fixed 80% depth so the outline has a visibly hollow center.
            const intensity = info.pipeIntensities.get(direction) ?? 0;
            const depthFactor = slope === 'stalled' ? 0.8 : 0.3 + intensity * 0.7;
            const depth = maxDepth * depthFactor;
            // Base half-width = 30% of depth (matches CSS clip-path).
            const baseHalf = depth * 0.3;
            ctx.beginPath();
            // Triangles point OUTWARD from cell center toward the pipe
            // direction — matching the original Europa rules: "lines
            // originating near the center of a cell and pointing in the
            // direction of the desired troops flow" (GH issue 101).
            if (direction === 'N') {
                ctx.moveTo(midX - baseHalf, midY);
                ctx.lineTo(midX + baseHalf, midY);
                ctx.lineTo(midX, midY - depth);
            } else if (direction === 'S') {
                ctx.moveTo(midX - baseHalf, midY);
                ctx.lineTo(midX + baseHalf, midY);
                ctx.lineTo(midX, midY + depth);
            } else if (direction === 'W') {
                ctx.moveTo(midX, midY - baseHalf);
                ctx.lineTo(midX, midY + baseHalf);
                ctx.lineTo(midX - depth, midY);
            } else {
                ctx.moveTo(midX, midY - baseHalf);
                ctx.lineTo(midX, midY + baseHalf);
                ctx.lineTo(midX + depth, midY);
            }
            ctx.closePath();
            if (slope === 'stalled') {
                // Hollow treatment (005 FR-013): thick dark outline
                // + colored inner stroke (spec 024 FR-010).
                ctx.strokeStyle = PIPE_OUTLINE_COLOR;
                ctx.lineWidth = Math.max(2, zoom * 0.08);
                ctx.stroke();
                ctx.strokeStyle = pipeSlopeColor(slope);
                ctx.lineWidth = Math.max(1.5, zoom * 0.06);
                ctx.stroke();
            } else {
                // Dark outline first, then colored fill (spec 024 FR-010).
                // Skip the outline for very small pipes (low intensity)
                // where the stroke width overwhelms the triangle interior,
                // producing muddy blended pixels instead of a clean color.
                const outlineWidth = Math.max(1, zoom * 0.04);
                if (depth > outlineWidth * 3) {
                    ctx.strokeStyle = PIPE_OUTLINE_COLOR;
                    ctx.lineWidth = outlineWidth;
                    ctx.stroke();
                }
                ctx.fillStyle = pipeSlopeColor(slope);
                ctx.fill();
            }
        }
    }

    /** Draw a translucent effect marker (combat flash / capture ring). */
    private drawEffect(ctx: CanvasRenderingContext2D, effect: MapEffect, zoom: number): void {
        const cx = effect.cell.x * zoom + zoom / 2;
        const cy = effect.cell.y * zoom + zoom / 2;
        ctx.save();
        if (effect.kind === 'combat') {
            ctx.fillStyle = COMBAT_EFFECT_COLOR;
            ctx.beginPath();
            ctx.arc(cx, cy, zoom * 0.45, 0, Math.PI * 2);
            ctx.fill();
        } else if (effect.kind === 'capture') {
            ctx.strokeStyle = CAPTURE_EFFECT_COLOR;
            ctx.lineWidth = Math.max(2, zoom * 0.08);
            ctx.beginPath();
            ctx.arc(cx, cy, zoom * 0.42, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.fillStyle = GENERIC_EFFECT_COLOR;
            ctx.fillRect(effect.cell.x * zoom, effect.cell.y * zoom, zoom, zoom);
        }
        ctx.restore();
    }

    /**
     * One face pattern per biome zone for this paint. The sprites are
     * built once per instance (a function of the zone colours alone); the
     * patterns carry the zoom, so the same zone draws identical pixels on
     * every tile and every canvas (FR-005, AC-008).
     */
    private landFacePatterns(
        ctx: CanvasRenderingContext2D,
        zoom: number,
        colours: ReadonlyMap<number, string>,
    ): ReadonlyMap<number, CanvasPattern> {
        if (this.landFaceSprites === undefined) {
            const sprites = new Map<number, HTMLCanvasElement>();
            for (const [band, colour] of colours) {
                const dark = this.adjustBrightness(colour, LAND_FACE_GRADIENT_DELTA);
                const sprite = createLandFace(colour, dark);
                if (sprite !== undefined) sprites.set(band, sprite);
            }
            this.landFaceSprites = sprites;
        }
        const patterns = new Map<number, CanvasPattern>();
        for (const [band, sprite] of this.landFaceSprites) {
            const pattern = createLandFacePattern(ctx, sprite, zoom);
            if (pattern !== undefined) patterns.set(band, pattern);
        }
        return patterns;
    }

    /**
     * Adjust the brightness of a color string by a percentage.
     *
     * Parses hex (`#rrggbb`, `#rrggbbaa`), HSL (`hsl(H, S%, L%)`), and
     * HSLA (`hsla(H, S%, L%, A)`) strings, adjusts the lightness/brightness
     * component, and returns the adjusted string. rgb/rgba strings are
     * returned unchanged (can't adjust reliably).
     *
     * For hex/RGB, each channel is shifted by `percent`% of 255 and clamped
     * to 0–255. For HSL/HSLA, lightness (0–100) is shifted directly by
     * `percent` and clamped to 0–100.
     *
     * @param color Color string in any supported format.
     * @param percent Brightness adjustment (-100 to +100). Positive = lighter.
     * @returns Adjusted color string in the same format as input.
     */
    private adjustBrightness(color: string, percent: number): string {
        if (!color) return '';
        // Return rgb/rgba strings unchanged — can't parse reliably.
        if (color.startsWith('rgb')) return color;
        // Handle HSL strings: hsl(H, S%, L%) or hsl(H S% L%) or hsla variants.
        const hslMatch = /^hsla?\(\s*(\d+)[,\s]+(\d+)%[,\s]+(\d+)%(?:[,\s/]+[\d.]+%?)?\s*\)$/i.exec(color);
        if (hslMatch) {
            const h = Number(hslMatch[1]);
            const s = Number(hslMatch[2]);
            const l = Math.max(0, Math.min(100, Math.round(Number(hslMatch[3]) + percent)));
            return color.startsWith('hsla') ? `hsla(${h}, ${s}%, ${l}%, 1)` : `hsl(${h}, ${s}%, ${l}%)`;
        }
        // Handle hex strings: #rgb, #rrggbb, #rrggbbaa.
        const hex = color.replace('#', '');
        if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return color;
        const adjust = (v: string): number =>
            Math.max(0, Math.min(255, Math.round(Number.parseInt(v, 16) + (percent / 100) * 255)));
        const toHex = (v: number): string => v.toString(16).padStart(2, '0');
        const r = toHex(adjust(hex.slice(0, 2)));
        const g = toHex(adjust(hex.slice(2, 4)));
        const b = toHex(adjust(hex.slice(4, 6)));
        return hex.length === 8 ? `#${r}${g}${b}${toHex(Number.parseInt(hex.slice(6, 8), 16))}` : `#${r}${g}${b}`;
    }

    /** Stroke a rectangle around a cell (hover/focus indicators). */
    private strokeCellRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        zoom: number,
        color: string,
        lineWidth: number,
    ): void {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, zoom - lineWidth, zoom - lineWidth);
        ctx.restore();
    }
}
