/**
 * Public surface of the `@europa/terrain` package.
 *
 * This barrel re-exports the package's type contract, tunable
 * constants, the deterministic RNG adapter, the typed `GenerationError`,
 * and the full Phase 3+4 algorithm surface (`generateBoard`,
 * `validateBoard`, `hashBoard`, `assertBoardMatchesConfig`, and the
 * internal helpers for white-box testing). The barrel is the only
 * file a downstream package (feature 006 matchmaking) ever imports
 * — the implementation details (which `.ts` file each function
 * lives in) are private to the terrain package.
 *
 * The names in each `export { ... }` block are sorted alphabetically
 * (Biome `organizeImports` rule). The conceptual grouping lives in
 * the JSDoc above and in the source-of-truth contracts at
 * `src/contracts/`.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type {
    Board,
    Cell,
    CityPlacement,
    Coord,
    GenerationSettings,
    MapSeed,
    MapStats,
    PlayerId,
    Rng,
    SymmetryStrategy,
    TerrainConstants,
    TerrainGenerationRequest,
    TerrainGenerationResult,
    ValidationReport,
    Violation,
} from './types';

// ----------------------------------------------------------------------------
// Constants + version
// ----------------------------------------------------------------------------

export {
    DEFAULT_GENERATION_SETTINGS,
    TERRAIN_API_VERSION,
    TERRAIN_CONSTANTS,
} from './constants';

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export { GenerationError } from './errors';

// ----------------------------------------------------------------------------
// RNG adapter
// ----------------------------------------------------------------------------

export { deriveSubstream, mixSeed } from './rng-adapter';

// ----------------------------------------------------------------------------
// Settings helpers
// ----------------------------------------------------------------------------

export { resolveSettings, validateSettings } from './settings';

// ----------------------------------------------------------------------------
// Symmetry helpers
// ----------------------------------------------------------------------------

export { rotate180, rotate180Index } from './symmetry';

// ----------------------------------------------------------------------------
// Clamping helpers (US3 / FR-008)
// ----------------------------------------------------------------------------

export {
    CITIES_PER_PLAYER_MAX,
    CITIES_PER_PLAYER_MIN,
    clampCitiesPerPlayer,
    clampMaxRegenAttempts,
    clampMinCityCityDistance,
    clampMinCityWaterDistance,
    clampOctaves,
    clampRoughness,
    clampSettings,
    clampWaterRatio,
    MAX_REGEN_ATTEMPTS_MAX,
    MAX_REGEN_ATTEMPTS_MIN,
    MIN_CITY_CITY_DISTANCE_MAX,
    MIN_CITY_CITY_DISTANCE_MIN,
    MIN_CITY_WATER_DISTANCE_MAX,
    MIN_CITY_WATER_DISTANCE_MIN,
    OCTAVES_MAX,
    OCTAVES_MIN,
    ROUGHNESS_MAX,
    ROUGHNESS_MIN,
    WATER_RATIO_MAX,
    WATER_RATIO_MIN,
} from './clamp';

// ----------------------------------------------------------------------------
// Public algorithm surface (US1 + US2 + US3 implementations)
// ----------------------------------------------------------------------------

export { assertBoardMatchesConfig, buildBoard } from './board';
export { type Band, getPlayerBand } from './city-band';
export { resolveCityCount } from './city-count';
export { placeCitiesInBand } from './city-placement';
export { enforceCitySymmetry } from './city-symmetry';
export { generateElevationMap } from './elevation';
export { fbm } from './fbm';
export { generateBoard, hashBoard } from './generate';
export { validateBoard } from './validate';
export { valueNoise } from './value-noise';
export { _extractWater, extractWater } from './water';

// ----------------------------------------------------------------------------
// Internal helpers (forwarded for testability per `contracts/terrain-api.ts`)
// ----------------------------------------------------------------------------

export { _enforcePointSymmetry } from './elevation';
