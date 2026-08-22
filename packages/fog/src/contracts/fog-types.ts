/**
 * Fog Package Type Contracts — Feature 002
 *
 * The public type surface of the `@europa/fog` package. Re-exported via
 * `@europa/fog` (packages/fog/src/index.ts).
 *
 * Source-of-truth engine types are imported **type-only** from
 * `@europa/engine`. They are not duplicated here.
 *
 * Consumers (downstream features):
 *   - 004 (networking)     → calls `computePlayerView`; serializes `PlayerView`.
 *   - 005 (console)        → reads `PlayerView`; renders the visible cells.
 *   - 001 (engine)         → provides `World`, `TickEvents`, read helpers;
 *                            does NOT import from `@europa/fog`.
 *
 * Versioning: breaking changes bump `FOG_API_VERSION` and update
 * downstream consumers in the same change set (constitution Principle
 * IV: specs as documentation; stale contracts are bugs).
 *
 * Rules for this file:
 *   - All types are readonly outside fog internals.
 *   - No `any`. Use `unknown` + narrowing where shape is dynamic.
 *   - Numbers that represent counts/indices/capacities are integers
 *     (see engine-types.ts and the engine's research.md §6 for rationale).
 *   - The `VisibleSet` and `PlayerView` types declared here are
 *     **re-declarations** of the same types in engine's
 *     `engine-to-fog.ts`. The two files MUST remain byte-identical.
 *     Drift is caught by `tests/conformance.test.ts`.
 *
 * =============================================================================
 * CONFORMANCE TO FEATURE 001
 * =============================================================================
 *
 * This feature conforms to feature 001's `engine-to-fog.ts` boundary
 * without modification. The engine already declares:
 *
 *   - `VisibleSet` (re-exported here)
 *   - `PlayerView` (re-exported here)
 *   - `computeVisibleSet` (declared here with the same signature)
 *
 * No additive changes to feature 001's contracts are required. The
 * `MatchConfig.visibilityRadius` field is consumed directly.
 *
 * =============================================================================
 * SPEC AMBIGUITIES RESOLVED (see research.md §14 for full list)
 * =============================================================================
 *
 * - Viewer definition: **troops only** (spec US1, Edge Case "city
 *   ownership"). Cities alone do not project vision.
 * - FogMask states: **binary** (0 = unknown, 1 = visible). Spec FR-004
 *   forbids a third "previously visible / recall" state.
 * - `lastSeenTick`: **omitted** from the v1 API. Spec has no memory.
 * - Opponent unit count: **exact count** inside horizon (spec FR-005).
 * - Opponent reserves: **visible** inside horizon (spec does not redact).
 * - Spectator mode: handled by function-level `options.spectator` flag,
 *   not by modifying the `PlayerView` type.
 */

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

/**
 * Current fog API version. Increment on any breaking change to the
 * public surface (types or functions in fog-types.ts and fog-api.ts).
 *
 * Mirrors the engine's `ENGINE_API_VERSION` discipline: every consumer
 * pin-checks at startup, incrementing forces a coordinated update.
 */
export const FOG_API_VERSION = '0.1.0' as const;

// ----------------------------------------------------------------------------
// Engine types (re-exported for convenience, not re-defined)
// ----------------------------------------------------------------------------

// `import type` ensures these are erased at runtime; fog does not
// depend on the engine's compiled code for types. (The fog package does
// call engine runtime helpers — see `fog-api.ts` — but that's a normal
// downstream-consumers relationship.)
//
// LOCAL COPY FIX: the spec's `import type { ..., ENGINE_API_VERSION
// as _ENGINE_API_VERSION_REF, ... }` is a compile-time bug (TS1361:
// "type-only import used as value"). The value export below requires
// a *value* binding, not a type-only one. The local copy uses a
// regular import for `ENGINE_API_VERSION` (it is a `const` declared
// in the engine barrel, not a type). The spec should be updated to
// match in a follow-up change set; until then, this deviation keeps
// the package compiling. The two files MUST remain byte-identical
// in the wave 5B Polish phase after the spec is corrected.
import {
  ENGINE_API_VERSION as _ENGINE_API_VERSION_REF,
  type CellView,
  type Coord,
  type MatchConfig,
  type PlayerId,
  type TickEvents,
  type World,
} from '@europa/engine';

/**
 * The engine API version fog was built against. If the engine version
 * pin in feature 001's contracts ever drifts, this re-export lets a
 * single `import { ENGINE_API_VERSION_REF } from '@europa/fog'` catch
 * the drift.
 */
