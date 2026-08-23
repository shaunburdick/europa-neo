/**
 * Rate-Limit Integration Test — Feature 004 Polish (T048)
 *
 * FR-010 + US1 AC-3 end-to-end: a client firing 25 orders inside a
 * 1-second window against a 10 orders/s + 2× burst configuration
 * (bucket capacity = 20) sees exactly 20 accepted and exactly 5
 * rejected with `rate_limited` error frames; the channel queue holds
 * exactly the 20 accepted orders, and the next tick boundary applies
 * exactly those 20 (one `orderAck` apiece, none lost or duplicated).
 *
 * **Injected-clock discipline** (Wave 6B-1 determinism hardening
 * pattern): the token bucket refills lazily from the caller-stamped
 * `nowMs`, so a burst spanning real wall-clock time would refill
 * nondeterministically on a loaded CI runner. Before each submission
 * this test pins `rateBucket.lastRefillAtMs` into the future, forcing
 * `takeToken`'s elapsed-time computation to exactly zero — the burst
 * verdict (20/5) is then a pure function of the configured capacity,
 * independent of scheduler jitter. Production code is untouched; the
 * pin rides the same public bucket field the pipeline itself advances.
 */

import { describe, expect, it } from 'vitest';

import type { Connection } from '../../src/connection';
import { createMatchServer } from '../../src/server';
import type { ErrorPayload, OrderAckPayload } from '../../src/types';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';
import { realDeps, scriptedPipeOrder, testServerConfig } from './harness';

/** Burst size under test: capacity + 5 (five deterministic rejects). */
const BURST_ORDERS = 25;

/** Expected accepts = floor(10 orders/s × 2.0 burst factor). */
const EXPECTED_ACCEPTS = 20;

/** Expected rejects = burst − accepts. */
const EXPECTED_REJECTS = 5;

describe('rate limiting (FR-010, US1 AC-3, T048)', () => {
  it('a 25-order burst against a 20-token bucket accepts exactly 20, rejects 5, and applies exactly 20 at the next tick', async () => {
    const server = createMatchServer(
      // 10 orders/s with a 2× burst factor → bucket capacity 20.
      { ...testServerConfig(), ordersPerSecond: 10, rateLimitBurstFactor: 2 },
      realDeps(),
    );
    await server.listen();
    try {
      const match = scriptedMatch({ boardSize: 8, tickRateMs: 10 });
      server.registerMatch({
        matchId: match.matchId,
        engineSession: match.engineSession,
        matchConfig: match.matchConfig,
      });
      attachPlayersForMatch(server, match);

      // Connect through the mock seam, keeping the server-side
      // Connection handle so the test can drive the bucket's clock.
      const socket = new MockWebSocket();
      const connection: Connection = server.__injectSocketForTest(socket);
      const client = new ScriptedClient(socket);

      client.hello();
      await client.nextMessage('helloAck');
      client.joinMatch(match.matchId, 'player', { requestedSeat: 1 });
      await client.nextMessage('joinAck');

      // Bucket sanity: capacity and opening balance follow the config.
      expect(connection.rateBucket.capacity).toBe(EXPECTED_ACCEPTS);
      expect(connection.rateBucket.tokens).toBe(EXPECTED_ACCEPTS);

      // --- The burst -------------------------------------------------
      for (let i = 0; i < BURST_ORDERS; i += 1) {
        // Injected clock: a future refill stamp zeroes takeToken's
        // elapsed computation for THIS submission, making the whole
        // burst wall-clock-independent (see module doc).
        connection.rateBucket.lastRefillAtMs = Date.now() + 60_000;
        client.order(scriptedPipeOrder(1, i));
      }

      // Protocol rejections are immediate synchronous error frames —
      // no need to wait for a boundary to count them.
      const errorFrames = socket.sentFrames.filter((f) => f.type === 'error');
      expect(errorFrames).toHaveLength(EXPECTED_REJECTS);
      for (const frame of errorFrames) {
        expect((frame.payload as ErrorPayload).code).toBe('rate_limited');
      }
      // Outbound server seqs stay contiguous across the rejections
      // (helloAck=1, joinAck=2, then the five error frames): rejected
      // orders consume no ack path and leave the stream gapless.
      expect(errorFrames.map((f) => f.seq)).toEqual([3, 4, 5, 6, 7]);

      // Stats agree with the wire: 20 accepted, 5 limiter drops.
      const statsAfterBurst = server.stats();
      expect(statsAfterBurst.totalOrdersAccepted).toBe(EXPECTED_ACCEPTS);
      expect(statsAfterBurst.totalRateLimitDrops).toBe(EXPECTED_REJECTS);

      // --- The next tick boundary ------------------------------------
      // Queue depth proof: exactly the 20 accepted orders were staged,
      // so the boundary emits exactly 20 acks (pipeline order: drain →
      // ack → advance → broadcast).
      const acceptedSeqs: number[] = [];
      for (let i = 0; i < EXPECTED_ACCEPTS; i += 1) {
        const ack = await client.nextMessage('orderAck');
        const payload = ack.payload as OrderAckPayload;
        expect(payload.result.ok).toBe(true);
        acceptedSeqs.push(payload.seq);
      }
      // Accepts are the FIRST twenty submissions (client seqs 3..22),
      // applied in the engine's canonical FR-018 drain order —
      // ascending (playerId, kind), i.e. all `clearPipe` orders before
      // all `setPipe` orders (`localeCompare`), each group in arrival
      // order. The burst alternates kinds (even index = setPipe), so
      // the ack stream interleaving is the deterministic sort itself.
      const burstSeqs = Array.from({ length: EXPECTED_ACCEPTS }, (_, i) => i + 3);
      const clearPipeSeqs = burstSeqs.filter((seq) => (seq - 3) % 2 === 1);
      const setPipeSeqs = burstSeqs.filter((seq) => (seq - 3) % 2 === 0);
      expect(acceptedSeqs).toEqual([...clearPipeSeqs, ...setPipeSeqs]);

      // One more boundary to prove nothing extra was queued, replayed,
      // or newly rejected after the bucket settled.
      await client.nextMessage('tick');
      expect(socket.sentFrames.filter((f) => f.type === 'orderAck')).toHaveLength(EXPECTED_ACCEPTS);
      expect(socket.sentFrames.filter((f) => f.type === 'error')).toHaveLength(EXPECTED_REJECTS);
    } finally {
      await server.close();
    }
  });
});
