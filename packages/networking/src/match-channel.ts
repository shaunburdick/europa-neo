/**
 * MatchChannel — Per-Match State Orchestrator — Feature 004 US1 (T026)
 *
 * Holds everything one running match needs: the engine session, the
 * seat bindings (FR-007), spectator connections, the monotonic tick
 * counter, the pending-order queue drained at tick boundaries in
 * deterministic `(playerId, kind)` order (engine FR-018), and the
 * per-connection last-sent-view cache that powers server-side
 * skip-send deltas (FR-006).
 *
 * Pure on the data path: no clock reads, no randomness. The scheduler
 * is the only caller that advances `tickCounter` (via `recordTick`)
 * and drains orders.
 */

import type { MatchConfig } from '@europa/engine';
import type { Connection } from './connection';
import { NETWORK_TRANSPORT_CONSTANTS } from './constants';
import type { EngineSession } from './contracts/network-api';
import type { ConnectionId, MatchId, Order, PlayerId, PlayerView, SessionToken } from './contracts/network-types';

// ----------------------------------------------------------------------------
// Channel-internal records
// ----------------------------------------------------------------------------

/**
 * Per-player seat binding. Mirrors the contract's `SeatRecord` shape
 * with the runtime `Connection` class standing in for the contract's
 * internal `ConnectionRecord`.
 */
export interface SeatBinding {
    readonly playerId: PlayerId;
    sessionToken: SessionToken;
    /** Currently-attached connection, or null while disconnected. */
    connection: Connection | null;
    /** Epoch ms of disconnect (grace-window input; consumed by US2). */
    disconnectedAtMs: number | null;
}

/** One queued client order awaiting the next tick boundary. */
export interface PendingOrder {
    readonly playerId: PlayerId;
    readonly order: Order;
    /** Inbound envelope seq at submission (orderAck correlation). */
    readonly submittedAtSeq: number;
}

/** Result of {@link MatchChannel.attachSeat}. */
export type AttachSeatResult =
    | {
          readonly ok: true;
          /**
           * When a DIFFERENT token previously held this seat: the
           * displaced binding (its socket was already closed — spec edge
           * case "two clients claim the same player seat").
           */
          readonly displaced?: {
              readonly token: SessionToken;
              readonly connection: Connection;
          };
      }
    | { readonly ok: false };

/** Construction parameters for {@link MatchChannel}. */
export interface MatchChannelInit {
    readonly matchId: MatchId;
    readonly engineSession: EngineSession;
    readonly matchConfig: MatchConfig;
}

// ----------------------------------------------------------------------------
// MatchChannel
// ----------------------------------------------------------------------------

/**
 * The per-match orchestrator. Created by `createMatchServer` on
 * `registerMatch`; driven by the protocol handlers (seats) and the
 * tick scheduler (orders + ticks).
 */
export class MatchChannel {
    /** Routing key for this channel. */
    readonly matchId: MatchId;
    /** The match's engine session (owned by networking for its lifetime). */
    readonly engineSession: EngineSession;
    /** Frozen config snapshot (tick-rate check + telemetry). */
    readonly matchConfig: MatchConfig;

    /** Seat bindings by player id. */
    readonly seats = new Map<PlayerId, SeatBinding>();
    /** Attached spectator connections (US3 consumes; US1 leaves empty). */
    readonly spectators = new Map<ConnectionId, Connection>();

    /** Monotonic tick boundary counter (starts at 0). */
    tickCounter = 0;
    /** Orders accepted since the last tick boundary. */
    readonly pendingOrders: PendingOrder[] = [];
    /** Last view sent per connection id (skip-send delta cache). */
    readonly lastSentView = new Map<ConnectionId, PlayerView>();
    /** Spectator attach gate (default disabled; US3 flips it). */
    spectatorsAllowed = false;
    /** Set once the terminal payload has been delivered. */
    terminalSent = false;

    /**
     * @param init See {@link MatchChannelInit}.
     */
    constructor(init: MatchChannelInit) {
        this.matchId = init.matchId;
        this.engineSession = init.engineSession;
        this.matchConfig = init.matchConfig;
    }

    // ---------------------------------------------------------------------------
    // Seats (FR-007)
    // ---------------------------------------------------------------------------

