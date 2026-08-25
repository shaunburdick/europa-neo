/**
 * helloAck `appVersion` tolerance — feature 009 (T-005, spec Edge
 * Cases: "an old server (pre-appVersion) … the client MUST tolerate a
 * missing appVersion in the hello acknowledgment").
 *
 * Pins the console's net→store path for BOTH handshake generations:
 *   - a helloAck WITHOUT `appVersion` (pre-feature-009 server) derives
 *     a clean NetEvent and flows through the store with no crash and
 *     no state change whatsoever — there is no version-related state
 *     to get wrong;
 *   - a helloAck WITH `appVersion` (feature-009 server) is tolerated
 *     but never propagated into UI events or state (plan AD-5: the HUD
 *     renders its OWN bundled constant, so a server-reported version
 *     can never produce a stale-tab mismatch on screen).
 *
 * Pure node-side suite (vitest.config.ts, happy-dom not required).
 */

import { describe, expect, it } from 'vitest';

import { netEventFromEnvelope } from '../../../src/net/envelope-to-event';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import { createConsoleStore } from '../../../src/state/store';
import type { NetworkPayload, ProtocolEnvelope, SequenceNumber } from '../../../src/state/types';

/** Build an envelope of a given kind with a loose payload (net.test.ts shape). */
function envelope(type: string, payload: Record<string, unknown>): ProtocolEnvelope<NetworkPayload> {
    return {
        type,
        version: '',
        seq: 1 as SequenceNumber,
        payload,
    } as unknown as ProtocolEnvelope<NetworkPayload>;
}

const CTX = {
    seqToActionId: new Map<SequenceNumber, number>(),
    connectedAtMs: 1000,
    lastAppliedTick: 0,
};

describe('helloAck appVersion tolerance (feature 009 T-005)', () => {
    it('derives a clean NetEvent from a helloAck WITHOUT appVersion (old server)', () => {
        const event = netEventFromEnvelope(
            envelope('helloAck', { protocolVersion: '0.1.0', connectionId: 'c-old', heartbeatIntervalMs: 4000 }),
            CTX,
        );
        // Exact deep-equal: no version-related key may appear anywhere in
        // the derived event.
        expect(event).toEqual({ kind: 'helloAck', connectionId: 'c-old', heartbeatIntervalMs: 4000 });
        expect(event).not.toHaveProperty('appVersion');
    });

    it('ignores appVersion when present (new server) — never propagated into UI events', () => {
        const event = netEventFromEnvelope(
            envelope('helloAck', {
                protocolVersion: '0.1.0',
                connectionId: 'c-new',
                heartbeatIntervalMs: 4000,
                appVersion: '9.9.9-not-a-real-release',
            }),
            CTX,
        );
        expect(event).toEqual({ kind: 'helloAck', connectionId: 'c-new', heartbeatIntervalMs: 4000 });
        expect(event).not.toHaveProperty('appVersion');
    });

    it('flows through the store without crash, state change, or version-related state', () => {
        const store = createConsoleStore(INITIAL_CONSOLE_STATE);
        const before = store.getState();

        const event = netEventFromEnvelope(
            envelope('helloAck', { connectionId: 'c-old', heartbeatIntervalMs: 4000 }),
            CTX,
        );
        expect(event).not.toBeNull();
        // Must not throw (old-server shape through the live dispatch path).
        store.dispatch(event);

        // The reducer's helloAck branch is a pure passthrough: no field of
        // ConsoleState moved — which by construction includes any
        // version-related state (the console keeps none).
        expect(store.getState()).toEqual(before);
    });
});
