/**
 * Unit tests for the composition seams — feature 010 remediation
 * R-005 seam (c): `subscribeStatus` (FR-012 status-bus access) and
 * `getMatch` (authoritative store lookup), plus the documented T-008
 * production recipe end-to-end (`createLobbyPublication` composed over
 * BOTH seams).
 *
 * Determinism: injected sequential ids + fixed clock. Auto-start generates
 * the shipped default board (the only size terrain reliably generates
 * for matchmaking matches) with the engine's seeded RNG.
 */

import { describe, expect, it } from 'vitest';

import type { MatchId } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createLobbyPublication } from '../../src/internal/lobbyPublication';
import type { MatchmakerCompositionSeam } from '../../src/matchmaker';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

let clockMs = 3_000_000;
let seq = 0;
function fakeRandomId(): string {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
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

/** Create + fill a public 2p match to `running`; returns its handles. */
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
    return { matchId: created.data.matchId, aliceToken: created.data.seatAssignment.sessionToken };
}

// ----------------------------------------------------------------------------
// subscribeStatus
// ----------------------------------------------------------------------------

describe('subscribeStatus — FR-012 transition access', () => {
    it('delivers every lifecycle transition in order', () => {
        const h = makeHarness();
        const transitions: string[] = [];
        h.seam.subscribeStatus((event) => transitions.push(`${String(event.from)}→${String(event.to)}`));

        const { matchId } = startTwo(h); // null→filling, filling→running

        h.server.fireOnMatchTerminal({
            matchId,
            result: { kind: 'win', winner: 1, tick: 42, reason: 'last_standing' },
            tick: 42,
        }); // running→finished

        clockMs += MATCHMAKING_CONSTANTS.resultsTtlMs + 1;
        h.matchmaker.listPublicMatches(); // read path drives the results-TTL sweep → finished→collected

        expect(transitions).toEqual(['null→filling', 'filling→running', 'running→finished', 'finished→collected']);
        h.matchmaker.close();
    });

    it('unsubscribe stops delivery; subscribeStatus throws after close', () => {
        const h = makeHarness();
        const events: unknown[] = [];
        const unsubscribe = h.seam.subscribeStatus((event) => events.push(event));
        unsubscribe();
        unsubscribe(); // idempotent

        h.matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        expect(events).toEqual([]);

        h.matchmaker.close();
        expect(() => h.seam.subscribeStatus(() => {})).toThrow(/closed/);
    });

    it('captures leave-triggered collections (filling → collected on final release)', () => {
        const h = makeHarness();
        const transitions: string[] = [];
        h.seam.subscribeStatus((event) => transitions.push(String(event.to)));

        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
        });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        clockMs += 1_000;
        expect(
            h.matchmaker.leaveMatch({
                matchId: created.data.matchId,
                sessionToken: created.data.seatAssignment.sessionToken,
            }).ok,
        ).toBe(true);

        expect(transitions).toEqual(['filling', 'collected']);
        h.matchmaker.close();
    });
});

// ----------------------------------------------------------------------------
// getMatch
// ----------------------------------------------------------------------------

describe('getMatch — authoritative store lookup', () => {
    it('returns the live record (status transitions visible through the same reference)', () => {
        const h = makeHarness();
        const { matchId } = startTwo(h);

        expect(h.seam.getMatch(matchId)?.status).toBe('running');
        expect(h.seam.getMatch(matchId)?.seats.size).toBe(2);
        h.matchmaker.close();
    });

    it('returns undefined for an unknown id and after close', () => {
        const h = makeHarness();
        const { matchId } = startTwo(h);

        expect(h.seam.getMatch('00000000-0000-4000-8000-999999999999' as MatchId)).toBeUndefined();

        h.matchmaker.close();
        // Store emptied by close(): quiet undefined, not a throw — composed
        // projections prune during teardown instead of crashing.
        expect(h.seam.getMatch(matchId)).toBeUndefined();
    });
});

// ----------------------------------------------------------------------------
// The documented T-008 production recipe, end-to-end
// ----------------------------------------------------------------------------

describe('composition recipe — lobbyPublication over both seams', () => {
    it('publication revisions advance as matches are created, started, and collected', () => {
        const h = makeHarness();

        // The exact wiring recipe from MatchmakerCompositionSeam's JSDoc:
        const publication = createLobbyPublication({ getMatch: (id) => h.seam.getMatch(id) });
        h.seam.subscribeStatus(publication.onStatusChanged);

        const received: number[] = [];
        publication.subscribe((event) => {
            if (event.kind === 'snapshot') {
                received.push(event.snapshot.revision);
            }
        });

        // Create → first visible change (revision 1).
        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
        });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        expect(publication.currentRevision()).toBe(1);

        // Fill/start: ONE status event (`filling → running`) — occupancy
        // deltas ride the BRIDGE listener seam, not the bus — so the
        // rebuild publishes exactly one more revision with the row
        // flipped to `in_progress`.
        expect(h.matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' }).ok).toBe(true);
        expect(publication.currentRevision()).toBe(2);
        expect(publication.snapshotFor(null).entries[0]?.status).toBe('in_progress');

        // Terminal strips the row (FR-014 no history) → revision 3.
        h.server.fireOnMatchTerminal({
            matchId: created.data.matchId,
            result: { kind: 'win', winner: 1, tick: 7, reason: 'last_standing' },
            tick: 7,
        });
        expect(publication.currentRevision()).toBe(3);

        // The collection sweep changes nothing visible (row already gone)
        // → NO bump (exactly-once revisions, per the publication contract).
        clockMs += MATCHMAKING_CONSTANTS.resultsTtlMs + 1;
        h.matchmaker.listPublicMatches();
        expect(publication.currentRevision()).toBe(3);

        const snapshot = publication.snapshotFor(null);
        expect(snapshot.entries).toHaveLength(0);
        expect(received.every((revision, index) => revision === index + 1)).toBe(true);
        h.matchmaker.close();
    });
});
