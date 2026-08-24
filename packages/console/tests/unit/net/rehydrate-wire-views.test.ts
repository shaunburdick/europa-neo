/**
 * Rehydrate-wire-views unit tests — live-wire defect fix.
 *
 * The wire codec serializes Set-typed view fields (`CellView.pipes`)
 * as sorted arrays (`frame.ts` §wireReplacer); the contract types
 * promise `ReadonlySet`. These tests pin the decode-boundary repair:
 *
 *   - a REAL wire frame (built with networking's own `encodeFrame` so
 *     the Set → sorted-array transform is applied by production code,
 *     not hand-mocked) rehydrates into views whose `pipes` is a real
 *     Set with working `.has()`/`.size`;
 *   - all three view-bearing kinds are covered (`joinAck`, `snapshot`,
 *     `tick`) — the snapshot arm is the reconnect resync path;
 *   - non-view envelopes pass through by reference untouched;
 *   - rehydration is idempotent and preserves member order.
 */

import { encodeFrame, NETWORK_API_VERSION } from '@europa/networking/browser';
import { describe, expect, test } from 'vitest';
import { rehydrateEnvelopeViews } from '../../../src/net/rehydrate-wire-views';
import type { NetworkPayload, ProtocolEnvelope, SequenceNumber } from '../../../src/state/types';

/** Server-seq counter for fabricated inbound envelopes. */
let serverSeq = 0;

/**
 * Serialize an envelope EXACTLY as the server would (production
 * replacer: Sets become sorted arrays) and hand back the decoded wire
 * text. This is the shape that used to reach the console unrepaired.
 */
function toWireText(type: string, payload: NetworkPayload): string {
  serverSeq += 1;
  const envelope: ProtocolEnvelope<NetworkPayload> = {
    type: type as 'tick',
    version: NETWORK_API_VERSION,
    seq: serverSeq as SequenceNumber,
    payload,
  };
  return encodeFrame(envelope);
}

/** Decode a wire frame back into an envelope (schema-validated). */
function fromWireText(text: string): ProtocolEnvelope<NetworkPayload> {
  // The browser client validates via tryDecodeFrame; here we only need
  // the parsed object, and the frames this file builds are valid.
  return JSON.parse(text) as ProtocolEnvelope<NetworkPayload>;
}

/** A view cell in IN-MEMORY contract form (real Set). */
function cellWithPipes(
  coord: { x: number; y: number },
  pipes: ReadonlySet<string>,
): Record<string, unknown> {
  return {
    coord,
    cell: { ...coord, elevation: 60, terrain: 'land' },
    troopCount: 12,
    troopOwner: 1,
    pipes,
    reservesPercent: 0,
    cityOwner: null,
  };
}

/** Wrap cells into a minimal PlayerView-shaped record. */
function viewOf(tick: number, cells: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    player: 1,
    tick,
    visibleCells: cells,
    events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
    config: { boardSize: 32, playerCount: 2, tickIntervalMs: 250, seed: 0, visibilityRadius: 2 },
  };
}

describe('rehydrateEnvelopeViews — wire arrays become real Sets', () => {
  test('a real encoded tick frame yields pipes as a working Set', () => {
    const wire = toWireText('tick', {
      tick: 7,
      view: viewOf(7, [
        cellWithPipes({ x: 5, y: 5 }, new Set(['N', 'E'])),
        cellWithPipes({ x: 6, y: 5 }, new Set()),
      ]),
    } as NetworkPayload);

    // Precondition: the WIRE really carries arrays (the transform ran).
    const raw = fromWireText(wire) as unknown as {
      payload: { view: { visibleCells: Array<{ pipes: unknown }> } };
    };
    expect(raw.payload.view.visibleCells[0]?.pipes).toEqual(['E', 'N']);

    const repaired = rehydrateEnvelopeViews(fromWireText(wire));
    const payload = repaired.payload as unknown as {
      view: { visibleCells: Array<{ pipes: unknown; coord: { x: number } }> };
    };
    const pipes = payload.view.visibleCells[0]?.pipes;
    expect(pipes).toBeInstanceOf(Set);
    expect((pipes as Set<string>).has('N')).toBe(true);
    expect((pipes as Set<string>).has('E')).toBe(true);
    expect((pipes as Set<string>).size).toBe(2);
    // Sorted-array → Set keeps the canonical (sorted) member order.
    expect([...(pipes as Set<string>)]).toEqual(['E', 'N']);
    // Empty array becomes an empty Set, not a passthrough.
    const empty = payload.view.visibleCells[1]?.pipes;
    expect(empty).toBeInstanceOf(Set);
    expect((empty as Set<unknown>).size).toBe(0);
  });

  test('joinAck and snapshot (reconnect resync) views are rehydrated too', () => {
    for (const kind of ['joinAck', 'snapshot'] as const) {
      const base =
        kind === 'joinAck'
          ? ({
              sessionToken: 'tok',
              playerId: 1,
              view: viewOf(3, [cellWithPipes({ x: 1, y: 1 }, new Set(['W']))]),
              tick: 3,
              players: [],
            } as NetworkPayload)
          : ({
              tick: 3,
              view: viewOf(3, [cellWithPipes({ x: 1, y: 1 }, new Set(['W']))]),
            } as NetworkPayload);
      const repaired = rehydrateEnvelopeViews(fromWireText(toWireText(kind, base)));
      const payload = repaired.payload as unknown as {
        view: { visibleCells: Array<{ pipes: unknown }> };
      };
      const [first] = payload.view.visibleCells;
      expect(first).toBeDefined();
      const pipes = first?.pipes;
      expect(pipes).toBeInstanceOf(Set);
      expect((pipes as Set<string>).has('W')).toBe(true);
    }
  });

  test('non-view envelopes pass through by reference untouched', () => {
    const pong = fromWireText(
      toWireText('pong', { clientTimeMs: 1, serverTimeMs: 2 } as NetworkPayload),
    );
    expect(rehydrateEnvelopeViews(pong)).toBe(pong);

    const orderAck = fromWireText(
      toWireText('orderAck', { seq: 4, result: { ok: true } } as NetworkPayload),
    );
    expect(rehydrateEnvelopeViews(orderAck)).toBe(orderAck);
  });

  test('in-memory views (demo path: real Sets) pass through by reference', () => {
    // FakeMatchClient-style envelopes already carry real Sets; the
    // helper must not copy or disturb them.
    const inMemory = {
      type: 'tick',
      version: NETWORK_API_VERSION,
      seq: 99 as SequenceNumber,
      payload: {
        tick: 1,
        view: viewOf(1, [cellWithPipes({ x: 0, y: 0 }, new Set(['S']))]),
      },
    } as unknown as ProtocolEnvelope<NetworkPayload>;
    expect(rehydrateEnvelopeViews(inMemory)).toBe(inMemory);
  });

  test('rehydration is idempotent (already-repaired envelopes are stable)', () => {
    const once = rehydrateEnvelopeViews(
      fromWireText(
        toWireText('tick', {
          tick: 9,
          view: viewOf(9, [cellWithPipes({ x: 2, y: 2 }, new Set(['E']))]),
        } as NetworkPayload),
      ),
    );
    const twice = rehydrateEnvelopeViews(once);
    expect(twice).toBe(once);
    const payload = once.payload as unknown as {
      view: { visibleCells: Array<{ pipes: unknown }> };
    };
    expect(payload.view.visibleCells[0]?.pipes).toBeInstanceOf(Set);
  });
});
