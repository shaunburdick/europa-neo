/**
 * Board surface treatment — feature 018: coastline width, per-tile grain
 * and zone-seam width. Pure mappings; the painter owns geometry and
 * paint order.
 *
 * Grain is derived from the cell's own coordinates alone, so it cannot
 * read elevation, zone or a neighbour and cannot leak a fog-hidden cell
 * (FR-003). The offset set is deliberately non-positive: 017 FR-006's
 * tightest floor is Peaks's lit bevel against the texture's lightest
 * stop (1.220:1), which any positive shift breaks. See plan D1.
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
