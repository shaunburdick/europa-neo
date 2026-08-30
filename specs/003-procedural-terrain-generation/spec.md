# Feature Specification: Procedural Terrain Generation

**Feature Branch**: `003-procedural-terrain-generation`

**Created**: 2026-08-21

**Status**: Implemented

**Input**: User description: "GeoMorph-inspired procedural map generation producing balanced, symmetric boards with elevation, water pools, and fair city placement; seed-reproducible."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Balanced Symmetric Maps (Priority: P1)

As a player, I want every match to start on a map that gives each player an equivalent position — mirrored terrain, equal city counts, equal access — so that outcomes depend on skill, not spawn luck.

**Why this priority**: Fair starts are non-negotiable for a competitive 1v1 game; an unbalanced generator produces invalid matches.

**Independent Test**: Can be tested by generating N maps and asserting point-symmetry of terrain and city layout, plus connectivity between all cities.

**Acceptance Scenarios**:

1. **Given** any generated map, **When** terrain is reflected through the board center (180° rotation), **Then** elevation values and water placement match exactly.
2. **Given** any generated map with P players, **When** cities are counted per player region, **Then** each player has the same number of starting cities in symmetric positions.
3. **Given** any generated map, **When** pathfinding runs between every pair of starting cities over land cells, **Then** at least one route exists (no city is sealed off by water).

---

### User Story 2 - Seed Reproducibility (Priority: P2)

As a developer/hoster, I want the same seed to always produce the same map, so that games are replayable, bugs are reproducible, and maps can be shared by seed.

**Why this priority**: Determinism is a constitution principle; the generator must honor it. Depends on nothing else.

**Independent Test**: Can be tested by generating twice from the same seed and comparing full board hashes.

**Acceptance Scenarios**:

1. **Given** seed S, **When** generation runs twice on any machine, **Then** both outputs are byte-identical.
2. **Given** two different seeds, **When** generation runs, **Then** outputs differ (with overwhelming statistical likelihood).

---

### User Story 3 - Characterful Europa-like Terrain (Priority: P3)

As a player, I want maps that feel like the original's moon surface — rolling elevation with occasional water pools — rather than uniform noise, so the game retains its tactical texture (high ground advantages, water chokepoints).

**Why this priority**: Flavor and variety matter for long-term appeal but any valid balanced map is playable.

**Independent Test**: Can be tested statistically: generate many maps and assert distributions (elevation variance within bounds, water fraction within bounds, no degenerate flatness).

**Acceptance Scenarios**:

1. **Given** 100 generated maps, **When** water coverage is measured, **Then** it falls within the configured range (default 5–15%).
2. **Given** 100 generated maps, **When** elevation variance is measured, **Then** maps contain meaningful high/low regions (variance above a floor), never fully flat boards.

---

### User Story 4 - Configurable Terrain Smoothing (Priority: P2)

As a player, I want maps whose elevation changes are gentle enough that pipe networks can actually cross the map — with the smoothing amount configurable per match — so that games do not stalemate because only 1–2 viable cross-map routes exist.

