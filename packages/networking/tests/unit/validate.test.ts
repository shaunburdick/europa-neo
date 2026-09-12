/**
 * Envelope Validation Smoke Tests — Feature 004 (Phase 2)
 *
 * Exercises the schema guard across all twenty message kinds (the
 * twelve gameplay kinds plus feature 010's additive lobby family —
 * happy path), the per-kind required-field rejections, and the
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
    order: { order: { kind: 'surrender', player: 'Player000001' } },
    ping: { clientTimeMs: 0 },
    // Feature 010 lobby family (additive; shapes per contracts/network-types.ts).
    lobbyIdentity: {},
    lobbySetHandle: { handle: 'Nova', actionId: 1 },
    lobbySubscribe: { actionId: 2 },
    lobbyCreate: { actionId: 3 },
    lobbyJoin: { actionId: 4, matchId: 'match-1' },
    lobbySpectate: { actionId: 5, matchId: 'match-1' },
    lobbyLeave: { actionId: 6 },
    helloAck: {
        protocolVersion: NETWORK_API_VERSION,
        connectionId: 'conn-1',
        heartbeatIntervalMs: 5000,
    },
    joinAck: {
        sessionToken: 'token-1',
        playerId: 'Player000001',
        view: { visibleCells: [] },
        tick: 0,
        players: [],
    },
    snapshot: { tick: 7, view: { visibleCells: [] } },
    tick: { tick: 1, view: { visibleCells: [] } },
    orderAck: { seq: 3, result: { ok: true } },
    terminal: { result: { kind: 'draw', tick: 10, reason: 'mutual_elimination' } },
    pong: { clientTimeMs: 5, serverTimeMs: 6 },
    error: { code: 'client_rate_limited', message: 'slow down' },
    lobbyEvent: { event: { kind: 'identity', identity: { handle: null, hasIdentity: true } } },
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
        expect(() => validateEnvelope({ ...base, payload: [1] })).toThrow(/payload must be a JSON object/);
        expect(() => validateEnvelope({ ...base, payload: null })).toThrow(/payload must be a JSON object/);
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
        // Feature 010 lobby family (lobbyIdentity declares no required
        // fields — its only field is optional — so it has no case here).
        ['lobbySetHandle', 'handle'],
        ['lobbySubscribe', 'actionId'],
        ['lobbyCreate', 'actionId'],
        ['lobbyJoin', 'matchId'],
        ['lobbySpectate', 'matchId'],
        ['lobbyLeave', 'actionId'],
        ['helloAck', 'heartbeatIntervalMs'],
        ['joinAck', 'sessionToken'],
        ['snapshot', 'tick'],
        ['tick', 'view'],
        ['orderAck', 'result'],
        ['terminal', 'result'],
        ['pong', 'serverTimeMs'],
        ['error', 'code'],
        ['lobbyEvent', 'event'],
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

    it('rejects a numeric playerId on joinAck before domain interpretation', () => {
        const numericJoinAck = {
            type: 'joinAck',
            version: NETWORK_API_VERSION,
            seq: 1,
            payload: { ...VALID_PAYLOADS.joinAck, playerId: 1 },
        };
        expect(() => validateEnvelope(numericJoinAck)).toThrow(/canonical PlayerId/);
    });

    it('rejects a numeric lobby identity claim but accepts a canonical one', () => {
        const numericClaim = {
            type: 'lobbyIdentity',
            version: NETWORK_API_VERSION,
            seq: 1,
            payload: { claim: { guestPlayerId: 2 } },
        };
        expect(() => validateEnvelope(numericClaim)).toThrow(/canonical GuestPlayerId/);

        const canonicalClaim = {
            type: 'lobbyIdentity',
            version: NETWORK_API_VERSION,
            seq: 1,
            payload: { claim: { guestPlayerId: 'Player000002', handle: 'Nova' } },
        };
        expect(() => validateEnvelope(canonicalClaim)).not.toThrow();
    });

    it('rejects a non-object lobby identity claim', () => {
        const badClaim = {
            type: 'lobbyIdentity',
            version: NETWORK_API_VERSION,
            seq: 1,
            payload: { claim: 'not-an-object' },
        };
        expect(() => validateEnvelope(badClaim)).toThrow(/payload\.claim must be an object/);
    });

    it('rejects a null lobby identity claim guestPlayerId', () => {
        // issue #74 FR-021: the advisory claim is either ABSENT or a
        // canonical identity string. `null` is neither — reject it at the
        // wire boundary rather than letting it reach identity resolution.
        const nullClaim = {
            type: 'lobbyIdentity',
            version: NETWORK_API_VERSION,
            seq: 1,
            payload: { claim: { guestPlayerId: null } },
        };
        expect(() => validateEnvelope(nullClaim)).toThrow(/canonical GuestPlayerId/);
    });

    it('rejects a non-string lobby identity claim handle', () => {
        const badHandle = {
            type: 'lobbyIdentity',
            version: NETWORK_API_VERSION,
            seq: 1,
            payload: { claim: { handle: 7 } },
        };
        expect(() => validateEnvelope(badHandle)).toThrow(/claim\.handle must be a string/);
    });
});

describe('validateVersion', () => {
    it('accepts an exact match', () => {
        expect(validateVersion(NETWORK_API_VERSION)).toEqual({ ok: true });
    });

    it('accepts patch drift within the same 0.x boundary (FR-004 graceful)', () => {
        // Pre-1.0 semver: the MINOR component is the compatibility line,
        // so 0.3.x variants interoperate (spec T047: "0.3.5" accepted).
        expect(validateVersion('0.3.5')).toEqual({ ok: true });
        expect(validateVersion('0.3.99')).toEqual({ ok: true });
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
        // "0.2.0" is MAJOR drift from "0.3.0" per the spec's own examples:
        // pre-1.0 minors are the breaking boundary.
        expect(validateVersion('0.2.0').ok).toBe(false);
        expect(validateVersion('0.2.5').ok).toBe(false);
        expect(validateVersion('0.99.99').ok).toBe(false);
    });

    it('treats unparseable versions as mismatches, not crashes', () => {
        expect(validateVersion('').ok).toBe(false);
        expect(validateVersion('garbage').ok).toBe(false);
    });

    it('rejects a non-string version without throwing (defensive runtime guard)', () => {
        // The signature is `string`, but the version is read from decoded
        // remote JSON. Double-assert only to reach this runtime branch — no
        // `any` and no suppressions.
        const nonString = 42 as unknown as string;
        const result = validateVersion(nonString);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('version_mismatch');
            expect(result.error.detail).toEqual({ expected: NETWORK_API_VERSION, received: '42' });
        }
    });
});
