/**
 * Terrain Public Type Surface — Feature 003
 *
 * Thin re-export module. The contracts in
 * `packages/terrain/src/contracts/terrain-types.ts` are local copies of
 * the canonical spec contracts at
 * `.specify/features/003-procedural-terrain-generation/contracts/terrain-types.ts`.
 * The local copies exist because `tsc`'s `rootDir: ./src` rejects
 * imports from outside the package; see `src/contracts/README.md` for
 * the full rationale and the engine-side precedent.
 *
 * **No new types are invented here** — see the contracts for the
 * canonical definitions, JSDoc, and rationale. Per constitution
 * Principle IV (specs as documentation), the contract is authoritative;
 * if a type here diverges from the contract, the contract wins.
 *
 * The single value exports (`TERRAIN_API_VERSION`, the
 * `DEFAULT_GENERATION_SETTINGS` constant) are runtime artifacts exposed
 * from the contract; the rest are types erased at compile time.
 *
 * Engine types (`Board`, `Cell`, `CityPlacement`, `Coord`, `PlayerId`)
 * are imported `import type` from `@europa/engine` so terrain does not
 * take a runtime dependency on the engine (see `engine-to-terrain.ts`
 * boundary rule: "terrain does not import anything from `@europa/engine`
 * at runtime"). The only runtime engine export terrain touches is
 * `createRng` (re-exported by the engine barrel and consumed via
 * `rng-adapter.ts`); even that is `import type`-only at this module
 * boundary.
 */

// Engine types terrain consumes. Imported `import type` so they're
// erased at compile time — terrain does not depend on the engine's
// compiled code at runtime. This is the engine ↔ terrain boundary
// rule from `engine-to-terrain.ts` line 7.
export type {
    Board,
    Cell,
    CityPlacement,
    Coord,
    PlayerId,
} from '@europa/engine';
// Re-export the `TerrainConstants` interface from the API contract so
// downstream packages can do `import type { TerrainConstants } from
// '@europa/terrain'` without reaching into the contracts directory.
// (The actual constant value `TERRAIN_CONSTANTS` is re-exported by
// `constants.ts`; only the type lives here.)
export type { TerrainConstants } from './contracts/terrain-api';

// Re-export the terrain contract's own public type surface so
// downstream packages can do `import type { ... } from
// '@europa/terrain'`. Names are alphabetical.
export type {
    // Settings
    GenerationSettings,
    // Inputs
    MapSeed,
    // Stats
    MapStats,
    // Output
    Rng,
    // Symmetry
    SymmetryStrategy,
    // Request + Result
    TerrainGenerationRequest,
    TerrainGenerationResult,
    // Validation
    ValidationReport,
    Violation,
} from './contracts/terrain-types';

// Single value exports from the contract: the terrain API version
// (constant) and the default settings (used by `resolveSettings` and
// for tests). Both are runtime artifacts; the rest of this file is
// types-only.
export {
    DEFAULT_GENERATION_SETTINGS,
    // Cross-package version pin (terrain was built against this engine
    // API version). Drift between this and the engine's
    // `ENGINE_API_VERSION` indicates the engine was bumped without
    // rebuilding terrain — see `engine/contracts-drift.test.ts` for the
    // engine-side equivalent.
    ENGINE_API_VERSION_REF,
    TERRAIN_API_VERSION,
} from './contracts/terrain-types';
