/**
 * Lifecycle bridge publication suite — Feature 010 (T-008)
 *
 * Pins the publication contract of
 * `src/internal/lobbyPublication.ts`: every matchmaker lifecycle
 * trigger (create, fill, start, collect, disconnect, reconnect,
 * expiry — plus the terminal report) resolves to a refreshed public
 * projection with a STRICTLY MONOTONIC `LobbyRevision`, finished/
 * collected rows leave promptly ("no stale/finished lobby entries",
 * FR-013/FR-014), reconnects never duplicate entries, and no payload
 * ever carries a private value (NFR-003/FR-024 privacy envelope).
 *
 * Fidelity discipline: the module under test is driven ONLY through
 * its two production seams —
 *
 *   - the REAL status bus (`createStatusBus()`) fed by the REAL
 *     lifecycle transitions (`transitionFillingToRunning`, …) with the
 *     bus's `emit` passed as the emitter, exactly as
 *     `matchmaker.ts` wires them, and
 *   - the T-004 `FakeMatchmakerBridge` firing networking-shaped seat /
 *     connection / terminal events at the publication's registered
 *     `bridge` handlers.
 *
 * Records come from the real create/fill primitives over a real
 * store, carrying genuine private values (guest ids, handles, display
 * names, CSPRNG session tokens) so the leakage scan hunts live data
 * rather than synthetic markers. No fixture files were modified.
 *
 * Scope note: this suite exercises the PUBLICATION module only —
 * facade delegation (T-007), wire transport (T-010/T-011), and
 * adversarial authority tests (T-009) live elsewhere.
 *
 * Determinism: fixed clock constant, sequential fake ids, scripted
 * all-land boards — no wall clock, no unseeded randomness in any
 * logic path (constitution Principle II).
 */

import type { PlayerId } from '@europa/engine';
import type { MatchId } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MATCH_SETTINGS, type MatchSettings, type MatchVisibility } from '../../contracts/match-types';
import type { GuestPlayerId, LobbyEvent, LobbySnapshot, PublicLobbyEntry } from '../../src/contracts/lobby-types';
import { buildEngineSession, buildMatchConfig } from '../../src/engineSession';
import type { StatusEventBus } from '../../src/eventBus';
import { createLobbyPublication, type LobbyPublication } from '../../src/internal/lobbyPublication';
import type { MatchRecord } from '../../src/internal/matchRecord';
import { createPlayerSession, type PlayerSession } from '../../src/internal/playerSession';
import {
    addSeatToFillingMatch,
    createMatchRecordWithCreator,
    createStatusBus,
    transitionFillingToRunning,
    transitionRunningToFinished,
    transitionToCollected,
} from '../../src/matchLifecycle';
import { buildMatchResultsRecord } from '../../src/results';
import { createStore, type MatchmakerStore } from '../../src/store';
import {
    FakeMatchmakerBridge,
    matchTerminalEvent,
    seatClaimedEvent,
    seatDisconnectedEvent,
    seatExpiredEvent,
    seatReconnectedEvent,
} from '../fixtures/fakeMatchmakerBridge';
import { scriptedBoard } from '../fixtures/forfeitScenario';
import { nextGuestPlayerId } from '../fixtures/lobbyIdentities';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

/** Fixed epoch reading — every timestamp in this suite derives from it. */
const CLOCK_MS = 9_000_000;

