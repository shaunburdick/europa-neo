/**
 * Replay Fixture Types — Feature 022 (Developer Debugging Tools)
 *
 * Type definitions for match capture/replay fixtures. A fixture is a
 * self-contained JSON document that captures everything needed to
 * deterministically replay a match through the engine: seed, settings,
 * terrain generation settings, the full order sequence, and the
 * expected final state hash.
 *
 * Fixture format version starts at 1. The `version` field enables
 * forward-compatible schema evolution without breaking existing
 * fixtures (NFR-005).
 *
 * **Identity (issue #74)**: identities are explicit canonical
 * `PlayerId` strings. The fixture never carries numeric identity
 * values, and the replay path never synthesizes a temporary ID — it
 * consumes `settings.playerIds` exactly as supplied.
 */

import type { MatchConfig, MatchResult, Order, PlayerId, World } from '../types';

/**
 * The only legal player counts (engine FR-019). Narrowed so callers
 * (e.g. terrain's `generateBoard`) never need a type assertion.
 */
export type PlayerCount = 2 | 3 | 4;

/**
 * A single recorded order in a fixture. Each order captures the tick
 * at which it was applied, the player who issued it, and the full
 * engine Order object.
 */
export interface OrderRecord {
    /** Tick at which this order was applied. */
    readonly tick: number;
    /** Player who issued the order. */
    readonly playerId: PlayerId;
    /** The full engine Order object. */
    readonly order: Order;
}

/**
 * A match fixture: self-contained JSON document for deterministic
 * replay. All fields are required for a valid fixture (validated by
 * {@link validateFixture}).
 */
export interface Fixture {
    /** Fixture format version (currently 1). */
    readonly version: number;
    /** PRNG seed (uint32). */
    readonly seed: number;
    /**
     * Engine match configuration. `settings.playerIds` MUST be an
     * explicit list of 2–4 canonical, unique `PlayerId` values in
     * terrain placement-slot order.
     */
    readonly settings: MatchConfig;
    /** Terrain generation settings for board reconstruction. */
    readonly terrainSettings: GenerationSettings;
    /**
     * Player count. Derived from `settings.playerIds.length` and
     * validated for equality by {@link validateFixture}; retained as an
     * explicit, quick-inspection field.
     */
    readonly playerCount: PlayerCount;
    /** Applied orders in tick-ascending, playerId-ascending, kind-alphabetical order. */
    readonly orders: ReadonlyArray<OrderRecord>;
    /** Tick at which the match ended. */
    readonly terminalTick: number;
    /** Terminal match result, or null if the match didn't terminate. */
    readonly terminalResult: MatchResult | null;
    /** 8-char hex FNV-1a hash of the final world state. */
    readonly finalStateHash: string;
    /** `ENGINE_API_VERSION` at capture time. */
    readonly engineVersion: string;
}

/**
 * Minimal terrain generation settings needed for board reconstruction.
 * This is a subset of `@europa/terrain`'s `GenerationSettings` — only
 * the fields that affect board generation for a given seed.
 *
 * Defined locally to avoid a runtime dependency on `@europa/terrain`
 * from the engine package (the engine's dist does not import terrain).
 */
export interface GenerationSettings {
    readonly waterRatio: number;
    readonly roughness: number;
    readonly octaves: number;
    readonly citiesPerPlayer: number;
    readonly symmetryStrategy: 'point';
    readonly minCityWaterDistance: number;
    readonly minCityCityDistance: number;
    readonly maxRegenAttempts: number;
    readonly terrainSmoothing: number;
}

/**
 * The result of replaying a fixture through the engine.
 */
export interface ReplayResult {
    /** The final world state after replay. */
    readonly finalWorld: World;
    /** 8-char hex FNV-1a hash of the final world state. */
    readonly hash: string;
    /** Number of ticks replayed. */
    readonly tickCount: number;
}
