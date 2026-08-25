# Research: Procedural Terrain Generation (Feature 003)

**Branch**: `001-europa-core`
**Date**: 2026-08-21
**Spec**: `.specify/features/003-procedural-terrain-generation/spec.md`
**Plan**: `.specify/features/003-procedural-terrain-generation/plan.md`

> Decisions captured for the terrain package: map-generation algorithm,
> symmetry strategy, water/elevation model, city placement, determinism
> strategy, and library needs. Each decision cites the source consulted
> via `websearch` (current literature) or references to feature 001's
> already-decided stack (pnpm, tsup, Vitest, Biome, sfc32, integer-only).
>
> No new tooling is being introduced. Terrain inherits every cross-cutting
> decision (workspace manager, build, test, lint, PRNG) from feature 001;
> this research focuses on the *algorithm* layer.

---

## 1. Map-generation algorithm — **integer value noise + fBm + point symmetry**

**Decision**: A two-octave (configurable, default 4) integer **value noise** heightmap with **fractional Brownian motion (fBm)** layering, post-processed by a **point-symmetric fill** (180° rotation), then **threshold-flooded** to produce water pools, then **city placement by max-distance-from-center in per-player spawn bands**.

**Rationale**:

- **FR-002** explicitly permits a "fractal/midpoint-displacement family algorithm" and characterizes the desired output as "smooth hills and valleys rather than white noise." Value noise + fBm is the simplest algorithm in that family that satisfies both constraints.
- Value noise uses a deterministic, seedable integer hash at each lattice point and bilinear interpolation between four neighbors — all integer arithmetic, no `Math.sin`/`Math.cos`, no `Math.pow`. This is critical for **FR-006 determinism** (constitution Principle II).
- fBm layering (4–6 octaves, persistence 0.5, lacunarity 2) is the canonical recipe used by Minecraft, Terraria, Unreal Engine Landscape, and countless open-source generators (abratabia 2026; generalistprogrammer 2026). It produces the "rolling elevation" the spec calls for.
- The result is a `Uint8Array` of 1024 elevation values for a 32×32 board. No per-cell allocation, mirrors engine's flat-array pattern.
- Integer-only output is trivially byte-comparable for the SC-001 determinism test (no float drift to worry about).
- Point symmetry (180° rotation) is the cheapest way to make the map fair across the center, and the spec literally says "reflected through the board center (180° rotation)" (US1 AC-1). Generating one half and rotating the other is mathematically perfect — no seam artifact, no drift, no balancing math.
- A bounded retry loop (max 5 attempts) with derived seeds handles the case where the random heightmap produces an unsolvable map (FR-007). Default settings (waterRatio 0.10, roughness 0.5) are well within the safe band where retries are rarely needed.

**Alternatives considered**:

