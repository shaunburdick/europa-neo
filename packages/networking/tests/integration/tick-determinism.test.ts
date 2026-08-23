/**
 * Tick Determinism Integration Test — Feature 004 US1 (T033)
 *
 * Protocol-level SC-001: two independent `createMatchServer` runs
 * over identical scripted matches (same seed, same board, same
 * scripted order sequence) must emit byte-identical `tick` envelope
 * streams to player 1.
 *
 * **Pinning discipline**: each loop iteration submits one order and
 * awaits ITS ack (`orderAck.seq` correlation) before reading the next
 * tick envelope. Because the pipeline runs synchronously per fire
 * (drain → acks → advance → broadcast), observing an ack proves that
 * boundary's broadcast is already queued — so wall-clock jitter can
 * never shift which boundary applies which order across runs.
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { OrderAckPayload } from '../../src/types';
import { scriptedPipeOrder, startJoinedMatch, stubFogDeps } from './harness';

/** Order-then-tick iterations (spec minimum: 100). */
const TICKS = 100;

/**
 * Run one full deterministic stream: join both players, then for 100
 * boundaries submit one pipe order per player (deterministic function
 * of the iteration index) and await the boundary's tick.
 *
 * Uses the deterministic fog stub so every boundary emits a view —
 * the real economy reaches a troop fixed point under this script,
 * and skip-send would then correctly go silent (that behavior is
 * acceptance-tested separately).
 *
 * @returns Player 1's received `tick` envelopes as canonical JSON text.
 */
async function runTickStream(): Promise<string[]> {
  const h = await startJoinedMatch(stubFogDeps());
  try {
    for (let i = 0; i < TICKS; i++) {
      const order1 = scriptedPipeOrder(1, i);
      const order2 = scriptedPipeOrder(2, i);

      // Submit both orders, pinning each to its ack by sequence number.
      const submitted1 = h.clients[0].order(order1);
      const submitted2 = h.clients[1].order(order2);
      const ack1 = await h.clients[0].nextMessage('orderAck');
      const ack2 = await h.clients[1].nextMessage('orderAck');
      expect((ack1.payload as OrderAckPayload).seq).toBe(submitted1.seq);
      expect((ack2.payload as OrderAckPayload).seq).toBe(submitted2.seq);

      // Same synchronous boundary: both ticks are already queued.
      await h.clients[0].nextMessage('tick');
      await h.clients[1].nextMessage('tick');
    }

    return h.clients[0].socket.sentFrames
      .filter((frame) => frame.type === 'tick')
      .map((frame) => JSON.stringify(frame));
  } finally {
    await h.server.close();
  }
}

describe('SC-001 protocol-level tick determinism', () => {
  it('two identical server runs emit byte-identical tick streams over 100 order-then-tick cycles', async () => {
    const runA = await runTickStream();
    const runB = await runTickStream();

    expect(runA.length).toBe(TICKS);
    expect(runB.length).toBe(TICKS);

    const hashA = createHash('sha256').update(runA.join('')).digest('hex');
    const hashB = createHash('sha256').update(runB.join('')).digest('hex');

    expect(`${String(runA.length)} frames compared: 0 divergence`).toBe(
      `${String(runB.length)} frames compared: 0 divergence`,
    );
    expect(hashA).toBe(hashB);
  });
});
