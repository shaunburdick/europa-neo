/**
 * Fog ↔ Networking contract — Feature 002 ↔ Feature 004.
 *
 * Fog produces `PlayerView` payloads; networking (feature 004)
 * serializes them, broadcasts them per-client, and enforces
 * transport-level concerns (session affinity, spectator read-only,
 * rate limiting, reconnect reconciliation).
 *
 * Fog does NOT know about the network. Fog does NOT know about
 * sessions, lobbies, or matchmaking. Fog's only outputs are:
 *
 *   1. `PlayerView` — the per-player fog-filtered payload (or
 *      full-board for spectators).
 *
 * Networking is the only consumer that combines fog's output with
 * session metadata (which session is associated with which player,
 * which session is a spectator, etc.).
 *
 * ----------------------------------------------------------------------------
 * Data flow at the network boundary
 * ----------------------------------------------------------------------------
 *
 *      packages/server (per-tick loop)
 *      ┌─────────────────────────────────────────────┐
 *      │  1. tick(world)                              │
 *      │  2. for each alive player + spectator:       │
 *      │       view = computePlayerView(world, p,     │
 *      │                                {spectator}) │
 *      │  3. for each session:                        │
 *      │       serialize(view)                        │
 *      │       send(view)                             │
 *      │  4. for spectator sessions:                  │
 *      │       reject Order (read-only)               │
 *      └─────────────────────────────────────────────┘
 *
 * ----------------------------------------------------------------------------
 * What fog guarantees to networking
 * ----------------------------------------------------------------------------
 *
 * 1. `PlayerView` is fully self-contained: a recipient (a client) can
 *    render the entire visible board state from this payload alone,
 *    plus the `config` snapshot.
 *
 * 2. `PlayerView.events` is already horizon-filtered (cell-level events
 *    outside the player's horizon are dropped). Networking can serialize
 *    `events` directly without re-filtering.
 *
 * 3. `PlayerView.visibleCells` is row-major with no duplicates.
 *
 * 4. `PlayerView` is fully readonly; networking can hold references
 *    without worrying about mutation.
 *
 * 5. `PlayerView` is byte-identical for the same `(world, player,
 *    options)` triple (SC-001 determinism).
 *
 * ----------------------------------------------------------------------------
 * What networking must do (NOT fog's concern)
 * ----------------------------------------------------------------------------
 *
 * 1. **Spectator read-only enforcement**: reject any `Order` received
 *    from a session that was registered as spectator. Fog produces
 *    the full-board view; networking refuses the orders.
 *
 * 2. **Session → player mapping**: which session is observing which
 *    player. For spectators, which player they're "watching" (the
 *    fog function is called with that player as the playerId argument;
 *    the resulting view is identical for any spectator's player
 *    choice, since spectator mode returns the full board regardless of
 *    which playerId is passed).
 *
 * 3. **Serialization format**: JSON, MessagePack, custom binary, etc.
 *    Networking decides.
 *
 * 4. **Tick deltas**: feature 001's `serializeWorld` returns a full
 *    snapshot. Networking may choose to send a delta (visibleCells that
 *    changed since last tick) instead of the full `PlayerView`. Fog
 *    doesn't help with this — it's a transport concern.
 *
 * 5. **Reconnect reconciliation**: if a client disconnects, networking
 *    re-sends the latest `PlayerView` (or a snapshot from a recent
 *    tick). Fog does not retain historical `PlayerView`s.
 */

import type {
  CellView,
  Coord,
  MatchConfig,
  PlayerId,
  TickEvents,
  World,
} from '@europa/engine';

import type { PlayerView, VisibleSet } from './fog-types';

/**
 * Re-export the engine ↔ fog boundary types for networking convenience.
 * Networking's `import { PlayerView } from '@europa/fog/contracts/fog-to-networking'`
 * gives it everything it needs without reaching into the engine.
 */
export type { PlayerView, VisibleSet };

/**
 * Re-export the engine types networking might need for serialization.
 */
export type {
  CellView,
  Coord,
  MatchConfig,
  PlayerId,
  TickEvents,
  World,
};

/**
 * The shape of the per-tick broadcast list. Networking iterates this
 * and sends one entry per session.
 *
 * (Note: fog does not produce this list directly. The server's tick
 * loop iterates alive players + spectator sessions and calls
 * `computePlayerView` once per entry. This type is documented here for
 * networking's planning purposes.)
 */
export interface PerTickBroadcast {
  /**
   * One entry per alive player (player view) + one entry per spectator
   * session (full-board view). Order is irrelevant for correctness;
   * networking may sort by session ID for stable per-session ordering.
   */
  readonly entries: ReadonlyArray<{
    /**
     * The playerId argument to `computePlayerView`. For regular
     * players, this is their own playerId. For spectators, this can
     * be any playerId (the result is the same full-board view).
     */
    readonly targetPlayer: PlayerId;
    /**
     * Whether this entry is for a spectator session. Networking uses
     * this to (a) send the view to the spectator, and (b) reject
     * subsequent `Order`s from that session.
     */
    readonly spectator: boolean;
    /** The fog-filtered or full-board view to send. */
    readonly view: PlayerView;
  }>;
}

/**
 * Convenience type: the fields a network serializer needs from a
 * `PlayerView`. Networking may serialize the full `PlayerView` or
 * pick a subset of fields (e.g., only `visibleCells` if events are
 * sent on a separate channel).
 *
 * This type is documentation; fog does not produce a value of this
 * shape — networking projects from `PlayerView`.
 */
export interface SerializedPlayerViewFields {
  readonly player: PlayerId;
  readonly tick: number;
  readonly visibleCells: ReadonlyArray<CellView>;
  readonly events: Readonly<TickEvents>;
  readonly config: Readonly<MatchConfig>;
}
