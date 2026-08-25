/**
 * Unit tests for the match lifecycle state machine — Feature 006 (T022)
 *
 * Covers FR-007 + FR-012 + data-model.md §4: the atomic
 * `filling → running`, `running → finished`, and `→ collected`
 * transitions, their `MatchStatusChanged` events, seat playerId
 * finalization, and illegal-transition rejection.
 *
 * Test descriptions cite the requirement they pin.
 */
import type { EngineSession, MatchId } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MATCH_SETTINGS, type MatchResultsRecord } from '../../contracts/match-types';
import { createPlayerSession } from '../../src/internal/playerSession';
import {
    addSeatToFillingMatch,
    createMatchRecordWithCreator,
    createStatusBus,
    type MatchStatusChangedEvent,
    toPlayerId,
    transitionFillingToRunning,
    transitionRunningToFinished,
    transitionToCollected,
} from '../../src/matchLifecycle';

/** Deterministic id/clock fixtures — no CSPRNG, no wall clock. */
let seq = 0;
function fakeRandomId(): string {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/** Opaque session handle: lifecycle code stores it but never calls it. */
function stubEngineSession(): EngineSession {
    return {
        world() {
            throw new Error('stub engine session must not be read');
        },
        submit() {
            throw new Error('stub engine session must not receive orders');
        },
        advance() {
            throw new Error('stub engine session must not be advanced');
        },
        status() {
            return undefined;
        },
        close() {},
    };
}

/** A filling match with a seated creator (via the real T027 factory). */
function makeFillingMatch(): {
    match: ReturnType<typeof createMatchRecordWithCreator>['match'];
    creatorSeat: ReturnType<typeof createMatchRecordWithCreator>['creatorSeat'];
    creator: ReturnType<typeof createPlayerSession>;
} {
    const creator = createPlayerSession({
        displayName: 'Alice',
        randomId: fakeRandomId,
        now: () => 1_000,
    });
    const created = createMatchRecordWithCreator({
        settings: DEFAULT_MATCH_SETTINGS,
        visibility: 'public',
        creator,
        nowMs: 1_000,
        randomId: fakeRandomId,
    });
    return { match: created.match, creatorSeat: created.creatorSeat, creator };
}

describe('createStatusBus', () => {
    it('FR-012: delivers emitted events to every subscriber', () => {
        const bus = createStatusBus();
        const seen: MatchStatusChangedEvent[] = [];
        bus.subscribe((event) => seen.push(event));

        bus.emit({ matchId: 'm1' as MatchId, from: null, to: 'filling', atMs: 5 });

        expect(seen).toHaveLength(1);
        expect(seen[0]?.to).toBe('filling');
    });

    it('FR-012: unsubscribe stops delivery', () => {
        const bus = createStatusBus();
        const seen: MatchStatusChangedEvent[] = [];
        const stop = bus.subscribe((event) => seen.push(event));
        stop();

        bus.emit({ matchId: 'm1' as MatchId, from: null, to: 'filling', atMs: 5 });

        expect(seen).toHaveLength(0);
    });

    it('FR-012: unsubscribing twice is a safe no-op', () => {
        const bus = createStatusBus();
        const seen: MatchStatusChangedEvent[] = [];
        const stop = bus.subscribe((event) => seen.push(event));

        stop();
        stop(); // second call must not throw or double-splice

        bus.emit({ matchId: 'm1' as MatchId, from: null, to: 'filling', atMs: 5 });
        expect(seen).toHaveLength(0);
    });
});

describe('toPlayerId', () => {
    it('accepts every valid engine player id', () => {
        expect(toPlayerId(1)).toBe(1);
        expect(toPlayerId(2)).toBe(2);
        expect(toPlayerId(3)).toBe(3);
        expect(toPlayerId(4)).toBe(4);
    });

    it('throws on values outside the 1..4 engine contract', () => {
        expect(() => toPlayerId(0)).toThrow(/outside 1\.\.4/);
        expect(() => toPlayerId(5)).toThrow(/outside 1\.\.4/);
    });
});

describe('createMatchRecordWithCreator', () => {
    it('FR-002/FR-004: creates a filling record with the creator in seat 0', () => {
        const { match, creatorSeat, creator } = makeFillingMatch();

        expect(match.status).toBe('filling');
        expect(match.visibility).toBe('public');
        expect(match.settings).toBe(DEFAULT_MATCH_SETTINGS);
        expect(match.createdAtMs).toBe(1_000);
        expect(match.lastActivityAtMs).toBe(1_000);
        expect(match.joinPath).toBe(`/join/${match.matchId}`);
        expect(match.engineSession).toBeNull();
        expect(match.engineConfig).toBeNull();

        expect(match.seats.size).toBe(1);
        expect(creatorSeat.seatIndex).toBe(0);
        expect(creatorSeat.displayName).toBe('Alice');
        // Credentials come from the injected deterministic factories.
        expect(creatorSeat.playerSessionId).toBe(creator.playerSessionId);
        expect(creatorSeat.sessionToken).toMatch(/^[0-9a-f-]{36}$/);
        expect(creatorSeat.playerId).toBeNull();
        // The creator's session is bound to the match + seat + token.
        expect(creator.currentMatchId).toBe(match.matchId);
        expect(creator.currentSeatIndex).toBe(0);
        expect(creator.currentSessionToken).toBe(creatorSeat.sessionToken);
    });

    it('FR-002: private matches are created identically (visibility fixed at creation)', () => {
        const creator = createPlayerSession({
            displayName: 'Alice',
            randomId: fakeRandomId,
            now: () => 1_000,
        });
        const { match } = createMatchRecordWithCreator({
            settings: DEFAULT_MATCH_SETTINGS,
            visibility: 'private',
            creator,
            nowMs: 1_000,
            randomId: fakeRandomId,
        });
        expect(match.visibility).toBe('private');
    });
});

describe('addSeatToFillingMatch', () => {
    it('FR-004: adds the joiner to the next free seat and binds their session', () => {
        const { match, creatorSeat } = makeFillingMatch();
        const joiner = createPlayerSession({
            displayName: 'Bob',
            randomId: fakeRandomId,
            now: () => 1_000,
        });

        const { match: updated, seat } = addSeatToFillingMatch(match, joiner, 1, 2_000);

        expect(updated).toBe(match); // single source of truth; mutated in place
        expect(match.seats.size).toBe(2);
        expect(seat.seatIndex).toBe(1);
        expect(seat.displayName).toBe('Bob');
        expect(seat.connectedAtMs).toBe(2_000);
        expect(match.lastActivityAtMs).toBe(2_000);
        // Existing seats are untouched (append-only mutation).
        expect(match.seats.get(0 as SeatIndex)?.playerSessionId).toBe(creatorSeat.playerSessionId);
        // The joiner's session now points at the match/seat/token.
        expect(joiner.currentMatchId).toBe(match.matchId);
        expect(joiner.currentSeatIndex).toBe(1);
        expect(joiner.currentSessionToken).not.toBeNull();
    });
});

describe('transitionFillingToRunning', () => {
    it('FR-007: atomically sets running status, engine session, start time, and player ids', () => {
        const { match } = makeFillingMatch();
        const joiner = createPlayerSession({
            displayName: 'Bob',
            randomId: fakeRandomId,
            now: () => 1_000,
        });
        addSeatToFillingMatch(match, joiner, 1, 2_000);
        const session = stubEngineSession();

        const updated = transitionFillingToRunning(match, session, 3_000);

        expect(updated.status).toBe('running');
        expect(updated.engineSession).toBe(session);
        expect(updated.startedAtMs).toBe(3_000);
        // Seat playerIds are finalized (seatIndex + 1) at the transition.
        expect(match.seats.get(0 as SeatIndex)?.playerId).toBe(1);
        expect(match.seats.get(1 as SeatIndex)?.playerId).toBe(2);
    });

    it('FR-012: emits a filling→running MatchStatusChanged event', () => {
        const bus = createStatusBus();
        const seen: MatchStatusChangedEvent[] = [];
        bus.subscribe((event) => seen.push(event));

        const { match } = makeFillingMatch();
        transitionFillingToRunning(match, stubEngineSession(), 3_000, bus.emit);

        expect(seen).toHaveLength(1);
        expect(seen[0]?.matchId).toBe(match.matchId);
        expect(seen[0]?.from).toBe('filling');
        expect(seen[0]?.to).toBe('running');
        expect(seen[0]?.atMs).toBe(3_000);
    });

    it('data-model §4: throws on an illegal re-entry (running match cannot start again)', () => {
        const { match } = makeFillingMatch();
        transitionFillingToRunning(match, stubEngineSession(), 3_000);
        expect(() => transitionFillingToRunning(match, stubEngineSession(), 4_000)).toThrow();
    });
});

describe('transitionRunningToFinished', () => {
    it('FR-007: records results, finish time, and resets the rematch offer', () => {
        const { match } = makeFillingMatch();
        transitionFillingToRunning(match, stubEngineSession(), 3_000);

        const results: MatchResultsRecord = {
            matchId: match.matchId,
            tick: 42,
            effectiveSeed: 7,
            result: { kind: 'win', winner: 1, tick: 42, reason: 'last_standing' },
            finalBoardHash: 'deadbeef',
            finalPlayers: [
                {
                    id: 1,
                    displayName: 'Alice',
                    status: 'alive',
                    finalTroops: 10,
                    finalCities: 1,
                },
                {
                    id: 2,
                    displayName: 'Bob',
                    status: 'eliminated',
                    finalTroops: 0,
                    finalCities: 0,
                },
            ],
        };

        const updated = transitionRunningToFinished(match, results, 9_000);

        expect(updated.status).toBe('finished');
        expect(updated.results).toBe(results);
        expect(updated.finishedAtMs).toBe(9_000);
        expect(updated.rematch).toBeNull(); // window opens in Phase 6 (US4)
    });

    it('FR-012: emits a running→finished event', () => {
        const bus = createStatusBus();
        const seen: MatchStatusChangedEvent[] = [];
        bus.subscribe((event) => seen.push(event));

        const { match } = makeFillingMatch();
        transitionFillingToRunning(match, stubEngineSession(), 3_000, bus.emit);
        transitionRunningToFinished(
            match,
            {
                matchId: match.matchId,
                tick: 1,
                effectiveSeed: 7,
                result: { kind: 'win', winner: 1, tick: 1, reason: 'last_standing' },
                finalBoardHash: 'h',
                finalPlayers: [],
            },
            9_000,
            bus.emit,
        );

        expect(seen.map((e) => `${e.from}->${e.to}`)).toEqual(['filling->running', 'running->finished']);
    });

    it('data-model §4: throws when skipping running (filling → finished is illegal)', () => {
        const { match } = makeFillingMatch(); // still filling
        expect(() =>
            transitionRunningToFinished(
                match,
                {
                    matchId: match.matchId,
                    tick: 1,
                    effectiveSeed: 7,
                    result: { kind: 'win', winner: 1, tick: 1, reason: 'last_standing' },
                    finalBoardHash: 'h',
                    finalPlayers: [],
                },
                9_000,
            ),
        ).toThrow();
    });
});

describe('transitionToCollected', () => {
    it('data-model §4: marks the match collected (teardown complete)', () => {
        const { match } = makeFillingMatch();
        const updated = transitionToCollected(match, 5_000);
        expect(updated.status).toBe('collected');
    });

    it('FR-012: emits a →collected event with the previous state', () => {
        const bus = createStatusBus();
        const seen: MatchStatusChangedEvent[] = [];
        bus.subscribe((event) => seen.push(event));

        const { match } = makeFillingMatch();
        transitionToCollected(match, 5_000, bus.emit);

        expect(seen).toHaveLength(1);
        expect(seen[0]?.from).toBe('filling');
        expect(seen[0]?.to).toBe('collected');
        expect(seen[0]?.atMs).toBe(5_000);
    });

    it('data-model §4: throws on double-collection', () => {
        const { match } = makeFillingMatch();
        transitionToCollected(match, 5_000);
        expect(() => transitionToCollected(match, 6_000)).toThrow();
    });
});
