/**
 * Public surface of the `@europa/fog` package.
 *
 * This is the **populated barrel** (Phase 3+ / T045) — re-exports the
 * full type surface, the tunable constants, the foundational helpers
 * (mask + range), and every runtime function that implements the
 * spec (`computeVisibleSet`, `computePlayerView`, `isVisible`,
 * `visibleCellAt`, `hashPlayerView`, `filterTickEvents`).
 *
 * Consumers:
 *   - 004 (networking)     → calls `computePlayerView` per player
 *                            per tick.
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
// `computeVisibleSet` to record which cells are in the player's
// horizon this tick. The mask is allocated fresh every call
// (no-memory rule, spec FR-004). Re-exported here for testability;
// downstream packages should not depend on the internal
// representation.

export { createMask, isVisible as isCellMarked, markVisible, unionMasks } from './mask';
// Re-export the query-named `isVisible` from mask.ts as
// `isCellMarked` to avoid clashing with the `isVisible(view,
// coord)` PlayerView query helper below. The PlayerView query is a
// different concept (CellView lookup), not a mask test.

export type { FogMask } from './types';

// ----------------------------------------------------------------------------
// Chebyshev range helpers (Phase 2 foundational)
// ----------------------------------------------------------------------------

export { chebyshevDisk, chebyshevDistance } from './range';

// ----------------------------------------------------------------------------
// Runtime API (US1 visibility horizon + US2 redaction + US3 spectator)
// ----------------------------------------------------------------------------
//
// The public functions per `contracts/fog-api.ts`. All are pure:
// no I/O, no wall-clock reads, no unseeded randomness.

/**
 * Horizon event filter (FR-003). Exposed primarily for tests;
 * feature 004 should use `computePlayerView` instead.
 */
export { filterTickEvents } from './eventsFilter';

/**
 * Full fog-filtered payload per player per tick; `{ spectator: true }`
 * returns the full board (US1 + US2 + US3).
 */
export { computePlayerView } from './playerView';

/**
 * PlayerView queries for clients that already hold a payload
 * (`isVisible(view, coord)`, `visibleCellAt(view, coord)`) plus the
 * determinism-suite hash helper.
 */
export {
  hashPlayerView,
  isVisible,
  visibleCellAt,
} from './utils';
/** Visibility horizon: union of friendly stacks' Chebyshev disks (US1). */
export { computeVisibleSet } from './visibleSet';
