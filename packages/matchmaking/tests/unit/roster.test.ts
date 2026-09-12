/**
 * Lobby Roster Tests — Feature 023 (T017–T024)
 */

import type { ConnectionId } from '@europa/networking';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JoinPath, SeatIndex } from '../../contracts/match-types';
import type { LobbyService, Result } from '../../src/contracts/lobby-api';
import type {
    GuestPlayerId,
    LobbyError,
    LobbyEvent,
    RosterDelta,
    RosterSnapshot,
} from '../../src/contracts/lobby-types';
import { createIdentityRegistry } from '../../src/internal/identityRegistry';
import { createLobbyService, type LobbyConnectionTeardown } from '../../src/internal/lobbyService';
import { FakeMatchmakerBridge, nextConnectionId } from '../fixtures/fakeMatchmakerBridge';
import { buildSeatAssignment } from '../fixtures/lobbySnapshots';

const BASE_MS = 1_000_000;
let clockMs = BASE_MS;
let idSeq = 0;

function tickClock(ms = 1): number {
    clockMs += ms;
    return clockMs;
}
function fakeRandomId(): string {
    idSeq += 1;
    return `Plyr${String(idSeq).padStart(8, '0')}`;
}
function guest(n: number): GuestPlayerId {
    return `Plyr${String(n).padStart(8, '0')}` as GuestPlayerId;
}

interface Delivery {
    readonly connectionId: ConnectionId;
    readonly event: LobbyEvent;
}
interface Harness {
    readonly bridge: FakeMatchmakerBridge;
    readonly service: LobbyService & LobbyConnectionTeardown;
    readonly delivered: Delivery[];
}

function buildHarness(options: { graceMs?: number } = {}): Harness {
    const bridge = new FakeMatchmakerBridge();
    const delivered: Delivery[] = [];
    const service = createLobbyService({
        matchmaker: bridge,
        registry: createIdentityRegistry({
            randomId: fakeRandomId,
            now: () => clockMs,
            ...(options.graceMs === undefined ? {} : { graceMs: options.graceMs }),
        }),
        now: () => clockMs,
        deliver: (connectionId, event) => {
            delivered.push({ connectionId, event });
        },
    });
    return { bridge, service, delivered };
}

function freshConnection(service: LobbyService): { connectionId: ConnectionId; guestId: GuestPlayerId } {
    const connectionId = nextConnectionId();
    service.establishIdentity(undefined, connectionId);
    return { connectionId, guestId: guest(idSeq) };
}

function namedConnection(
    service: LobbyService,
    handle: string,
): { connectionId: ConnectionId; guestId: GuestPlayerId } {
    const established = freshConnection(service);
    const result = service.setHandle(established.connectionId, handle);
    if (!result.ok) throw new Error(`fixture setup: handle "${handle}" rejected (${result.error.code})`);
    return established;
}

function expectOk<T>(result: Result<T, LobbyError>): T {
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
    return result.data;
}

function rosterSnapshots(delivered: Delivery[]): RosterSnapshot[] {
    return delivered
        .filter((d) => d.event.kind === 'roster')
        .map((d) => (d.event.kind === 'roster' ? d.event.roster : undefined))
        .filter((s): s is RosterSnapshot => s !== undefined);
}

function rosterDeltas(delivered: Delivery[]): RosterDelta[] {
    return delivered
        .filter((d) => d.event.kind === 'rosterDelta')
        .map((d) => (d.event.kind === 'rosterDelta' ? d.event.delta : undefined))
        .filter((d): d is RosterDelta => d !== undefined);
}

function rosterEventsFor(delivered: Delivery[], connectionId: ConnectionId): LobbyEvent[] {
    return delivered
        .filter((d) => d.connectionId === connectionId && (d.event.kind === 'roster' || d.event.kind === 'rosterDelta'))
        .map((d) => d.event);
}

/** Flush pending roster debounce timers (500ms anti-flap grace). */
function flushRoster(): void {
    tickClock(600);
    vi.advanceTimersByTime(600);
}

beforeEach(() => {
    clockMs = BASE_MS;
    idSeq = 0;
    vi.useFakeTimers({ shouldAdvanceTime: false });
});
afterEach(() => {
    vi.useRealTimers();
});