/** Sequential fake UUID v4 generator (deterministic ids, no CSPRNG). */
let seq = 0;
function fakeRandomId(): string {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/** A lobby-identified session plus the registry-side id it was created for. */
interface GuestFixture {
    readonly session: PlayerSession;
    readonly guestPlayerId: GuestPlayerId;
}

/**
 * Distinct display name + accepted handle so the privacy scan can
 * hunt BOTH private strings independently.
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

/** Everything one suite body needs to drive lifecycles end-to-end. */
interface PublicationHarness {
    readonly store: MatchmakerStore;
    readonly bus: StatusEventBus;
    readonly publication: LobbyPublication;
    readonly bridgeFixture: FakeMatchmakerBridge;
    /** Events delivered to the default sink, in delivery order. */
    readonly events: LobbyEvent[];
    /** Detach the default sink (idempotent). */
    readonly unsubscribeDefault: () => void;
}

/**
 * Wire a fresh publication against a real store + real status bus +
 * the T-004 bridge fixture — the exact composition the facade will
 * deploy (module doc wiring recipe), with a recording default sink.
 */
function makeHarness(): PublicationHarness {
    const store = createStore();
    const bus = createStatusBus();
    const publication = createLobbyPublication({ getMatch: (matchId) => store.getMatch(matchId) });
    bus.subscribe(publication.onStatusChanged);
    const bridgeFixture = new FakeMatchmakerBridge();
    bridgeFixture.registerLifecycleListener(publication.bridge);
    const events: LobbyEvent[] = [];
    const unsubscribeDefault = publication.subscribe((event) => events.push(event));
    return { store, bus, publication, bridgeFixture, events, unsubscribeDefault };
}

/** Options for {@linkcode createWaitingMatch}; omitted fields default. */
interface CreateMatchOptions {
    readonly visibility?: MatchVisibility;
    readonly playerCount?: 2 | 3 | 4;
    readonly boardSize?: number;
}

/**
 * Run the create path exactly as `matchmaker.createMatch` does: build
 * the record via the real primitive, store it, then emit the creation
 * transition (`null → 'filling'`) on the bus. Private creations emit
 * too — the publication (not the producer) owns visibility filtering.
 */
function createWaitingMatch(
    harness: PublicationHarness,
    options: CreateMatchOptions = {},
): { match: MatchRecord; host: GuestFixture } {
    const host = makeGuest('Alice', 'Nova');
    const settings: MatchSettings = {
        playerCount: options.playerCount ?? 2,
        boardSize: options.boardSize ?? 8,
        tickIntervalMs: DEFAULT_MATCH_SETTINGS.tickIntervalMs,
        terrainSettings: DEFAULT_MATCH_SETTINGS.terrainSettings,
    };
    const { match } = createMatchRecordWithCreator({
        settings,
        visibility: options.visibility ?? 'public',
        creator: host.session,
        nowMs: CLOCK_MS,
        randomId: fakeRandomId,
    });
    harness.store.putMatch(match);
    harness.bus.emit({ matchId: match.matchId, from: null, to: 'filling', atMs: CLOCK_MS });
    return { match, host };
}

/**
 * Run the fill path: append a seat via the real primitive, then fire
 * networking's seat-claim dispatch at the publication bridge — the
 * fill trigger. (The completing fill's auto-start is driven separately
 * via {@linkcode startMatch}, mirroring the back-to-back events the
 * real synchronous joinMatch produces.)
 */
function joinSeat(harness: PublicationHarness, match: MatchRecord, displayName: string, handle: string): void {
    const joiner = makeGuest(displayName, handle);
    addSeatToFillingMatch(match, joiner.session, match.seats.size, CLOCK_MS);
    harness.bridgeFixture.fireOnSeatClaimed(seatClaimedEvent({ matchId: match.matchId, playerId: null }));
}

/**
 * Auto-start a full match through the real transition + bus emitter.
 * Only 2-player matches are started in this suite because the shared
 * `scriptedBoard` fixture homes exactly two players; occupancy-only
 * coverage for 3-player matches never needs an engine session.
 */
function startMatch(harness: PublicationHarness, match: MatchRecord): void {
    const seed = 987654321;
    const config = buildMatchConfig(match.settings, seed);
    const engineSession = buildEngineSession(
        config,
        scriptedBoard(match.settings.boardSize, match.settings.playerCount),
    );
    transitionFillingToRunning(match, engineSession, CLOCK_MS, harness.bus.emit);
}

/** Terminal transition through the real transition + bus emitter. */
function finishMatch(harness: PublicationHarness, match: MatchRecord): void {
    const world = match.engineSession?.world();
    if (world === undefined) {
        throw new Error('fixture: engine session missing; start the match before finishing it');
    }
    const results = buildMatchResultsRecord({
        matchId: match.matchId,
        world,
        result: { kind: 'victory', winner: 1 as PlayerId },
        seats: match.seats,
    });
    transitionRunningToFinished(match, results, CLOCK_MS, harness.bus.emit);
}

/** Teardown through the real transition + bus emitter (any live state). */
function collectMatch(harness: PublicationHarness, match: MatchRecord): void {
    transitionToCollected(match, CLOCK_MS, harness.bus.emit);
}

/** The newest published snapshot, or a loud fixture failure. */
function latestSnapshot(events: readonly LobbyEvent[]): LobbySnapshot {
    const last = events.at(-1);
    if (last === undefined || last.kind !== 'snapshot') {
        throw new Error('fixture: no snapshot event was published');
    }
    return last.snapshot;
}

/** All published revisions in delivery order (non-snapshots as -1). */
function revisionsOf(events: readonly LobbyEvent[]): number[] {
    return events.map((event) => (event.kind === 'snapshot' ? event.snapshot.revision : -1));
}

/** Find one match's entry in a snapshot, if projected. */
function entryFor(snapshot: LobbySnapshot, matchId: MatchId): PublicLobbyEntry | undefined {
    return snapshot.entries.find((entry) => entry.matchId === matchId);
}

/** Entry matchIds in snapshot order (stable server order assertions). */
function entryOrder(snapshot: LobbySnapshot): MatchId[] {
    return snapshot.entries.map((entry) => entry.matchId);
}

// ----------------------------------------------------------------------------
// Creation trigger
// ----------------------------------------------------------------------------

describe('creation trigger (status bus: null → filling)', () => {
    it('publishes revision 1 with a waiting entry built from discovery data only', () => {
        const harness = makeHarness();
        expect(harness.publication.currentRevision()).toBe(0);
        expect(harness.publication.snapshotFor().entries).toEqual([]);

        const { match } = createWaitingMatch(harness, { boardSize: 16 });

        expect(harness.events).toHaveLength(1);
        const snapshot = latestSnapshot(harness.events);
        expect(snapshot.revision).toBe(1);
        expect(snapshot.activeMatchId).toBeNull();
        const entry = entryFor(snapshot, match.matchId);
        expect(entry).toBeDefined();
        expect(entry?.seatsFilled).toBe(1);
        expect(entry?.capacity).toBe(2);
        expect(entry?.status).toBe('waiting');
        expect(entry?.boardSize).toBe(16);
        expect(entry?.tickIntervalMs).toBe(DEFAULT_MATCH_SETTINGS.tickIntervalMs);
        expect(harness.publication.currentRevision()).toBe(1);
    });

    it('never projects a private match and never bumps the revision', () => {
        const harness = makeHarness();

        createWaitingMatch(harness, { visibility: 'private' });

        expect(harness.events).toEqual([]);
        expect(harness.publication.currentRevision()).toBe(0);
        expect(harness.publication.snapshotFor().entries).toEqual([]);
    });
});

// ----------------------------------------------------------------------------
// Fill trigger
// ----------------------------------------------------------------------------

describe('fill trigger (bridge: onSeatClaimed)', () => {
    it('refreshes occupancy live while the match keeps offering Join', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness, { playerCount: 3 });

        joinSeat(harness, match, 'Bob', 'Orion');

        let snapshot = latestSnapshot(harness.events);
        expect(snapshot.revision).toBe(2);
        let entry = entryFor(snapshot, match.matchId);
        expect(entry?.status).toBe('waiting');
        expect(entry?.seatsFilled).toBe(2);
        expect(entry?.capacity).toBe(3);

        joinSeat(harness, match, 'Cara', 'Vega');

        snapshot = latestSnapshot(harness.events);
        expect(snapshot.revision).toBe(3);
        entry = entryFor(snapshot, match.matchId);
        expect(entry?.status).toBe('waiting');
        expect(entry?.seatsFilled).toBe(3);
    });

    it('flips Join to Spectate exactly once across the completing fill + start pair', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);

        joinSeat(harness, match, 'Bob', 'Orion');
        startMatch(harness, match);

        const revisions = revisionsOf(harness.events);
        expect(revisions).toEqual([1, 2, 3]);
        const snapshot = latestSnapshot(harness.events);
        const entry = entryFor(snapshot, match.matchId);
        expect(entry?.status).toBe('in_progress');
        // US2 AC-3: Join is never offered for a running match — no
        // 'waiting' row may survive the start anywhere in the list.
        expect(snapshot.entries.some((candidate) => candidate.status === 'waiting')).toBe(false);
    });
});

