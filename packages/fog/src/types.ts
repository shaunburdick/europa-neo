/**
 * Fog Public Type Surface — Feature 002
 *
 * Thin re-export module. The contracts in
 * `packages/fog/src/contracts/fog-types.ts` are local copies of the
 * canonical spec contracts at
 * `.specify/features/002-fog-of-war-visibility/contracts/fog-types.ts`.
 * The local copies exist because `tsc`'s `rootDir: ./src` rejects
 * imports from outside the package; see `src/contracts/README.md` for
 * the full rationale and the engine-side precedent.
 *
 * **No new types are invented here** — see the contracts for the
 * canonical definitions, JSDoc, and rationale. Per constitution
 * Principle IV (specs as documentation), the contract is authoritative;
 * if a type here diverges from the contract, the contract wins.
 *
 * The single value exports (`FOG_API_VERSION`, the `FOG_MASK_*`
 * sentinels, `ENGINE_API_VERSION_REF`) are runtime artifacts exposed
 * from the contract; the rest are types erased at compile time.
 *
 * Engine types (`World`, `Player`, `Cell`, `Coord`, `PlayerId`,
 * `CellView`, `TickEvents`, `MatchConfig`, `Rng`,
 * `ENGINE_API_VERSION`) are imported `import type` from
 * `@europa/engine` so fog does not take a runtime dependency on the
 * engine for type-only consumers. The runtime engine exports fog
 * calls (`cellsInRange`, `getCell`, `forEachCell`, `createWorld`)
 * are imported normally in their respective module files.
 */

// Engine types fog consumes that are NOT already re-exported via
// `contracts/fog-types.ts` (which re-exports `CellView`, `Coord`,
// `MatchConfig`, `PlayerId`, `TickEvents`, `World`). The unique
// engine types fog re-exports here are `Cell`, `Player`, and
// `Rng` (the engine's PRNG callable type).
//
// Imported `import type` so they're erased at compile time — fog
// does not depend on the engine's compiled code for type-only
// consumers. The runtime engine exports fog calls
// (`cellsInRange`, `getCell`, `forEachCell`, `createWorld`)
// are imported normally in their respective module files.
export type { Cell, Player, Rng } from '@europa/engine';
// Re-export the `FogConstants` interface from the API contract so
// downstream packages can do `import type { FogConstants } from
// '@europa/fog'` without reaching into the contracts directory.
// (The actual constant value `FOG_CONSTANTS` is re-exported by
// `constants.ts`; only the type lives here.)
export type { FogConstants } from './contracts/fog-api';
// Re-export the fog contract's own public type surface so
// downstream packages can do `import type { ... } from
// '@europa/fog'`. Names are alphabetical.
// `FogMask` interface is also re-exported for the convenience of
// tests and downstream callers that want the type-level contract
// (the runtime representation is `Uint8Array`; see
// `src/mask.ts`). The contract marks it `@internal`; the
// re-export here is provided for testability and is exported as
// the same `@internal` discipline (callers that need to type their
// own masks can use `Uint8Array` directly).
export type {
    // Cell decoded view (from @europa/engine)
    CellView,
    // Options bag for computePlayerView
    ComputePlayerViewOptions,
    // Engine types (re-declared from @europa/engine for convenience)
    Coord,
    FogMask,
    // Match config (from @europa/engine)
    MatchConfig,
    // Branded primitive
    PlayerId,
    // Player view payload (re-declared from engine-to-fog.ts)
    PlayerView,
    // Tick events (from @europa/engine)
    TickEvents,
    // Visible set payload (re-declared from engine-to-fog.ts)
    VisibleSet,
    // World (from @europa/engine)
    World,
} from './contracts/fog-types';
// Single value exports from the contract: the fog API version
// (constant), the mask-state sentinels, and the cross-package
// engine version pin. All are runtime artifacts; the rest of this
// file is types-only.
export {
    // Cross-package version pin (fog was built against this engine
    // API version). Drift between this and the engine's
    // `ENGINE_API_VERSION` indicates the engine was bumped without
    // rebuilding fog.
    ENGINE_API_VERSION_REF,
    // Fog API version constant. Bumped on any breaking change to the
    // public surface.
    FOG_API_VERSION,
    // Mask state sentinels
    FOG_MASK_UNKNOWN,
    // Mask state sentinels
    FOG_MASK_VISIBLE,
} from './contracts/fog-types';
