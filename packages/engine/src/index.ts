/**
 * Public surface of the `@europa/engine` package.
 *
 * This barrel re-exports the engine's type contract, tunable constants,
 * deterministic PRNG, and event builders — every cross-cutting
 * concern from Phase 2 (Foundational). The resolution rules and
 * lifecycle functions (`createWorld`, `applyCommand`, `tick`, etc.)
 * are added in Phase 3 (US1) as their implementation tasks land.
 *
 * **What downstream packages can import right now (Phase 2):**
 *   - `types.ts` — every public type from `contracts/engine-types.ts`
 *   - `constants.ts` — `ENGINE_CONSTANTS`, `DEFAULT_TICK_INTERVAL_MS`
 *   - `rng.ts` — `createRng`, `hashSeed`, `createRngFromString`
 *   - `events.ts` — `emptyTickEvents`, `pushCombatEvent`,
 *     `pushCaptureEvent`, `pushEliminationEvent`, `pushAppliedOrder`,
 *     `pushError`
 *
 * **Coming in Phase 3 (US1 — T021–T027):**
 *   - `createWorld`, `applyCommand`, `tick`, `isTerminal`
 *   - `getCell`, `forEachCell`, `cellsInRange`, `neighborsOf`
 *   - `getPlayer`, `alivePlayers`, `validateCommand`
 *   - `serializeWorld`, `deserializeWorld`, `hashWorld`
 *
 * When Phase 3 lands, this file gains those re-exports. The barrel is
 * the only file a downstream package ever imports — the implementation
 * details (which `.ts` file each function lives in) are private to
 * the engine.
 *
 * The names in each `export { ... }` block are sorted alphabetically
 * (Biome `organizeImports` rule). The conceptual grouping lives in
 * the JSDoc above and in the source-of-truth contracts at
 * `.specify/features/001-core-game-engine/contracts/`.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
//
// Re-exports of every public type in `contracts/engine-types.ts` plus
// the `EngineConstants` interface from `contracts/engine-api.ts`. The
// types are alphabetical; see the contracts for grouped documentation
// and FR references.

// Branded primitives (PlayerId, Direction, Terrain, PlayerStatus, ReservesPct)
export type {
  AppliedOrderRecord,
  Board,
  CaptureEvent,
  Cell,
  // Read view
  CellView,
  // Board
  CityPlacement,
  // Events
  CombatEvent,
  // Results
  CommandResult,
  // Coordinates + cells
  Coord,
  // Branded primitives
  Direction,
  // Events
  EliminationEvent,
  // Engine API constants type
  EngineConstants,
  // Match config
  MatchConfig,
  // Terminal
  MatchResult,
  // Orders
  Order,
  OrderClearAllPipes,
  OrderClearPipe,
  OrderGun,
  OrderParatroop,
  OrderSetPipe,
  OrderSetPipesExclusive,
  OrderSetReserves,
  OrderSurrender,
  // Players
  Player,
  // Branded primitives
  PlayerId,
  PlayerStatus,
  // Branded primitives
  ReservesPct,
  // PRNG
  Rng,
  // Branded primitives
  Terrain,
  // Events
  TickEvents,
  // Terminal
  TickResult,
  // Results
  ValidationError,
  // World
  World,
  // Runtime state
  WorldState,
} from './types';

// Single value re-export: the engine API version constant. Bumped on
// any breaking change to the public surface (constitution Principle IV).
export { ENGINE_API_VERSION } from './types';

// ----------------------------------------------------------------------------
// Tunable constants (single location, SC-005)
// ----------------------------------------------------------------------------

export { DEFAULT_TICK_INTERVAL_MS, ENGINE_CONSTANTS } from './constants';

// ----------------------------------------------------------------------------
// Deterministic PRNG (sfc32 + xmur3 helpers)
// ----------------------------------------------------------------------------

export { createRng, createRngFromString, hashSeed } from './rng';

// ----------------------------------------------------------------------------
// TickEvents builders (pure, immutable)
// ----------------------------------------------------------------------------

export {
  emptyTickEvents,
  pushAppliedOrder,
  pushCaptureEvent,
  pushCombatEvent,
  pushEliminationEvent,
  pushError,
} from './events';
