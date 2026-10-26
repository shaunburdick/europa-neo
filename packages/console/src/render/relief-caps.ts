/**
 * Bevel geometry for feature 017: the mitred trapezoid each side paints
 * and the vertex composition where bands meet. Pure; the caller supplies
 * the band records sub-pass 1d already derived.
 *
 * Per vertex, every band end is paired by the first rule that accepts
 * it: a tile's own two adjacent bands split their corner on the
 * outer→inner diagonal (rule 1); two collinear ends of one tone butt and
 * run on as one line (rule 2); a perpendicular diagonal pair (rule 3)
 * and an unpaired end (rule 4) keep their taper. Every rule lands as the
 * end inset of the band's trapezoid, so a corner needs no shape of its
 * own.
 *
 * Layout is flat and typed because this runs per frame: end attributes
 * live in parallel arrays and each vertex's ends form a linked list
 * through `nextEnd`, so no per-end object is created. Each trapezoid is
 * emitted as an axis-aligned body plus its taper wedges, because the
 * canvas' rect fast path is about ten times cheaper than a path per
 * band (Q-P05's 6 ms relief bound leaves little room).
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

/** Flat shape coordinates keyed by fill colour. */
type ReliefBuckets = ReadonlyMap<string, readonly number[]>;

/** Everything sub-pass 1d paints, by phase. */
export interface ReliefGeometry {
    /** Band bodies, `(x, y, width, height)` rects (stride 4), painted first. */
    readonly bodies: ReliefBuckets;
    /** Taper wedges closing a band end, 3 points each (stride 6), painted last. */
    readonly tapers: ReliefBuckets;
}

/** Side indices used for the per-band sort. */
const SIDE_INDEX: Readonly<Record<ReliefSide, number>> = { N: 0, E: 1, S: 2, W: 3 };

/** Key for one vertex; pixel coordinates are far below 65536. */
function vertexKey(x: number, y: number): number {
    return y * 65536 + x;
}

/** Append a rect — one band body — without a temporary array. */
function pushRect(
    buckets: Map<string, number[]>,
    colour: string,
    x: number,
    y: number,
    width: number,
    height: number,
): void {
    const run = buckets.get(colour);
    if (run === undefined) {
        buckets.set(colour, [x, y, width, height]);
    } else {
        run.push(x, y, width, height);
    }
}

/** Append six coordinates — one taper wedge — without a temporary array. */
function pushWedge(
    buckets: Map<string, number[]>,
    colour: string,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
): void {
    const run = buckets.get(colour);
    if (run === undefined) {
        buckets.set(colour, [ax, ay, bx, by, cx, cy]);
    } else {
        run.push(ax, ay, bx, by, cx, cy);
    }
}

/** Emit one band: its axis-aligned body and the wedges closing its tapered ends. */
function emitBand(
    band: ReliefBand,
    startInset: number,
    endInset: number,
    bodies: Map<string, number[]>,
    tapers: Map<string, number[]>,
): void {
    const { x, y, size, width, side, colour } = band;
    const length = size - startInset - endInset;
    switch (side) {
        case 'N':
            pushRect(bodies, colour, x + startInset, y, length, width);
            if (startInset !== 0) {
                pushWedge(tapers, colour, x, y, x + startInset, y, x + startInset, y + width);
            }
            if (endInset !== 0) {
                pushWedge(tapers, colour, x + size, y, x + size - endInset, y, x + size - endInset, y + width);
            }
            return;
        case 'S':
            pushRect(bodies, colour, x + startInset, y + size - width, length, width);
            if (startInset !== 0) {
                pushWedge(tapers, colour, x, y + size, x + startInset, y + size, x + startInset, y + size - width);
            }
            if (endInset !== 0) {
                pushWedge(
                    tapers,
                    colour,
                    x + size,
                    y + size,
                    x + size - endInset,
                    y + size,
                    x + size - endInset,
                    y + size - width,
                );
            }
            return;
        case 'W':
            pushRect(bodies, colour, x, y + startInset, width, length);
            if (startInset !== 0) {
                pushWedge(tapers, colour, x, y, x, y + startInset, x + width, y + startInset);
            }
            if (endInset !== 0) {
                pushWedge(tapers, colour, x, y + size, x, y + size - endInset, x + width, y + size - endInset);
            }
            return;
        case 'E':
            pushRect(bodies, colour, x + size - width, y + startInset, width, length);
            if (startInset !== 0) {
                pushWedge(tapers, colour, x + size, y, x + size, y + startInset, x + size - width, y + startInset);
            }
            if (endInset !== 0) {
                pushWedge(
                    tapers,
                    colour,
                    x + size,
                    y + size,
                    x + size,
                    y + size - endInset,
                    x + size - width,
                    y + size - endInset,
                );
            }
            return;
    }
}