export const ENGINE_API_VERSION_REF = _ENGINE_API_VERSION_REF;

// ----------------------------------------------------------------------------
// Engine-declared types (re-declared verbatim from engine-to-fog.ts)
// ----------------------------------------------------------------------------
//
// The engine's `engine-to-fog.ts` is the authoritative source for
// `VisibleSet` and `PlayerView`. These re-declarations exist so that
// `@europa/fog` consumers can `import { VisibleSet, PlayerView } from
// '@europa/fog'` without taking a direct type dependency on
// `@europa/engine`.
//
// Conformance test (`tests/conformance.test.ts`) enforces byte-identity
// between these re-declarations and the engine originals. Drift = bug.
// ----------------------------------------------------------------------------

/**
 * Per-player set of visible cells for one tick. Re-declared from
 * `engine-to-fog.ts:47`.
 *
 * Fog's `computeVisibleSet` returns this. Most callers prefer
 * `PlayerView` (which decodes each cell into a `CellView`); the
 * lightweight `VisibleSet` is exposed for tests and for callers that
 * need cell positions without the full payload.
 */
export interface VisibleSet {
  readonly player: PlayerId;
  readonly tick: number;
  readonly visibleCells: ReadonlyArray<Coord>;
}

/**
 * Full fog-filtered payload handed to networking (feature 004) and
 * ultimately the console (feature 005). Re-declared from
 * `engine-to-fog.ts:57`.
 *
 * The redaction rule is structural: cells outside the player's horizon
 * simply do not appear in `visibleCells`. There is no "redacted cell"
 * placeholder (spec FR-002 / FR-003).
 *
 * For spectators (`computePlayerView(world, player, { spectator: true })`),
 * `visibleCells` contains every cell on the board (spec US3 / FR-006).
 */
export interface PlayerView {
  readonly player: PlayerId;
  readonly tick: number;
  readonly visibleCells: ReadonlyArray<CellView>;
  readonly events: Readonly<TickEvents>;
  /** Snapshot of `MatchConfig` (engine-owned constants the console cares about). */
  readonly config: Readonly<MatchConfig>;
}

// ----------------------------------------------------------------------------
// Fog-owned types (not present in engine-to-fog.ts)
// ----------------------------------------------------------------------------

/**
 * Internal working scratch buffer used during `computePlayerView` to
 * record which cells are in the player's horizon this tick.
 *
 * **Not exported as part of the public surface** — fog's `index.ts`
 * does not re-export this type. Listed here for documentation only; the
 * runtime representation is `Uint8Array` (the fastest, most
 * deterministic option for a 32×32 board).
 *
 * Cell states (values of `data[i]`):
 *   - `0` = unknown (cell NOT in horizon this tick)
 *   - `1` = visible (cell IS in horizon this tick)
 *
 * There is **no third "previously visible / recall" state**. Spec
 * FR-004 and US2 explicitly forbid remembering previously seen terrain.
 * The mask is allocated fresh each tick (zero-init) and overwritten in
 * place.
 *
 * @internal
 */
export interface FogMask {
  /** Row-major: `data[y * width + x]`. Always length `width * height`. */
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Sentinel values for `FogMask.data[i]`. */
export const FOG_MASK_UNKNOWN = 0 as const;
export const FOG_MASK_VISIBLE = 1 as const;

/**
 * Options bag for `computePlayerView`. Currently a single field;
 * structured as an object so future options can be added without a
 * signature break (Principle V: forward-compatible API shape).
 */
export interface ComputePlayerViewOptions {
  /**
   * When `true`, the returned `PlayerView.visibleCells` contains every
   * cell on the board (decoded), and `events` is unfiltered. Use for
   * spectator/observer sessions (spec US3 / FR-006). The console UI
   * should still render these sessions as read-only (enforced by
   * feature 004 networking, not by fog).
   *
   * Default: `false` (horizon-filtered payload).
   */
  readonly spectator?: boolean;
}

// ----------------------------------------------------------------------------
// Re-exports for convenience
// ----------------------------------------------------------------------------

/**
 * Re-export the engine types that fog's public surface depends on, so
 * consumers can `import { World, Coord, PlayerId } from '@europa/fog'`
 * without taking a direct dependency on `@europa/engine` for
 * read-only types.
 *
 * Note: `World` is exported here for documentation purposes. Consumers
 * that build `World` instances should import the constructor and
 * helpers from `@europa/engine`, not `@europa/fog`.
 */
export type { CellView, Coord, MatchConfig, PlayerId, TickEvents, World };
