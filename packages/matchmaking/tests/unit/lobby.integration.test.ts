/**
 * Lobby facade ⇄ REAL matchmaker integration suites — Feature 010
 * (remediation R-006)
 *
 * The facade unit suites run against the T-004 fake, which carries only
 * the lifecycle-listener seam. These suites compose the FULL production
 * stack — `createLobbyService` over the REAL `createMatchmaker` with
 * BOTH R-005 seams live (`registerLifecycleListener` for bridge events,
 * `subscribeStatus` for FR-012 transitions) — and pin exactly the
 * behaviors that only exist when every funnel is wired:
 *
 *   - **leave() through the real matchmaker** returns a `Result`
 *     (never throws): a filling-phase final-seat leave collects the
 *     match upstream whose status event drops the ledger row promptly;
 *     a running-phase leave surrenders via the forfeit policy while the
 *     match continues.
 *   - **Lifecycle fan-out fill→finish**: auto-start on fill and the
 *     terminal transition each arrive on BOTH seams (status bus + bridge
 *     fan-out); the diff-gated single projection path must publish each
 *     visible change EXACTLY ONCE, clear every participant's presence,
 *     and drop the row (FR-014).
 *   - **connectionClosed** against real registry/grace semantics: a
 *     seated player's handle survives the grace window (and their
 *     presence is reclaimable), then frees after expiry on the manual
 *     clock; spectator presence releases immediately.
 *   - **Ghost-row reap**: an abandoned filling match is collected by
 *     the empty-match TTL sweep (driven lazily by the delegated listing
 *     inside the shared publish pass) and its row drops with exactly
 *     one bump.
 *   - **Settings-rejection detail** (US3 AC-4): the R-005 `{field,
 *     reason}` rejection detail flows through the error mapping to the
 *     client-facing payload.
 *
 * Determinism: injected sequential ids (separate generators for the
 * matchmaker and the identity registry) + a manual clock; auto-start
 * generates the shipped default board (the only size terrain reliably
 * generates for matchmaking matches). No waits anywhere — the whole
 * stack is synchronous except `close()`.
 */

import type { ConnectionId } from '@europa/networking';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerId } from '../../contracts/match-types';
import type { Matchmaker } from '../../contracts/matchmaking-api';
import type { LobbyService, Result } from '../../src/contracts/lobby-api';
import type { GuestPlayerId, LobbyError, LobbyErrorCode, LobbyEvent } from '../../src/contracts/lobby-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { createIdentityRegistry } from '../../src/internal/identityRegistry';
import { createLobbyService, type LobbyConnectionTeardown } from '../../src/internal/lobbyService';
import { nextConnectionId } from '../fixtures/fakeMatchmakerBridge';
import { FakeServer } from '../fixtures/fakeServer';

// ----------------------------------------------------------------------------
// Deterministic harness
// ----------------------------------------------------------------------------

/** Base epoch reading; every test advances from here. */
const BASE_MS = 10_000_000;

let clockMs = BASE_MS;
let matchmakerSeq = 0;
let guestSeq = 0;

/** Advance the manual clock. */
function advance(ms: number): void {
    clockMs += ms;
}

/** Sequential id generator for MATCHMAKER-internal ids (sessions, matches). */
function matchmakerRandomId(): string {
    matchmakerSeq += 1;
    return `mm-${String(matchmakerSeq).padStart(12, '0')}`;
}

/** Sequential id generator for REGISTRY guest ids (independent counter). */
function guestRandomId(): string {
    guestSeq += 1;
    return `guest-${String(guestSeq).padStart(4, '0')}`;
}

/** The n-th minted guest id (registry ids are `guest-NNNN` by construction). */
function guest(n: number): GuestPlayerId {
    return `guest-${String(n).padStart(4, '0')}` as GuestPlayerId;
}

/** One recorded outbound delivery from the facade under test. */
interface Delivery {
    readonly connectionId: ConnectionId;
    readonly event: LobbyEvent;
}

