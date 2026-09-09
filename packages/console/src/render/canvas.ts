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

/** Fraction of the cell size used as the troop-disc radius. */
const UNIT_RADIUS_RATIO = 0.32;

/** Fraction of the cell size used for pipe triangle extent. */
const PIPE_SIZE_RATIO = 0.16;

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

/** Options modifying one paint pass. */
export interface PaintOptions {
    /**
     * Honor `prefers-reduced-motion` (Q-A07 / WCAG 2.3.3): skip the
     * flashing combat/capture effect markers entirely. Default `false`.
     */
    readonly reducedMotion?: boolean;
}

/**
 * Canvas 2D painter for the satellite grid. Stateless: one instance
 * may serve any number of canvases and frames.
 */
export class MapCanvas {
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
     * @param options Optional paint modifiers (reduced motion).
     */
    paint(mapView: MapView, ctx: CanvasRenderingContext2D, options?: PaintOptions): void {
        const reducedMotion = options?.reducedMotion === true;
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

        // Pre-compute once: cached land band colors and their dark variants
        // eliminate ~5000 adjustBrightness regex calls per frame.
        const landBandColors = new Map<number, string>();
        const landBandDarkColors = new Map<number, string>();
        for (let b = 0; b < LAND_BAND_COUNT; b++) {
            const color = landBandColor(b);
            landBandColors.set(b, color);
            landBandDarkColors.set(b, this.adjustBrightness(color, -15));
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

        // Sub-pass 1c: land directional gradients (per-cell — gradients
        // are position-dependent, but band colors are pre-cached).
        for (const info of mapView.cells.values()) {
            if (info.terrain !== 'land') continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            const band = landBandIndex(info.elevation);
            const bandColor = landBandColors.get(band) ?? landBandColor(band);
            const darkColor = landBandDarkColors.get(band) ?? this.adjustBrightness(bandColor, -15);
            const grad = ctx.createLinearGradient(x, y, x + zoom, y + zoom);
            grad.addColorStop(0, bandColor);
            grad.addColorStop(1, darkColor);
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, zoom, zoom);
        }

        // Sub-pass 1d: batched land inner shadows — all dark edges in one
        // fillStyle assignment, then all light edges. Eliminates per-cell
        // save/restore and repeated fillStyle assignments.
        // design-exception: canvas fallback
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        for (const info of mapView.cells.values()) {
            if (info.terrain !== 'land') continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            ctx.fillRect(x, y, zoom, 1);
            ctx.fillRect(x, y, 1, zoom);
        }
        // design-exception: canvas fallback
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (const info of mapView.cells.values()) {
            if (info.terrain !== 'land') continue;
            const x = info.coord.x * zoom;
            const y = info.coord.y * zoom;
            ctx.fillRect(x, y + zoom - 1, zoom, 1);
            ctx.fillRect(x + zoom - 1, y, 1, zoom);
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
        // accessible name carries "Player N" so color is not the only
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

    /** Draw outward-pointing pipe triangles at the cell's edges.
     *  Triangle size scales with intensity (issue #43): smaller at
     *  low intensity, full size at high intensity. Stalled pipes
     *  remain full size with hollow stroke (existing behavior).
     *  Every pipe triangle gets a dark outline (spec 024 FR-010) to
     *  guarantee contrast against any biome background. */
    private drawPipes(ctx: CanvasRenderingContext2D, info: CellRenderInfo, zoom: number): void {
        const baseSize = zoom * PIPE_SIZE_RATIO;
        const x = info.coord.x * zoom;
        const y = info.coord.y * zoom;
        const midX = x + zoom / 2;
        const midY = y + zoom / 2;
        for (const direction of info.pipes) {
            // Slope classification precomputed by buildMapView (005
            // FR-013); a missing entry (defensive) renders flat.
            const slope = info.pipeSlopes.get(direction) ?? 'flat';
            // Intensity scales triangle size (issue #43): 0.4 at
            // intensity=0, 1.0 at intensity=1. Stalled pipes use
            // full size (hollow is the signal, not size).
            const intensity = info.pipeIntensities.get(direction) ?? 0;
            const size = slope === 'stalled' ? baseSize : baseSize * (0.4 + intensity * 0.6);
            ctx.beginPath();
            // Triangles point OUTWARD from cell center toward the pipe
            // direction — matching the original Europa rules: "lines
            // originating near the center of a cell and pointing in the
            // direction of the desired troops flow" (GH issue 101).
            if (direction === 'N') {
                ctx.moveTo(midX - size, midY);
                ctx.lineTo(midX + size, midY);
                ctx.lineTo(midX, midY - size * 1.6);
            } else if (direction === 'S') {
                ctx.moveTo(midX - size, midY);
                ctx.lineTo(midX + size, midY);
                ctx.lineTo(midX, midY + size * 1.6);
            } else if (direction === 'W') {
                ctx.moveTo(midX, midY - size);
                ctx.lineTo(midX, midY + size);
                ctx.lineTo(midX - size * 1.6, midY);
            } else {
                ctx.moveTo(midX, midY - size);
                ctx.lineTo(midX, midY + size);
                ctx.lineTo(midX + size * 1.6, midY);
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
                if (size * 1.6 > outlineWidth * 3) {
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
