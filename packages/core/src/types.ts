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

import type { PlayerId } from './player-id';

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

/**
 * Current engine API version. Increment on any breaking change to the
 * shared type surface. Both engine and terrain pin-check this at startup;
 * bumping forces a coordinated update across all consumers.
 *
 * `0.1.0` → `0.2.0` (issue #74, feature 001 v1.13): `PlayerId` changed
 * from the numeric union `1 | 2 | 3 | 4` to the branded 12-character
 * identity string, a breaking change to every public engine contract
 * that carries player identity. Pre-1.0 breaking changes take a minor
 * bump (the same convention networking used for `NETWORK_API_VERSION`).
 */
export const ENGINE_API_VERSION = '0.2.0' as const;

// ----------------------------------------------------------------------------
// Branded primitives
// ----------------------------------------------------------------------------

/**
 * Player identifier — branded 12-character server-issued identity
 * (feature 001 v1.13, issue #74). The canonical type, constants, and
 * validators live in `./player-id`; re-exported here so existing
 * `import type { PlayerId } from './types'` call sites keep working.
 *
 * A `PlayerId` is non-secret correlation metadata, never a credential.
 */
export type { PlayerId } from './player-id';

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
 * Where a city is placed.
 *
 * `owner` is a **1-based numeric placement slot** (FR-005) — terrain is
 * intentionally identity-agnostic (issue #74, data-model §4). It has no
 * concept of the canonical string `PlayerId`; it assigns dense slots for
 * symmetry and placement only.
 *
 * The engine's `createWorld` maps each slot to the explicit
 * `MatchConfig.playerIds[slot - 1]` at the identity boundary. Changing
 * the ID list never changes terrain output.
 */
export interface CityPlacement {
    readonly cell: Coord;
    /** 1-based dense placement slot (not a `PlayerId`). */
    readonly owner: number;
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
    /**
     * Explicit canonical player identities for this match, in terrain
     * placement-slot order (index 0 = slot 1). Length MUST be 2–4
     * (FR-019); the engine derives player count from `playerIds.length`.
     *
     * These are server-issued, branded 12-character identities
     * (FR-020) — never seat indexes, array positions, or handles. The
     * engine never synthesizes them; the caller supplies them at the
     * identity boundary.
     */
    readonly playerIds: readonly PlayerId[];
    /** Tick interval (ms). Default 250 → 4 Hz. Engine itself does not read this. */
    readonly tickIntervalMs: number;
    /** Seed for the engine's PRNG (sfc32). uint32. */
    readonly seed: number;
    /** Sensor radius in cells (Chebyshev). Consumed by fog (feature 002). */
    readonly visibilityRadius: number;
}