// ----------------------------------------------------------------------------
// Terminal + collection triggers — no stale/finished entries
// ----------------------------------------------------------------------------

describe('terminal and collection triggers (no stale/finished entries)', () => {
    it('strips a finished match on the running → finished transition; the terminal report is a no-op', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        joinSeat(harness, match, 'Bob', 'Orion');
        startMatch(harness, match);
        expect(latestSnapshot(harness.events).entries).toHaveLength(1);

        finishMatch(harness, match);

        const snapshot = latestSnapshot(harness.events);
        expect(snapshot.revision).toBe(4);
        expect(snapshot.entries).toEqual([]);

        // Networking's terminal report arrives after the transition in
        // production; it must not resurrect the row nor bump again.
        harness.bridgeFixture.fireOnMatchTerminal(matchTerminalEvent({ matchId: match.matchId }));

        expect(harness.events).toHaveLength(4);
        expect(harness.publication.currentRevision()).toBe(4);
        expect(latestSnapshot(harness.events).entries).toEqual([]);
    });

    it('removes a collected filling match promptly (empty-match GC path)', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        expect(latestSnapshot(harness.events).entries).toHaveLength(1);

        collectMatch(harness, match);

        const snapshot = latestSnapshot(harness.events);
        expect(snapshot.revision).toBe(2);
        expect(snapshot.entries).toEqual([]);
    });

    it('collects after finish without a second bump (exactly-once removal)', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        joinSeat(harness, match, 'Bob', 'Orion');
        startMatch(harness, match);
        finishMatch(harness, match);
        expect(harness.events).toHaveLength(4);

        collectMatch(harness, match);

        expect(harness.events).toHaveLength(4);
        expect(harness.publication.currentRevision()).toBe(4);
    });
});

