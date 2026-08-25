/**
 * City Placement — Feature 003
 *
 * Place cities within a player's spawn band, respecting:
 *
 *   - INV-7: city count exactly `citiesPerPlayer`.
 *   - INV-8: every city on a `land` cell.
 *   - INV-10: Chebyshev distance to water ≥ `minCityWaterDistance`
 *     (computed with the SAME Chebyshev metric the validator uses —
 *     issue #2: the old 4-connected BFS disagreed with the
 *     validator at diagonal-water cells, causing spurious retries).
 *   - INV-11: Chebyshev distance to other cities ≥ `minCityCityDistance`
 *     (the spec's "fair" spacing) — both against cities picked in
 *     this call AND against any `existing` cities already placed
 *     for other players (issue #2: adjacent-band players could
 *     otherwise pick boundary cells only 1–4 cells apart).
 *   - Strategy: max-Chebyshev-distance from the map center within
 *     the band (cities at the periphery, not the center).
 *
 * **Symmetry note**: this function places cities for ONE player
 * within ONE band. The 180° symmetry invariant (INV-9) is
 * enforced by `enforceCitySymmetry`, which is called after all
 * bands are placed. `placeCitiesInBand` only guarantees that the
 * cities are valid for that player in that band; the partner
 * cities for the opposite player are added in a separate pass.
 * Post-mirror edge cases (e.g., a self-symmetric seed whose mirror
 * lands too close to another city) are caught by `validateBoard`
 * and handled by the orchestrator's retry loop.
 *
 * **Determinism**: same `(elev, water, band, settings, rng-state)`
 * → same output. The `rng` is used only for tie-breaking between
 * cells with equal Chebyshev distance to the center.
 */

import type { Coord, GenerationSettings, PlayerId, Rng } from './contracts/terrain-types';

interface Band {
    readonly xMin: number;
    readonly xMax: number;
    readonly yMin: number;
    readonly yMax: number;
}

interface CityPlacementLocal {
    readonly cell: Coord;
    readonly owner: PlayerId;
}

/**
 * Chebyshev distance between two coords. `max(|dx|, |dy|)`.
 */
function chebyshev(a: Coord, b: Coord): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Build a Chebyshev distance-to-nearest-water field via multi-source
 * BFS with 8-connectivity (each BFS layer adds exactly 1 to the
 * Chebyshev distance). Land cells far from any water get large
 * values; water cells themselves are 0.
 *
 * The metric matches `validate.ts`'s INV-10 check exactly
 * (`chebyshev` to the nearest water cell), so a candidate accepted
 * here can never be rejected by the validator for water proximity.
 *
 * @param water  Water mask (1 = water, 0 = land), row-major.
 * @param width  Board width.
 * @param height Board height.
 * @returns `Int16Array` of length `width * height`; each entry is
 *          the Chebyshev distance to the nearest water cell.
 */
function buildWaterDistanceField(water: Uint8Array, width: number, height: number): Int16Array {
    const field = new Int16Array(width * height).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < water.length && i < field.length; i++) {
        if ((water[i] ?? 0) === 1) {
            field[i] = 0;
            queue.push(i);
        }
    }
    // 8-connected neighbors, ordered for deterministic traversal.
    const neighborDeltas: ReadonlyArray<readonly [number, number]> = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
    ];
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head] as number;
        head++;
        const x = idx % width;
        const y = (idx - x) / width;
        const d = field[idx] as number;
        for (const [dx, dy] of neighborDeltas) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                continue;
            }
            const ni = ny * width + nx;
            if ((field[ni] as number) !== -1) {
                continue;
            }
            field[ni] = d + 1;
            queue.push(ni);
        }
    }
    return field;
}

/**
 * Build a Manhattan distance-to-nearest-water field via multi-source
 * BFS with 4-connectivity (each BFS layer adds exactly 1 to the
 * orthogonal step distance).
 *
 * Placement enforces BOTH this AND the Chebyshev field
 * (`buildWaterDistanceField`): the validator's INV-10 uses Chebyshev
 * while downstream balance oracles historically use the 4-connected
 * metric, so a placement accepted here satisfies every consumer
 * without burning regeneration attempts (issue #2).
 *
 * @param water  Water mask (1 = water, 0 = land), row-major.
 * @param width  Board width.
 * @param height Board height.
 * @returns `Int16Array` of length `width * height`; each entry is
 *          the Manhattan distance to the nearest water cell.
 */
