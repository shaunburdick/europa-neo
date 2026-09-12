/**
 * Core Engine Type Contracts — Feature 001
 *
 * Source of truth for every entity and value the engine exposes to other
 * features. Re-exported via `@europa/engine` (packages/engine/src/index.ts).
 *
 * Consumers (downstream features):
 *   - 003 (terrain)        → produces a `Board` consumed by `createWorld`.
 *   - 002 (fog)            → reads `World`, produces `PlayerView` per player.
 *   - 004 (networking)     → serializes `World` + `TickEvents` over wire.
 *   - 005 (console)        → reads `PlayerView`, emits `Order`.
 *   - 006 (matchmaking)    → drives lifecycle (createWorld, isTerminal).
 *
 * Versioning: breaking changes bump `ENGINE_API_VERSION` and update
 * downstream packages in the same change set (constitution Principle IV:
 * specs as documentation; stale contracts are bugs).
 *
 * Rules for this file:
 *   - All types are `Readonly` outside engine internals.
 *   - No `any`. Use `unknown` + narrowing where shape is dynamic.
 *   - Numbers that represent counts/indices/capacities are integers;
 *     see `research.md` §6.
 */

// ----------------------------------------------------------------------------
// Shared types from @europa/core
// ----------------------------------------------------------------------------
//
// The canonical definitions of `Board`, `Cell`, `CityPlacement`, `Coord`,
// `Direction`, `MatchConfig`, `PlayerId`, `Rng`, `Terrain`, and
// `ENGINE_API_VERSION` live in `@europa/core`. We import them for local use
// (so this file's own interface definitions can reference them) and re-export
// them for backward compatibility — consumers of `@europa/engine` can still
// `import { Board, Coord, ... } from '@europa/engine'` without a direct
// dependency on `@europa/core`.

import type { Board, Cell, CityPlacement, Coord, Direction, MatchConfig, PlayerId, Rng, Terrain } from '@europa/core';
import { ENGINE_API_VERSION } from '@europa/core';
import type { PlayerRegistry } from '../playerRegistry';

export { ENGINE_API_VERSION };
export type { Board, Cell, CityPlacement, Coord, Direction, MatchConfig, PlayerId, PlayerRegistry, Rng, Terrain };

// ----------------------------------------------------------------------------
// Engine-specific branded primitives
// ----------------------------------------------------------------------------

/** Game status for a player. */
export type PlayerStatus = 'alive' | 'surrendered' | 'eliminated';

/** Per-cell reserve percentage, stored ×10 (FR-012: 0–90% in 10% steps). */
export type ReservesPct = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// ----------------------------------------------------------------------------
// Runtime state (flat-arrays form)
// ----------------------------------------------------------------------------

/**
 * Per-cell runtime state. Stored as flat `TypedArray`s for tick performance.
 * Consumers normally use the read helpers in engine-api.ts; this type is
 * exposed so feature 004 can serialize the world without copying.
 *
 * Owner slots are **private 1-based dense indexes** (issue #74):
 * `0` = neutral / no owner, `k` in `1..N` = the player at
 * `World.playerRegistry` dense index `k - 1`. Public APIs resolve them
 * back to canonical `PlayerId` strings; callers must never treat a byte
 * as an ID or derive one arithmetically.
 */
export interface WorldState {
  readonly troopCounts: Uint32Array;   // w*h; integer ≥ 0
  readonly troopOwners: Uint8Array;    // w*h; 0=neutral, 1..N=registry dense index + 1
  readonly pipeMasks: Uint8Array;      // w*h; N=0x01, E=0x02, S=0x04, W=0x08
  readonly reservesPct: Uint8Array;    // w*h; 0..9 (×10 at use-site)
  readonly cityOwners: Uint8Array;     // w*h; 0=no city, 1..N=registry dense index + 1
}

// ----------------------------------------------------------------------------
// Players
// ----------------------------------------------------------------------------

export interface Player {
  readonly id: PlayerId;
  /** Cosmetic; set by feature 006. Not used by engine logic. */
  readonly displayName: string;
  readonly status: PlayerStatus;
  /** Snapshot for SC reporting; recomputed by engine each tick. */
  readonly citiesOwned: number;
  readonly troopsHeld: number;
}

// ----------------------------------------------------------------------------
// World
// ----------------------------------------------------------------------------

/**
 * The full game state at a tick boundary. Immutable. All consumers
 * downstream of the engine receive this type read-only.
 */
export interface World {
  readonly config: MatchConfig;
  /** Monotonic tick number; ≥ 0. */
  readonly tick: number;
  readonly board: Board;
  /** Players in canonical registry order; look one up via `playerRegistry`. */
  readonly players: ReadonlyArray<Player>;
  readonly state: WorldState;
  /** Seed used to initialize the engine's PRNG (sfc32). uint32. */
  readonly rngSeed: number;
  /** Serialized sfc32 state (4× uint32). For advanced replays. */
  readonly rngState: Readonly<Uint32Array>;
  /**
   * The world's immutable ID ↔ dense-index registry. Every conversion
   * between public `PlayerId` strings and the private owner bytes in
   * `state` goes through this value.
   */
  readonly playerRegistry: PlayerRegistry;
}

// ----------------------------------------------------------------------------
// Read view (decoder helpers)
// ----------------------------------------------------------------------------

/**
 * Decoded, human-friendly per-cell view. Returned by `getCell`.
 * Slower than direct `WorldState` array access; preferred for UI consumers.
 */
