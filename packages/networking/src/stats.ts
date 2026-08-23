/**
 * Stats Counters — Feature 004 US1 (T029)
 *
 * The instrumentation surface for `/health`, metrics, and the soak /
 * perf tests (SC-005): tick durations, frame and order totals, and
 * rate-limit drops. `activeMatches` / `activeConnections` are live
 * reads supplied by the server at snapshot time — the counter does
 * not own those collections.
 *
 * Determinism discipline: no wall-clock reads. `uptimeMs` is computed
 * from a start timestamp captured by the caller and the `nowMs`
 * passed into `snapshot`.
 */

import type { ServerStats } from './contracts/network-api';
import type { MessageKind } from './contracts/network-types';

/** Live gauges the server supplies when snapshotting. */
export interface LiveCounts {
  /** Number of registered (live) matches. */
  readonly activeMatches: number;
  /** Sum of seat + spectator connections across all channels. */
  readonly activeConnections: number;
}

/**
 * Mutable accumulator behind `Server.stats()`. One instance per
 * server process.
 */
export class StatsCounter {
  private readonly startedAtMs: number;
  private ticks = 0;
  private framesSent = 0;
  private framesReceived = 0;
  private ordersAccepted = 0;
  private ordersRejected = 0;
  private rateLimitDrops = 0;
  private lastTickDurationMsValue = 0;
  private peakTickDurationMsValue = 0;

  /**
   * @param startedAtMs Epoch ms of server creation (caller's clock).
   */
  constructor(startedAtMs: number) {
    this.startedAtMs = startedAtMs;
  }

  /**
   * Record one scheduler fire's wall-clock duration.
   *
   * @param durationMs Measured duration of the full per-tick pipeline.
   */
  recordTick(durationMs: number): void {
    this.ticks += 1;
    this.lastTickDurationMsValue = durationMs;
    if (durationMs > this.peakTickDurationMsValue) {
      this.peakTickDurationMsValue = durationMs;
    }
  }

  /**
   * Count one outbound frame.
   *
   * @param _kind Message kind (reserved for per-kind breakdowns).
   */
  recordFrameSent(_kind: MessageKind): void {
    this.framesSent += 1;
  }

  /**
   * Count one inbound frame.
   *
   * @param _kind Message kind (reserved for per-kind breakdowns).
   */
  recordFrameReceived(_kind: MessageKind): void {
    this.framesReceived += 1;
  }

  /** Count one accepted order. */
  recordOrderAccepted(): void {
    this.ordersAccepted += 1;
  }

  /** Count one rejected order (protocol OR engine rejection). */
  recordOrderRejected(): void {
    this.ordersRejected += 1;
  }

  /** Count one order dropped specifically by the rate limiter. */
  recordRateLimitDrop(): void {
    this.rateLimitDrops += 1;
  }

  /**
   * Build an immutable stats snapshot.
   *
   * @param nowMs  Caller-provided wall-clock ms (uptime basis).
   * @param counts Live match/connection gauges from the server.
   * @returns The read-only snapshot.
   */
  snapshot(nowMs: number, counts: LiveCounts): ServerStats {
    return {
      uptimeMs: Math.max(0, nowMs - this.startedAtMs),
      activeMatches: counts.activeMatches,
      activeConnections: counts.activeConnections,
      totalTicks: this.ticks,
      totalFramesSent: this.framesSent,
      totalFramesReceived: this.framesReceived,
      totalOrdersAccepted: this.ordersAccepted,
      totalOrdersRejected: this.ordersRejected,
      totalRateLimitDrops: this.rateLimitDrops,
      lastTickDurationMs: this.lastTickDurationMsValue,
      peakTickDurationMs: this.peakTickDurationMsValue,
    };
  }
}
