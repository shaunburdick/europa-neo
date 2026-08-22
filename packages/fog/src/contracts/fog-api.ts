/**
 * Fog Public API — Feature 002
 *
 * The full surface other packages depend on. Everything here is a pure
 * function with no I/O, no wall-clock reads, no unseeded randomness.
 * Fog consumes the engine's `World` snapshot and emits fog-filtered
 * payloads (`VisibleSet`, `PlayerView`).
 *
 * Consumers:
 *   - 004 (networking)     → calls `computePlayerView` per player per tick.
 *   - 005 (console)        → receives `PlayerView` (filtered or full-board).
 *   - tests                → call `computeVisibleSet` and `computePlayerView`
 *                            directly to test horizon rules.
 *
 * See `research.md` for the algorithm rationale and `data-model.md` for
 * the field-level contracts.
 *
 * =============================================================================
 * CONFORMANCE TO FEATURE 001
 * =============================================================================
 *
 * This feature conforms to feature 001's `engine-to-fog.ts` boundary
 * without modification. The engine already declares `computeVisibleSet`;
 * fog implements it. The engine declares `VisibleSet` and `PlayerView`;
 * fog uses them. No additive changes to feature 001's contracts are
 * required.
 *
 * The `computeVisibleSet` signature below is the same shape as the
 * engine's declaration (`engine-to-fog.ts:81`); conformance test
 * (`tests/conformance.test.ts`) verifies drift-free alignment.
 *
 * =============================================================================
 * SPEC RESOLUTION NOTES (see research.md §14 for the full list)
 * =============================================================================
 *
 * - Viewer definition: troop stacks only (cells where `troopOwner ===
 *   player && troopCount > 0`). Cities alone do not project vision
 *   (spec US1, Edge Case "city ownership").
 * - Algorithm: Chebyshev range expansion (no line-of-sight, no
 *   elevation blockers — spec Assumptions: "radius alone determines
 *   visibility").
 * - Memory model: binary mask, no recall (spec FR-004 / US2).
 * - Redaction: structural — out-of-horizon cells are absent from
 *   `visibleCells`. No "redacted cell" placeholder.
 * - Reveal-on-attack: **no** counter-intel. Combat outside horizon does
 *   not reveal attacker positions (spec Edge Case "adjacent stacks").
 */

import type {
  CellView,
  Coord,
  PlayerId,
} from '@europa/engine';

import type {
  ComputePlayerViewOptions,
  PlayerView,
  VisibleSet,
} from './fog-types';

// ----------------------------------------------------------------------------
// World lifecycle (read-only by contract)
// ----------------------------------------------------------------------------
//
// The engine's `World` and the engine's `tick(world)` are the
// authoritative source of state. Fog does not mutate world, does not
// advance time, does not stage orders. Fog is a pure read-and-filter
// consumer.
// ----------------------------------------------------------------------------

/**
 * Engine types re-declared for fog's public API consumers. Imported
 * via `import type` so they're erased at runtime.
 */
export type {
  World,
  TickEvents,
  MatchConfig,
  CellView,
  Coord,
  PlayerId,
} from '@europa/engine';

// ----------------------------------------------------------------------------
// Visibility horizon
// ----------------------------------------------------------------------------

/**
 * Compute the per-player `VisibleSet` for one tick. Pure.
 *
 * Algorithm (see `research.md` §1, `plan.md` "Visibility pipeline"):
 *
 *   1. Iterate `world.state.troopOwners` row-major; collect every cell
 *      where `troopOwner === player && troopCount > 0` (the "viewers").
 *      Cities alone do NOT project vision (spec Edge Case).
 *   2. Allocate a `FogMask` (Uint8Array, length `width * height`,
 *      zero-init). Allocated fresh every tick (no-memory rule).
 *   3. For each viewer cell, mark every cell within Chebyshev range
 *      `visibilityRadius` (using the engine's `cellsInRange` helper).
 *   4. Iterate the mask row-major; for each `1`, push its `Coord` to
 *      the output array.
 *   5. Return the `VisibleSet`.
 *
 * Determinism: identical `(world, player, visibilityRadius)` produces
 * byte-identical `VisibleSet` output. Verified by
 * `tests/determinism.test.ts` (100 runs).
 *
 * Implementation conforms to the declaration in `engine-to-fog.ts:81`.
 * The signature here MUST match that declaration byte-for-byte.
 *
 * @param world              The current `World` snapshot (from `tick()`).
 * @param player             The player whose visibility is being computed.
 * @param visibilityRadius   Sensor radius in cells (Chebyshev). Typically
 *                           `world.config.visibilityRadius`.
 * @returns                  A `VisibleSet` containing every cell visible
 *                           to `player` this tick, row-major, no duplicates.
 *
 * @example
 * ```ts
 * const visible = computeVisibleSet(world, player, world.config.visibilityRadius);
 * console.log(`Player ${player} sees ${visible.visibleCells.length} cells.`);
 * ```
 */
