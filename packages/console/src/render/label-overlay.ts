/**
 * Transient label overlay painter — Feature 005 (T071).
 *
 * Draws the `MapView.labels` layer — the transient text chips
 * ("70%" after a reserve change, spec US4 AC-1; FR-007 transient
 * confirmation) — at each label's cell position. Extracted from the
 * `MapCanvas` painter (T045 pass 5) into its own module so US5's
 * transient-feedback surfaces can reuse the exact same chip style,
 * per the task's "shared with US5's transient feedback infrastructure"
 * note.
 *
 * Lifecycle: labels are raised by `buildMapView` (T024) when a cell's
 * reserves changed since the previous snapshot and stamped with
 * `expiresAtMs = raisedAtMs + CONSOLE_CONSTANTS.labelTtlMs` (1500 ms).
 * The contract keeps `ConsoleState` free of label bookkeeping, so
 * expiry is enforced here: {@link liveLabels} drops labels whose
 * deadline has passed (the data-model.md §6 "auto-removed" rule —
 * evaluated against the caller-supplied monotonic clock instead of a
 * reducer effect, which the frozen `ReducerEffect` union has no
 * variant for). Pure drawing + pure filtering; no clock reads.
 *
 * JSDoc references: FR-007 + spec US4 AC-1 + data-model.md §6.
 */

import type { MapLabel } from '../state/types';
import { CHIP_BACKGROUND, CHIP_TEXT } from './palette';

/**
 * Draw every label in `labels` as a dark chip with bold centered
 * text pinned to the top edge of its cell. Deterministic: same input
 * yields identical strokes (SC-002 render determinism). Clipping to
 * the canvas bounds is natural.
 *
 * @param ctx   Target 2D context (identity transform over board pixels).
 * @param labels Labels to draw (pre-filtered with {@link liveLabels}).
 * @param zoom  Cell size in CSS pixels (camera zoom).
 */
export function drawMapLabels(ctx: CanvasRenderingContext2D, labels: readonly MapLabel[], zoom: number): void {
    for (const label of labels) {
        drawLabelChip(ctx, label, zoom);
    }
}

/**
 * Filter out expired labels. A label is live while
 * `nowMs <= expiresAtMs`; strictly-after is removed (data-model.md
 * §6: "auto-removed" once the TTL elapses). Pure.
 *
 * @param labels Candidate labels (any order).
 * @param nowMs  Monotonic clock reading.
 */
export function liveLabels(labels: readonly MapLabel[], nowMs: number): readonly MapLabel[] {
    return labels.filter((label) => nowMs <= label.expiresAtMs);
}

/**
 * Earliest expiry among `labels`, or `null` when none are live.
 * Callers use this to schedule the repaint that removes expired
 * chips without waiting for the next state change. Pure.
 *
 * @param labels Candidate labels.
 * @param nowMs  Monotonic clock reading.
 */
export function nextLabelExpiryMs(labels: readonly MapLabel[], nowMs: number): number | null {
    let earliest: number | null = null;
    for (const label of labels) {
        if (label.expiresAtMs > nowMs && (earliest === null || label.expiresAtMs < earliest)) {
            earliest = label.expiresAtMs;
        }
    }
    return earliest;
}

/** Draw one label chip (dark plate + white bold text). */
function drawLabelChip(ctx: CanvasRenderingContext2D, label: MapLabel, zoom: number): void {
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
