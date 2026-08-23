/**
 * Wire envelope → NetEvent translation — Feature 005 (T031).
 *
 * Narrows a `ProtocolEnvelope<NetworkPayload>` (feature 004 wire
 * surface) into the console-internal `NetEvent` union the reducer
 * consumes. Returns `null` for envelope kinds the console ignores:
 *   - `hello` / `joinMatch` / `order` / `ping` are client→server
 *     kinds that never arrive inbound;
 *   - `pong` echoes are informational in v1 (no pending-ping table);
 *   - spectator joins (`joinAck.playerId === null`) are layered onto
 *     the UI by the runtime, not surfaced as a reducer event.
 *
 * Narrowing note: `ProtocolEnvelope` correlates type↔payload only at
 * the wire level; the TS union is not discriminated, so each arm
 * narrows with a documented cast — the same pattern feature 004's
 * server uses (packages/networking/src/server.ts §"documented cast").
 *
 * Pure: no I/O, no clock reads, no state mutation. The runtime stamps
 * the resulting event with a clock reading when dispatching.
 */

import type { EnvelopeContext, NetEvent, NetworkPayload, ProtocolEnvelope } from '../state/types';

// Payload aliases for the documented per-arm casts.
type HelloAckPayload = Extract<NetworkPayload, { readonly connectionId: string }>;
type JoinAckPayload = Extract<NetworkPayload, { readonly sessionToken: string }>;
type TickBroadcastPayload = Extract<
  NetworkPayload,
  { readonly view: unknown; readonly tick: number }
>;
type SnapshotPayload = Extract<NetworkPayload, { readonly view: unknown; readonly tick: number }>;
type OrderAckPayload = Extract<NetworkPayload, { readonly seq: number }>;
// `result: MatchResult` (not just any `result`) so OrderAckPayload's
// CommandResult field doesn't match this alias too.
type TerminalPayload = Extract<
  NetworkPayload,
  { readonly result: import('@europa/engine').MatchResult }
>;
type ErrorPayload = Extract<NetworkPayload, { readonly code: string }>;

/**
 * Translate one inbound envelope into a `NetEvent`, or `null` when
 * the console ignores it. Pure.
 *
 * @param envelope Inbound wire envelope from feature 004's client.
 * @param ctx Correlation context: the runtime's seq→ActionId map,
 *            connection timestamp, and last applied tick.
 */
export function netEventFromEnvelope(
  envelope: ProtocolEnvelope<NetworkPayload>,
  ctx: EnvelopeContext,
): NetEvent | null {
  switch (envelope.type) {
    // --- Server → client kinds the console consumes ---

    case 'helloAck': {
      const payload = envelope.payload as HelloAckPayload;
      return {
        kind: 'helloAck',
        connectionId: payload.connectionId,
        heartbeatIntervalMs: payload.heartbeatIntervalMs,
      };
    }

    case 'joinAck': {
      const payload = envelope.payload as JoinAckPayload;
      if (payload.playerId === null) {
        // Spectator join: no seat, no orders. The runtime layers the
        // 'spectating' status on top of the connection state; v1 has
        // no reducer event for it.
        return null;
      }
      return {
        kind: 'joined',
        sessionToken: payload.sessionToken,
        playerId: payload.playerId,
        view: payload.view,
        players: payload.players,
      };
    }

    case 'snapshot': {
      // Reconnect resync: semantically "reconnected with fresh view".
      const payload = envelope.payload as SnapshotPayload;
      return { kind: 'reconnected', view: payload.view };
    }

    case 'tick': {
      const payload = envelope.payload as TickBroadcastPayload;
      // Defensive monotonicity echo: the reducer drops stale ticks;
      // here we only skip envelopes strictly older than what the UI
      // already applied to avoid pointless dispatch churn.
      if (payload.tick < ctx.lastAppliedTick) {
        return null;
      }
      return { kind: 'tick', view: payload.view };
    }

    case 'orderAck': {
      const payload = envelope.payload as OrderAckPayload;
      const actionId = ctx.seqToActionId.get(payload.seq);
      if (actionId === undefined) {
        // Ack for an order this console never stamped (e.g., after a
        // reconnect wiped the correlation map): nothing to correlate.
        return null;
      }
      return { kind: 'orderAck', actionId, result: payload.result };
    }

    case 'terminal': {
      const payload = envelope.payload as TerminalPayload;
      return { kind: 'terminal', result: payload.result };
    }

    case 'pong':
      // Heartbeat echo; informational only in v1.
      return null;

    case 'error': {
      const payload = envelope.payload as ErrorPayload;
      return {
        kind: 'error',
        code: payload.code,
        message: payload.message,
      };
    }

    // --- Client → server kinds can never arrive inbound ---
    case 'hello':
    case 'joinMatch':
    case 'order':
    case 'ping':
      return null;

    default:
      return null;
  }
}