/**
 * Build every band shape of one relief sub-pass, with each end shaped by
 * the rule its vertex selected.
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
    const endCount = ordered.length * 2;
    // One entry per band end: its vertex, which quadrant its tile
    // occupies there (+1 east/south), its axis, width and tone, and the
    // inset its end will paint at.
    const endKey = new Float64Array(endCount);
    const endQx = new Int8Array(endCount);
    const endQy = new Int8Array(endCount);
    const endHorizontal = new Uint8Array(endCount);
    const endWidth = new Float64Array(endCount);
    const endColour = new Uint16Array(endCount);
    const inset = new Float64Array(endCount);
    const colourIds = new Map<string, number>();
    for (const [index, band] of ordered.entries()) {
        const { x, y, size, side } = band;
        const horizontal = side === 'N' || side === 'S';
        let firstX = x;
        let firstY = y;
        let secondX = x + size;
        let secondY = y;
        switch (side) {
            case 'N':
                break;
            case 'S':
                firstY = y + size;
                secondY = firstY;
                break;
            case 'W':
                secondX = x;
                secondY = y + size;
                break;
            case 'E':
                firstX = x + size;
                secondX = firstX;
                secondY = y + size;
                break;
        }
        let colour = colourIds.get(band.colour);
        if (colour === undefined) {
            colour = colourIds.size;
            colourIds.set(band.colour, colour);
        }
        for (let which = 0; which < 2; which++) {
            const id = index * 2 + which;
            endKey[id] = which === 0 ? vertexKey(firstX, firstY) : vertexKey(secondX, secondY);
            endQx[id] = horizontal ? (which === 0 ? 1 : -1) : side === 'W' ? 1 : -1;
            endQy[id] = horizontal ? (side === 'N' ? 1 : -1) : which === 0 ? 1 : -1;
            endHorizontal[id] = horizontal ? 1 : 0;
            endWidth[id] = band.width;
            endColour[id] = colour;
            // Rule 4: an unpaired end keeps its taper at its own width.
            inset[id] = band.width;
        }
    }

    // Bucket the ends by vertex: `heads` holds each vertex's first end,
    // `nextEnd` chains the rest, so a vertex costs no array of its own.
    const nextEnd = new Int32Array(endCount).fill(-1);
    const heads = new Map<number, number>();
    for (let id = 0; id < endCount; id++) {
        const key = endKey[id] ?? 0;
        const head = heads.get(key);
        heads.set(key, id);
        if (head !== undefined) nextEnd[id] = head;
    }

    // Each vertex's ends pair up. Rule 1 runs first: a tile's own corner
    // must never fall back to a harder termination, so it wins a band end
    // that a collinear neighbour would otherwise have butted.
    const paired = new Uint8Array(endCount);
    const advance = (id: number): number => nextEnd[id] ?? -1;
    for (const head of heads.values()) {
        for (let id = head; id !== -1; id = advance(id)) {
            if (paired[id] === 1) {
                continue;
            }
            for (let other = advance(id); other !== -1; other = advance(other)) {
                if (
                    paired[other] === 1 ||
                    endHorizontal[other] === endHorizontal[id] ||
                    endQx[other] !== endQx[id] ||
                    endQy[other] !== endQy[id]
                ) {
                    continue;
                }
                // Rule 1: one tile's corner. The horizontal band's body
                // covers the whole corner, so only the vertical end stops
                // at the horizontal band's width: its wedge is the
                // triangle touching the vertical edge, and everything
                // above the shared diagonal stays the horizontal band's
                // tone. One tone needs no wedge at all.
                if (endColour[id] === endColour[other]) {
                    inset[id] = 0;
                    inset[other] = 0;
                } else if (endHorizontal[id] === 1) {
                    inset[id] = 0;
                    inset[other] = endWidth[id] ?? 0;
                } else {
                    inset[id] = endWidth[other] ?? 0;
                    inset[other] = 0;
                }
                paired[id] = 1;
                paired[other] = 1;
                break;
            }
        }
        for (let id = head; id !== -1; id = advance(id)) {
            if (paired[id] === 1) {
                continue;
            }
            for (let other = advance(id); other !== -1; other = advance(other)) {
                if (
                    paired[other] === 1 ||
                    endHorizontal[other] !== endHorizontal[id] ||
                    endColour[other] !== endColour[id]
                ) {
                    continue;
                }
                // Rule 2: collinear — one axis, the same side of that
                // axis, facing opposite ways — so the two runs continue.
                const collinear =
                    endHorizontal[id] === 1
                        ? endQy[other] === endQy[id] && endQx[other] === -(endQx[id] ?? 0)
                        : endQx[other] === endQx[id] && endQy[other] === -(endQy[id] ?? 0);
                if (!collinear) {
                    continue;
                }
                inset[id] = 0;
                inset[other] = 0;
                paired[id] = 1;
                paired[other] = 1;
                break;
            }
        }
    }

    // Band shapes. Everything else on the vertex is a lone taper (rule
    // 4): a perpendicular diagonal pair (rule 3) fills nothing, because
    // filling it turns the low tile's plain corner into a bowtie.
    const bodies = new Map<string, number[]>();
    const tapers = new Map<string, number[]>();
    for (const [index, band] of ordered.entries()) {
        emitBand(band, inset[index * 2] ?? band.width, inset[index * 2 + 1] ?? band.width, bodies, tapers);
    }

    return { bodies, tapers };
}
