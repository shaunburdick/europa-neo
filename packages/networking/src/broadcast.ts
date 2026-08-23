/**
 * Tick Broadcast — Feature 004 US1 (T028)
 *
 * Pure functions producing and delivering the per-tick fog-filtered
 * broadcast (FR-005) with server-side skip-send deltas (FR-006):
 *
 *   - `buildTickBroadcast` — computes each live connection's view via
 *     the injected fog factory and marks entries `'skip'` when the
 *     view is byte-identical to what that connection already received
 *     (plan.md "Key design decisions" §"Delta encoding").
 *
 *   - `sendTickBroadcast` — puts non-skip entries on the wire as
 *     `tick` envelopes and refreshes the channel's last-sent cache.
 *
 * **Fingerprint note**: a `PlayerView` embeds `tick`, which advances
 * by definition every tick. Byte-identity therefore compares the view
 * CONTENT (`player`, `visibleCells`, `events`, `config`) — the wire
 * payload's authoritative tick stamp is `payload.tick` (the channel
 * counter), not the embedded field.
 *
 * SC-004 (zero fog violations): this module never inspects or alters
 * `view.visibleCells`; it trusts fog's output verbatim.
 */

import type { Connection } from './connection';
import { NETWORK_API_VERSION } from './constants';
import type { FogFactory } from './contracts/network-api';
import type {
  ConnectionId,
  NetworkPayload,
  PlayerId,
  PlayerView,
  ProtocolEnvelope,
  TickBroadcastPayload,
} from './contracts/network-types';
import type { MatchChannel } from './match-channel';

// ----------------------------------------------------------------------------
// buildTickBroadcast
// ----------------------------------------------------------------------------

/** Dependencies for {@link buildTickBroadcast}. */
export interface BroadcastDeps {
  /** Fog factory (real `@europa/fog` in production; stub in tests). */
  readonly fog: FogFactory;
}

/**
 * Compute the per-connection tick payload map. Every live connection
 * (seated players, then spectators — see `MatchChannel.connections`)
 * gets its fog-computed view, or `'skip'` when byte-identical to the
 * last sent one.
 *
 * @param channel The match channel (post-advance world + tick counter).
 * @param deps    Injected fog factory.
 * @param _nowMs  Reserved for future heartbeat stamping (keeps the
 *                pure signature symmetric with `sendTickBroadcast`).
 * @returns Map of connection id → payload to send, or `'skip'`.
 */
export function buildTickBroadcast(
  channel: MatchChannel,
  deps: BroadcastDeps,
  _nowMs?: number,
): Map<ConnectionId, TickBroadcastPayload | 'skip'> {
  const world = channel.engineSession.world();
  const result = new Map<ConnectionId, TickBroadcastPayload | 'skip'>();

  for (const connection of channel.connections()) {
    const spectator = connection.role === 'spectator';
    const playerId: PlayerId = connection.playerId ?? 1;
    const view = deps.fog.computePlayerView({ world, playerId, spectator });

    const previous = channel.lastSentView.get(connection.id);
    if (previous !== undefined && fingerprint(previous) === fingerprint(view)) {
      result.set(connection.id, 'skip');
      continue;
    }
    result.set(connection.id, { tick: channel.tickCounter, view });
  }

  return result;
}

// ----------------------------------------------------------------------------
// sendTickBroadcast
// ----------------------------------------------------------------------------

/**
 * Deliver the built broadcast: one `tick` envelope per non-skip entry,
 * then refresh `lastSentView` for exactly those entries (skipped
 * connections keep their previous cache entry).
 *
 * @param channel     The match channel (cache owner).
 * @param connections The live connections considered by `build`.
 * @param broadcast   The map produced by {@link buildTickBroadcast}.
 * @param nowMs       Wall-clock ms stamped on each send.
 * @returns Number of envelopes actually sent (for stats).
 */
export function sendTickBroadcast(
  channel: MatchChannel,
  connections: Iterable<Connection>,
  broadcast: Map<ConnectionId, TickBroadcastPayload | 'skip'>,
  nowMs?: number,
): number {
  let sent = 0;
  for (const connection of connections) {
    const payload = broadcast.get(connection.id);
    if (payload === undefined || payload === 'skip') {
      continue;
    }
    const envelope: ProtocolEnvelope<NetworkPayload> = {
      type: 'tick',
      version: NETWORK_API_VERSION,
      seq: 0 as never,
      payload,
    };
    connection.send(envelope, nowMs);
    channel.lastSentView.set(connection.id, payload.view);
    sent += 1;
  }
  return sent;
}

// ----------------------------------------------------------------------------
// Fingerprinting
// ----------------------------------------------------------------------------

/**
 * Set-aware deterministic stringify: mirrors the wire replacer's
 * `Set` → sorted-array transform (see `frame.ts`) so fingerprints
 * distinguish views that differ only in Set-valued fields (e.g.
 * `CellView.pipes`). Plain `JSON.stringify` would flatten Sets to
 * `{}` and wrongly treat such views as identical (skip-send bug).
 *
 * @param value The value to fingerprint-stringify.
 * @returns Deterministic JSON text.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Set ? [...v].sort() : v));
}

/**
 * Stable content fingerprint of a view: JSON with the volatile
 * embedded `tick` omitted (see module JSDoc). Key order is insertion
 * order per V8, and both sides are constructed by the same code path,
 * so equality of fingerprints ⇔ byte-identity of content.
 *
 * @param view The fog-computed view.
 * @returns Deterministic string fingerprint.
 */
function fingerprint(view: PlayerView): string {
  return stableStringify({
    player: view.player,
    visibleCells: view.visibleCells,
    events: view.events,
    config: view.config,
  });
}
