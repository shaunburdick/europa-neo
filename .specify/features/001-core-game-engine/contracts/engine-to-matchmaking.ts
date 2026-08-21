/**
 * Engine ↔ Matchmaking contract (feature 001 ↔ feature 006).
 *
 * Matchmaking owns the match lifecycle: creation, player seating,
 * forefeit, terminal detection. The engine is the simulation primitive
 * it drives.
 *
 * Boundary rule:
 *   - Matchmaking constructs an initial `World` from a generated
 *     `Board` and a `MatchConfig`.
 *   - Matchmaking drives ticks at the configured cadence.
 *   - Matchmaking queries `isTerminal(world)` after each tick and tears
 *     down the match on a terminal result.
 *   - Matchmaking consumes `TickEvents.eliminations` for forfeit /
 *     surrender-driven teardown (the engine already turns surrender
 *     into `PlayerStatus='eliminated'` per FR-016).
 */

import type {
  CommandResult,
  MatchConfig,
  MatchResult,
  Order,
  PlayerId,
  TickEvents,
  ValidationError,
  World,
} from './engine-types';

/**
 * What matchmaking hands to the engine at match creation.
 */
export interface MatchInitRequest {
  readonly config: MatchConfig;
  readonly terrain: import('./engine-types').Board;
  /** Display names for the players in seat order (PlayerId - 1 → name). */
  readonly displayNames: ReadonlyArray<string>;
}

/**
 * What matchmaking holds onto for the match's lifetime.
 */
export interface EngineSession {
  /** Current world snapshot (immutable per tick). */
  world(): Readonly<World>;
  /** Submit a validated order; returns the engine's command result. */
  submit(order: Order): CommandResult;
  /** Advance one tick; returns the engine's tick result. */
  advance(): { readonly world: World; readonly events: TickEvents; readonly terminal?: MatchResult };
  /** Cheap terminal check without advancing. */
  status(): MatchResult | undefined;
  /** Drop the session; release any retained state. */
  close(): void;
}

/**
 * Construct an engine session from a fully-prepared match init request.
 * Feature 006 calls this once per match; the resulting session lives
 * for the match's duration.
 */
export declare function createMatchSession(req: MatchInitRequest): EngineSession;

/**
 * Engine-side terminal reason, exposed for matchmaking to log.
 * (Matchmaking also has its own reasons — `forfeit` — that it
 * translates to engine `EliminationEvent`.)
 */
export type MatchEndReason = MatchResult['reason'] | 'forfeit' | 'cancelled';

/**
 * Per-match record matchmaking keeps for results delivery (feature 006
 * FR-008 / US4 AC-1).
 */
export interface MatchResultsRecord {
  readonly matchId: string;
  readonly tick: number;
  readonly effectiveSeed: number;
  readonly result: MatchResult | { kind: 'cancelled'; reason: string };
  readonly finalBoardHash: string;
  /** Per-player final state, for display. */
  readonly finalPlayers: ReadonlyArray<{
    readonly id: PlayerId;
    readonly displayName: string;
    readonly status: 'alive' | 'surrendered' | 'eliminated';
    readonly finalTroops: number;
    readonly finalCities: number;
  }>;
}

// ----------------------------------------------------------------------------
// Convenience re-exports
// ----------------------------------------------------------------------------

export type {
  CommandResult,
  MatchConfig,
  MatchResult,
  Order,
  PlayerId,
  TickEvents,
  ValidationError,
  World,
};
