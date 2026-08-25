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

### Edge Cases

- What happens when the generator produces a map violating balance/connectivity? → The generator MUST validate its own output and regenerate (bounded retries) with a derived seed; the final seed used is reported.
- What happens when requested player count exceeds configured city slots? → Generator scales city count with player count (symmetrically).
- What happens with extreme water density settings? → Settings outside safe bounds are clamped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The generator MUST produce a square grid matching the engine's board dimensions, assigning each cell an integer elevation and terrain type (land/water).
- **FR-002**: Elevation MUST be generated via a fractal/midpoint-displacement family algorithm (GeoMorph-inspired), producing smooth hills and valleys rather than white noise.
- **FR-003**: Water MUST be placed in contiguous pools determined by elevation thresholds (e.g., lowest basins flood), not scattered single cells.
- **FR-004**: Maps MUST be point-symmetric (180° rotational symmetry) across all layers: elevation, water, and cities.
- **FR-005**: The generator MUST place an equal number of starting cities per player at symmetric positions, with minimum spacing from water and from each other.
- **FR-006**: Generation MUST be deterministic given (seed, board size, player count, settings): no use of unseeded randomness or wall-clock time.
- **FR-007**: The generator MUST validate output (symmetry, city connectivity, water bounds) and retry with derived seeds up to a bounded attempt count before failing loudly.
- **FR-008**: Water density, elevation roughness, and city count MUST be configurable with safe clamping.
- **FR-009**: The generator MUST emit the final effective seed alongside the map so matches can record and share it.

### Key Entities *(include if feature involves data)*

- **MapSeed**: integer seed driving all randomness.
- **GenerationSettings**: board size, player count, water density range, roughness, city count.
- **GeneratedMap**: complete Board definition (elevations, water, city placements) ready for engine initialization.
- **ValidationReport**: pass/fail per invariant + attempts used + final seed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Same-seed regeneration produces identical hashes across machines and runs (1k-seed suite, byte-identical on every trial).
- **SC-002**: 100% of emitted maps pass symmetry, connectivity, and distribution validation (generator never ships an invalid map); verified by the 200-map balance suite.
- **SC-003**: A default 32×32 / 2-player map generates in under 1 second including validation retries.
- **SC-004**: Statistical suite over 100 seeds shows water coverage and elevation variance within configured bounds on every map.

## Assumptions

- The original's GeoMorph module was a server-side heightmap generator; exact algorithm is unknown and does not need replicating — only the character (smooth fractal relief) and fairness properties matter.
- City production/saturation behavior lives in feature 001; this feature only places them.
- Map sharing by seed string is desirable but formal import/export formats are deferred to planning.

## Clarifications

### v1.1 (2026-08-22) — Verification suite trial-count reduction

- 2026-08-22: SC-001/SC-002 trial counts reduced (10k→1k seeds, 1000→200 maps) — property guarantees unchanged; CI runtime cut ~8x per product owner directive.
