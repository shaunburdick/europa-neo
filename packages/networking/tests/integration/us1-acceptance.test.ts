/**
 * US1 Acceptance Tests — Feature 004 (T032)
 *
 * The three US1 acceptance criteria from spec.md, exercised
 * end-to-end through the real server orchestrator, real engine, and
 * real fog: clients speak protocol envelopes via `ScriptedClient`,
 * the server ticks on its real scheduler at an accelerated cadence.
 *
 * Test descriptions are the spec's Given/When/Then wording verbatim
 * (spec-kit convention: the test IS the acceptance criterion).
 */

import { computePlayerView } from '@europa/fog';
import { describe, expect, it } from 'vitest';

import type { OrderAckPayload, TickBroadcastPayload } from '../../src/types';
import { startJoinedMatch, wireShape } from './harness';

describe('US1 acceptance (authoritative match channel)', () => {
  it('Given a 2-player match, When a client sends a valid pipe order, Then the server acknowledges and the effect appears in the next tick payload', async () => {
    const h = await startJoinedMatch();
    try {
      // The first order this client submits carries seq 1 (per-client
      // monotonic sequence starts at 1).
      h.clients[0].order({ kind: 'setPipe', player: 1, cell: { x: 2, y: 1 }, direction: 'S' });

      // Ack arrives at the next tick boundary, before that boundary's
      // broadcast (pipeline order: drain → ack → advance → send).
      // Seq correlation: hello=1, joinMatch=2, this order=3.
      const ack = await h.clients[0].nextMessage('orderAck');
      expect(ack.type).toBe('orderAck');
      const ackPayload = ack.payload as OrderAckPayload;
      expect(ackPayload.seq).toBe(3);
      expect(ackPayload.result.ok).toBe(true);

      // The same boundary's tick payload carries the post-advance view:
      // player 1's stack cell (2,1) now shows the southbound pipe.
      const tick = await h.clients[0].nextMessage('tick');
      expect(tick.type).toBe('tick');
      const { view } = tick.payload as TickBroadcastPayload;
      const stackCell = view.visibleCells.find((c) => c.coord.x === 2 && c.coord.y === 1);
      expect(stackCell).toBeDefined();
      expect(stackCell?.pipes).toContain('S');
    } finally {
      await h.server.close();
    }
  });

  it('Given a running match, When ticks elapse, Then each client receives exactly one state update per tick, filtered to its fog-of-war view', async () => {
    const h = await startJoinedMatch();
    try {
      const ticks = 10;
      const seen1: number[] = [];
      const seen2: number[] = [];
      let lastTick1: unknown;
      let lastTick2: unknown;

      for (let i = 1; i <= ticks; i++) {
        const t1 = await h.clients[0].nextMessage('tick');
        const t2 = await h.clients[1].nextMessage('tick');
        seen1.push((t1.payload as { tick: number }).tick);
        seen2.push((t2.payload as { tick: number }).tick);
        lastTick1 = t1.payload;
        lastTick2 = t2.payload;
      }

      // Exactly one update per tick, monotonically advancing by 1 —
      // no duplicates, no gaps, no skipped-tick silence.
      expect(seen1).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(seen2).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Fog filtering: each client's final view equals the direct fog
      // computation for THEIR seat over the current world — compared
      // in wire shape (Sets → sorted arrays), so any cross-seat leak
      // (SC-004 violation) would fail this equality.
      const world = h.match.engineSession.world();
      const expected1 = wireShape(computePlayerView(world, 1));
      const expected2 = wireShape(computePlayerView(world, 2));
      expect(wireShape((lastTick1 as { view: unknown }).view)).toEqual(expected1);
      expect(wireShape((lastTick2 as { view: unknown }).view)).toEqual(expected2);
    } finally {
      await h.server.close();
    }
  });

  it('Given a client sends an invalid order, When the server processes it, Then the order is rejected with an error and game state is unaffected', async () => {
    const h = await startJoinedMatch();
    try {
      // Snapshot the authoritative state before the bogus order.
      const before = h.match.engineSession.world();
      const masksBefore = [...before.state.pipeMasks];
      const targetIdx = 5 * 8 + 5; // the cell the bogus order targets

      // setPipe on a neutral cell: schema-valid, engine-invalid
      // (`not_owner`) — exercises the engine-level rejection path,
      // which rides `orderAck` with a failed CommandResult.
      h.clients[0].order({ kind: 'setPipe', player: 1, cell: { x: 5, y: 5 }, direction: 'N' });

      const ack = await h.clients[0].nextMessage('orderAck');
      const ackPayload = ack.payload as { seq: number; result: { ok: boolean; reason?: unknown } };
      expect(ackPayload.seq).toBe(3); // hello=1, joinMatch=2, this order=3
      expect(ackPayload.result.ok).toBe(false);

      // The rejected order caused no state change: pipe masks are
      // byte-identical (no pipe staged anywhere) and the targeted
      // cell's troops/ownership are untouched. (Global troop counts
      // DO advance — cities produce every tick regardless of orders.)
      const after = h.match.engineSession.world();
      expect([...after.state.pipeMasks]).toEqual(masksBefore);
      expect(after.state.troopCounts[targetIdx]).toBe(before.state.troopCounts[targetIdx]);
      expect(after.state.cityOwners[targetIdx]).toBe(before.state.cityOwners[targetIdx]);

      // The channel stays healthy: the next boundary still delivers
      // a normal tick update to the offending client.
      const tick = await h.clients[0].nextMessage('tick');
      expect((tick.payload as { tick: number }).tick).toBeGreaterThanOrEqual(1);
    } finally {
      await h.server.close();
    }
  });
});
