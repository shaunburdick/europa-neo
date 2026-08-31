/**
 * Lobby facade orchestration suites — Feature 010 (T-007)
 *
 * Covers ONLY the facade's own logic against the T-004 fixtures:
 *
 *   - identity setup flows (fresh/restore/forged/expired claims,
 *     connection rebinding) wired through the T-005 registry;
 *   - recoverable error mapping (guard codes + the upstream
 *     `MatchmakerErrorCode` → `LobbyErrorCode` table);
 *   - delegation boundaries (what reaches feature 006's matchmaker,
 *     what deliberately does not);
 *   - projection correctness (privacy envelope, stable order,
 *     personalized `activeMatchId`, monotonic revisions, fill
 *     detection, terminal/stale row drops);
 *   - lifecycle bridge hooks (grace/reconnect/expiry/terminal);
 *   - the single projection path (R-006): diff-gated, exactly-once
 *     revisions under duplicate and no-op event pressure;
 *   - the transport teardown hook `connectionClosed` (R-006);
 *   - close semantics.
 *
 * Deliberately NOT re-tested here (already pinned elsewhere): handle
 * validation corpora and registry internals (T-005 suites), record
 * association transitions (T-006 suite), contract shapes (conformance
 * witnesses), and feature-006 matchmaker behavior (its own suites).
 *
 * Determinism: injected clock + sequential id generator; every wait is
 * absent by construction — the facade is synchronous except `close`.
 */

import type { ConnectionId, MatchId } from '@europa/networking';
import { beforeEach, describe, expect, it } from 'vitest';

import type { JoinPath, PlayerId, SeatIndex } from '../../contracts/match-types';
import type { LobbyService, Result } from '../../src/contracts/lobby-api';
import type {
    GuestPlayerId,
    LobbyError,
    LobbyErrorCode,
    LobbyEvent,
    LobbySnapshot,
} from '../../src/contracts/lobby-types';
import { makeError } from '../../src/errors';
import { createIdentityRegistry } from '../../src/internal/identityRegistry';
import { createLobbyService, type LobbyConnectionTeardown } from '../../src/internal/lobbyService';
import {
    FakeMatchmakerBridge,
    matchTerminalEvent,
    nextConnectionId,
    seatClaimedEvent,
    seatDisconnectedEvent,
    seatExpiredEvent,
    seatReconnectedEvent,
} from '../fixtures/fakeMatchmakerBridge';
import { buildSeatAssignment } from '../fixtures/lobbySnapshots';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

/** Base epoch reading; every test advances from here. */
const BASE_MS = 1_000_000;

let clockMs = BASE_MS;
let idSeq = 0;

/** Advance the injected clock and return the new reading. */
function tickClock(ms = 1): number {
    clockMs += ms;
    return clockMs;
}

/** Sequential opaque-id generator handed to the identity registry. */
function fakeRandomId(): string {
    idSeq += 1;
    return `g-${idSeq}`;
}

/** The n-th minted guest id (registry ids are `g-<seq>` by construction). */
function guest(n: number): GuestPlayerId {
    return `g-${n}` as GuestPlayerId;
}

/** One recorded outbound delivery from the facade under test. */
interface Delivery {
    readonly connectionId: ConnectionId;
    readonly event: LobbyEvent;
}

interface Harness {
    readonly bridge: FakeMatchmakerBridge;
    readonly service: LobbyService & LobbyConnectionTeardown;
    readonly delivered: Delivery[];
}

/**
 * Fresh facade + fake matchmaker + delivery recorder. The facade self-
 * registers its lifecycle handlers with the fake's listener seam, so
 * `fireOn*` triggers reach it without extra wiring.
 */
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

/** Establish a fresh unnamed identity; returns the connection and its minted guest id. */
function freshConnection(service: LobbyService): { connectionId: ConnectionId; guestId: GuestPlayerId } {
    const connectionId = nextConnectionId();
    service.establishIdentity(undefined, connectionId);
    return { connectionId, guestId: guest(idSeq) };
}

/** Establish AND name an identity in one step (the ready-to-act shape). */
function namedConnection(
    service: LobbyService,
    handle: string,
): { connectionId: ConnectionId; guestId: GuestPlayerId } {
    const established = freshConnection(service);
    const result = service.setHandle(established.connectionId, handle);
    if (!result.ok) {
        throw new Error(`fixture setup: handle "${handle}" rejected (${result.error.code})`);
    }
    return established;
}

/** Unwrap-or-throw helper for expected-success results in happy-path tests. */
function expectOk<T>(result: Result<T, LobbyError>): T {
    if (!result.ok) {
        throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
    }
    return result.data;
}

/** Assert a result fails with exactly the given lobby error code. */
function expectErr(result: Result<unknown, LobbyError>, code: LobbyErrorCode): void {
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error.code).toBe(code);
    }
}

/** All snapshot events delivered so far, in order. */
function deliveredSnapshots(delivered: Delivery[]): LobbySnapshot[] {
    return delivered
        .filter((d) => d.event.kind === 'snapshot')
        .map((d) => (d.event.kind === 'snapshot' ? d.event.snapshot : []));
}

