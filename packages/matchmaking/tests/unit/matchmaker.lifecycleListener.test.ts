/**
 * Unit tests for `registerLifecycleListener` — feature 010 remediation
 * R-005 seam (b).
 *
 * Pins the runtime twin of `FakeMatchmakerBridge`: the REAL matchmaker
 * fans every networking bridge trigger it processes out to registered
 * listeners, AFTER its own policy has been applied, in registration
 * order, with no error isolation (house event-bus convention). Also
 * pins the no-synthesis ruling: internally decided actions (a
 * voluntary `leaveMatch` forfeit) do NOT fabricate bridge events —
 * their status consequences travel on the `subscribeStatus` bus.
 *
 * Determinism: injected sequential ids + fixed clock. Auto-start generates
 * the shipped default board (the only size terrain reliably generates
 * for matchmaking matches) with the engine's seeded RNG.
 */

import type { MatchmakerBridge } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import type { MatchmakerCompositionSeam } from '../../src/matchmaker';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

let clockMs = 2_000_000;
let seq = 0;
function fakeRandomId(): string {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/** A recording listener: every delivered handler + payload, in order. */
interface Delivery {
    readonly handler: string;
    readonly payload: unknown;
}

function recordingListener(log: Delivery[]): MatchmakerBridge {
    return {
        onSeatClaimed: (event) => log.push({ handler: 'onSeatClaimed', payload: event }),
        onSeatDisconnected: (event) => log.push({ handler: 'onSeatDisconnected', payload: event }),
        onSeatReconnected: (event) => log.push({ handler: 'onSeatReconnected', payload: event }),
        onSeatExpired: (event) => log.push({ handler: 'onSeatExpired', payload: event }),
        onMatchTerminal: (event) => log.push({ handler: 'onMatchTerminal', payload: event }),
    };
}

function makeHarness() {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, {
        server,
        randomId: fakeRandomId,
        now: () => clockMs,
    });
    const seam = matchmaker as Matchmaker & MatchmakerCompositionSeam;
    return { server, matchmaker, seam };
}

/** Started public 2p match handles. */
function startTwo(h: ReturnType<typeof makeHarness>) {
    const created = h.matchmaker.createMatch({
        visibility: 'public',
        displayName: 'Alice',
    });
    if (!created.ok) {
        throw new Error('fixture create failed');
    }
    const joined = h.matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
    if (!joined.ok) {
        throw new Error('fixture join failed');
    }
    return {
        matchId: created.data.matchId,
        aliceToken: created.data.seatAssignment.sessionToken,
        bobToken: joined.data.seatAssignment.sessionToken,
    };
}

// ----------------------------------------------------------------------------
// Fan-out per trigger
// ----------------------------------------------------------------------------

describe('registerLifecycleListener — fan-out of every bridge trigger', () => {
    it('replays seatClaimed / seatDisconnected / seatReconnected verbatim', () => {
        const h = makeHarness();
        const log: Delivery[] = [];
        h.seam.registerLifecycleListener(recordingListener(log));

        const { matchId, aliceToken } = startTwo(h);
        const connectionId = 'conn-0001';

        h.server.fireOnSeatClaimed({
            matchId,
            connectionId,
            sessionToken: aliceToken,
            playerId: 1,
            role: 'player',
        });
        h.server.fireOnSeatDisconnected({ matchId, connectionId, sessionToken: aliceToken });
        h.server.fireOnSeatReconnected({ matchId, connectionId, sessionToken: aliceToken });

        expect(log.map((entry) => entry.handler)).toEqual(['onSeatClaimed', 'onSeatDisconnected', 'onSeatReconnected']);
        // Verbatim payloads (no reshaping between networking and listeners).
        expect(log[0]?.payload).toEqual({
            matchId,
            connectionId,
            sessionToken: aliceToken,
            playerId: 1,
            role: 'player',
        });
        h.matchmaker.close();
    });

    it('delivers onSeatExpired only after the forfeit policy resolved (post-state visible)', () => {
        const h = makeHarness();
        const { matchId, bobToken } = startTwo(h);

        let worldStateAtDelivery: string | null = null;
        h.seam.registerLifecycleListener({
            onSeatExpired: () => {
                // The listener runs AFTER handleSeatExpired: the engine has
                // already eliminated the expired player.
                worldStateAtDelivery = h.server.lastEngineSession?.world().players[1]?.status ?? null;
            },
        });

        h.server.fireOnSeatExpired({ matchId, sessionToken: bobToken, playerId: 2 });

        expect(worldStateAtDelivery).toBe('eliminated');
        h.matchmaker.close();
    });

    it('does not deliver onSeatExpired when the policy no-ops (unknown token)', () => {
        const h = makeHarness();
        const { matchId } = startTwo(h);
        const log: Delivery[] = [];
        h.seam.registerLifecycleListener(recordingListener(log));

        h.server.fireOnSeatExpired({
            matchId,
            sessionToken: '11111111-1111-4111-8111-111111111111',
            playerId: 2,
        });

        expect(log).toEqual([]);
        h.matchmaker.close();
    });

    it('delivers onMatchTerminal after running → finished has been applied', () => {
        const h = makeHarness();
        const { matchId } = startTwo(h);

        let statusAtDelivery: string | null = null;
        h.seam.registerLifecycleListener({
            onMatchTerminal: (event) => {
                statusAtDelivery = h.seam.getMatch(event.matchId)?.status ?? null;
            },
        });

        h.server.fireOnMatchTerminal({
            matchId,
            result: { kind: 'win', winner: 1, tick: 42, reason: 'last_standing' },
            tick: 42,
        });

        expect(statusAtDelivery).toBe('finished');
        h.matchmaker.close();
    });

    it('supports multiple listeners in registration order', () => {
        const h = makeHarness();
        const order: string[] = [];
        h.seam.registerLifecycleListener({ onSeatClaimed: () => order.push('first') });
        h.seam.registerLifecycleListener({ onSeatClaimed: () => order.push('second') });

        const { matchId, aliceToken } = startTwo(h);
        h.server.fireOnSeatClaimed({
            matchId,
            connectionId: 'conn-0001',
            sessionToken: aliceToken,
            playerId: 1,
            role: 'player',
        });

        expect(order).toEqual(['first', 'second']);
        h.matchmaker.close();
    });

    it('only delivers events that occur after registration', () => {
        const h = makeHarness();
        const { matchId, aliceToken } = startTwo(h);

        const log: Delivery[] = [];
        h.seam.registerLifecycleListener(recordingListener(log));
        expect(log).toEqual([]); // nothing fired yet

        h.server.fireOnSeatDisconnected({ matchId, connectionId: 'conn-0001', sessionToken: aliceToken });
        expect(log).toHaveLength(1);
        h.matchmaker.close();
    });

    it('does NOT synthesize bridge events for a voluntary leaveMatch forfeit', () => {
        const h = makeHarness();
        const log: Delivery[] = [];
        h.seam.registerLifecycleListener(recordingListener(log));

        const { matchId, bobToken } = startTwo(h);
        clockMs += 1_000;
        expect(h.matchmaker.leaveMatch({ matchId, sessionToken: bobToken }).ok).toBe(true);

        // The leave was decided INTERNALLY (no networking dispatch): the
        // listener sees no fabricated onSeatExpired. Its consequences
        // (running state, elimination) are observable via the record and,
        // for teardowns, via subscribeStatus — not via bridge replay.
        expect(log).toEqual([]);
        h.matchmaker.close();
    });
});
