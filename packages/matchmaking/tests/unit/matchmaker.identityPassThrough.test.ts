/**
 * Unit tests for the identity pass-through — feature 010 FR-019 via
 * remediation R-005 seam (d): the additive optional
 * `guestPlayerId` / `acceptedHandle` fields on `CreateMatchRequest` /
 * `JoinMatchRequest`, flowing from the (lobby-facade-supplied,
 * server-resolved) request into the player session and the seat
 * snapshot records.
 *
 * Pins:
 *   - supplied values land on BOTH seat records' snapshots
 *     (`SeatRecord.guestPlayerId` / `SeatRecord.handle`) through the
 *     real create → join → auto-start path;
 *   - the association survives the filling → running transition;
 *   - absent fields store `null` (backward compatibility with every
 *     legacy feature-006 caller);
 *   - PRIVACY envelope: the public `SeatAssignment` payload never
 *     grows an opaque-id or handle-snapshot field beyond its contract
 *     (`displayName` remains the cosmetic name);
 *   - a released filling seat's session keeps its association (the
 *     lobby identity outlives any one match).
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
import { nextGuestPlayerId } from '../fixtures/lobbyIdentities';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

let clockMs = 4_000_000;
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
// Supplied identity reaches session + seat records
// ----------------------------------------------------------------------------

describe('identity pass-through — supplied values land in records (FR-019)', () => {
    it('createMatch + joinMatch copy guestPlayerId/acceptedHandle into both seat snapshots', () => {
        const h = makeHarness();
        const aliceGuest = nextGuestPlayerId();
        const bobGuest = nextGuestPlayerId();

        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            // Facade-supplied, registry-resolved values (never client claims).
            guestPlayerId: aliceGuest,
            acceptedHandle: 'Nova',
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const joined = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bobby',
            guestPlayerId: bobGuest,
            acceptedHandle: 'Orion',
        });
        expect(joined.ok).toBe(true);
        if (!joined.ok) {
            return;
        }

        // Auto-start ran; both seats carry their identity snapshots and
        // they SURVIVED the filling → running transition.
        const match = h.seam.getMatch(created.data.matchId);
        expect(match?.status).toBe('running');
        const aliceSeat = match?.seats.get(0);
        const bobSeat = match?.seats.get(1);
        expect(aliceSeat?.guestPlayerId).toBe(aliceGuest);
        expect(aliceSeat?.handle).toBe('Nova');
        expect(bobSeat?.guestPlayerId).toBe(bobGuest);
        expect(bobSeat?.handle).toBe('Orion');

        // displayName stays the cosmetic name — distinct from the handle.
        expect(aliceSeat?.displayName).toBe('Alice');
        expect(bobSeat?.displayName).toBe('Bobby');
        h.matchmaker.close();
    });

    it('absent fields store null on the seat snapshots (backward compatible)', () => {
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

        const match = h.seam.getMatch(created.data.matchId);
        for (const seatIndex of [0, 1]) {
            const seat = match?.seats.get(seatIndex);
            expect(seat?.guestPlayerId).toBeNull();
            expect(seat?.handle).toBeNull();
        }
        h.matchmaker.close();
    });

    it('releasing a seat leaves surviving seats untouched; refills carry fresh identities', () => {
        const h = makeHarness();
        const aliceGuest = nextGuestPlayerId();
        const bobGuest = nextGuestPlayerId();
        const caraGuest = nextGuestPlayerId();

        // 3p capacity: a single join never triggers auto-start, so the
        // release below happens in the filling phase.
        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            guestPlayerId: aliceGuest,
            acceptedHandle: 'Nova',
            settings: { playerCount: 3 },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const joined = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bob',
            guestPlayerId: bobGuest,
            acceptedHandle: 'Orion',
        });
        expect(joined.ok).toBe(true);

        clockMs += 1_000;
        // Bob leaves: the inline release removes HIS seat only.
        expect(
            h.matchmaker.leaveMatch({
                matchId: created.data.matchId,
                sessionToken: joined.data.seatAssignment.sessionToken,
            }).ok,
        ).toBe(true);

        const match = h.seam.getMatch(created.data.matchId);
        expect(match?.seats.size).toBe(1);
        expect(match?.seats.get(0)?.guestPlayerId).toBe(aliceGuest);
        expect(match?.seats.get(0)?.handle).toBe('Nova');

        // The refill supplies ITS OWN registry-resolved identity.
        const refill = h.matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Cara',
            guestPlayerId: caraGuest,
            acceptedHandle: 'Zephyr',
        });
        expect(refill.ok).toBe(true);
        if (!refill.ok) {
            return;
        }
        const refilled = h.seam.getMatch(created.data.matchId);
        expect(refilled?.status).toBe('filling'); // 2/3 of a 3p match
        expect(refilled?.seats.get(1)?.guestPlayerId).toBe(caraGuest);
        expect(refilled?.seats.get(1)?.handle).toBe('Zephyr');
        h.matchmaker.close();
    });
});

// ----------------------------------------------------------------------------
// Privacy envelope at the public payload boundary
// ----------------------------------------------------------------------------

describe('identity pass-through — public payload privacy (FR-003/FR-024)', () => {
    it('SeatAssignment carries no opaque id and no handle-snapshot field', () => {
        const h = makeHarness();

        const created = h.matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            guestPlayerId: nextGuestPlayerId(),
            acceptedHandle: 'Nova',
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }

        // Exactly the five contract fields — the identity association is
        // internal-only and must never leak into the public result.
        expect(Object.keys(created.data.seatAssignment).sort()).toEqual([
            'displayName',
            'playerId',
            'playerSessionId',
            'seatIndex',
            'sessionToken',
        ]);
        expect(created.data.seatAssignment.displayName).toBe('Alice');
        h.matchmaker.close();
    });
});
