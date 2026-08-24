/**
 * Envelope Validation Smoke Tests — Feature 004 (Phase 2)
 *
 * Exercises the schema guard across all twelve message kinds (happy
 * path), the per-kind required-field rejections, and the
 * `validateVersion` major/minor comparison rules (FR-003, FR-004).
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import type { MessageKind } from '../../src/types';
import { validateEnvelope, validateVersion } from '../../src/validate';

/** Minimal valid payload per message kind. */
const VALID_PAYLOADS: Readonly<Record<MessageKind, Record<string, unknown>>> = {
  hello: { protocolVersion: NETWORK_API_VERSION },
  joinMatch: { matchId: 'match-1', role: 'player', displayName: 'Player' },
  order: { order: { kind: 'surrender', player: 1 } },
  ping: { clientTimeMs: 0 },
  helloAck: {
    protocolVersion: NETWORK_API_VERSION,
    connectionId: 'conn-1',
    heartbeatIntervalMs: 5000,
  },
  joinAck: {
    sessionToken: 'token-1',
    playerId: 1,
    view: { visibleCells: [] },
    tick: 0,
    players: [],
  },
  snapshot: { tick: 7, view: { visibleCells: [] } },
  tick: { tick: 1, view: { visibleCells: [] } },
  orderAck: { seq: 3, result: { ok: true } },
  terminal: { result: { kind: 'draw', tick: 10, reason: 'mutual_elimination' } },
  pong: { clientTimeMs: 5, serverTimeMs: 6 },
  error: { code: 'rate_limited', message: 'slow down' },
};

function envelopeOf(type: MessageKind, seq = 1): unknown {
  return {
    type,
    version: NETWORK_API_VERSION,
    seq,
    payload: { ...VALID_PAYLOADS[type] },
  };
}

describe('validateEnvelope — happy path', () => {
  for (const kind of Object.keys(VALID_PAYLOADS) as MessageKind[]) {
    it(`accepts a minimal valid ${kind} envelope`, () => {
      const value: unknown = envelopeOf(kind);
      expect(() => validateEnvelope(value)).not.toThrow();
    });
  }
});

describe('validateEnvelope — envelope shape', () => {
  it('rejects non-object values', () => {
    expect(() => validateEnvelope(null)).toThrow(/JSON object/);
    expect(() => validateEnvelope(42)).toThrow(/JSON object/);
    expect(() => validateEnvelope('hello')).toThrow(/JSON object/);
    expect(() => validateEnvelope([envelopeOf('ping')])).toThrow(/JSON object/);
  });

  it('rejects unknown message kinds with the received value in detail', () => {
    try {
      validateEnvelope({ type: 'gossip', version: NETWORK_API_VERSION, seq: 1, payload: {} });
      throw new Error('should have thrown');
    } catch (error) {
      const err = error as { code?: string; detail?: Record<string, string> };
      expect(err.code).toBe('malformed_payload');
      expect(err.detail?.received).toBe('gossip');
    }
  });

  it('rejects missing or empty version strings', () => {
    const base = envelopeOf('ping') as Record<string, unknown>;
    expect(() => validateEnvelope({ ...base, version: undefined })).toThrow(/non-empty string/);
    expect(() => validateEnvelope({ ...base, version: '' })).toThrow(/non-empty string/);
    expect(() => validateEnvelope({ ...base, version: 7 })).toThrow(/non-empty string/);
  });

  it('rejects seq outside the uint32 positive-integer range', () => {
    const base = envelopeOf('ping') as Record<string, unknown>;
    expect(() => validateEnvelope({ ...base, seq: 0 })).toThrow(/uint32/);
    expect(() => validateEnvelope({ ...base, seq: -1 })).toThrow(/uint32/);
    expect(() => validateEnvelope({ ...base, seq: 1.5 })).toThrow(/uint32/);
    expect(() => validateEnvelope({ ...base, seq: 2 ** 32 })).toThrow(/uint32/);
    expect(() => validateEnvelope({ ...base, seq: Number.NaN })).toThrow(/uint32/);
    // Boundary acceptance: 1 and 2^32 - 1 are legal.
    expect(() => validateEnvelope({ ...base, seq: 1 })).not.toThrow();
    expect(() => validateEnvelope({ ...base, seq: 2 ** 32 - 1 })).not.toThrow();
  });

  it('rejects array and null payloads', () => {
    const base = envelopeOf('ping') as Record<string, unknown>;
    expect(() => validateEnvelope({ ...base, payload: [1] })).toThrow(
      /payload must be a JSON object/,
    );
    expect(() => validateEnvelope({ ...base, payload: null })).toThrow(
      /payload must be a JSON object/,
    );
  });

  it('ignores optional fields being absent (joinMatch without token)', () => {
    // VALID_PAYLOADS.joinMatch already omits reconnectToken/requestedSeat.
    expect(() => validateEnvelope(envelopeOf('joinMatch'))).not.toThrow();
  });
});