export declare function computeVisibleSet(
  world: Readonly<import('@europa/engine').World>,
  player: PlayerId,
  visibilityRadius: number,
): VisibleSet;

// ----------------------------------------------------------------------------
// Player view (the payload handed to networking)
// ----------------------------------------------------------------------------

/**
 * Compute the full fog-filtered `PlayerView` payload for one player.
 * Pure.
 *
 * This is the function feature 004 (networking) calls once per player
 * per tick. The returned `PlayerView` is the complete payload — it is
 * safe to serialize directly and send to the client.
 *
 * Redaction rule (spec FR-002 / FR-003):
 *   - Cells outside the player's horizon are **absent** from
 *     `visibleCells` (not present as "redacted" placeholders).
 *   - Cell-level `TickEvents` (combat, capture) whose `cell` is outside
 *     the horizon are dropped.
 *   - Player-level `TickEvents` (`EliminationEvent`, `AppliedOrderRecord`,
 *     `errors`) are kept always — they are not cell-bound.
 *
 * Spectator mode (`options.spectator === true`, spec US3 / FR-006):
 *   - `visibleCells` contains every cell on the board (full board state).
 *   - `events` is unfiltered.
 *   - The server is responsible for marking the session read-only
 *     (feature 004 concern, not fog's).
 *
 * Determinism: identical `(world, player, options)` produces byte-
 * identical `PlayerView` output. Verified by `tests/determinism.test.ts`
 * (100 runs) and `tests/redaction.test.ts` (500-tick scripted match).
 *
 * @param world    The current `World` snapshot (from `tick()`).
 * @param player   The player whose view is being computed (or the player
 *                 the spectator session is observing).
 * @param options  Optional flags. `{ spectator: true }` for full-board
 *                 views. Default: `{ spectator: false }`.
 * @returns        A `PlayerView` ready for serialization.
 *
 * @example
 * ```ts
 * // Player view (horizon-filtered):
 * const view = computePlayerView(world, playerId);
 * sendToClient(view);
 *
 * // Spectator view (full board):
 * const specView = computePlayerView(world, anyPlayer, { spectator: true });
 * sendToSpectator(specView);
 * ```
 */
export declare function computePlayerView(
  world: Readonly<import('@europa/engine').World>,
  player: PlayerId,
  options?: ComputePlayerViewOptions,
): PlayerView;

// ----------------------------------------------------------------------------
// Query helpers (lightweight, used by clients that already have a PlayerView)
// ----------------------------------------------------------------------------

/**
 * Test whether a specific cell is visible in a `PlayerView`. O(visibleCells)
 * unless the view's `visibleCells` has been pre-indexed (which the
 * networking layer may choose to do for hot-path queries).
 *
 * For a server-side fast-path query (without materializing the full
 * `PlayerView`), call `computeVisibleSet` and check `visibleCells`
 * membership directly.
 *
 * @param view      The `PlayerView` to query.
 * @param coord     The cell to check.
 * @returns         `true` iff `coord` is in `view.visibleCells`.
 *
 * @example
 * ```ts
 * if (isVisible(playerView, { x: 10, y: 15 })) {
 *   renderCell(playerView.visibleCells[idx]);
 * }
 * ```
 */
export declare function isVisible(
  view: Readonly<PlayerView>,
  coord: Coord,
): boolean;

