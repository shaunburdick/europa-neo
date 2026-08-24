/**
 * Order Submission Pipeline — Feature 004 US1 (T027)
 *
 * Pure functions bridging the wire protocol to the engine:
 *
 *   - `acceptOrder` — the protocol gatekeeper: role check
 *     (`spectator_readonly`), state check (`protocol_sequence_error`),
 *     token-bucket rate limit (`rate_limited`, FR-010). On success the
 *     order is enqueued on the channel for application at the next
 *     tick boundary.
 *
 *   - `applyOrdersAtTickBoundary` — drains the channel queue in the
 *     engine's canonical `(playerId, kind)` order (engine FR-018),
 *     submits each order to the engine session, and returns the
 *     results so the broadcast step can ack them.
 *
 * The wire distinction matters (see `errors.ts`): a protocol-level
 * rejection is an `ErrorPayload`; an engine-level rejection is an
 * `orderAck` with `result.ok: false`. This module produces protocol
 * rejections only — engine results pass through untouched.
 *
 * Pure module: no I/O, no clock reads (`nowMs` injected).
 */

import type { CommandResult } from '@europa/engine';
import type { Connection } from './connection';
import type { NetworkPayload, Order, PlayerId, ProtocolEnvelope } from './contracts/network-types';
import { NetworkError } from './errors';
import type { MatchChannel } from './match-channel';

// ----------------------------------------------------------------------------
// acceptOrder
// ----------------------------------------------------------------------------

/** Result of {@link acceptOrder}. */
export type AcceptOrderResult =
  | { readonly ok: true; readonly pendingRef: ProtocolEnvelope<NetworkPayload> }
  | { readonly ok: false; readonly error: NetworkError };

/**
 * Gate one client order into the channel's pending queue.
 *
 * Checks, in order:
 *   1. **Role** — spectators are read-only (`spectator_readonly`,
 *      spec US3 AC-1; enforced from US1 so the invariant holds even
 *      before spectator attach exists).
 *   2. **State** — orders flow only from `joined`/`rejoined`
 *      connections; anything else is `protocol_sequence_error`
 *      (e.g., order before joinMatch, or after disconnect).
 *   3. **Rate** — lazy token-bucket refill then consume; empty bucket
 *      → `rate_limited` (FR-010). Rejected orders never touch the
 *      engine's pending queue.
 *
 * @param channel    The match channel to enqueue onto.
 * @param connection The submitting connection.
 * @param order      The engine order from the `order` envelope.
 * @param nowMs      Caller-provided wall-clock ms (bucket refill clock).
 * @returns Success with the pending reference, or the rejection.
 */
export function acceptOrder(
  channel: MatchChannel,
  connection: Connection,
  order: Order,
  nowMs: number,
): AcceptOrderResult {
  const reject = (error: NetworkError): AcceptOrderResult => {
    // Protocol-level rejections ride an `error` frame back to the
    // client immediately (distinct from engine-level `orderAck`s,
    // which are emitted at tick boundaries).
    connection.sendError(error.code, error.message, error.detail, nowMs);
    return { ok: false, error };
  };

  if (connection.role === 'spectator') {
    return reject(new NetworkError('spectator_readonly', 'spectators cannot submit orders'));
  }

  const state = connection.state();
  if (state !== 'joined' && state !== 'rejoined') {
    return reject(
      new NetworkError(
        'protocol_sequence_error',
        `orders require a joined connection (state: ${state})`,
      ),
    );
  }

  if (!connection.takeToken(nowMs)) {
    return reject(new NetworkError('rate_limited', 'order rate limit exceeded'));
  }

  const { playerId } = connection;
  if (playerId === null) {
    // Defensive: a joined player connection always carries its seat.
    return reject(new NetworkError('internal_error', 'joined connection has no seat binding'));
  }

  const submittedAtSeq = connection.lastClientSeq;
  channel.enqueueOrder(playerId, order, submittedAtSeq);

  // The pending reference mirrors the queued record shape; it lets
  // callers correlate without reaching into channel internals.
  const pendingRef: ProtocolEnvelope<NetworkPayload> = {
    type: 'order',
    version: '',
    seq: submittedAtSeq,
    payload: { order },
  };
  return { ok: true, pendingRef };
}

// ----------------------------------------------------------------------------
// applyOrdersAtTickBoundary
// ----------------------------------------------------------------------------

/** One applied order's outcome, keyed for ack routing. */
export interface AppliedOrderOutcome {
  readonly playerId: PlayerId;
  readonly result: CommandResult;
  /** Inbound envelope seq at submission (orderAck.seq correlation). */
  readonly submittedAtSeq: number;
}

/**
 * Drain and apply the channel's pending orders at a tick boundary.
 * Orders reach the engine in `drainOrdersForTick`'s deterministic
 * `(playerId, kind)` order (engine FR-018); each engine result is
 * returned verbatim for the ack step.
 *
 * @param channel The match channel whose queue should be drained.
 * @returns Per-order outcomes in submission-drain order.
 */
export function applyOrdersAtTickBoundary(channel: MatchChannel): AppliedOrderOutcome[] {
  const drained = channel.drainOrdersForTick();
  const outcomes: AppliedOrderOutcome[] = [];
  for (const entry of drained) {
    const result = channel.engineSession.submit(entry.order);
    outcomes.push({
      playerId: entry.playerId,
      result,
      submittedAtSeq: entry.submittedAtSeq,
    });
  }
  return outcomes;
}
