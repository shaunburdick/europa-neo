/**
 * Frame Encode/Decode Smoke Tests — Feature 004 (Phase 2)
 *
 * Covers round-trip fidelity, the malformed-payload rejection paths,
 * and the non-throwing `tryDecodeFrame` variant.
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { decodeFrame, encodeFrame, tryDecodeFrame } from '../../src/frame';
import type { NetworkPayload, ProtocolEnvelope } from '../../src/types';

function helloEnvelope(seq = 1): ProtocolEnvelope<NetworkPayload> {
  return {
    type: 'hello',
    version: NETWORK_API_VERSION,
    seq: seq as ProtocolEnvelope<NetworkPayload>['seq'],
    payload: { protocolVersion: NETWORK_API_VERSION },
  };
}

describe('encodeFrame', () => {
  it('produces deterministic JSON with contract field order', () => {
    const a = encodeFrame(helloEnvelope(1));
    const b = encodeFrame(helloEnvelope(1));
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual({
      type: 'hello',
      version: NETWORK_API_VERSION,
      seq: 1,
      payload: { protocolVersion: NETWORK_API_VERSION },
    });
  });

  it('serializes Set values as sorted arrays (CellView.pipes wire form)', () => {
    // Plain JSON.stringify flattens Sets to `{}`; the wire replacer
    // must preserve the data as a sorted, deterministic array.
    const envelope: ProtocolEnvelope<NetworkPayload> = {
      type: 'ping',
      version: NETWORK_API_VERSION,
      seq: 1 as ProtocolEnvelope<NetworkPayload>['seq'],
      payload: { clientTimeMs: 0 },
    };
    const carrier = {
      ...envelope,
      payload: new Set(['right', 'up', 'down']),
    };
    const text = encodeFrame(carrier as unknown as ProtocolEnvelope<NetworkPayload>);
    expect(JSON.parse(text).payload).toEqual(['down', 'right', 'up']);
  });
});

describe('decodeFrame', () => {
  it('round-trips an encoded envelope byte-for-byte', () => {
    const original = helloEnvelope(7);
    const decoded = decodeFrame(encodeFrame(original));
    expect(decoded).toEqual(original);
    expect(decoded.type).toBe('hello');
    expect(decoded.seq).toBe(7);
  });

  it('throws malformed_payload on invalid JSON', () => {
    try {
      decodeFrame('{not json');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('malformed_payload');
    }
  });

  it('throws malformed_payload on schema violations', () => {
    // Unknown message kind
    expect(() => decodeFrame('{"type":"nope","version":"0.1.0","seq":1,"payload":{}}')).toThrow(
      /known MessageKind/,
    );
    // Missing payload
    expect(() => decodeFrame(`{"type":"ping","version":"${NETWORK_API_VERSION}","seq":1}`)).toThrow(
      /payload must be a JSON object/,
    );
    // seq out of range
    expect(() =>
      decodeFrame(
        `{"type":"ping","version":"${NETWORK_API_VERSION}","seq":0,"payload":{"clientTimeMs":1}}`,
      ),
    ).toThrow(/uint32/);
  });

  it('rejects non-object JSON documents', () => {
    expect(() => decodeFrame('"just a string"')).toThrow(/JSON object/);
    expect(() => decodeFrame('42')).toThrow(/JSON object/);
    expect(() => decodeFrame('null')).toThrow(/JSON object/);
    expect(() => decodeFrame('[1,2]')).toThrow(/JSON object/);
  });
});

describe('tryDecodeFrame', () => {
  it('returns ok for valid frames', () => {
    const result = tryDecodeFrame(encodeFrame(helloEnvelope()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.type).toBe('hello');
    }
  });

  it('returns a NetworkError for invalid JSON without throwing', () => {
    const result = tryDecodeFrame('nope{');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('malformed_payload');
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it('returns a NetworkError for schema violations', () => {
    const result = tryDecodeFrame('{"type":"nope","version":"0.1.0","seq":1,"payload":{}}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('malformed_payload');
    }
  });
});
