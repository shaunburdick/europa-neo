/**
 * Bevel geometry for feature 017: the mitred trapezoid each side paints
 * and the vertex caps that close the taper where bands meet. Pure; the
 * caller supplies the band records sub-pass 1d already derived.
 *
 * Rectangle-heavy by design: a capped band end is the full band width,
 * so almost every band is painted as a rect and only a lone end keeps
 * its taper. A same-tile corner with two different tones adds one square
 * and one triangle, which keeps the cap rule without thousands of
 * triangle paths. Shapes are returned as flat coordinate runs per
 * colour — bands and squares are 4-point (stride 8), caps 3-point
 * (stride 6) — so the painter allocates no per-band path objects.
 */

import type { ReliefSide } from './relief';

/** One band's geometry and colour, in board-pixel space. */
export interface ReliefBand {
    readonly x: number;
    readonly y: number;
    readonly size: number;
    readonly side: ReliefSide;
    readonly width: number;
    readonly colour: string;
}

/** Flat polygon coordinates keyed by fill colour. */
export type ReliefBuckets = ReadonlyMap<string, readonly number[]>;

/** Everything sub-pass 1d paints, by phase. */
export interface ReliefGeometry {
    /** Band polygons, 4 points each (stride 8), painted first. */
    readonly bands: ReliefBuckets;
    /** Same-tile corner squares, 4 points each (stride 8), painted second. */
    readonly squares: ReliefBuckets;
    /** The other half of each two-tone corner, 3 points each (stride 6), last. */
    readonly caps: ReliefBuckets;
}

/** Side indices used for the per-tile lookup and the corner pair order. */
const SIDE_INDEX: Readonly<Record<ReliefSide, number>> = { N: 0, E: 1, S: 2, W: 3 };

/** Key for one tile side; board coordinates are far below 4096. */
function tileSideKey(band: ReliefBand): number {
    const tileX = Math.round(band.x / band.size);
    const tileY = Math.round(band.y / band.size);
    return (tileY * 4096 + tileX) * 4 + SIDE_INDEX[band.side];
}

/** Key for one vertex; pixel coordinates are far below 65536. */
function vertexKey(x: number, y: number): number {
    return y * 65536 + x;
}

/** Append one polygon's coordinates to its colour's run. */
function push(buckets: Map<string, number[]>, colour: string, coordinates: readonly number[]): void {
    const run = buckets.get(colour);
    if (run === undefined) {
        buckets.set(colour, [...coordinates]);
    } else {
        run.push(...coordinates);
    }
}

/**
 * Build every band shape plus the corner caps of one relief sub-pass.
 *
 * @param bands Every band sub-pass 1d derived, in any order.
 */
