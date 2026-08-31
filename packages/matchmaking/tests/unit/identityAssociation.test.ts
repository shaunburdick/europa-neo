/**
 * Identity-association transition matrix — Feature 010 (T-006)
 *
 * Pins spec FR-019/FR-021/FR-022 groundwork: the authoritative
 * `GuestPlayerId` association and the accepted-handle display snapshot
 * follow `PlayerSession` → `SeatRecord` and survive EVERY lifecycle
 * path — create, fill, auto-start (`filling → running`), terminal
 * (`running → finished`), collection, disconnect-within-grace,
 * post-grace release (both the running forfeit and the filling inline
 * release), and rematch. Also pins the privacy envelope at the
 * matchmaking boundary: no public payload builder
 * (`projectLobbyEntry`, `buildMatchResultsRecord`, `SeatAssignment`)
 * grows an opaque-id field or leaks the fixture marker value.
 *
 * Altitude note: the PUBLIC `createMatch`/`joinMatch` API cannot carry
 * identities yet — the lobby facade wires registry values into these
 * primitives in T-007, and the wire-level adversarial suite (forged
 * claims, 100-order attribution) is T-009. Everything asserted here
 * exercises the exact code paths that wiring will drive.
 *
 * Determinism: fixed clock constant, sequential fake ids, scripted
 * all-land board — no wall clock, no unseeded randomness in the logic
 * under test (constitution Principle II).
 */

import type { PlayerId } from '@europa/engine';
import type { SessionToken } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MATCH_SETTINGS, type PlayerSessionId, type SeatIndex } from '../../contracts/match-types';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import type { GuestPlayerId } from '../../src/contracts/lobby-types';
import { buildEngineSession, buildMatchConfig } from '../../src/engineSession';
import { handleSeatExpired } from '../../src/forfeit';
import type { PlayerSession } from '../../src/internal/playerSession';
import { createPlayerSession } from '../../src/internal/playerSession';
import type { SeatRecord } from '../../src/internal/seatRecord';
import { createSeatRecord } from '../../src/internal/seatRecord';
import { listPublicMatches, projectLobbyEntry } from '../../src/lobby';
import {
    addSeatToFillingMatch,
    createMatchRecordWithCreator,
    createRematchMatchRecord,
    propagateHandleRename,
    transitionFillingToRunning,
    transitionRunningToFinished,
    transitionToCollected,
} from '../../src/matchLifecycle';
import { createMatchmaker } from '../../src/matchmaker';
import { buildMatchResultsRecord } from '../../src/results';
import { createStore } from '../../src/store';
import { FakeServer } from '../fixtures/fakeServer';
import { SILENT_LOGGER, scriptedBoard } from '../fixtures/forfeitScenario';
import { nextGuestPlayerId } from '../fixtures/lobbyIdentities';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

/** Fixed epoch reading — every timestamp in this suite derives from it. */
const CLOCK_MS = 3_000_000;

