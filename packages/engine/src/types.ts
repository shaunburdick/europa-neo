/**
 * Engine Public Type Surface — Feature 001
 *
 * Thin re-export module. The contract in
 * `specs/001-core-game-engine/contracts/engine-types.ts` is the
 * source of truth for every public type; this module re-exports them so
 * downstream packages can import from `@europa/engine` and so the engine
 * package's own source can import from a local path (avoids a runtime
 * dependency on a not-yet-existing `@europa/shared` package).
 *
 * **No new types are invented here** — see the contract for the canonical
 * definitions, JSDoc, and rationale. Per constitution Principle IV
 * (specs as documentation) and `research.md` §10, the contract is
 * authoritative; if a type here diverges from the contract, the contract
 * wins.
 *
 * The value export (`ENGINE_API_VERSION`) is the only runtime artifact
 * exposed from the contract; the rest are types erased at compile time.
 *
 * **Local copy note**: `src/contracts/` contains verbatim copies of the
 * spec contracts. They live inside the engine package so the TypeScript
 * compiler can resolve imports without violating the engine's
 * `rootDir: "./src"` + `include: ["src/**"]` boundary (see AGENTS.md
 * and the Phase 2 PM handoff). Drift between the local copy and the
 * spec is a bug.
 */

// Re-export the `EngineConstants` interface from the API contract so
// downstream packages can do `import type { EngineConstants } from
// '@europa/engine'` without reaching into the contracts directory.
// (The actual constant value `ENGINE_CONSTANTS` is re-exported by
// `constants.ts`; only the type lives here.)
export type { EngineConstants } from './contracts/engine-api';
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
    CommandResult,
    // Coordinates + cells
    Coord,
    Direction,
    EliminationEvent,
    // Match config
    MatchConfig,
    // Terminal
    MatchResult,
    Order,
    OrderClearAllPipes,
    OrderClearPipe,
    OrderGun,
    OrderParatroop,
    // Orders
    OrderSetPipe,
    OrderSetPipesExclusive,
    OrderSetReserves,
    OrderSurrender,
    // Players
    Player,
    // Branded primitives
    PlayerId,
    PlayerStatus,
    ReservesPct,
    // PRNG
    Rng,
    Terrain,
    TickEvents,
    TickResult,
    // Results
    ValidationError,
    // World
    World,
    // Runtime state
    WorldState,
} from './contracts/engine-types';
// The single value export from the contract: the engine API version.
// Bumped on any breaking change to the public surface (constitution
// Principle IV). Re-exported under the same name so callers can do
// `import { ENGINE_API_VERSION } from '@europa/engine'`.
export { ENGINE_API_VERSION } from './contracts/engine-types';