describe('validateEnvelope — per-kind required fields', () => {
  const cases: [MessageKind, string][] = [
    ['hello', 'protocolVersion'],
    ['joinMatch', 'displayName'],
    ['order', 'order'],
    ['ping', 'clientTimeMs'],
    ['helloAck', 'heartbeatIntervalMs'],
    ['joinAck', 'sessionToken'],
    ['snapshot', 'tick'],
    ['tick', 'view'],
    ['orderAck', 'result'],
    ['terminal', 'result'],
    ['pong', 'serverTimeMs'],
    ['error', 'code'],
  ];

  for (const [kind, fieldKey] of cases) {
    it(`rejects ${kind} when payload.${fieldKey} is missing`, () => {
      const payload = { ...VALID_PAYLOADS[kind] };
      delete payload[fieldKey];
      try {
        validateEnvelope({ type: kind, version: NETWORK_API_VERSION, seq: 1, payload });
        throw new Error(`should have thrown for ${kind}.${fieldKey}`);
      } catch (error) {
        const err = error as { code?: string; message?: string };
        expect(err.code).toBe('malformed_payload');
        expect(err.message).toContain(fieldKey);
      }
    });
  }

  it('rejects wrong primitive types per field spec', () => {
    const badHello = {
      type: 'hello',
      version: NETWORK_API_VERSION,
      seq: 1,
      payload: { protocolVersion: 9 },
    };
    expect(() => validateEnvelope(badHello)).toThrow(/must be a string/);

    const badPing = {
      type: 'ping',
      version: NETWORK_API_VERSION,
      seq: 1,
      payload: { clientTimeMs: 'soon' },
    };
    expect(() => validateEnvelope(badPing)).toThrow(/must be a number/);

    const badTick = {
      type: 'tick',
      version: NETWORK_API_VERSION,
      seq: 1,
      payload: { tick: 1, view: [] },
    };
    expect(() => validateEnvelope(badTick)).toThrow(/must be an object/);

    const badJoinAck = {
      type: 'joinAck',
      version: NETWORK_API_VERSION,
      seq: 1,
      payload: { ...VALID_PAYLOADS.joinAck, players: 'nobody' },
    };
    expect(() => validateEnvelope(badJoinAck)).toThrow(/must be an array/);
  });

  it('allows nullable playerId on joinAck (spectator seats)', () => {
    const spectatorJoin = {
      type: 'joinAck',
      version: NETWORK_API_VERSION,
      seq: 1,
      payload: { ...VALID_PAYLOADS.joinAck, playerId: null },
    };
    expect(() => validateEnvelope(spectatorJoin)).not.toThrow();
  });
});

describe('validateVersion', () => {
  it('accepts an exact match', () => {
    expect(validateVersion(NETWORK_API_VERSION)).toEqual({ ok: true });
  });

  it('accepts patch drift within the same 0.x boundary (FR-004 graceful)', () => {
    // Pre-1.0 semver: the MINOR component is the compatibility line,
    // so 0.1.x variants interoperate (spec T047: "0.1.5" accepted).
    expect(validateVersion('0.1.5')).toEqual({ ok: true });
    expect(validateVersion('0.1.99')).toEqual({ ok: true });
  });

  it('rejects major drift with a version_mismatch NetworkError', () => {
    const result = validateVersion('1.0.0');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('version_mismatch');
      expect(result.error.detail).toEqual({
        expected: NETWORK_API_VERSION,
        received: '1.0.0',
      });
    }
  });

  it('rejects cross-minor 0.x drift as a breaking boundary (FR-004, spec T021/T047)', () => {
    // "0.2.0" is MAJOR drift from "0.1.0" per the spec's own examples:
    // pre-1.0 minors are the breaking boundary.
    expect(validateVersion('0.2.0').ok).toBe(false);
    expect(validateVersion('0.99.99').ok).toBe(false);
  });

  it('treats unparseable versions as mismatches, not crashes', () => {
    expect(validateVersion('').ok).toBe(false);
    expect(validateVersion('garbage').ok).toBe(false);
  });
});