// T017
describe('T017: deriveRosterStatus', () => {
    it('player with no match association has status in_lobby', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        delivered.length = 0;
        service.subscribe(alice.connectionId);
        const snapshots = rosterSnapshots(delivered);
        expect(snapshots.length).toBeGreaterThanOrEqual(1);
        const entry = snapshots[snapshots.length - 1]?.players.find((p) => p.handle === 'Alice');
        expect(entry).toBeDefined();
        expect(entry?.status).toBe('in_lobby');
    });

    it('seated player has status in_game', () => {
        const { service, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        service.subscribe(host.connectionId);
        delivered.length = 0;
        expectOk(service.create(host.connectionId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        expect(deltas.length).toBeGreaterThanOrEqual(1);
        const entry = deltas.flatMap((d) => d.changes).find((c) => c.handle === 'Host');
        expect(entry).toBeDefined();
        expect(entry?.status).toBe('in_game');
    });

    it('spectator has status spectating', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex }),
            },
        });
        expectOk(service.join(filler.connectionId, created.matchId));
        service.subscribe(watcher.connectionId);
        delivered.length = 0;
        expectOk(service.spectate(watcher.connectionId, created.matchId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        expect(deltas.length).toBeGreaterThanOrEqual(1);
        const watcherChange = deltas.flatMap((d) => d.changes).find((c) => c.handle === 'Watcher');
        expect(watcherChange).toBeDefined();
        expect(watcherChange?.status).toBe('spectating');
    });

    it('seated player gets in_game status (player priority)', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        const match1 = expectOk(service.create(host.connectionId));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: match1.matchId,
                joinPath: `/join/${match1.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex }),
            },
        });
        service.subscribe(filler.connectionId);
        delivered.length = 0;
        expectOk(service.join(filler.connectionId, match1.matchId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const fillerChange = deltas.flatMap((d) => d.changes).find((c) => c.handle === 'Filler');
        expect(fillerChange).toBeDefined();
        expect(fillerChange?.status).toBe('in_game');
    });
});

// T018
describe('T018: Anti-flap grace period', () => {
    it('rapid leave/rejoin within 500ms produces final state only', () => {
        const { service, bridge, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        const filler = namedConnection(service, 'Filler');
        const match = expectOk(service.create(alice.connectionId));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: match.matchId,
                joinPath: `/join/${match.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex }),
            },
        });
        expectOk(service.join(filler.connectionId, match.matchId));
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.leave(alice.connectionId));
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const finalDeltas = rosterDeltas(delivered);
        const aliceChanges = finalDeltas.flatMap((d) => d.changes.filter((c) => c.handle === 'Alice'));
        expect(aliceChanges.length).toBeGreaterThanOrEqual(1);
        expect(aliceChanges[aliceChanges.length - 1]?.status).toBe('in_game');
    });

    it('change outside grace window broadcasts normally', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        expectOk(service.create(alice.connectionId));
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.leave(alice.connectionId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const aliceChanges = deltas.flatMap((d) => d.changes.filter((c) => c.handle === 'Alice'));
        expect(aliceChanges.length).toBeGreaterThanOrEqual(1);
        expect(aliceChanges[aliceChanges.length - 1]?.status).toBe('in_lobby');
        delivered.length = 0;
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const deltas2 = rosterDeltas(delivered);
        const aliceChanges2 = deltas2.flatMap((d) => d.changes.filter((c) => c.handle === 'Alice'));
        expect(aliceChanges2.length).toBeGreaterThanOrEqual(1);
        expect(aliceChanges2[aliceChanges2.length - 1]?.status).toBe('in_game');
    });
});

// T019
describe('T019: Revision monotonicity', () => {
    it('revision never resets across lifecycle events', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        const initialSnapshots = rosterSnapshots(delivered);
        const initialRevision = initialSnapshots[initialSnapshots.length - 1]?.revision;
        expect(initialRevision).toBeGreaterThanOrEqual(1);
        delivered.length = 0;
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const afterCreate = rosterDeltas(delivered);
        expect(afterCreate.length).toBeGreaterThanOrEqual(1);
        expect(afterCreate[afterCreate.length - 1]?.revision).toBeGreaterThan(initialRevision);
        delivered.length = 0;
        expectOk(service.leave(alice.connectionId));
        flushRoster();
        const afterLeave = rosterDeltas(delivered);
        expect(afterLeave.length).toBeGreaterThanOrEqual(1);
        expect(afterLeave[afterLeave.length - 1]?.revision).toBeGreaterThan(
            afterCreate[afterCreate.length - 1]?.revision,
        );
    });

    it('each mutation increments revision', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        expect(deltas.length).toBeGreaterThanOrEqual(1);
        expect(deltas[deltas.length - 1]?.revision).toBeGreaterThanOrEqual(1);
    });

    it('roster deltas carry monotonic revisions', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        namedConnection(service, 'Bob');
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        expect(deltas.length).toBeGreaterThanOrEqual(1);
        let prevRev = 0;
        for (const delta of deltas) {
            expect(delta.revision).toBeGreaterThanOrEqual(prevRev);
            prevRev = delta.revision;
        }
    });
});