// ----------------------------------------------------------------------------
// Disconnect / reconnect / expiry triggers
// ----------------------------------------------------------------------------

describe('disconnect, reconnect, and expiry triggers', () => {
    it('keeps a disconnected-within-grace match listed and unchanged', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        joinSeat(harness, match, 'Bob', 'Orion');
        startMatch(harness, match);
        const before = latestSnapshot(harness.events);

        harness.bridgeFixture.fireOnSeatDisconnected(seatDisconnectedEvent({ matchId: match.matchId }));

        expect(harness.events).toHaveLength(3);
        expect(harness.publication.currentRevision()).toBe(before.revision);
        expect(latestSnapshot(harness.events)).toEqual(before);
    });

    it('never duplicates or resurrects entries on reconnects and reconnect-style claims', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        joinSeat(harness, match, 'Bob', 'Orion');
        startMatch(harness, match);
        const before = latestSnapshot(harness.events);

        harness.bridgeFixture.fireOnSeatReconnected(seatReconnectedEvent({ matchId: match.matchId }));
        harness.bridgeFixture.fireOnSeatReconnected(seatReconnectedEvent({ matchId: match.matchId }));
        harness.bridgeFixture.fireOnSeatClaimed(seatClaimedEvent({ matchId: match.matchId }));
        harness.bridgeFixture.fireOnSeatReconnected(seatReconnectedEvent({ matchId: match.matchId }));

        expect(harness.events).toHaveLength(3);
        const after = latestSnapshot(harness.events);
        expect(after.revision).toBe(before.revision);
        expect(entryOrder(after)).toEqual([match.matchId]);
        expect(entryFor(after, match.matchId)?.seatsFilled).toBe(2);
    });

    it('absorbs a raw expiry event that carried no policy outcome', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        joinSeat(harness, match, 'Bob', 'Orion');
        startMatch(harness, match);
        const before = latestSnapshot(harness.events);

        harness.bridgeFixture.fireOnSeatExpired(seatExpiredEvent({ matchId: match.matchId }));

        expect(harness.events).toHaveLength(3);
        expect(latestSnapshot(harness.events)).toEqual(before);
    });

    it('publishes an expiry-driven teardown exactly once regardless of event order', () => {
        // Order A — status event first (publication subscribed ahead of
        // the matchmaker in the composite bridge): the collection does
        // the removal; the trailing expiry report is a no-op.
        const first = makeHarness();
        const matchA = createWaitingMatch(first).match;
        joinSeat(first, matchA, 'Bob', 'Orion');
        startMatch(first, matchA);
        collectMatch(first, matchA);
        first.bridgeFixture.fireOnSeatExpired(seatExpiredEvent({ matchId: matchA.matchId }));
        expect(first.events).toHaveLength(4);
        expect(latestSnapshot(first.events).entries).toEqual([]);

        // Order B — expiry report first (publication behind the
        // matchmaker): nothing changed yet, then the collection removes.
        const second = makeHarness();
        const matchB = createWaitingMatch(second).match;
        joinSeat(second, matchB, 'Bob', 'Orion');
        startMatch(second, matchB);
        second.bridgeFixture.fireOnSeatExpired(seatExpiredEvent({ matchId: matchB.matchId }));
        expect(second.events).toHaveLength(3);
        collectMatch(second, matchB);
        expect(second.events).toHaveLength(4);
        expect(latestSnapshot(second.events).entries).toEqual([]);

        // Both compositions land on identical revision counts.
        expect(first.publication.currentRevision()).toBe(second.publication.currentRevision());
    });
});