beforeEach(() => {
    clockMs = BASE_MS;
    idSeq = 0;
});

// ----------------------------------------------------------------------------
// Identity setup (establish / restore / rename)
// ----------------------------------------------------------------------------

describe('establishIdentity', () => {
    it('mints an unnamed identity for a first visit and reports it on the connection', () => {
        const { service, delivered } = buildHarness();
        const connectionId = nextConnectionId();

        const state = service.establishIdentity(undefined, connectionId);
        expect(state).toEqual({ handle: null, hasIdentity: true });

        const identityEvents = delivered.filter((d) => d.connectionId === connectionId && d.event.kind === 'identity');
        expect(identityEvents).toHaveLength(1);
        // Privacy envelope (spec Clarifications v1.6): the DIRECTED
        // delivery carries exactly this connection's OWN opaque id (the
        // FR-003 resume-claim channel) — and no OTHER identity's id.
        const first = identityEvents[0];
        if (first === undefined || first.event.kind !== 'identity') {
            throw new Error('unreachable: one identity delivery asserted above');
        }
        expect(first.event.identity).toEqual({ handle: null, hasIdentity: true, guestPlayerId: guest(1) });
    });

    it('restores the same identity and handle for a matching claim within grace', () => {
        const { service } = buildHarness();
        const first = freshConnection(service);
        expectOk(service.setHandle(first.connectionId, 'Nova'));

        // Simulate the transport dropping the connection: grace begins.
        const second = freshConnection(service);
        expectOk(service.setHandle(second.connectionId, 'Other'));

        const restored = service.establishIdentity(
            { guestPlayerId: first.guestId, handle: 'Nova' },
            nextConnectionId(),
        );
        expect(restored).toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('silently mints a FRESH identity for a forged/unknown claim (never throws)', () => {
        const { service } = buildHarness();
        const forged = service.establishIdentity(
            { guestPlayerId: 'g-does-not-exist' as GuestPlayerId, handle: 'Ghost' },
            nextConnectionId(),
        );
        // Establishment cannot fail; the stale claim is ignored entirely —
        // including its advisory handle (a fresh identity is unnamed).
        expect(forged).toEqual({ handle: null, hasIdentity: true });
    });

    it('mints fresh when the grace window behind a claim has expired', () => {
        const { service, bridge } = buildHarness({ graceMs: 1_000 });
        const first = freshConnection(service);
        expectOk(service.setHandle(first.connectionId, 'Nova'));
        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: first.connectionId }));

        tickClock(1_000); // grace boundary uses >= (networking convention)
        const late = service.establishIdentity({ guestPlayerId: first.guestId }, nextConnectionId());
        expect(late).toEqual({ handle: null, hasIdentity: true });
    });

    it('evicts a predecessor connection when the same identity re-establishes', () => {
        const { service } = buildHarness();
        const first = freshConnection(service);
        const rebind = service.establishIdentity({ guestPlayerId: first.guestId }, nextConnectionId());

        expect(rebind).toEqual({ handle: null, hasIdentity: true });
        // The old connection no longer resolves to anything actionable.
        expectErr(service.setHandle(first.connectionId, 'Nova'), 'identity_invalid');
    });

    it('re-establishing a DIFFERENT identity on a connection releases the old one to grace (F-8)', () => {
        const { service } = buildHarness({ graceMs: 1_000 });
        const conn = freshConnection(service);
        expectOk(service.setHandle(conn.connectionId, 'Nova'));

        // Overwrite: the same connection now belongs to a brand-new guest.
        // The abandoned guest must not linger ACTIVE forever, squatting its
        // reserved handle (review F-8 / security HIGH-2).
        service.establishIdentity(undefined, conn.connectionId);

        // The OLD identity's handle stays reserved through its grace window…
        const challenger = freshConnection(service);
        expectErr(service.setHandle(challenger.connectionId, 'nova'), 'handle_taken');

        // …and frees once grace lapses (manual clock; lazy sweep).
        tickClock(1_000);
        expectOk(service.setHandle(freshConnection(service).connectionId, 'NOVA'));
    });

    it('re-establishing the SAME identity starts no spurious grace window', () => {
        const { service } = buildHarness({ graceMs: 1_000 });
        const first = freshConnection(service);
        expectOk(service.setHandle(first.connectionId, 'Nova'));

        // The ordinary refresh flow: same claim, same connection.
        const rebound = service.establishIdentity({ guestPlayerId: first.guestId }, first.connectionId);
        expect(rebound).toEqual({ handle: 'Nova', hasIdentity: true });

        tickClock(5_000); // far past any wrongly-started grace anchor
        const bystander = freshConnection(service);
        expectOk(service.setHandle(bystander.connectionId, 'Rowan'));
        const thief = freshConnection(service);
        expectErr(service.setHandle(thief.connectionId, 'NOVA'), 'handle_taken');
    });

    it("overwriting a connection releases the prior identity's SPECTATOR presence immediately", () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId, undefined));
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
        expectOk(service.spectate(watcher.connectionId, created.matchId));

        // The watcher's connection switches to a fresh identity: the
        // spectator association has no seat to preserve, so it ends NOW.
        service.establishIdentity(undefined, watcher.connectionId);

        // Restoring the WATCHER's claim elsewhere (within grace) proves it:
        // the identity survives, but its match presence is already gone.
        const elsewhereConn = nextConnectionId();
        const restored = service.establishIdentity({ guestPlayerId: watcher.guestId }, elsewhereConn);
        expect(restored).toEqual({ handle: 'Watcher', hasIdentity: true });
        expect(expectOk(service.subscribe(elsewhereConn)).activeMatchId).toBeNull();
    });
});