**Why this priority**: Product-owner playtesting (issue #30) found that rough terrain plus the engine's uphill flow handicap produced maps with only 1–2 cross-map paths, and uphill edges were not obvious. Smoothing is the terrain-side fix; the flow-rate gradient and slope color-coding are feature 001/005's half of the same change set.

**Independent Test**: Generate N maps at the default smoothing and assert (a) the flow-viable reachable-land fraction from a starting position is ≥ 50% (mean over the suite), (b) byte-identical regeneration at every smoothing value in the safe range, (c) `terrainSmoothing: 0` reproduces pre-smoothing output exactly.

**Acceptance Scenarios**:

1. **Given** the default `terrainSmoothing`, **When** a map is generated, **Then** more than 1–2 viable cross-map paths exist: the mean flow-viable reachable-land fraction from a starting position is ≥ 50% of land cells over the 200-map balance suite (empirically 53.6% at the default with feature 001's tuning; the stall threshold is read from `ENGINE_CONSTANTS` per feature 001 FR-007).
2. **Given** a match-creation request that omits `terrainSmoothing`, **When** the match starts, **Then** the default value is used and surfaced via `effectiveSettings` (mirroring the `citiesPerPlayer` normalization pattern).
3. **Given** `terrainSmoothing: 0`, **When** a map is generated from a seed, **Then** the output is byte-identical to pre-smoothing generation from the same seed (backward compatibility; existing seeds and fixtures are unaffected).
4. **Given** any `terrainSmoothing` value in the safe range `[0, 8]`, **When** generation runs twice with the same seed, **Then** both outputs are byte-identical (determinism across the range, constitution II).

---

### Edge Cases

- What happens when the generator produces a map violating balance/connectivity? → The generator MUST validate its own output and regenerate (bounded retries) with a derived seed; the final seed used is reported.
- What happens when requested player count exceeds configured city slots? → Generator scales city count with player count (symmetrically).
- What happens with extreme water density settings? → Settings outside safe bounds are clamped.
- What happens with extreme `terrainSmoothing` values? → Clamped to the safe range `[0, 8]` (FR-008); `0` = no smoothing (current behavior), values above the range are clamped to 8.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The generator MUST produce a square grid matching the engine's board dimensions, assigning each cell an integer elevation and terrain type (land/water).
- **FR-002**: Elevation MUST be generated via a fractal/midpoint-displacement family algorithm (GeoMorph-inspired), producing smooth hills and valleys rather than white noise.
- **FR-003**: Water MUST be placed in contiguous pools determined by elevation thresholds (e.g., lowest basins flood), not scattered single cells.
- **FR-004**: Maps MUST be point-symmetric (180° rotational symmetry) across all layers: elevation, water, and cities.
- **FR-005**: The generator MUST place an equal number of starting cities per player at symmetric positions, with minimum spacing from water and from each other. For 3-player games, `citiesPerPlayer` is normalized UP to the next even number before placement (see Clarifications v1.2) so point symmetry remains satisfiable; the normalized value is reported via `effectiveSettings`.
- **FR-006**: Generation MUST be deterministic given (seed, board size, player count, settings): no use of unseeded randomness or wall-clock time.
- **FR-007**: The generator MUST validate output (symmetry, city connectivity, water bounds) and retry with derived seeds up to a bounded attempt count before failing loudly.
- **FR-008**: Water density, elevation roughness, city count, and terrain smoothing MUST be configurable with safe clamping.
- **FR-009**: The generator MUST emit the final effective seed alongside the map so matches can record and share it.
- **FR-010**: The generator MUST apply a deterministic terrain-smoothing pass to the elevation field — a post-process heightmap pass that reduces adjacent-cell elevation differences, applied a configurable number of times (`terrainSmoothing`, default 4, safe range `[0, 8]`), running after point-symmetry enforcement and before water classification. The pass MUST be integer-safe and deterministic (constitution II), MUST preserve 180° point symmetry exactly (FR-004), MUST be a pure function of the elevation field and the setting (no RNG consumption, no wall-clock), and MUST be surfaced via `effectiveSettings` (mirroring the `citiesPerPlayer` normalization pattern). `terrainSmoothing: 0` MUST reproduce pre-smoothing output byte-identically. The observable effect: adjacent-cell elevation deltas shrink with each pass, so uphill pipe flow stalls less often (feature 001 FR-007) and maps gain multiple viable cross-map routes (US4 AC-1).

### Key Entities *(include if feature involves data)*

- **MapSeed**: integer seed driving all randomness.
- **GenerationSettings**: board size, player count, water density range, roughness, city count, terrain smoothing.
- **GeneratedMap**: complete Board definition (elevations, water, city placements) ready for engine initialization.
- **ValidationReport**: pass/fail per invariant + attempts used + final seed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Same-seed regeneration produces identical hashes across machines and runs (1k-seed suite, byte-identical on every trial).
- **SC-002**: 100% of emitted maps pass symmetry, connectivity, and distribution validation (generator never ships an invalid map); verified by the 200-map balance suite.
- **SC-003**: A default 32×32 / 2-player map generates in under 1 second including validation retries.
- **SC-004**: Statistical suite over 100 seeds shows water coverage and elevation variance within configured bounds on every map; the suite runs with the default `terrainSmoothing` (4) and additionally asserts the US4 AC-1 reachable-land floor (≥ 50% mean) and US4 AC-3/AC-4 determinism across the smoothing range.

## Assumptions

- The original's GeoMorph module was a server-side heightmap generator; exact algorithm is unknown and does not need replicating — only the character (smooth fractal relief) and fairness properties matter.
- City production/saturation behavior lives in feature 001; this feature only places them.
- Map sharing by seed string is desirable but formal import/export formats are deferred to planning.

## Clarifications

### v1.1 (2026-08-22) — Verification suite trial-count reduction

- 2026-08-22: SC-001/SC-002 trial counts reduced (10k→1k seeds, 1000→200 maps) — property guarantees unchanged; CI runtime cut ~8x per product owner directive.

### v1.2 (2026-08-25) — 3-player city-count parity + INV-9 partner-owner semantics (issue #2)

- **FR-005 clarification (3-player parity rule)**: FR-004 point symmetry maps every city to a distinct partner cell on an even-sized board, and the 3-player middle band is self-symmetric (its player is its own symmetry partner), so the middle player's city count must be even. Combined with FR-005's equal-count requirement, an odd `citiesPerPlayer` is unsatisfiable for 3 players. Ruling: for `playerCount === 3`, the generator normalizes `citiesPerPlayer` UP to the next even number (1→2, 3→4), uniformly for all players, after clamping. The normalized value drives placement, validation, and `effectiveSettings`/`MapStats.effectiveSettings`; 2p/4p requests are unaffected.
- **INV-9 clarification (partner-owner semantics)**: "opposite player" in the city-symmetry invariant means the city at the 180°-rotated coordinate must be owned by that owner's symmetry partner (`partnerPlayer(owner, playerCount)`): the opposing member of the pairing for 2p/4p, and the *same* player when its band is self-symmetric (the 3p middle player), which also covers the board-center cell on odd-sized boards. Same-owner mirror cities for a self-symmetric player are conforming, not violations.
- Trigger: issue #2 — every 3-player matchmaker auto-start threw `GenerationError('attempts_exhausted')` because INV-9 as originally worded flagged the middle player's legitimate same-owner mirrors, and the odd per-player count made INV-7 unsatisfiable. Regression coverage: terrain unit + integration suites (`generate-3p.test.ts`) and a matchmaking integration test (`matchmaker.autostart-3p.test.ts`, proven failing pre-fix).

### v1.3 (2026-08-30) — Configurable terrain smoothing (issue #30, binding product decision)

- **Binding product decision (owner, issue #30 scope extension)**: terrain smoothing is included in this change set, and the smoothing amount is a **per-match terrain setting** (`terrainSmoothing`) with a sensible default. Owner's words: "I lean towards per-match as well." This is recorded as a binding decision, not a proposal.
- **Setting**: `terrainSmoothing` — integer, **default 4**, safe range **[0, 8]** (clamped per FR-008). `0` reproduces pre-smoothing output byte-identically (backward compatible; existing seeds/fixtures unaffected). The value is surfaced via `effectiveSettings` in `TerrainGenerationResult` and `MapStats` (mirroring the `citiesPerPlayer` normalization pattern); matchmaking's `MatchSettings.terrainSettings` carries it through `DEFAULT_GENERATION_SETTINGS` with no caller changes (spec 006 Implementation Notes).
- **Approach (requirement level)**: a **post-process heightmap pass** — each pass replaces each cell's elevation with the rounded mean of its neighborhood, reducing adjacent-cell elevation differences. Chosen over an fBm parameter change because it is additive (k=0 = current behavior), trivially deterministic (pure function of the field + setting), symmetry-preserving (a symmetric kernel on a symmetric field stays symmetric — verified empirically), and its observable effect maps 1:1 to the setting value. The exact kernel is the architect's choice, constrained by FR-010 (integer-safe, deterministic, symmetry-preserving, before water classification); the reference kernel used for tuning validation is a 3×3 box mean with divisor 9 and clamped coordinates.
- **Empirical grounding (200 seeds × 32×32, replicating `fbm.ts` exactly)**: at the default k=4, adjacent-cell deltas shrink (max |Δ| 153 → 28), the flow-viable reachable-land fraction from a starting position rises from 0.1% (k=0) to **53.6%**, and water pool contiguity improves (largest pool 1.7% → 3.7% of the board; pool count 27 → 6) — a side benefit for FR-003. Elevation variance drops from 1054.6 to 393.7 (still far above the INV-14 floor of > 0; min over 200 seeds at k=8 is 89.0). Determinism and symmetry verified at k = 0, 1, 2, 3, 4, 5, 8.
- **Cross-feature coupling**: the smoothing default is tuned jointly with feature 001's flow constants (spec 001 Clarifications v1.2: `flowBase` 3 → 7). The US4 AC-1 reachable-floor test reads the stall threshold from `ENGINE_CONSTANTS` (feature 001 FR-007), so a future retune of either side fails loudly in the terrain suite.