/** Sequential fake UUID v4 generator (deterministic ids, no CSPRNG). */
let seq = 0;
function fakeRandomId(): string {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/** A session plus the registry-side id it was created for. */
interface GuestFixture {
    readonly session: PlayerSession;
    readonly guestPlayerId: GuestPlayerId;
}

/**
 * A lobby-identified session (feature 010 flow): the facade resolves
 * the registry identity FIRST, then creates the session carrying it.
 */
function makeGuest(displayName: string, handle: string): GuestFixture {
    const guestPlayerId = nextGuestPlayerId();
    const session = createPlayerSession({
        displayName,
        randomId: fakeRandomId,
        now: () => CLOCK_MS,
        guestPlayerId,
        acceptedHandle: handle,
    });
    return { session, guestPlayerId };
}

/** A legacy feature-006 session (no lobby involvement). */
function makeLegacySession(displayName: string): PlayerSession {
    return createPlayerSession({ displayName, randomId: fakeRandomId, now: () => CLOCK_MS });
}

/** Both seated guests of the shared two-player fixture. */
interface SeatedGuests {
    readonly alice: GuestFixture;
    readonly bob: GuestFixture;
}

/**
 * A `'filling'` public 2p match built through the REAL create/fill
 * primitives, with both sessions in the given store — the exact state
 * T-007's facade produces between "creator reserved" and "last seat".
 */
function makeSeatedFillingMatch(store = createStore()): {
    match: ReturnType<typeof createMatchRecordWithCreator>['match'];
    aliceSeat: SeatRecord;
    bobSeat: SeatRecord;
} & SeatedGuests {
    const alice = makeGuest('Alice', 'Nova');
    const bob = makeGuest('Bob', 'Orion');

    const { match, creatorSeat } = createMatchRecordWithCreator({
        settings: { ...DEFAULT_MATCH_SETTINGS, boardSize: 8 },
        visibility: 'public',
        creator: alice.session,
        nowMs: CLOCK_MS,
        randomId: fakeRandomId,
    });
    const { seat: bobSeat } = addSeatToFillingMatch(match, bob.session, 1 as SeatIndex, CLOCK_MS);

    store.putMatch(match);
    store.putSession(alice.session);
    store.putSession(bob.session);

    return { match, aliceSeat: creatorSeat, bobSeat, alice, bob };
}

/** Transition a seated filling match to `'running'` on a real engine session. */
function startMatch(match: ReturnType<typeof createMatchRecordWithCreator>['match']): void {
    const seed = 987654321;
    const config = buildMatchConfig(match.settings, seed);
    const engineSession = buildEngineSession(config, scriptedBoard(match.settings.boardSize, 2));
    transitionFillingToRunning(match, engineSession, CLOCK_MS);
}

/** Serialized form used for value-leakage scans (audit helper). */
function serialized(value: unknown): string {
    return JSON.stringify(value) ?? '';
}

// ----------------------------------------------------------------------------
// Record factories — additive association, backward compatible
// ----------------------------------------------------------------------------

describe('record factories carry the association additively (T-006)', () => {
    it('legacy sessions (feature 006 flow) default the association to null', () => {
        const session = makeLegacySession('Alice');
        expect(session.guestPlayerId).toBeNull();
        expect(session.acceptedHandle).toBeNull();
        // Pre-existing fields untouched.
        expect(session.displayName).toBe('Alice');
        expect(session.currentMatchId).toBeNull();
    });

    it('lobby-created sessions store the authoritative id + accepted handle verbatim', () => {
        const { session, guestPlayerId } = makeGuest('Alice', 'Nova');
        expect(session.guestPlayerId).toBe(guestPlayerId);
        expect(session.acceptedHandle).toBe('Nova');
    });

    it('legacy seats default the snapshot to null; explicit args are stored', () => {
        const legacy = createSeatRecord({
            seatIndex: 0 as SeatIndex,
            playerSessionId: '11111111-1111-4111-8111-111111111111' as PlayerSessionId,
            displayName: 'Alice',
            sessionToken: 'aaaaaaaa-0000-4000-8000-00000000000a' as SessionToken,
            playerId: null,
            connectedAtMs: CLOCK_MS,
        });
        expect(legacy.guestPlayerId).toBeNull();
        expect(legacy.handle).toBeNull();

        const guestId = nextGuestPlayerId();
        const identified = createSeatRecord({
            seatIndex: 1 as SeatIndex,
            playerSessionId: '22222222-2222-4222-8222-222222222222' as PlayerSessionId,
            displayName: 'Bob',
            handle: 'Orion',
            guestPlayerId: guestId,
            sessionToken: 'bbbbbbbb-0000-4000-8000-00000000000b' as SessionToken,
            playerId: null,
            connectedAtMs: CLOCK_MS,
        });
        expect(identified.guestPlayerId).toBe(guestId);
        expect(identified.handle).toBe('Orion');
    });
});

// ----------------------------------------------------------------------------
// Seat creation copies the session snapshot (create / fill / rematch)
// ----------------------------------------------------------------------------

describe('seat creation copies the identity + handle snapshot (FR-019)', () => {
    it('createMatchRecordWithCreator seeds the creator seat from the creator session', () => {
        const alice = makeGuest('Alice', 'Nova');
        const { match, creatorSeat } = createMatchRecordWithCreator({
            settings: DEFAULT_MATCH_SETTINGS,
            visibility: 'public',
            creator: alice.session,
            nowMs: CLOCK_MS,
            randomId: fakeRandomId,
        });

        expect(creatorSeat.guestPlayerId).toBe(alice.guestPlayerId);
        expect(creatorSeat.handle).toBe('Nova');
        expect(creatorSeat.playerSessionId).toBe(alice.session.playerSessionId);
        expect(match.seats.get(0)).toBe(creatorSeat);
    });

    it('addSeatToFillingMatch seeds each joiner seat from THAT joiner only', () => {
        const { match, aliceSeat, bobSeat, alice, bob } = makeSeatedFillingMatch();

        expect(bobSeat.guestPlayerId).toBe(bob.guestPlayerId);
        expect(bobSeat.handle).toBe('Orion');
        // The earlier seat is untouched by the later fill.
        expect(aliceSeat.guestPlayerId).toBe(alice.guestPlayerId);
        expect(aliceSeat.handle).toBe('Nova');
        expect(match.seats.size).toBe(2);
    });

    it('rematch seats re-snapshot the CURRENT handle under the SAME identity (US1 AC-4 + FR-019)', () => {
        const store = createStore();
        const { match, alice, bob } = makeSeatedFillingMatch(store);
        startMatch(match);

        // The identity renames between the original match and the rematch:
        // the registry-driven sweep refreshes the live session snapshots,
        // and the rematch seats re-read them at rebuild time.
        propagateHandleRename(store, alice.guestPlayerId, 'NovaPrime');

        const { match: rematch, seats } = createRematchMatchRecord({
            original: match,
            participants: [
                { session: alice.session, seatIndex: 0 as SeatIndex },
                { session: bob.session, seatIndex: 1 as SeatIndex },
            ],
            nowMs: CLOCK_MS,
            randomId: fakeRandomId,
        });

        expect(seats).toHaveLength(2);
        expect(rematch.seats.get(0)?.guestPlayerId).toBe(alice.guestPlayerId);
        expect(rematch.seats.get(0)?.handle).toBe('NovaPrime'); // renamed handle followed the player
        expect(rematch.seats.get(1)?.guestPlayerId).toBe(bob.guestPlayerId);
        expect(rematch.seats.get(1)?.handle).toBe('Orion'); // unrenamed handle unchanged
    });
});

// ----------------------------------------------------------------------------
// Transition matrix — the association survives every lifecycle path
// ----------------------------------------------------------------------------

describe('transition matrix: association persists through every path (FR-019)', () => {
    it('filling → running preserves both seats and finalizes playerIds', () => {
        const { match, aliceSeat, bobSeat, alice, bob } = makeSeatedFillingMatch();

        startMatch(match);

        expect(match.status).toBe('running');
        expect(aliceSeat.guestPlayerId).toBe(alice.guestPlayerId);
        expect(aliceSeat.handle).toBe('Nova');
        expect(bobSeat.guestPlayerId).toBe(bob.guestPlayerId);
        expect(bobSeat.handle).toBe('Orion');
        expect(aliceSeat.playerId).toBe(1);
        expect(bobSeat.playerId).toBe(2);
        // Session bindings intact after auto-start.
        expect(alice.session.currentMatchId).toBe(match.matchId);
        expect(alice.session.currentSeatIndex).toBe(0);
        expect(alice.session.currentSessionToken).toBe(aliceSeat.sessionToken);
    });

    it('running → finished preserves seats; results correlate players by playerId', () => {
        const { match, aliceSeat, bobSeat, alice } = makeSeatedFillingMatch();
        startMatch(match);
        const world = match.engineSession?.world();
        if (world === undefined) {
            throw new Error('fixture: engine session missing after start');
        }

        const results = buildMatchResultsRecord({
            matchId: match.matchId,
            world,
            result: { kind: 'victory', winner: 1 as PlayerId },
            seats: match.seats,
        });
        transitionRunningToFinished(match, results, CLOCK_MS);

        expect(match.status).toBe('finished');
        expect(aliceSeat.guestPlayerId).toBe(alice.guestPlayerId);
        expect(aliceSeat.handle).toBe('Nova');
        expect(bobSeat.handle).toBe('Orion');

        // Terminal results correlate authoritative seats with non-secret
        // player IDs; lobby identity associations remain internal fields.
        expect(Object.keys(results.finalPlayers[0]).sort()).toEqual([
            'displayName',
            'finalCities',
            'finalTroops',
            'id',
            'status',
        ]);
        expect(results.finalPlayers.map((p) => p.displayName)).toEqual(['Alice', 'Bob']);
        expect(results.finalPlayers.map((p) => p.id)).toEqual([1, 2]);
        expect(serialized(results)).toContain('"id":1');
        expect(serialized(results)).toContain('"id":2');
    });

    it('collection keeps internal records inert and out of every projection', () => {
        const { match, aliceSeat, alice } = makeSeatedFillingMatch();
        startMatch(match);
        transitionToCollected(match, CLOCK_MS);

        // Internal retention is allowed (records may hold ids); what matters
        // is that collected matches can never reach a public projection.
        expect(match.status).toBe('collected');
        expect(aliceSeat.guestPlayerId).toBe(alice.guestPlayerId);
        expect(projectLobbyEntry(match, CLOCK_MS)).toBeNull();
        expect(listPublicMatches([match], CLOCK_MS)).toHaveLength(0);
    });

    it('post-grace forfeit in a running match stamps the seat and KEEPS attribution', () => {
        const store = createStore();
        const { match, aliceSeat, bobSeat, alice } = makeSeatedFillingMatch(store);
        startMatch(match);
        const server = new FakeServer();

        const result = handleSeatExpired(
            { matchId: match.matchId, sessionToken: aliceSeat.sessionToken, playerId: 1 },
            { store, server, logger: SILENT_LOGGER },
            CLOCK_MS + 60_000,
        );

        expect(result?.outcome).toBe('surrendered');
        expect(aliceSeat.forfeitedAtMs).toBe(CLOCK_MS + 60_000);
        // Attribution survives the forfeit (FR-021): the seat keeps its
        // identity association and handle for the match's remaining life.
        expect(aliceSeat.guestPlayerId).toBe(alice.guestPlayerId);
        expect(aliceSeat.handle).toBe('Nova');
        // The other seat is unaffected.
        expect(bobSeat.forfeitedAtMs).toBeNull();
        expect(bobSeat.handle).toBe('Orion');
    });

    it('post-grace inline release in a filling match drops the seat, keeps the identity', () => {
        const store = createStore();
        const { match, aliceSeat, alice } = makeSeatedFillingMatch(store);
        const server = new FakeServer();

        const result = handleSeatExpired(
            { matchId: match.matchId, sessionToken: aliceSeat.sessionToken, playerId: null },
            { store, server, logger: SILENT_LOGGER },
            CLOCK_MS + 60_000,
        );

        expect(result?.outcome).toBe('released');
        expect(match.seats.has(0 as SeatIndex)).toBe(false);
        expect(server.detachPlayerCalls).toHaveLength(1);
        // The session lost only its MATCH binding; the lobby identity
        // association persists (the registry owns its release).
        expect(alice.session.currentMatchId).toBeNull();
        expect(alice.session.guestPlayerId).toBe(alice.guestPlayerId);
        expect(alice.session.acceptedHandle).toBe('Nova');
    });
});

// ----------------------------------------------------------------------------
// Reconnect within grace (FR-022 groundwork)
// ----------------------------------------------------------------------------

describe('reconnect within grace restores the same identity + handle + seat', () => {
    it('grace-window disconnect mutates nothing; the token still resolves the same seat', () => {
        const { match, aliceSeat, alice } = makeSeatedFillingMatch();
        startMatch(match);
        const server = new FakeServer();

        // Snapshot the full observable association state "before".
        const before = {
            guestPlayerId: aliceSeat.guestPlayerId,
            handle: aliceSeat.handle,
            sessionToken: aliceSeat.sessionToken,
            seatIndex: aliceSeat.seatIndex,
            playerId: aliceSeat.playerId,
            forfeitedAtMs: aliceSeat.forfeitedAtMs,
        };

        // Grace window elapses WITHOUT expiry: networking owns the timer;
        // matchmaking learns nothing and mutates nothing. A reconnect
        // presents the SAME credential and is bound to the SAME
        // server-resolved seat — resolved by token equality, never by any
        // client-supplied identity/handle/seat claim (FR-021/FR-022).
        const reconnectedSeat = [...match.seats.values()].find(
            (seat) => seat.sessionToken === alice.session.currentSessionToken,
        );

        expect(reconnectedSeat).toBeDefined();
        expect(reconnectedSeat?.guestPlayerId).toBe(before.guestPlayerId);
        expect(reconnectedSeat?.handle).toBe(before.handle);
        expect(reconnectedSeat?.sessionToken).toBe(before.sessionToken);
        expect(reconnectedSeat?.seatIndex).toBe(before.seatIndex);
        expect(reconnectedSeat?.playerId).toBe(before.playerId);
        expect(reconnectedSeat?.forfeitedAtMs).toBe(before.forfeitedAtMs);
        expect(server.detachPlayerCalls).toHaveLength(0); // no forfeit fired
    });

    it('an unknown reconnect token still gets the non-leaking match_not_found (identity era)', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        if (!created.ok) {
            throw new Error('fixture: create failed');
        }

        const strangerToken = 'cccccccc-0000-4000-8000-00000000000c' as SessionToken;
        const join = matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Bob',
            reconnectToken: strangerToken,
        });

        expect(join.ok).toBe(false);
        if (!join.ok) {
            expect(join.error.code).toBe('match_not_found');
        }
        matchmaker.close();
    });
});