// ----------------------------------------------------------------------------
// Monotonic revisions across interleaved lifecycles
// ----------------------------------------------------------------------------

describe('monotonic revisions across interleaved lifecycles', () => {
    it('publishes strictly consecutive revisions through three interleaved matches', () => {
        const harness = makeHarness();

        const a = createWaitingMatch(harness).match; // r1  [A]
        const b = createWaitingMatch(harness, { playerCount: 3 }).match; // r2  [A,B]
        joinSeat(harness, b, 'Bob', 'Orion'); // r3  [A,B 2/3]
        const c = createWaitingMatch(harness).match; // r4  [A,B,C]
        joinSeat(harness, a, 'Cara', 'Vega'); // r5  [A 2/2,B,C]
        startMatch(harness, a); // r6  [A*,B,C]
        collectMatch(harness, c); // r7  [A*,B] (filling GC path)
        finishMatch(harness, a); // r8  [B]
        collectMatch(harness, a); //     no change — already stripped
        collectMatch(harness, b); // r9  [] (filling GC path)

        expect(revisionsOf(harness.events)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const revisions = revisionsOf(harness.events);
        for (let index = 1; index < revisions.length; index++) {
            const previous = revisions[index - 1];
            const current = revisions[index];
            if (previous === undefined || current === undefined || current <= previous) {
                throw new Error(`revisions not strictly monotonic at ${String(index)}: ${String(revisions)}`);
            }
        }
        expect(latestSnapshot(harness.events).entries).toEqual([]);
        // Only actionable statuses ever appeared.
        for (const event of harness.events) {
            if (event.kind !== 'snapshot') {
                continue;
            }
            for (const entry of event.snapshot.entries) {
                expect(['waiting', 'in_progress']).toContain(entry.status);
            }
        }
    });

    it('keeps revision continuity through subscriber churn', () => {
        const harness = makeHarness();
        const first = createWaitingMatch(harness).match;
        expect(harness.publication.currentRevision()).toBe(1);

        harness.unsubscribeDefault();
        const lateEvents: LobbyEvent[] = [];
        harness.publication.subscribe((event) => lateEvents.push(event));

        const second = createWaitingMatch(harness);

        expect(lateEvents).toHaveLength(1);
        const snapshot = latestSnapshot(lateEvents);
        expect(snapshot.revision).toBe(2);
        // The rebuilt list still carries every projected match.
        expect(entryOrder(snapshot)).toEqual([first.matchId, second.match.matchId]);
    });
});

// ----------------------------------------------------------------------------
// Event ordering, sinks, and snapshots
// ----------------------------------------------------------------------------

describe('event ordering, sinks, and snapshots', () => {
    it('delivers identical ordered sequences to multiple sinks', () => {
        const harness = makeHarness();
        const secondSink: LobbyEvent[] = [];
        harness.publication.subscribe((event) => secondSink.push(event));

        const { match } = createWaitingMatch(harness);
        joinSeat(harness, match, 'Bob', 'Orion');
        startMatch(harness, match);

        expect(secondSink).toEqual(harness.events);
        const secondRevisions = revisionsOf(secondSink);
        for (let index = 1; index < secondRevisions.length; index++) {
            const previous = secondRevisions[index - 1];
            const current = secondRevisions[index];
            if (previous === undefined || current === undefined || current <= previous) {
                throw new Error('sink saw non-monotonic revisions');
            }
        }
    });

    it('resolves activeMatchId per sink while sharing revision and entries', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        const seatedView: LobbyEvent[] = [];
        harness.publication.subscribe((event) => seatedView.push(event), { activeMatchId: () => match.matchId });

        joinSeat(harness, match, 'Bob', 'Orion');

        // The late sink correctly misses the earlier create publication
        // and receives only the join snapshot.
        expect(harness.events).toHaveLength(2);
        expect(seatedView).toHaveLength(1);
        const lobbyView = latestSnapshot(harness.events);
        const seated = latestSnapshot(seatedView);
        expect(seated.revision).toBe(lobbyView.revision);
        expect(seated.entries).toEqual(lobbyView.entries);
        expect(seated.activeMatchId).toBe(match.matchId);
        expect(lobbyView.activeMatchId).toBeNull();
    });

    it('serves a pull baseline at the current revision without bumping', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        const baseline = harness.publication.snapshotFor(match.matchId);
        expect(baseline.revision).toBe(1);
        expect(baseline.activeMatchId).toBe(match.matchId);
        expect(harness.events).toHaveLength(1);

        // Subscribing alone publishes nothing.
        const lateEvents: LobbyEvent[] = [];
        harness.publication.subscribe((event) => lateEvents.push(event));
        expect(lateEvents).toEqual([]);
        expect(harness.publication.currentRevision()).toBe(1);

        // The next visible change advances every subscriber together.
        joinSeat(harness, match, 'Bob', 'Orion');
        expect(lateEvents).toHaveLength(1);
        expect(latestSnapshot(lateEvents).revision).toBe(2);
    });

    it('stops delivery after unsubscribe; repeated unsubscribes are harmless', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        const sinkEvents: LobbyEvent[] = [];
        const unsubscribe = harness.publication.subscribe((event) => sinkEvents.push(event));

        unsubscribe();
        unsubscribe();

        joinSeat(harness, match, 'Bob', 'Orion');
        expect(sinkEvents).toEqual([]);
        expect(harness.events).toHaveLength(2);
    });

    it('preserves stable creation order across mutations', () => {
        const harness = makeHarness();
        const a = createWaitingMatch(harness).match;
        const b = createWaitingMatch(harness).match;
        const c = createWaitingMatch(harness).match;
        expect(entryOrder(latestSnapshot(harness.events))).toEqual([a.matchId, b.matchId, c.matchId]);

        collectMatch(harness, b);
        expect(entryOrder(latestSnapshot(harness.events))).toEqual([a.matchId, c.matchId]);

        const d = createWaitingMatch(harness).match;
        expect(entryOrder(latestSnapshot(harness.events))).toEqual([a.matchId, c.matchId, d.matchId]);
    });
});