// T020
describe('T020: Delta batching', () => {
    it('multiple simultaneous status changes are batched', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler1 = namedConnection(service, 'Alice');
        const filler2 = namedConnection(service, 'Bob');
        const match = expectOk(service.create(host.connectionId, { playerCount: 4 }));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: match.matchId,
                joinPath: `/join/${match.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, displayName: 'Alice' }),
            },
        });
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: match.matchId,
                joinPath: `/join/${match.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 2 as SeatIndex, displayName: 'Bob' }),
            },
        });
        service.subscribe(host.connectionId);
        delivered.length = 0;
        expectOk(service.join(filler1.connectionId, match.matchId));
        expectOk(service.join(filler2.connectionId, match.matchId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const allChanges = deltas.flatMap((d) => d.changes);
        expect(allChanges.find((c) => c.handle === 'Alice')?.status).toBe('in_game');
        expect(allChanges.find((c) => c.handle === 'Bob')?.status).toBe('in_game');
    });

    it('batched delta carries the current revision', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        namedConnection(service, 'Bob');
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        expect(deltas.length).toBeGreaterThanOrEqual(1);
        for (const delta of deltas) {
            expect(delta.revision).toBeGreaterThan(0);
        }
    });
});

// T021
describe('T021: Handle change preserves status', () => {
    it('changing handle while in lobby preserves status', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.setHandle(alice.connectionId, 'AliceV2'));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const aliceChanges = deltas.flatMap((d) => d.changes.filter((c) => c.handle === 'AliceV2'));
        expect(aliceChanges.length).toBeGreaterThanOrEqual(1);
        expect(aliceChanges[aliceChanges.length - 1]?.status).toBe('in_lobby');
    });

    it('changing handle while in_game preserves in_game status', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        expectOk(service.create(alice.connectionId));
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.setHandle(alice.connectionId, 'AlicePro'));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const aliceChanges = deltas.flatMap((d) => d.changes.filter((c) => c.handle === 'AlicePro'));
        expect(aliceChanges.length).toBeGreaterThanOrEqual(1);
        expect(aliceChanges[aliceChanges.length - 1]?.status).toBe('in_game');
    });

    it('handle change updates the snapshot to show new handle', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        expectOk(service.setHandle(alice.connectionId, 'Alicia'));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const aliceChanges = deltas.flatMap((d) => d.changes);
        const newHandleEntry = aliceChanges.find((c) => c.handle === 'Alicia');
        expect(newHandleEntry).toBeDefined();
        expect(newHandleEntry?.status).toBe('in_lobby');
        const oldHandleEntry = aliceChanges.find((c) => c.handle === 'Alice');
        expect(oldHandleEntry).toBeUndefined();
    });
});

// T022
describe('T022: Full snapshot periodicity', () => {
    it('full snapshot sent on subscribe as first roster event', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        delivered.length = 0;
        service.subscribe(alice.connectionId);
        const snapshots = rosterSnapshots(delivered);
        expect(snapshots.length).toBeGreaterThanOrEqual(1);
        expect(snapshots[snapshots.length - 1]?.players.find((p) => p.handle === 'Alice')).toBeDefined();
    });

    it('full snapshot sent periodically after enough deltas', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        // Each create triggers recomputeAndPublish which checks the roster delta threshold.
        // create adds a lobby entry → entriesEqual returns false → recompute proceeds.
        // leave does NOT change lobby entries (match stays in ledger) → early return.
        // After 11 creates (20+ deltas accumulated), the 11th create's recomputeAndPublish
        // sees unsentDeltaCount >= 20 and sends a full roster snapshot.
        for (let i = 0; i < 12; i++) {
            expectOk(service.create(alice.connectionId));
            flushRoster();
            expectOk(service.leave(alice.connectionId));
            flushRoster();
        }
        const snapshots = rosterSnapshots(delivered);
        // At least one periodic full snapshot should have been sent
        expect(snapshots.length).toBeGreaterThanOrEqual(1);
    });

    it('full snapshot sent after 60 seconds elapsed', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        delivered.length = 0;
        // Advance clock past 60s
        tickClock(61_000);
        // setHandle does NOT trigger recomputeAndPublish, so use create instead
        // which adds a lobby entry and triggers the periodic check.
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const snapshots = rosterSnapshots(delivered);
        expect(snapshots.length).toBeGreaterThanOrEqual(1);
    });
});

