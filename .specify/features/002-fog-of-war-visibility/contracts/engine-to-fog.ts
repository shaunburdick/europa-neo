/**
 * Engine ↔ Fog of War contract — Feature 002 mirror.
 *
 * THIS FILE IS A VERBATIM MIRROR of feature 001's
 * `engine-to-fog.ts`. It exists so that `@europa/fog` consumers
 * (feature 004 networking, feature 005 console) can import the
 * engine ↔ fog boundary contract from a single canonical location
 * (`@europa/fog/contracts/engine-to-fog`) without taking a direct
 * type dependency on `@europa/engine`.
 *
 * The two files MUST remain byte-identical. Drift between this file
 * and feature 001's `engine-to-fog.ts` is caught by
 * `tests/conformance.test.ts` and is treated as a bug (constitution
 * Principle IV: "specs as documentation; stale contracts are bugs").
 *
 * If the engine's `engine-to-fog.ts` ever needs to change, both files
 * update in the same change set.
 *
 * ----------------------------------------------------------------------------
 * Conformance verification
 * ----------------------------------------------------------------------------
 *
 * On package load (`packages/fog/src/index.ts`), fog compares this
 * file's contents against the engine's file at compile time via a
 * TypeScript-level type equality check (see `tests/conformance.test.ts`).
 * The runtime check is a `Readonly<...>` identity assertion on the
 * exported types; the structural types are compared by `expect().toMatchObject()`
 * in unit tests.
 *
 * ----------------------------------------------------------------------------
 * Re-exports for fog consumers
 * ----------------------------------------------------------------------------
 *
 * Fog re-exports the engine-declared types (`VisibleSet`, `PlayerView`)
 * verbatim. Fog does NOT extend or modify them. Any change to those
 * types must originate in feature 001's `engine-to-fog.ts` and be
 * mirrored here.
 */

// ----------------------------------------------------------------------------
// Begin verbatim mirror of feature 001's engine-to-fog.ts
// ----------------------------------------------------------------------------

/**
 * Engine ↔ Fog of War contract (feature 001 ↔ feature 002).
 *
 * The engine is the source of truth for `World`. Feature 002 (fog)
 * computes per-player visible sets and `PlayerView` projections; the
 * engine does NOT know about fog.
 *
 * Boundary rule: the engine emits full, unfiltered state. Fog is a
 * downstream filter that NEVER receives state it shouldn't (server-
 * side enforcement per feature 002 FR-003).
 *
 * What the engine provides to fog:
 *   - `World` (full state) at each tick.
 *   - `TickEvents` so fog can animate visibility changes (combat in a
 *     previously visible cell, etc.).
 *   - `MatchConfig.visibilityRadius` so fog uses the same constant.
 *   - `getCell`, `forEachCell`, `cellsInRange`, `neighborsOf` helpers.
 *
 * What the engine needs from fog:
 *   - Nothing. Fog is a pure consumer. It does not write back to the
 *     engine. The fog package depends on `@europa/engine`; the engine
 *     does not depend on `@europa/fog`.
 */

import type {
  CellView,
  Coord,
  MatchConfig,
  PlayerId,
  TickEvents,
  World,
} from '@europa/engine';

/**
 * What fog receives from the engine per tick. The engine produces this
 * implicitly via `tick(world)`; fog packages it for fan-out.
 */
export interface EngineTickOutput {
  readonly world: Readonly<World>;
  readonly events: Readonly<TickEvents>;
}

/**
 * Fog computes this per player per tick. The engine itself doesn't see
 * this type — it's the contract between fog and networking (004).
 */
export interface VisibleSet {
  readonly player: PlayerId;
  readonly tick: number;
  readonly visibleCells: ReadonlyArray<Coord>;
}

/**
 * What fog hands to networking (and ultimately the console) per tick.
 * `unknownCells` is implicit: any cell NOT in `visibleCells` is unknown.
 */
export interface PlayerView {
  readonly player: PlayerId;
  readonly tick: number;
  readonly visibleCells: ReadonlyArray<CellView>;
  readonly events: Readonly<TickEvents>;
  /** Snapshot of `MatchConfig` (engine-owned constants the console cares about). */
  readonly config: Readonly<MatchConfig>;
}

/**
 * Engine helper re-declared here for the convenience of fog consumers
 * who import this file rather than the full `@europa/engine` surface.
 */
export declare function cellsInRange(
  world: Readonly<World>,
  center: Coord,
  r: number,
): ReadonlyArray<Coord>;

/**
 * Helper for fog to compute the union of all friendly stacks' horizons
 * in one pass. Engine does not export this directly; fog implements it
 * over `forEachCell`. Declared here so the contract is documented.
 */
export declare function computeVisibleSet(
  world: Readonly<World>,
  player: PlayerId,
  visibilityRadius: number,
): VisibleSet;

// ----------------------------------------------------------------------------
// End verbatim mirror of feature 001's engine-to-fog.ts
// ----------------------------------------------------------------------------

/**
 * Re-export the engine types that fog's public surface depends on, so
 * consumers can `import { World, Coord, PlayerId } from '@europa/fog/contracts/engine-to-fog'`
 * without taking a direct dependency on `@europa/engine`.
 */
export type { CellView, Coord, MatchConfig, PlayerId, TickEvents, World };