describe('setHandle', () => {
    it('reserves a valid handle, preserves casing, and pushes an identity event', () => {
        const { service, delivered } = buildHarness();
        const { connectionId } = freshConnection(service);

        const result = service.setHandle(connectionId, '  Padded Nova  ');
        expect(result).toEqual({ ok: true, data: { handle: 'Padded Nova', hasIdentity: true } });

        const last = delivered.at(-1);
        expect(last?.event.kind).toBe('identity');
        if (last?.event.kind === 'identity') {
            expect(last.event.identity.handle).toBe('Padded Nova');
        }
    });

    it('passes registry validation failures through unchanged', () => {
        const { service } = buildHarness();
        const { connectionId } = freshConnection(service);

        const empty = service.setHandle(connectionId, '   ');
        expectErr(empty, 'handle_invalid');
        const overlong = service.setHandle(connectionId, 'b'.repeat(25));
        expectErr(overlong, 'handle_invalid');
    });

    it('rejects a conflicting variant from another identity with handle_taken', () => {
        const { service } = buildHarness();
        const nova = namedConnection(service, 'Nova');
        const other = freshConnection(service);

        // Spec edge case: " Nova ", "nova", "NOVA" all conflict.
        expectErr(service.setHandle(other.connectionId, 'NOVA'), 'handle_taken');
        // The incumbent is untouched: restoring it by claim still shows the
        // original accepted casing.
        const incumbent = service.establishIdentity({ guestPlayerId: nova.guestId }, nextConnectionId());
        expect(incumbent).toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('allows a case-only rename by the same owner', () => {
        const { service } = buildHarness();
        const { connectionId } = namedConnection(service, 'Nova');

        const renamed = expectOk(service.setHandle(connectionId, 'NOVA'));
        expect(renamed.handle).toBe('NOVA');
    });
});

// ----------------------------------------------------------------------------
// Subscribe & event delivery
// ----------------------------------------------------------------------------

describe('subscribe', () => {
    it('returns the complete baseline snapshot at the current revision', () => {
        const { service } = buildHarness();
        const { connectionId } = namedConnection(service, 'Nova');

        const baseline = expectOk(service.subscribe(connectionId));
        expect(baseline.revision).toBe(1);
        expect(baseline.entries).toEqual([]);
        expect(baseline.activeMatchId).toBeNull();
    });

    it('is idempotent: duplicate subscriptions receive one copy per mutation', () => {
        const { service, delivered } = buildHarness();
        const actor = namedConnection(service, 'Nova');
        const watcher = namedConnection(service, 'Rowan');
        expectOk(service.subscribe(watcher.connectionId));
        expectOk(service.subscribe(watcher.connectionId));

        expectOk(service.create(actor.connectionId, undefined));

        const copies = delivered.filter((d) => d.connectionId === watcher.connectionId && d.event.kind === 'snapshot');
        expect(copies).toHaveLength(1);
    });

    it('fails with identity_invalid before establishment', () => {
        const { service } = buildHarness();
        expectErr(service.subscribe(nextConnectionId()), 'identity_invalid');
    });
});

// ----------------------------------------------------------------------------
// Public projection
// ----------------------------------------------------------------------------

describe('public projection', () => {
    it('projects created matches with exactly the six public fields', () => {
        const { service } = buildHarness();
        const actor = namedConnection(service, 'Nova');
        expectOk(service.subscribe(actor.connectionId));

        const target = expectOk(service.create(actor.connectionId, undefined));
        const snapshot = expectOk(service.subscribe(actor.connectionId));

        expect(snapshot.revision).toBe(2);
        expect(snapshot.entries).toHaveLength(1);
        const entry = snapshot.entries[0];
        expect(Object.keys(entry ?? {})).toEqual([
            'matchId',
            'seatsFilled',
            'capacity',
            'status',
            'boardSize',
            'tickIntervalMs',
        ]);
        expect(entry).toMatchObject({
            matchId: target.matchId,
            seatsFilled: 1,
            capacity: 2,
            status: 'waiting',
            boardSize: 32,
            tickIntervalMs: 250,
        });
    });

    it('keeps projections free of bearer credentials while identity events correlate owners', () => {
        const { service, delivered } = buildHarness();
        const actor = namedConnection(service, 'Nova');
        expectOk(service.subscribe(actor.connectionId));
        expectOk(service.create(actor.connectionId, undefined));

        // Everything the receiving side can observe: pushed events + snapshots.
        // Guest IDs are non-secret correlation data. Bearer session tokens and
        // player-session credentials must still stay out of lobby projections.
        const publicDeliveries = delivered.filter((d) => d.event.kind !== 'identity');
        const serialized = publicDeliveries
            .map((d) => JSON.stringify(d.event))
            .concat([JSON.stringify(expectOk(service.subscribe(actor.connectionId)))]);
        for (const blob of serialized) {
            expect(blob).not.toContain('token-');
            expect(blob).not.toContain('psn-');
        }
        // The identity deliveries carry exactly the owner's own id — this
        // test mints one identity (the actor, `g-1`), so every directed
        // event must name THAT identity and nothing else.
        for (const d of delivered) {
            if (d.event.kind !== 'identity') {
                continue;
            }
            expect(d.event.identity.guestPlayerId).toBe(guest(1));
        }
        // Snapshot entries specifically carry no participant names at all
        // (the privacy envelope: discovery data only).
        const snapshot = expectOk(service.subscribe(actor.connectionId));
        expect(JSON.stringify(snapshot.entries)).not.toContain('Nova');
    });

    it('personalizes activeMatchId per receiver while sharing entries and revision', () => {
        const { service, delivered } = buildHarness();
        const actor = namedConnection(service, 'Nova');
        const watcher = namedConnection(service, 'Rowan');
        expectOk(service.subscribe(actor.connectionId));
        expectOk(service.subscribe(watcher.connectionId));

        const target = expectOk(service.create(actor.connectionId, undefined));

        const snaps = deliveredSnapshots(delivered);
        expect(snaps).toHaveLength(2);
        const mine = snaps.find((s) => s.activeMatchId === target.matchId);
        const theirs = snaps.find((s) => s.activeMatchId === null);
        expect(mine?.revision).toBe(theirs?.revision);
        expect(mine?.entries).toEqual(theirs?.entries);
    });

    it('lists entries in stable creation order across mutations', () => {
        const { service } = buildHarness();
        const a = namedConnection(service, 'Nova');
        const b = namedConnection(service, 'Rowan');

        const first = expectOk(service.create(a.connectionId, undefined));
        const second = expectOk(service.create(b.connectionId, undefined));

        const snapshot = expectOk(service.subscribe(a.connectionId));
        expect(snapshot.entries.map((e) => e.matchId)).toEqual([first.matchId, second.matchId]);
    });

    it('flips a filled match to in_progress (fill detection) instead of dropping it', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const guestConn = namedConnection(service, 'Rowan');

        const created = expectOk(service.create(host.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        expectOk(service.join(guestConn.connectionId, created.matchId));

        const snapshot = expectOk(service.subscribe(host.connectionId));
        expect(snapshot.entries[0]).toMatchObject({ matchId: created.matchId, seatsFilled: 2, status: 'in_progress' });
    });

    it('drops finished matches from the projection when the terminal event fires', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        expectOk(service.subscribe(host.connectionId));
        const created = expectOk(service.create(host.connectionId, undefined));

        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: created.matchId }));

        const snapshot = expectOk(service.subscribe(host.connectionId));
        expect(snapshot.entries).toEqual([]);
        expect(snapshot.revision).toBeGreaterThan(2);
        // Finished matches leave no history and no lingering association.
        expect(snapshot.activeMatchId).toBeNull();
    });

    it('drops a proven-dead waiting row when a join fails with match_not_found', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const joiner = namedConnection(service, 'Rowan');
        const created = expectOk(service.create(host.connectionId, undefined));

        // Upstream collected the match (e.g., empty-match GC) after listing.
        bridge.setPublicMatches([]);
        bridge.queueJoinResult({ ok: false, error: makeError('match_not_found') });

        expectErr(service.join(joiner.connectionId, created.matchId), 'match_not_found');

        const snapshot = expectOk(service.subscribe(joiner.connectionId));
        expect(snapshot.entries.map((e) => e.matchId)).not.toContain(created.matchId);
    });

    it('advances revisions strictly monotonically across mutations', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const joiner = namedConnection(service, 'Rowan');
        expectOk(service.subscribe(host.connectionId));

        const created = expectOk(service.create(host.connectionId, undefined));
        expectOk(service.join(joiner.connectionId, created.matchId));
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: created.matchId }));
        expectOk(service.create(host.connectionId, undefined));

        const revisions = deliveredSnapshots(delivered).map((s) => s.revision);
        expect(revisions.length).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < revisions.length; i++) {
            expect(revisions[i]).toBeGreaterThan(revisions[i - 1]);
        }
    });
});