export function reliefGeometry(bands: readonly ReliefBand[]): ReliefGeometry {
    // Sorted so path order — and therefore antialiasing where a taper
    // meets another band — is a pure function of the band set, never of
    // cell insertion order (FR-004's determinism clause).
    const ordered = [...bands].sort(
        (first, second) => first.y - second.y || first.x - second.x || SIDE_INDEX[first.side] - SIDE_INDEX[second.side],
    );
    // Pass 1: how many band ends land on each vertex. Two or more fill
    // every cut triangle there; a lone end keeps its taper.
    const endsAtVertex = new Map<number, number>();
    const count = (key: number): void => {
        endsAtVertex.set(key, (endsAtVertex.get(key) ?? 0) + 1);
    };
    for (const band of ordered) {
        const { x, y, size } = band;
        switch (band.side) {
            case 'N':
                count(vertexKey(x, y));
                count(vertexKey(x + size, y));
                break;
            case 'S':
                count(vertexKey(x, y + size));
                count(vertexKey(x + size, y + size));
                break;
            case 'W':
                count(vertexKey(x, y));
                count(vertexKey(x, y + size));
                break;
            case 'E':
                count(vertexKey(x + size, y));
                count(vertexKey(x + size, y + size));
                break;
        }
    }
    const isCapped = (x: number, y: number): boolean => (endsAtVertex.get(vertexKey(x, y)) ?? 0) >= 2;

    // Pass 2: band polygons — the full rect at capped ends, taper at lone
    // ends — plus the per-tile side lookup the corner split needs.
    const bandShapes = new Map<string, number[]>();
    const byTileSide = new Map<number, ReliefBand>();
    for (const band of ordered) {
        const { x, y, size, width, side, colour } = band;
        byTileSide.set(tileSideKey(band), band);
        let startInset = width;
        let endInset = width;
        switch (side) {
            case 'N':
                if (isCapped(x, y)) startInset = 0;
                if (isCapped(x + size, y)) endInset = 0;
                push(bandShapes, colour, [
                    x,
                    y,
                    x + size,
                    y,
                    x + size - endInset,
                    y + width,
                    x + startInset,
                    y + width,
                ]);
                break;
            case 'S':
                if (isCapped(x, y + size)) startInset = 0;
                if (isCapped(x + size, y + size)) endInset = 0;
                // Same winding as N/W/E: overlapping bands of one colour
                // must not cancel under the nonzero fill rule.
                push(bandShapes, colour, [
                    x + startInset,
                    y + size - width,
                    x + size - endInset,
                    y + size - width,
                    x + size,
                    y + size,
                    x,
                    y + size,
                ]);
                break;
            case 'W':
                if (isCapped(x, y)) startInset = 0;
                if (isCapped(x, y + size)) endInset = 0;
                push(bandShapes, colour, [
                    x,
                    y,
                    x + width,
                    y + startInset,
                    x + width,
                    y + size - endInset,
                    x,
                    y + size,
                ]);
                break;
            case 'E':
                if (isCapped(x + size, y)) startInset = 0;
                if (isCapped(x + size, y + size)) endInset = 0;
                push(bandShapes, colour, [
                    x + size,
                    y,
                    x + size,
                    y + size,
                    x + size - width,
                    y + size - endInset,
                    x + size - width,
                    y + startInset,
                ]);
                break;
        }
    }

    // Pass 3: a tile's two adjacent bands meet at a corner. Two different
    // tones there need a diagonal split; equal tones are already covered
    // by the overlapping band rects, and a lone side is already the full
    // corner square once its end is capped.
    const squares = new Map<string, number[]>();
    const caps = new Map<string, number[]>();
    const corners: ReadonlyArray<{
        readonly corner: 'NW' | 'NE' | 'SW' | 'SE';
        readonly first: ReliefSide;
        readonly second: ReliefSide;
    }> = [
        { corner: 'NW', first: 'N', second: 'W' },
        { corner: 'NE', first: 'N', second: 'E' },
        { corner: 'SW', first: 'S', second: 'W' },
        { corner: 'SE', first: 'S', second: 'E' },
    ];
    for (const band of ordered) {
        for (const { corner, first, second } of corners) {
            if (band.side !== first) {
                continue;
            }
            const tileX = Math.round(band.x / band.size);
            const tileY = Math.round(band.y / band.size);
            const partner = byTileSide.get((tileY * 4096 + tileX) * 4 + SIDE_INDEX[second]);
            if (partner === undefined || partner.colour === band.colour) {
                continue;
            }
            const wider = band.width >= partner.width ? band : partner;
            const narrower = wider === band ? partner : band;
            const size = narrower.width;
            const origin = squareOrigin(band, corner, size);
            push(squares, wider.colour, [
                origin.x,
                origin.y,
                origin.x + size,
                origin.y,
                origin.x + size,
                origin.y + size,
                origin.x,
                origin.y + size,
            ]);
            push(caps, narrower.colour, cutTriangle(narrower, corner));
        }
    }

    return { bands: bandShapes, squares, caps };
}

/** The corner square's top-left for a cap of `size` px. */
function squareOrigin(
    band: ReliefBand,
    corner: 'NW' | 'NE' | 'SW' | 'SE',
    size: number,
): { readonly x: number; readonly y: number } {
    const left = corner === 'NW' || corner === 'SW' ? band.x : band.x + band.size - size;
    const top = corner === 'NW' || corner === 'NE' ? band.y : band.y + band.size - size;
    return { x: left, y: top };
}

/** A band end's cut triangle at `corner`, at the band's own width. */
function cutTriangle(band: ReliefBand, corner: 'NW' | 'NE' | 'SW' | 'SE'): readonly number[] {
    const { x, y, size, width } = band;
    switch (corner) {
        case 'NW':
            return band.side === 'N'
                ? [x, y, x, y + width, x + width, y + width]
                : [x, y, x + width, y, x + width, y + width];
        case 'NE':
            return band.side === 'N'
                ? [x + size, y, x + size, y + width, x + size - width, y + width]
                : [x + size, y, x + size - width, y, x + size - width, y + width];
        case 'SW':
            return band.side === 'S'
                ? [x, y + size, x, y + size - width, x + width, y + size - width]
                : [x, y + size, x + width, y + size, x + width, y + size - width];
        case 'SE':
            return band.side === 'S'
                ? [x + size, y + size, x + size, y + size - width, x + size - width, y + size - width]
                : [x + size, y + size, x + size - width, y + size, x + size - width, y + size - width];
    }
}
