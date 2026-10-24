/**
 * Board surface treatment — feature 018: coastline width, per-tile grain,
 * zone-seam width and the elevation-contour interval. Pure mappings; the
 * painter owns geometry and paint order.
 *
 * Grain is derived from the cell's own coordinates alone, so it cannot
 * read elevation, zone or a neighbour and cannot leak a fog-hidden cell
 * (FR-003). The offset set is deliberately non-positive: 017 FR-006's
 * tightest floor is Peaks's lit bevel against the texture's lightest
 * stop (1.220:1), which any positive shift breaks. See plan D1.
 *
 * The contour interval is an elevation threshold derived from a visible
 * neighbour, so it says nothing a bevel does not already state and never
 * reads a cell the fog hides (FR-004).
 */

import type { Coord } from '../state/types';

/** Coast band width as a fraction of the cell (feature 017 step 1). */
export const COAST_WIDTH_RATIO = 0.04;

/**
 * Band width in CSS px for a tile of `size` px (FR-001).
 *
 * @param size Tile side length in CSS px.
 */
export function coastBandWidth(size: number): number {
    return size * COAST_WIDTH_RATIO;
}

/**
 * The four face-grain offsets in HSL lightness points (FR-003): four
 * distinct values in 0 to −2, never positive — see the module note.
 */
export const LAND_FACE_GRAIN_OFFSETS = [0, -0.5, -1, -2] as const;

/** The zone seam is one CSS pixel at every zoom (FR-002). */
export const SEAM_WIDTH_PX = 1;

/**
 * Elevation levels between contour lines (FR-004). Measured over 50
 * generated boards (sizes 32 and 48, 25 seeds each, 142,940 land–land
 * edges, elevations 87–206): a level crosses 18.4 % of those edges —
 * 0.35 lines per land tile, one line every ~2.9 tiles, 3–5 bands per
 * board, 30 % of tiles touching a line. 24 levels measured 20.9 %
 * (0.40 per tile) and 8 levels 55.3 % (1.05 per tile, a line on every
 * tile), so 28 is the sparse end that still yields a network.
 *
 * 28 is also the nearest sparse interval that puts no level on a zone
 * threshold (80 / 160 / 208): at 32 a level lands exactly on 160, the
 * zone 1/2 cut, so 17.7 % of its lines fell under the opaque zone seam
 * and vanished; at 28 that share is 1.3 %, at 36 0.1 %.
 */
export const CONTOUR_INTERVAL = 28;

/** A contour line is one CSS pixel at every zoom (FR-004). */
export const CONTOUR_WIDTH_PX = 1;

/**
 * Start coordinate of a `width` px line whose trailing edge marks `edge`
 * (FR-002, FR-004), snapped so the line covers whole bitmap pixels.
 * `offset` is the paint's viewport translate: the snap happens in the
 * bitmap's frame, because a fractional translate would spread the line
 * over two columns again. The canvas bitmap is 1:1 with CSS px, so a
 * whole bitmap pixel is an integer there.
 *
 * @param edge Cell-boundary coordinate in board px.
 * @param offset Board-space origin of the paint's translate.
 * @param width Line width in px.
 */
export function snappedLineStart(edge: number, offset: number, width: number): number {
    return Math.round(edge - offset) + offset - width;
}

/**
 * Center of a 1 px stroke marking `edge`, snapped to the whole bitmap pixel
 * at the nearest integer coordinate. This is the stroke-center form of the
 * round-in-bitmap-frame rule {@link snappedLineStart} applies; the minimap
 * paints untranslated, so there is no offset. On an integer edge it equals
 * the `edge + 0.5` alignment the indicator used before the snap.
 *
 * @param edge Edge coordinate in bitmap px.
 */
export function snappedStrokeCenter(edge: number): number {
    return Math.round(edge) + 0.5;
}

/**
 * The contour band an elevation falls in; two neighbours are separated by
 * a contour line exactly when their bands differ (FR-004).
 *
 * @param elevation Integer 0–255.
 */
export function elevationBand(elevation: number): number {
    return Math.floor(elevation / CONTOUR_INTERVAL);
}

/**
 * Whether a contour line crosses the edge between two elevations (FR-004).
 *
 * @param ownElevation This cell's elevation.
 * @param neighbourElevation The adjacent visible land cell's elevation.
 */
export function contourCrosses(ownElevation: number, neighbourElevation: number): boolean {
    return elevationBand(ownElevation) !== elevationBand(neighbourElevation);
}

/**
 * A stable 0–3 index from the cell's coordinates only. The 32-bit mix
 * keeps neighbouring cells from sharing an offset in a visible pattern.
 *
 * @param coord Board coordinate.
 */
export function grainOffsetIndex(coord: Coord): number {
    let hash = Math.imul(coord.x, 73856093) ^ Math.imul(coord.y, 19349663);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    hash = (hash ^ (hash >>> 16)) >>> 0;
    return hash % LAND_FACE_GRAIN_OFFSETS.length;
}

/**
 * The tile's grain offset in HSL lightness points (FR-003).
 *
 * @param coord Board coordinate.
 */
export function landFaceGrainOffset(coord: Coord): number {
    return LAND_FACE_GRAIN_OFFSETS[grainOffsetIndex(coord)] ?? 0;
}