// ----------------------------------------------------------------------------
// Create — delegation boundary + error mapping
// ----------------------------------------------------------------------------

describe('create', () => {
    it('delegates a public create carrying the accepted handle and settings verbatim', () => {
        const { service, bridge } = buildHarness();
        const actor = namedConnection(service, 'Nova');

        const settings = { playerCount: 3 as const, boardSize: 48, tickIntervalMs: 200 };
        expectOk(service.create(actor.connectionId, settings));

        expect(bridge.createCalls).toHaveLength(1);
        // FR-019 identity pass-through (R-006): the server-resolved guest
        // reference and ACCEPTED handle ride into the session/seat records.
        expect(bridge.createCalls[0]).toEqual({
            visibility: 'public',
            displayName: 'Nova',
            guestPlayerId: actor.guestId,
            acceptedHandle: 'Nova',
            settings,
        });
    });

    it('returns the server-issued assignment untouched and records the association', () => {
        const { service, bridge } = buildHarness();
        const actor = namedConnection(service, 'Nova');
        const scripted = buildSeatAssignment({ displayName: 'Nova' });
        bridge.queueCreateResult({
            ok: true,
            data: {
                matchId: 'match-x' as MatchId,
                joinPath: '/join/match-x' as JoinPath,
                joinUrl: null,
                seatAssignment: scripted,
            },
        });

        const target = expectOk(service.create(actor.connectionId, undefined));

        expect(target.matchId).toBe('match-x');
        expect(target.seatAssignment).toEqual(scripted);
        const snapshot = expectOk(service.subscribe(actor.connectionId));
        expect(snapshot.activeMatchId).toBe('match-x');
    });

    it('maps unmappable upstream codes to internal_error while preserving message + code detail', () => {
        const { service, bridge } = buildHarness();
        const actor = namedConnection(service, 'Nova');

        bridge.queueCreateResult({
            ok: false,
            error: makeError('rate_limited', 'Server is at maximum concurrent matches'),
        });
        const failed = service.create(actor.connectionId, undefined);

        expect(failed.ok).toBe(false);
        if (!failed.ok) {
            expect(failed.error.code).toBe('internal_error');
            expect(failed.error.message).toBe('Server is at maximum concurrent matches');
            expect(failed.error.detail).toMatchObject({ upstreamCode: 'rate_limited' });
        }
    });

    it('enforces the guards: unestablished, unnamed, and already-committed identities', () => {
        const { service } = buildHarness();
        const unnamed = freshConnection(service);
        const committed = namedConnection(service, 'Nova');
        expectOk(service.create(committed.connectionId, undefined));

        expectErr(service.create(nextConnectionId(), undefined), 'identity_invalid');
        expectErr(service.create(unnamed.connectionId, undefined), 'identity_invalid');
        expectErr(service.create(committed.connectionId, undefined), 'identity_in_match');
    });
});

