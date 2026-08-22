/**
 * Public surface of the `@europa/fog` package.
 *
 * This is the **Phase 2 minimal barrel** — re-exports the full
 * type surface, the tunable constants, and the foundational
 * module helpers (mask + range). The runtime functions that
 * implement the spec (`computeVisibleSet`, `computePlayerView`,
 * `isVisible`, `visibleCellAt`, `hashPlayerView`,
 * `filterTickEvents`) are forward-declared but NOT YET
 * IMPLEMENTED. The Phase 2 minimal barrel compiles cleanly and
 * gives downstream packages a stable import surface for types +
 * constants + foundational helpers; the populated barrel lands
 * in Phase 3 (T045) after US1 implementation files exist.
 *
 * Consumers:
 *   - 004 (networking)     → calls `computePlayerView` per player
 *                            per tick (lands in Phase 3).
 *   - 005 (console)        → reads `PlayerView`; renders the
 *                            visible cells.
 *   - 003 (terrain)        → unrelated; terrain doesn't import
 *                            fog.
 *   - 001 (engine)         → does NOT import fog (engine is a
 *                            pure simulation primitive; fog is a
 *                            downstream filter).
 *
 * The names in each `export { ... }` block are sorted
 * alphabetically (Biome `organizeImports` rule). The conceptual
 * grouping lives in the JSDoc above and in the source-of-truth
 * contracts at `.specify/features/002-fog-of-war-visibility/contracts/`.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
//
// Re-exports of every public type in `contracts/fog-types.ts` and
// `contracts/fog-api.ts`, plus the engine types fog's public
// surface depends on. The types are alphabetical; see the
// contracts for grouped documentation and FR references.

export type {
  // Engine re-exported types
  Cell,
  // From fog-types
  CellView,
  // Options bag for computePlayerView
  ComputePlayerViewOptions,
  // Coordinates (engine)
  Coord,
  // Match config (engine)
  MatchConfig,
  // Engine player
  Player,
  // Branded primitive
  PlayerId,
  // Player view (re-declared from engine-to-fog.ts)
  PlayerView,
  // Engine PRNG callable type
  Rng,
  // Engine events
  TickEvents,
  // Visible set (re-declared from engine-to-fog.ts)
  VisibleSet,
  // Engine world
  World,
} from './types';

// Single value re-exports: fog API version, engine API version
// pin, mask-state sentinels. Bumped on any breaking change to
// the public surface (constitution Principle IV).
export {
  ENGINE_API_VERSION_REF,
  FOG_API_VERSION,
  FOG_MASK_UNKNOWN,
  FOG_MASK_VISIBLE,
} from './types';

// ----------------------------------------------------------------------------
// Tunable constants (single location, SC-005)
// ----------------------------------------------------------------------------

export { FOG_CONSTANTS } from './constants';

// ----------------------------------------------------------------------------
// Binary mask helpers (Phase 2 foundational)
// ----------------------------------------------------------------------------
//
// The `FogMask` is the working scratch buffer used by
// `computeVisibleSet` (lands in Phase 3) to record which cells
// are in the player's horizon this tick. The mask is allocated
// fresh every call (no-memory rule, spec FR-004). Re-exported
// here for testability; downstream packages should not depend
// on the internal representation.

export { createMask, isVisible as isCellMarked, markVisible, unionMasks } from './mask';
// Re-export the query-named `isVisible` from mask.ts as
// `isCellMarked` to avoid clashing with the `isVisible(view,
// coord)` PlayerView query helper (lands in Phase 3, T014 per
// the engine's tasks.md). The PlayerView query is a different
// concept (CellView lookup), not a mask test.

export type { FogMask } from './types';

// ----------------------------------------------------------------------------
// Chebyshev range helpers (Phase 2 foundational)
// ----------------------------------------------------------------------------

export { chebyshevDisk, chebyshevDistance } from './range';

// ----------------------------------------------------------------------------
// Phase 3 forward declarations (DO NOT IMPLEMENT YET)
// ----------------------------------------------------------------------------
//
// The runtime functions below are the public API surface per
// `contracts/fog-api.ts`. They are forward-declared here so
// downstream type-checkers can resolve the names AND so the
// barrel exports a real runtime symbol (so
// `typeof fog.computeVisibleSet === 'function'` and the test
// suite can detect any accidental removal). Each stub throws
// at runtime if called — this is intentional; the real
// implementations land in Phase 3 (US1, T027/T028).
//
// These stubs use a real `function` declaration (not
// `export declare function`) so they have runtime presence.
// `export declare function` would be erased by `tsc` and
// the barrel would silently lose these exports.

/**
 * Phase 3 will implement — do not call in Phase 2.
 *
 * @throws Always (Phase 2 stub). The real implementation lands
 *         in `src/visibleSet.ts` (Phase 3 / US1, T027).
 */
export function computeVisibleSet(
  _world: Readonly<import('@europa/engine').World>,
  _player: import('@europa/engine').PlayerId,
  _visibilityRadius: number,
): import('./types').VisibleSet {
  throw new Error(
    'computeVisibleSet: not yet implemented (Phase 3 / US1, T027). ' +
      'See packages/fog/src/visibleSet.ts.',
  );
}

/**
 * Phase 3 will implement — do not call in Phase 2.
 *
 * @throws Always (Phase 2 stub). The real implementation lands
 *         in `src/playerView.ts` (Phase 3 / US1, T028).
 */
export function computePlayerView(
  _world: Readonly<import('@europa/engine').World>,
  _player: import('@europa/engine').PlayerId,
  _options?: import('./types').ComputePlayerViewOptions,
): import('./types').PlayerView {
  throw new Error(
    'computePlayerView: not yet implemented (Phase 3 / US1, T028). ' +
      'See packages/fog/src/playerView.ts.',
  );
}

/**
 * Phase 3 will implement — do not call in Phase 2.
 *
 * Note: this is the `PlayerView`-level query (`isVisible(view, coord)`),
 * distinct from the mask-level `isCellMarked` (or `isVisible` in
 * `src/mask.ts`) — see the JSDoc in `mask.ts` for the difference.
 *
 * @throws Always (Phase 2 stub). The real implementation lands
 *         in `src/utils.ts` (Phase 3 / US1, T014 per the engine's
 *         `tasks.md` mapping; equivalent to the spec's US1 visibility
 *         queries).
 */
export function isVisible(
  _view: Readonly<import('./types').PlayerView>,
  _coord: import('@europa/engine').Coord,
): boolean {
  throw new Error(
    'isVisible (PlayerView query): not yet implemented (Phase 3 / US1). ' +
      'See packages/fog/src/utils.ts.',
  );
}

/**
 * Phase 3 will implement — do not call in Phase 2.
 *
 * @throws Always (Phase 2 stub). The real implementation lands
 *         in `src/utils.ts` (Phase 3 / US1, T014 per the engine's
 *         `tasks.md` mapping; equivalent to the spec's US1 visibility
 *         queries).
 */
export function visibleCellAt(
  _view: Readonly<import('./types').PlayerView>,
  _coord: import('@europa/engine').Coord,
): import('@europa/engine').CellView | undefined {
  throw new Error(
    'visibleCellAt: not yet implemented (Phase 3 / US1). ' + 'See packages/fog/src/utils.ts.',
  );
}
