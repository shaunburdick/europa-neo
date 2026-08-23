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

import type { CellRenderInfo, MapEffect, MapLabel, MapView } from '../state/types';
import {
  CAPTURE_EFFECT_COLOR,
  CHIP_BACKGROUND,
  CHIP_TEXT,
  CITY_COLOR,
  COMBAT_EFFECT_COLOR,
  FOCUS_RING_COLOR,
  GENERIC_EFFECT_COLOR,
  PIPE_COLOR,
  terrainColor,
  VOID_COLOR,
} from './palette';

/** Fraction of the cell size used as the troop-disc radius. */
const UNIT_RADIUS_RATIO = 0.32;

/** Fraction of the cell size used for pipe triangle extent. */
const PIPE_SIZE_RATIO = 0.16;

/** Inset fraction for the city outline square. */
const CITY_INSET_RATIO = 0.12;

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
   * The caller owns canvas sizing: the canvas bitmap should be at
   * least `width * zoom × height * zoom` device pixels (App keeps it
   * in sync). Drawing clips naturally to the canvas bounds.
   *
   * @param mapView The immutable snapshot to paint.
   * @param ctx Target 2D context (its current transform is treated
   *            as identity over the board's pixel space).
   */
  paint(mapView: MapView, ctx: CanvasRenderingContext2D): void {
    const zoom = mapView.camera.zoom;
    const pixelWidth = mapView.width * zoom;
    const pixelHeight = mapView.height * zoom;

    // Pass 0: void backdrop (also clears the previous frame).
    ctx.fillStyle = VOID_COLOR;
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);

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

    // Pass 4: transient effects (combat flashes, capture rings).
    for (const effect of mapView.effects) {
      this.drawEffect(ctx, effect, zoom);
    }

    // Pass 5: transient labels ("70%" reserve confirmations).
    for (const label of mapView.labels) {
      this.drawLabel(ctx, label, zoom);
    }

    // Pass 6: hover highlight + selection focus ring on top so they
    // never disappear under units/pipes (WCAG 2.4.7 visual target).
    if (mapView.hover !== null) {
      this.strokeCellRect(
        ctx,
        mapView.hover.x * zoom,
        mapView.hover.y * zoom,
        zoom,
        'rgba(255,255,255,0.45)',
        1.5,
      );
    }
    if (mapView.selection !== null) {
      this.strokeCellRect(
        ctx,
        mapView.selection.x * zoom,
        mapView.selection.y * zoom,
        zoom,
        FOCUS_RING_COLOR,
        2,
      );
    }
  }

  /** Draw one cell's terrain fill (+ city outline when applicable). */
  private drawTerrain(ctx: CanvasRenderingContext2D, info: CellRenderInfo, zoom: number): void {
    const x = info.coord.x * zoom;
    const y = info.coord.y * zoom;
    ctx.fillStyle = terrainColor(info.terrain, info.elevation);
    ctx.fillRect(x, y, zoom, zoom);
    if (info.isCity) {
      const inset = zoom * CITY_INSET_RATIO;
      ctx.strokeStyle = CITY_COLOR;
      ctx.lineWidth = Math.max(1.5, zoom * 0.06);
      ctx.strokeRect(x + inset, y + inset, zoom - inset * 2, zoom - inset * 2);
    }
  }

  /** Draw the troop disc + count for an occupied cell. */
  private drawUnit(
    ctx: CanvasRenderingContext2D,
    info: CellRenderInfo,
    zoom: number,
    mapView: MapView,
  ): void {
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

  /** Draw outward-pointing pipe triangles at the cell's edges. */
  private drawPipes(ctx: CanvasRenderingContext2D, info: CellRenderInfo, zoom: number): void {
    const size = zoom * PIPE_SIZE_RATIO;
    const x = info.coord.x * zoom;
    const y = info.coord.y * zoom;
    const midX = x + zoom / 2;
    const midY = y + zoom / 2;
    ctx.fillStyle = PIPE_COLOR;
    for (const direction of info.pipes) {
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
      ctx.fill();
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

  /** Draw a transient text label with a dark chip backing. */
  private drawLabel(ctx: CanvasRenderingContext2D, label: MapLabel, zoom: number): void {
    const fontSize = Math.max(10, Math.round(zoom * 0.3));
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(label.text);
    const chipWidth = metrics.width + fontSize * 0.6;
    const chipHeight = fontSize * 1.3;
    const chipX = label.cell.x * zoom + zoom / 2 - chipWidth / 2;
    const chipY = label.cell.y * zoom;
    ctx.fillStyle = CHIP_BACKGROUND;
    ctx.fillRect(chipX, chipY, chipWidth, chipHeight);
    ctx.fillStyle = CHIP_TEXT;
    ctx.fillText(label.text, label.cell.x * zoom + zoom / 2, chipY + chipHeight / 2);
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