// ----------------------------------------------------------------------------
// Join — delegation boundary + error mapping
// ----------------------------------------------------------------------------

describe('join', () => {
    it('delegates with the accepted handle and returns the server-issued assignment', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const joiner = namedConnection(service, 'Rowan');
        const created = expectOk(service.create(host.connectionId, undefined));

        const target = expectOk(service.join(joiner.connectionId, created.matchId));

        expect(bridge.joinCalls).toHaveLength(1);
        // FR-019 identity pass-through, same as `create`.
        expect(bridge.joinCalls[0]).toEqual({
            matchId: created.matchId,
            displayName: 'Rowan',
            guestPlayerId: joiner.guestId,
            acceptedHandle: 'Rowan',
        });
        expect(target.matchId).toBe(created.matchId);
        expect(target.seatAssignment.playerId).toBeDefined();
        const snapshot = expectOk(service.subscribe(joiner.connectionId));
        expect(snapshot.activeMatchId).toBe(created.matchId);
    });

    it('rejects unknown match ids WITHOUT delegating (ledger miss is authoritative)', () => {
        const { service, bridge } = buildHarness();
        const joiner = namedConnection(service, 'Rowan');

        expectErr(service.join(joiner.connectionId, 'match-never-seen' as MatchId), 'match_not_found');
        expect(bridge.joinCalls).toHaveLength(0);
    });

    it('rejects joining a tracked in-progress match without delegating', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const first = namedConnection(service, 'Rowan');
        const late = namedConnection(service, 'Third');
        const created = expectOk(service.create(host.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex }),
            },
        });
        expectOk(service.join(first.connectionId, created.matchId));

        expectErr(service.join(late.connectionId, created.matchId), 'match_not_joinable');
        expect(bridge.joinCalls).toHaveLength(1); // only the successful fill
    });

    it('passes upstream match_full through and maps seat_taken to match_full', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const joiner = namedConnection(service, 'Rowan');
        const created = expectOk(service.create(host.connectionId, undefined));

        bridge.queueJoinResult({ ok: false, error: makeError('match_full') });
        expectErr(service.join(joiner.connectionId, created.matchId), 'match_full');

        bridge.queueJoinResult({ ok: false, error: makeError('seat_taken') });
        expectErr(service.join(joiner.connectionId, created.matchId), 'match_full');
    });

    it('enforces the guards: unestablished, unnamed, and already-committed identities', () => {
        const { service } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const unnamed = freshConnection(service);
        const committed = namedConnection(service, 'Busy');
        const target = expectOk(service.create(host.connectionId, undefined));
        // Give the third identity its own match presence.
        expectOk(service.create(committed.connectionId, undefined));

        expectErr(service.join(nextConnectionId(), target.matchId), 'identity_invalid');
        expectErr(service.join(unnamed.connectionId, target.matchId), 'identity_invalid');
        expectErr(service.join(committed.connectionId, target.matchId), 'identity_in_match');
    });
});