// ----------------------------------------------------------------------------
// Privacy envelope
// ----------------------------------------------------------------------------

describe('privacy envelope (NFR-003 / FR-024)', () => {
    it('publishes zero private values across a full two-player lifecycle', () => {
        const harness = makeHarness();
        const { match, host } = createWaitingMatch(harness);
        const joiner = makeGuest('Bob', 'Orion');
        addSeatToFillingMatch(match, joiner.session, match.seats.size, CLOCK_MS);
        harness.bridgeFixture.fireOnSeatClaimed(seatClaimedEvent({ matchId: match.matchId, playerId: null }));
        startMatch(harness, match);
        finishMatch(harness, match);

        // Live private values actually held by the records under test —
        // opaque ids, handles, display names, session ids, CSPRNG tokens.
        const secrets: string[] = [
            host.guestPlayerId,
            joiner.guestPlayerId,
            'Nova',
            'Orion',
            'Alice',
            'Bob',
            host.session.playerSessionId,
            joiner.session.playerSessionId,
        ];
        for (const seat of match.seats.values()) {
            secrets.push(seat.sessionToken);
            secrets.push(seat.handle ?? '');
            secrets.push(seat.displayName);
        }

        const surfaces: string[] = harness.events.map((event) => JSON.stringify(event) ?? '');
        surfaces.push(JSON.stringify(harness.publication.snapshotFor()) ?? '');
        expect(surfaces.length).toBeGreaterThan(0);
        for (const surface of surfaces) {
            for (const secret of secrets) {
                if (secret.length > 0) {
                    expect(surface).not.toContain(secret);
                }
            }
        }

        // The entry shape itself is the envelope: exactly six contract fields.
        for (const event of harness.events) {
            if (event.kind !== 'snapshot') {
                continue;
            }
            for (const entry of event.snapshot.entries) {
                expect(Object.keys(entry).sort()).toEqual([
                    'boardSize',
                    'capacity',
                    'matchId',
                    'seatsFilled',
                    'status',
                    'tickIntervalMs',
                ]);
            }
        }
    });
});

