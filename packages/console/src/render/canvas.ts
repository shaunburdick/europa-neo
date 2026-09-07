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
    landBandColor,
    landBandIndex,
    PIPE_DOWNHILL_COLOR,
    PIPE_FLAT_COLOR,
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

        // Pass 1: terrain (elevation shading, water, city outlines).
        for (const info of mapView.cells.values()) {
            this.drawTerrain(ctx, info, zoom);
        }

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

    /**
     * Draw one cell's terrain fill with visual enhancements.
     *
     * Water cells: gradient fill (linear, 4 color stops) + wave texture
     * (vertical lines at 4px spacing, 0.5px width, 4% white opacity).
     * Land cells: discrete elevation band (6 bands) + directional
     * gradient + inner shadow + contour hints (bands 3+).
     * City cells: existing border + radial glow overlay + glowing center
     * dot + glow border.
     *
     * @param ctx Target 2D context.
     * @param info Cell render data (terrain, elevation, isCity).
     * @param zoom Cell pixel size.
     */
    private drawTerrain(ctx: CanvasRenderingContext2D, info: CellRenderInfo, zoom: number): void {
        const x = info.coord.x * zoom;
        const y = info.coord.y * zoom;

        if (info.terrain === 'water') {
            // FR-001: water gradient fill (linear, top-left to bottom-right, 4 color stops).
            const depth = waterDepthForCell(info.elevation);
            const baseColor =
                depth <= 0
                    ? WATER_SHALLOW_COLOR
                    : depth >= 2
                      ? WATER_DEEP_COLOR
                      : terrainColor('water', info.elevation);
            const grad = ctx.createLinearGradient(x, y, x + zoom, y + zoom);
            grad.addColorStop(0, this.adjustBrightness(baseColor, 20));
            grad.addColorStop(0.33, baseColor);
            grad.addColorStop(0.66, this.adjustBrightness(baseColor, -10));
            grad.addColorStop(1, this.adjustBrightness(baseColor, -20));
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, zoom, zoom);

            // FR-001: wave texture — vertical lines at 4px spacing, 0.5px width, 4% white.
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 0.5;
            for (let wx = x; wx < x + zoom; wx += 4) {
                ctx.beginPath();
                ctx.moveTo(wx, y);
                ctx.lineTo(wx, y + zoom);
                ctx.stroke();
            }
            ctx.restore();
        } else {
            // FR-002: discrete land band + directional gradient + inner shadow.
            const band = landBandIndex(info.elevation);
            const bandColor = landBandColor(band);
            const darkColor = this.adjustBrightness(bandColor, -15);

            // Directional gradient: top-left to bottom-right.
            const grad = ctx.createLinearGradient(x, y, x + zoom, y + zoom);
            grad.addColorStop(0, bandColor);
            grad.addColorStop(1, darkColor);
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, zoom, zoom);

            // Inner shadow: 1px dark top/left edge, 1px light bottom/right edge.
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(x, y, zoom, 1);
            ctx.fillRect(x, y, 1, zoom);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(x, y + zoom - 1, zoom, 1);
            ctx.fillRect(x + zoom - 1, y, 1, zoom);
            ctx.restore();

            // FR-002: contour hints on bands 3+ (diagonal lines, 6px spacing, 10% black).
            if (band >= 3) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.10)';
                ctx.lineWidth = 0.5;
                const step = 6;
                for (let offset = -zoom; offset < zoom * 2; offset += step) {
                    ctx.beginPath();
                    ctx.moveTo(x + offset, y);
                    ctx.lineTo(x + offset + zoom, y + zoom);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // FR-003: city glow effects (drawn after terrain, before pipes).
        if (info.isCity) {
            const inset = zoom * CITY_INSET_RATIO;
            const cx = x + zoom / 2;
            const cy = y + zoom / 2;

            // Radial glow: 40% cell radius, cityGlowStrong → transparent.
            ctx.save();
            const glowRadius = zoom * 0.4;
            const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
            glowGrad.addColorStop(0, CITY_GLOW_STRONG_COLOR);
            glowGrad.addColorStop(1, 'rgba(255, 68, 68, 0)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(x, y, zoom, zoom);
            ctx.restore();

            // Center dot with shadow blur.
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(1, zoom * 0.06), 0, Math.PI * 2);
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
     *  remain full size with hollow stroke (existing behavior). */
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
            if (direction === 'N') {
                ctx.moveTo(midX - size, y);
                ctx.lineTo(midX + size, y);
                ctx.lineTo(midX, y + size * 1.6);
            } else if (direction === 'S') {
                ctx.moveTo(midX - size, y + zoom);
                ctx.lineTo(midX + size, y + zoom);
                ctx.lineTo(midX, y + zoom - size * 1.6);
            } else if (direction === 'W') {
                ctx.moveTo(x, midY - size);
                ctx.lineTo(x, midY + size);
                ctx.lineTo(x + size * 1.6, midY);
            } else {
                ctx.moveTo(x + zoom, midY - size);
                ctx.lineTo(x + zoom, midY + size);
                ctx.lineTo(x + zoom - size * 1.6, midY);
            }
            ctx.closePath();
            if (slope === 'stalled') {
                // Hollow treatment (005 FR-013): outline-only triangle
                // in the stalled color — visually distinct from the
                // filled triangles of flowing pipes.
                ctx.strokeStyle = pipeSlopeColor(slope);
                ctx.lineWidth = Math.max(1.5, zoom * 0.06);
                ctx.stroke();
            } else {
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
     * Adjust the brightness of a hex color string by a percentage.
     *
     * Parses `#rrggbb` or `#rrggbbaa`, adjusts R/G/B channels by
     * `percent`% of 255, clamps each channel to 0–255, returns adjusted
     * hex string. rgb/rgba strings are returned unchanged (can't adjust
     * reliably).
     *
     * @param hex Color string (#rrggbb, #rrggbbaa, or rgb/rgba passthrough).
     * @param percent Brightness adjustment (-100 to +100). Positive = lighter.
     * @returns Adjusted color string in the same format as input.
     */
    private adjustBrightness(hex: string, percent: number): string {
        if (!hex) return '';
        // Return rgb/rgba strings unchanged — can't parse reliably.
        if (hex.startsWith('rgb')) return hex;
        const match6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
        if (match6) {
            const r = Math.max(0, Math.min(255, Math.round(Number.parseInt(match6[1], 16) + (percent / 100) * 255)));
            const g = Math.max(0, Math.min(255, Math.round(Number.parseInt(match6[2], 16) + (percent / 100) * 255)));
            const b = Math.max(0, Math.min(255, Math.round(Number.parseInt(match6[3], 16) + (percent / 100) * 255)));
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        const match8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
        if (match8) {
            const r = Math.max(0, Math.min(255, Math.round(Number.parseInt(match8[1], 16) + (percent / 100) * 255)));
            const g = Math.max(0, Math.min(255, Math.round(Number.parseInt(match8[2], 16) + (percent / 100) * 255)));
            const b = Math.max(0, Math.min(255, Math.round(Number.parseInt(match8[3], 16) + (percent / 100) * 255)));
            const a = Number.parseInt(match8[4], 16);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a.toString(16).padStart(2, '0')}`;
        }
        return '';
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
