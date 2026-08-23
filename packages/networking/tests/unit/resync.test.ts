/**
 * ResyncBuffer Unit Tests — Feature 004 US2 (T036)
 *
 * Covers FR-006 (snapshot + delta resync) and FR-007: ring-buffer
 * depth `NETWORK_CONSTANTS.replayRingBufferTicks`, strictly-after
 * `getSince` in ascending tick order, oldest-entry eviction, and
 * per-channel instance isolation (the buffer lives on the MatchChannel,
 * never on a connection, so a reconnecting client sees the stream the
 * seat's previous connection saw).
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_CONSTANTS } from '../../src/constants';
import { ResyncBuffer } from '../../src/resync';
import type { PlayerView } from '../../src/types';

/** Minimal deterministic view stand-in (only identity matters here). */
function view(marker: number): PlayerView {
  return {
    player: 1,
    tick: marker,
    visibleCells: [],
  } as unknown as PlayerView;
}

describe('ResyncBuffer', () => {
  it('declares the contract ring-buffer depth (NETWORK_CONSTANTS.replayRingBufferTicks)', () => {
    expect(ResyncBuffer.depth).toBe(NETWORK_CONSTANTS.replayRingBufferTicks);
    expect(ResyncBuffer.depth).toBe(16);
  });

  it('push stores entries and latestTick returns the highest stored tick', () => {
    const buffer = new ResyncBuffer();
    expect(buffer.latestTick()).toBe(-1); // empty sentinel

    buffer.push(1, view(1));
    buffer.push(2, view(2));
    buffer.push(3, view(3));

    expect(buffer.latestTick()).toBe(3);
  });

  it('getSince returns the views for ticks strictly after the given tick, in tick order', () => {
    const buffer = new ResyncBuffer();
    for (let tick = 1; tick <= 5; tick++) {
      buffer.push(tick, view(tick));
    }

    const replay = buffer.getSince(2);
    expect(replay.map((entry) => entry.tick)).toEqual([3, 4, 5]);
    // Each entry carries its own full view.
    expect(replay[0]?.view).toEqual(view(3));

    // Strictly-after: the boundary tick itself is excluded.
    expect(buffer.getSince(5)).toEqual([]);
    expect(buffer.getSince(0)).toHaveLength(5);
  });

  it('pushing past the depth evicts the oldest entry (bounded ring)', () => {
    const buffer = new ResyncBuffer();
    const depth = NETWORK_CONSTANTS.replayRingBufferTicks;
    for (let tick = 1; tick <= depth + 4; tick++) {
      buffer.push(tick, view(tick));
    }

    const replay = buffer.getSince(0);
    expect(replay).toHaveLength(depth);
    // The four oldest ticks (1..4) were evicted; the window starts at 5.
    expect(replay[0]?.tick).toBe(5);
    expect(replay.at(-1)?.tick).toBe(depth + 4);
    expect(buffer.latestTick()).toBe(depth + 4);
  });

  it('re-pushing an existing tick overwrites in place without growing the buffer', () => {
    const buffer = new ResyncBuffer();
    buffer.push(1, view(1));
    buffer.push(2, view(2));
    buffer.push(2, view(22));

    const replay = buffer.getSince(0);
    expect(replay).toHaveLength(2);
    expect(replay[1]).toEqual({ tick: 2, view: view(22) });
    expect(buffer.latestTick()).toBe(2);
  });

  it('overwrite-repush on a full ring keeps latestTick/getSince cursors correct (review N6)', () => {
    const buffer = new ResyncBuffer();
    const depth = NETWORK_CONSTANTS.replayRingBufferTicks;

    // Fill the ring exactly, then push one more: tick 1 is evicted and
    // the window slides to 2..depth+1.
    for (let tick = 1; tick <= depth; tick++) {
      buffer.push(tick, view(tick));
    }
    buffer.push(depth + 1, view(depth + 1));
    expect(buffer.latestTick()).toBe(depth + 1);

    // Overwrite-repush of the NEWEST tick while the ring is full: no
    // growth, high-water cursor unchanged, replay window intact.
    buffer.push(depth + 1, view(10_000));
    expect(buffer.latestTick()).toBe(depth + 1);

    const replay = buffer.getSince(1);
    expect(replay).toHaveLength(depth);
    expect(replay[0]?.tick).toBe(2);
    expect(replay.at(-1)).toEqual({ tick: depth + 1, view: view(10_000) });

    // A cursor at the high-water mark sees nothing stale behind it.
    expect(buffer.getSince(depth + 1)).toEqual([]);
  });

  it('buffers are independent instances (per-MatchChannel ownership, not shared state)', () => {
    const channelA = new ResyncBuffer();
    const channelB = new ResyncBuffer();

    channelA.push(1, view(1));
    channelB.push(7, view(7));

    expect(channelA.getSince(0)).toEqual([{ tick: 1, view: view(1) }]);
    expect(channelB.getSince(0)).toEqual([{ tick: 7, view: view(7) }]);
    expect(channelA.latestTick()).toBe(1);
    expect(channelB.latestTick()).toBe(7);
  });

  it('clear empties the buffer (called on match terminal)', () => {
    const buffer = new ResyncBuffer();
    buffer.push(1, view(1));
    buffer.push(2, view(2));

    buffer.clear();

    expect(buffer.getSince(0)).toEqual([]);
    expect(buffer.latestTick()).toBe(-1);

    // The cleared buffer is reusable.
    buffer.push(3, view(3));
    expect(buffer.getSince(0)).toEqual([{ tick: 3, view: view(3) }]);
  });
});
