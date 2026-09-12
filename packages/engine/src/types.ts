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
import type { EngineConstants as EngineConstantsType } from './contracts/engine-api';
import type { Board as BoardType } from './contracts/engine-types';

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
    PlayerRegistry,
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

/**
 * Pre-allocated scratch buffers for the tick pipeline (FR-03, SC-006).
 *
 * Allocated once per match at board construction time; zeroed in-place
 * before each tick phase. Eliminates per-tick heap allocations in the
 * flow, combat, and decay resolvers.
 *
 * **Lifecycle**: created by {@link createTickScratchBuffers}, attached
 * to the `World` via a WeakMap keyed by the world object. Retrieved by
 * `tick()` on each call and passed through to the resolution pipeline.
 * The buffers are NOT part of the serialized world — they are
 * ephemeral scratch space that does not affect determinism.
 *
 * @see specs/004-multiplayer-networking/data-model-hardening-perf.md §3
 */
export interface TickScratchBuffers {
    /**
     * Per-cell per-owner inflow tally (n × PLAYERS).
     * Written by flow, read by combat. Zeroed before flow phase.
     */
    inflowTally: Uint32Array;

    /**
     * Per-cell per-owner committed-flow tally (n × PLAYERS).
     * Written by flow, read by combat. Zeroed before flow phase.
     */
    committedFlowTally: Uint32Array;

    /**
     * Pre-flow troop owners snapshot (n).
     * Written before flow, read by combat. Populated from state before flow.
     */
    preFlowOwners: Uint8Array;

    /**
     * Pre-flow troop counts snapshot (n).
     * Written before flow, read by combat. Populated from state before flow.
     */
    preFlowCounts: Uint32Array;

    /**
     * Per-cell reserves floor (n).
     * Written before decay, read by decay. Computed from post-capture state.
     */
    reservedFloors: Uint32Array;

    /**
     * Per-cell same-owner incoming pipe flag (n).
     * Written before decay, read by decay. Computed from pipeMasks + owners.
     */
    hasIncomingSameOwnerPipe: Uint8Array;

    /**
     * Flow output counts buffer (n).
     * Written by flow as the new troopCounts. Read by combat.
     * Zeroed before flow phase.
     */
    flowNewCounts: Uint32Array;

    /**
     * Flow output owners buffer (n).
     * Written by flow as the new troopOwners. Read by combat.
     * Zeroed before flow phase.
     */
    flowNewOwners: Uint8Array;

    /**
     * Combat output counts buffer (n).
     * Written by combat as the post-attrition troopCounts.
     * Zeroed before combat phase.
     */
    combatNewCounts: Uint32Array;

    /**
     * Combat output owners buffer (n).
     * Written by combat as the post-attrition troopOwners.
     * Zeroed before combat phase.
     */
    combatNewOwners: Uint8Array;

    /**
     * Reusable TransferParams pool (4 entries — max pipes per cell).
     * Each entry is reset in-place before use by the flow resolver.
     */
    transferParams: TransferParams[];

    /**
     * Per-cell committed-players pool (n × PLAYERS × 2, interleaved
     * owner+count pairs). Written by combat during total-force
     * resolution. Zeroed before combat phase.
     */
    committedPlayersPool: Uint32Array;
}

/**
 * Parameters for a single pipe transfer within the flow resolver.
 * Reused from the pool in {@link TickScratchBuffers.transferParams}
 * to avoid per-transfer allocations.
 */
export interface TransferParams {
    board: BoardType;
    x: number;
    y: number;
    dx: number;
    dy: number;
    srcOwner: number;
    constants: EngineConstantsType;
    cap: number;
    newCounts: Uint32Array;
    newOwners: Uint8Array;
    reservesPct: Readonly<Uint8Array>;
    tally: Uint32Array | null;
    committedTally: Uint32Array | null;
    numPipes: number;
    perPipe: number;
    pipeIndex: number;
    reserveFloor: number;
}
