/**
 * Core Game Types — Shared Foundation
 *
 * The foundational types shared between `@europa/engine` and
 * `@europa/terrain`. Extracted here to break the circular dependency
 * between those two packages (issue #93).
 *
 * This package has **zero workspace dependencies** — it builds first
 * in any order, resolving the pnpm topological-sort ambiguity that
 * caused terrain's DTS build to race against engine's DTS emission.
 *
 * Both `@europa/engine` and `@europa/terrain` re-export these types
 * from their own barrels, so downstream consumers continue to import
 * from the package they already know. The types are structurally
 * identical (they originate here), so TypeScript treats them as the
 * same type regardless of import path.
 *
 * Rules:
 *   - Only foundational types that cross package boundaries belong here.
 *   - Engine-specific types (World, Order, TickResult, etc.) stay in
 *     `@europa/engine`.
 *   - Terrain-specific types (GenerationSettings, etc.) stay in
 *     `@europa/terrain`.
 */

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

/**
 * Current engine API version. Increment on any breaking change to the
 * shared type surface. Both engine and terrain pin-check this at startup;
 * bumping forces a coordinated update across all consumers.
 */
export const ENGINE_API_VERSION = '0.1.0' as const;

// ----------------------------------------------------------------------------
// Branded primitives
// ----------------------------------------------------------------------------

/** Player identifier; 1..4 (spec FR-019: 2–4 players). */
export type PlayerId = 1 | 2 | 3 | 4;

/** Cardinal direction a pipe can face. */
export type Direction = 'N' | 'E' | 'S' | 'W';

/** Terrain classification of a cell. */
export type Terrain = 'land' | 'water';

// ----------------------------------------------------------------------------
// PRNG
// ----------------------------------------------------------------------------

/**
 * Callable pseudorandom generator that returns a uint32 each call.
 *
 * The engine instantiates one `Rng` per match from the match's `seed`
 * (sfc32, see engine `research.md` §5). The same `Rng` instance is
 * passed to terrain so map generation consumes the same PRNG stream
 * that drives tick resolution — guaranteeing full-match determinism
 * for replays.
 *
 * Consumers MUST NOT advance the generator from outside; it is
 * engine-owned. The `state` field is exposed for test/assertion
 * purposes only (SC-001 10k-tick determinism).
 */
export type Rng = {
    /** Advance internal state and return the next uint32 in [0, 2^32). */
    (): number;
    /** Current state (4 × uint32, sfc32's internal order). Read-only by contract. */
    readonly state: Uint32Array;
};

// ----------------------------------------------------------------------------
// Coordinates and cells
// ----------------------------------------------------------------------------

/**
 * Cell coordinate. `x` and `y` are non-negative integers in `[0, boardSize)`.
 */
export interface Coord {
    readonly x: number;
    readonly y: number;
}

export interface Cell {
    readonly x: number;
    readonly y: number;
    readonly elevation: number; // integer, 0..255 (FR-001)
    readonly terrain: Terrain; // FR-001, FR-002
}

/**
 * Where a city is placed. `owner` is the starting player (FR-005).
 */
export interface CityPlacement {
    readonly cell: Coord;
    readonly owner: PlayerId;
}

/**
 * Immutable terrain definition for a match. Produced by terrain,
 * consumed by engine's `createWorld`.
 */
export interface Board {
    readonly width: number; // square; FR-001
    readonly height: number; // FR-001
    readonly cells: ReadonlyArray<Cell>; // row-major: cells[y*w + x]
    readonly cities: ReadonlyArray<CityPlacement>;
}

// ----------------------------------------------------------------------------
// MatchConfig (input to createWorld)
// ----------------------------------------------------------------------------

export interface MatchConfig {
    /** Square board dimension. Default 32 (spec Assumptions). */
    readonly boardSize: number;
    /** Player count. v1 ships 2; engine supports 2–4 (FR-019, AGENTS.md). */
    readonly playerCount: 2 | 3 | 4;
    /** Tick interval (ms). Default 250 → 4 Hz. Engine itself does not read this. */
    readonly tickIntervalMs: number;
    /** Seed for the engine's PRNG (sfc32). uint32. */
    readonly seed: number;
    /** Sensor radius in cells (Chebyshev). Consumed by fog (feature 002). */
    readonly visibilityRadius: number;
}
