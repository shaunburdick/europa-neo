/**
 * Spectator Session — Feature 004 US3 (T044)
 *
 * Pure functions implementing the late-join spectator path:
 *
 *   - `attachSpectator` — the gate-checked attach: binds the
 *     connection to the spectator role (per-connection identity,
 *     never a seat), registers it on the channel's spectator map,
 *     computes the full-board snapshot through fog's
 *     `{ spectator: true }` branch (FR-006), and announces the
 *     presence to matchmaking with `playerId: null`.
 *
 *   - `detachSpectator` — removes a spectator presence and announces
 *     the departure. Idempotent: detaching an unknown connection is
 *     a no-op that fires nothing.
 *
 * Spectator identity is per-connection: each spectator receives its
 * own session token (so bridge events correlate end-to-end), but no
 * seat is bound, the token never enters the reconnect registry, and
 * every order the connection submits is rejected upstream in
 * `orders.ts` (`spectator_readonly`, US3 AC-1).
 *
 * Pure module: no I/O, no clock reads (`nowMs` injected by the
 * caller, mirroring the `orders.ts` convention).
 */

import type { Connection } from './connection';
import type { FogFactory, MatchmakerBridge } from './contracts/network-api';
import type {
  ConnectionId,
  PlayerId,
  SessionToken,
  SnapshotPayload,
} from './contracts/network-types';
import { NetworkError } from './errors';
import { generateSessionToken } from './ids';
import type { MatchChannel } from './match-channel';

/**
 * Seat sentinel stamped into spectator views. Fog's spectator branch
 * ignores the player entirely (full board, unfiltered events — see
 * fog's `playerView.ts` US3 path), but `PlayerView.player` still
 * carries whatever seat id it was handed. The engine's `PlayerId`
 * domain is 1..4, so `0` is the out-of-domain "no seat" marker: a
 * client can never mistake a spectator view for a real player's.
 * Mirrored by `buildTickBroadcast`'s null-seat fallback so a
 * spectator's join-time snapshot and its subsequent tick views carry
 * the same sentinel.
 */
export const SPECTATOR_VIEW_SEAT = 0 as PlayerId;

/** Dependencies for the spectator attach/detach pipeline. */
export interface SpectatorDeps {
  /** Fog factory (real `@europa/fog` in production; stub in tests). */
  readonly fog: FogFactory;
  /** Matchmaker bridge — spectator presence events fire here. */
  readonly matchmaker: MatchmakerBridge;
}

/** Result of {@link attachSpectator}. */
export type AttachSpectatorResult =
  | {
      readonly ok: true;
      /**
       * Full-board boundary snapshot (`{ tick, view }` — the same
       * shape a resync `snapshot` envelope carries). The server
       * projects it into the spectator's `joinAck`.
       */
      readonly snapshot: SnapshotPayload;
      /** Per-connection spectator token (echoed in the `joinAck`). */
      readonly sessionToken: SessionToken;
    }
  | { readonly ok: false; readonly error: NetworkError };

/**
 * Attach one connection to a match as a spectator (US3 AC-1).
 *
 * Checks the channel's spectator gate (`enableSpectators`); a closed
 * gate replies `match_not_joinable` on the wire and mutates nothing.
 * On success the connection transitions to a joined spectator (seat
 * `null`), joins the channel's spectator map, and matchmaking hears
 * `onSeatClaimed` with `role: 'spectator'` / `playerId: null`.
 * Spectators bypass seat allocation entirely — the seat scan, seat
 * capacity, and reconnect registry are never consulted.
 *
 * @param channel    The match channel to attach to.
 * @param connection The attaching connection (greeted, unbound).
 * @param deps       Injected fog + matchmaker dependencies.
 * @param nowMs      Caller-provided wall-clock ms (error-frame stamp).
 * @returns The full-board snapshot + spectator token, or the
 *          rejection (error frame already sent).
 */
export function attachSpectator(
  channel: MatchChannel,
  connection: Connection,
  deps: SpectatorDeps,
  nowMs: number,
): AttachSpectatorResult {
  if (!channel.spectatorsAllowed) {
    const error = new NetworkError(
      'match_not_joinable',
      'spectators are not enabled for this match',
    );
    connection.sendError(error.code, error.message, error.detail, nowMs);
    return { ok: false, error };
  }

  // Per-connection identity: the token lets bridge events correlate,
  // but it authorizes no seat and reclaims nothing (it is absent
  // from the reconnect registry by construction).
  const sessionToken = generateSessionToken();
  connection.markSpectatorJoined(sessionToken, channel.matchId);
  channel.addSpectator(connection);

  // FR-006: fog's `{ spectator: true }` branch decodes EVERY cell and
  // skips event redaction; the seat argument is ignored by that path
  // (see `SPECTATOR_VIEW_SEAT`).
  const world = channel.engineSession.world();
  const view = deps.fog.computePlayerView({
    world,
    playerId: SPECTATOR_VIEW_SEAT,
    spectator: true,
  });

  deps.matchmaker.onSeatClaimed?.({
    matchId: channel.matchId,
    connectionId: connection.id,
    sessionToken,
    playerId: null,
    role: 'spectator',
  });

  return {
    ok: true,
    snapshot: { tick: channel.tickCounter, view },
    sessionToken,
  };
}

/**
 * Remove a spectator presence from a channel (US3 AC-1 teardown).
 *
 * Idempotent: an unknown connection id removes nothing and fires
 * nothing, so transport-close handling and explicit detaches can
 * race without double-notifying matchmaking. Also drops the
 * spectator's delta-cache entry — spectators are ephemeral, and a
 * long match with many observers must not accumulate stale views.
 *
 * Does NOT close the underlying socket: transport teardown is the
 * caller's concern (the server's disconnect handler closes; an
 * explicit matchmaking-driven detach may close separately).
 *
 * @param channel      The match channel to leave.
 * @param connectionId Transport handle of the departing spectator.
 * @param deps         Injected matchmaker dependency.
 * @returns `true` when a live presence was removed.
 */
export function detachSpectator(
  channel: MatchChannel,
  connectionId: ConnectionId,
  deps: SpectatorDeps,
): boolean {
  const connection = channel.spectators.get(connectionId);
  if (!connection) {
    return false;
  }
  channel.removeSpectator(connectionId);
  channel.lastSentView.delete(connectionId);

  const sessionToken = connection.sessionToken;
  if (sessionToken !== null) {
    deps.matchmaker.onSeatDisconnected?.({
      matchId: channel.matchId,
      connectionId,
      sessionToken,
    });
  }
  return true;
}