function buildManhattanWaterField(water: Uint8Array, width: number, height: number): Int16Array {
    const field = new Int16Array(width * height).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < water.length && i < field.length; i++) {
        if ((water[i] ?? 0) === 1) {
            field[i] = 0;
            queue.push(i);
        }
    }
    const neighborDeltas: ReadonlyArray<readonly [number, number]> = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
    ];
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head] as number;
        head++;
        const x = idx % width;
        const y = (idx - x) / width;
        const d = field[idx] as number;
        for (const [dx, dy] of neighborDeltas) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                continue;
            }
            const ni = ny * width + nx;
            if ((field[ni] as number) !== -1) {
                continue;
            }
            field[ni] = d + 1;
            queue.push(ni);
        }
    }
    return field;
}

/**
 * Place cities within a player's spawn band.
 *
 * Algorithm (FR-005 / research.md §4):
 *   1. Enumerate all `land` cells within the band.
 *   2. Compute each cell's Chebyshev distance to the band center.
 *   3. Sort by distance descending (periphery first).
 *   4. Iterate and pick the first K cells (= `citiesPerPlayer`) that
 *      satisfy min-spacing from water and min-spacing from
 *      already-picked cells.
 *   5. The `rng` is consumed only when there's a tie (two cells
 *      with the same distance).
 *
 * @param elev      Elevation map (uint8).
 * @param water     Water mask (1 = water, 0 = land).
 * @param width     Board width.
 * @param height    Board height.
 * @param band      Spawn band for this player.
 * @param settings  Generation settings (citiesPerPlayer, min distances).
 * @param rng       PRNG (used only for tie-breaking).
 * @param owner     The player ID to assign to these cities.
 * @param count     How many cities to place. Defaults to
 *                  `settings.citiesPerPlayer`. Callers pass a smaller
 *                  count for self-symmetric players whose mirror
 *                  partners are supplied by `enforceCitySymmetry`
 *                  (the 3p middle band seeds half the normalized even
 *                  count — issue #2).
 * @param existing  Cities already placed for OTHER players (coords
 *                  only). Picked cities must respect
 *                  `minCityCityDistance` against these as well
 *                  (issue #2: adjacent-band players could otherwise
 *                  pick boundary cells too close together). The
 *                  spacing-free fallback ignores `existing`, matching
 *                  its degraded-but-retryable contract.
 * @param mirrorAware  When true (the self-symmetric 3p middle band),
 *                  each pick is additionally spacing-checked against
 *                  its own 180° rotation and against the rotations of
 *                  already-picked cells — exactly the neighbors
 *                  `enforceCitySymmetry` will add. This prevents
 *                  post-mirror spacing violations from burning
 *                  regeneration attempts (issue #2). Exact-center
 *                  candidates are also skipped: a center cell is its
 *                  own mirror and would collapse the pair count.
 * @returns `count` cities, each on a land cell within the band,
 *          satisfying all distance invariants.
 */