interface Stack {
    /** The networking-side fixture (fire bridge events on cue). */
    readonly server: FakeServer;
    /** The REAL feature-006 matchmaker (for direct close()). */
    readonly matchmaker: Matchmaker;
    /** The composed facade under test. */
    readonly service: LobbyService & LobbyConnectionTeardown;
    /** Every outbound delivery, in order. */
    readonly delivered: Delivery[];
}

/**
 * Full production composition (the R-006 recipe): real matchmaker with
 * both composition seams, real registry semantics, shared manual clock,
 * recorded deliveries. The facade self-wires via the structural seam
 * checks — no extra plumbing.
 */
function buildStack(options: { graceMs?: number } = {}): Stack {
    const server = new FakeServer();
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, {
        server,
        randomId: matchmakerRandomId,
        now: () => clockMs,
    });
    const delivered: Delivery[] = [];
    const service = createLobbyService({
        matchmaker,
        registry: createIdentityRegistry({
            randomId: guestRandomId,
            now: () => clockMs,
            ...(options.graceMs === undefined ? {} : { graceMs: options.graceMs }),
        }),
        now: () => clockMs,
        deliver: (connectionId, event) => {
            delivered.push({ connectionId, event });
        },
    });
    return { server, matchmaker, service, delivered };
}

/** Establish a fresh unnamed identity; returns the connection and its minted guest id. */
function freshConnection(service: LobbyService): { connectionId: ConnectionId; guestId: GuestPlayerId } {
    const connectionId = nextConnectionId();
    service.establishIdentity(undefined, connectionId);
    return { connectionId, guestId: guest(guestSeq) };
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

/** Revisions of every pushed snapshot event so far, in order. */
function pushedRevisions(delivered: readonly Delivery[]): number[] {
    return delivered
        .filter((d) => d.event.kind === 'snapshot')
        .map((d) => (d.event.kind === 'snapshot' ? d.event.snapshot.revision : -1));
}

beforeEach(() => {
    clockMs = BASE_MS;
    matchmakerSeq = 0;
    guestSeq = 0;
});

// ----------------------------------------------------------------------------
// leave() through the REAL matchmaker
// ----------------------------------------------------------------------------

describe('leave through the real matchmaker (R-006)', () => {
    it('filling-phase final-seat leave succeeds as a Result and the collect event drops the row', async () => {
        const stack = buildStack();
        const host = namedConnection(stack.service, 'Nova');
        const created = expectOk(stack.service.create(host.connectionId, undefined));

        // The delegated leaveMatch inline-releases the ONLY seat; feature
        // 006 collects the emptied match synchronously, its `filling →
        // collected` status event reaches the facade's subscribed listener,
        // and the single pass drops the row WITHOUT any further action.
        expect(stack.service.leave(host.connectionId)).toEqual({ ok: true });

        const snapshot = expectOk(stack.service.subscribe(host.connectionId));
        expect(snapshot.entries).toEqual([]);
        // Leave ≠ disconnect: the identity stays ACTIVE and free to act.
        expect(snapshot.activeMatchId).toBeNull();
        expectOk(stack.service.create(host.connectionId, undefined));
        await stack.service.close();
        expect(created.matchId).toBeDefined();
    });

    it('running-phase leave surrenders via the forfeit policy without throwing; the match continues', async () => {
        const stack = buildStack();
        const host = namedConnection(stack.service, 'Nova');
        const joiner = namedConnection(stack.service, 'Rowan');
        const created = expectOk(stack.service.create(host.connectionId, undefined));
        // Fills the last seat → REAL auto-start (board generated, engine up).
        expectOk(stack.service.join(joiner.connectionId, created.matchId));

        // Voluntary leave of a live match = immediate forfeit (engine
        // surrender); one player remains, so the match keeps running and
        // its Spectate row stays.
        expect(stack.service.leave(joiner.connectionId)).toEqual({ ok: true });

        const hostView = expectOk(stack.service.subscribe(host.connectionId));
        expect(hostView.entries[0]).toMatchObject({ matchId: created.matchId, status: 'in_progress' });
        expect(hostView.activeMatchId).toBe(created.matchId);
        const joinerView = expectOk(stack.service.subscribe(joiner.connectionId));
        expect(joinerView.activeMatchId).toBeNull();
        await stack.service.close();
    });
});

// ----------------------------------------------------------------------------
// Lifecycle fan-out: fill→finish across BOTH seams, published once
// ----------------------------------------------------------------------------

describe('lifecycle fan-out over the composed stack (R-006)', () => {
    it('fill then finish clears presence, drops the row, and publishes each change exactly once', async () => {
        const stack = buildStack();
        const host = namedConnection(stack.service, 'Nova');
        const joiner = namedConnection(stack.service, 'Rowan');
        expectOk(stack.service.subscribe(host.connectionId));

        const created = expectOk(stack.service.create(host.connectionId, undefined));
        expect(pushedRevisions(stack.delivered)).toEqual([2]);

        // The fill fires the `filling → running` STATUS event (inside the
        // delegated auto-start) AND the facade's own mutation pass — the
        // diff gate must collapse them into ONE published revision.
        expectOk(stack.service.join(joiner.connectionId, created.matchId));
        expect(pushedRevisions(stack.delivered)).toEqual([2, 3]);

        // The engine-reported terminal fires `running → finished` on the
        // status bus AND fans `onMatchTerminal` out to the bridge listener:
        // two triggers, one visible change, ONE bump.
        stack.server.fireOnMatchTerminal({
            matchId: created.matchId,
            result: { kind: 'win', winner: 1 as PlayerId, tick: 7, reason: 'last_standing' },
            tick: 7,
        });
        expect(pushedRevisions(stack.delivered)).toEqual([2, 3, 4]);

        // FR-014 no history + both participants released to the lobby.
        const hostView = expectOk(stack.service.subscribe(host.connectionId));
        expect(hostView.entries).toEqual([]);
        expect(hostView.activeMatchId).toBeNull();
        expect(expectOk(stack.service.subscribe(joiner.connectionId)).activeMatchId).toBeNull();
        // Both identities can commit again immediately.
        expectOk(stack.service.create(host.connectionId, undefined));
        expectOk(stack.service.create(joiner.connectionId, undefined));
        await stack.service.close();
    });

    it('an abandoned filling match is reaped by the empty-match TTL with exactly one bump', async () => {
        const stack = buildStack();
        const host = namedConnection(stack.service, 'Nova');
        expectOk(stack.service.subscribe(host.connectionId));
        expectOk(stack.service.create(host.connectionId, undefined));
        expect(expectOk(stack.service.subscribe(host.connectionId)).entries).toHaveLength(1);

        // Past the empty-match TTL, ANY recompute reconciles through the
        // delegated listing — whose lazy sweep collects the stale match and
        // emits the collect status event that drops the ghost row. The
        // nested pass (event arriving INSIDE the reconcile) must still bump
        // exactly once.
        advance(MATCHMAKING_CONSTANTS.emptyMatchTtlMs + 1);
        const snapshot = expectOk(stack.service.subscribe(host.connectionId));
        expect(snapshot.entries).toEqual([]);
        expect(pushedRevisions(stack.delivered)).toEqual([2, 3]);

        // The stranded creator was freed by the same event (FR-014 spirit:
        // nobody stays pinned to a dead match).
        expect(snapshot.activeMatchId).toBeNull();
        expectOk(stack.service.create(host.connectionId, undefined));
        await stack.service.close();
    });

    it('rejected create settings surface field-specific detail through the error mapping (US3 AC-4)', async () => {
        const stack = buildStack();
        const actor = namedConnection(stack.service, 'Nova');

        const failed = stack.service.create(actor.connectionId, { playerCount: 5 });
        expect(failed.ok).toBe(false);
        if (!failed.ok) {
            expect(failed.error.code).toBe('internal_error');
            expect(failed.error.message).toContain('settings.playerCount');
            // The R-005 rejection detail rides the mapping verbatim, joined
            // by the lossless `upstreamCode` marker.
            expect(failed.error.detail).toMatchObject({
                field: 'settings.playerCount',
                reason: 'must be 2, 3, or 4',
                upstreamCode: 'invalid_request',
            });
        }
        await stack.service.close();
    });
});

// ----------------------------------------------------------------------------
// connectionClosed against real grace semantics (manual clock)
// ----------------------------------------------------------------------------

describe('connectionClosed over the composed stack (R-006)', () => {
    it("a seated player's handle survives grace and the seat presence is reclaimable", async () => {
        const stack = buildStack({ graceMs: 1_000 });
        const host = namedConnection(stack.service, 'Nova');
        const created = expectOk(stack.service.create(host.connectionId, undefined));

        stack.service.connectionClosed(host.connectionId);

        // Within grace: the handle stays reserved…
        const challenger = namedConnection(stack.service, 'Rowan');
        expectErr(stack.service.setHandle(challenger.connectionId, 'nova'), 'handle_taken');

        // …and the claimant restores identity AND seat presence (FR-022).
        const reclaimConn = nextConnectionId();
        const reclaimed = stack.service.establishIdentity({ guestPlayerId: host.guestId }, reclaimConn);
        expect(reclaimed).toEqual({ handle: 'Nova', hasIdentity: true });
        expect(expectOk(stack.service.subscribe(reclaimConn)).activeMatchId).toBe(created.matchId);
        await stack.service.close();
    });

    it('frees the handle after grace expires without a reconnect (manual clock)', async () => {
        const stack = buildStack({ graceMs: 1_000 });
        const host = namedConnection(stack.service, 'Nova');
        expectOk(stack.service.create(host.connectionId, undefined));

        stack.service.connectionClosed(host.connectionId);
        advance(1_000); // grace boundary uses >= (networking convention)

        // Any registry-touching op runs the lazy expiry sweep first.
        const successor = namedConnection(stack.service, 'Rowan');
        expectOk(stack.service.setHandle(successor.connectionId, 'NOVA'));

        // The expired claimant is gone entirely: a stale claim mints fresh.
        const late = stack.service.establishIdentity({ guestPlayerId: host.guestId }, nextConnectionId());
        expect(late).toEqual({ handle: null, hasIdentity: true });
        await stack.service.close();
    });

    it('releases spectator presence immediately while the identity graces', async () => {
        const stack = buildStack({ graceMs: 1_000 });
        const host = namedConnection(stack.service, 'Host');
        const filler = namedConnection(stack.service, 'Filler');
        const watcher = namedConnection(stack.service, 'Watcher');
        const created = expectOk(stack.service.create(host.connectionId, undefined));
        expectOk(stack.service.join(filler.connectionId, created.matchId)); // real auto-start
        expectOk(stack.service.spectate(watcher.connectionId, created.matchId));

        stack.service.connectionClosed(watcher.connectionId);

        // Identity restored within grace, but the read-only association
        // ended with the connection — spectators hold no seat to reclaim.
        const backConn = nextConnectionId();
        const restored = stack.service.establishIdentity({ guestPlayerId: watcher.guestId }, backConn);
        expect(restored).toEqual({ handle: 'Watcher', hasIdentity: true });
        expect(expectOk(stack.service.subscribe(backConn)).activeMatchId).toBeNull();
        await stack.service.close();
    });
});

// ----------------------------------------------------------------------------
// Type-level guard: the facade surface satisfies the mirrored contract
// ----------------------------------------------------------------------------

/**
 * Compile-time witness (mirrors the conformance suite's discipline):
 * the factory result remains assignable to the plain mirrored
 * `LobbyService`, so transport wiring can hold either shape.
 */
const typeWitness: LobbyService = null as unknown as LobbyService & LobbyConnectionTeardown;
void typeWitness;