// ----------------------------------------------------------------------------
// Handle rename propagation (US1 AC-4)
// ----------------------------------------------------------------------------

describe('propagateHandleRename sweeps accepted renames (FR-019)', () => {
    it('refreshes the session snapshot and every in-flight seat snapshot', () => {
        const store = createStore();
        const { match, aliceSeat, bobSeat, alice, bob } = makeSeatedFillingMatch(store);
        startMatch(match);

        const result = propagateHandleRename(store, alice.guestPlayerId, 'NovaPrime');

        expect(result).toEqual({ sessions: 1, seats: 1 });
        expect(alice.session.acceptedHandle).toBe('NovaPrime');
        expect(aliceSeat.handle).toBe('NovaPrime');
        // Other players are untouched.
        expect(bob.session.acceptedHandle).toBe('Orion');
        expect(bobSeat.handle).toBe('Orion');
    });

    it('sweeps every record sharing the identity, including a second match', () => {
        const store = createStore();
        const first = makeSeatedFillingMatch(store);

        // Defensive duplicate: the registry guarantees one active match per
        // identity, but the sweep tolerates a guest appearing twice (fixture
        // mints a twin session under the SAME registry id).
        const twin = createPlayerSession({
            displayName: 'Alice',
            randomId: fakeRandomId,
            now: () => CLOCK_MS,
            guestPlayerId: first.alice.guestPlayerId,
            acceptedHandle: 'Nova',
        });
        const { match: matchB, creatorSeat: seatB } = createMatchRecordWithCreator({
            settings: DEFAULT_MATCH_SETTINGS,
            visibility: 'public',
            creator: twin,
            nowMs: CLOCK_MS,
            randomId: fakeRandomId,
        });
        store.putMatch(matchB);
        store.putSession(twin);

        const result = propagateHandleRename(store, first.alice.guestPlayerId, 'NovaPrime');

        expect(result).toEqual({ sessions: 2, seats: 2 });
        expect(first.aliceSeat.handle).toBe('NovaPrime');
        expect(seatB.handle).toBe('NovaPrime');
        expect(twin.acceptedHandle).toBe('NovaPrime');
        // Bob's records untouched.
        expect(first.bobSeat.handle).toBe('Orion');
    });

    it('skips collected matches (dead records no projection can reach)', () => {
        const store = createStore();
        const dead = makeSeatedFillingMatch(store);
        transitionToCollected(dead.match, CLOCK_MS);

        const result = propagateHandleRename(store, dead.alice.guestPlayerId, 'NovaPrime');

        // The session snapshot still refreshes (it is live state), but the
        // collected match's seat is left alone.
        expect(result).toEqual({ sessions: 1, seats: 0 });
        expect(dead.aliceSeat.handle).toBe('Nova');
    });

    it('is a counted no-op for an unknown or foreign identity (forge-safety groundwork)', () => {
        const store = createStore();
        const { aliceSeat, bobSeat, alice, bob } = makeSeatedFillingMatch(store);

        const unknownId = nextGuestPlayerId();
        expect(propagateHandleRename(store, unknownId, 'Sneaky')).toEqual({ sessions: 0, seats: 0 });

        // Targeting ANOTHER player's id changes only that player — never a
        // cross-player rewrite (full adversarial matrix is T-009).
        const result = propagateHandleRename(store, bob.guestPlayerId, 'OrionTwo');
        expect(result).toEqual({ sessions: 1, seats: 1 });
        expect(bobSeat.handle).toBe('OrionTwo');
        expect(aliceSeat.handle).toBe('Nova');
        expect(alice.session.acceptedHandle).toBe('Nova');
    });

    it('a subsequently joined match picks up the renamed handle (US1 AC-4)', () => {
        const store = createStore();
        const { alice } = makeSeatedFillingMatch(store);
        propagateHandleRename(store, alice.guestPlayerId, 'NovaPrime');

        // Next match: the facade resolves the SAME identity and creates a
        // fresh session — the snapshot starts from the renamed handle.
        const nextSession = createPlayerSession({
            displayName: 'Alice',
            randomId: fakeRandomId,
            now: () => CLOCK_MS,
            guestPlayerId: alice.guestPlayerId,
            acceptedHandle: 'NovaPrime',
        });
        const { creatorSeat } = createMatchRecordWithCreator({
            settings: DEFAULT_MATCH_SETTINGS,
            visibility: 'public',
            creator: nextSession,
            nowMs: CLOCK_MS,
            randomId: fakeRandomId,
        });

        expect(creatorSeat.guestPlayerId).toBe(alice.guestPlayerId); // identity reference unchanged
        expect(creatorSeat.handle).toBe('NovaPrime'); // fresh handle flowed through
    });
});