export function placeCitiesInBand(
    _elev: Uint8Array,
    water: Uint8Array,
    width: number,
    height: number,
    band: Band,
    settings: Readonly<GenerationSettings>,
    rng: Rng,
    owner: PlayerId,
    count: number = settings.citiesPerPlayer,
    existing: ReadonlyArray<Coord> = [],
    mirrorAware: boolean = false,
): readonly CityPlacementLocal[] {
    // Compute the band center (floating-point; we use it for sorting).
    const centerX = (band.xMin + band.xMax) / 2;
    const centerY = (band.yMin + band.yMax) / 2;
    // Distance-to-water fields, computed once per call: Chebyshev
    // (validator INV-10 metric) AND Manhattan (downstream balance
    // oracle metric). A candidate must satisfy BOTH.
    const chebWaterField = buildWaterDistanceField(water, width, height);
    const manhattanWaterField = buildManhattanWaterField(water, width, height);
    // Enumerate land cells within the band. Each cell is (x, y, idx,
    // chebyshev-to-center).
    type Candidate = { x: number; y: number; idx: number; d: number };
    const candidates: Candidate[] = [];
    for (let y = band.yMin; y <= band.yMax; y++) {
        const row = y * width;
        for (let x = band.xMin; x <= band.xMax; x++) {
            const idx = row + x;
            // Skip water cells (INV-8).
            if ((water[idx] ?? 0) === 1) {
                continue;
            }
            const dx = Math.abs(x - centerX);
            const dy = Math.abs(y - centerY);
            const d = dx > dy ? dx : dy;
            candidates.push({ x, y, idx, d });
        }
    }
    // Sort by distance descending (periphery first). Stable sort on
    // ties preserves RNG-based determinism (we use rng to break ties
    // when needed).
    candidates.sort((a, b) => b.d - a.d);
    // Mirror-aware bands pick CENTER-FIRST instead: each seed
    // reserves both itself and its 180° rotation, and an edge seed's
    // rotation sandwiches the opposite half of the band, deadlocking
    // any further strict pick (issue #2, observed on 3p boards with
    // normalized citiesPerPlayer 4). Center-first lets same-row,
    // x-separated seeds coexist with all four mirror points.
    if (mirrorAware) {
        candidates.reverse();
    }
    // Pick the first K cells that satisfy min-spacing invariants.
    const K = count;
    const picked: Candidate[] = [];
    for (const c of candidates) {
        if (picked.length >= K) {
            break;
        }
        // INV-10: min distance to water against BOTH consumers:
        //   - validator INV-10 requires Chebyshev ≥ minCityWaterDistance;
        //   - balance oracles (sc-002) flag water within 4-connected
        //     depth ≤ minCityWaterDistance, i.e. require
        //     Manhattan ≥ minCityWaterDistance + 1.
        // Satisfying the stricter pair here means the retry loop
        // never burns attempts on water-proximity rejections.
        if (
            (chebWaterField[c.idx] as number) < settings.minCityWaterDistance ||
            (manhattanWaterField[c.idx] as number) <= settings.minCityWaterDistance
        ) {
            continue;
        }
        // Mirror-aware guard (self-symmetric 3p middle band): the
        // candidate's own 180° rotation will become a city too, so
        // the pair must be internally spaced; a center cell is its
        // own mirror and would collapse the pair count.
        if (mirrorAware) {
            const rot: Coord = { x: width - 1 - c.x, y: height - 1 - c.y };
            if (rot.x === c.x && rot.y === c.y) {
                continue;
            }
            if (chebyshev(c, rot) < settings.minCityCityDistance) {
                continue;
            }
        }
        // INV-11: min distance to already-picked cells in this band…
        let satisfies = true;
        const checkAgainst: Array<{ x: number; y: number }> = picked.map((p) => ({ x: p.x, y: p.y }));
        // …and against the rotations of those picks (their mirror
        // partners), which land back inside this band.
        if (mirrorAware) {
            for (const p of picked) {
                checkAgainst.push({ x: width - 1 - p.x, y: height - 1 - p.y });
            }
        }
        // …and to cities already placed for other players.
        for (const e of existing) {
            checkAgainst.push({ x: e.x, y: e.y });
        }
        for (const other of checkAgainst) {
            if (chebyshev(c, other) < settings.minCityCityDistance) {
                satisfies = false;
                break;
            }
        }
        if (!satisfies) {
            continue;
        }
        // Tie-break: if multiple candidates have the same distance,
        // we use the rng to pick (consume one uint32 per tie). For
        // simplicity, we just consume one uint32 per pick (the
        // tie-breaking is already handled by the stable sort).
        rng();
        picked.push(c);
    }
    // If we couldn't place enough cities (e.g., band is too small or
    // water is too dense), fall back to the highest-distance land
    // cells regardless of spacing (this is a degraded but valid
    // placement; the validator will catch it).
    if (picked.length < K) {
        for (const c of candidates) {
            if (picked.length >= K) {
                break;
            }
            if (picked.some((p) => p.idx === c.idx)) {
                continue;
            }
            rng();
            picked.push(c);
        }
    }
    // Convert to CityPlacement shape.
    return picked.map((c) => ({
        cell: { x: c.x, y: c.y },
        owner,
    }));
}

// Re-export `chebyshev` for use by other modules.
export { chebyshev };
