/**
 * Unit tests for the auto-start display-name registration — feature 010
 * remediation R-013 (FR-020/SC-008): the matchmaker's atomic auto-start
 * hands networking each seat's authoritative label via the additive
 * optional `RegisterMatchRequest.displayNames` field so joinAck rosters
 * carry accepted handles instead of engine `"Player N"` placeholders.
 *
 * Pins:
 *   - accepted handles land on `registerMatchCalls[0].displayNames` in
 *     SEAT ORDER through the real create → join → auto-start path;
 *   - seats without a handle (legacy feature-006 flows) fall back to
 *     the cosmetic displayName — never null, never a placeholder;
 *   - mixed handle/no-handle matches overlay per seat;
 *   - the registration names are distinct from the engine world's
 *     placeholders (the engine world stays untouched).
 *
 * Determinism: injected sequential ids + fixed clock. Auto-start generates
 * the shipped default board (the only size terrain reliably generates
 * for matchmaking matches) with the engine's seeded RNG.
 */

import { describe, expect, it } from 'vitest';

import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import type { MatchmakerCompositionSeam } from '../../src/matchmaker';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

let clockMs = 5_000_000;
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

// ----------------------------------------------------------------------------
// Registration carries seat handles
// ----------------------------------------------------------------------------

describe('auto-start registers authoritative seat labels (FR-020/SC-008)', () => {
    it('accepted handles ride into registerMatch in seat order', () => {
        const h = makeHarness();

        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            acceptedHandle: 'Nova',
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const joined = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bobby',
            acceptedHandle: 'Orion',
        });
        expect(joined.ok).toBe(true);
        if (!joined.ok) {
            return;
        }

        // Auto-start ran; exactly one registration carrying BOTH handles
        // in seat order (creator = seat 0, joiner = seat 1).
        expect(h.server.registerMatchCalls).toHaveLength(1);
        expect(h.server.registerMatchCalls[0]?.displayNames).toEqual(['Nova', 'Orion']);
        h.matchmaker.close();
    });

    it('seats without a handle fall back to the cosmetic displayName', () => {
        const h = makeHarness();

        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'LegacyLarry',
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const joined = h.matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'PlainPam' });
        expect(joined.ok).toBe(true);

        // Legacy flow: no handles anywhere → cosmetic names, never nulls
        // and never engine placeholders.
        expect(h.server.registerMatchCalls[0]?.displayNames).toEqual(['LegacyLarry', 'PlainPam']);
        h.matchmaker.close();
    });

    it('mixed handle/no-handle seats overlay per seat', () => {
        const h = makeHarness();

        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            acceptedHandle: 'Nova',
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const joined = h.matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bobby' });
        expect(joined.ok).toBe(true);

        expect(h.server.registerMatchCalls[0]?.displayNames).toEqual(['Nova', 'Bobby']);
        h.matchmaker.close();
    });

    it('registration names stay OUT of the engine world (ASCII placeholders intact)', () => {
        const h = makeHarness();

        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            acceptedHandle: '城堡',
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const joined = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bobby',
            acceptedHandle: '⚔️Orion',
        });
        expect(joined.ok).toBe(true);

        // The wire-bound registration snapshot carries the Unicode
        // handles verbatim...
        expect(h.server.registerMatchCalls[0]?.displayNames).toEqual(['城堡', '⚔️Orion']);

        // ...while the engine world keeps its own ASCII-by-convention
        // placeholders — determinism fixtures stay untouched.
        const worldPlayers = h.server.lastEngineSession?.world().players;
        expect(worldPlayers?.map((player) => player.displayName)).toEqual(['Player 1', 'Player 2']);
        h.matchmaker.close();
    });

    it('seat order follows occupancy, not claim sequence (3p release + refill)', () => {
        const h = makeHarness();

        // A 3p match lets the middle seat change hands before auto-start.
        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            acceptedHandle: 'Nova',
            settings: { playerCount: 3 },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const firstJoiner = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bob',
            acceptedHandle: 'TempHandle',
        });
        expect(firstJoiner.ok).toBe(true);
        if (!firstJoiner.ok) {
            return;
        }
        clockMs += 1_000;
        expect(
            h.matchmaker.leaveMatch({
                matchId: created.data.matchId,
                sessionToken: firstJoiner.data.seatAssignment.sessionToken,
            }).ok,
        ).toBe(true);
        const refill = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Cara',
            acceptedHandle: 'Zephyr',
        });
        expect(refill.ok).toBe(true);
        // Still filling (2/3): attach a third seat to trigger auto-start.
        const last = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Dan',
            acceptedHandle: 'Onyx',
        });
        expect(last.ok).toBe(true);

        // Seat 1's released TempHandle is gone; the refill and final
        // joiner occupy seats 1 and 2 with their OWN handles.
        expect(h.server.registerMatchCalls[0]?.displayNames).toEqual(['Nova', 'Zephyr', 'Onyx']);
        h.matchmaker.close();
    });
});