/**
 * Locate and return the `CellView` for a specific coordinate, or
 * `undefined` if the cell is not visible in this `PlayerView`.
 *
 * Convenience helper — equivalent to `isVisible(view, coord) ?
 * findByCoord(view.visibleCells, coord) : undefined`. Provided so
 * clients don't have to write the lookup themselves.
 *
 * @param view      The `PlayerView` to query.
 * @param coord     The cell to look up.
 * @returns         The `CellView` for `coord`, or `undefined` if not visible.
 *
 * @example
 * ```ts
 * const cell = visibleCellAt(playerView, { x: 10, y: 15 });
 * if (cell) {
 *   console.log(`Cell (10,15) has ${cell.troopCount} troops.`);
 * }
 * ```
 */
export declare function visibleCellAt(
  view: Readonly<PlayerView>,
  coord: Coord,
): CellView | undefined;

// ----------------------------------------------------------------------------
// Event filtering (exposed for testing)
// ----------------------------------------------------------------------------

/**
 * Filter `TickEvents` to remove cell-level events whose cell is outside
 * the player's horizon. Player-level events (`EliminationEvent`,
 * `AppliedOrderRecord`, `errors`) are kept regardless.
 *
 * Exposed primarily for tests; `computePlayerView` calls this
 * internally. Feature 004 should NOT need to call this directly —
 * use `computePlayerView` instead.
 *
 * For spectators, the filter is a no-op (all events are kept).
 *
 * @param world         The current `World` snapshot (for horizon lookup).
 * @param visibleCells  The player's already-computed visible cells
 *                      (row-major, no duplicates).
 * @param events        The unfiltered `TickEvents` to filter.
 * @param spectator     If `true`, return `events` unchanged.
 * @returns             A new `TickEvents` object with cell-level events
 *                      dropped for out-of-horizon cells.
 */
export declare function filterTickEvents(
  world: Readonly<import('@europa/engine').World>,
  visibleCells: ReadonlyArray<Coord>,
  events: Readonly<import('@europa/engine').TickEvents>,
  spectator: boolean,
): Readonly<import('@europa/engine').TickEvents>;

// ----------------------------------------------------------------------------
// Hashing (for determinism tests)
// ----------------------------------------------------------------------------

/**
 * Stable hash of a `PlayerView`'s mutable parts (visibleCells, events).
 * Used by SC-001 (byte-identical re-runs) and tests.
 *
 * Integer-only (FNV-1a-style over the JSON-serialized view). Not
 * cryptographic — collision rate is fine for test use.
 *
 * @param view  The `PlayerView` to hash.
 * @returns     A 16-char hex string.
 */
export declare function hashPlayerView(view: Readonly<PlayerView>): string;

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/**
 * All tunable constants for fog. Mirrors the engine's `ENGINE_CONSTANTS`
 * and terrain's `TERRAIN_CONSTANTS` discipline (constitution Principle V;
 * spec SC-005).
 *
 * Stored in `packages/fog/src/constants.ts` and re-exported here. The
 * engine owns the primary visibility constant
 * (`ENGINE_CONSTANTS.visibilityRadiusDefault`); fog owns only the
 * mask-state sentinels and a defensive fallback.
 */
export interface FogConstants {
  /** Sentinel for "cell not visible" in the FogMask (Uint8Array value). */
  readonly maskUnknown: 0;
  /** Sentinel for "cell visible" in the FogMask (Uint8Array value). */
  readonly maskVisible: 1;
  /**
   * Defensive fallback for `visibilityRadius` if `world.config.visibilityRadius`
   * is missing. The engine guarantees this field; this is a safety net
   * for test fixtures that may not populate it. Matches the engine's
   * `ENGINE_CONSTANTS.visibilityRadiusDefault`.
   */
  readonly defaultRadiusFallback: number;
  /**
   * Default sensor radius used by quickstart scenarios and tests where
   * the engine's default is not the value under test. Documented as
   * matching the original Europa's radius (a few cells in each
   * direction).
   */
  readonly testRadius: number;
}

export declare const FOG_CONSTANTS: FogConstants;

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

/**
 * The current fog API version. Re-exported from `fog-types.ts`.
 * Consumers can `import { FOG_API_VERSION } from '@europa/fog'` to
 * pin-check at startup.
 */
export declare const FOG_API_VERSION: typeof import('./fog-types').FOG_API_VERSION;
