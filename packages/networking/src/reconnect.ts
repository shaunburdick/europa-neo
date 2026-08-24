/**
 * ReconnectRegistry — Feature 004 US2 (T037)
 *
 * The per-server registry of disconnected-seat bindings:
 * `sessionToken → { connectionId, playerId, matchId, registeredAtMs }`.
 *
 * Lifecycle (spec US2 + FR-007 + FR-009):
 *   1. A seated client's WebSocket drops mid-match → the server
 *      `register`s the seat's token with the disconnect timestamp.
 *   2. The client reconnects within `reconnectGraceMs` → the server
 *      `consume`s the binding, restores the seat, and transitions the
 *      connection to `rejoined` (US2 AC-1).
 *   3. The grace window lapses first → the server's scheduler sweep
 *      calls `expireOld`, fires `MatchmakerBridge.onSeatExpired` per
 *      binding, and detaches the seat per the disconnect policy
 *      (US2 AC-2; matchmaking applies its forfeit policy).
 *
 * Purity (constitution Principle II): this module performs NO clock
 * reads — every method takes `nowMs` from the caller (the server's
 * socket-event boundary or its tick-scheduler sweep). The grace window
 * is configurable at construction from `ServerConfig.reconnectGraceMs`
 * (default 60 s — `NETWORK_CONSTANTS.defaultReconnectGraceMs`).
 */

import type { ConnectionId, MatchId, PlayerId, SessionToken } from './contracts/network-types';

// ----------------------------------------------------------------------------
// Public shapes
// ----------------------------------------------------------------------------

/** One disconnected-seat binding recorded by {@link ReconnectRegistry.register}. */
export interface ReconnectBinding {
  /** Seat-claim token the client must present to reconnect (FR-007). */
  readonly sessionToken: SessionToken;
  /** Transport handle of the connection that dropped (diagnostics). */
  readonly connectionId: ConnectionId;
  /** The seat to restore on reconnect. */
  readonly playerId: PlayerId;
  /** Match holding the seat. */
  readonly matchId: MatchId;
  /** Caller-provided epoch ms at registration (grace-window anchor). */
  readonly registeredAtMs: number;
}

/**
 * Result of a grace-window-checked lookup/consume: the live binding,
 * an `{ expired: true }` marker when the window lapsed, or `null`
 * when no binding exists for the token.
 */
export type ReconnectLookupResult = ReconnectBinding | { readonly expired: true } | null;

/** A binding removed by the expiry sweep — payload for `onSeatExpired`. */
export interface ExpiredBinding {
  readonly sessionToken: SessionToken;
  readonly playerId: PlayerId;
  readonly matchId: MatchId;
}

// ----------------------------------------------------------------------------
// ReconnectRegistry
// ----------------------------------------------------------------------------

/**
 * Token-keyed map of seats awaiting reconnect, with grace-window
 * enforcement. All time math is caller-driven; the class itself is
 * inert between calls.
 */
export class ReconnectRegistry {
  /** Bindings by session token. Insertion order is irrelevant; access is keyed. */
  private readonly bindings = new Map<SessionToken, ReconnectBinding>();

  /**
   * @param graceMs Grace window in ms (`ServerConfig.reconnectGraceMs`;
   *                default 60_000). A binding is valid while
   *                `nowMs - registeredAtMs < graceMs`.
   */
  constructor(private readonly graceMs: number) {}

  /**
   * Record (or refresh) a disconnected-seat binding. Re-registering a
   * token keeps the LATEST connectionId and re-anchors the grace
   * window at the new `registeredAtMs` (a flapping client must not
   * inherit a nearly-expired window from its first drop).
   *
   * JSDoc refs: FR-007, FR-009, US2 AC-1+2.
   *
   * @param sessionToken Seat-claim token presented at join.
   * @param connectionId Transport handle that dropped.
   * @param playerId     Seat to restore on reconnect.
   * @param matchId      Match holding the seat.
   * @param nowMs        Caller-provided epoch ms (disconnect instant).
   */
  register(
    sessionToken: SessionToken,
    connectionId: ConnectionId,
    playerId: PlayerId,
    matchId: MatchId,
    nowMs: number,
  ): void {
    this.bindings.set(sessionToken, {
      sessionToken,
      connectionId,
      playerId,
      matchId,
      registeredAtMs: nowMs,
    });
  }

  /**
   * Grace-window-checked read: the binding while
   * `nowMs - registeredAtMs < graceMs`, `{ expired: true }` once the
   * window lapses, `null` for unknown tokens. Does not mutate.
   *
   * @param sessionToken Token presented for reconnect.
   * @param nowMs        Caller-provided epoch ms.
   * @returns See {@link ReconnectLookupResult}.
   */
  lookup(sessionToken: SessionToken, nowMs: number): ReconnectLookupResult {
    const binding = this.bindings.get(sessionToken);
    if (!binding) {
      return null;
    }
    if (nowMs - binding.registeredAtMs >= this.graceMs) {
      return { expired: true };
    }
    return binding;
  }

  /**
   * Consume a binding: remove it from the registry and return it
   * (successful reconnect path). Idempotent — a second consume of the
   * same token returns `null`. An expired binding is consumed too
   * (reported as `{ expired: true }`) so stale entries never linger.
   *
   * JSDoc refs: FR-007, US2 AC-1.
   *
   * @param sessionToken Token presented for reconnect.
   * @param nowMs        Caller-provided epoch ms.
   * @returns The live binding, `{ expired: true }`, or `null`.
   */
  consume(sessionToken: SessionToken, nowMs: number): ReconnectLookupResult {
    const result = this.lookup(sessionToken, nowMs);
    if (result !== null) {
      this.bindings.delete(sessionToken);
    }
    return result;
  }

  /**
   * Scheduler-sweep entry point: remove every binding whose grace
   * window has lapsed and return them for `MatchmakerBridge.onSeatExpired`
   * dispatch (the server then detaches each seat per the disconnect
   * policy — US2 AC-2).
   *
   * JSDoc refs: FR-009, US2 AC-2.
   *
   * @param nowMs Caller-provided epoch ms (from the tick scheduler).
   * @returns The swept bindings (empty when nothing expired).
   */
  expireOld(nowMs: number): readonly ExpiredBinding[] {
    const expired: ExpiredBinding[] = [];
    for (const [sessionToken, binding] of this.bindings) {
      if (nowMs - binding.registeredAtMs >= this.graceMs) {
        expired.push({
          sessionToken,
          playerId: binding.playerId,
          matchId: binding.matchId,
        });
        this.bindings.delete(sessionToken);
      }
    }
    return expired;
  }
}
