/**
 * Tick Clock Smoke Tests — Feature 004 (Phase 2)
 *
 * Uses Vitest fake timers so the scheduler's wall-clock boundary is
 * exercised deterministically. Covers start/idempotence, tick
 * counting, lastTickAtMs tracking, stop/resume semantics, and
 * argument validation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTickClock } from '../../src/clock';

describe('createTickClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws on non-positive or non-finite intervals', () => {
    expect(() => createTickClock(0, () => {})).toThrow(RangeError);
    expect(() => createTickClock(-5, () => {})).toThrow(RangeError);
    expect(() => createTickClock(Number.NaN, () => {})).toThrow(RangeError);
    expect(() => createTickClock(Number.POSITIVE_INFINITY, () => {})).toThrow(RangeError);
  });

  it('starts at count 0 with lastTickAtMs 0 before any fire', () => {
    const clock = createTickClock(10, () => {});
    expect(clock.tickCount()).toBe(0);
    expect(clock.lastTickAtMs()).toBe(0);
  });

  it('fires onTick with 1-based tick numbers and current time', () => {
    vi.setSystemTime(1000);
    const seen: [number, number][] = [];
    const clock = createTickClock(50, (tickNumber, nowMs) => {
      seen.push([tickNumber, nowMs]);
    });

    clock.start();
    vi.advanceTimersByTime(150); // 3 fires

    expect(seen).toEqual([
      [1, 1050],
      [2, 1100],
      [3, 1150],
    ]);
    expect(clock.tickCount()).toBe(3);
    expect(clock.lastTickAtMs()).toBe(1150);
  });

  it('start is idempotent (no stacked intervals)', () => {
    let fires = 0;
    const clock = createTickClock(10, () => {
      fires += 1;
    });

    clock.start();
    clock.start();
    clock.start();

    vi.advanceTimersByTime(30);
    expect(fires).toBe(3); // one interval, not three
  });

  it('stop halts firing and is idempotent', () => {
    let fires = 0;
    const clock = createTickClock(10, () => {
      fires += 1;
    });

    clock.start();
    vi.advanceTimersByTime(20);
    expect(fires).toBe(2);

    clock.stop();
    clock.stop();
    vi.advanceTimersByTime(100);
    expect(fires).toBe(2);
  });

  it('resume after stop continues the tick count', () => {
    const clock = createTickClock(10, () => {});

    clock.start();
    vi.advanceTimersByTime(30);
    clock.stop();
    clock.start();
    vi.advanceTimersByTime(20);

    expect(clock.tickCount()).toBe(5);
  });

  it('passes the fire time into the handler rather than letting it read clocks', () => {
    vi.setSystemTime(5000);
    let observedNow = 0;
    const clock = createTickClock(10, (_tick, nowMs) => {
      observedNow = nowMs;
    });

    clock.start();
    vi.advanceTimersByTime(10);

    expect(observedNow).toBe(5010);
  });
});