// ----------------------------------------------------------------------------
// Spectate
// ----------------------------------------------------------------------------

describe('spectate', () => {
    it('attaches to a tracked in-progress match with a seatless target and no delegation', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const filler = namedConnection(service, 'Rowan');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId, undefined));
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

        const target = expectOk(service.spectate(watcher.connectionId, created.matchId));

        expect(target).toEqual({ matchId: created.matchId });
        expect(bridge.joinCalls).toHaveLength(1); // the fill only — spectate delegated nothing
        const snapshot = expectOk(service.subscribe(watcher.connectionId));
        expect(snapshot.activeMatchId).toBe(created.matchId);
    });

    it('rejects unknown and still-filling targets', () => {
        const { service } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId, undefined));

        expectErr(service.spectate(watcher.connectionId, 'match-ghost' as MatchId), 'match_not_found');
        expectErr(service.spectate(watcher.connectionId, created.matchId), 'match_not_joinable');
    });

    it('counts spectating as match presence (no second commitment)', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const filler = namedConnection(service, 'Rowan');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId, undefined));
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
        expectOk(service.spectate(watcher.connectionId, created.matchId));

        expectErr(service.spectate(watcher.connectionId, created.matchId), 'identity_in_match');
        expectErr(service.join(watcher.connectionId, created.matchId), 'identity_in_match');
        expectErr(service.create(watcher.connectionId, undefined), 'identity_in_match');
    });

    it('fails with identity_invalid before establishment', () => {
        const { service } = buildHarness();
        expectErr(service.spectate(nextConnectionId(), 'match-x' as MatchId), 'identity_invalid');
    });
});

// ----------------------------------------------------------------------------
// Leave
// ----------------------------------------------------------------------------

describe('leave', () => {
    it('releases a seated player with stored credentials and frees the identity', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const created = expectOk(service.create(host.connectionId, undefined));

        const result = service.leave(host.connectionId);
        expect(result).toEqual({ ok: true });

        expect(bridge.leaveCalls).toHaveLength(1);
        expect(bridge.leaveCalls[0]).toEqual({
            matchId: created.matchId,
            sessionToken: created.seatAssignment.sessionToken,
        });
        const snapshot = expectOk(service.subscribe(host.connectionId));
        expect(snapshot.activeMatchId).toBeNull();
        // Free again: the identity can host a new match immediately.
        expectOk(service.create(host.connectionId, undefined));
    });

    it('detaches a spectator locally without touching the matchmaker', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const filler = namedConnection(service, 'Rowan');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId, undefined));
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
        expectOk(service.spectate(watcher.connectionId, created.matchId));

        expect(service.leave(watcher.connectionId)).toEqual({ ok: true });
        expect(bridge.leaveCalls).toHaveLength(0);
        expect(expectOk(service.subscribe(watcher.connectionId)).activeMatchId).toBeNull();
    });

    it('is idempotent for lobby-bound identities and rejects unestablished ones', () => {
        const { service, bridge } = buildHarness();
        const idle = namedConnection(service, 'Nova');

        expect(service.leave(idle.connectionId)).toEqual({ ok: true });
        expect(bridge.leaveCalls).toHaveLength(0);
        expectErr(service.leave(nextConnectionId()), 'identity_invalid');
    });

    it('clears local presence even when the delegated leave fails upstream', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        expectOk(service.create(host.connectionId, undefined));
        bridge.queueLeaveResult({ ok: false, error: makeError('match_not_found') });

        const result = service.leave(host.connectionId);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('match_not_found');
        }
        // No poisoned association: the identity can act again.
        expect(expectOk(service.subscribe(host.connectionId)).activeMatchId).toBeNull();
        expectOk(service.create(host.connectionId, undefined));
    });
});

// ----------------------------------------------------------------------------
// Lifecycle bridge hooks (identity grace + terminal)
// ----------------------------------------------------------------------------