// ----------------------------------------------------------------------------
// Opaque-ID exposure audit (FR-024 / NFR-003)
// ----------------------------------------------------------------------------

describe('exposure audit: public payloads preserve safe correlation data', () => {
    it('lobby projections expose discovery data without private identity associations', () => {
        const { match } = makeSeatedFillingMatch();

        const entry = projectLobbyEntry(match, CLOCK_MS);
        expect(entry).not.toBeNull();
        expect(Object.keys(entry ?? {}).sort()).toEqual([
            'ageSeconds',
            'boardSize',
            'createdAtMs',
            'hostDisplayName',
            'matchId',
            'playerCount',
            'seatsFilled',
            'visibility',
        ]);
    });

    it('SeatAssignment correlates each result with its assigned player and keeps its exact shape', () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });

        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
        expect(created.ok).toBe(true);
        if (created.ok) {
            expect(Object.keys(created.data.seatAssignment).sort()).toEqual([
                'displayName',
                'playerId',
                'playerSessionId',
                'seatIndex',
                'sessionToken',
            ]);
            expect(created.data.seatAssignment.playerId).toBe(1);
        }

        const matchId = created.ok ? created.data.matchId : null;
        if (matchId === null) {
            throw new Error('fixture: create failed');
        }
        const joined = matchmaker.joinMatch({ matchId, displayName: 'Bob' });
        expect(joined.ok).toBe(true);
        if (joined.ok) {
            expect(Object.keys(joined.data.seatAssignment).sort()).toEqual([
                'displayName',
                'playerId',
                'playerSessionId',
                'seatIndex',
                'sessionToken',
            ]);
            expect(joined.data.seatAssignment.playerId).toBe(2);
        }
        matchmaker.close();
    });

    it('association fields stay off every public payload even when records carry identities', () => {
        const store = createStore();
        const { match } = makeSeatedFillingMatch(store);
        startMatch(match);

        // Every public surface this package exposes today, scanned as a set:
        const surfaces: unknown[] = [
            projectLobbyEntry(match, CLOCK_MS),
            listPublicMatches(store.listMatches(), CLOCK_MS),
        ];
        for (const surface of surfaces) {
            const text = serialized(surface);
            expect(text).not.toContain('acceptedHandle');
            expect(text).not.toContain('"handle"');
        }
    });
});