export interface CellView {
  readonly coord: Coord;
  readonly cell: Cell;
  readonly troopCount: number;
  readonly troopOwner: PlayerId | null;
  readonly pipes: ReadonlySet<Direction>;
  readonly reservesPercent: ReservesPct;
  readonly cityOwner: PlayerId | null;
}

// ----------------------------------------------------------------------------
// Orders
// ----------------------------------------------------------------------------

/** Set a pipe (additive). Cell must be owned by player. */
export interface OrderSetPipe {
  readonly kind: 'setPipe';
  readonly player: PlayerId;
  readonly cell: Coord;
  readonly direction: Direction;
}

/** Remove a specific pipe. */
export interface OrderClearPipe {
  readonly kind: 'clearPipe';
  readonly player: PlayerId;
  readonly cell: Coord;
  readonly direction: Direction;
}

/** Set exactly one pipe, replacing all existing pipes on the cell. */
export interface OrderSetPipesExclusive {
  readonly kind: 'setPipesExclusive';
  readonly player: PlayerId;
  readonly cell: Coord;
  readonly direction: Direction;
}

/** Clear all pipes on a cell. */
export interface OrderClearAllPipes {
  readonly kind: 'clearAllPipes';
  readonly player: PlayerId;
  readonly cell: Coord;
}

/** Set reserves 0..90% in 10% steps. */
export interface OrderSetReserves {
  readonly kind: 'setReserves';
  readonly player: PlayerId;
  readonly cell: Coord;
  readonly percent: ReservesPct;
}

/** Paratroop attack: cost = 2×N at source, lands N at target. Range ≤ 2 (Chebyshev). */
export interface OrderParatroop {
  readonly kind: 'paratroop';
  readonly player: PlayerId;
  readonly source: Coord;
  readonly target: Coord;
}

/** Gun attack: costs troops, damages target occupants at tick time. */
export interface OrderGun {
  readonly kind: 'gun';
  readonly player: PlayerId;
  readonly source: Coord;
  readonly target: Coord;
}

/** Surrender: marks player eliminated, forces inert (FR-016). */
export interface OrderSurrender {
  readonly kind: 'surrender';
  readonly player: PlayerId;
}

/** Discriminated union over every legal command (FR-018). */
export type Order =
  | OrderSetPipe
  | OrderClearPipe
  | OrderSetPipesExclusive
  | OrderClearAllPipes
  | OrderSetReserves
  | OrderParatroop
  | OrderGun
  | OrderSurrender;

// ----------------------------------------------------------------------------
// Command results
// ----------------------------------------------------------------------------

export type ValidationError =
  | { kind: 'out_of_bounds';     coord: Coord }
  | { kind: 'water_target';      coord: Coord }
  | { kind: 'not_owner';         coord: Coord }
  | { kind: 'paratroop_range';   source: Coord; target: Coord; distance: number }
  | { kind: 'no_source_troops';  coord: Coord }
  | { kind: 'already_surrendered'; player: PlayerId }
  | { kind: 'invalid_percent';   percent: number }
  | { kind: 'unknown_player';    player: PlayerId }
  | { kind: 'unknown_order' }
  | { kind: 'invalid_direction'; direction: string }
  | { kind: 'match_terminal' };

export type CommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ValidationError };

// ----------------------------------------------------------------------------
// Tick events
// ----------------------------------------------------------------------------

export interface CombatEvent {
  readonly tick: number;
  readonly cell: Coord;
  readonly attacker: PlayerId;
  readonly defender: PlayerId;
  readonly attackerLoss: number;
  readonly defenderLoss: number;
  readonly winner: PlayerId | 'tie';
  /** Pre-attrition total force of the attacker: committed flow (raw pipe delivery) + any pre-existing troops they own in the cell. */
  readonly attackerTotal: number;
  /** Pre-attrition total force of the defender: garrison (pre-flow troops of the cell's owner) + defender's committed flow. */
  readonly defenderTotal: number;
}

export interface CaptureEvent {
  readonly tick: number;
  readonly cell: Coord;
  readonly fromOwner: PlayerId | null;
  readonly toOwner: PlayerId;
  readonly isCity: boolean;
}

export interface EliminationEvent {
  readonly tick: number;
  readonly player: PlayerId;
  readonly reason: 'no_troops_no_cities' | 'surrendered' | 'forfeit';
}

export interface AppliedOrderRecord {
  readonly tick: number;
  readonly order: Order;
  readonly result: CommandResult;
}

export interface TickEvents {
  readonly combat: ReadonlyArray<CombatEvent>;
  readonly captures: ReadonlyArray<CaptureEvent>;
  readonly eliminations: ReadonlyArray<EliminationEvent>;
  readonly appliedOrders: ReadonlyArray<AppliedOrderRecord>;
  readonly errors: ReadonlyArray<{ order: Order; reason: ValidationError }>;
}

// ----------------------------------------------------------------------------
// Terminal result
// ----------------------------------------------------------------------------

export type MatchResult =
  | {
      readonly kind: 'win';
      readonly winner: PlayerId;
      readonly tick: number;
      readonly reason: 'last_standing' | 'all_surrendered';
    }
  | { readonly kind: 'draw'; readonly tick: number; readonly reason: 'mutual_elimination' };

/**
 * The return value of `tick()`. Carries the next world, the events
 * observed during resolution, and (optionally) the terminal result if
 * the match ended on this tick.
 */
export interface TickResult {
  readonly world: World;
  readonly events: TickEvents;
  readonly terminal?: MatchResult;
}