describe('lifecycle bridge hooks', () => {
    it('starts the identity grace window on seat disconnect (handle stays reserved)', () => {
        const { service, bridge } = buildHarness();
        const nova = namedConnection(service, 'Nova');
        const other = freshConnection(service);

        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: nova.connectionId }));

        expectErr(service.setHandle(other.connectionId, 'nova'), 'handle_taken');
    });

    it('reactivates the identity on seat reconnect so a later sweep cannot free it', () => {
        const { service, bridge } = buildHarness({ graceMs: 1_000 });
        const nova = namedConnection(service, 'Nova');
        const other = freshConnection(service);

        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: nova.connectionId }));
        bridge.fireOnSeatReconnected(seatReconnectedEvent({ connectionId: nova.connectionId }));
        tickClock(5_000); // well past the original grace anchor

        // Any registry-touching op runs the lazy sweep; the reactivated
        // identity must survive it with its handle intact.
        expectOk(service.setHandle(other.connectionId, 'Rowan'));
        const challenger = freshConnection(service);
        expectErr(service.setHandle(challenger.connectionId, 'NOVA'), 'handle_taken');
    });

    it('frees the handle once grace expires without a reconnect', () => {
        const { service, bridge } = buildHarness({ graceMs: 1_000 });
        const nova = namedConnection(service, 'Nova');

        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: nova.connectionId }));
        tickClock(1_000);

        const successor = freshConnection(service);
        expectOk(service.setHandle(successor.connectionId, 'NOVA'));
    });

    it('forgets the connection and clears presence when networking reports seat expiry', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const observer = namedConnection(service, 'Obs');
        const created = expectOk(service.create(host.connectionId, undefined));

        bridge.fireOnSeatExpired(
            seatExpiredEvent({ matchId: created.matchId, sessionToken: created.seatAssignment.sessionToken }),
        );

        expectErr(service.setHandle(host.connectionId, 'Renamed'), 'identity_invalid');
        const snapshot = expectOk(service.subscribe(observer.connectionId));
        expect(snapshot.entries.map((e) => e.matchId)).toContain(created.matchId); // match itself lives on
    });

    it('releases every participant when the match terminates (players may act again)', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const filler = namedConnection(service, 'Rowan');
        const created = expectOk(service.create(host.connectionId, undefined));
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

        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: created.matchId }));

        expect(expectOk(service.subscribe(host.connectionId)).activeMatchId).toBeNull();
        expect(expectOk(service.subscribe(filler.connectionId)).activeMatchId).toBeNull();
        expectOk(service.create(host.connectionId, undefined));
    });
});

// ----------------------------------------------------------------------------
// Single projection path (R-006)
// ----------------------------------------------------------------------------

describe('single projection path (R-006)', () => {
    it('duplicate terminal reports bump the revision exactly once', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Nova');
        expectOk(service.subscribe(host.connectionId));
        const created = expectOk(service.create(host.connectionId, undefined));

        // The real matchmaker reports a terminal on BOTH event seams; the
        // diff-gated single pass must collapse every duplicate into one bump.
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: created.matchId }));
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: created.matchId }));
        bridge.fireOnSeatClaimed(seatClaimedEvent({ matchId: created.matchId }));

        expect(deliveredSnapshots(delivered).map((s) => s.revision)).toEqual([2, 3]);
    });

    it('disconnect/reconnect/expiry pressure never bumps revisions (grace keeps rows)', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Nova');
        expectOk(service.subscribe(host.connectionId));
        const created = expectOk(service.create(host.connectionId, undefined));

        for (let round = 0; round < 5; round++) {
            bridge.fireOnSeatClaimed(seatClaimedEvent({ matchId: created.matchId }));
            bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ matchId: created.matchId }));
            bridge.fireOnSeatReconnected(seatReconnectedEvent({ matchId: created.matchId }));
            bridge.fireOnSeatExpired(seatExpiredEvent({ matchId: created.matchId }));
        }

        // Only the create ever published: grace-phase events change no
        // projected field, so the shared pass publishes nothing.
        expect(deliveredSnapshots(delivered).map((s) => s.revision)).toEqual([2]);
    });

    it('subscribe returns a baseline consistent with the last published revision', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const watcher = namedConnection(service, 'Rowan');
        expectOk(service.subscribe(host.connectionId));
        const created = expectOk(service.create(host.connectionId, undefined));
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: created.matchId }));

        // The pull baseline reads the SAME published state the pushes did —
        // one stream, never a divergent rebuild.
        const baseline = expectOk(service.subscribe(watcher.connectionId));
        expect(baseline.revision).toBe(3);
        expect(baseline.entries).toEqual([]);
        expect(deliveredSnapshots(delivered).map((s) => s.revision)).toEqual([2, 3]);
    });

    it('absorbs stray lifecycle events racing the shutdown without corrupting teardown', async () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        expectOk(service.create(host.connectionId, undefined));
        await service.close();

        // The matchmaker has no listener-unregister seam, so late bridge
        // events CAN arrive after the facade closed; every funnel must
        // absorb them quietly instead of touching cleared state.
        expect(() => {
            bridge.fireOnSeatClaimed(seatClaimedEvent());
            bridge.fireOnSeatDisconnected(seatDisconnectedEvent());
            bridge.fireOnSeatReconnected(seatReconnectedEvent());
            bridge.fireOnSeatExpired(seatExpiredEvent());
            bridge.fireOnMatchTerminal(matchTerminalEvent());
        }).not.toThrow();
    });
});

// ----------------------------------------------------------------------------
// Connection teardown (R-006 transport seam)
// ----------------------------------------------------------------------------