- **Perlin gradient noise** — the classic. More visually "natural" than value noise (no blocky artifacts) but requires 8-direction gradient vectors and 4 dot products per evaluation. Adds complexity for the same integer-only property (Ken Perlin's classic implementation is also pure integer arithmetic). Rejected: same output quality we need, more code to test, no determinism advantage. (abratabia 2026 §"Perlin and Simplex Noise for Terrain"; moonjump 2025 §"How It Works")
- **Simplex noise** — Perlin's 2001 improvement. Better for 3D and high dimensions, marginal benefit for 2D. Rejected: over-engineered for our 2D case. (StackOverflow: Simplex noise vs Perlin noise)
- **Voronoi / Lloyd relaxation** — produces organic, biome-like regions. Beautiful for planetary-scale generation, overkill for 32×32. Rejected: extra dependency (or hand-rolled O(n log n) sweep algorithm), no gameplay benefit over simpler noise, more code paths to test. (zeroCity 2025; Oliver Coding 2023; SqueakySpacebar 2017; "From Chaos to Continents" 2026 — used for irregular meshes, not our use case)
- **Diamond-square (midpoint displacement)** — strictly within the spec's permitted "fractal/midpoint-displacement family" but requires a square board of size `2^n + 1`. We want `2^n` (32, 64) for the engine's integer indexing. Rejected: board-size constraint conflicts with the engine's default `boardSize = 32` and the spec's "square grid" (FR-001) without further massaging.
- **Example-based / patch-sampling terrain** — over-engineered for the spec's character requirements.
- **Cellular automata** — appropriate for cave-like maps (Baeldung 2024). Europa's surface is open terrain, not caves. Rejected.
- **Worley noise** — produces cracks/regions; the spec calls for "rolling hills". Rejected.

**Citations**:
- abratabia.com, "Perlin and Simplex Noise for Terrain" (June 2026) — fBm recipe and parameter tuning.
- moonjump.com, "Game Dev Mechanics: Noise Functions (Perlin & Simplex)" (Dec 2025) — Perlin integer implementation, fBm formula.
- IEEE, "Noise Algorithms in Game Terrain Generation" (2025) — comparative analysis of Perlin, Simplex, Value, Worley.
- generalistprogrammer.com, "Procedural Generation in Games" (June 2026) — algorithm overview including fBm.
- ScienceDirect, "A constructive approach to strategy game map generation" (Önal & Bulbul 2025) — confirms constructive (single-pass) approach for strategy game maps.

---

## 2. Symmetry strategy — **point symmetry (180° rotational)**

**Decision**: Generate the heightmap for **one half** of the board and fill the other half by **180° rotation around the board center**. Water classification and city placements follow the same rule.

**Rationale**:

- **FR-004** mandates "point-symmetric (180° rotational symmetry) across all layers: elevation, water, and cities." This is the literal reading of "180° rotation" in US1 AC-1 and US1 AC-2.
- For a 2-player match, the two players are positioned on opposite sides of the center, and a 180° rotation maps player 1's territory onto player 2's. This is **mathematically perfect**: every cell `(x, y)` has a corresponding cell `(w-1-x, h-1-y)` with identical elevation, water classification, and (paired) city placement. There is no seam, no drift, and no balancing math.
- For 3- and 4-player matches, point symmetry still works: with 4 players, each player gets a quadrant. The map is symmetric under 180° rotation, which maps each quadrant to the diagonally-opposite quadrant. With 3 players, point symmetry maps player 1's band to player 2's, and player 3 occupies the remaining band symmetric to itself (its own 180°-rotation partner).
- The generator only computes one half the elevation values, halving the noise function's evaluation cost. The rotation step is a single `Uint8Array.copyWithin`-equivalent (or a typed loop with `| 0` indices), trivially deterministic.
- Connectivity (US1 AC-3) becomes a property of one half + the seam; no separate test needed for "did symmetry break the path between two cities?".

**Alternatives considered**:

- **Reflective (mirror) symmetry across an axis** — produces two identical halves with one axis of reflection. Not what the spec says ("180° rotation" ≠ "reflection across an axis"). Rejected.
- **90° rotational symmetry (4-fold)** — produces 4 identical quadrants. Only works naturally for 4-player matches, breaks 2- and 3-player fairness. Rejected.
- **"Balanced by construction" (equal water/land/cities per side without geometric symmetry)** — the prompt suggested this as an option. The spec explicitly requires *geometric* symmetry ("reflected through the board center"). Rejected.
- **No symmetry (random with retry until balanced)** — the original Europa's GeoMorph apparently did something like this. We lack GeoMorph's source, and the prompt explicitly says the algorithm is unknown and "does not need replicating — only the character (smooth fractal relief) and fairness properties matter" (spec Assumptions). Point symmetry is simpler, more verifiable, and 100% fair. Rejected.

**Citation**: maps_symmetry.pdf (dpii Morelia 2025) — definitional survey confirming point symmetry = 180° rotational symmetry; standard for 2-player competitive maps (Starcraft, Halo, Counter-Strike cited).

---

## 3. Water / elevation model — **shared elevation → threshold-flood to water**

**Decision**: The elevation map is the single source of truth. Water is derived by **threshold-flooding the lowest N% of cells** (where N = `settings.waterRatio`). The threshold is computed by sorting all cells by elevation ascending and taking the cell at the `(waterRatio × cellCount)` percentile.

**Rationale**:

- **FR-003** mandates "contiguous pools determined by elevation thresholds (e.g., lowest basins flood), not scattered single cells." Threshold-flood on a smooth elevation field *guarantees* contiguous pools by construction: cells below the threshold form connected components (the "basins"), and connected components are by definition pools. No additional flood-fill needed.
- Sharing the elevation field between height and water means **one source of truth**. The alternative (two independent noise fields, then post-process) introduces correlation problems and makes the symmetry invariant harder to verify.
- The threshold is a single integer (e.g., 80 out of 255) — easy to debug, easy to visualize, easy to validate.
- The sort is O(n log n) for n = w×h. For 32×32 (n=1024), the sort is sub-millisecond. For 64×64 (n=4096), still negligible. The SC-003 perf budget of <1s is comfortable.
- Symmetry is preserved automatically: because the elevation field is symmetric and the threshold is a single global value, the water classification is symmetric.
- "Lowest basins" language in the spec is satisfied: the cells with the smallest elevation are the basins, by definition.

**Alternatives considered**:

- **Worley noise (cell-based) for water** — produces distinct cells, hard to make contiguous without a second pass. Rejected.
- **Separate river networks** — beautiful but out of scope per the prompt's "simple noise + threshold + symmetry" guidance and the spec's "pools, not rivers" character.
- **Hydraulic erosion simulation** — produces realistic valleys and rivers but is O(n²) and non-deterministic across runs unless heavily controlled. Rejected: spec doesn't ask for rivers; perf cost is significant.
- **Per-region thresholds** (different water ratios in different parts of the map) — conflicts with point symmetry (regions themselves wouldn't be symmetric). Rejected.
- **Erosion-based water carving** — same as hydraulic erosion; rejected.

**Citation**: Baeldung 2024 §3 confirms the standard "heightmap → threshold → water" pattern. ScienceDirect (Önal & Bulbul 2025) confirms the constructive approach used in real strategy game map generators.

---

## 4. City placement — **per-player spawn band + max-distance-from-center**

**Decision**: For each player, define a **spawn band** as a 1/playerCount-th slice of the map perpendicular to the player's "home direction." Within that band, find the **land cell with maximum Chebyshev distance to the map center** that satisfies minimum spacing from water and from other cities. Mirror the placements for the opposite player (or, for 4-player, the diagonal opposite).

**Rationale**:

- **FR-005** mandates "equal number of starting cities per player at symmetric positions, with minimum spacing from water and from each other." A spawn band guarantees equal area per player (1/playerCount of the map), which is the foundation of fairness. Max-distance-from-center pushes the city as far from the opponent as possible, giving the player time to develop before contact. Minimum spacing (≥ 3 cells from water, ≥ 3 cells from any other city) prevents city-adjacent-to-water (which would let a single pipe flood the city) and city clusters.
- The band is defined parametrically:
  - For **2 players**: two horizontal bands (top half and bottom half). Cities at `(x, 3)` and `(x, h-4)` for various `x` chosen by max-distance.
  - For **3 players**: three bands, one of which (the center) has 180°-self-symmetric cities.
  - For **4 players**: four quadrant bands.
- Mirror-symmetric placement: after computing player 1's city, player 2's city is forced to be the 180°-rotation of player 1's. This is the cheapest way to enforce FR-004 on cities (no separate "fairness" math).
- Min-spacing is enforced by maintaining a per-cell "blocked" boolean array and re-selecting the next-best cell if the candidate is too close. A few extra iterations (≤ 10 per city) is plenty because we're picking from a smooth distance function with no local optima.
- "Fair placement" (the spec's "fair city placement" goal) is achieved by construction: every player has the same distance-to-opponent, the same distance-to-edge, and the same number of cities. The "fairness" is *defined* by the construction, not *measured* after the fact.

**Alternatives considered**:

- **Poisson-disk sampling of city candidates, then assign to nearest player band** — works, more random, but harder to verify symmetry.
- **Voronoi diagram of player spawn points, place cities at Voronoi cell centroids** — beautiful and fair in theory, requires a Voronoi implementation (or dependency). Rejected per the spec's "simple" spirit and the prompt's library-need finding.
- **Hand-tuned "good city locations" with scoring functions** — the constructive-approach paper (Önal & Bulbul 2025) uses this for general strategy games. For Europa's simple symmetry constraint, the band-based approach is sufficient and simpler.
- **Grid pattern with random offset** — works, less character.

**Citation**: "A constructive approach to strategy game map generation" (Önal & Bulbul 2025) — strategy game map generation with player base placement and fitness scoring. Our approach is a simpler case of their method (their "fitness function" is essentially "max distance from opponent").

---

## 5. Library needs — **none**

**Decision**: Terrain ships **zero runtime dependencies** and **zero new dev dependencies** beyond what the engine package already uses (typescript, vitest, biome — all inherited from the root monorepo).

**Rationale**:

- Surveyed candidate libraries:
  - **`noisejs`** (GitHub: joshuahhh/noisejs) — Perlin + Simplex. ~3 KB. Brings a non-MIT-compatible license (CC-BY-NC-SA 4.0) for the standard version; reimplementing Perlin in 50 lines is faster than auditing the license. Rejected.
  - **`simplex-noise`** (NPM: `simplex-noise`) — Perlin's Simplex in TS. MIT. But our 2D use case doesn't need Simplex's 3D/4D benefits, and the integer-only Perlin implementation is small enough to write directly. Rejected (over-engineered for 2D).
  - **`alea`** / **`xoshiro`** / **`mulberry32`** — alternative PRNGs. We use the engine's sfc32. Rejected (the prompt forbids a separate PRNG).
  - **`d3-delaunay`** / **`polygon-clipping`** / **`martinez-polygon-clipping`** — Voronoi/clipping. Not needed (we use a simpler algorithm). Rejected.
  - **`seedrandom`** — alternative seedable PRNG. Same reason as alea. Rejected.
  - **`fastnoise`** (C++ with WASM bindings) — overkill and brings a native dependency. Self-hosting principle (VII) disfavors native deps when not needed. Rejected.
- The full algorithm (value noise + fBm + symmetry + threshold + band-based city placement) is roughly **200–300 lines of TypeScript**. The test surface is roughly the same size. The total surface is small enough that any library's value-add is washed out by the API surface to learn.
- Constitution Principle V ("simplicity over cleverness") and Principle VII ("self-hostable by default; no proprietary APIs") both favor zero new dependencies.

**Alternatives considered**: See above. The only case for adding a library would be if the algorithm grew to need Voronoi or a complex PRNG. The chosen algorithm doesn't.

**Citation**: NPM package metadata for `simplex-noise`, `noisejs`, `d3-delaunay` (license + size); the abratabia 2026 article for the ~50-line Perlin implementation reference.

---

## 6. Determinism — **engine-provided sfc32 + integer-only ops + symmetric fill**

**Decision**: All randomness is drawn from the **engine's sfc32 PRNG instance** passed in by the caller. All internal computations (noise hash, threshold sort, distance calculations) use **integer-only arithmetic**. The deterministic boundary is `generateBoard(req, rng) → Board` — given the same `req` and the same `rng` state, the output is byte-identical.

**Rationale**:

- The prompt explicitly mandates: "Terrain generation must accept an sfc32-seeded PRNG instance from the caller (engine passes the same PRNG instance used to start the match) — do not introduce a separate PRNG." This rules out internal PRNG construction.
- Constitution Principle II mandates "no wall-clock reads, floating-point drift, or iteration-order dependence inside tick logic." Terrain is not in the tick loop (it runs once per match), but the same discipline applies because the generator's output is part of the `World` that the tick loop processes. If the generator drifts, replays break.
- Integer-only arithmetic: the value noise uses a hash function on integer lattice coordinates (`(ix, iy) → uint8`), and bilinear interpolation on the four corner values. Bilinear interpolation on integer corners produces a *fractional* result in principle; we scale to integer by `| 0` (Math.floor) at the end. Documented in `data-model.md` and in code comments.
- The seed-derivation step (splitting the sfc32 stream into noise / water / cities sub-streams) is also deterministic: we use the first 4 outputs of sfc32 to derive 4 uint32 sub-seeds via `xmur3`-style mixing. See feature 001's `research.md` §5 for the sfc32 implementation.
- The retry loop (FR-007) is also deterministic: each attempt's seed is `mix(initialSeed, attemptNumber)` via the same hash function. After 5 attempts, if invariants still fail, we throw `GenerationError` (loud failure, not silent invalid Board).
- All four operations we do (hash, interpolate, sort, distance) are deterministic. JavaScript's `Array.prototype.sort` is stable since ES2019 (ECMA-262 §23.1.3.30); we rely on this for the threshold sort.

**What would break determinism (and how we avoid it)**:
- `Math.random()` — disallowed by lint rule.
- `Date.now()` — disallowed by lint rule.
- `Math.sin` / `Math.cos` / `Math.pow` — not used in the hot path; if needed for any future phase, they must be integer-replaced (e.g., via a small lookup table) or moved outside the deterministic boundary.
- Object key iteration order — not relied upon; the algorithm is order-independent.
- `Map` / `Set` iteration order — not relied upon for any algorithm phase.
- `WebAssembly` — not used; would be deterministic per spec but adds a native dep.

**Citation**: feature 001's `research.md` §5 (sfc32) and §6 (integer-only); ECMA-262 §23.1.3.30 (Array.prototype.sort is stable).

---

## 7. Reuse from feature 001

**Decision**: Terrain **imports only types** from `@europa/engine` (`Board`, `Cell`, `CityPlacement`, `Coord`, `PlayerId`, `ENGINE_API_VERSION`). It does **not** import engine code at runtime.

**Rationale**:

- The engine ↔ terrain boundary rule in `engine-to-terrain.ts` (line 7) is: "terrain generation does NOT import anything from `@europa/engine` at runtime — it produces plain data."
- TypeScript's `import type` syntax (`import type { Board } from '@europa/engine'`) is the idiomatic way to import only types. The TypeScript compiler erases type-only imports at runtime, so the published `@europa/terrain` JavaScript contains no runtime reference to `@europa/engine`.
- The exception is the PRNG instance: terrain needs to *call* sfc32 (advance state, read outputs). Either:
  - (Option A) Engine exposes the sfc32 type, and terrain imports the type-only + a small callable interface. Cleanest.
  - (Option B) Terrain accepts the sfc32 *state* (`Uint32Array` of length 4) and a tiny `step` function. Avoids the type import but uglier.
- **Option A is preferred** and is what the prompt implies ("engine passes the same PRNG instance"). Flagged as **proposed additive change #1**.

**Citation**: `engine-to-terrain.ts` line 7; feature 001's `research.md` §5 (sfc32 type design).

---

## 8. Module structure within `packages/terrain`

```
packages/terrain/
├── src/
│   ├── index.ts            // public surface re-exports
│   ├── constants.ts        // TERRAIN_CONSTANTS (single tunable-knobs location)
│   ├── types.ts            // re-exports contracts/terrain-types.ts
│   ├── generate.ts         // generateBoard: orchestrator
│   ├── noise.ts            // integer value noise + fBm
│   ├── symmetry.ts         // point-symmetric fill (180° rotation)
│   ├── water.ts            // threshold-based pool extraction
│   ├── cities.ts           // fair per-player city placement
│   ├── validate.ts         // invariants checker (FR-007)
│   └── prng.ts             // sfc32 helpers (seed-derivation, sub-stream splits)
├── tests/
│   ├── unit/
│   │   ├── noise.test.ts
│   │   ├── symmetry.test.ts
│   │   ├── water.test.ts
│   │   ├── cities.test.ts
│   │   └── validate.test.ts
│   ├── fixtures/
│   │   └── boards.ts
│   ├── quickstart/         // Q-T01..Q-T08
│   ├── determinism.test.ts // SC-001
│   ├── balance.test.ts     // SC-002 / SC-004
│   └── conformance.test.ts // assertBoardMatchesConfig
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── biome.json
```

**Rationale**: mirrors feature 001's structure (one function per file, one test per file). The pipeline phases are kept separable so each can be unit-tested in isolation and the order is fixed (no iteration-order dependence → constitution Principle II).

**Citation**: feature 001's `research.md` §10; constitution Principle V.

---

## 9. What we are *not* doing (deferred)

To keep v1 minimal and to avoid over-engineering the terrain (Simplicity Principle), the following are explicitly **not** in scope for feature 003:

- **Hydraulic erosion** — out of scope per the spec's "rolling elevation" character; the fBm noise already produces smooth hills.
- **Rivers** — out of scope per the spec's "pools, not rivers" character.
- **Biomes** — out of scope; the original Europa has no biomes, just one terrain type.
- **Map editor** — out of scope; v1 ships the generator only. Map editing/import/export is feature 006's concern (spec Assumptions: "Map sharing by seed string is desirable but formal import/export formats are deferred to planning.").
- **Save/load map files** — out of scope; replays use the seed.
- **Custom player colors** — out of scope; feature 006 owns player display names.
- **Multiple symmetry strategies** (mirror, rotational) — out of scope per FR-004 (point symmetry is the only mandated form).
- **Animated terrain** (e.g., terrain that changes over time) — out of scope; terrain is immutable within a match (spec Assumptions).

These boundaries are reflected in the contracts (`terrain-api.ts` exports only `generateBoard`; no other public surface).

---

## 10. Resolved unknowns

| Open question (from prompt) | Resolution |
|-----------------------------|------------|
| Map-generation algorithm | Integer value noise + fBm + 180° point symmetry (§1) |
| Symmetry strategy | Point symmetry (180° rotational), single strategy in v1 (§2) |
| Water/elevation model | Shared elevation → threshold-flood lowest basins (§3) |
| City placement | Per-player spawn band + max-distance-from-center, mirrored (§4) |
| Determinism strategy | Engine's sfc32 passed in, integer-only, symmetric fill (§6) |
| Library needs | None — terrain ships zero runtime dependencies (§5) |
| `MatchConfig` changes? | No — `MatchConfig` unchanged; new fields go into `TerrainGenerationRequest.settings` (proposed additive change #2) |
| PRNG sharing with engine? | Yes — terrain accepts the engine's sfc32 instance (proposed additive change #1) |

No `NEEDS CLARIFICATION` markers remain.