// ----------------------------------------------------------------------------
// Defensive inputs + shutdown
// ----------------------------------------------------------------------------

describe('defensive inputs and shutdown', () => {
    it('absorbs events for unknown match ids without crashing or bumping', () => {
        const harness = makeHarness();
        const unknown = nextLobbyStyleUnknownId();

        harness.bridgeFixture.fireOnSeatClaimed(seatClaimedEvent({ matchId: unknown }));
        harness.bridgeFixture.fireOnSeatDisconnected(seatDisconnectedEvent({ matchId: unknown }));
        harness.bridgeFixture.fireOnSeatReconnected(seatReconnectedEvent({ matchId: unknown }));
        harness.bridgeFixture.fireOnSeatExpired(seatExpiredEvent({ matchId: unknown }));
        harness.bridgeFixture.fireOnMatchTerminal(matchTerminalEvent({ matchId: unknown }));
        harness.bus.emit({ matchId: unknown, from: null, to: 'filling', atMs: CLOCK_MS });
        harness.bus.emit({ matchId: unknown, from: 'running', to: 'collected', atMs: CLOCK_MS });

        expect(harness.events).toEqual([]);
        expect(harness.publication.currentRevision()).toBe(0);
    });

    it('close() detaches sinks, clears the projection, ignores stragglers, and stays idempotent', () => {
        const harness = makeHarness();
        const { match } = createWaitingMatch(harness);
        expect(harness.publication.currentRevision()).toBe(1);

        harness.publication.close();
        harness.publication.close();

        expect(harness.publication.snapshotFor().entries).toEqual([]);
        expect(harness.publication.currentRevision()).toBe(1);
        expect(() => harness.publication.subscribe(() => {})).toThrow(/closed/);

        // Stragglers during teardown are absorbed quietly — a passive
        // observer must never corrupt the primary lifecycle sweep.
        collectMatch(harness, match);
        harness.bridgeFixture.fireOnSeatClaimed(seatClaimedEvent({ matchId: match.matchId }));

        expect(harness.events).toHaveLength(1);
        expect(harness.publication.currentRevision()).toBe(1);
        expect(harness.publication.snapshotFor().entries).toEqual([]);
    });
});

/** Mint a well-formed `MatchId` that no store record will ever hold. */
function nextLobbyStyleUnknownId(): MatchId {
    seq += 1;
    return `match-unknown-${String(seq).padStart(4, '0')}` as MatchId;
}