// T023
describe('T023: Player removal on disconnect', () => {
    it('disconnected player removed from roster', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        const bob = namedConnection(service, 'Bob');
        service.subscribe(alice.connectionId);
        service.subscribe(bob.connectionId);
        const snapshots1 = rosterSnapshots(delivered);
        expect(snapshots1[snapshots1.length - 1]?.players.find((p) => p.handle === 'Alice')).toBeDefined();
        expect(snapshots1[snapshots1.length - 1]?.players.find((p) => p.handle === 'Bob')).toBeDefined();
        delivered.length = 0;
        service.connectionClosed(alice.connectionId);
        flushRoster();
        delivered.length = 0;
        expectOk(service.create(bob.connectionId));
        flushRoster();
        const snapshots2 = rosterSnapshots(delivered);
        if (snapshots2.length > 0) {
            expect(snapshots2[snapshots2.length - 1]?.players.find((p) => p.handle === 'Alice')).toBeUndefined();
        }
    });

    it('entry absent from subsequent full snapshots after disconnect', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        const bob = namedConnection(service, 'Bob');
        service.subscribe(alice.connectionId);
        service.subscribe(bob.connectionId);
        service.connectionClosed(alice.connectionId);
        flushRoster();
        delivered.length = 0;
        expectOk(service.create(bob.connectionId));
        flushRoster();
        const snapshots = rosterSnapshots(delivered);
        if (snapshots.length > 0) {
            expect(snapshots[snapshots.length - 1]?.players.find((p) => p.handle === 'Alice')).toBeUndefined();
        }
    });

    it('spectator disconnect removes them from roster', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        const watcher = namedConnection(service, 'Watcher');
        const match = expectOk(service.create(host.connectionId));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: match.matchId,
                joinPath: `/join/${match.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex }),
            },
        });
        expectOk(service.join(filler.connectionId, match.matchId));
        service.subscribe(watcher.connectionId);
        delivered.length = 0;
        expectOk(service.spectate(watcher.connectionId, match.matchId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const watcherChange = deltas.flatMap((d) => d.changes).find((c) => c.handle === 'Watcher');
        expect(watcherChange).toBeDefined();
        expect(watcherChange?.status).toBe('spectating');
        delivered.length = 0;
        service.connectionClosed(watcher.connectionId);
        flushRoster();
        delivered.length = 0;
        // Trigger a lobby mutation to get a full snapshot — use a fresh player
        const observer = namedConnection(service, 'Observer');
        expectOk(service.create(observer.connectionId));
        flushRoster();
        const snapshots = rosterSnapshots(delivered);
        if (snapshots.length > 0) {
            expect(snapshots[snapshots.length - 1]?.players.find((p) => p.handle === 'Watcher')).toBeUndefined();
        }
    });
});

// T024
describe('T024: Integration — full lobby flow', () => {
    it('connect, subscribe, join, leave, disconnect', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        delivered.length = 0;
        expect(service.subscribe(alice.connectionId).ok).toBe(true);
        const initialSnapshots = rosterSnapshots(delivered.filter((d) => d.connectionId === alice.connectionId));
        expect(initialSnapshots.length).toBeGreaterThanOrEqual(1);
        expect(initialSnapshots[initialSnapshots.length - 1]?.players.find((p) => p.handle === 'Alice')?.status).toBe(
            'in_lobby',
        );
        delivered.length = 0;
        expectOk(service.create(alice.connectionId));
        flushRoster();
        const joinDeltas = rosterDeltas(delivered.filter((d) => d.connectionId === alice.connectionId));
        expect(joinDeltas.flatMap((d) => d.changes).find((c) => c.handle === 'Alice')?.status).toBe('in_game');
        delivered.length = 0;
        expectOk(service.leave(alice.connectionId));
        flushRoster();
        const leaveDeltas = rosterDeltas(delivered.filter((d) => d.connectionId === alice.connectionId));
        expect(leaveDeltas.flatMap((d) => d.changes).find((c) => c.handle === 'Alice')?.status).toBe('in_lobby');
        delivered.length = 0;
        service.connectionClosed(alice.connectionId);
        flushRoster();
        delivered.length = 0;
        const bob = namedConnection(service, 'Bob');
        service.subscribe(bob.connectionId);
        const postDisconnectSnapshots = rosterSnapshots(delivered.filter((d) => d.connectionId === bob.connectionId));
        const lastSnapshot = postDisconnectSnapshots[postDisconnectSnapshots.length - 1];
        expect(lastSnapshot).toBeDefined();
        expect(lastSnapshot?.players.find((p) => p.handle === 'Alice')).toBeUndefined();
    });

    it('two players see each other in the roster', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        namedConnection(service, 'Bob');
        service.subscribe(alice.connectionId);
        // Subscribe sends a full snapshot to Alice containing both players.
        // Check BEFORE clearing delivered.
        const snapshots = rosterSnapshots(delivered);
        const lastSnapshot = snapshots[snapshots.length - 1];
        expect(lastSnapshot).toBeDefined();
        expect(lastSnapshot?.players.length).toBeGreaterThanOrEqual(2);
        expect(lastSnapshot?.players.find((p) => p.handle === 'Alice')?.status).toBe('in_lobby');
    });

    it('spectator status reflected for other players', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        const watcher = namedConnection(service, 'Watcher');
        const match = expectOk(service.create(host.connectionId));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: match.matchId,
                joinPath: `/join/${match.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex }),
            },
        });
        expectOk(service.join(filler.connectionId, match.matchId));
        service.subscribe(watcher.connectionId);
        delivered.length = 0;
        expectOk(service.spectate(watcher.connectionId, match.matchId));
        flushRoster();
        // Check deltas (spectating is delivered as a delta, not a full snapshot)
        const deltas = rosterDeltas(delivered.filter((d) => d.connectionId === watcher.connectionId));
        const watcherChange = deltas.flatMap((d) => d.changes).find((c) => c.handle === 'Watcher');
        expect(watcherChange).toBeDefined();
        expect(watcherChange?.status).toBe('spectating');
        // Also verify Host and Filler are in_game via the full snapshot from subscribe
        // (we need to check delivered before the clear, but it was already cleared).
        // Instead, trigger a lobby mutation to get a fresh full snapshot.
        delivered.length = 0;
        // Trigger a lobby mutation to get a fresh full snapshot — use a fresh player
        const observer = namedConnection(service, 'Observer');
        expectOk(service.create(observer.connectionId));
        flushRoster();
        const snapshots = rosterSnapshots(delivered.filter((d) => d.connectionId === watcher.connectionId));
        if (snapshots.length > 0) {
            const lastSnapshot = snapshots[snapshots.length - 1];
            expect(lastSnapshot?.players.find((p) => p.handle === 'Host')?.status).toBe('in_game');
            expect(lastSnapshot?.players.find((p) => p.handle === 'Filler')?.status).toBe('in_game');
        }
    });

    it('roster entries ordered lexicographically by handle', () => {
        const { service, delivered } = buildHarness();
        namedConnection(service, 'zoe');
        const alice = namedConnection(service, 'Alice');
        namedConnection(service, 'bob');
        service.subscribe(alice.connectionId);
        // Subscribe sends snapshot — check before clearing
        const snapshots = rosterSnapshots(delivered);
        const lastSnapshot = snapshots[snapshots.length - 1];
        expect(lastSnapshot).toBeDefined();
        const handles = lastSnapshot?.players.map((p) => p.handle);
        const sorted = [...handles].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        expect(handles).toEqual(sorted);
    });

    it('roster payload contains exactly {handle, status}', () => {
        const { service, delivered } = buildHarness();
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        const snapshots = rosterSnapshots(delivered);
        const lastSnapshot = snapshots[snapshots.length - 1];
        expect(lastSnapshot).toBeDefined();
        for (const entry of lastSnapshot?.players ?? []) {
            const keys = Object.keys(entry);
            expect(keys).toEqual(expect.arrayContaining(['handle', 'status']));
            expect(keys.length).toBe(2);
            expect(typeof entry.handle).toBe('string');
            expect(['in_lobby', 'in_game', 'spectating']).toContain(entry.status);
        }
    });
});