describe('connectionClosed (R-006 transport teardown)', () => {
    it('is a silent no-op for a connection that never established an identity', () => {
        const { service } = buildHarness();
        expect(() => service.connectionClosed(nextConnectionId())).not.toThrow();
    });

    it('unbinds and unsubscribes: the closed connection is gone and hears nothing more', () => {
        const { service, delivered } = buildHarness({ graceMs: 1_000 });
        const visitor = namedConnection(service, 'Visitor');
        expectOk(service.subscribe(visitor.connectionId));
        const deliveriesBefore = delivered.length;

        service.connectionClosed(visitor.connectionId);

        // Unbound: every connection-keyed action now fails as unestablished,
        // and no further event is delivered to the dead socket.
        expectErr(service.setHandle(visitor.connectionId, 'Renamed'), 'identity_invalid');
        expectErr(service.subscribe(visitor.connectionId), 'identity_invalid');
        expect(delivered).toHaveLength(deliveriesBefore);

        // The IDENTITY survives under the registry's grace window.
        const restored = service.establishIdentity({ guestPlayerId: visitor.guestId }, nextConnectionId());
        expect(restored).toEqual({ handle: 'Visitor', hasIdentity: true });
    });

    it('keeps PLAYER presence through grace so a reclaim restores the seated identity', () => {
        const { service } = buildHarness({ graceMs: 1_000 });
        const host = namedConnection(service, 'Host');
        const created = expectOk(service.create(host.connectionId, undefined));

        service.connectionClosed(host.connectionId);

        // FR-022: within grace the same claimant reclaims everything.
        const reclaimConn = nextConnectionId();
        const reclaimed = service.establishIdentity({ guestPlayerId: host.guestId }, reclaimConn);
        expect(reclaimed).toEqual({ handle: 'Host', hasIdentity: true });
        expect(expectOk(service.subscribe(reclaimConn)).activeMatchId).toBe(created.matchId);
    });

    it('releases SPECTATOR presence immediately (no seat exists to reclaim)', () => {
        const { service, bridge } = buildHarness({ graceMs: 1_000 });
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId, undefined));
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
        expectOk(service.spectate(watcher.connectionId, created.matchId));

        service.connectionClosed(watcher.connectionId);

        const backConn = nextConnectionId();
        const restored = service.establishIdentity({ guestPlayerId: watcher.guestId }, backConn);
        expect(restored).toEqual({ handle: 'Watcher', hasIdentity: true });
        expect(expectOk(service.subscribe(backConn)).activeMatchId).toBeNull();
    });

    it('frees the handle once grace expires after the close (manual clock)', () => {
        const { service } = buildHarness({ graceMs: 1_000 });
        const visitor = namedConnection(service, 'Visitor');
        service.connectionClosed(visitor.connectionId);

        tickClock(1_000); // grace boundary uses >= (networking convention)
        const successor = freshConnection(service);
        expectOk(service.setHandle(successor.connectionId, 'VISITOR'));

        // The expired claimant is gone entirely: a stale claim mints fresh.
        const late = service.establishIdentity({ guestPlayerId: visitor.guestId }, nextConnectionId());
        expect(late).toEqual({ handle: null, hasIdentity: true });
    });

    it('is idempotent for an already-closed connection', () => {
        const { service } = buildHarness();
        const visitor = namedConnection(service, 'Visitor');
        service.connectionClosed(visitor.connectionId);
        expect(() => service.connectionClosed(visitor.connectionId)).not.toThrow();
    });

    it('throws after close() like every other method (invariant breach)', async () => {
        const { service } = buildHarness();
        await service.close();
        expect(() => service.connectionClosed(nextConnectionId())).toThrow(/lobbyService: instance is closed/);
    });
});

// ----------------------------------------------------------------------------
// Close
// ----------------------------------------------------------------------------

describe('close', () => {
    it('is idempotent and shuts the registry and matchmaker down with it', async () => {
        const { service, bridge } = buildHarness();
        namedConnection(service, 'Nova');

        await expect(service.close()).resolves.toBeUndefined();
        await expect(service.close()).resolves.toBeUndefined();

        expect(() => bridge.createMatch({ visibility: 'public', displayName: 'X' })).toThrow();
    });

    it('makes every facade method throw afterwards (invariant breach, not a Result)', async () => {
        const { service } = buildHarness();
        const { connectionId } = namedConnection(service, 'Nova');
        await service.close();

        const attempts: Array<() => unknown> = [
            () => service.establishIdentity(undefined, connectionId),
            () => service.setHandle(connectionId, 'Nova'),
            () => service.subscribe(connectionId),
            () => service.create(connectionId, undefined),
            () => service.join(connectionId, 'match-x' as MatchId),
            () => service.spectate(connectionId, 'match-x' as MatchId),
            () => service.leave(connectionId),
            () => service.connectionClosed(nextConnectionId()),
        ];
        for (const attempt of attempts) {
            expect(attempt).toThrow(/lobbyService: instance is closed/);
        }
    });
});