    /**
     * Bind a seat to a session token. Idempotent on the same
     * `(playerId, token)` pair. A different token for an already-bound
     * seat invalidates the previous binding AND closes its socket
     * (spec edge case "two clients claim the same player seat").
     *
     * @param playerId   Seat to bind.
     * @param token      Bearer token authorizing the seat.
     * @param connection Optional live connection to attach immediately.
     * @returns Success with any displaced binding, or failure when the
     *          seat is bound to a different player id (never happens —
     *          keyed by playerId) — reserved for future validation.
     */
    attachSeat(playerId: PlayerId, token: SessionToken, connection?: Connection): AttachSeatResult {
        const existing = this.seats.get(playerId);
        if (existing && existing.sessionToken === token) {
            // Idempotent re-bind of the same triple; optionally refresh the
            // attached connection.
            if (connection && existing.connection !== connection) {
                existing.connection = connection;
            }
            return { ok: true };
        }

        let displaced: { readonly token: SessionToken; readonly connection: Connection } | undefined;
        if (existing) {
            // Token theft: close the old socket so the stale client stops
            // receiving ticks for a seat it no longer holds.
            if (existing.connection) {
                existing.connection.close(NETWORK_TRANSPORT_CONSTANTS.normalCloseCode, 'seat claimed elsewhere');
                displaced = { token: existing.sessionToken, connection: existing.connection };
            }
        }

        const binding: SeatBinding = {
            playerId,
            sessionToken: token,
            connection: connection ?? null,
            disconnectedAtMs: null,
        };
        this.seats.set(playerId, binding);
        return displaced ? { ok: true, displaced } : { ok: true };
    }

    /**
     * Unbind a seat entirely, closing any active connection. Used by
     * `Server.detachPlayer` (surrender / forfeit / kick).
     *
     * @param playerId Seat to clear.
     */
    detachSeat(playerId: PlayerId): void {
        const binding = this.seats.get(playerId);
        if (!binding) {
            return;
        }
        if (binding.connection) {
            binding.connection.close(NETWORK_TRANSPORT_CONSTANTS.normalCloseCode, 'seat detached');
            binding.connection = null;
        }
        this.seats.delete(playerId);
    }

    // ---------------------------------------------------------------------------
    // Spectators (US3 wires these; US1 keeps them inert)
    // ---------------------------------------------------------------------------

    /**
     * Attach a spectator connection (no seat, read-only).
     *
     * @param connection The spectator's connection.
     */
    addSpectator(connection: Connection): void {
        this.spectators.set(connection.id, connection);
    }

    /**
     * Remove a spectator connection.
     *
     * @param connectionId Transport handle of the spectator.
     */
    removeSpectator(connectionId: ConnectionId): void {
        this.spectators.delete(connectionId);
    }

    // ---------------------------------------------------------------------------
    // Orders (FR-018 deterministic drain)
    // ---------------------------------------------------------------------------

    /**
     * Queue an accepted order for application at the next tick boundary.
     *
     * @param playerId       Submitting player.
     * @param order          The engine order.
     * @param submittedAtSeq Inbound envelope seq (ack correlation).
     */
    enqueueOrder(playerId: PlayerId, order: Order, submittedAtSeq: number): void {
        this.pendingOrders.push({ playerId, order, submittedAtSeq });
    }

    /**
     * Drain the pending queue in the engine's canonical order —
     * ascending `(playerId, kind)` per engine FR-018 — returning the
     * sorted batch and emptying the queue. Ties beyond `(playerId, kind)`
     * keep insertion order (V8 sorts are stable).
     *
     * @returns The sorted, drained batch.
     */
    drainOrdersForTick(): PendingOrder[] {
        const sorted = [...this.pendingOrders].sort((a, b) => {
            if (a.playerId !== b.playerId) {
                return a.playerId - b.playerId;
            }
            return a.order.kind.localeCompare(b.order.kind);
        });
        this.pendingOrders.length = 0;
        return sorted;
    }

    // ---------------------------------------------------------------------------
    // Tick bookkeeping
    // ---------------------------------------------------------------------------

    /** Advance the tick counter (scheduler-only). */
    recordTick(): void {
        this.tickCounter += 1;
    }

    /**
     * Every live connection in the channel: seated players first (by
     * player id), then spectators (by connection id) — a stable iteration
     * order for deterministic broadcast construction.
     *
     * @returns Ordered array of live connections.
     */
    connections(): Connection[] {
        const result: Connection[] = [];
        for (const playerId of [...this.seats.keys()].sort((a, b) => a - b)) {
            const connection = this.seats.get(playerId)?.connection;
            if (connection) {
                result.push(connection);
            }
        }
        for (const connectionId of [...this.spectators.keys()].sort()) {
            const connection = this.spectators.get(connectionId);
            if (connection) {
                result.push(connection);
            }
        }
        return result;
    }
}