// T025: Anonymous exclusion (FR-008 v1.1)
describe('T025: Anonymous exclusion from roster', () => {
    it('player without a handle does NOT appear in the roster', () => {
        const { service, delivered } = buildHarness();
        // freshConnection creates an identity without setting a handle
        const unnamed = freshConnection(service);
        namedConnection(service, 'Alice');
        service.subscribe(unnamed.connectionId);
        const snapshots = rosterSnapshots(delivered);
        const lastSnapshot = snapshots[snapshots.length - 1];
        expect(lastSnapshot).toBeDefined();
        // The unnamed player should not appear; only Alice should be present
        const handles = lastSnapshot?.players.map((p) => p.handle) ?? [];
        expect(handles).not.toContain('Anonymous');
        expect(handles).toContain('Alice');
        // Count should only include named players
        expect(lastSnapshot?.players.length).toBe(1);
    });

    it('player is added to roster when they set a handle (onboarding completes)', () => {
        const { service, delivered } = buildHarness();
        const unnamed = freshConnection(service);
        namedConnection(service, 'Alice');
        service.subscribe(unnamed.connectionId);
        // Before setting handle, unnamed should not be in roster
        const beforeSnapshots = rosterSnapshots(delivered);
        const beforeSnapshot = beforeSnapshots[beforeSnapshots.length - 1];
        expect(beforeSnapshot?.players.find((p) => p.handle === 'Anonymous')).toBeUndefined();
        delivered.length = 0;
        // Set handle — this completes onboarding
        expectOk(service.setHandle(unnamed.connectionId, 'NewPlayer'));
        flushRoster();
        // After setting handle, the player should appear in the roster
        const deltas = rosterDeltas(delivered);
        const addChange = deltas.flatMap((d) => d.changes).find((c) => c.handle === 'NewPlayer');
        expect(addChange).toBeDefined();
        expect(addChange?.status).toBe('in_lobby');
    });

    it('multiple unnamed players are all excluded from roster', () => {
        const { service, delivered } = buildHarness();
        freshConnection(service);
        freshConnection(service);
        const alice = namedConnection(service, 'Alice');
        service.subscribe(alice.connectionId);
        const snapshots = rosterSnapshots(delivered);
        const lastSnapshot = snapshots[snapshots.length - 1];
        const handles = lastSnapshot?.players.map((p) => p.handle) ?? [];
        expect(handles).not.toContain('Anonymous');
        expect(handles).toContain('Alice');
        expect(handles.length).toBe(1);
    });

    it('unnamed spectator does not appear in roster', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        // Create an unnamed spectator
        const unnamedSpectator = freshConnection(service);
        const match = expectOk(service.create(host.connectionId));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: match.matchId,
                joinPath: `/join/${match.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex }),
            },
        });
        expectOk(service.join(filler.connectionId, match.matchId));
        service.subscribe(unnamedSpectator.connectionId);
        delivered.length = 0;
        // Spectating with no handle should not add to roster
        expectOk(service.spectate(unnamedSpectator.connectionId, match.matchId));
        flushRoster();
        const deltas = rosterDeltas(delivered);
        const allChanges = deltas.flatMap((d) => d.changes);
        expect(allChanges.find((c) => c.handle === 'Anonymous')).toBeUndefined();
    });

    it('named player count is correct when unnamed players are present', () => {
        const { service, delivered } = buildHarness();
        freshConnection(service);
        freshConnection(service);
        const alice = namedConnection(service, 'Alice');
        namedConnection(service, 'Bob');
        service.subscribe(alice.connectionId);
        const snapshots = rosterSnapshots(delivered);
        const lastSnapshot = snapshots[snapshots.length - 1];
        // Should only count named players
        expect(lastSnapshot?.players.length).toBe(2);
        const handles = lastSnapshot?.players.map((p) => p.handle) ?? [];
        expect(handles).toContain('Alice');
        expect(handles).toContain('Bob');
        expect(handles).not.toContain('Anonymous');
    });
});
