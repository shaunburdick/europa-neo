/**
 * Inbound frame validation unit tests — 005 FR-032 (issue #152).
 *
 * The wire codec validates envelope + top-level payload fields; this
 * suite pins the console's SECOND gate: the nested `lobbyEvent`
 * variant set the codec structurally cannot see, plus the consumed
 * fields of every kind the console dispatches, plus the
 * field-forward-compatibility rule (unknown additive kinds and fields
 * are accepted, never rejected).
 */

import { describe, expect, it } from 'vitest';

import { inboundFrameDiagnostic } from '../../../src/net/inbound-validation';

/** Build an envelope of a given kind with a loose payload. */
function envelope(type: string, payload: unknown): Record<string, unknown> {
    return { type, version: '0.3.0', seq: 1, payload };
}

describe('inboundFrameDiagnostic — envelope structure', () => {
    it('accepts a well-formed envelope of every server→client kind', () => {
        const valid: ReadonlyArray<readonly [string, unknown]> = [
            ['helloAck', { connectionId: 'c-1', heartbeatIntervalMs: 5_000 }],
            [
                'joinAck',
                {
                    sessionToken: 'tok',
                    playerId: 'TestPlayer01',
                    view: { tick: 3, visibleCells: [] },
                    tick: 3,
                    players: [],
                },
            ],
            ['snapshot', { tick: 3, view: { tick: 3, visibleCells: [] } }],
            ['tick', { tick: 4, view: { tick: 4, visibleCells: [] } }],
            ['orderAck', { seq: 7, result: { ok: true } }],
            ['terminal', { result: { winner: 'TestPlayer01' } }],
            ['pong', { clientTimeMs: 1, serverTimeMs: 2 }],
            ['error', { code: 'match_full', message: 'full' }],
            ['lobbyEvent', { event: { kind: 'identity', identity: { handle: 'Nova', hasIdentity: true } } }],
        ];
        for (const [type, payload] of valid) {
            expect(inboundFrameDiagnostic(envelope(type, payload)), `${type} should validate`).toBeNull();
        }
    });

    it('rejects non-objects, missing discriminators, and non-object payloads', () => {
        expect(inboundFrameDiagnostic('nope')).toMatch(/not an object/);
        expect(inboundFrameDiagnostic(null)).toMatch(/not an object/);
        expect(inboundFrameDiagnostic({ version: '1', seq: 1, payload: {} })).toMatch(/type is not a string/);
        expect(inboundFrameDiagnostic({ type: 'tick', version: '1', payload: {} })).toMatch(/seq is not a number/);
        expect(inboundFrameDiagnostic({ type: 'tick', version: '1', seq: 1, payload: null })).toMatch(
            /payload of "tick" is not an object/,
        );
        expect(inboundFrameDiagnostic({ type: 'tick', version: '1', seq: 1, payload: [] })).toMatch(
            /payload of "tick" is not an object/,
        );
    });

    it('names the offending top-level field of a consumed kind', () => {
        expect(inboundFrameDiagnostic(envelope('helloAck', { connectionId: 7, heartbeatIntervalMs: 1 }))).toMatch(
            /connectionId is not a string/,
        );
        expect(inboundFrameDiagnostic(envelope('joinAck', { sessionToken: 42, view: {}, players: [] }))).toMatch(
            /sessionToken is not a string/,
        );
        expect(inboundFrameDiagnostic(envelope('tick', { tick: 'four', view: {} }))).toMatch(/tick is not a number/);
        expect(inboundFrameDiagnostic(envelope('tick', { tick: 4, view: null }))).toMatch(/view is not an object/);
    });
});

describe('inboundFrameDiagnostic — nested lobbyEvent variants (the codec blind spot)', () => {
    it('rejects an event body that is not an object', () => {
        expect(inboundFrameDiagnostic(envelope('lobbyEvent', { event: null }))).toMatch(/event is not an object/);
        expect(inboundFrameDiagnostic(envelope('lobbyEvent', { event: 'identity' }))).toMatch(/event is not an object/);
        expect(inboundFrameDiagnostic(envelope('lobbyEvent', {}))).toMatch(/event is not an object/);
    });

    it('rejects a malformed identity payload', () => {
        expect(inboundFrameDiagnostic(envelope('lobbyEvent', { event: { kind: 'identity', identity: null } }))).toMatch(
            /identity is not an object/,
        );
        expect(
            inboundFrameDiagnostic(envelope('lobbyEvent', { event: { kind: 'identity', identity: { handle: 42 } } })),
        ).toMatch(/handle is neither a string nor null/);
        expect(inboundFrameDiagnostic(envelope('lobbyEvent', { event: { kind: 'identity', identity: {} } }))).toMatch(
            /handle is missing/,
        );
    });

    it('rejects malformed actionAccepted / error / snapshot / roster payloads', () => {
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', { event: { kind: 'actionAccepted', transition: 'waiting' } }),
            ),
        ).toMatch(/actionId is missing/);
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', {
                    event: { kind: 'actionAccepted', actionId: 1, transition: 'waiting', seatSessionToken: 42 },
                }),
            ),
        ).toMatch(/seatSessionToken is not a string/);
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', { event: { kind: 'error', code: 'internal_error', actionId: 'x' } }),
            ),
        ).toMatch(/message is missing/);
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', {
                    event: { kind: 'error', code: 'internal_error', message: 'boom', actionId: 'x' },
                }),
            ),
        ).toMatch(/actionId is not a number/);
        expect(
            inboundFrameDiagnostic(envelope('lobbyEvent', { event: { kind: 'snapshot', snapshot: { revision: 1 } } })),
        ).toMatch(/entries is missing/);
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', { event: { kind: 'roster', roster: { revision: 'one', players: [] } } }),
            ),
        ).toMatch(/revision is not a number/);
        expect(
            inboundFrameDiagnostic(envelope('lobbyEvent', { event: { kind: 'rosterDelta', delta: { revision: 2 } } })),
        ).toMatch(/changes is missing/);
    });
});

describe('inboundFrameDiagnostic — field-forward compatibility (Gate 3 Decision 6)', () => {
    it('accepts a known variant carrying an unknown additive field', () => {
        // The W3 resume secret rides the W2-era validator untouched: the
        // validator checks the fields it knows and ignores the rest.
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', {
                    event: {
                        kind: 'identity',
                        identity: {
                            handle: 'Nova',
                            hasIdentity: true,
                            guestPlayerId: 'Guest0000001',
                            resumeSecret: 'rotating-value-from-a-later-wave',
                        },
                    },
                }),
            ),
        ).toBeNull();
    });

    it('accepts unknown additive event variants and envelope kinds', () => {
        expect(
            inboundFrameDiagnostic(envelope('lobbyEvent', { event: { kind: 'futureEvent', payload: 'whatever' } })),
        ).toBeNull();
        expect(inboundFrameDiagnostic(envelope('futureKind', { anything: true }))).toBeNull();
    });

    it('accepts known variants whose optional fields are absent', () => {
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', { event: { kind: 'actionAccepted', actionId: 3, transition: 'match' } }),
            ),
        ).toBeNull();
        expect(
            inboundFrameDiagnostic(
                envelope('lobbyEvent', { event: { kind: 'error', code: 'match_full', message: 'full' } }),
            ),
        ).toBeNull();
        expect(
            inboundFrameDiagnostic(envelope('joinAck', { sessionToken: 't', playerId: null, view: {}, players: [] })),
        ).toBeNull();
    });
});
