/**
 * Public surface of the `@europa/core` package.
 *
 * Shared foundation for `@europa/engine` and `@europa/terrain`:
 * core game types, deterministic PRNG, pipe-flow formula, engine
 * constants, and the API version constant. This package has zero
 * workspace dependencies so it always builds first, resolving the
 * engine ↔ terrain circular dependency (issue #93, #96).
 *
 * Downstream consumers should continue importing from `@europa/engine`
 * or `@europa/terrain` — both re-export these types from their own
 * barrels. This package exists solely to break the build-order cycle
 * and provide a single source of truth for shared constants.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type {
    Board,
    Cell,
    CityPlacement,
    Coord,
    Direction,
    MatchConfig,
    Rng,
    Terrain,
} from './types';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export { ENGINE_API_VERSION } from './types';

// ----------------------------------------------------------------------------
// Canonical player identity (issue #74)
// ----------------------------------------------------------------------------

export type { GeneratePlayerIdOptions, GuestPlayerId, PlayerId, RandomBytesSource } from './player-id';
export {
    DEFAULT_PLAYER_ID_MAX_ATTEMPTS,
    generatePlayerId,
    InvalidPlayerIdError,
    isGuestPlayerId,
    isPlayerId,
    PLAYER_ID_ALPHABET,
    PLAYER_ID_BITS,
    PLAYER_ID_LENGTH,
    PLAYER_ID_PATTERN,
    PlayerIdCollisionError,
    PlayerIdEntropyError,
    PlayerIdError,
    parseGuestPlayerId,
    parsePlayerId,
} from './player-id';

// ----------------------------------------------------------------------------
// Deterministic PRNG (sfc32 + xmur3 helpers)
// ----------------------------------------------------------------------------

export { createRng, createRngFromString, hashSeed } from './rng';

// ----------------------------------------------------------------------------
// Pipe-flow formula and constants (shared by engine + terrain)
// ----------------------------------------------------------------------------

export type { EngineConstants, FlowConstants } from './flow-rate';
export { DEFAULT_FLOW_CONSTANTS, ENGINE_CONSTANTS, flowRateForDelta } from './flow-rate';
