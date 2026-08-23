/**
 * StatsCounter Unit Tests — Feature 004 US1 (T029)
 *
 * Covers SC-005 instrumentation: the counters the soak/perf tests
 * read (`lastTickDurationMs`, `peakTickDurationMs`, frame/order
 * totals). All time is injected — no wall-clock reads.
 */

import { describe, expect, it } from 'vitest';

import { StatsCounter } from '../../src/stats';

describe('StatsCounter', () => {
  it('a fresh counter snapshots to zeroed totals with the given start time', () => {
    const stats = new StatsCounter(1_000);
    const snap = stats.snapshot(1_000, { activeMatches: 0, activeConnections: 0 });

    expect(snap.uptimeMs).toBe(0);
    expect(snap.activeMatches).toBe(0);
    expect(snap.activeConnections).toBe(0);
    expect(snap.totalTicks).toBe(0);
    expect(snap.totalFramesSent).toBe(0);
    expect(snap.totalFramesReceived).toBe(0);
    expect(snap.totalOrdersAccepted).toBe(0);
    expect(snap.totalOrdersRejected).toBe(0);
    expect(snap.totalRateLimitDrops).toBe(0);
    expect(snap.lastTickDurationMs).toBe(0);
    expect(snap.peakTickDurationMs).toBe(0);
  });

  it('uptime is computed from the injected now, not a clock read', () => {
    const stats = new StatsCounter(1_000);
    expect(stats.snapshot(3_250, { activeMatches: 1, activeConnections: 2 }).uptimeMs).toBe(2_250);
  });

  it('recordTick tracks last and peak durations', () => {
    const stats = new StatsCounter(0);
    stats.recordTick(12);
    stats.recordTick(4);
    stats.recordTick(30);

    const snap = stats.snapshot(100, { activeMatches: 0, activeConnections: 0 });
    expect(snap.totalTicks).toBe(3);
    expect(snap.lastTickDurationMs).toBe(30);
    expect(snap.peakTickDurationMs).toBe(30);
  });

  it('frame, order, and rate-limit counters accumulate independently', () => {
    const stats = new StatsCounter(0);
    stats.recordFrameSent('tick');
    stats.recordFrameSent('orderAck');
    stats.recordFrameSent('tick');
    stats.recordFrameReceived('hello');
    stats.recordFrameReceived('order');
    stats.recordOrderAccepted();
    stats.recordOrderRejected();
    stats.recordOrderRejected();
    stats.recordRateLimitDrop();

    const snap = stats.snapshot(10, { activeMatches: 2, activeConnections: 4 });
    expect(snap.totalFramesSent).toBe(3);
    expect(snap.totalFramesReceived).toBe(2);
    expect(snap.totalOrdersAccepted).toBe(1);
    expect(snap.totalOrdersRejected).toBe(2);
    expect(snap.totalRateLimitDrops).toBe(1);
    // Live reads flow through the snapshot call.
    expect(snap.activeMatches).toBe(2);
    expect(snap.activeConnections).toBe(4);
  });
});
