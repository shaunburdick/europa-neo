/**
 * Player View Orchestrator — Feature 002, US1 (T028) + US3 (T036)
 *
 * `computePlayerView` is the function feature 004 (networking) calls
 * once per player per tick. It composes the full fog-filtered payload:
 *
 *   Non-spectator path (US1, default):
 *     1. `computeVisibleSet(world, player)` — the Chebyshev horizon.
 *     2. Decode each visible coord via the engine's `getCell`.
 *     3. Filter the tick's events down to the horizon (FR-003).
 *     4. Return the `PlayerView`.
 *
 *   Spectator path (US3, `options.spectator === true`):
 *     1. Decode EVERY cell on the board via the engine's
 *        `forEachCell` (row-major).
 *     2. Return the tick's events unfiltered (FR-006).
 *
 * Structural redaction (spec FR-002 / FR-005): cells outside the
 * horizon are ABSENT from `visibleCells` — there is no "redacted"
 * placeholder type. In-horizon cells are fully exposed (terrain,
 * elevation, troop count/owner, pipes, reserves, city owner).
 *
 * Events source: the engine's `World` does not carry events — they
 * are produced alongside each world by `tick()` (`TickResult.events`,
 * mirrored as `EngineTickOutput`). Callers pass the current tick's
 * events via `options.events`; when omitted the view carries empty
 * events (pure state snapshot). This keeps `computePlayerView` pure
 * and side-effect free.
 *
 * Determinism: identical `(world, player, options)` produces byte-
 * identical output. Row-major iteration; no wall-clock; no PRNG.
 */

import type { CellView, MatchConfig, PlayerId, TickEvents, World } from '@europa/engine';
import { forEachCell, getCell } from '@europa/engine';

import { filterTickEvents } from './eventsFilter';
import type { ComputePlayerViewOptions, PlayerView } from './types';
import { computeVisibleSet } from './visibleSet';

/**
 * Extract a plain, owned snapshot of the match config for the view
 * payload. The engine's config is already frozen; copying it here
 * decouples the payload's lifetime from the world's (the payload may
 * outlive the tick that produced it once networking serializes it).
 *
 * @param config The engine's frozen match config.
 * @returns A structurally identical `MatchConfig` snapshot.
 */
function snapshotConfig(config: Readonly<MatchConfig>): MatchConfig {
  return {
    boardSize: config.boardSize,
    playerCount: config.playerCount,
    tickIntervalMs: config.tickIntervalMs,
    seed: config.seed,
    visibilityRadius: config.visibilityRadius,
  };
}

/**
 * Compute the full fog-filtered `PlayerView` payload for one player.
 * Pure.
 *
 * Redaction rule (spec FR-002 / FR-003 / FR-005):
 *   - Cells outside the player's horizon are **absent** from
 *     `visibleCells` (not present as "redacted" placeholders).
 *   - Cell-level `TickEvents` (combat, capture) whose `cell` is
 *     outside the horizon are dropped.
 *   - Player-level `TickEvents` (`EliminationEvent`,
 *     `AppliedOrderRecord`, `errors`) are kept always.
 *
 * Spectator mode (`options.spectator === true`, spec US3 / FR-006):
 *   - `visibleCells` contains every cell on the board (full board
 *     state), regardless of which `player` is passed or how many
 *     troops that player owns.
 *   - `events` is unfiltered.
 *   - The server is responsible for marking the session read-only
 *     (feature 004 concern, not fog's).
 *
 * JSDoc references: FR-002, FR-003, FR-005 (redaction), FR-006
 * (spectator), US1 AC-3 (enemy in/out of horizon), US3 AC-1
 * (surrendered player sees everything).
 *
 * @param world    The current `World` snapshot (from `tick()`).
 * @param player   The player whose view is being computed (or the
 *                 player the spectator session is observing).
 * @param options  Optional flags: `{ spectator: true }` for
 *                 full-board views; `events` supplies the current
 *                 tick's `TickEvents` (defaults to empty).
 * @returns        A `PlayerView` ready for serialization.
 */
export function computePlayerView(
  world: Readonly<World>,
  player: PlayerId,
  options?: ComputePlayerViewOptions,
): PlayerView {
  const config = snapshotConfig(world.config);
  const tickEvents: Readonly<TickEvents> = options?.events ?? {
    combat: [],
    captures: [],
    eliminations: [],
    appliedOrders: [],
    errors: [],
  };

  // ------------------------------------------------------------------
  // Spectator path (US3 / FR-006): full board, unfiltered events.
  // Function-level dispatch only — the PlayerView type is unchanged.
  // ------------------------------------------------------------------
  if (options?.spectator === true) {
    const visibleCells: CellView[] = [];
    forEachCell(world, (view) => {
      visibleCells.push(view);
      return undefined;
    });
    return {
      player,
      tick: world.tick,
      visibleCells,
      // Spectator filter is a no-op by contract; calling through
      // `filterTickEvents` keeps a single code path for the rule.
      events: filterTickEvents(world, [], tickEvents, true),
      config,
    };
  }

  // ------------------------------------------------------------------
  // Horizon path (US1): structural redaction.
  // ------------------------------------------------------------------
  const visible = computeVisibleSet(world, player);

  const visibleCells: CellView[] = [];
  for (const coord of visible.visibleCells) {
    visibleCells.push(getCell(world, coord.x, coord.y));
  }

  return {
    player,
    tick: world.tick,
    visibleCells,
    events: filterTickEvents(world, visible.visibleCells, tickEvents, false),
    config,
  };
}
